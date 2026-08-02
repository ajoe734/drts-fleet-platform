#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

run() {
  echo ""
  echo "[IAM-UAT-001] $*"
  "$@"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set for IAM-UAT-001 durable-session and hermetic E2E checks." >&2
  exit 1
fi

run pnpm exec vitest run \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/security/iam-browser-storage-and-secret-leakage.test.ts \
  tests/security/iam-credential-expiry.test.ts \
  tests/integration/iap-subject-adapter.integration.test.ts \
  tests/integration/auth-startup-config.integration.test.ts \
  tests/unit/security-events.test.ts

run pnpm --filter @drts/api exec vitest run \
  tests/integration/identity-session-db.integration.test.ts \
  tests/integration/jwt-session-claims.integration.test.ts \
  --no-file-parallelism --maxConcurrency=1

if [[ "${IAM_UAT_SKIP_E2E:-0}" != "1" ]]; then
  run ./tests/e2e/run-e2e-hermetic.sh 004 018
fi
