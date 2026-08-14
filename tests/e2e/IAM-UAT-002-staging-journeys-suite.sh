#!/usr/bin/env bash
set -euo pipefail

# IAM-UAT-002 Staging Journeys & Sign-Off Pack Verification Suite Entrypoint

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> Running IAM-UAT-002 Staging Journeys Verification Suite..."
cd "${REPO_ROOT}"

echo "--> Step 1: Running IAM-UAT-002 Staging Verification Test (8 Journeys per Plan §19.5)..."
pnpm exec vitest run tests/security/iam-uat-002-staging-verification.test.ts

echo "--> Step 2: Running Core Auth & Policy Unit Suite (J1-J8)..."
pnpm exec vitest run \
  tests/unit/auth-oidc-pkce.test.ts \
  tests/unit/break-glass.service.test.ts \
  tests/unit/driver-device-session.test.ts \
  tests/unit/internal-key-exception-registry.test.ts \
  tests/unit/step-up-iap-path.test.ts \
  tests/unit/step-up-policy-catalog.test.ts

echo "--> Step 3: Running Staging Integration & Governance Suite..."
pnpm exec vitest run \
  tests/integration/iap-subject-adapter.integration.test.ts \
  tests/integ/oidc-pkce-bff.test.ts \
  tests/integ/tenant-governance-negative.test.ts \
  tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts \
  tests/integration/driver-device-session.integration.test.ts \
  tests/integration/access-review.integration.test.ts \
  tests/integration/iam-observability-alerts.integration.test.ts

echo "--> Step 4: Running Partner Credentials & Workload Identity Suite (@drts/api)..."
pnpm --filter @drts/api exec vitest run \
  tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts \
  tests/integration/service-workload-identity.integration.test.ts

echo "--> Step 5: Verifying Internal Key Exceptions & Incident Response Drills..."
python3 operations/security/verify-internal-key-exceptions.py
python3 operations/security/iam-incident-response-drill.py run-all-drills

echo "--> Step 6: Running Security Negative Matrix & Secret Leakage Audits..."
pnpm exec vitest run \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/security/iam-credential-expiry.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/security/iam-browser-storage-and-secret-leakage.test.ts

echo "==> IAM-UAT-002 Staging Journeys Verification Suite Passed Successfully."

