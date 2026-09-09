# SR-QA-WEBHOOK-001-FIX-TENANT-BINDING — C111 API Key Tenant Header Binding Repair

- **Task ID**: `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING`
- **Owner**: `Codex` (reassigned from Gemini on 2026-09-09)
- **Reviewer**: `Codex2`
- **Wave / Phase**: `system-remediation-20260906`
- **Capability ID**: `C111`
- **Parent Task**: `SR-QA-WEBHOOK-001`
- **Base Commit**: `7d0483305988e0b04c8f25b29b6ae61726a4b132` (on `dev`)
- **Execution Branch**: `gemini/sr-qa-webhook-001-fix-tenant-binding-scoped-20260909`

---

## 1. Issue Background & Root Cause Analysis

### 1.1 Source & Reproduction

- **Source**: `SR-QA-WEBHOOK-001` / `C111`.
- **Historical Reproduction**: Commit `6b9de8287abb48e5770524c3addf5e5e41f8f663` and historical regression evidence recorded in commit `9d77ea52e88d8bb3b5421d2a689624c8c9d8f492` (evidence ref: `sr-qa-webhook-001:evidence-auth-http.json`).
- **Defect Description**:
  When an authenticated caller with a valid JWT for Tenant B sent a request to `GET /api/tenant/api-keys` with header `x-tenant-id: <Tenant A>`, the server returned HTTP 200 along with Tenant A's active API keys and key metadata.
  This represented a critical cross-tenant data leakage vulnerability: the endpoint was trusting the unverified `x-tenant-id` request header without validating that the authenticated principal's tenant identity matched the requested tenant scope.

### 1.2 Root Cause

In `TenantPartnerController`:

```typescript
@Get("tenant/api-keys")
listApiKeys(
  @Headers("x-tenant-id") tenantId?: string,
  @Headers("x-request-id") requestId?: string,
) {
  const items = this.tenantPartnerService.listApiKeys(
    this.requireTenantId(tenantId),
  );
  return toApiSuccessEnvelope(toApiListData(items), requestId);
}
```

1. `listApiKeys` did not inject `@CurrentIdentity()` and did not pass the caller's identity context down to the service layer.
2. `TenantPartnerService.listApiKeys(tenantId)` filtered `this.apiKeys` strictly by the `tenantId` parameter from the header, without asserting tenant boundary against the caller's authenticated identity.
3. In contrast, tenant mutation endpoints (`issueApiKey`, `rotateApiKey`, `revokeApiKey`) were already receiving `identity` and invoking `assertTenantMutationScope`, but read operations lacked tenant binding checks.

---

## 2. Solution & Implementation Details

Minimal, surgical repairs strictly adhering to the authorized write scopes (`apps/api/src/modules/tenant-partner/`):

### 2.1 `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`

- Added `@CurrentIdentity() identity?: IdentityContext | null` to `listApiKeys`.
- Maintained backward compatibility for direct TypeScript calls (`controller.listApiKeys(tenantId, requestId, identity)` or `controller.listApiKeys(tenantId, requestId)`).
- Forwarded the resolved identity to `tenantPartnerService.listApiKeys(resolvedTenantId, resolvedIdentity)`.
- Decorated all constructor parameters with explicit `@Inject(...)` tokens (`@Inject(TenantPartnerService)`, `@Inject(BillingSettlementService)`, etc.) to ensure robust NestJS DI dependency resolution under environments without runtime decorator metadata emission (e.g. Vite/Vitest).

### 2.2 `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`

- Updated `listApiKeys(tenantId: string, identity?: IdentityContext | null)` to accept the caller's identity context.
- Implemented `assertTenantAccessScope(targetTenantId, identity, action = "access")`:
  - If `!identity`, permits internal/test calls without identity context.
  - If `identity` is platform admin or system actor (`realm: "platform" | "system"`, `actorType: "platform_admin" | "system"`), permits cross-tenant access.
  - If `identity.tenantId !== targetTenantId`, throws `ApiRequestError(HttpStatus.FORBIDDEN, "TENANT_SCOPE_MISMATCH", "Cross-tenant identity access is forbidden. Principal tenantId does not match target tenantId.", { targetTenantId, principalTenantId })`.
- Delegated `assertTenantMutationScope(targetTenantId, identity)` to `assertTenantAccessScope(targetTenantId, identity, "mutation")`, maintaining exact error codes, status, and messages for existing mutation endpoints.
- Decorated constructor parameters with explicit `@Inject(...)` tokens (`@Inject(AuditNotificationService)`, `@Inject(TenantPartnerRepository)`, etc.) for deterministic DI resolution.

