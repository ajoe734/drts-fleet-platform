#!/usr/bin/env bash
set -euo pipefail

# C111 prerequisite only: durable JWT sessions and controller lifecycle.
# This does not claim authenticated tenant API HTTP acceptance.
# Local schema-only clone; never run service bootstrap against the source DB.
task_db="sr_qa_webhook_001_$(date +%s)_$$"
container="${DRTS_TEST_POSTGRES_CONTAINER:-drts-postgres}"
source_db="${DRTS_TEST_SCHEMA_DATABASE:-drts_fleet_platform}"
docker exec "$container" createdb -U postgres "$task_db"
trap 'docker exec "$container" dropdb -U postgres --force "$task_db"' EXIT
docker exec "$container" pg_dump -U postgres -d "$source_db" --schema-only --no-owner --no-privileges |
  docker exec -i "$container" psql -U postgres -d "$task_db" -v ON_ERROR_STOP=1 > /dev/null
echo "base_sha=$(git merge-base HEAD origin/dev)"
echo "execution_sha=$(git rev-parse HEAD)"
echo "isolated_database=$task_db (schema-only clone of local $source_db)"
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/$task_db" \
  pnpm --filter @drts/api exec vitest run \
    tests/integration/jwt-session-claims.integration.test.ts \
    tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts
