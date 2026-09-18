#!/usr/bin/env bash
# install-dashboard-systemd.sh
#
# Install the local dashboard and its Cloudflare quick tunnel as systemd --user
# units. Safe to re-run. Idempotent.
#
# These two units ran on this host for months without existing in the
# repository: hand-installed once, never reviewed, and unrecoverable if the
# machine were rebuilt. That also made them invisible to every guard the other
# units have -- which is how drts-dashboard.service came to sit in a boot
# ordering cycle nothing checked for.
#
# The port is passed in rather than written into both templates. It appears
# three times across them, and three copies of a number are three chances to
# move only two.

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
DASHBOARD_PORT="${DRTS_DASHBOARD_PORT:-4174}"
mkdir -p "$USER_UNIT_DIR"

for unit in drts-dashboard.service drts-dashboard-tunnel.service; do
  orch_render_unit "$TEMPLATE_DIR/$unit" "$USER_UNIT_DIR/$unit" \
    "$ROOT_DIR" "$RELEASE_ROOT" "DASHBOARD_PORT=$DASHBOARD_PORT"
done

systemctl --user daemon-reload
systemctl --user enable --now drts-dashboard.service
systemctl --user enable --now drts-dashboard-tunnel.service

echo
echo "Dashboard: http://127.0.0.1:$DASHBOARD_PORT"
echo "Tunnel URL:"
echo "  journalctl --user -u drts-dashboard-tunnel | grep -o 'https://.*trycloudflare.com' | tail -1"
