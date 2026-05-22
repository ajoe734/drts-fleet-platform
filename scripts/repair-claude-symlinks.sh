#!/usr/bin/env bash
# repair-claude-symlinks.sh
#
# Pre-flight repair for Claude credential path drift.
#
# Why this script exists:
# 1. The primary Claude autoworker lane (`~/.claude-autoworker`) is supposed
#    to share `~/.claude/.credentials.json`, but Claude CLI refresh can rewrite
#    the destination as a regular file and silently break the link.
# 2. The isolated `claude2` lane keeps its own account in `~/.claude2-home`,
#    but we have observed its credentials split across both:
#      - `~/.claude2-home/.credentials.json`
#      - `~/.claude2-home/.claude/.credentials.json`
#    Depending on which path a manual reauth touched most recently, one file can
#    be fresh while the other stays stale. We must reconcile those two
#    lane-local paths without cross-linking `claude2` to the primary Claude
#    account.
#
# Behaviour:
# - Primary lane: keep `~/.claude-autoworker/.credentials.json` symlinked to
#   the main Claude token file.
# - Claude2 lane: pick the newer of the two lane-local credential files as the
#   canonical source of truth, back up the older conflicting copy, and symlink
#   it to the winner.
# - Missing sources warn and exit 0. Startup must continue; the supervisor will
#   surface real auth failures through normal channels.
#
# Safe to run repeatedly. Intended to be invoked from scripts/run-supervisor.sh
# and from any other supervisor startup paths.

set -euo pipefail

SRC="${CLAUDE_MAIN_CREDS:-$HOME/.claude/.credentials.json}"
DST="${CLAUDE_AUTOWORKER_CREDS:-$HOME/.claude-autoworker/.credentials.json}"
CLAUDE2_HOME_ROOT="${CLAUDE2_HOME_ROOT:-$HOME/.claude2-home}"
CLAUDE2_HOME_CREDS="${CLAUDE2_HOME_CREDS:-$CLAUDE2_HOME_ROOT/.credentials.json}"
CLAUDE2_RUNTIME_CREDS="${CLAUDE2_RUNTIME_CREDS:-$CLAUDE2_HOME_ROOT/.claude/.credentials.json}"
LOG_TAG="[repair-claude-symlinks]"

canonical_path() {
  readlink -f "$1" 2>/dev/null || printf '%s' "$1"
}

backup_regular_file() {
  local path="$1"
  local backup="${path}.bak-pre-symlink-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$path" "$backup"
  echo "$LOG_TAG backed up stale regular file to $backup" >&2
}

repair_fixed_alias() {
  local src="$1"
  local dst="$2"
  local label="$3"

  if [[ ! -f "$src" ]]; then
    echo "$LOG_TAG WARN: source missing ($src); skipping $label repair" >&2
    return 0
  fi

  mkdir -p "$(dirname "$dst")"

  if [[ -L "$dst" ]]; then
    local current_target
    local expected_target
    current_target="$(canonical_path "$dst")"
    expected_target="$(canonical_path "$src")"
    if [[ -n "$current_target" && "$current_target" == "$expected_target" ]]; then
      return 0
    fi
  fi

  if [[ -f "$dst" && ! -L "$dst" ]]; then
    backup_regular_file "$dst"
  fi

  [[ -L "$dst" ]] && rm -f "$dst"
  ln -s "$src" "$dst"
  echo "$LOG_TAG symlinked $dst -> $src ($label)" >&2
}

repair_lane_local_pair() {
  local path_a="$1"
  local path_b="$2"
  local label="$3"

  local a_exists=0
  local b_exists=0
  [[ -f "$path_a" || -L "$path_a" ]] && a_exists=1
  [[ -f "$path_b" || -L "$path_b" ]] && b_exists=1

  if [[ "$a_exists" -eq 0 && "$b_exists" -eq 0 ]]; then
    echo "$LOG_TAG WARN: no lane-local creds found for $label; skipping" >&2
    return 0
  fi

  local src="$path_a"
  local dst="$path_b"

  if [[ "$a_exists" -eq 0 ]]; then
    src="$path_b"
    dst="$path_a"
  elif [[ "$b_exists" -eq 1 ]]; then
    local a_target
    local b_target
    a_target="$(canonical_path "$path_a")"
    b_target="$(canonical_path "$path_b")"
    if [[ -n "$a_target" && "$a_target" == "$b_target" ]]; then
      return 0
    fi
    if [[ "$path_b" -nt "$path_a" ]]; then
      src="$path_b"
      dst="$path_a"
    fi
  fi

  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -L "$dst" ]]; then
    backup_regular_file "$dst"
  fi

  [[ -L "$dst" ]] && rm -f "$dst"
  ln -s "$src" "$dst"
  echo "$LOG_TAG unified $label creds: $dst -> $src" >&2
}

repair_fixed_alias "$SRC" "$DST" "autoworker"
repair_lane_local_pair "$CLAUDE2_RUNTIME_CREDS" "$CLAUDE2_HOME_CREDS" "claude2"
