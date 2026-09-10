#!/usr/bin/env bash
set -euo pipefail
task_db="sr_qa_webhook_001_$(date +%s)_$$"
container="${DRTS_TEST_POSTGRES_CONTAINER:-drts-postgres}"
source_db="${DRTS_TEST_SCHEMA_DATABASE:-drts_fleet_platform}"
docker exec "$container" createdb -U postgres "$task_db"
trap 'docker exec "$container" dropdb -U postgres --force "$task_db"' EXIT
docker exec "$container" pg_dump -U postgres -d "$source_db" --schema-only --no-owner --no-privileges |
  docker exec -i "$container" psql -U postgres -d "$task_db" -v ON_ERROR_STOP=1 > /dev/null
echo "base_sha=$(git merge-base HEAD origin/dev)"
echo "execution_sha=$(git rev-parse HEAD)"
echo "isolated_database=$task_db"
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/$task_db" \
  pnpm exec vitest run tests/unit/system-remediation/sr-qa-webhook-001/auth-http.test.ts
