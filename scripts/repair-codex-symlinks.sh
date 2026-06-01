#!/usr/bin/env bash
# repair-codex-symlinks.sh
#
# Pre-flight repair for the codex / codex2 ChatGPT OAuth credential layout.
#
# Defaults preserve the historical worker homes (~/.codex for the primary lane,
# ~/.codex2 for codex2), but every path here is overrideable so deployments can
# adopt clearer worker-only names such as ~/.codex-worker and ~/.codex2-worker
# while leaving the interactive chatbox extension on ~/.codex.
#
# Two modes, selected by CODEX_LANE_ISOLATION:
#
# === Legacy single-account mode (CODEX_LANE_ISOLATION unset / 0) ===
# Symlink codex2's auth.json to codex's, so both lanes share ONE on-disk
# credential file. This was the original mitigation for the
# `refresh_token_reused` race (2026-05-20): with one shared file plus the
# startup flock in scripts/codex-wrapper.sh, whichever subprocess wins the
# refresh writes back for the others. Downside: both lanes consume the SAME
# ChatGPT account's quota, so a heavy wave exhausts it twice as fast.
#
# === Dual-account isolation mode (CODEX_LANE_ISOLATION=1) ===
# Keep codex and codex2 on SEPARATE accounts (separate auth.json files). The
# refresh race is now handled by per-CODEX_HOME flock in codex-wrapper.sh
# (each account serializes its own refreshes; the two accounts run fully in
# parallel). This script then only has to fix the *path-mismatch* trap:
#
#   - The codex CLI resolves its config dir as "$CODEX_HOME" when CODEX_HOME
#     is set, but as "$HOME/.codex" when only HOME is set.
#   - The supervisor launches codex2 with CODEX_HOME=<worker home>  -> reads
#     <worker home>/auth.json
#   - An operator doing `HOME=<worker home> codex login` writes to
#     <worker home>/.codex/auth.json
#   - => login refreshes one file, supervisor reads the other => stale-token
#     401 loop. (Observed 2026-05-27.)
#
# In isolation mode we reconcile those two paths for codex2: whichever of
# {<worker home>/auth.json, <worker home>/.codex/auth.json} is newer becomes the
# canonical regular file, and the other becomes a symlink to it. That way
# both the CODEX_HOME view and the HOME view always see the freshest token.
#
# Behaviour in both modes:
# - Missing sources warn and exit 0 (supervisor surfaces real auth failures
#   through its normal channels rather than crashing startup).
# - Safe to run repeatedly. Intended to be invoked from run-supervisor.sh.
#
# Tunables (env vars):
# - CODEX_MAIN_CREDS : primary lane auth file used for legacy shared mode
#                      and cross-link warnings (default: ~/.codex/auth.json)
# - CODEX2_HOME_DIR  : codex2 worker home to reconcile in either mode
#                      (default: ~/.codex2)
# - CODEX2_CREDS     : explicit CODEX_HOME-view auth path, if it differs from
#                      "$CODEX2_HOME_DIR/auth.json"

set -euo pipefail

LOG_TAG="[repair-codex-symlinks]"
CODEX_MAIN="${CODEX_MAIN_CREDS:-$HOME/.codex/auth.json}"
CODEX2_HOME_DIR="${CODEX2_HOME_DIR:-$HOME/.codex2}"
CODEX2_CODEXHOME_AUTH="${CODEX2_CREDS:-$CODEX2_HOME_DIR/auth.json}"          # CODEX_HOME view
CODEX2_HOMEVIEW_AUTH="$CODEX2_HOME_DIR/.codex/auth.json"                      # HOME view

newer_file() {
  # echo whichever of $1/$2 has the newer mtime; skip non-files.
  local a="$1" b="$2"
  if [[ -f "$a" && ! -L "$a" ]] && [[ -f "$b" && ! -L "$b" ]]; then
    if [[ "$a" -nt "$b" ]]; then printf '%s' "$a"; else printf '%s' "$b"; fi
  elif [[ -f "$a" && ! -L "$a" ]]; then printf '%s' "$a"
  elif [[ -f "$b" && ! -L "$b" ]]; then printf '%s' "$b"
  else printf ''; fi
}

