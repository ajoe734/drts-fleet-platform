#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.dev.yml up -d
echo "[info] VM dev infra is up on ${DEV_INFRA_BIND_ADDRESS:-127.0.0.1}."
echo "[info] Run pnpm db:init to apply migrations and seeds."
