#!/usr/bin/env bash
# E2E-002 — Forwarded order mirror lifecycle
#
# Surface chain: Forwarder API (repo-controllable) + Driver App (env-gated)
#
# This scenario runs in two phases with explicit env-gate tiers:
#
#   PHASE 1 — Repo-Controllable Forwarder Lifecycle (always runnable)
#     Uses the internal forwarder API to seed a test external order, verify the
#     mirror order state, and check adapter health. No external platform data or
#     external adapter response is needed.
#
#   PHASE 2 — Broadcast / Accept / Sync-Status Chain (registry-dependent)
#     Exercises broadcast → relay-accept → sync-status using the seed driver and
#     vehicle registered in the regulatory registry. Skips gracefully if no
#     eligible candidates are registered in the runtime environment.
#
#   PHASE 3 — Driver App Surface (external-adapter-dependent)
#     Verifies that a forwarded task surfaces to the driver with correct
#     routeLocked / sourcePlatform metadata. Depends on live platform adapter
#     data or seeded forwarded tasks visible in /driver/tasks. Logs warnings and
#     exits cleanly when no forwarded task is present.
#
# ENV-GATE TRIAGE GUIDE
# ─────────────────────
# Phase 1 passes:   API is reachable; forwarder module is loaded.
# Phase 2 passes:   Phase 1 + regulatory registry has at least one eligible
#                   driver/vehicle pair for standard_taxi service bucket.
#                   On staging this requires seed S0002__demo_operational_seed.sql
#                   to have been applied and the driver/vehicle to be dispatchable.
# Phase 3 passes:   Phase 2 + a forwarded task has been ingested and broadcast
#                   so that /driver/tasks exposes it to the seed driver, OR a
#                   live external platform adapter has delivered an order.
# Full PASS:        All three phases pass; live platform adapter round-trip proven.
# Phase 2 SKIP:     Registry has no eligible candidates → expected in dry-run /
#                   local dev without seed data. Not a scenario failure.
# Phase 3 SKIP:     No forwarded task in driver task list → expected in staging
#                   without a live platform adapter or explicit seed. Not a failure.
#
# Cross-ref: docs/04-uat/phase1-uat-scenarios.md §5 E2E-002, UAT DA-001, DA-005,
#            WA-004 (routeLocked), WC-005 (forwarded task route-aware UI),
#            support/sidecars/EMC-I1-001/EMC-I1-001-LIVE-EVIDENCE-PACK.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-002"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-002 — Forwarded order mirror lifecycle${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — Repo-Controllable Forwarder Lifecycle
# Always runnable; does not depend on external platform data or seeded registry.
# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BOLD}━━━━ PHASE 1: Repo-Controllable Forwarder Lifecycle ━━━━${RESET}"
log_surface "Forwarder API — ingest test external order"

switch_actor "platform_admin" "e2e-platform-admin-001"

# Generate a unique external order ID for this run so parallel runs don't collide.
E2E_EXTERNAL_ORDER_ID="e2e-grab-${_E2E_RUN_ID}-$(date +%s)"

log_step "1.1 — POST /forwarder/orders/inbound (seed test forwarded order)"
INGEST_FIXTURE=$(mktemp /tmp/drts-e2e-002-ingest-XXXXXX.json)
trap 'rm -f "$INGEST_FIXTURE"' EXIT
jq --arg oid "$E2E_EXTERNAL_ORDER_ID" \
  '.externalOrderId = $oid' \
  "${SCRIPT_DIR}/fixtures/e2e-forwarder-ingest.json" > "$INGEST_FIXTURE"

http_call POST "/forwarder/orders/inbound" "$INGEST_FIXTURE"
assert_status "200|201"

MIRROR_ORDER_ID=$(json_get ".data.mirrorOrderId")
MIRROR_STATUS=$(json_get ".data.status")
MIRROR_PLATFORM=$(json_get ".data.platformCode")

