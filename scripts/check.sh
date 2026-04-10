#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.dev.yml config >/dev/null
pnpm lint
pnpm typecheck
pnpm test
