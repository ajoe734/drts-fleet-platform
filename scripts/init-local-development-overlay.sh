#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/docs/03-runbooks/local-development.local.example.md"
TARGET_FILE="$ROOT_DIR/docs/03-runbooks/local-development.local.md"

if [[ -f "$TARGET_FILE" ]]; then
  echo "Local development overlay already exists: $TARGET_FILE"
  exit 0
fi

cp "$SOURCE_FILE" "$TARGET_FILE"
echo "Created local development overlay: $TARGET_FILE"
echo "This file is gitignored and safe for machine-specific notes."
