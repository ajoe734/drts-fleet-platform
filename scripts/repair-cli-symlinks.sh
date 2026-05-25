#!/usr/bin/env bash
# repair-cli-symlinks.sh
#
# Pre-flight repair for VS Code extension CLI binary symlinks.
#
# Why this script exists:
# The supervisor's worker subprocesses (codex, claude) resolve their CLI via
# PATH, which includes ~/.local/bin where we keep stable-name symlinks like
# ~/.local/bin/codex -> ~/.vscode-server/extensions/openai.chatgpt-<version>/.../codex.
# VS Code extension auto-updates install a new versioned directory and remove
# the old one, but leave our symlink pointing at the now-missing path.
# `test -x` on a dangling symlink returns false, so the codex/claude wrappers
# under .orchestrator/bin/ exit 127 with "cannot find real <tool> binary in
# PATH" and the supervisor records worker_failed ~3s after worker_started in a
# tight retry loop. See `feedback_cli_symlink_staleness.md`.
#
# Behaviour:
# - For each tracked CLI (codex, claude), find the latest VS Code extension
#   directory matching the expected pattern and verify the binary inside is
#   executable.
# - If ~/.local/bin/<tool> is missing, dangling, or pointing at a different
#   extension version, repoint it via `ln -sfn`.
# - If the destination is a regular file (user installed something there
#   manually), back it up before replacing — same convention as
#   repair-claude-symlinks.sh.
# - If no current extension binary is found, warn and exit 0. Startup must
#   continue; the supervisor will surface "CLI is not installed" through its
#   normal channels rather than crash here.
#
# Safe to run repeatedly. Intended to be invoked from scripts/run-supervisor.sh
# alongside repair-claude-symlinks.sh and repair-codex-symlinks.sh.
#
# Tunables (env vars):
# - CLI_SYMLINK_DEST_DIR    : where to write the stable-name symlinks
#                             (default: $HOME/.local/bin)
# - VSCODE_EXTENSIONS_DIR   : where to scan for extension installs
#                             (default: $HOME/.vscode-server/extensions)

set -euo pipefail

DEST_DIR="${CLI_SYMLINK_DEST_DIR:-$HOME/.local/bin}"
EXT_DIR="${VSCODE_EXTENSIONS_DIR:-$HOME/.vscode-server/extensions}"
LOG_TAG="[repair-cli-symlinks]"

backup_regular_file() {
  local path="$1"
  local backup="${path}.bak-pre-symlink-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$path" "$backup"
  echo "$LOG_TAG backed up stale regular file to $backup" >&2
}

# Finds the newest matching extension binary path on stdout, or returns 1 with
# no output if none exists. "Newest" = highest version when sorted with
# `sort -V` over the extension directory names.
find_latest_extension_binary() {
  local glob="$1"
  local relative_bin="$2"
  local match
  local best_dir=""

  for match in "$EXT_DIR"/$glob; do
    [[ -d "$match" ]] || continue
    if [[ -z "$best_dir" ]]; then
      best_dir="$match"
      continue
    fi
    # Lexicographic compare via sort -V picks the higher version.
    local newer
    newer="$(printf '%s\n%s\n' "$best_dir" "$match" | sort -V | tail -1)"
    best_dir="$newer"
  done

  if [[ -z "$best_dir" ]]; then
    return 1
  fi

  local binary="$best_dir/$relative_bin"
  if [[ ! -x "$binary" ]]; then
    return 1
  fi

  printf '%s' "$binary"
}

repair_cli_symlink() {
  local tool="$1"
  local glob="$2"
  local relative_bin="$3"

  local dest="$DEST_DIR/$tool"
  local source
  if ! source="$(find_latest_extension_binary "$glob" "$relative_bin")"; then
    echo "$LOG_TAG WARN: no current extension binary for $tool under $EXT_DIR/$glob; skipping" >&2
    return 0
  fi

  if [[ -L "$dest" ]]; then
    local current_target
    current_target="$(readlink -f "$dest" 2>/dev/null || true)"
    if [[ -n "$current_target" && "$current_target" == "$source" ]]; then
      return 0
    fi
  fi

  if [[ -f "$dest" && ! -L "$dest" ]]; then
    backup_regular_file "$dest"
  fi

  mkdir -p "$DEST_DIR"
  ln -sfn "$source" "$dest"
  echo "$LOG_TAG symlinked $dest -> $source" >&2
}

repair_cli_symlink "codex"  "openai.chatgpt-*-linux-x64"      "bin/linux-x86_64/codex"
repair_cli_symlink "claude" "anthropic.claude-code-*-linux-x64" "resources/native-binary/claude"
