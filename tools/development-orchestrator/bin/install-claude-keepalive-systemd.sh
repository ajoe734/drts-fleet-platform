#!/usr/bin/env bash
# install-claude-keepalive-systemd.sh
#
# Replace the legacy `*/30 * * * * claude2-keepalive.sh` crontab entry
# with a systemd --user timer that:
#   - Logs to journald (visible in `journalctl --user -u drts-claude-keepalive`)
#   - Surfaces failure via `systemctl --user status drts-claude-keepalive.timer`
#   - Triggers on boot too (cron only fires at wall-clock interval, can miss
#     an entire token cycle if the host comes up at the wrong minute)
#   - Persists across missed runs (Persistent=true)
#
# Side effects:
# - Installs both .service and .timer under ~/.config/systemd/user/
# - Enables + starts the timer
# - REMOVES the prior `claude2-keepalive.sh` crontab entry (if present),
#   to avoid double-firing. Comment-out heuristic only — won't delete an
#   entry that doesn't reference the exact script basename.
#
# Safe to re-run.

set -euo pipefail

# shellcheck source=../systemd/install-common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../systemd" && pwd)/install-common.sh"
ROOT_DIR="$(orch_canonical_root "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)")"
RELEASE_ROOT="$(orch_release_root "$ROOT_DIR")"
orch_require_release "$RELEASE_ROOT"
# The unit definition comes from the same pinned release as the code it
# points at, so the two cannot describe different versions.
TEMPLATE_DIR="$RELEASE_ROOT/tools/development-orchestrator/systemd"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
ENV_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/drts"
ENV_FILE="$ENV_DIR/claude-lanes.env"
mkdir -p "$USER_UNIT_DIR"
mkdir -p "$ENV_DIR"

for unit in drts-claude-keepalive.service drts-claude-keepalive.timer; do
  src="$TEMPLATE_DIR/$unit"
  dst="$USER_UNIT_DIR/$unit"
  orch_render_unit "$src" "$dst" "$ROOT_DIR" "$RELEASE_ROOT"
done

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
# OAuth lanes exercised by drts-claude-keepalive. Comma-separated.
ORCH_CLAUDE_LANES=claude
# Override these only when an isolated account is intentionally configured.
# ORCH_CLAUDE_CONFIG_DIR=$HOME/.claude
# ORCH_CLAUDE2_HOME=$HOME/.claude2-home
EOF
  chmod 0600 "$ENV_FILE"
  echo "Seeded: $ENV_FILE"
else
  echo "Env file already exists: $ENV_FILE (not touched)"
fi

# Remove legacy cron entry referencing the old single-lane script.
if crontab -l 2>/dev/null | grep -q 'claude2-keepalive\.sh\|claude-lane-keepalive\.sh'; then
  echo "Removing legacy keepalive cron entry..."
  crontab -l 2>/dev/null \
    | grep -v 'claude2-keepalive\.sh' \
    | grep -v 'claude-lane-keepalive\.sh' \
    | grep -v '^# claude2 OAuth keepalive' \
    | grep -v '^# Tokens decay ~8h' \
    | crontab -
fi

systemctl --user daemon-reload
systemctl --user enable --now drts-claude-keepalive.timer

echo
echo "Timer status:"
systemctl --user --no-pager list-timers drts-claude-keepalive.timer || true

echo
echo "To exercise the lanes immediately (without waiting for next cycle):"
echo "  systemctl --user start drts-claude-keepalive.service"
echo
echo "To watch logs:"
echo "  journalctl --user -u drts-claude-keepalive -f"
