#!/usr/bin/env bash
# install-health-systemd.sh
#
# Install the periodic health probe as a systemd --user timer. The probe
# exits non-zero whenever any health metric is degraded; that surfaces
# automatically in `systemctl --user status drts-health.timer` without
# any separate alerting infrastructure.
#
# Safe to re-run. Idempotent.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$ROOT_DIR/ops/systemd"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$USER_UNIT_DIR"

for unit in drts-health.service drts-health.timer; do
  src="$TEMPLATE_DIR/$unit"
  dst="$USER_UNIT_DIR/$unit"
  if [[ ! -f "$src" ]]; then
    echo "ERROR: template missing at $src" >&2
    exit 1
  fi
  sed "s|%h|$HOME|g" "$src" > "$dst"
  chmod 0644 "$dst"
  echo "Installed: $dst"
done

systemctl --user daemon-reload
systemctl --user enable --now drts-health.timer

echo
echo "Timer status:"
systemctl --user --no-pager list-timers drts-health.timer || true

echo
echo "To take a snapshot now:"
echo "  scripts/health.sh"
echo
echo "Last probe status:"
echo "  systemctl --user status drts-health"
echo
echo "All probe history:"
echo "  journalctl --user -u drts-health --since '1 hour ago'"
