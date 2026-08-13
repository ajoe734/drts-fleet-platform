#!/usr/bin/env bash
set -euo pipefail

# IAM-UAT-002 Staging Journeys & Sign-Off Pack Verification Wrapper

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> Running IAM-UAT-002 Staging Journeys Verification Suite..."
cd "${REPO_ROOT}"

pnpm exec vitest run tests/security/iam-uat-002-staging-verification.test.ts

echo "==> IAM-UAT-002 Staging Journeys Verification Passed Successfully."
