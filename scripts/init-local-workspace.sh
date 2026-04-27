#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT_DIR/.local"
LOCAL_README="$LOCAL_DIR/README.md"

mkdir -p "$LOCAL_DIR"

if [[ ! -f "$LOCAL_README" ]]; then
  cat >"$LOCAL_README" <<'EOF'
# Local Workspace

This directory is intentionally gitignored.

Use it for machine-specific or reviewer-specific scratch artifacts that should
never be committed, such as:

- temporary URLs
- one-off curl payloads
- firewall or port reminders
- local debugging notes
- personal checklists

Prefer:

- `docs/03-runbooks/local-development.local.md` for VM dev endpoint notes
- `.env` / `.env.local` for runtime configuration overrides
- `.local/` for everything else that is local-only
EOF
  echo "Created local scratch README: $LOCAL_README"
else
  echo "Local scratch README already exists: $LOCAL_README"
fi

"$ROOT_DIR/scripts/init-local-development-overlay.sh"

echo "Local workspace is ready."
