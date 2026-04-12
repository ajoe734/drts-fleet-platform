#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.dev.yml up -d
echo "[info] Postgres is up. Run pnpm db:init to apply migrations and seeds."
