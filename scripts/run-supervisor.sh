#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# systemd --user starts with a minimal PATH that omits user-local CLI shims
# like ~/.local/bin. Keep the orchestrator wrapper directory first so codex
# workers still enter our wrapper, but add ~/.local/bin immediately after so
# wrappers can resolve the real vendor CLIs they delegate to.
if [[ -n "${HOME:-}" ]]; then
  export PATH="$ROOT_DIR/.orchestrator/bin/node_modules/.bin:$ROOT_DIR/.orchestrator/bin:$HOME/.local/bin:$PATH"
else
  export PATH="$ROOT_DIR/.orchestrator/bin/node_modules/.bin:$ROOT_DIR/.orchestrator/bin:$PATH"
fi
exec python3 "$ROOT_DIR/.orchestrator/supervisor.py" "$@"
