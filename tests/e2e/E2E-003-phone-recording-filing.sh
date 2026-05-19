#!/usr/bin/env bash
# E2E-003 — Phone recording filing chain
#
# Surface chain: CTI call session → call-center order → recording callback →
# reporting export → filing package → evidence retention/audit
#
# ID continuity:
#   callId          captured at: callcenter/sessions    (leg 1)
#   orderId         captured at: call-center/orders     (leg 2)
#   recordingId     captured at: recording-callback     (leg 3)
#   reportJobId     captured at: reports/jobs           (leg 4)
#   packageId       captured at: filing-packages        (leg 5)
#
# Pass criteria (E2E-003):
#   1. Call session opens with recording_pending state.
#   2. Phone order links to the same callId and remains recording_pending.
#   3. Recording callback binds recordingId and clears recording_pending.
#   4. Dispatch recording index export includes the order row with masked
#      callId / recordingId and missingRecording=false.
#   5. Filing package generation returns immutable manifest + signed downloads.
#   6. Retention policies for report_artifact and filing_package are readable.
#   7. Audit log records permissioned report/file artifact issuance.
#
# Cross-ref: docs/04-uat/phase1-uat-scenarios.md §5 E2E-003, OC-021..024, OC-025.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-003"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-003 — Phone recording filing chain${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

AGENT_ID="${E2E_CALLCENTER_AGENT_ID:-e2e-agent-003}"
CALLER_PHONE="${E2E_CALLER_PHONE:-+886900000203}"
REPORT_MONTH="$(date -u +"%Y-%m")"
NOW_TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
CALLBACK_RECORDING_ID="REC-E2E-$(date -u +%s)"
CALLBACK_PROVIDER_REF="cti-ref-${E2E_RUN_ID:-$$}"
CALLBACK_RECORDING_URL="https://recordings.example.com/${CALLBACK_RECORDING_ID}"

mask_token() {
  local value="$1"
  local prefix="${value:0:8}"
  local suffix="${value: -4}"
  printf '%s...%s\n' "$prefix" "$suffix"
}

require_non_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    log_fail "${label} is empty"
    exit 1
  fi
}

assert_json_array_contains() {
  local jq_expr="$1"
  local expected="$2"
  if ! echo "$RESP_BODY" | jq -e --arg expected "$expected" \
    "${jq_expr} | index(\$expected) != null" >/dev/null 2>&1; then
    log_fail "Expected ${jq_expr} to contain '${expected}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — CTI call session
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Callcenter — open call session"

switch_actor "ops_user" "e2e-ops-003"

SESSION_FIXTURE=$(mktemp /tmp/drts-e2e-003-session-XXXXXX.json)
PHONE_ORDER_FIXTURE=$(mktemp /tmp/drts-e2e-003-order-XXXXXX.json)
CALLBACK_FIXTURE=$(mktemp /tmp/drts-e2e-003-callback-XXXXXX.json)
REPORT_FIXTURE=$(mktemp /tmp/drts-e2e-003-report-XXXXXX.json)
PACKAGE_FIXTURE=$(mktemp /tmp/drts-e2e-003-package-XXXXXX.json)
trap 'rm -f "$SESSION_FIXTURE" "$PHONE_ORDER_FIXTURE" "$CALLBACK_FIXTURE" "$REPORT_FIXTURE" "$PACKAGE_FIXTURE"' EXIT

jq -n \
  --arg callerPhone "$CALLER_PHONE" \
  --arg agentId "$AGENT_ID" \
  '{
    callType: "booking",
    callerPhone: $callerPhone,
    agentId: $agentId,
    agentIdentityAnnounced: true
  }' > "$SESSION_FIXTURE"

log_step "1.1 — POST /callcenter/sessions"
http_call POST "/callcenter/sessions" "$SESSION_FIXTURE"
assert_status "200|201"

CALL_ID=$(json_get_first ".data.callId" ".data.call_id")
require_non_empty "$CALL_ID" "callId"
chain_set "callcenter" "callId" "$CALL_ID"
save_evidence "$SCENARIO" "callcenter" "callId" "$CALL_ID"
log_ok "Call session opened: callId=${CALL_ID}"

