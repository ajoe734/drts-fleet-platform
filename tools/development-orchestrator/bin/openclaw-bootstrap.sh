#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PIN_PATH="$ROOT_DIR/tools/development-orchestrator/openclaw/pin.json"
RUNTIME_ROOT="${DRTS_OPENCLAW_RUNTIME_ROOT:-$ROOT_DIR/.local/openclaw}"

read_pin() {
  python3 - "$PIN_PATH" "$1" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
value = payload
for part in sys.argv[2].split("."):
    value = value[part]
print(value)
PY
}

require_node() {
  local minimum
  minimum="$(read_pin node_engine)"
  node - "$minimum" <<'NODE'
const actual = process.versions.node.split(".").map(Number);
const minimum = process.argv[2].replace(/^>=/, "").split(".").map(Number);
for (let i = 0; i < minimum.length; i += 1) {
  const a = actual[i] ?? 0;
  const b = minimum[i] ?? 0;
  if (a > b) process.exit(0);
  if (a < b) {
    console.error(`Node ${process.versions.node} does not satisfy ${process.argv[2]}`);
    process.exit(1);
  }
}
NODE
}

verify_integrity() {
  local file_path="$1"
  local expected="$2"
  node - "$file_path" "$expected" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const filePath = process.argv[2];
const expected = process.argv[3];
const digest = crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
const actual = `sha512-${digest}`;
if (actual !== expected) {
  console.error(`Integrity mismatch for ${filePath}`);
  console.error(`expected: ${expected}`);
  console.error(`actual:   ${actual}`);
  process.exit(1);
}
NODE
}

main() {
  local package version tarball_url integrity install_dir cache_dir tarball_path cli_path
  package="$(read_pin package)"
  version="$(read_pin version)"
  tarball_url="$(read_pin tarball_url)"
  integrity="$(read_pin integrity)"
  install_dir="$RUNTIME_ROOT/install/$version"
  cache_dir="$RUNTIME_ROOT/cache"
  tarball_path="$cache_dir/${package}-${version}.tgz"
  cli_path="$install_dir/node_modules/.bin/openclaw"

  mkdir -p "$cache_dir" "$install_dir"
  require_node

  if [[ ! -f "$tarball_path" ]]; then
    curl -fsSL "$tarball_url" -o "$tarball_path"
  fi
  verify_integrity "$tarball_path" "$integrity"

  if [[ ! -x "$cli_path" ]]; then
    if [[ ! -f "$install_dir/package.json" ]]; then
      printf '{\n  "name": "drts-openclaw-runtime",\n  "private": true\n}\n' > "$install_dir/package.json"
    fi
    npm install \
      --prefix "$install_dir" \
      --no-package-lock \
      --no-save \
      "$tarball_path" >/dev/null
  fi

  ln -sfn "$install_dir" "$RUNTIME_ROOT/current"

  cat <<EOF
OPENCLAW_CLI=$cli_path
OPENCLAW_RUNTIME_ROOT=$RUNTIME_ROOT
OPENCLAW_PINNED_VERSION=$version
EOF
}

main "$@"
