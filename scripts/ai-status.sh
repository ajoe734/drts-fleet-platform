#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${AI_STATUS_ROOT:-}" ]]; then
  ROOT_DIR="$AI_STATUS_ROOT"
elif [[ -n "${ORCH_STATUS_ROOT:-}" ]]; then
  ROOT_DIR="$ORCH_STATUS_ROOT"
else
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

CANONICAL_SCRIPT="${AI_STATUS_RUNTIME_SCRIPT:-$ROOT_DIR/scripts/ai_status.py}"
if [[ ! -f "$CANONICAL_SCRIPT" ]]; then
  echo "Error: Canonical status script not found at $CANONICAL_SCRIPT" >&2
  exit 1
fi

export ORCH_STATUS_ROOT="$ROOT_DIR"
export AI_STATUS_ROOT="$ROOT_DIR"

exec python3 "$CANONICAL_SCRIPT" "$@"
