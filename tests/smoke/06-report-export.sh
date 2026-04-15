#!/usr/bin/env bash
# Smoke test 06 — Report export
# Triggers a report job and verifies the job record is retrievable.
# Full artifact download is skipped in smoke mode (artifact URL requires staging storage).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "06 — Report export"

# ── 1. Build fixture ──────────────────────────────────────────────────────────
PERIOD_START=$(date -u +"%Y-%m-01T00:00:00Z")
PERIOD_END=$(date -u +"%Y-%m-%dT23:59:59Z")

FIXTURE_TMP=$(mktemp /tmp/drts-smoke-report-XXXXXX.json)
trap 'rm -f "$FIXTURE_TMP"' EXIT

jq \
  --arg tid "$SMOKE_TENANT_ID" \
  --arg ps  "$PERIOD_START"   \
  --arg pe  "$PERIOD_END"     \
  '.filters.tenantId = $tid | .filters.periodStart = $ps | .filters.periodEnd = $pe' \
  "${SCRIPT_DIR}/fixtures/report-export.json" > "$FIXTURE_TMP"

# ── 2. Trigger report job ─────────────────────────────────────────────────────
http_call POST "/reports/jobs" "$FIXTURE_TMP"
assert_status "200|201"

JOB_ID=$(json_get ".data.jobId")
if [[ -z "$JOB_ID" ]]; then
  log_fail "No jobId in response: ${RESP_BODY}"
  exit 1
fi

state_set "reportJobId" "$JOB_ID"
log_ok "POST /reports/jobs → HTTP ${RESP_STATUS}, jobId=${JOB_ID}"

# ── 3. Retrieve job record ────────────────────────────────────────────────────
http_call GET "/reports/${JOB_ID}"
assert_status "200"

JOB_STATUS=$(json_get ".data.status")
log_ok "GET /reports/${JOB_ID} → HTTP 200, status=${JOB_STATUS}"

# ── 4. Poll until completed (best-effort, non-blocking on smoke timeout) ──────
# In staging the job may complete synchronously (stub) or asynchronously.
if [[ "$JOB_STATUS" != "completed" ]]; then
  log_info "Job not yet completed (status=${JOB_STATUS}); polling..."
  attempt=0
  while (( attempt < SMOKE_POLL_MAX )); do
    sleep "$SMOKE_POLL_INTERVAL"
    http_call GET "/reports/${JOB_ID}"
    assert_status "200"
    JOB_STATUS=$(json_get ".data.status")
    log_info "  poll $((attempt+1))/${SMOKE_POLL_MAX}: status=${JOB_STATUS}"
    if [[ "$JOB_STATUS" == "completed" ]]; then
      break
    elif [[ "$JOB_STATUS" == "failed" ]]; then
      log_fail "Report job failed: ${RESP_BODY}"
      exit 1
    fi
    (( attempt++ ))
  done
fi

if [[ "$JOB_STATUS" == "completed" ]]; then
  log_ok "Report job completed"
  # Verify artifact present (URL existence; do not download in smoke)
  ARTIFACT_URL=$(json_get ".data.artifacts[0].downloadUrl // .data.artifacts[0].url")
  if [[ -n "$ARTIFACT_URL" ]]; then
    log_ok "Artifact URL present: ${ARTIFACT_URL}"
  else
    log_warn "Artifact URL missing — may be populated after async upload."
  fi
else
  log_fail "Report job still '${JOB_STATUS}' after ${SMOKE_POLL_MAX} poll(s); smoke timeout exceeded."
  exit 1
fi

# ── 5. List jobs sanity check ─────────────────────────────────────────────────
http_call GET "/reports/jobs"
assert_status "200"
COUNT=$(json_get ".data.items | length")
log_ok "GET /reports/jobs → HTTP 200, total=${COUNT:-0} job(s)"
