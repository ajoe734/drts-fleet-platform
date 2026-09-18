#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GIT_COMMON_DIR="$(git -C "$SOURCE_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [[ -n "${ORCH_STATUS_ROOT:-}" ]]; then
  STATUS_ROOT="$ORCH_STATUS_ROOT"
elif [[ "$GIT_COMMON_DIR" == */.git ]]; then
  STATUS_ROOT="${GIT_COMMON_DIR%/.git}"
else
  STATUS_ROOT="$SOURCE_ROOT"
fi

export ORCH_STATUS_ROOT="$STATUS_ROOT"
export AI_STATUS_ROOT="$STATUS_ROOT"
export PATH="$STATUS_ROOT/.orchestrator/bin/node_modules/.bin:$STATUS_ROOT/.orchestrator/bin:$HOME/.local/bin:$PATH"
cd "$STATUS_ROOT"
exec python3 "$SOURCE_ROOT/tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py" "$@"