log_step "1.2 — GET /callcenter/sessions/:callId"
http_call GET "/callcenter/sessions/${CALL_ID}"
assert_status "200"
SESSION_RECORDING_STATE=$(json_get_first ".data.recordingState" ".data.recording_state")
SESSION_AGENT_ID=$(json_get_first ".data.agentId" ".data.agent_id")
if [[ "$SESSION_RECORDING_STATE" != "pending" ]]; then
  log_fail "Expected session recordingState=pending, got ${SESSION_RECORDING_STATE:-<empty>}"
  exit 1
fi
if [[ "$SESSION_AGENT_ID" != "$AGENT_ID" ]]; then
  log_fail "Expected session agentId=${AGENT_ID}, got ${SESSION_AGENT_ID:-<empty>}"
  exit 1
fi
assert_json_array_contains ".data.flags" "recording_pending"
save_evidence "$SCENARIO" "callcenter" "recordingStateBeforeOrder" "$SESSION_RECORDING_STATE"
log_ok "Session starts at recording_pending"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Phone order from the active call
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Callcenter — create phone order"

jq \
  --arg callId "$CALL_ID" \
  --arg agentId "$AGENT_ID" \
  '.callId = $callId | .agentId = $agentId' \
  "${SCRIPT_DIR}/fixtures/e2e-phone-booking.json" > "$PHONE_ORDER_FIXTURE"

log_step "2.1 — POST /call-center/orders"
http_call POST "/call-center/orders" "$PHONE_ORDER_FIXTURE"
assert_status "200|201"

ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
ORDER_STATUS=$(json_get ".data.status")
ORDER_CALL_ID=$(json_get_first ".data.callId" ".data.call_id")
require_non_empty "$ORDER_ID" "orderId"
if [[ "$ORDER_STATUS" != "recording_pending" ]]; then
  log_fail "Expected phone order status=recording_pending, got ${ORDER_STATUS:-<empty>}"
  exit 1
fi
if [[ "$ORDER_CALL_ID" != "$CALL_ID" ]]; then
  log_fail "Expected phone order callId=${CALL_ID}, got ${ORDER_CALL_ID:-<empty>}"
  exit 1
fi
chain_set "callcenter" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "callcenter" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "callcenter" "orderStatusAfterCreate" "$ORDER_STATUS"
log_ok "Phone order created: orderId=${ORDER_ID}, status=${ORDER_STATUS}"

log_step "2.2 — GET /orders/:orderId"
http_call GET "/orders/${ORDER_ID}"
assert_status "200"
ORDER_SOURCE=$(json_get_first ".data.orderSource" ".data.order_source")
ORDER_RECORDING_ID=$(json_get_first ".data.recordingId" ".data.recording_id")
if [[ "$ORDER_SOURCE" != "phone" ]]; then
  log_fail "Expected orderSource=phone, got ${ORDER_SOURCE:-<empty>}"
  exit 1
fi
if [[ -n "$ORDER_RECORDING_ID" && "$ORDER_RECORDING_ID" != "null" ]]; then
  log_fail "Expected no recordingId before callback, got ${ORDER_RECORDING_ID}"
  exit 1
fi
assert_json_array_contains '(.data.complianceFlags // .data.compliance_flags)' "recording_pending"
log_ok "Phone order stays recording_pending before callback"

log_step "2.3 — GET /callcenter/sessions/:callId (linked order continuity)"
http_call GET "/callcenter/sessions/${CALL_ID}"
assert_status "200"
LINKED_ORDER_ID=$(json_get_first ".data.linkedOrderId" ".data.linked_order_id")
if [[ "$LINKED_ORDER_ID" != "$ORDER_ID" ]]; then
  log_fail "Expected linkedOrderId=${ORDER_ID}, got ${LINKED_ORDER_ID:-<empty>}"
  exit 1
fi
log_ok "Call session linkedOrderId=${LINKED_ORDER_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Recording callback resolves pending state
# ══════════════════════════════════════════════════════════════════════════════
log_surface "CTI callback — bind recording"

