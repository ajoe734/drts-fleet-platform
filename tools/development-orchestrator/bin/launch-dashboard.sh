#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4174}"

# The code may be running from a pinned release; the state it serves never is.
# dashboard_server.py defaults its repo root to the tree it lives in, which
# would serve a release worktree's ai-status.json -- a file that does not exist
# there, so the page would render empty and blame nobody.
# shellcheck source=lib/orch-roots.sh
source "$ROOT_DIR/tools/development-orchestrator/bin/lib/orch-roots.sh"
STATUS_ROOT="$(orch_canonical_root "$ROOT_DIR")"
export ORCH_STATUS_ROOT="$STATUS_ROOT"
export AI_STATUS_ROOT="$STATUS_ROOT"

bash "$ROOT_DIR/tools/development-orchestrator/bin/ai-status.sh" sync >/dev/null
exec python3 "$ROOT_DIR/tools/development-orchestrator/bin/dashboard_server.py" --host "$HOST" --port "$PORT" --directory "$ROOT_DIR/tools/development-orchestrator/dashboard" --repo-root "$STATUS_ROOT"
