#!/usr/bin/env bash
# repair-claude-symlinks.sh
#
# Pre-flight repair: ensure the autoworker lane's OAuth credentials remain
# symlinked to the main claude lane's credentials.
#
# Why this script exists:
# When the Claude CLI refreshes its OAuth token, it writes the new token to
# `~/.claude-autoworker/.credentials.json` as a regular file, **silently
# replacing the symlink** that should point at `~/.claude/.credentials.json`.
# Once the autoworker file becomes a regular file holding a stale token, the
# main lane silently 401s on the next request — observed multiple times,
# recorded in the memory file `feedback_autoworker_creds_symlink.md`. The
# manual repair was to re-symlink and restart workers; this script automates
# that as a supervisor pre-flight.
#
# Behaviour:
# - No-op when the destination is already the correct symlink.
# - If destination is a regular file: backs it up with a timestamped suffix,
#   then re-creates the symlink.
# - If source is missing: warn and exit 0 (supervisor will surface auth
#   failures through normal channels rather than crashing here).
#
# Safe to run repeatedly. Intended to be invoked from scripts/run-supervisor.sh
# and from any other supervisor startup paths.

set -euo pipefail

SRC="${CLAUDE_MAIN_CREDS:-$HOME/.claude/.credentials.json}"
DST="${CLAUDE_AUTOWORKER_CREDS:-$HOME/.claude-autoworker/.credentials.json}"
LOG_TAG="[repair-claude-symlinks]"

if [[ ! -f "$SRC" ]]; then
  echo "$LOG_TAG WARN: source missing ($SRC); skipping autoworker repair" >&2
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
