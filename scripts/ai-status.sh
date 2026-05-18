#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${AI_STATUS_ROOT:-}" ]]; then
  ROOT_DIR="$AI_STATUS_ROOT"
elif [[ -n "${ORCH_STATUS_ROOT:-}" ]]; then
  ROOT_DIR="$ORCH_STATUS_ROOT"
else
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
exec python3 "$ROOT_DIR/scripts/ai_status.py" "$@"
