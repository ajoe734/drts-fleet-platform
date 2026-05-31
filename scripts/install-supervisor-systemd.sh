#!/usr/bin/env bash
# install-supervisor-systemd.sh
#
# Install (or refresh) the DRTS supervisor as a systemd --user service so it
# auto-restarts on crash, gets resource limits, and surfaces in journald.
#
# Replaces the legacy launch pattern:
#   nohup python3 .orchestrator/supervisor.py --config ... &
#
# which produced PPID=1 orphans with no restart-on-failure and required
# manual rescue every time the supervisor was OOM-killed or SIGSEGV'd.
#
# Safe to re-run. Idempotent. Stops + replaces any prior installed unit.
#
# Side effects:
# - Enables `loginctl enable-linger` so the service runs even when the user
#   is not logged in over SSH/console.
# - Installs the unit at $XDG_CONFIG_HOME/systemd/user/drts-supervisor.service
#   (defaults to ~/.config/systemd/user/).
# - Reloads the systemd --user daemon.
# - Enables + starts the service. The previous orphan supervisor is NOT
#   touched here; stop it manually after verifying the systemd service is
#   healthy: `kill -TERM $(pgrep -f 'supervisor.py')`.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT_DIR/ops/systemd/drts-supervisor.service"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
INSTALLED_UNIT="$USER_UNIT_DIR/drts-supervisor.service"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: template not found at $TEMPLATE" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl not available on this host" >&2
  exit 2
fi

mkdir -p "$USER_UNIT_DIR"

# Substitute %h (systemd user-unit placeholder for $HOME) with the literal
# path. systemd --user does support %h natively, but expanding here makes
# the installed unit easier to diff against ps output and avoids subtle
# differences between user sessions.
sed "s|%h|$HOME|g" "$TEMPLATE" > "$INSTALLED_UNIT"
chmod 0644 "$INSTALLED_UNIT"

echo "Installed unit: $INSTALLED_UNIT"

# Enable lingering so the service survives SSH logout. No-op if already set.
if command -v loginctl >/dev/null 2>&1; then
  current_linger=$(loginctl show-user "$USER" 2>/dev/null | awk -F= '/^Linger=/{print $2}')
  if [[ "$current_linger" != "yes" ]]; then
    echo "Enabling user lingering (requires sudo)..."
    sudo loginctl enable-linger "$USER"
  fi
fi

# Reload + enable + restart so config changes pick up without manual fuss.
systemctl --user daemon-reload
systemctl --user enable drts-supervisor.service

# `restart` covers both first install (= start) and refresh (= restart).
# The previous orphan supervisor is left running; user must stop it after
# verifying the systemd service took over cleanly.
systemctl --user restart drts-supervisor.service

echo
echo "Service status:"
systemctl --user --no-pager --lines=5 status drts-supervisor.service || true

echo
echo "Next step:"
echo "  - Confirm the systemd-managed supervisor is healthy:"
echo "      journalctl --user -u drts-supervisor -f"
echo "  - When confident, stop any legacy orphan supervisor:"
echo "      kill -TERM \$(pgrep -f 'supervisor.py' | grep -v \$(systemctl --user show -p MainPID --value drts-supervisor))"
echo "  - Add a follow-up sd_notify call inside supervisor.py to make the"
echo "    WatchdogSec=900s in the unit actually fire on hangs."
