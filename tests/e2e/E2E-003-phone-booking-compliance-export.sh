#!/usr/bin/env bash
# E2E-003 — Phone booking to compliance export
#
# Surface chain: Ops Console / Callcenter → Reporting & Filing
#
# Repo-controlled pass criteria:
#   1. A phone booking can be created through the callcenter-owned path.
#   2. The created order keeps call_id lineage and emits a dispatch trace entry.
#   3. A dispatch recording index job exports the phone order with an explicit
#      missingRecording flag.
#   4. A filing package can be generated with immutable manifest metadata.
#
# Optional CTI extension:
#   - When E2E_ENABLE_CTI_CALLBACK=1, the script also simulates the repo-owned
#     recording callback endpoint and verifies the export row flips from
#     missingRecording=true to missingRecording=false.
#
# External/manual gate kept explicit:
#   - Real CTI session source and telephony-triggered recording callback remain
#     environment-gated. This script only exercises the repo-owned callback path.
#
# Cross-ref: docs/04-uat/phase1-uat-scenarios.md §5 E2E-003, support/sidecars/
#            MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md, FBP-013C OC-021/024.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-003"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-003 — Phone booking to compliance export${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

E2E_ENABLE_CTI_CALLBACK="${E2E_ENABLE_CTI_CALLBACK:-0}"
E2E_CALL_AGENT_ID="${E2E_CALL_AGENT_ID:-e2e-agent-003}"

WINDOW_START=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")
PERIOD_MONTH=$(date -u +"%Y-%m" 2>/dev/null || printf '%s\n' "2026-04")
CALL_SUFFIX=$(date -u +%Y%m%d%H%M%S 2>/dev/null || printf '%s\n' "20260422000000")
CALL_ID="E2E-CALL-${CALL_SUFFIX}"

SESSION_FIXTURE=$(mktemp /tmp/drts-e2e-003-session-XXXXXX.json)
ORDER_FIXTURE=$(mktemp /tmp/drts-e2e-003-order-XXXXXX.json)
REPORT_FIXTURE=$(mktemp /tmp/drts-e2e-003-report-XXXXXX.json)
PACKAGE_FIXTURE=$(mktemp /tmp/drts-e2e-003-package-XXXXXX.json)
RECORDING_FIXTURE=""
trap 'rm -f "$SESSION_FIXTURE" "$ORDER_FIXTURE" "$REPORT_FIXTURE" "$PACKAGE_FIXTURE" "$RECORDING_FIXTURE"' EXIT

log_surface "Ops Console — callcenter phone booking"

switch_actor "ops_user" "e2e-ops-003"

jq -n \
  --arg callerPhone "+886900000301" \
  --arg agentId "$E2E_CALL_AGENT_ID" \
  '{
    callType: "booking",
    callerPhone: $callerPhone,
    agentId: $agentId,
    agentIdentityAnnounced: true
  }' > "$SESSION_FIXTURE"

log_step "1.1 — POST /callcenter/sessions"
http_call POST "/callcenter/sessions" "$SESSION_FIXTURE"
assert_status "200|201"

SESSION_CALL_ID=$(json_get_first ".data.callId" ".data.call_id")
if [[ -z "$SESSION_CALL_ID" ]]; then
  log_fail "No callId returned from callcenter session creation: ${RESP_BODY}"
  exit 1
fi

chain_set "callcenter" "callId" "$SESSION_CALL_ID"
save_evidence "$SCENARIO" "callcenter" "callId" "$SESSION_CALL_ID"
log_ok "Opened call session callId=${SESSION_CALL_ID}"

jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  --arg callId "$SESSION_CALL_ID" \
  --arg agentId "$E2E_CALL_AGENT_ID" \
  '.reservationWindowStart = $ws
   | .reservationWindowEnd = $we
   | .callId = $callId
   | .agentId = $agentId' \
  "${SCRIPT_DIR}/fixtures/e2e-phone-booking.json" > "$ORDER_FIXTURE"

log_step "1.2 — POST /call-center/orders"
http_call POST "/call-center/orders" "$ORDER_FIXTURE"
assert_status "200|201"

ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
ORDER_STATUS=$(json_get ".data.status")
ORDER_CALL_ID=$(json_get_first ".data.callId" ".data.call_id")

if [[ -z "$ORDER_ID" ]]; then
  log_fail "No orderId returned from call-center order creation: ${RESP_BODY}"
  exit 1
