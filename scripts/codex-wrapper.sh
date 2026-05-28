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
# - Acquire an advisory file lock (flock) on a PER-CODEX-HOME lockfile.
# - Hold the lock for a short startup window (default 1.5s), enough for the
#   first subprocess to complete its refresh handshake and (if the CLI writes
#   back) update auth.json before the next subprocess reads it.
# - Release the lock and exec the real codex; the lock does NOT cover the
#   subprocess's whole lifetime — only the initial-startup spacing.
#
# Per-CODEX-HOME locking (lane isolation):
#   The refresh race is between subprocesses that share ONE auth.json. Two
#   different accounts (codex on ~/.codex, codex2 on ~/.codex2) have separate
#   auth.json files and CANNOT race each other — they only race within their
#   own account. A single global lock therefore needlessly serialized the two
#   independent accounts against each other and historically pushed operators
#   toward symlinking both lanes onto ONE account (doubling that account's
#   quota burn). Deriving the lockfile from the effective codex home lets each
#   account serialize its own refreshes while running fully in parallel with
#   the other account.
#
# Effective-codex-home resolution mirrors the codex CLI:
#   - CODEX_HOME set            -> "$CODEX_HOME"
#   - otherwise                 -> "$HOME/.codex"
#
# Fallbacks:
# - If flock is unavailable: exec real codex directly without serialization.
# - If the real codex can't be located: exit 127 with a clear error.
#
# Tunables (env vars):
# - CODEX_REFRESH_LOCK : explicit lockfile path; overrides the per-home
#                        derivation entirely (back-compat / tests).
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

# Derive a per-effective-codex-home lockfile so independent accounts do not
# serialize against each other. An explicit CODEX_REFRESH_LOCK still wins.
derive_lockfile() {
  if [[ -n "${CODEX_REFRESH_LOCK:-}" ]]; then
    printf '%s' "$CODEX_REFRESH_LOCK"
    return 0
  fi
  local eff_home
  if [[ -n "${CODEX_HOME:-}" ]]; then
    eff_home="$CODEX_HOME"
  else
    eff_home="${HOME:-/tmp}/.codex"
  fi
  # Stable short hash of the path keeps the lockfile in /tmp regardless of how
  # deep / unusual the codex home path is. sha256sum is coreutils-standard.
  local key
  if command -v sha256sum >/dev/null 2>&1; then
    key="$(printf '%s' "$eff_home" | sha256sum | cut -c1-16)"
  else
    # Fallback: sanitize the path into a filename-safe token.
    key="$(printf '%s' "$eff_home" | tr -c 'a-zA-Z0-9' '_')"
  fi
  printf '/tmp/drts-codex-refresh-%s.lock' "$key"
}

if ! real_codex="$(resolve_real_codex)"; then
  echo "[.orchestrator/bin/codex] ERROR: cannot find real codex binary in PATH" >&2
  exit 127
fi

lockfile="$(derive_lockfile)"
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
