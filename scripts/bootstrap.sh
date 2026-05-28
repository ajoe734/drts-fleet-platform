#!/usr/bin/env bash
set -euo pipefail

python3 scripts/ensure-local-node-modules.py repair
docker compose -f docker-compose.dev.yml config >/dev/null
echo "[info] Run pnpm db:init after starting postgres to apply the adopted Phase 1 migrations and seeds."
pnpm lint
pnpm typecheck
