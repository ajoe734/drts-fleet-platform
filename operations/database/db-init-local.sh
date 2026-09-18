#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/operations/database/db-common.sh"

ensure_database_url
"${ROOT_DIR}/operations/database/db-apply.sh"
"${ROOT_DIR}/operations/database/db-seed.sh" reference
"${ROOT_DIR}/operations/database/db-seed.sh" demo
"${ROOT_DIR}/operations/database/db-verify.sh"

echo "[done] local Phase 1 database initialized from repo canonical migrations and seeds"
