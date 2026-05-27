#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# Ensure the user's local bin (where repair-cli-symlinks.sh maintains the
# real codex/claude/gemini symlinks into the VS Code extension dirs) is on
# PATH. Under systemd --user the inherited PATH is the minimal default
# (/usr/local/bin:/usr/bin:...) with NO ~/.local/bin, so the .orchestrator/bin
# codex/claude wrappers could not find the real binary in PATH and exited 127
# ("cannot find real codex binary in PATH"). That made the auth-readiness
# probe report auth_ready=false -> the whole codex lane was treated as
# dispatch-paused even though `codex login status` was healthy. Prepending
# ~/.local/bin (and the npm global prefix for gemini) fixes the probe and
# keeps behaviour identical whether launched from a login shell or systemd.
export PATH="$ROOT_DIR/.orchestrator/bin/node_modules/.bin:$ROOT_DIR/.orchestrator/bin:$HOME/.local/bin:$HOME/.local/npm-prefix/bin:$PATH"

# Pre-flight: ensure the autoworker OAuth credentials remain a symlink to the
# main lane's credentials. Claude CLI silently rewrites this as a regular file
# when it refreshes tokens; once that happens the main lane 401s on the next
# request. See scripts/repair-claude-symlinks.sh and the memory note
# `feedback_autoworker_creds_symlink.md`. Failure here must not block startup —
# supervisor will surface real auth failures through its normal channels.
if [[ -x "$ROOT_DIR/scripts/repair-claude-symlinks.sh" ]]; then
  "$ROOT_DIR/scripts/repair-claude-symlinks.sh" || true
fi

# Pre-flight: same pattern for codex2's ChatGPT OAuth credentials. Symlink
# ~/.codex2/auth.json to ~/.codex/auth.json so both lanes share on-disk state
# and concurrent refresh races have a single source of truth. See
# scripts/repair-codex-symlinks.sh.
if [[ -x "$ROOT_DIR/scripts/repair-codex-symlinks.sh" ]]; then
  "$ROOT_DIR/scripts/repair-codex-symlinks.sh" || true
fi

# Pre-flight: re-link ~/.local/bin/{codex,claude} to whichever VS Code
# extension is currently installed. Extension auto-updates leave the stable-
# name symlink dangling, which causes the codex/claude wrappers in
# .orchestrator/bin/ to exit 127 with "cannot find real <tool> binary in
# PATH". See scripts/repair-cli-symlinks.sh and the memory note
# `feedback_cli_symlink_staleness.md`.
if [[ -x "$ROOT_DIR/scripts/repair-cli-symlinks.sh" ]]; then
  "$ROOT_DIR/scripts/repair-cli-symlinks.sh" || true
fi

# Pre-flight: install the codex wrapper into the gitignored .orchestrator/bin/
# so it overrides the system codex on the supervisor's PATH. The wrapper
# itself lives in scripts/ (tracked); .orchestrator/bin/codex is a symlink to
# it. See scripts/codex-wrapper.sh.
if [[ -x "$ROOT_DIR/scripts/codex-wrapper.sh" ]]; then
  mkdir -p "$ROOT_DIR/.orchestrator/bin"
  ln -sfn "$ROOT_DIR/scripts/codex-wrapper.sh" "$ROOT_DIR/.orchestrator/bin/codex"
fi

exec python3 "$ROOT_DIR/.orchestrator/supervisor.py" "$@"
