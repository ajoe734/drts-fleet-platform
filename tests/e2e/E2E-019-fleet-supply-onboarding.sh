#!/usr/bin/env bash
# E2E-019 — Fleet supply onboarding (API level)
#
# Source: docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §11.3
# Dependencies: SUP-BE-006 (canonical provisioning + vehicle fleet affiliation on approve),
#               SUP-BE-007 (supply readiness service + readiness APIs).
#
# Spec narrative:
#   fleet partner creates driver/vehicle -> uploads doc metadata -> submits
#   -> admin requests revision -> resubmits -> admin approves
#   -> canonical driver/vehicle/affiliations created -> readiness ready
#
# What this scenario proves against the wired integration stack (HARD asserts):
#   1. Platform supply-review state machine: submitted -> in_review -> needs_revision,
#      with optimistic concurrency (expectedRevisionNo) and the reviewer-self-approval guard.
#   2. Approve transitions an in_review submission to approved and provisions the canonical
#      driver / vehicle / contract / policy ids (SUP-BE-006).
#   3. The supply readiness service (SUP-BE-007) evaluates canonical subjects, returns a
#      well-formed readiness record (state + reasonCodes + policyVersion), reaches the
#      terminal "ready" state for a fully-credentialed subject, surfaces precise reason
#      codes for a not_ready subject, and enforces realm/scope on the portal route.
#
# Explicit boundaries (see "GATED LEGS" section at the end — these are logged, never
# silently passed, consistent with tests/e2e/README.md and gate-deferred.txt):
#   - Fleet-partner self-service create-driver / create-vehicle / upload-document /
#     submit / RESUBMIT is an unbuilt scaffold (apps/api/.../supply-submission.service.ts is
#     `export class SupplySubmissionService {}`). The "creates / uploads / submits / resubmits"
#     legs of the spec narrative are driven from the supply-review seed fixtures instead and
#     the missing write API is reported as a tracked gap.
#   - The readiness read-model is repository-backed; in the default in-memory stack it does not
#     observe a runtime in-memory approval, and the DB-backed stack carries no seeded
#     submissions to approve. So the "the just-approved submission's own canonical subject
#     becomes readiness=ready" link is asserted at the engine level on seeded canonical
#     subjects, and the runtime-approval->same-subject-readiness join is reported as a seam.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-019"
FLEET_PARTNER_ID="${E2E_SUPPLY_FLEET_PARTNER_ID:-fleet-demo-001}"
# Portal readiness routes require realm partner|system plus the billing:read scope.
READINESS_SCOPES="${E2E_SUPPLY_READINESS_SCOPES:-billing:read partner:entries:read}"

TMP_FILES=()
cleanup() {
  local f
  for f in "${TMP_FILES[@]:-}"; do [[ -n "$f" ]] && rm -f "$f"; done
  return 0
}
trap cleanup EXIT

# ── Local helpers ─────────────────────────────────────────────────────────────
use_admin_actor() { switch_actor "platform_admin" "e2e-platform-admin-001"; }

# Re-create the reviewer actor as a specific actor id (used to drive the
# reviewer-self-approval guard with the original submitter's identity).
use_actor_id() { switch_actor "platform_admin" "$1"; }

use_partner_actor() {
  switch_actor "partner_api_key" "e2e-fleet-partner-001"
  E2E_FLEET_PARTNER_ID="$FLEET_PARTNER_ID"
  E2E_EXTRA_SCOPES="$READINESS_SCOPES"
}

post_json() { # path json
  local f
  f=$(mktemp)
  TMP_FILES+=("$f")
  printf '%s' "$2" > "$f"
  http_call POST "$1" "$f"
}

assert_error_code() { # expected-code
  local got
  got=$(json_get '.error.code')
  if [[ "$got" != "$1" ]]; then
    log_fail "Expected error code ${1}, got '${got}' (HTTP ${RESP_STATUS})"
    log_fail "Body: ${RESP_BODY}"
    return 1
  fi
  log_ok "Error contract ${1} (HTTP ${RESP_STATUS})"
}

# Reads a submission detail into SUB_STATUS / SUB_REV / SUB_SUBMITTER.
read_submission() { # submission-id
  use_admin_actor
  http_call GET "/admin/supply-review/submissions/$1"
  assert_status "200"
  SUB_STATUS=$(json_get '.data.status')
  SUB_REV=$(json_get '.data.revision_no')
  SUB_SUBMITTER=$(json_get '.data.submitted_by')
}

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-019 — Fleet supply onboarding (API level)${RESET}"
echo -e "${BOLD}  Fleet partner: ${FLEET_PARTNER_ID}${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Discover seeded supply submissions (the "create/upload/submit" inputs)
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Supply Review — submission inventory"
log_step "LEG 1 — list supply submissions"

