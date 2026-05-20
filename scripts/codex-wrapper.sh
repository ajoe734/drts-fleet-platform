#!/usr/bin/env bash
# scripts/codex-wrapper.sh
#
# Wrapper around the real `codex` binary. run-supervisor.sh symlinks this into
# `.orchestrator/bin/codex` at startup (.orchestrator/bin/ is gitignored but is
# first on PATH for supervisor children), so every codex worker subprocess
# launched by the supervisor invokes this wrapper instead of the user's
# interactive `codex` symlink.
#
# Purpose: serialize the auth-refresh window across concurrent codex worker
# subprocesses to mitigate the ChatGPT OAuth `refresh_token_reused` race.
#
# Mechanism:
# - Acquire an advisory file lock (flock) on a shared lockfile.
# - Hold the lock for a short startup window (default 1.5s), enough for the
#   first subprocess to complete its refresh handshake and (if the CLI writes
#   back) update auth.json before the next subprocess reads it.
# - Release the lock and exec the real codex; the lock does NOT cover the
#   subprocess's whole lifetime — only the initial-startup spacing.
#
# Fallbacks:
# - If flock is unavailable: exec real codex directly without serialization.
# - If the real codex can't be located: exit 127 with a clear error.
#
# Tunables (env vars):
# - CODEX_REFRESH_LOCK : path to the lockfile (default /tmp/drts-codex-refresh.lock)
# - CODEX_STARTUP_HOLD_SEC : seconds to hold the lock after acquiring (default 1.5)
# - CODEX_LOCK_WAIT_SEC : max seconds to wait for the lock (default 30)
# - CODEX_REAL_BIN : explicit override path to the real codex binary

set -euo pipefail

self_real="$(readlink -f "$0")"

resolve_real_codex() {
  if [[ -n "${CODEX_REAL_BIN:-}" && -x "$CODEX_REAL_BIN" ]]; then
    printf '%s' "$CODEX_REAL_BIN"
    return 0
  fi
  local IFS=:
  local candidate
  for d in $PATH; do
    candidate="$d/codex"
    if [[ -x "$candidate" ]]; then
      local resolved
      resolved="$(readlink -f "$candidate" 2>/dev/null || printf '%s' "$candidate")"
      if [[ "$resolved" != "$self_real" ]]; then
        printf '%s' "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

if ! real_codex="$(resolve_real_codex)"; then
  echo "[.orchestrator/bin/codex] ERROR: cannot find real codex binary in PATH" >&2
  exit 127
fi

lockfile="${CODEX_REFRESH_LOCK:-/tmp/drts-codex-refresh.lock}"
hold_sec="${CODEX_STARTUP_HOLD_SEC:-1.5}"
wait_sec="${CODEX_LOCK_WAIT_SEC:-30}"

# Acquire the lock briefly (subshell scopes the FD), then release before exec.
# If flock isn't available, skip the serialization gracefully.
if command -v flock >/dev/null 2>&1; then
  (
    if flock -w "$wait_sec" 9; then
      sleep "$hold_sec"
    fi
  ) 9>"$lockfile" || true
fi

exec "$real_codex" "$@"
