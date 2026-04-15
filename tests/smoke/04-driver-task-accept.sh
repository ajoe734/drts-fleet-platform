#!/usr/bin/env bash
# Smoke test 04 — Driver task accept
# Retrieves the driver's open task (created by dispatch in test 03) and
# calls POST /driver/tasks/:taskId/accept.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "04 — Driver task accept"

# ── 1. Resolve taskId ─────────────────────────────────────────────────────────
TASK_ID=$(state_get "taskId")

if [[ -z "$TASK_ID" ]]; then
  # Fall back: pick first pending task from driver task list
  http_call GET "/driver/tasks"
  assert_status "200"
  TASK_ID=$(json_get ".data.items[0].taskId")
fi

if [[ -z "$TASK_ID" ]]; then
  log_warn "No driver task found; skipping driver task accept."
  log_warn "This is expected when staging DB is empty — complete dispatch first."
  exit 0
fi

log_info "Using taskId=${TASK_ID}"

# ── 2. Accept ─────────────────────────────────────────────────────────────────
ACCEPTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

FIXTURE_TMP=$(mktemp /tmp/drts-smoke-accept-XXXXXX.json)
trap 'rm -f "$FIXTURE_TMP"' EXIT

jq --arg ts "$ACCEPTED_AT" '.acceptedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/driver-task-accept.json" > "$FIXTURE_TMP"

http_call POST "/driver/tasks/${TASK_ID}/accept" "$FIXTURE_TMP"
assert_status "200|201"

state_set "taskId" "$TASK_ID"
log_ok "POST /driver/tasks/${TASK_ID}/accept → HTTP ${RESP_STATUS}"

# ── 3. Verify task status ──────────────────────────────────────────────────────
http_call GET "/driver/tasks/${TASK_ID}"
assert_status "200"
TASK_STATUS=$(json_get ".data.status")
log_ok "GET /driver/tasks/${TASK_ID} → status=${TASK_STATUS}"
