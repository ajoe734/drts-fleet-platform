#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/infra/migrations"
CURRENT_FILE=""
CURRENT_VERSION=""
LAST_ERROR=""

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/scripts/db-common.sh"
ensure_database_url

on_error() {
  local status=$?
  local message
  if [[ -n "${CURRENT_FILE:-}" ]]; then
    message="[error] migration failed while applying ${CURRENT_VERSION} (${CURRENT_FILE})"
  else
    message="[error] migration runner exited before completing the current migration batch"
  fi
  if [[ -n "${LAST_ERROR:-}" ]]; then
    message="${message}: ${LAST_ERROR}"
  fi
  echo "$message" >&2
  if [[ -w /dev/termination-log ]]; then
    printf '%s\n' "$message" > /dev/termination-log || true
  fi
  exit "$status"
}

trap on_error ERR

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

  CURRENT_FILE="$filename"
  CURRENT_VERSION="$version"
  LAST_ERROR=""
  echo "[apply] $(basename "$file")"
  migration_stderr="$(mktemp)"
  if ! run_psql_file "$file" 2> >(tee "$migration_stderr" >&2); then
    LAST_ERROR="$(tail -n 20 "$migration_stderr" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-1500)"
    rm -f "$migration_stderr"
    false
  fi
  rm -f "$migration_stderr"
  echo "[ok] $(basename "$file")"
  CURRENT_FILE=""
  CURRENT_VERSION=""

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
