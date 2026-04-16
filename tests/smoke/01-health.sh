#!/usr/bin/env bash
# Smoke test 01 — API health check
# Verifies the API is reachable at /api/health and returns { status: "ok" }.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "01 — Health check"

http_call GET "/health"
assert_status "200"

STATUS=$(json_get ".status")
if [[ "$STATUS" != "ok" ]]; then
  log_fail "Expected status=ok, got: ${STATUS}"
  exit 1
fi

log_ok "GET /api/health → HTTP 200, status=${STATUS}"