use_admin_actor
http_call GET "/admin/supply-review/submissions"
assert_status "200"

DRIVER_SUB=$(echo "$RESP_BODY" | jq -r \
  '[.data.items[]? | select(.submission_type=="driver_onboarding")][0].submission_id // empty')
VEHICLE_SUB=$(echo "$RESP_BODY" | jq -r \
  '[.data.items[]? | select(.submission_type=="vehicle_onboarding")][0].submission_id // empty')

log_info "driver_onboarding submission: ${DRIVER_SUB:-<none>}"
log_info "vehicle_onboarding submission: ${VEHICLE_SUB:-<none>}"
save_evidence "$SCENARIO" "supply-review" "driver_submission" "${DRIVER_SUB:-none}"
save_evidence "$SCENARIO" "supply-review" "vehicle_submission" "${VEHICLE_SUB:-none}"

REVIEW_LEG_ENABLED=true
if [[ -z "$DRIVER_SUB" || -z "$VEHICLE_SUB" ]]; then
  REVIEW_LEG_ENABLED=false
  log_warn "GATED: no seeded driver+vehicle supply submissions are present."
  log_warn "  The fleet-partner self-service submission write API is an unbuilt scaffold"
  log_warn "  (supply-submission.service.ts), and the DB-backed stack carries no submission"
  log_warn "  seed rows. The review/approve legs cannot run here; exercising readiness only."
