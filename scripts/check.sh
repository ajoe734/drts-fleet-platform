#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.dev.yml config >/dev/null
pnpm lint
pnpm typecheck
pnpm test
echo "[info] Run pnpm db:verify to validate the adopted Phase 1 schema against a live local database."
