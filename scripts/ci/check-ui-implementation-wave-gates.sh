#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

echo "==> Gate 1/6: contracts compile"
pnpm --filter @drts/contracts build

echo "==> Gate 2/6: docs landed"
require_file "docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md"
require_file "docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md"
require_file "docs/04-api/ui-functional-contracts-20260524.md"
require_file "docs/01-product/driver-app-multi-platform-product-spec-20260507.amendment-20260524.md"
require_file "docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.amendment-20260524.md"
require_file "docs/02-architecture/ui-authority-actions-contract-20260524.md"
require_file "docs/02-architecture/search-and-empty-state-contract-20260524.md"
require_file "docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md"
require_file "docs/02-architecture/driver-platform-binding-and-offline-contract-20260524.md"

echo "==> Gate 3/6: backend support"
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test

echo "==> Gate 4/6: api-client typed adoption"
pnpm --filter @drts/api-client typecheck

echo "==> Gate 5/6: app adoption"
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/tenant-console-web typecheck
pnpm --filter @drts/driver-app typecheck

echo "==> Gate 6/6: action-authority discipline and smoke anchors"
./scripts/ci/check-bff-only-imports.sh
grep -Fq "add cross-app smoke coverage;" docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md
grep -Fq "add tests for action disabled state;" docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md
grep -Fq "no UI action authority drift." docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md

echo "All phase1-ui-implementation-wave-202605 gates passed."
