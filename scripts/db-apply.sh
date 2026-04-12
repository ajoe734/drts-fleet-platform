#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/infra/migrations"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/scripts/db-common.sh"
ensure_database_url

table_exists() {
  run_psql -tAc "SELECT to_regclass('admin.schema_migrations') IS NOT NULL;" | tr -d '[:space:]'
}

for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name 'V*.sql' | sort); do
  filename="$(basename "$file")"
  version="${filename%%__*}"
  if [[ "$(table_exists)" == "t" ]]; then
    applied="$(run_psql -tAc "SELECT 1 FROM admin.schema_migrations WHERE version = '${version}' LIMIT 1;" | tr -d '[:space:]')"
    if [[ "$applied" == "1" ]]; then
      echo "[skip] $version already applied"
      continue
    fi
  fi

  echo "[apply] $(basename "$file")"
  run_psql_file "$file"

  if [[ "$(table_exists)" == "t" ]]; then
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    run_psql <<SQL
INSERT INTO admin.schema_migrations(version, file_name, checksum)
VALUES ('${version}', '${filename}', '${checksum}')
ON CONFLICT (version) DO NOTHING;
SQL
  fi
done

echo "[done] migrations applied from infra/migrations"
