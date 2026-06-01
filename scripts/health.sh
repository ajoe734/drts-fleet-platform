#!/usr/bin/env bash
# Thin bash wrapper around scripts/health.py. See its docstring for options.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT_DIR/scripts/health.py" "$@"