fi

if [[ "$ORDER_CALL_ID" != "$SESSION_CALL_ID" ]]; then
  log_fail "Expected order callId ${SESSION_CALL_ID}, got '${ORDER_CALL_ID:-<empty>}'"
  exit 1
fi

chain_set "ops" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "ops" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "ops" "orderStatusAfterCreate" "$ORDER_STATUS"
log_ok "Created phone order orderId=${ORDER_ID}, status=${ORDER_STATUS}"

log_step "1.3 — GET /orders/:orderId (verify phone-booking lineage)"
http_call GET "/orders/${ORDER_ID}"
assert_status "200"

ORDER_SOURCE=$(json_get_first ".data.orderSource" ".data.order_source")
ORDER_STATUS_READBACK=$(json_get ".data.status")
ORDER_COMPLIANCE_FLAGS=$(json_get '.data.complianceFlags | join(",")')
ORDER_CALL_ID_READBACK=$(json_get_first ".data.callId" ".data.call_id")

if [[ "$ORDER_SOURCE" != "phone" ]]; then
  log_fail "Expected orderSource=phone, got '${ORDER_SOURCE:-<empty>}'"
  exit 1
fi
if [[ "$ORDER_CALL_ID_READBACK" != "$SESSION_CALL_ID" ]]; then
  log_fail "Expected order read-back callId ${SESSION_CALL_ID}, got '${ORDER_CALL_ID_READBACK:-<empty>}'"
  exit 1
fi

save_evidence "$SCENARIO" "ops" "orderSource" "$ORDER_SOURCE"
save_evidence "$SCENARIO" "ops" "orderStatusReadback" "$ORDER_STATUS_READBACK"
save_evidence "$SCENARIO" "ops" "complianceFlags" "$ORDER_COMPLIANCE_FLAGS"
log_ok "Order read-back confirms orderSource=${ORDER_SOURCE}, status=${ORDER_STATUS_READBACK}"

log_step "1.4 — GET /orders/:orderId/dispatch-trace"
http_call GET "/orders/${ORDER_ID}/dispatch-trace"
assert_status "200"

TRACE_ACTION=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select((.traceType // .trace_type) == "callcenter.order_created") | (.traceType // .trace_type)' \
  2>/dev/null | head -1 || true)
if [[ -z "$TRACE_ACTION" ]]; then
  log_fail "Dispatch trace missing callcenter.order_created entry."
  exit 1
fi
save_evidence "$SCENARIO" "ops" "dispatchTrace" "$TRACE_ACTION"
log_ok "Dispatch trace contains ${TRACE_ACTION}"

if [[ "$E2E_ENABLE_CTI_CALLBACK" == "1" ]]; then
  log_surface "Callcenter — repo-owned recording callback"
  RECORDING_ID="REC-${CALL_SUFFIX}"
  RECORDING_FIXTURE=$(mktemp /tmp/drts-e2e-003-recording-XXXXXX.json)
  jq -n \
    --arg recordingId "$RECORDING_ID" \
    --arg providerRecordingRef "cti-${CALL_SUFFIX}" \
    --arg recordingUrl "https://recordings.example.com/${RECORDING_ID}" \
    --arg agentId "$E2E_CALL_AGENT_ID" \
    '{
      recordingId: $recordingId,
      providerRecordingRef: $providerRecordingRef,
      recordingUrl: $recordingUrl,
      agentId: $agentId
    }' > "$RECORDING_FIXTURE"

  log_step "2.1 — POST /callcenter/sessions/:callId/recording-callback"
  http_call POST "/callcenter/sessions/${SESSION_CALL_ID}/recording-callback" "$RECORDING_FIXTURE"
  assert_status "200|201"
  save_evidence "$SCENARIO" "callcenter" "recordingId" "$RECORDING_ID"
  log_ok "Attached recording callback recordingId=${RECORDING_ID}"

  log_step "2.2 — GET /orders/:orderId (verify recording-bound transition)"
  http_call GET "/orders/${ORDER_ID}"
  assert_status "200"
  ORDER_STATUS_READBACK=$(json_get ".data.status")
  ORDER_RECORDING_ID=$(json_get_first ".data.recordingId" ".data.recording_id")
  ORDER_COMPLIANCE_FLAGS=$(json_get '.data.complianceFlags | join(",")')

  if [[ "$ORDER_RECORDING_ID" != "$RECORDING_ID" ]]; then
    log_fail "Expected order recordingId ${RECORDING_ID}, got '${ORDER_RECORDING_ID:-<empty>}'"
    exit 1
  fi
  save_evidence "$SCENARIO" "ops" "recordingBoundStatus" "$ORDER_STATUS_READBACK"
  save_evidence "$SCENARIO" "ops" "recordingBoundFlags" "$ORDER_COMPLIANCE_FLAGS"
  log_ok "Order transitioned to status=${ORDER_STATUS_READBACK} with recordingId=${ORDER_RECORDING_ID}"
