# IAM-OP-AUTH-E2E-001 End-to-End Hermetic Acceptance Evidence Pack

- **Task ID**: `IAM-OP-AUTH-E2E-001`
- **Task Title**: Prove active tenant login and revocation end to end
- **Status**: `completed`
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **Execution Date**: `2026-08-15T13:00:00Z`
- **Execution Environment**: `local_hermetic_production_mode_harness` *(Hermetic local production-mode harness with deterministic RS256 OIDC provider; not live GCP cloud staging)*
- **Architecture Reference**: [`docs/02-architecture/iam-minimum-operational-readiness-gap-20260815.md`](../02-architecture/iam-minimum-operational-readiness-gap-20260815.md)
- **System Design Reference**: [`docs/02-architecture/iam-minimum-operational-closure-system-design-20260815.md`](../02-architecture/iam-minimum-operational-closure-system-design-20260815.md)
- **Execution Runbook Reference**: [`docs/03-runbooks/iam-minimum-operational-closure-execution-tasks-20260815.md`](../03-runbooks/iam-minimum-operational-closure-execution-tasks-20260815.md)

---

## 1. Dependency Commit Tracking & Provenance

This operational closure task integrates and proves the complete tenant authentication and revocation pipeline built across upstream tasks:

| Component / Task | Commit SHA | Description |
| :--- | :--- | :--- |
| **Baseline Repository** | `85d76c539e2f25bc97dcf1ec18a44aea4f0fc389` | Repository baseline prior to operational closure track |
| **`IAM-OP-AUTH-001`** | `6ffd458a48aad68af3b3a7f463e8bad8696becc8` | Strict production environment fail-closed defaults & tenant isolation |
| **`IAM-OP-OIDC-001`** | `4cd43f1a8a74442ae5b013831c2f54f514f4b7f4` | BFF PKCE session exchange, S256 challenge, and cookie security |
| **`IAM-OP-AUTH-E2E-001`** | *(Current Task Branch)* | Production-mode hermetic E2E acceptance suite & session revocation proofs |

---

## 2. Acceptance Criteria Verification Matrix

| # | Acceptance Criterion | Verification Layer & Evidence | Result |
| :- | :--- | :--- | :--- |
| **AC-1** | Active tenant-console login, PKCE callback, session exchange, authenticated read, proxy mutation, and logout pass in strict production mode (`DRTS_ENV=production`) | **Route & Service Layer (`tests/e2e/tenant-console-oidc-production.test.ts`)**<br>Deterministic local RSA 2048-bit RS256 provider verifies authorization URL redirect (307), S256 PKCE exchange, session cookie issuance, authenticated proxy read (200), CSRF-protected proxy write (200), and BFF logout (200). | **PASS** (198ms) |
| **AC-2** | State replay, wrong nonce, missing nonce, PKCE verifier mismatch, PKCE challenge mismatch, tampered state cookie, state parameter mismatch, missing CSRF token, cross-origin mutation, and unauthenticated negative cases fail closed | **Route & Service Layer (`tests/security/iam-tenant-session-revocation-e2e.test.ts`, `tests/unit/auth-oidc-pkce.test.ts`)**<br>Tampered state cookie (400), state parameter mismatch (`/login?error=AUTH_STATE_MISMATCH`), PKCE verifier mismatch (403), PKCE challenge mismatch (403), nonce mismatch (403), missing nonce (403), consumed state replay (403), missing CSRF header (403), tampered CSRF (403), and cross-origin mutation (403). | **PASS** (647ms / 103ms) |
| **AC-3** | Role downgrade (`tenant_admin` -> `tenant_viewer`), user suspension (`status: 'suspended'`), and explicit backend session revocation invalidate issued session tokens immediately | **Route & Service Layer (`tests/security/iam-tenant-session-revocation-e2e.test.ts`)**<br>Verified both at the service level (`jwtAuthService.verifyAccessToken` returns null) and at the HTTP route level: original session cookie is rejected with 401 on BFF `/api/auth/session`, control plane proxy `GET /control-plane-proxy/tenant/cost-centers` (401), and mutating proxy `POST /control-plane-proxy/tenant/cost-centers` (401). | **PASS** (647ms) |
| **AC-4** | Cross-tenant access and mutation attempts fail closed without leaking tenant or resource existence | **Route & Service Layer (`tests/security/iam-tenant-session-revocation-e2e.test.ts`)**<br>Comparing queries for resources that exist in another tenant (`CC-SEC-OTHER-001`, `usr-sec-other-001`) vs completely nonexistent resources (`CC-SEC-NONEXISTENT-999`, `usr-sec-nonexistent-999`) returns identical HTTP 404 `NOT_FOUND` status and response bodies via proxy. Cross-tenant mutation attempts on existing other tenant vs nonexistent tenant both fail with identical 403 `TENANT_SCOPE_MISMATCH`. Service-level user queries isolate tenant boundaries strictly. | **PASS** (647ms) |
| **AC-5** | Browser storage contains no bearer token, IdP token, code verifier, or raw secret | **Static AST & Dynamic Response Scan (`tests/security/iam-browser-storage-and-secret-leakage.test.ts`, `tests/e2e/tenant-console-oidc-production.test.ts`)**<br>Static AST/regex scan confirms 0 occurrences of token/secret storage in `localStorage`, `sessionStorage`, or `document.cookie` across source files. Dynamic inspection across all E2E HTTP steps confirms session and state cookies have `httpOnly: true`, `secure: true`, `sameSite: lax`; CSRF cookie is `sameSite: strict`; response bodies and headers contain zero raw IdP tokens, client secrets, JWT secrets, or code verifiers. | **PASS** (206ms) |
| **AC-6** | Global `logout-all` invalidates all active sessions for the principal | **Route & Service Layer (`tests/e2e/tenant-console-oidc-production.test.ts`)**<br>BFF `POST /api/auth/logout-all` terminates all active sessions for the principal; subsequent verification confirms all issued session tokens fail validation (`verifyAccessToken` returns null). | **PASS** (198ms) |

