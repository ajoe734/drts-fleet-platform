#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  DB_NAME="${DB_NAME:-phase1_dev}"
  export DATABASE_URL="postgresql://localhost:5432/${DB_NAME}"
  echo "[info] DATABASE_URL not set; defaulting to ${DATABASE_URL}"
fi

if command -v createdb >/dev/null 2>&1; then
  DB_NAME="$(python3 - <<'PY'
import os, urllib.parse
url = os.environ['DATABASE_URL']
parsed = urllib.parse.urlparse(url)
print(parsed.path.lstrip('/'))
PY
)"
  createdb "$DB_NAME" >/dev/null 2>&1 || true
fi

"${ROOT_DIR}/scripts/apply_migrations.sh"
"${ROOT_DIR}/scripts/load_seeds.sh" reference
"${ROOT_DIR}/scripts/load_seeds.sh" demo
"${ROOT_DIR}/scripts/verify_schema.sh"

echo "[done] local Phase 1 DB initialized"
