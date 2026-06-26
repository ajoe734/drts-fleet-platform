#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

pnpm --filter @drts/api exec vitest run \
  tests/integration/int-p2-008-roc-human-fallback.test.ts