---

## 3. Verification & Acceptance Evidence

### 3.1 Unit Test Suite (`tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/tenant-binding.test.ts`)

Executes without server or compose dependencies per VM restriction:

- **Cross-tenant GET**:
  - Tenant B identity with Tenant A `x-tenant-id` throws 403 `TENANT_SCOPE_MISMATCH`.
  - Direct service call `service.listApiKeys(TENANT_A, tenantBIdentity)` throws 403 `TENANT_SCOPE_MISMATCH`.
  - Zero victim key metadata leaked to Tenant B.
- **Cross-tenant Mutations**:
  - `issueApiKey` across tenants throws 403 `TENANT_SCOPE_MISMATCH`, Tenant A keys untouched.
  - `rotateApiKey` with victim tenant header throws 403 `TENANT_SCOPE_MISMATCH`.
  - `rotateApiKey` with own header but victim `apiKeyId` throws 404 `API_KEY_NOT_FOUND`.
  - `revokeApiKey` with victim tenant header throws 403 `TENANT_SCOPE_MISMATCH`.
  - `revokeApiKey` with own header but victim `apiKeyId` throws 404 `API_KEY_NOT_FOUND`.
  - State immutability verified: victim keys remain active and unrotated.
- **Same-tenant Lifecycle**:
  - Tenant A can issue, list, rotate, and revoke their own keys successfully.
  - Token formats match `tk_*`. Key statuses follow `active -> overlap_active -> revoked`.
- **Platform & System Roles**:
  - Platform admin and system actors retain cross-tenant access authority.
- **Backward Compatibility**:
  - Internal and legacy callers without `identity` context continue to function seamlessly.

### 3.2 Full AppModule E2E Test Suite (`tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts`)

- Consistently loads candidate compiled `AppModule` (`apps/api/dist/app.module.js`) and all runtime DI class tokens (`DatabaseService`, `JwtAuthService`, `StepUpProofService`, `TenantPartnerRepository`, `TenantPartnerService`, `TenantPartnerController`, etc.) via `apiRequire` anchored to `apps/api/package.json`.
- Compiles the current checkout with `pnpm --filter '@drts/api...' build` before loading those tokens, including workspace dependencies. Compilation is bounded to 120 seconds and failures propagate; existing dist is never accepted without rebuilding.
- Fails explicitly with actionable error instructions if candidate compiled artifacts are missing, preventing silent fallback to uncompiled source.
- Verifies complete NestJS `AppModule` structure, route metadata, and real DI wiring without server startup:
  - Asserts constructor self-declared dependency injection metadata (`self:paramtypes`) as well as TypeScript emitted metadata (`design:paramtypes`) on `TenantPartnerController` and `TenantPartnerService`.
  - Creates a real full `AppModule` application context (`NestFactory.createApplicationContext(AppModule, { logger: false })`) and asserts real DI container resolution of all providers and injection of `tenantPartnerService` into `TenantPartnerController`.
- Configures full `AppModule` DI wiring (`DatabaseService`, `JwtAuthService`, `StepUpProofService`, `TenantPartnerRepository`, `TenantPartnerService`) and production `APP_GUARD`, `APP_INTERCEPTOR` (`SnakeCaseInterceptor`), and `APP_FILTER`.
- Issues authentic two-tenant JWTs with trusted MFA fixtures (`amr: ["mfa", "totp"]`, `acr: "aal2"`).
- Tests cross-tenant mutations (`issue`, `rotate`, `revoke`) with valid caller-bound step-up proofs, asserting HTTP 403 `TENANT_SCOPE_MISMATCH` and verifying DB state immutability.
- Tests same-tenant HTTP lifecycle with wire `snake_case` serialization (`api_key.api_key_id`).
- Asserts SQL readback states for all credential lifecycles (`active`, `overlap_active`, `revoked`) and timestamps.

### 3.3 Verification Commands Run & Results

