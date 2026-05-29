#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$ROOT_DIR/.orchestrator/bin/node_modules/.bin:$ROOT_DIR/.orchestrator/bin:$PATH"
exec python3 "$ROOT_DIR/.orchestrator/supervisor.py" "$@"