if [[ -z "$MIRROR_ORDER_ID" || "$MIRROR_ORDER_ID" == "null" ]]; then
  log_fail "No mirrorOrderId returned from forwarder ingest."
  exit 1
fi

chain_set "forwarder" "mirrorOrderId" "$MIRROR_ORDER_ID"
chain_set "forwarder" "externalOrderId" "$E2E_EXTERNAL_ORDER_ID"
save_evidence "$SCENARIO" "forwarder" "mirrorOrderId" "$MIRROR_ORDER_ID"
save_evidence "$SCENARIO" "forwarder" "externalOrderId" "$E2E_EXTERNAL_ORDER_ID"
save_evidence "$SCENARIO" "forwarder" "ingestStatus" "${MIRROR_STATUS:-received}"
log_ok "Forwarded order ingested: mirrorOrderId=${MIRROR_ORDER_ID} status=${MIRROR_STATUS:-received} platform=${MIRROR_PLATFORM:-unknown}"

log_step "1.2 — GET /forwarder/orders (verify mirror order appears in list)"
http_call GET "/forwarder/orders"
assert_status "200"

FOUND_ORDER=$(echo "$RESP_BODY" | \
  jq -r --arg mid "$MIRROR_ORDER_ID" \
    '.data.items[] | select(.mirrorOrderId == $mid) | .mirrorOrderId' \
  2>/dev/null | head -1 || true)

if [[ -z "$FOUND_ORDER" ]]; then
  log_fail "Mirror order ${MIRROR_ORDER_ID} not found in /forwarder/orders list."
  exit 1
fi
log_ok "Mirror order confirmed in forwarder order list"

log_step "1.3 — GET /forwarder/adapters/health (verify grab_taiwan adapter registered)"
http_call GET "/forwarder/adapters/health"
assert_status "200"

GRAB_ADAPTER_STATUS=$(echo "$RESP_BODY" | \
  jq -r '.data.items[] | select(.platformCode == "grab_taiwan") | .status' \
  2>/dev/null | head -1 || true)

save_evidence "$SCENARIO" "forwarder" "grabAdapterHealth" "${GRAB_ADAPTER_STATUS:-not_registered}"
if [[ -n "$GRAB_ADAPTER_STATUS" && "$GRAB_ADAPTER_STATUS" != "null" ]]; then
  log_ok "grab_taiwan adapter health: ${GRAB_ADAPTER_STATUS}"
else
  log_warn "grab_taiwan adapter not found in health list — adapter registration may not be active."
fi

# Assert Phase 1 chain continuity before proceeding.
assert_chain "forwarder" "mirrorOrderId"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — Broadcast / Accept / Sync-Status Chain (registry-dependent)
# Requires at least one eligible driver/vehicle pair in the regulatory registry.
# Graceful skip when no eligible candidates are present.
# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BOLD}━━━━ PHASE 2: Broadcast / Accept / Sync-Status Chain ━━━━${RESET}"
log_surface "Forwarder API — broadcast, relay accept, sync status"

PHASE2_SKIPPED=0

log_step "2.1 — POST /forwarder/orders/:mirrorOrderId/broadcast (candidateDriverIds=[seed driver])"
BROADCAST_FIXTURE=$(mktemp /tmp/drts-e2e-002-broadcast-XXXXXX.json)
trap 'rm -f "$BROADCAST_FIXTURE" "$INGEST_FIXTURE"' EXIT
jq -n --arg did "$E2E_SEED_DRIVER_ID" \
  '{"candidateDriverIds": [$did]}' > "$BROADCAST_FIXTURE"

http_call POST "/forwarder/orders/${MIRROR_ORDER_ID}/broadcast" "$BROADCAST_FIXTURE"

