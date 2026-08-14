#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.dev.yml config >/dev/null
pnpm classification:check
pnpm lint
pnpm typecheck
python3 operations/security/verify-internal-key-exceptions.py
pnpm test
echo "[info] Run pnpm db:verify to validate the adopted Phase 1 schema against a live local database."
