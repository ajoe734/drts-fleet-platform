#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-}"
DEFAULT_PORT="${2:-}"

if [[ -z "$APP_NAME" || -z "$DEFAULT_PORT" ]]; then
  echo "Usage: $0 <app-name> <default-port>" >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/$APP_NAME"
STANDALONE_ROOT="$APP_DIR/.next/standalone"
STANDALONE_APP_DIR="$STANDALONE_ROOT/apps/$APP_NAME"

if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  echo "Missing standalone server for $APP_NAME. Run: pnpm --filter @drts/$APP_NAME build" >&2
  exit 66
fi

if [[ -d "$APP_DIR/.next/static" ]]; then
  mkdir -p "$STANDALONE_APP_DIR/.next"
  rm -rf "$STANDALONE_APP_DIR/.next/static"
  cp -a "$APP_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"
fi

if [[ -d "$APP_DIR/public" ]]; then
  rm -rf "$STANDALONE_APP_DIR/public"
  mkdir -p "$STANDALONE_APP_DIR/public"
  cp -a "$APP_DIR/public/." "$STANDALONE_APP_DIR/public/"
fi

export PORT="${PORT:-$DEFAULT_PORT}"
cd "$STANDALONE_ROOT"
exec node "apps/$APP_NAME/server.js"