else
  log_warn "Skipping CTI callback leg; real telephony callback remains environment-gated."
  log_warn "Set E2E_ENABLE_CTI_CALLBACK=1 to exercise the repo-owned recording callback endpoint."
fi

log_surface "Reporting & Filing — compliance export"

jq \
  --arg month "$PERIOD_MONTH" \
  '.filters.month = $month' \
  "${SCRIPT_DIR}/fixtures/e2e-report-compliance.json" > "$REPORT_FIXTURE"

log_step "3.1 — POST /reports/jobs"
http_call POST "/reports/jobs" "$REPORT_FIXTURE"
assert_status "200|201"

REPORT_JOB_ID=$(json_get_first ".data.jobId" ".data.job_id")
if [[ -z "$REPORT_JOB_ID" ]]; then
  log_fail "No jobId returned from report job creation: ${RESP_BODY}"
  exit 1
fi
chain_set "reporting" "jobId" "$REPORT_JOB_ID"
save_evidence "$SCENARIO" "reporting" "jobId" "$REPORT_JOB_ID"
log_ok "Queued report job jobId=${REPORT_JOB_ID}"

log_step "3.2 — GET /reports/:jobId (poll until completed)"
ATTEMPT=0
REPORT_STATUS=""
while (( ATTEMPT < E2E_POLL_MAX )); do
  http_call GET "/reports/${REPORT_JOB_ID}"
  assert_status "200"
  REPORT_STATUS=$(json_get ".data.status")
  if [[ "$REPORT_STATUS" == "completed" ]]; then
    break
  fi
  log_info "  poll $((ATTEMPT + 1))/${E2E_POLL_MAX}: report status=${REPORT_STATUS:-unknown}"
  sleep "$E2E_POLL_INTERVAL"
  ATTEMPT=$((ATTEMPT + 1))
done

if [[ "$REPORT_STATUS" != "completed" ]]; then
  log_fail "Report job ${REPORT_JOB_ID} did not complete; last status=${REPORT_STATUS:-unknown}"
  exit 1
fi

REPORT_ROW=$(echo "$RESP_BODY" | jq -c --arg orderId "$ORDER_ID" \
  '.data.rows[]? | select(.orderId == $orderId)' 2>/dev/null | head -1 || true)
if [[ -z "$REPORT_ROW" ]]; then
  log_fail "dispatch_recording_index rows missing orderId=${ORDER_ID}"
  exit 1
fi

ROW_CALL_ID=$(printf '%s\n' "$REPORT_ROW" | jq -r '.callId // empty')
ROW_RECORDING_ID=$(printf '%s\n' "$REPORT_ROW" | jq -r '.recordingId // empty')
ROW_MISSING_RECORDING=$(printf '%s\n' "$REPORT_ROW" | jq -r '.missingRecording')
REPORT_DOWNLOAD_URL=$(json_get ".data.artifact.downloadUrl")

if [[ "$ROW_CALL_ID" != "$SESSION_CALL_ID" ]]; then
  log_fail "Expected report row callId ${SESSION_CALL_ID}, got '${ROW_CALL_ID:-<empty>}'"
  exit 1
fi
if [[ "$E2E_ENABLE_CTI_CALLBACK" == "1" ]]; then
  if [[ "$ROW_MISSING_RECORDING" != "false" ]]; then
    log_fail "Expected missingRecording=false after callback, got '${ROW_MISSING_RECORDING:-<empty>}'"
    exit 1
  fi
else
  if [[ "$ROW_MISSING_RECORDING" != "true" ]]; then
    log_fail "Expected missingRecording=true without callback, got '${ROW_MISSING_RECORDING:-<empty>}'"
    exit 1
  fi
fi