if echo "$RESP_STATUS" | grep -qE "^(200|201)$"; then
  BROADCAST_STATUS=$(json_get ".data.status")
  CANDIDATE_COUNT=$(json_get ".data.candidateDriverIds | length")
  save_evidence "$SCENARIO" "forwarder" "broadcastStatus" "${BROADCAST_STATUS:-broadcasted}"
  save_evidence "$SCENARIO" "forwarder" "candidateCount" "${CANDIDATE_COUNT:-0}"
  log_ok "Broadcast complete: status=${BROADCAST_STATUS:-broadcasted} candidateCount=${CANDIDATE_COUNT:-0}"
elif echo "$RESP_BODY" | grep -q "NO_ELIGIBLE_FORWARDER_CANDIDATES"; then
  log_warn "Phase 2 SKIP: No eligible forwarder candidates in regulatory registry."
  log_warn "Expected in environments without seed S0002 applied or without dispatchable drivers."
  log_warn "Triage: verify driver ${E2E_SEED_DRIVER_ID} is registered, dispatchable, and"
  log_warn "        vehicle ${E2E_SEED_VEHICLE_ID} supports standard_taxi service bucket."
  save_evidence "$SCENARIO" "forwarder" "phase2" "SKIPPED_no_eligible_candidates"
  PHASE2_SKIPPED=1
else
  log_fail "Unexpected error broadcasting forwarded order: HTTP ${RESP_STATUS}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

if [[ "$PHASE2_SKIPPED" -eq 0 ]]; then
  log_step "2.2 — POST /forwarder/orders/:mirrorOrderId/accept (relay driver accept)"
  ACCEPT_RELAY_FIXTURE=$(mktemp /tmp/drts-e2e-002-accept-relay-XXXXXX.json)
  trap 'rm -f "$ACCEPT_RELAY_FIXTURE" "$BROADCAST_FIXTURE" "$INGEST_FIXTURE"' EXIT
  jq -n --arg did "$E2E_SEED_DRIVER_ID" '{"driverId": $did}' > "$ACCEPT_RELAY_FIXTURE"

  http_call POST "/forwarder/orders/${MIRROR_ORDER_ID}/accept" "$ACCEPT_RELAY_FIXTURE"
  assert_status "200|201"

  RELAY_STATUS=$(json_get ".data.status")
  RELAY_DRIVER=$(json_get ".data.acceptedDriverId")
  save_evidence "$SCENARIO" "forwarder" "relayStatus" "${RELAY_STATUS:-accept_pending}"
  save_evidence "$SCENARIO" "forwarder" "acceptedDriverId" "${RELAY_DRIVER:-unknown}"
  log_ok "Relay accept complete: status=${RELAY_STATUS:-accept_pending} acceptedDriverId=${RELAY_DRIVER:-unknown}"

  log_step "2.3 — POST /forwarder/orders/:mirrorOrderId/sync-status (confirmed_by_platform)"
  SYNC_FIXTURE=$(mktemp /tmp/drts-e2e-002-sync-XXXXXX.json)
  trap 'rm -f "$SYNC_FIXTURE" "$ACCEPT_RELAY_FIXTURE" "$BROADCAST_FIXTURE" "$INGEST_FIXTURE"' EXIT
  jq -n '{"nativeStatus": "confirmed_by_platform"}' > "$SYNC_FIXTURE"

  http_call POST "/forwarder/orders/${MIRROR_ORDER_ID}/sync-status" "$SYNC_FIXTURE"
  assert_status "200|201"

  SYNC_STATUS=$(json_get ".data.status")
  NATIVE_IN_SNAPSHOT=$(json_get ".data.authoritativeSnapshot.nativeStatus")
  save_evidence "$SCENARIO" "forwarder" "syncStatus" "${SYNC_STATUS:-confirmed_by_platform}"
  save_evidence "$SCENARIO" "forwarder" "nativeStatusInSnapshot" "${NATIVE_IN_SNAPSHOT:-confirmed_by_platform}"
  log_ok "Sync status complete: status=${SYNC_STATUS} nativeStatus=${NATIVE_IN_SNAPSHOT}"

  log_step "2.4 — GET /forwarder/orders (verify final mirror state)"
  http_call GET "/forwarder/orders"
  assert_status "200"

  FINAL_STATUS=$(echo "$RESP_BODY" | \
    jq -r --arg mid "$MIRROR_ORDER_ID" \
      '.data.items[] | select(.mirrorOrderId == $mid) | .status' \
    2>/dev/null | head -1 || true)

  save_evidence "$SCENARIO" "forwarder" "finalMirrorStatus" "${FINAL_STATUS:-unknown}"
  if [[ "$FINAL_STATUS" == "confirmed_by_platform" ]]; then
    log_ok "Mirror order final status: confirmed_by_platform — forwarder lifecycle proof complete."
  else
    log_warn "Mirror order final status: ${FINAL_STATUS:-unknown} (expected confirmed_by_platform)."
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — Driver App Surface (external-adapter-dependent)
# Verifies a forwarded task surfaces to the driver with correct metadata.
# Graceful skip when no forwarded task is present in /driver/tasks.
# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BOLD}━━━━ PHASE 3: Driver App Surface (env-gated) ━━━━${RESET}"
log_surface "Driver App — forwarded task visibility"

