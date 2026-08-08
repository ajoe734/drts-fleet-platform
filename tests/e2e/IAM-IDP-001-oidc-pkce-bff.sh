#!/usr/bin/env bash
set -euo pipefail

# IAM-IDP-001 OIDC PKCE BFF Automated E2E Runner
# Tests OIDC login initiation, PKCE S256 parameters, authorization code exchange,
# callback negative matrix, active membership resolution, and CSRF protection.

echo "============================================================"
echo "Running IAM-IDP-001 OIDC PKCE BFF Automated E2E Test Suite"
echo "============================================================"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Step 1: Run unit and API contract tests for auth OIDC PKCE
echo "[1/3] Running Vitest OIDC PKCE unit & integration matrix..."
pnpm --filter @drts/api test auth-oidc-pkce.test.ts

# Step 2: Run bootstrap auth tests
echo "[2/3] Running Vitest bootstrap auth security matrix..."
pnpm --filter @drts/api test auth-bootstrap.test.ts

# Step 3: Run E2E integration test suite for OIDC PKCE
echo "[3/3] Verifying Web BFF Auth routes, real provider OIDC exchange, and middleware boundaries..."
pnpm vitest run tests/integ/oidc-pkce-bff.test.ts tests/e2e/oidc-pkce-bff.spec.ts

echo "============================================================"
echo "IAM-IDP-001 OIDC PKCE BFF E2E Verification COMPLETE - SUCCESS"
echo "============================================================"
