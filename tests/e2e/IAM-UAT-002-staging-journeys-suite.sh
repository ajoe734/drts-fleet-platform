#!/usr/bin/env bash
set -euo pipefail

# IAM-UAT-002 Staging Journeys & Sign-Off Pack Verification Suite Entrypoint

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> Running IAM-UAT-002 Staging Journeys Verification Suite..."
cd "${REPO_ROOT}"

echo "--> Step 1: Running IAM-UAT-002 Staging Verification Test (8 Journeys per Plan §19.5)..."
pnpm exec vitest run tests/security/iam-uat-002-staging-verification.test.ts

echo "--> Step 2: Running IAM Unit Test Suite (Auth OIDC PKCE, Break Glass, Driver Session, Key Registry, Step-Up)..."
pnpm exec vitest run \
  tests/unit/auth-oidc-pkce.test.ts \
  tests/unit/break-glass.service.test.ts \
  tests/unit/driver-device-session.test.ts \
  tests/unit/internal-key-exception-registry.test.ts \
  tests/unit/step-up-iap-path.test.ts \
  tests/unit/step-up-policy-catalog.test.ts

echo "--> Step 3: Verifying Internal Key Exceptions (IAM-SVC-002)..."
python3 scripts/verify-internal-key-exceptions.py

echo "--> Step 4: Executing IAM Incident Response & Key Rotation Drills (IAM-IR-001)..."
python3 scripts/iam-incident-response-drill.py run-all-drills

echo "--> Step 5: Running Security Negative Matrix & Secret Leakage Audits..."
pnpm exec vitest run \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/security/iam-credential-expiry.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/security/iam-browser-storage-and-secret-leakage.test.ts

echo "==> IAM-UAT-002 Staging Journeys Verification Suite Passed Successfully."