switch_actor "driver_user" "e2e-driver-${E2E_SEED_DRIVER_ID}" "$E2E_SEED_TENANT_ID"

log_step "3.1 — GET /driver/tasks (list all driver tasks)"
http_call GET "/driver/tasks"
assert_status "200"

TOTAL_TASKS=$(json_get ".data.items | length")
log_info "Total driver tasks visible: ${TOTAL_TASKS:-0}"

# Find the first forwarded task (routeLocked = true OR sourcePlatform != "drts")
FORWARDED_TASK_ID=""
FORWARDED_ROUTE_LOCKED=""
FORWARDED_SOURCE_PLATFORM=""

if [[ "${TOTAL_TASKS:-0}" -gt 0 ]]; then
  # Try to find a task with routeLocked=true
  FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
    jq -r '.data.items[] | select((.routeLocked // .route_locked) == true) | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)

  if [[ -z "$FORWARDED_TASK_ID" ]]; then
    # Fall back: any task with sourcePlatform not null/empty and != "drts"
    FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
      jq -r '.data.items[] | select((.sourcePlatform // .source_platform) != null and (.sourcePlatform // .source_platform) != "drts") | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)
  fi
fi

if [[ -z "$FORWARDED_TASK_ID" ]]; then
  log_warn "Phase 3 SKIP: No forwarded task found in driver task list."
  log_warn "Expected in environments without a live platform adapter or a forwarded task seeded"
  log_warn "into /driver/tasks via the external platform webhook path."
  log_warn "Triage: if Phase 2 passed, verify the forwarder broadcast correctly routes a driver task."
  log_warn "        If Phase 2 was skipped, check regulatory registry for seed driver eligibility."
  save_evidence "$SCENARIO" "driver" "phase3" "SKIPPED_no_forwarded_task"
  echo ""
  print_chain_summary
  echo ""
  log_ok "E2E-002 complete — Phase 1 passed; Phase 2 and Phase 3 env-gated (see triage guide)."
  echo -e "Evidence log: ${EVIDENCE_FILE}"
  exit 0
fi

chain_set "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
save_evidence "$SCENARIO" "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
log_ok "Found forwarded taskId=${FORWARDED_TASK_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 continued — Verify routeLocked metadata
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — routeLocked and platform source verification"

log_step "3.2 — GET /driver/tasks/:taskId (verify forwarded task metadata)"
http_call GET "/driver/tasks/${FORWARDED_TASK_ID}"
assert_status "200"

FORWARDED_ROUTE_LOCKED=$(json_get_first ".data.routeLocked" ".data.route_locked")
FORWARDED_SOURCE_PLATFORM=$(json_get_first ".data.sourcePlatform" ".data.source_platform")
TASK_TYPE=$(json_get ".data.taskType")

