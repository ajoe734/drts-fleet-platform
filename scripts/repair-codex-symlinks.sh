#!/usr/bin/env bash
# repair-codex-symlinks.sh
#
# Pre-flight repair: ensure the codex2 lane's ChatGPT OAuth credentials are
# symlinked to the codex (main) lane's credentials, so both lanes share a
# single source of truth.
#
# Why this script exists:
# The Codex CLI uses rotating refresh tokens against chatgpt.com OAuth. When
# multiple `codex exec` subprocesses run concurrently against separate but
# independent `~/.codex/auth.json` and `~/.codex2/auth.json` files (or the
# same one), they race: one subprocess refreshes and consumes the on-disk
# refresh_token, the next subprocess reads the now-stale refresh_token and
# the OAuth server returns 401 `refresh_token_reused`. Observed on
# 2026-05-20 04:46–04:51 UTC — 28 codex2 worker exits / day from this path,
# triggering circuit-breaker pause via chair `provider_actions: pause`.
#
# Symlinking codex2 → codex gives both lanes the same on-disk state, so
# whichever subprocess wins the refresh race writes back (if the CLI persists)
# benefits the other lane on its next read. Combined with the startup flock
# in .orchestrator/bin/codex, this materially reduces the race window.
#
# Behaviour:
# - No-op when the destination is already the correct symlink.
# - If destination is a regular file: backs it up with a timestamped suffix,
#   then re-creates the symlink.
# - If source is missing: warn and exit 0 (supervisor surfaces auth failures
#   through normal channels rather than crashing here).
#
# Safe to run repeatedly. Intended to be invoked from scripts/run-supervisor.sh
# alongside repair-claude-symlinks.sh.

set -euo pipefail

SRC="${CODEX_MAIN_CREDS:-$HOME/.codex/auth.json}"
DST="${CODEX2_CREDS:-$HOME/.codex2/auth.json}"
LOG_TAG="[repair-codex-symlinks]"

if [[ ! -f "$SRC" ]]; then
  echo "$LOG_TAG WARN: source missing ($SRC); skipping codex2 repair" >&2
  exit 0
fi

mkdir -p "$(dirname "$DST")"

# Already correct symlink — no-op.
if [[ -L "$DST" ]]; then
  current_target="$(readlink -f "$DST" 2>/dev/null || true)"
  expected_target="$(readlink -f "$SRC" 2>/dev/null || true)"
  if [[ -n "$current_target" && "$current_target" == "$expected_target" ]]; then
    exit 0
  fi
fi

# Backup any regular file that's currently sitting there.
if [[ -f "$DST" && ! -L "$DST" ]]; then
  backup="${DST}.bak-pre-symlink-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$DST" "$backup"
  echo "$LOG_TAG backed up stale regular file to $backup" >&2
fi

# Remove any wrong/dangling symlink before re-creating.
[[ -L "$DST" ]] && rm -f "$DST"

ln -s "$SRC" "$DST"
echo "$LOG_TAG symlinked $DST -> $SRC" >&2