jq -n \
  --arg recordingId "$CALLBACK_RECORDING_ID" \
  --arg providerRecordingRef "$CALLBACK_PROVIDER_REF" \
  --arg recordingUrl "$CALLBACK_RECORDING_URL" \
  --arg startedAt "$NOW_TS" \
  --arg endedAt "$NOW_TS" \
  --arg agentId "$AGENT_ID" \
  '{
    recordingId: $recordingId,
    providerRecordingRef: $providerRecordingRef,
    recordingUrl: $recordingUrl,
    startedAt: $startedAt,
    endedAt: $endedAt,
    agentId: $agentId
  }' > "$CALLBACK_FIXTURE"

log_step "3.1 — POST /callcenter/sessions/:callId/recording-callback"
http_call POST "/callcenter/sessions/${CALL_ID}/recording-callback" "$CALLBACK_FIXTURE"
assert_status "200|201"
BOUND_RECORDING_ID=$(json_get_first ".data.recordingId" ".data.recording_id")
if [[ "$BOUND_RECORDING_ID" != "$CALLBACK_RECORDING_ID" ]]; then
  log_fail "Expected callback recordingId=${CALLBACK_RECORDING_ID}, got ${BOUND_RECORDING_ID:-<empty>}"
  exit 1
fi
chain_set "callcenter" "recordingId" "$CALLBACK_RECORDING_ID"
save_evidence "$SCENARIO" "callcenter" "recordingId" "$CALLBACK_RECORDING_ID"
log_ok "Recording callback bound recordingId=${CALLBACK_RECORDING_ID}"

log_step "3.2 — GET /callcenter/sessions/:callId (recording state ready)"
http_call GET "/callcenter/sessions/${CALL_ID}"
assert_status "200"
SESSION_RECORDING_STATE=$(json_get_first ".data.recordingState" ".data.recording_state")
SESSION_RECORDING_ID=$(json_get_first ".data.recordingId" ".data.recording_id")
if [[ "$SESSION_RECORDING_STATE" != "ready" ]]; then
  log_fail "Expected session recordingState=ready, got ${SESSION_RECORDING_STATE:-<empty>}"
  exit 1
fi
if [[ "$SESSION_RECORDING_ID" != "$CALLBACK_RECORDING_ID" ]]; then
  log_fail "Expected session recordingId=${CALLBACK_RECORDING_ID}, got ${SESSION_RECORDING_ID:-<empty>}"
  exit 1
fi
assert_json_array_contains ".data.flags" "recording_bound"
log_ok "Call session recording gate cleared"

log_step "3.3 — GET /orders/:orderId (dispatch-ready after callback)"
http_call GET "/orders/${ORDER_ID}"
assert_status "200"
ORDER_STATUS=$(json_get ".data.status")
ORDER_RECORDING_ID=$(json_get_first ".data.recordingId" ".data.recording_id")
if [[ "$ORDER_STATUS" != "ready_for_dispatch" ]]; then
  log_fail "Expected order status=ready_for_dispatch, got ${ORDER_STATUS:-<empty>}"
  exit 1
fi
if [[ "$ORDER_RECORDING_ID" != "$CALLBACK_RECORDING_ID" ]]; then
  log_fail "Expected order recordingId=${CALLBACK_RECORDING_ID}, got ${ORDER_RECORDING_ID:-<empty>}"
  exit 1
fi
assert_json_array_contains '(.data.complianceFlags // .data.compliance_flags)' "recording_bound"
log_ok "Phone order advanced to ready_for_dispatch"