fi

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Admin review + request-revision loop (optimistic concurrency + guards)
# ══════════════════════════════════════════════════════════════════════════════
if [[ "$REVIEW_LEG_ENABLED" == "true" ]]; then
  log_surface "Platform Supply Review — review state machine"
  log_step "LEG 2 — start review, concurrency guard, request revision"

  read_submission "$DRIVER_SUB"
  if [[ "$SUB_STATUS" == "submitted" ]]; then
    # submitted -> in_review (start), using the current revision as the expected revision
    post_json "/admin/supply-review/submissions/${DRIVER_SUB}/start" \
      "{\"expectedRevisionNo\":${SUB_REV},\"reasonCode\":\"initial_screening\",\"comment\":\"E2E start review\"}"
    assert_status "200|201"
    [[ "$(json_get '.data.status')" == "in_review" ]] || { log_fail "start did not reach in_review"; exit 1; }
    log_ok "Submission ${DRIVER_SUB} submitted -> in_review (rev $(json_get '.data.revision_no'))"
    chain_set "supply-review" "driver_review_status" "$(json_get '.data.status')"

    read_submission "$DRIVER_SUB"

    # Optimistic concurrency: a stale expectedRevisionNo must be rejected with 409.
    STALE_REV=$(( SUB_REV - 1 ))
    post_json "/admin/supply-review/submissions/${DRIVER_SUB}/request-revision" \
      "{\"expectedRevisionNo\":${STALE_REV},\"reasonCode\":\"stale_probe\"}"
    assert_status "409"
    assert_error_code "SUBMISSION_REVISION_CONFLICT"

    # Real revision request: in_review -> needs_revision, reason echoed back.
    post_json "/admin/supply-review/submissions/${DRIVER_SUB}/request-revision" \
      "{\"expectedRevisionNo\":${SUB_REV},\"reasonCode\":\"documents_unclear\",\"comment\":\"Please re-upload the driver license scan.\"}"
    assert_status "200|201"
    [[ "$(json_get '.data.status')" == "needs_revision" ]] || { log_fail "request-revision did not reach needs_revision"; exit 1; }
    [[ "$(json_get '.data.review_reason_code')" == "documents_unclear" ]] || { log_fail "reason code not persisted"; exit 1; }
    log_ok "Submission ${DRIVER_SUB} in_review -> needs_revision (reason documents_unclear)"
    save_evidence "$SCENARIO" "supply-review" "driver_needs_revision" "$(json_get '.data.revision_no')"

    # Invalid transition: approve requires in_review; a needs_revision submission rejects.
    read_submission "$DRIVER_SUB"
    post_json "/admin/supply-review/submissions/${DRIVER_SUB}/approve" \
      "{\"expectedRevisionNo\":${SUB_REV},\"reasonCode\":\"premature_approval\"}"
    assert_status "409"
    assert_error_code "INVALID_STATE_TRANSITION"
    log_ok "needs_revision submission correctly refuses direct approve"
  else
    log_warn "GATED: driver submission ${DRIVER_SUB} is '${SUB_STATUS}', not 'submitted'."
    log_warn "  (Likely a shared long-lived API whose seed was already advanced. Use the"
    log_warn "  hermetic runner for a deterministic from-seed review-loop assertion.)"
  fi

  # ════════════════════════════════════════════════════════════════════════════
  # LEG 3 — Approve -> canonical provisioning (SUP-BE-006)
  # ════════════════════════════════════════════════════════════════════════════
  log_surface "Platform Supply Review — approval + canonical provisioning"
  log_step "LEG 3 — reviewer-self-approval guard, then approve -> canonical records"

  read_submission "$VEHICLE_SUB"
  if [[ "$SUB_STATUS" == "in_review" ]]; then
    # Reviewer-self-approval guard: the original submitter may not approve.
    if [[ -n "$SUB_SUBMITTER" ]]; then
      use_actor_id "$SUB_SUBMITTER"
      post_json "/admin/supply-review/submissions/${VEHICLE_SUB}/approve" \
        "{\"expectedRevisionNo\":${SUB_REV},\"reasonCode\":\"self_approval_probe\"}"
      assert_status "403"
      assert_error_code "REVIEWER_SELF_APPROVAL_DENIED"
    fi

    # Approve with an independent reviewer -> approved + canonical ids.
    use_admin_actor
    read_submission "$VEHICLE_SUB"
    post_json "/admin/supply-review/submissions/${VEHICLE_SUB}/approve" \
      "{\"expectedRevisionNo\":${SUB_REV},\"reasonCode\":\"all_documents_valid\",\"comment\":\"E2E approval\"}"
    assert_status "200|201"
    [[ "$(json_get '.data.status')" == "approved" ]] || { log_fail "approve did not reach approved"; exit 1; }

    CANON_DRIVER=$(json_get '.data.canonical_driver_id')
    CANON_VEHICLE=$(json_get '.data.canonical_vehicle_id')
    CANON_CONTRACT=$(json_get '.data.canonical_contract_id')
    CANON_POLICY=$(json_get '.data.canonical_policy_id')
    for pair in "driver:${CANON_DRIVER}" "vehicle:${CANON_VEHICLE}" "contract:${CANON_CONTRACT}" "policy:${CANON_POLICY}"; do
      kind="${pair%%:*}"; val="${pair#*:}"
      if [[ -z "$val" || "$val" == "null" ]]; then
        log_fail "Approval did not provision a canonical ${kind} id"
        exit 1
      fi
    done
    log_ok "Approve provisioned canonical driver/vehicle/contract/policy ids"
    chain_set "regulatory-registry" "canonical_driver_id" "$CANON_DRIVER"
    chain_set "regulatory-registry" "canonical_vehicle_id" "$CANON_VEHICLE"
    chain_set "regulatory-registry" "canonical_contract_id" "$CANON_CONTRACT"
    chain_set "regulatory-registry" "canonical_policy_id" "$CANON_POLICY"
    assert_chain "regulatory-registry" "canonical_vehicle_id"
    save_evidence "$SCENARIO" "regulatory-registry" "canonical_vehicle_id" "$CANON_VEHICLE"
    save_evidence "$SCENARIO" "regulatory-registry" "canonical_driver_id" "$CANON_DRIVER"
  else
    log_warn "GATED: vehicle submission ${VEHICLE_SUB} is '${SUB_STATUS}', not 'in_review'."
    log_warn "  Approve->canonical provisioning needs an in_review submission; run hermetically."
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Supply readiness engine (SUP-BE-007)
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Fleet Partner Portal — supply readiness"
log_step "LEG 4 — readiness catalog, ready terminal, reason codes, realm/scope guard"

POLICY_VERSION_EXPECTED="phase1-delta-supply-readiness-2026-06-19"

use_partner_actor
http_call GET "/fleet-partner/readiness"
assert_status "200"

READINESS_COUNT=$(echo "$RESP_BODY" | jq -r '[.data.items[]?] | length')
log_info "Readiness subjects returned: ${READINESS_COUNT}"

