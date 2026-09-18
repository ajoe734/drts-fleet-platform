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

# shellcheck source=../systemd/install-common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../systemd" && pwd)/install-common.sh"
ROOT_DIR="$(orch_canonical_root "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)")"
RELEASE_ROOT="$(orch_release_root "$ROOT_DIR")"
orch_require_release "$RELEASE_ROOT"
# The unit definition comes from the same pinned release as the code it
# points at, so the two cannot describe different versions.
TEMPLATE_DIR="$RELEASE_ROOT/tools/development-orchestrator/systemd"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$USER_UNIT_DIR"

for unit in drts-health.service drts-health.timer; do
  src="$TEMPLATE_DIR/$unit"
  dst="$USER_UNIT_DIR/$unit"
  orch_render_unit "$src" "$dst" "$ROOT_DIR" "$RELEASE_ROOT"
done

systemctl --user daemon-reload
systemctl --user enable --now drts-health.timer

echo
echo "Timer status:"
systemctl --user --no-pager list-timers drts-health.timer || true

echo
echo "To take a snapshot now:"
echo "  tools/development-orchestrator/bin/health.sh"
echo
echo "Last probe status:"
echo "  systemctl --user status drts-health"
echo
echo "All probe history:"
echo "  journalctl --user -u drts-health --since '1 hour ago'"
