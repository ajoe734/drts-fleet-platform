#!/usr/bin/env bash
set -euo pipefail

pnpm install
docker compose -f docker-compose.dev.yml config >/dev/null
pnpm lint
pnpm typecheck
