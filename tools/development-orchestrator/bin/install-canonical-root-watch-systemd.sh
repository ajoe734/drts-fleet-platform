#!/usr/bin/env bash
# install-canonical-root-watch-systemd.sh
#
# Install the canonical-root branch drift watchdog as a systemd --user
# timer. Idempotent.
#
# Also seeds an env file at ~/.config/drts/canonical-root.env with the
# current active dispatch branch so the freshly-installed timer doesn't
# immediately fire false-positives for whatever wave branch the
# operator is currently parked on.

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
ENV_FILE="$ENV_DIR/canonical-root.env"

mkdir -p "$USER_UNIT_DIR" "$ENV_DIR"

for unit in drts-canonical-root-watch.service drts-canonical-root-watch.timer; do
  src="$TEMPLATE_DIR/$unit"
  dst="$USER_UNIT_DIR/$unit"
  orch_render_unit "$src" "$dst" "$ROOT_DIR" "$RELEASE_ROOT"
done

# Seed env file with current canonical-root branch unless it already exists.
if [[ ! -f "$ENV_FILE" ]]; then
  current_branch=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "dev")
  cat > "$ENV_FILE" <<EOF
# Comma-separated allow list of branches the canonical workspace root may
# be parked on. main and dev are always allowed in addition. Edit this
# file when the active wave / sprint branch changes; the watchdog
# picks up changes on the next tick.
ORCH_CANONICAL_BRANCH=$current_branch
EOF
  echo "Seeded: $ENV_FILE (current branch: $current_branch)"
else
  echo "Env file already exists: $ENV_FILE (not touched)"
fi

systemctl --user daemon-reload
systemctl --user enable --now drts-canonical-root-watch.timer

echo
echo "Timer status:"
systemctl --user --no-pager list-timers drts-canonical-root-watch.timer || true

echo
echo "To check drift now:"
echo "  tools/development-orchestrator/bin/canonical-root-watchdog.py"
echo
echo "To edit the allow list:"
echo "  \$EDITOR $ENV_FILE"
echo "  systemctl --user restart drts-canonical-root-watch.timer  # picks up immediately"
echo
echo "To audit recent branch switches in canonical root:"
echo "  tail -20 .orchestrator/logs/canonical-root-checkouts.jsonl"
