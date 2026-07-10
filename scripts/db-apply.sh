#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/infra/migrations"
MIGRATION_METADATA_FILE=""
CURRENT_FILE=""
CURRENT_VERSION=""
LAST_ERROR=""
CURRENT_EXIT_CODE=""

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
  if [[ -n "${CURRENT_EXIT_CODE:-}" ]]; then
    exit "$CURRENT_EXIT_CODE"
  fi
  exit "$status"
}

trap on_error ERR

cleanup() {
  if [[ -n "${MIGRATION_METADATA_FILE:-}" && -f "${MIGRATION_METADATA_FILE}" ]]; then
    rm -f "${MIGRATION_METADATA_FILE}"
  fi
}

trap cleanup EXIT

sql_escape_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

load_migration_metadata() {
  MIGRATION_METADATA_FILE="$(mktemp)"
  for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name 'V*.sql' | sort); do
    local filename version checksum
    filename="$(basename "$file")"
    version="${filename%%__*}"
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    printf '%s\t%s\t%s\n' "$version" "$filename" "$checksum" >>"$MIGRATION_METADATA_FILE"
  done
}

current_migration_exists() {
  local filename="$1"
  awk -F '\t' -v filename="$filename" '$2 == filename { found = 1; exit } END { exit(found ? 0 : 1) }' \
    "$MIGRATION_METADATA_FILE"
}

find_current_migration_by_signature() {
  local file_name="$1"
  local checksum="$2"
  local exclude_version="${3:-}"
  awk -F '\t' \
    -v file_name="$file_name" \
    -v checksum="$checksum" \
    -v exclude_version="$exclude_version" \
    '($1 != exclude_version) && ($2 == file_name || $3 == checksum) { print; exit }' \
    "$MIGRATION_METADATA_FILE"
}

query_migration_record() {
  local sql="$1"
  local attempt output
  for attempt in $(seq 1 5); do
    if output="$(run_psql -F $'\t' -Atc "$sql" 2>/dev/null)"; then
      printf '%s' "$output"
      return 0
    fi
    sleep 1
  done
  LAST_ERROR="admin.schema_migrations was not queryable after applying ${CURRENT_VERSION:-unknown}"
  return 1
}

table_exists() {
  local attempt output
  for attempt in $(seq 1 5); do
    if output="$(run_psql -tAc "SELECT to_regclass('admin.schema_migrations') IS NOT NULL;" 2>/dev/null)"; then
      printf '%s' "$output" | tr -d '[:space:]'
      return 0
    fi
    sleep 1
  done
  return 1
}

migration_record_by_version() {
  local version="$1"
  query_migration_record \
    "SELECT version, file_name, checksum
     FROM admin.schema_migrations
     WHERE version = '$(sql_escape_literal "$version")'
     LIMIT 1;"
}

migration_record_by_signature() {
  local file_name="$1"
  local checksum="$2"
  query_migration_record \
    "SELECT version, file_name, checksum
     FROM admin.schema_migrations
     WHERE file_name = '$(sql_escape_literal "$file_name")'
        OR checksum = '$(sql_escape_literal "$checksum")'
     ORDER BY
       CASE
         WHEN file_name = '$(sql_escape_literal "$file_name")' THEN 0
         WHEN checksum = '$(sql_escape_literal "$checksum")' THEN 1
         ELSE 2
       END,
       applied_at DESC
     LIMIT 1;"
}

canonicalize_migration_record() {
  local source_version="$1"
  local target_version="$2"
  local file_name="$3"
  local checksum="$4"
  run_psql <<SQL
UPDATE admin.schema_migrations
SET version = '$(sql_escape_literal "$target_version")',
    file_name = '$(sql_escape_literal "$file_name")',
    checksum = '$(sql_escape_literal "$checksum")',
    applied_at = now()
WHERE version = '$(sql_escape_literal "$source_version")';
SQL
}

persist_migration_record() {
  local version="$1"
  local file_name="$2"
  local checksum="$3"
  run_psql <<SQL
INSERT INTO admin.schema_migrations(version, file_name, checksum)
VALUES (
  '$(sql_escape_literal "$version")',
  '$(sql_escape_literal "$file_name")',
  '$(sql_escape_literal "$checksum")'
)
ON CONFLICT (version) DO UPDATE SET
  file_name = EXCLUDED.file_name,
  checksum = EXCLUDED.checksum,
  applied_at = now();
SQL
}

ordinal=10
load_migration_metadata

for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name 'V*.sql' | sort); do
  ordinal=$((ordinal + 1))
  filename="$(basename "$file")"
  version="${filename%%__*}"
  checksum="$(sha256sum "$file" | awk '{print $1}')"
  if [[ "$(table_exists || true)" == "t" ]]; then
    exact_record="$(migration_record_by_version "$version")" || false
    if [[ -n "$exact_record" ]]; then
      IFS=$'\t' read -r exact_version exact_file_name exact_checksum <<<"$exact_record"
      if [[ "$exact_file_name" == "$filename" && "$exact_checksum" == "$checksum" ]]; then
        echo "[skip] $version already applied"
        continue
      fi

      canonical_record="$(find_current_migration_by_signature "$exact_file_name" "$exact_checksum" "$version")"
      if [[ -n "$canonical_record" ]]; then
        IFS=$'\t' read -r canonical_version canonical_file_name canonical_checksum <<<"$canonical_record"
        if [[ -z "$(migration_record_by_version "$canonical_version" || true)" ]]; then
          canonicalize_migration_record \
            "$exact_version" \
            "$canonical_version" \
            "$canonical_file_name" \
            "$canonical_checksum"
          exact_record=""
        fi
      fi
    fi

    applied_record="$(migration_record_by_signature "$filename" "$checksum")" || false
    if [[ -n "$applied_record" ]]; then
      IFS=$'\t' read -r applied_version applied_file_name applied_checksum <<<"$applied_record"
      if [[ "$applied_version" != "$version" && "$applied_file_name" != "$filename" ]]; then
        if ! current_migration_exists "$applied_file_name" \
          && [[ -z "$(migration_record_by_version "$version" || true)" ]]; then
          canonicalize_migration_record \
            "$applied_version" \
            "$version" \
            "$filename" \
            "$checksum"
        fi
      fi
      echo "[skip] $version already applied"
      continue
    fi
  fi

  CURRENT_FILE="$filename"
  CURRENT_VERSION="$version"
  CURRENT_EXIT_CODE="$ordinal"
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
  CURRENT_EXIT_CODE=""

  if [[ "$(table_exists)" == "t" ]]; then
    persist_migration_record "$version" "$filename" "$checksum"
  fi
done

echo "[done] migrations applied from infra/migrations"
