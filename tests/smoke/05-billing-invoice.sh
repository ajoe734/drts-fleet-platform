#!/usr/bin/env bash
# Smoke test 05 — Billing invoice
# Generates a tenant invoice and verifies it can be retrieved.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "05 — Billing invoice"

# ── 1. Build period fixture (previous calendar month — closed period) ─────────
# Billing engine requires a closed period (past month); current month is open and
# will be rejected by the staging billing engine with a validation error.
PERIOD_START=$(date -u -d "$(date -u +%Y-%m-01) -1 month" +"%Y-%m-01T00:00:00Z" 2>/dev/null \
  || date -u -v-1m -v1d +"%Y-%m-01T00:00:00Z")
# Last day of previous month = one second before this month's 1st
PERIOD_END=$(date -u -d "$(date -u +%Y-%m-01) -1 second" +"%Y-%m-%dT23:59:59Z" 2>/dev/null \
  || date -u -v-1d -v+1m -v1d -v-1d +"%Y-%m-%dT23:59:59Z")

FIXTURE_TMP=$(mktemp /tmp/drts-smoke-invoice-XXXXXX.json)
trap 'rm -f "$FIXTURE_TMP"' EXIT

jq \
  --arg tid "$SMOKE_TENANT_ID" \
  --arg ps  "$PERIOD_START"   \
  --arg pe  "$PERIOD_END"     \
  '.tenantId = $tid | .periodStart = $ps | .periodEnd = $pe' \
  "${SCRIPT_DIR}/fixtures/billing-invoice.json" > "$FIXTURE_TMP"

# ── 2. Generate invoice ────────────────────────────────────────────────────────
http_call POST "/tenant/invoices/generate" "$FIXTURE_TMP"
assert_status "200|201"

INVOICE_ID=$(json_get ".data.invoiceId")
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
