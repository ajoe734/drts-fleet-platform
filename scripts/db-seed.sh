#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEEDS_DIR="${ROOT_DIR}/infra/seeds"
SEED_TARGET="${1:-all}"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/scripts/db-common.sh"
ensure_database_url

run_seed() {
  local file="$1"
  local seed_name
  seed_name="$(basename "$file" .sql)"
  local checksum
  checksum="$(sha256sum "$file" | awk '{print $1}')"

  local applied
  applied="$(run_psql -tAc "SELECT 1 FROM admin.seed_runs WHERE seed_name = '${seed_name}' LIMIT 1;" | tr -d '[:space:]')"
  if [[ "$applied" == "1" ]]; then
    echo "[skip] ${seed_name} already loaded"
    return 0
  fi

  echo "[seed] $(basename "$file")"
  run_psql_file "$file"
  run_psql <<SQL
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

echo "[done] seeds loaded from infra/seeds"
