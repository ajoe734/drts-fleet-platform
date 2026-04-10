#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

SEED_TARGET="${1:-all}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEEDS_DIR="${ROOT_DIR}/seeds"

run_seed() {
  local file="$1"
  local seed_name
  seed_name="$(basename "$file" .sql)"
  local checksum
  checksum="$(sha256sum "$file" | awk '{print $1}')"

  local applied
  applied="$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM admin.seed_runs WHERE seed_name = '${seed_name}' LIMIT 1;" | tr -d '[:space:]')"
  if [[ "$applied" == "1" ]]; then
    echo "[skip] ${seed_name} already loaded"
    return 0
  fi

  echo "[seed] $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO admin.seed_runs(seed_name, file_name, checksum)
VALUES ('${seed_name}', '$(basename "$file")', '${checksum}')
ON CONFLICT (seed_name) DO NOTHING;
SQL
}

case "$SEED_TARGET" in
  reference)
    run_seed "${SEEDS_DIR}/S0001__reference_seed.sql"
    ;;
  demo)
    run_seed "${SEEDS_DIR}/S0002__demo_operational_seed.sql"
    ;;
  all)
    run_seed "${SEEDS_DIR}/S0001__reference_seed.sql"
    run_seed "${SEEDS_DIR}/S0002__demo_operational_seed.sql"
    ;;
  *)
    echo "Usage: $0 [reference|demo|all]"
    exit 1
    ;;
esac

echo "[done] seeds loaded"