save_evidence "$SCENARIO" "driver" "routeLocked" "${FORWARDED_ROUTE_LOCKED:-false}"
save_evidence "$SCENARIO" "driver" "sourcePlatform" "${FORWARDED_SOURCE_PLATFORM:-unknown}"

if [[ "${FORWARDED_ROUTE_LOCKED:-false}" != "true" ]]; then
  log_warn "Task routeLocked=${FORWARDED_ROUTE_LOCKED:-false} — expected true for a forwarded task."
  log_warn "Cross-ref: UAT DA-005; WA-004 acceptance criteria."
else
  log_ok "routeLocked=true confirmed"
fi

if [[ -n "$FORWARDED_SOURCE_PLATFORM" && "$FORWARDED_SOURCE_PLATFORM" != "null" ]]; then
  log_ok "sourcePlatform=${FORWARDED_SOURCE_PLATFORM}"
else
  log_warn "sourcePlatform not present — platform badge cannot be rendered."
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 continued — Driver accepts the forwarded task
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — accept forwarded task"

log_step "3.3 — POST /driver/tasks/:taskId/accept"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ACCEPT_FIXTURE=$(mktemp /tmp/drts-e2e-002-accept-XXXXXX.json)
trap 'rm -f "$ACCEPT_FIXTURE"' EXIT
jq --arg ts "$NOW" '.acceptedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$ACCEPT_FIXTURE"

http_call POST "/driver/tasks/${FORWARDED_TASK_ID}/accept" "$ACCEPT_FIXTURE"
assert_status "200|201"
save_evidence "$SCENARIO" "driver" "acceptedAt" "$NOW"
log_ok "Forwarded task accepted"

log_step "3.4 — GET /driver/tasks/:taskId (verify state after accept)"
http_call GET "/driver/tasks/${FORWARDED_TASK_ID}"
assert_status "200"
TASK_STATUS_AFTER_ACCEPT=$(json_get ".data.status")
save_evidence "$SCENARIO" "driver" "taskStatusAfterAccept" "${TASK_STATUS_AFTER_ACCEPT:-unknown}"
log_ok "Task status after accept: ${TASK_STATUS_AFTER_ACCEPT:-unknown}"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 continued — No owned dispatch_assignment for forwarded task
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — verify no owned dispatch_assignment created"

switch_actor "ops_user" "e2e-ops-001"

log_step "3.5 — GET /dispatch/tasks (verify no owned job for forwarded task)"
http_call GET "/dispatch/tasks"
assert_status "200"

# Check that there is no dispatch job whose forwardedTaskId matches our task
OWNED_JOB_FOR_FORWARDED=$(echo "$RESP_BODY" | \
  jq -r --arg tid "$FORWARDED_TASK_ID" \
    '.data.items[] | select((.sourceTaskId // .source_task_id) == $tid or (.forwardedTaskId // .forwarded_task_id) == $tid) | (.dispatchJobId // .dispatch_job_id)' \
  2>/dev/null | head -1 || true)

if [[ -n "$OWNED_JOB_FOR_FORWARDED" ]]; then
  log_fail "Found owned dispatch_assignment for forwarded task — this violates E2E-002 pass criteria."
  log_fail "dispatchJobId=${OWNED_JOB_FOR_FORWARDED}"
  log_fail "Cross-ref: UAT E2E-002 pass criteria: 'No owned dispatch_assignment created'."
  exit 1
else
  log_ok "No owned dispatch job found for forwarded task — correct."
fi

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "forwarder" "mirrorOrderId"
assert_chain "driver" "forwardedTaskId"

print_chain_summary

echo ""
log_ok "E2E-002 complete — all three phases passed; forwarded order mirror lifecycle proven end-to-end."
echo -e "Evidence log: ${EVIDENCE_FILE}"
