#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUS_ROOT="${ORCH_STATUS_ROOT:-${AI_STATUS_ROOT:-}}"
if [[ -n "$STATUS_ROOT" ]]; then
  ROOT_DIR="$STATUS_ROOT"
else
  GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ "$GIT_COMMON_DIR" == */.git ]]; then
    ROOT_DIR="${GIT_COMMON_DIR%/.git}"
  else
    ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  fi
fi

export ORCH_STATUS_ROOT="$ROOT_DIR"
export AI_STATUS_ROOT="$ROOT_DIR"
exec python3 "$SCRIPT_DIR/ai_status.py" "$@"