if [[ "${CODEX_LANE_ISOLATION:-0}" == "1" ]]; then
  # --- Dual-account isolation: reconcile codex2's two auth-path views ---
  mkdir -p "$CODEX2_HOME_DIR/.codex"
  canonical="$(newer_file "$CODEX2_CODEXHOME_AUTH" "$CODEX2_HOMEVIEW_AUTH")"
  if [[ -z "$canonical" ]]; then
    echo "$LOG_TAG WARN: no codex2 auth.json found under $CODEX2_HOME_DIR; skipping" >&2
    exit 0
  fi
  # Pick the CODEX_HOME view as the durable canonical location (that's what the
  # supervisor reads). If the newer file is the HOME view, promote it.
  if [[ "$canonical" != "$CODEX2_CODEXHOME_AUTH" ]]; then
    cp -p "$canonical" "$CODEX2_CODEXHOME_AUTH.tmp.$$"
    mv "$CODEX2_CODEXHOME_AUTH.tmp.$$" "$CODEX2_CODEXHOME_AUTH"
    echo "$LOG_TAG promoted newer $canonical -> $CODEX2_CODEXHOME_AUTH" >&2
  fi
  # Point the HOME view at the canonical CODEX_HOME file via symlink so a
  # future `HOME=~/.codex2 codex login` refreshes the same file the supervisor
  # reads.
  if [[ ! -L "$CODEX2_HOMEVIEW_AUTH" ]] || \
     [[ "$(readlink -f "$CODEX2_HOMEVIEW_AUTH" 2>/dev/null)" != "$(readlink -f "$CODEX2_CODEXHOME_AUTH" 2>/dev/null)" ]]; then
    [[ -e "$CODEX2_HOMEVIEW_AUTH" || -L "$CODEX2_HOMEVIEW_AUTH" ]] && rm -f "$CODEX2_HOMEVIEW_AUTH"
    ln -s "$CODEX2_CODEXHOME_AUTH" "$CODEX2_HOMEVIEW_AUTH"
    echo "$LOG_TAG linked HOME-view $CODEX2_HOMEVIEW_AUTH -> $CODEX2_CODEXHOME_AUTH" >&2
  fi
  # Explicitly DO NOT cross-link codex2 -> codex; that would merge accounts.
  if [[ -L "$CODEX2_CODEXHOME_AUTH" ]]; then
    tgt="$(readlink -f "$CODEX2_CODEXHOME_AUTH" 2>/dev/null || true)"
    if [[ "$tgt" == "$(readlink -f "$CODEX_MAIN" 2>/dev/null || true)" ]]; then
      echo "$LOG_TAG WARN: $CODEX2_CODEXHOME_AUTH is symlinked to the codex MAIN account ($CODEX_MAIN). Isolation mode expects a separate account — leaving as-is but this collapses dual-account quota. Re-login codex2 with its own account to fix." >&2
    fi
  fi
  exit 0
fi

# --- Legacy single-account mode: symlink codex2 -> codex (shared quota) ---
SRC="$CODEX_MAIN"
DST="$CODEX2_CODEXHOME_AUTH"

if [[ ! -f "$SRC" ]]; then
  echo "$LOG_TAG WARN: source missing ($SRC); skipping codex2 repair" >&2
  exit 0
fi

mkdir -p "$(dirname "$DST")"

if [[ -L "$DST" ]]; then
  current_target="$(readlink -f "$DST" 2>/dev/null || true)"
  expected_target="$(readlink -f "$SRC" 2>/dev/null || true)"
  if [[ -n "$current_target" && "$current_target" == "$expected_target" ]]; then
    exit 0
  fi
fi

if [[ -f "$DST" && ! -L "$DST" ]]; then
  backup="${DST}.bak-pre-symlink-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$DST" "$backup"
  echo "$LOG_TAG backed up stale regular file to $backup" >&2
fi

[[ -L "$DST" ]] && rm -f "$DST"
ln -s "$SRC" "$DST"
echo "$LOG_TAG symlinked $DST -> $SRC" >&2
