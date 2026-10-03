#!/usr/bin/env bash
# Hosted runner only. Python owns signal handling, evidence and cleanup.
set -euo pipefail
set +x
exec python3 "$(dirname "$0")/restore_drill.py" "$@"
