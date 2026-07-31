#!/usr/bin/env bash
# Smoke test 05 — Billing invoice
# Generates a tenant invoice and verifies it can be retrieved.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "05 — Billing invoice"

# ── 1. Build a closed period fixture anchored to the current month ────────────
# Repo-local smoke should be self-contained: it creates the dispatch in 02–04,
# then closes and invoices that trip here. The billing service only requires
# periodEnd < now, so use "month start → one minute ago" instead of assuming
# historical completed trips already exist for the prior month.
PERIOD_START=$(date -u +"%Y-%m-01T00:00:00Z")
PERIOD_END=$(date -u -d "@$(( $(date -u +%s) - 60 ))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -r "$(( $(date -u +%s) - 60 ))" +"%Y-%m-%dT%H:%M:%SZ")

TASK_ID=$(state_get "taskId")
if [[ -z "$TASK_ID" ]]; then
  http_call GET "/driver/tasks"
  assert_status "200"
  TASK_ID=$(json_get_first ".data.items[0].taskId" ".data.items[0].task_id")
fi

if [[ -z "$TASK_ID" ]]; then
  log_fail "Billing smoke requires a driver task from suites 03–04, but none was found."
  exit 1
fi

log_info "Closing taskId=${TASK_ID} to produce an invoice-eligible trip"

TMP_DIR=$(mktemp -d /tmp/drts-smoke-billing-XXXXXX)
trap 'rm -rf "$TMP_DIR" "$FIXTURE_TMP"' EXIT

DEPARTED_AT=$(date -u -d "@$(( $(date -u +%s) - 50 ))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -r "$(( $(date -u +%s) - 50 ))" +"%Y-%m-%dT%H:%M:%SZ")
ARRIVED_AT=$(date -u -d "@$(( $(date -u +%s) - 40 ))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -r "$(( $(date -u +%s) - 40 ))" +"%Y-%m-%dT%H:%M:%SZ")
STARTED_AT=$(date -u -d "@$(( $(date -u +%s) - 30 ))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -r "$(( $(date -u +%s) - 30 ))" +"%Y-%m-%dT%H:%M:%SZ")
COMPLETED_AT=$(date -u -d "@$(( $(date -u +%s) - 20 ))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -r "$(( $(date -u +%s) - 20 ))" +"%Y-%m-%dT%H:%M:%SZ")

jq --arg ts "$DEPARTED_AT" '.departedAt = $ts' \
  "${SCRIPT_DIR}/../e2e/fixtures/e2e-driver-depart.json" > "${TMP_DIR}/depart.json"
http_call POST "/driver/tasks/${TASK_ID}/depart" "${TMP_DIR}/depart.json"
assert_status "200|201"

jq --arg ts "$ARRIVED_AT" '.arrivedAt = $ts' \
  "${SCRIPT_DIR}/../e2e/fixtures/e2e-driver-arrived-pickup.json" > "${TMP_DIR}/arrived.json"
http_call POST "/driver/tasks/${TASK_ID}/arrived_pickup" "${TMP_DIR}/arrived.json"
assert_status "200|201"

jq --arg ts "$STARTED_AT" '.startedAt = $ts' \
  "${SCRIPT_DIR}/../e2e/fixtures/e2e-driver-start.json" > "${TMP_DIR}/start.json"
http_call POST "/driver/tasks/${TASK_ID}/start" "${TMP_DIR}/start.json"
assert_status "200|201"

jq --arg ts "$COMPLETED_AT" '.completedAt = $ts' \
  "${SCRIPT_DIR}/../e2e/fixtures/e2e-driver-complete.json" > "${TMP_DIR}/complete.json"
http_call POST "/driver/tasks/${TASK_ID}/complete" "${TMP_DIR}/complete.json"
assert_status "200|201"
log_ok "POST /driver/tasks/${TASK_ID}/complete → HTTP ${RESP_STATUS}, completedAt=${COMPLETED_AT}"

FIXTURE_TMP=$(mktemp /tmp/drts-smoke-invoice-XXXXXX.json)

jq \
  --arg tid "$SMOKE_TENANT_ID" \
  --arg ps  "$PERIOD_START"   \
  --arg pe  "$PERIOD_END"     \
  '.tenantId = $tid | .periodStart = $ps | .periodEnd = $pe' \
  "${SCRIPT_DIR}/fixtures/billing-invoice.json" > "$FIXTURE_TMP"

# ── 2. Generate invoice ────────────────────────────────────────────────────────
http_call POST "/tenant/invoices/generate" "$FIXTURE_TMP"
assert_status "200|201"

INVOICE_ID=$(json_get_first ".data.invoiceId" ".data.invoice_id")
if [[ -z "$INVOICE_ID" ]]; then
  log_fail "No invoiceId in response: ${RESP_BODY}"
  exit 1
fi

state_set "invoiceId" "$INVOICE_ID"
log_ok "POST /tenant/invoices/generate → HTTP ${RESP_STATUS}, invoiceId=${INVOICE_ID}"

# ── 3. Retrieve invoice ────────────────────────────────────────────────────────
http_call GET "/tenant/invoices/${INVOICE_ID}"
assert_status "200"
log_ok "GET /tenant/invoices/${INVOICE_ID} → HTTP 200"

# ── 4. List invoices sanity check ─────────────────────────────────────────────
http_call GET "/tenant/invoices"
assert_status "200"
COUNT=$(json_get ".data.items | length")
log_ok "GET /tenant/invoices → HTTP 200, total=${COUNT:-0} invoice(s)"
