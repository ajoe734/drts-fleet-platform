#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_COMPOSE_FILE="${ROOT_DIR}/docker-compose.dev.yml"

default_database_url() {
  local db_name="${POSTGRES_DB:-drts_fleet_platform}"
  local db_user="${POSTGRES_USER:-postgres}"
  local db_password="${POSTGRES_PASSWORD:-postgres}"
  local db_port="${POSTGRES_PORT:-5432}"
  printf 'postgresql://%s:%s@localhost:%s/%s' \
    "$db_user" \
    "$db_password" \
    "$db_port" \
    "$db_name"
}

ensure_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL
    DATABASE_URL="$(default_database_url)"
    echo "[info] DATABASE_URL not set; defaulting to ${DATABASE_URL}" >&2
  fi
}

parse_database_url_field() {
  local field="$1"
  python3 - "$DATABASE_URL" "$field" <<'PY'
import sys
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
field = sys.argv[2]

mapping = {
    "username": url.username or "postgres",
    "password": url.password or "postgres",
    "host": url.hostname or "localhost",
    "port": str(url.port or 5432),
    "database": url.path.lstrip("/") or "postgres",
}
print(mapping[field])
PY
}

database_name() {
  parse_database_url_field database
}

database_user() {
  parse_database_url_field username
}

database_password() {
  parse_database_url_field password
}

use_local_psql() {
  command -v psql >/dev/null 2>&1
}

postgres_service_running() {
  docker compose -f "$DOCKER_COMPOSE_FILE" ps --status running postgres 2>/dev/null | grep -q postgres
}

run_psql() {
  ensure_database_url
  if use_local_psql; then
    PGPASSWORD="$(database_password)" psql "$DATABASE_URL" "$@"
    return
  fi

  if ! postgres_service_running; then
    echo "[error] psql is not installed and the docker postgres service is not running." >&2
    echo "[hint] Run ./scripts/dev-up.sh first, or install the PostgreSQL client locally." >&2
    exit 1
  fi

  docker compose -f "$DOCKER_COMPOSE_FILE" exec -T \
    -e PGPASSWORD="$(database_password)" \
    postgres \
    psql -U "$(database_user)" -d "$(database_name)" "$@"
}

run_psql_file() {
  local file="$1"
  shift
  ensure_database_url
  if use_local_psql; then
    PGPASSWORD="$(database_password)" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" "$@"
    return
  fi

  if ! postgres_service_running; then
    echo "[error] psql is not installed and the docker postgres service is not running." >&2
    echo "[hint] Run ./scripts/dev-up.sh first, or install the PostgreSQL client locally." >&2
    exit 1
  fi

  docker compose -f "$DOCKER_COMPOSE_FILE" exec -T \
    -e PGPASSWORD="$(database_password)" \
    postgres \
    psql -U "$(database_user)" -d "$(database_name)" -v ON_ERROR_STOP=1 "$@" < "$file"
}
