#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_FILE=""

TARGET_APPS=(
  "apps/tenant-console-web"
  "apps/partner-booking-web"
  "apps/platform-admin-web"
)

SCAN_DIRS=(
  "app"
  "components"
  "lib"
  "src"
)

FILE_EXTENSIONS=(
  "*.ts"
  "*.tsx"
  "*.js"
  "*.jsx"
  "*.mts"
  "*.cts"
  "*.mjs"
  "*.cjs"
)

DISALLOWED_PATTERNS=(
  "@supabase/"
  "@supabase/supabase-js"
  "\"pg\""
  "'pg'"
  "apps/api/"
  "common/db"
  "/supabase"
  "/database"
  "/db"
)

collect_files() {
  local app_dir="$1"
  local scan_dir
  local ext

  for scan_dir in "${SCAN_DIRS[@]}"; do
    if [[ ! -d "${app_dir}/${scan_dir}" ]]; then
      continue
    fi

    for ext in "${FILE_EXTENSIONS[@]}"; do
      find "${app_dir}/${scan_dir}" -type f -name "${ext}"
    done
  done
}

cleanup() {
  if [[ -n "${TMP_FILE}" && -f "${TMP_FILE}" ]]; then
    rm -f "${TMP_FILE}"
  fi
}

main() {
  local pattern
  local app_dir
  local checked_count=0
  local found_violation=0

  TMP_FILE="$(mktemp)"
  trap cleanup EXIT

  for app_dir in "${TARGET_APPS[@]}"; do
    if [[ ! -d "${ROOT_DIR}/${app_dir}" ]]; then
      continue
    fi

    collect_files "${ROOT_DIR}/${app_dir}" >> "${TMP_FILE}"
  done

  if [[ ! -s "${TMP_FILE}" ]]; then
    echo "[error] no production UI source files found for BFF-only import check." >&2
    exit 1
  fi

  checked_count="$(wc -l < "${TMP_FILE}" | tr -d ' ')"
  echo "[info] checking ${checked_count} production UI source files for forbidden direct-backend imports"

  for pattern in "${DISALLOWED_PATTERNS[@]}"; do
    if xargs grep -nH -F -- "${pattern}" < "${TMP_FILE}"; then
      found_violation=1
    fi
  done

  if [[ "${found_violation}" -ne 0 ]]; then
    cat <<'EOF' >&2
[error] BFF-only import policy violation detected.
[error] Tenant Console, Partner Booking, and Platform Admin production UI code must route reads/writes via @drts/api-client-backed helpers only.
[error] Remove direct DB / Supabase / API-server imports from the files listed above.
EOF
    exit 1
  fi

  echo "[ok] BFF-only import policy passed."
}

main "$@"
