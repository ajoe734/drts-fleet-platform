#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [[ "$GIT_COMMON_DIR" == */.git ]]; then
  ROOT_DIR="${GIT_COMMON_DIR%/.git}"
else
  ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi

CANONICAL_SCRIPT="$ROOT_DIR/tools/development-orchestrator/bin/ai_status.py"
if [[ ! -f "$CANONICAL_SCRIPT" ]]; then
  echo "Error: Canonical status script not found at $CANONICAL_SCRIPT" >&2
  exit 1
fi

export ORCH_STATUS_ROOT="$ROOT_DIR"
export AI_STATUS_ROOT="$ROOT_DIR"
export AI_STATUS_CANONICAL_WRAPPER=1

exec python3 "$CANONICAL_SCRIPT" "$@"