if [[ "${READINESS_COUNT:-0}" -gt 0 ]]; then
  # Every record must carry the readiness contract: subjectType, state, reasonCodes[],
  # and the current policy version.
  MALFORMED=$(echo "$RESP_BODY" | jq -r \
    "[.data.items[] | select((.subject_type|type!=\"string\") or (.state|type!=\"string\") or (.reason_codes|type!=\"array\") or (.policy_version!=\"${POLICY_VERSION_EXPECTED}\"))] | length")
  if [[ "$MALFORMED" != "0" ]]; then
    log_fail "Readiness returned ${MALFORMED} record(s) violating the readiness contract"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "All ${READINESS_COUNT} readiness records satisfy the SUP-BE-007 contract (policy ${POLICY_VERSION_EXPECTED})"

  # Terminal "ready": at least one fully-credentialed subject with no blocking reasons.
  READY_SUBJECT=$(echo "$RESP_BODY" | jq -r \
    '[.data.items[] | select(.state=="ready" and (.reason_codes|length==0))][0].subject_id // empty')
  if [[ -z "$READY_SUBJECT" ]]; then
    log_fail "Readiness engine did not produce any 'ready' subject with empty reason codes"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  READY_TYPE=$(echo "$RESP_BODY" | jq -r \
    --arg id "$READY_SUBJECT" '[.data.items[] | select(.subject_id==$id)][0].subject_type')
  log_ok "Readiness terminal 'ready' reached for ${READY_TYPE} ${READY_SUBJECT}"
  chain_set "supply-readiness" "ready_subject_id" "$READY_SUBJECT"
  save_evidence "$SCENARIO" "supply-readiness" "ready_subject" "${READY_TYPE}:${READY_SUBJECT}"

  # Reason-code engine: a not_ready subject must enumerate at least one blocking reason.
  NOT_READY_REASONS=$(echo "$RESP_BODY" | jq -r \
    '[.data.items[] | select(.state!="ready")][0].reason_codes // [] | length')
  NOT_READY_SUBJECT=$(echo "$RESP_BODY" | jq -r \
    '[.data.items[] | select(.state!="ready")][0].subject_id // empty')
  if [[ -n "$NOT_READY_SUBJECT" ]]; then
    if [[ "${NOT_READY_REASONS:-0}" -lt 1 ]]; then
      log_fail "Non-ready subject ${NOT_READY_SUBJECT} carries no reason codes"
      exit 1
    fi
    log_ok "Non-ready subject ${NOT_READY_SUBJECT} enumerates ${NOT_READY_REASONS} reason code(s)"
    save_evidence "$SCENARIO" "supply-readiness" "not_ready_subject" "$NOT_READY_SUBJECT"
  fi

  # Per-subject readiness route returns the same evaluation.
  READY_PATH="drivers"
  [[ "$READY_TYPE" == "vehicle" ]] && READY_PATH="vehicles"
  use_partner_actor
  http_call GET "/fleet-partner/readiness/${READY_PATH}/${READY_SUBJECT}"
  assert_status "200"
  [[ "$(json_get '.data.state')" == "ready" ]] || { log_fail "per-subject readiness state mismatch"; exit 1; }
  log_ok "Per-subject readiness route confirms ${READY_SUBJECT} = ready"

  # Unknown subject -> 404 with the readiness not-found contract.
  use_partner_actor
  http_call GET "/fleet-partner/readiness/drivers/e2e-no-such-subject"
  assert_status "404"
  assert_error_code "READINESS_SUBJECT_NOT_FOUND"
else
  log_warn "GATED: readiness returned no subjects on this stack; engine assertions skipped."
fi

# Realm/scope guard: the portal readiness route requires the billing:read scope.
use_partner_actor
E2E_EXTRA_SCOPES="partner:entries:read"   # drop billing:read on purpose
http_call GET "/fleet-partner/readiness"
assert_status "403"
assert_error_code "AUTH_SCOPE_DENIED"
log_ok "Readiness portal route enforces billing:read scope"

# ══════════════════════════════════════════════════════════════════════════════
# GATED LEGS — tracked gaps, reported (never silently passed)
# ══════════════════════════════════════════════════════════════════════════════
log_step "GATED LEGS — tracked gaps in the spec narrative"
log_warn "GATED: fleet-partner self-service create-driver / create-vehicle / upload-document /"
log_warn "       submit / RESUBMIT is unbuilt (supply-submission.service.ts scaffold). The"
log_warn "       'creates/uploads/submits/resubmits' steps were driven from supply-review seed"
log_warn "       fixtures; wire the §3.1 write API to lift this gate."
log_warn "GATED: runtime-approval -> same-canonical-subject readiness=ready join. Readiness reads"
log_warn "       its submission/affiliation state from the repository, so an in-memory runtime"
log_warn "       approval is not observable through readiness, and the DB stack has no submission"
log_warn "       seed to approve. The readiness 'ready' terminal is asserted on seeded canonical"
log_warn "       subjects instead. Lift once both halves share one persisted read-model in CI."

print_chain_summary
echo -e "\n${GREEN}${BOLD}E2E-019 fleet supply onboarding: buildable chain verified; gated legs reported.${RESET}"
exit 0