save_evidence "$SCENARIO" "reporting" "reportStatus" "$REPORT_STATUS"
save_evidence "$SCENARIO" "reporting" "rowCallId" "$ROW_CALL_ID"
save_evidence "$SCENARIO" "reporting" "rowRecordingId" "${ROW_RECORDING_ID:-null}"
save_evidence "$SCENARIO" "reporting" "missingRecording" "$ROW_MISSING_RECORDING"
log_ok "Report row confirms callId=${ROW_CALL_ID}, missingRecording=${ROW_MISSING_RECORDING}"
if [[ -n "$REPORT_DOWNLOAD_URL" ]]; then
  save_evidence "$SCENARIO" "reporting" "downloadUrl" "$REPORT_DOWNLOAD_URL"
  log_ok "Report artifact signed download URL generated"
fi

jq -n \
  --arg month "$PERIOD_MONTH" \
  '{
    packageType: "filing",
    scope: {
      month: $month,
      source: "phone_booking_compliance_export"
    }
  }' > "$PACKAGE_FIXTURE"

log_step "3.3 — POST /filing-packages/generate"
http_call POST "/filing-packages/generate" "$PACKAGE_FIXTURE"
assert_status "200|201"

PACKAGE_ID=$(json_get_first ".data.packageId" ".data.package_id")
if [[ -z "$PACKAGE_ID" ]]; then
  log_fail "No packageId returned from filing package creation: ${RESP_BODY}"
  exit 1
fi
chain_set "filing" "packageId" "$PACKAGE_ID"
save_evidence "$SCENARIO" "filing" "packageId" "$PACKAGE_ID"
log_ok "Queued filing package packageId=${PACKAGE_ID}"

log_step "3.4 — GET /filing-packages/:packageId (poll until completed)"
ATTEMPT=0
PACKAGE_STATUS=""
while (( ATTEMPT < E2E_POLL_MAX )); do
  http_call GET "/filing-packages/${PACKAGE_ID}"
  assert_status "200"
  PACKAGE_STATUS=$(json_get ".data.status")
  if [[ "$PACKAGE_STATUS" == "completed" ]]; then
    break
  fi
  log_info "  poll $((ATTEMPT + 1))/${E2E_POLL_MAX}: filing package status=${PACKAGE_STATUS:-unknown}"
  sleep "$E2E_POLL_INTERVAL"
  ATTEMPT=$((ATTEMPT + 1))
done

if [[ "$PACKAGE_STATUS" != "completed" ]]; then
  log_fail "Filing package ${PACKAGE_ID} did not complete; last status=${PACKAGE_STATUS:-unknown}"
  exit 1
fi

PACKAGE_MANIFEST_HASH=$(json_get ".data.manifestHash")
PACKAGE_ENTRY_COUNT=$(json_get ".data.manifest.entryCount")
PACKAGE_ZIP_URL=$(json_get ".data.artifactZipUrl")

if [[ -z "$PACKAGE_MANIFEST_HASH" ]]; then
  log_fail "Filing package missing manifestHash."
  exit 1
fi

save_evidence "$SCENARIO" "filing" "status" "$PACKAGE_STATUS"
save_evidence "$SCENARIO" "filing" "manifestHash" "$PACKAGE_MANIFEST_HASH"
save_evidence "$SCENARIO" "filing" "entryCount" "$PACKAGE_ENTRY_COUNT"
log_ok "Filing package completed with manifestHash=${PACKAGE_MANIFEST_HASH}"
if [[ -n "$PACKAGE_ZIP_URL" ]]; then
  save_evidence "$SCENARIO" "filing" "artifactZipUrl" "$PACKAGE_ZIP_URL"
  log_ok "Filing package signed ZIP URL generated"
fi

log_step "Chain continuity assertions"
assert_chain "callcenter" "callId"
assert_chain "ops" "orderId"
assert_chain "reporting" "jobId"
assert_chain "filing" "packageId"

print_chain_summary

echo ""
if [[ "$E2E_ENABLE_CTI_CALLBACK" == "1" ]]; then
  log_ok "E2E-003 complete — repo-owned phone booking, recording callback, reporting export, and filing package passed."
else
  log_ok "E2E-003 complete — repo-owned phone booking, missing-recording export, and filing package passed."
  log_warn "Real CTI-triggered callback remains an external/manual gate."
fi
echo -e "Evidence log: ${EVIDENCE_FILE}"
