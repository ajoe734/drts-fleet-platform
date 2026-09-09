# SR-QA-WEBHOOK-001-FIX-TENANT-BINDING — C111 API Key Tenant Header Binding Repair

- **Task ID**: `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING`
- **Owner**: `Gemini`
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
- **Historical Reproduction**: Commit `6b9de8287abb48e5770524c3addf5e5e41f8f663` and evidence recorded in `tests/e2e/system-remediation/sr-qa-webhook-001/evidence-auth-http.json` (`9d77ea52e88d8bb3b5421d2a689624c8c9d8f492`).
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

### 2.2 `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- Updated `listApiKeys(tenantId: string, identity?: IdentityContext | null)` to accept the caller's identity context.
- Implemented `assertTenantAccessScope(targetTenantId, identity, action = "access")`:
  - If `!identity`, permits internal/test calls without identity context.
  - If `identity` is platform admin or system actor (`realm: "platform" | "system"`, `actorType: "platform_admin" | "system"`), permits cross-tenant access.
  - If `identity.tenantId !== targetTenantId`, throws `ApiRequestError(HttpStatus.FORBIDDEN, "TENANT_SCOPE_MISMATCH", "Cross-tenant identity access is forbidden. Principal tenantId does not match target tenantId.", { targetTenantId, principalTenantId })`.
- Delegated `assertTenantMutationScope(targetTenantId, identity)` to `assertTenantAccessScope(targetTenantId, identity, "mutation")`, maintaining exact error codes, status, and messages for existing mutation endpoints.

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
- Verifies complete NestJS `AppModule` structure and route metadata.
- Prepares the complete two-tenant authentic JWT + PostgreSQL HTTP integration test harness ready to execute with `DATABASE_URL` in live environments.

### 3.3 Verification Commands Run & Results
```bash
# 1. Unit tests:
pnpm exec vitest run tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ --no-file-parallelism --maxConcurrency=1
# Output: 5 passed (5)

# 2. Typecheck:
pnpm --filter @drts/api typecheck
# Output: tsc -p tsconfig.json --noEmit (Exit status 0)

# 3. Git diff check:
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
