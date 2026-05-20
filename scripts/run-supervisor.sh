#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$ROOT_DIR/.orchestrator/bin/node_modules/.bin:$ROOT_DIR/.orchestrator/bin:$PATH"

# Pre-flight: ensure the autoworker OAuth credentials remain a symlink to the
# main lane's credentials. Claude CLI silently rewrites this as a regular file
# when it refreshes tokens; once that happens the main lane 401s on the next
# request. See scripts/repair-claude-symlinks.sh and the memory note
# `feedback_autoworker_creds_symlink.md`. Failure here must not block startup —
# supervisor will surface real auth failures through its normal channels.
if [[ -x "$ROOT_DIR/scripts/repair-claude-symlinks.sh" ]]; then
  "$ROOT_DIR/scripts/repair-claude-symlinks.sh" || true
fi

exec python3 "$ROOT_DIR/.orchestrator/supervisor.py" "$@"