---

## 3. Test Runner & Execution Logs

### Runner Script: `tests/e2e/IAM-OP-AUTH-E2E-001-tenant-auth.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/.local/bin:$PATH"

echo "[1/3] Running Production-Mode Hermetic Tenant Console OIDC E2E Suite..."
pnpm exec vitest run tests/e2e/tenant-console-oidc-production.test.ts

echo "[2/3] Running Session Revocation, Downgrade, Suspension & Isolation Matrix..."
pnpm exec vitest run tests/security/iam-tenant-session-revocation-e2e.test.ts

echo "[3/3] Verifying Browser Storage and Secret Leakage Bounds..."
pnpm exec vitest run tests/security/iam-browser-storage-and-secret-leakage.test.ts
```

### Empirical Execution Output

```text
==============================================================================
Running IAM-OP-AUTH-E2E-001 Tenant Auth & Session Revocation Verification
==============================================================================
[1/3] Running Production-Mode Hermetic Tenant Console OIDC E2E Suite...

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001

 ✓ tests/e2e/tenant-console-oidc-production.test.ts (2 tests) 198ms
   ✓ IAM-OP-AUTH-E2E-001: Production-Mode Hermetic Tenant Console OIDC & Acceptance Suite (2)
     ✓ proves end-to-end active tenant login, callback exchange, session read, proxy write, and logout in strict production mode 99ms
     ✓ executes logout-all and invalidates all active sessions for the principal 98ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  12:57:20
   Duration  3.69s (transform 2.36s, setup 0ms, import 3.28s, tests 198ms, environment 0ms)

[2/3] Running Session Revocation, Downgrade, Suspension & Isolation Matrix...

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001

 ✓ tests/security/iam-tenant-session-revocation-e2e.test.ts (6 tests) 647ms
   ✓ IAM-OP-AUTH-E2E-001: Session Revocation, Downgrade, Suspension & Isolation Matrix (6)
     ✓ invalidates issued session token immediately upon user role downgrade 70ms
     ✓ invalidates issued session token immediately upon user suspension 96ms
     ✓ invalidates issued session token upon explicit backend session revocation 196ms
     ✓ enforces tenant isolation and rejects cross-tenant access and mutations without leaking existence 76ms
     ✓ enforces CSRF and same-origin validation on mutating proxy requests 104ms
     ✓ rejects state replay, tampered state cookie, PKCE verifier mismatch, and nonce mismatch 102ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  12:57:25
   Duration  4.21s (transform 2.42s, setup 0ms, import 3.35s, tests 647ms, environment 0ms)