```bash
# 1. Unit tests:
pnpm exec vitest run tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ --no-file-parallelism --maxConcurrency=1
# Output: 5 passed (5)

# 2. E2E tests (real full AppModule DI verification without server startup / PG test gated by DATABASE_URL):
pnpm exec vitest run tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ --no-file-parallelism --maxConcurrency=1
# Output: 1 passed, 1 skipped (2)

# 3. Typecheck:
pnpm --filter @drts/api typecheck
# Output: tsc -p tsconfig.json --noEmit (Exit status 0)

# 4. ESLint check:
pnpm exec eslint tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ apps/api/src/modules/tenant-partner/tenant-partner.controller.ts apps/api/src/modules/tenant-partner/tenant-partner.service.ts
# Output: clean (Exit status 0)

# 5. Git diff check:
git diff --check
# Output: clean (Exit status 0)
```

---

## 4. Modified Artifacts

- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/tenant-binding.test.ts`
- `tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-QA-WEBHOOK-001-FIX-TENANT-BINDING.md`

## 5. Codex takeover: CI repair (2026-09-09)

PR1841 head `5b6178d4bff1b08c76b147e55a211cbecd2a4ffa` failed both
[integration unit](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34304726797/job/102319286045)
and [product smoke](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34304726830/job/102319059629)
at collection: the harness required `apps/api/dist/app.module.js`, but those jobs
do not build the API first. Both logs show the five scoped unit tests passing.
The harness now compiles before requiring the emitted AppModule, preserving
real Nest metadata and using current source even when an old dist exists.
No workflow or product source changes were needed for this repair.

Full two-tenant JWT HTTP/PostgreSQL acceptance remains outstanding. This worker
VM prohibits HTTP servers and Compose; local harness checks must unset
`DATABASE_URL` and run only the application-context test. A skipped HTTP test
does not satisfy `full_appmodule_two_tenant_jwt_http_sql_candidate_evidence`.
The allowed acceptance environment must run this harness with PostgreSQL and
`DRTS_WEBHOOK_AUTH_EVIDENCE` set on the exact candidate, then retain the passing
test log and generated evidence. Same-candidate review, CI, merge, and external
acceptance remain lifecycle gates.

Takeover verification:

- `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ --no-file-parallelism --maxConcurrency=1`: **6 passed, 1 skipped**, two files passed; 36.93 seconds. The HTTP/PG case was the skipped test.
- `pnpm --filter @drts/api typecheck`: passed.
- Scoped ESLint (controller, service, unit and E2E directories): passed.
- `git diff --check`: passed.
- Additional `pnpm exec tsc --noEmit`: failed on missing workspace modules in unrelated web apps (`@drts/api-client`, `@drts/ui-tokens`, `@drts/ui-web/canvas-tokens`) and `pg` in `uv-exec-010-checkpoint.integration.test.ts`; two downstream implicit-any errors accompanied the missing API client. This is not recorded as a passing root check.
- Local dependency links initially pointed through shared canonical `node_modules` into the removed `codex-sr-deps-report-font-001` worktree. Only this worker's API/contracts/control-plane-auth dependency directories were isolated and relinked to existing pnpm packages and this checkout's workspace packages before the successful run. No tracked dependency files or canonical links were changed.

## 6. Follow-up CI harness isolation (2026-09-09)

Candidate `ec545b0771bfb215de20a827acc2c3bfc19421bd` failed the
[integration unit job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34307459031/job/102327226301):
the composition check connected to the shared, unmigrated CI database and failed
on `iam.identity_role_bindings`; the HTTP fixture seeded a privileged API key
without an authenticated actor and received `AUTHENTICATION_REQUIRED`.
The smoke workflow likewise runs root tests before migrations.

The composition check now clears `DATABASE_URL` for its application context and
restores environment stubs after each test. HTTP acceptance explicitly uses
`DRTS_TENANT_BINDING_DATABASE_URL`, pointing to a dedicated, migrated localhost
PostgreSQL database. It initializes the full application before issuing sessions
and seeds the victim key with the identity from its verified JWT. Supplying an
evidence output path without the dedicated database now fails collection instead
of producing a misleading successful skipped acceptance run.

Allowed-environment acceptance command (not permitted on this worker VM):

```bash
# First provision a dedicated localhost test database and apply repository migrations.
# Set DRTS_TENANT_BINDING_DATABASE_URL to its PostgreSQL URL.
DRTS_WEBHOOK_AUTH_EVIDENCE=/tmp/tenant-binding-evidence.json \
  pnpm exec vitest run tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ \
  --no-file-parallelism --maxConcurrency=1
```

This supersedes the earlier DATABASE_URL-only invocation. Both tests must pass
without skips on the candidate; ordinary CI checks with the HTTP case skipped
are not full AppModule HTTP/SQL acceptance. External acceptance remains required.
