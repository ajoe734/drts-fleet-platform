#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required, e.g. postgresql://localhost:5432/phase1_dev"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/migrations"

table_exists() {
  psql "$DATABASE_URL" -tAc "SELECT to_regclass('admin.schema_migrations') IS NOT NULL;" | tr -d '[:space:]'
}

for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name 'V*.sql' | sort); do
  version="$(basename "$file" | cut -d'__' -f1)"
  if [[ "$(table_exists)" == "t" ]]; then
    applied="$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM admin.schema_migrations WHERE version = '${version}' LIMIT 1;" | tr -d '[:space:]')"
    if [[ "$applied" == "1" ]]; then
      echo "[skip] $version already applied"
      continue
    fi
  fi

  echo "[apply] $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"

  if [[ "$(table_exists)" == "t" ]]; then
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    filename="$(basename "$file")"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO admin.schema_migrations(version, file_name, checksum)
VALUES ('${version}', '${filename}', '${checksum}')
ON CONFLICT (version) DO NOTHING;
SQL
  fi
done

echo "[done] migrations applied"