[3/3] Verifying Browser Storage and Secret Leakage Bounds...

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001

 ✓ tests/security/iam-browser-storage-and-secret-leakage.test.ts (3 tests) 206ms
   ✓ IAM browser-storage and secret-leakage scan (3)
     ✓ does not persist auth secrets in browser storage or cookies 163ms
     ✓ enforces HttpOnly flags on session and state cookie configurations to block browser script access 40ms
     ✓ keeps IAM-UAT-001 evidence free of raw secret literals 1ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  12:57:30
   Duration  485ms (transform 74ms, setup 0ms, import 67ms, tests 206ms, environment 0ms)

==============================================================================
IAM-OP-AUTH-E2E-001 Verification COMPLETE: ALL TESTS PASSED (Hermetic Production Mode)
==============================================================================
```

---

## 4. Key Architectural Fixes & Implementations

1. **BFF State Cookie Synchronization & Roundtrip Matching**:
   - Stored `oauthState` in `OidcStatePayload` within [`apps/tenant-console-web/lib/auth/session.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001/apps/tenant-console-web/lib/auth/session.ts).
   - Validated callback state parameter against decrypted envelope state in [`apps/tenant-console-web/app/api/auth/[...auth]/route.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001/apps/tenant-console-web/app/api/auth/%5B...auth%5D/route.ts).

2. **Durable Session Tracking in OIDC Callback Session Exchange**:
   - Updated `exchangeTenantCallbackSession` in [`apps/api/src/modules/auth/oidc-pkce.service.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001/apps/api/src/modules/auth/oidc-pkce.service.ts) to issue sessions with canonical session tracking (`sessionId`, `tokenId`, `tokenVersion`, `authTime`, `amr`, `acr`, `policyVersion`) via `jwtAuthService.issueSessionToken`.

3. **Tenant Principal Resolution & Durable State Verification**:
   - Updated `validateDurableState` in [`apps/api/src/common/auth/jwt-auth.service.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001/apps/api/src/common/auth/jwt-auth.service.ts) to resolve tenant user ID from `payload.principalId`, `payload.actorId`, or `payload.sub`, ensuring role code and `updatedAt` version checks match persisted user state across demotions and suspensions.

4. **Hermetic Local Production-Mode OIDC Test Suite & Route-Level Security Matrices**:
   - Built [`tests/e2e/tenant-console-oidc-production.test.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001/tests/e2e/tenant-console-oidc-production.test.ts) featuring a deterministic RSA 2048-bit RS256 local provider verifying S256 PKCE, JWKS key publishing, ID token issuance, cookie handling, proxy routing, dynamic response secret scanning, and logout-all.
   - Built [`tests/security/iam-tenant-session-revocation-e2e.test.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-op-auth-e2e-001/tests/security/iam-tenant-session-revocation-e2e.test.ts) verifying:
     - Tampered state cookie rejection (400)
     - State parameter mismatch redirection (`/login?error=AUTH_STATE_MISMATCH`)
     - PKCE verifier mismatch (tampered codeVerifier in state envelope -> 403 `AUTH_SESSION_EXCHANGE_DENIED`)
     - PKCE challenge mismatch (auth code issued for mismatched challenge -> 403 `AUTH_SESSION_EXCHANGE_DENIED`)
     - Nonce mismatch (IdP ID token nonce mismatch -> 403 `AUTH_SESSION_EXCHANGE_DENIED`)
     - Missing nonce (IdP ID token lacking nonce claim -> 403 `AUTH_SESSION_EXCHANGE_DENIED`)
     - Successful first exchange (307 redirect with session and CSRF cookies)
     - State replay rejection (consumed state -> 403 `AUTH_SESSION_EXCHANGE_DENIED`)
     - User role downgrade token invalidation at both service level and route level (`/api/auth/session`, proxy GET, proxy POST return 401)
     - User suspension token invalidation at both service level and route level (401)
     - Backend session revocation invalidation at both service level and route level (401)
     - Cross-tenant isolation without existence leakage (comparing existing-in-other-tenant vs nonexistent resource queries yields identical 404 status and payload; cross-tenant mutations fail closed with 403)
     - CSRF and same-origin validation on mutating proxy requests
