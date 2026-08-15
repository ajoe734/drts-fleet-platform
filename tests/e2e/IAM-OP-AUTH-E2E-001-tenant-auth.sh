#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# IAM-OP-AUTH-E2E-001: Active Tenant Login, Revocation, and Isolation Test Suite
#
# Proves production-mode hermetic tenant-console/API acceptance harness with
# deterministic local OIDC provider (RS256, S256 PKCE, durable sessions,
# CSRF protection, role downgrade, suspension, backend revocation, and tenant isolation).
# ==============================================================================

echo "=============================================================================="
echo "Running IAM-OP-AUTH-E2E-001 Tenant Auth & Session Revocation Verification"
echo "=============================================================================="

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/.local/bin:$PATH"

echo "[1/3] Running Production-Mode Hermetic Tenant Console OIDC E2E Suite..."
pnpm exec vitest run tests/e2e/tenant-console-oidc-production.test.ts

echo "[2/3] Running Session Revocation, Downgrade, Suspension & Isolation Matrix..."
pnpm exec vitest run tests/security/iam-tenant-session-revocation-e2e.test.ts

echo "[3/3] Verifying Browser Storage and Secret Leakage Bounds..."
pnpm exec vitest run tests/security/iam-browser-storage-and-secret-leakage.test.ts

echo "=============================================================================="
echo "IAM-OP-AUTH-E2E-001 Verification COMPLETE: ALL TESTS PASSED (Hermetic Production Mode)"
echo "=============================================================================="
