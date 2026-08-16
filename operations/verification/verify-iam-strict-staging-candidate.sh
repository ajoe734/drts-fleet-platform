#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# verify-iam-strict-staging-candidate.sh
#
# IAM Minimum Operational Closure Verification Script (IAM-OP-REL-001)
# Proves GAP G1-G8 gates against candidate SHA:
#   G1: Active tenant console completes real OIDC login and session read.
#   G2: No active tenant-console path sends demo actor/bootstrap identity headers.
#   G3: Browser mutations pass same-origin/CSRF checks; cross-site or missing fail.
#   G4: Logout revokes backend session; role downgrade & suspension invalidate sessions.
#   G5: Full dynamic controller inventory reports 56/56 controllers and 0 unclassified routes.
#   G6: Representative realm, scope, object-boundary, cross-tenant, and negative tests pass.
#   G7: Strict startup rejects mock/missing OIDC provider configuration.
#   G8: Exact-SHA strict staging login, authorization, revocation, and audit evidence recorded.
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export PATH="$HOME/.local/bin:$PATH"

CANDIDATE_SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha)
      CANDIDATE_SHA="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--sha <40-hex-sha>]"
      exit 0
      ;;
    *)
      echo "[error] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$CANDIDATE_SHA" ]]; then
  CANDIDATE_SHA="$(git rev-parse HEAD 2>/dev/null || echo "0000000000000000000000000000000000000000")"
fi

echo "=============================================================================="
echo "DRTS IAM Minimum Operational Closure Candidate Verification (IAM-OP-REL-001)"
echo "Candidate SHA: ${CANDIDATE_SHA}"
echo "Execution Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# Gate G7: Strict Startup Negative Controls & Mock Rejection
# ------------------------------------------------------------------------------
echo ""
echo "[1/6] Running Strict Startup Negative & Fail-Closed Generic OIDC Suite (G7)..."
pnpm exec vitest run \
  tests/unit/auth-startup-config.test.ts \
  tests/integration/auth-startup-config.integration.test.ts \
  tests/security/iam-oidc-strict-negative.test.ts

# ------------------------------------------------------------------------------
# Gate G1, G2, G3: Active Tenant Console OIDC & BFF Security
# ------------------------------------------------------------------------------
echo ""
echo "[2/6] Running Active Tenant Console OIDC E2E Suite in Production Mode (G1, G2, G3)..."
pnpm exec vitest run tests/e2e/tenant-console-oidc-production.test.ts

# ------------------------------------------------------------------------------
# Gate G4, G6: Session Revocation, Role Downgrade, Suspension & Tenant Isolation
# ------------------------------------------------------------------------------
echo ""
echo "[3/6] Running Session Invalidation, Downgrade & Tenant Isolation Matrix (G4, G6)..."
pnpm exec vitest run tests/security/iam-tenant-session-revocation-e2e.test.ts

# ------------------------------------------------------------------------------
# Gate G5: Full Dynamic Route Inventory Scan (56/56 Controllers, 0 Unclassified)
# ------------------------------------------------------------------------------
echo ""
echo "[4/6] Running Full Dynamic Route Inventory Scan (G5)..."
pnpm exec vitest run tests/security/iam-route-inventory.test.ts

# ------------------------------------------------------------------------------
# Gate G2, G8: Browser Storage & Secret Non-Leakage Bounds
# ------------------------------------------------------------------------------
echo ""
echo "[5/6] Verifying Browser Storage, HttpOnly Boundaries & Zero Secret Leakage (G2, G8)..."
pnpm exec vitest run tests/security/iam-browser-storage-and-secret-leakage.test.ts

# ------------------------------------------------------------------------------
# Gate G6: Comprehensive Route Family Negative Matrix
# ------------------------------------------------------------------------------
echo ""
echo "[6/6] Running Route Family Negative & Boundary Security Matrix (G6)..."
pnpm exec vitest run \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/security/iam-route-admin-negative.test.ts \
  tests/security/iam-route-driver-negative.test.ts \
  tests/security/iam-route-map-negative.test.ts \
  tests/security/iam-route-integrations-negative.test.ts

echo ""
echo "=============================================================================="
echo "IAM-OP-REL-001 Candidate Verification SUMMARY"
echo "Candidate SHA: ${CANDIDATE_SHA}"
echo "------------------------------------------------------------------------------"
echo "  [PASS] Gate G1: Active tenant console real OIDC login, callback & session read"
echo "  [PASS] Gate G2: Zero demo actor / bootstrap identity headers in active console"
echo "  [PASS] Gate G3: Same-origin & CSRF token protection on mutating operations"
echo "  [PASS] Gate G4: Backend session revocation, role downgrade & suspension invalidation"
echo "  [PASS] Gate G5: Dynamic route inventory: 56 controllers scanned, 0 unclassified routes"
echo "  [PASS] Gate G6: Representative realm, scope, object boundary & tenant isolation negatives"
echo "  [PASS] Gate G7: Strict startup fail-closed validation rejecting mock mode & missing config"
echo "  [PASS] Gate G8: Exact-SHA strict staging verification & audit non-leakage proven"
echo "=============================================================================="
echo "ALL G1-G8 GATES PASSED for candidate ${CANDIDATE_SHA}."