log_step "3.4 — GET /orders/:orderId/dispatch-trace"
http_call GET "/orders/${ORDER_ID}/dispatch-trace"
assert_status "200"
TRACE_CREATED=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select((.eventType // .event_type) == "callcenter.order_created") | (.eventType // .event_type)' \
  2>/dev/null | head -1 || true)
TRACE_BOUND=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select((.eventType // .event_type) == "callcenter.recording_bound") | (.eventType // .event_type)' \
  2>/dev/null | head -1 || true)
if [[ "$TRACE_CREATED" != "callcenter.order_created" || "$TRACE_BOUND" != "callcenter.recording_bound" ]]; then
  log_fail "Dispatch trace did not preserve callcenter order_created/recording_bound chain."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
log_ok "Dispatch trace contains order_created + recording_bound events"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Reporting export
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Reporting — dispatch recording index export"

jq \
  --arg month "$REPORT_MONTH" \
  '.jobType = "dispatch_recording_index" | .filters.month = $month' \
  "${SCRIPT_DIR}/fixtures/e2e-report-compliance.json" > "$REPORT_FIXTURE"

log_step "4.1 — POST /reports/jobs"
http_call POST "/reports/jobs" "$REPORT_FIXTURE"
assert_status "200|201"
REPORT_JOB_ID=$(json_get_first ".data.jobId" ".data.job_id")
require_non_empty "$REPORT_JOB_ID" "reportJobId"
chain_set "reporting" "reportJobId" "$REPORT_JOB_ID"
save_evidence "$SCENARIO" "reporting" "reportJobId" "$REPORT_JOB_ID"
log_ok "Report job queued: jobId=${REPORT_JOB_ID}"

log_step "4.2 — GET /reports/:jobId (poll until completed)"
poll_until_field "/reports/${REPORT_JOB_ID}" "status" "completed"
http_call GET "/reports/${REPORT_JOB_ID}"
assert_status "200"

REPORT_ARTIFACT_ID=$(json_get_first ".data.artifact.artifactId" ".data.artifact.artifact_id")
REPORT_DOWNLOAD_KIND=$(json_get_first ".data.artifact.downloadMetadata.kind" ".data.artifact.download_metadata.kind")
REPORT_EVIDENCE_FAMILY=$(json_get_first ".data.evidenceGovernance.family" ".data.evidence_governance.family")
ORDER_ROW_JSON=$(echo "$RESP_BODY" | jq -c --arg orderId "$ORDER_ID" \
  '.data.rows[] | select((.orderId // .order_id) == $orderId)' 2>/dev/null | head -1 || true)
require_non_empty "$REPORT_ARTIFACT_ID" "reportArtifactId"
require_non_empty "$ORDER_ROW_JSON" "dispatch recording index row"
if [[ "$REPORT_DOWNLOAD_KIND" != "report" ]]; then
  log_fail "Expected report downloadMetadata.kind=report, got ${REPORT_DOWNLOAD_KIND:-<empty>}"
  exit 1
fi
if [[ "$REPORT_EVIDENCE_FAMILY" != "report_artifact" ]]; then
  log_fail "Expected evidenceGovernance.family=report_artifact, got ${REPORT_EVIDENCE_FAMILY:-<empty>}"
  exit 1
fi

ROW_CALL_ID=$(echo "$ORDER_ROW_JSON" | jq -r '(.callId // .call_id) // empty')
ROW_RECORDING_ID=$(echo "$ORDER_ROW_JSON" | jq -r '(.recordingId // .recording_id) // empty')
ROW_MISSING_RECORDING=$(echo "$ORDER_ROW_JSON" | jq -r '
  if has("missingRecording") then .missingRecording
  elif has("missing_recording") then .missing_recording
  else empty
  end
')
EXPECTED_MASKED_CALL_ID="$(mask_token "$CALL_ID")"
EXPECTED_MASKED_RECORDING_ID="$(mask_token "$CALLBACK_RECORDING_ID")"
if [[ "$ROW_CALL_ID" != "$EXPECTED_MASKED_CALL_ID" ]]; then
  log_fail "Expected masked callId=${EXPECTED_MASKED_CALL_ID}, got ${ROW_CALL_ID:-<empty>}"
  exit 1
fi
if [[ "$ROW_RECORDING_ID" != "$EXPECTED_MASKED_RECORDING_ID" ]]; then
  log_fail "Expected masked recordingId=${EXPECTED_MASKED_RECORDING_ID}, got ${ROW_RECORDING_ID:-<empty>}"
  exit 1
fi
if [[ "$ROW_MISSING_RECORDING" != "false" ]]; then
  log_fail "Expected missingRecording=false, got ${ROW_MISSING_RECORDING:-<empty>}"
  exit 1
fi
save_evidence "$SCENARIO" "reporting" "reportArtifactId" "$REPORT_ARTIFACT_ID"
log_ok "Recording index export contains masked call/recording references"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 5 — Filing package
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Reporting — filing package generation"

jq -n \
  --arg month "$REPORT_MONTH" \
  '{
    packageType: "monthly_report",
    scope: {
      month: $month,
      source: "phone_recording_filing_e2e"
    }
  }' > "$PACKAGE_FIXTURE"

log_step "5.1 — POST /filing-packages/generate"
http_call POST "/filing-packages/generate" "$PACKAGE_FIXTURE"
assert_status "200|201"
PACKAGE_ID=$(json_get_first ".data.packageId" ".data.package_id")
require_non_empty "$PACKAGE_ID" "packageId"
chain_set "reporting" "packageId" "$PACKAGE_ID"
save_evidence "$SCENARIO" "reporting" "packageId" "$PACKAGE_ID"
log_ok "Filing package queued: packageId=${PACKAGE_ID}"

log_step "5.2 — GET /filing-packages/:packageId (poll until completed)"
poll_until_field "/filing-packages/${PACKAGE_ID}" "status" "completed"
http_call GET "/filing-packages/${PACKAGE_ID}"
assert_status "200"
PACKAGE_IMMUTABLE=$(json_get ".data.immutable")
PACKAGE_MANIFEST_HASH=$(json_get_first ".data.manifestHash" ".data.manifest_hash")
PACKAGE_ENTRY_COUNT=$(json_get_first ".data.manifest.entryCount" ".data.manifest.entry_count")
PACKAGE_ZIP_KIND=$(json_get_first ".data.downloadMetadata.zip.kind" ".data.download_metadata.zip.kind")
PACKAGE_PDF_KIND=$(json_get_first ".data.downloadMetadata.pdf.kind" ".data.download_metadata.pdf.kind")
PACKAGE_EVIDENCE_FAMILY=$(json_get_first ".data.evidenceGovernance.family" ".data.evidence_governance.family")
if [[ "$PACKAGE_IMMUTABLE" != "true" ]]; then
  log_fail "Expected filing package immutable=true, got ${PACKAGE_IMMUTABLE:-<empty>}"
  exit 1
fi
require_non_empty "$PACKAGE_MANIFEST_HASH" "package manifestHash"
if [[ -z "$PACKAGE_ENTRY_COUNT" || "$PACKAGE_ENTRY_COUNT" == "0" ]]; then
  log_fail "Expected filing package manifest.entryCount > 0"
  exit 1
fi
if [[ "$PACKAGE_ZIP_KIND" != "filing-zip" || "$PACKAGE_PDF_KIND" != "filing-pdf" ]]; then
  log_fail "Expected filing package signed download kinds filing-zip / filing-pdf"
  exit 1
fi
if [[ "$PACKAGE_EVIDENCE_FAMILY" != "filing_package" ]]; then
  log_fail "Expected evidenceGovernance.family=filing_package, got ${PACKAGE_EVIDENCE_FAMILY:-<empty>}"
  exit 1
fi
save_evidence "$SCENARIO" "reporting" "packageManifestHash" "$PACKAGE_MANIFEST_HASH"
log_ok "Filing package completed with immutable manifest + signed downloads"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 6 — Retention metadata
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Audit governance — retention metadata"

log_step "6.1 — GET /audit/evidence-policies/report_artifact"
http_call GET "/audit/evidence-policies/report_artifact"
assert_status "200"
REPORT_RETENTION_HOT=$(json_get_first ".data.hotRetentionDays" ".data.hot_retention_days")
REPORT_RETENTION_ARCHIVE=$(json_get_first ".data.archiveRetentionDays" ".data.archive_retention_days")
REPORT_AUDIT_ACTION=$(json_get_first ".data.auditAction" ".data.audit_action")
if [[ "$REPORT_RETENTION_HOT" != "30" || "$REPORT_RETENTION_ARCHIVE" != "365" ]]; then
  log_fail "Unexpected report_artifact retention policy: hot=${REPORT_RETENTION_HOT:-<empty>} archive=${REPORT_RETENTION_ARCHIVE:-<empty>}"
  exit 1
fi
if [[ "$REPORT_AUDIT_ACTION" != "issue_report_artifact_download" ]]; then
  log_fail "Unexpected report_artifact auditAction=${REPORT_AUDIT_ACTION:-<empty>}"
  exit 1
fi
save_evidence "$SCENARIO" "audit" "reportArtifactRetention" "${REPORT_RETENTION_HOT}/${REPORT_RETENTION_ARCHIVE}"
log_ok "Report artifact retention metadata is readable"

log_step "6.2 — GET /audit/evidence-policies/filing_package"
http_call GET "/audit/evidence-policies/filing_package"
assert_status "200"
PACKAGE_RETENTION_HOT=$(json_get_first ".data.hotRetentionDays" ".data.hot_retention_days")
PACKAGE_RETENTION_ARCHIVE=$(json_get_first ".data.archiveRetentionDays" ".data.archive_retention_days")
PACKAGE_AUDIT_ACTION=$(json_get_first ".data.auditAction" ".data.audit_action")
if [[ "$PACKAGE_RETENTION_HOT" != "90" || "$PACKAGE_RETENTION_ARCHIVE" != "2555" ]]; then
  log_fail "Unexpected filing_package retention policy: hot=${PACKAGE_RETENTION_HOT:-<empty>} archive=${PACKAGE_RETENTION_ARCHIVE:-<empty>}"
  exit 1
fi
if [[ "$PACKAGE_AUDIT_ACTION" != "issue_filing_package_download" ]]; then
  log_fail "Unexpected filing_package auditAction=${PACKAGE_AUDIT_ACTION:-<empty>}"
  exit 1
fi
save_evidence "$SCENARIO" "audit" "filingPackageRetention" "${PACKAGE_RETENTION_HOT}/${PACKAGE_RETENTION_ARCHIVE}"
log_ok "Filing package retention metadata is readable"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 7 — Permissioned download audit
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Audit log — permissioned artifact issuance"

log_step "7.1 — GET /audit"
http_call GET "/audit"
assert_status "200"
REPORT_ISSUED=$(echo "$RESP_BODY" | jq -r --arg jobId "$REPORT_JOB_ID" \
  '.data.items[] | select((.actionName // .action_name) == "issue_report_artifact_download" and ((.newValuesSummary.jobId // .new_values_summary.job_id // "") == $jobId)) | (.actionName // .action_name)' \
  2>/dev/null | head -1 || true)
PACKAGE_ISSUED=$(echo "$RESP_BODY" | jq -r --arg packageId "$PACKAGE_ID" \
  '.data.items[] | select((.actionName // .action_name) == "issue_filing_package_download" and ((.newValuesSummary.packageId // .new_values_summary.package_id // "") == $packageId)) | (.actionName // .action_name)' \
  2>/dev/null | head -1 || true)
if [[ "$REPORT_ISSUED" != "issue_report_artifact_download" ]]; then
  log_fail "Audit log missing issue_report_artifact_download for jobId=${REPORT_JOB_ID}"
  exit 1
fi
if [[ "$PACKAGE_ISSUED" != "issue_filing_package_download" ]]; then
  log_fail "Audit log missing issue_filing_package_download for packageId=${PACKAGE_ID}"
  exit 1
fi
save_evidence "$SCENARIO" "audit" "reportArtifactAudit" "$REPORT_ISSUED"
save_evidence "$SCENARIO" "audit" "filingPackageAudit" "$PACKAGE_ISSUED"
log_ok "Permissioned artifact issuance is audited"

log_step "Chain continuity assertions"
assert_chain "callcenter" "callId"
assert_chain "callcenter" "orderId"
assert_chain "callcenter" "recordingId"
assert_chain "reporting" "reportJobId"
assert_chain "reporting" "packageId"

print_chain_summary

echo ""
log_ok "E2E-003 complete — phone recording filing chain passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
