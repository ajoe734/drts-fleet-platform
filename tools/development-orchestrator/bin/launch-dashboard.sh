#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4174}"

bash "$ROOT_DIR/tools/development-orchestrator/bin/ai-status.sh" sync >/dev/null
exec python3 "$ROOT_DIR/tools/development-orchestrator/bin/dashboard_server.py" --host "$HOST" --port "$PORT" --directory "$ROOT_DIR/tools/development-orchestrator/dashboard"
