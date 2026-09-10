#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/operations/database/db-common.sh"
ensure_database_url

run_psql_file "${ROOT_DIR}/operations/database/voice-runtime-integrity-check.sql"

echo "[done] voice runtime integrity check complete (read-only; see report above for any rows needing remediation)"
