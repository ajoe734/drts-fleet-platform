# SR-AUTH-SELECTOR-001 — Tenant Selector / Authentication Conflict Repair

- **Task ID**: `SR-AUTH-SELECTOR-001`
- **Owner**: `Claude2`
- **Reviewer**: `Gemini`
- **Wave / Phase**: `system-remediation-20260906`
- **Parent Task**: `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING`
- **Base**: `dev`
- **Execution Branch**: `claude2/sr-auth-selector-001`

---

## 1. Issue Background & Root Cause Analysis

### 1.1 Source

- Remote run `34471890706`, runtime `9f23efd623d07c613eb61c10cae953f6ba7ea6ef` (evidence at
  `.local/worker-recovery-20260910/tenant-run-34471890706/test-report.json`): an anonymous
  `GET /api/tenant/api-keys` request carrying **only** `x-tenant-id` (no Bearer token, no other identity
  header) returned `200` with real tenant data.
- The same runtime also showed that a legitimate `x-tenant-id`-matching Bearer JWT caller was rejected,
  because `BootstrapAuthGuard.canActivate` (`apps/api/src/common/auth/bootstrap-auth.guard.ts:167-184`)
  rejected any request carrying `x-tenant-id` in strict environments *before* the Bearer token was ever
  verified — and `TenantPartnerController` (`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`)
  requires `x-tenant-id` on every tenant-scoped route as the tenant **resource selector**.

### 1.2 Root Cause

`x-tenant-id` was included in the "does this request carry a bootstrap auth signal" header list in **both**
`apps/api/src/common/auth/auth.extractor.ts` (`hasAuthSignal`) and
`apps/api/src/common/auth/bootstrap-auth.guard.ts` (`hasBootstrapAuthSignal`). This conflated a *resource
selector* with *proof of identity*:

- **Anonymous-access bug**: a request with only `x-tenant-id` set `hasSignal = true` in
  `extractBootstrapRequestIdentity`. With no `x-actor-type` header, `actorType` defaulted to `"system"`
  (`auth.extractor.ts:156-159`). `"system"` realm is unconditionally included in every route's
  `allowedRealms` (`baseAllowedRealms` in `auth.policy.ts` always prepends `"system"`), so the guard's
  realm/scope checks passed trivially. The resulting identity then reached
  `TenantPartnerService`'s `assertTenantAccessScope`, whose `isPlatformOrSystem` bypass
  (`identity.actorType === "system"` → `return` with no tenant match check) skipped tenant-scope enforcement
  entirely — an unauthenticated caller supplying only a tenant selector got full read access to that tenant.
- **Legitimate-caller rejection bug**: in strict (`staging`/`production`) environments,
  `BootstrapAuthGuard.canActivate` threw `401 AUTH_BOOTSTRAP_HEADERS_FORBIDDEN` whenever
  `hasBootstrapAuthSignal(headers)` was true — and this check ran unconditionally at the top of
  `canActivate`, before the Bearer-token fast path. Since `x-tenant-id` counted as a signal, any
  Bearer-authenticated request to a tenant-scoped route (which must carry `x-tenant-id` per
  `TenantPartnerController.requireTenantId`) was rejected before its JWT was ever checked.

---

## 2. Fix

Supervisor technical decision (task brief): `x-tenant-id` is a tenant **resource selector**, never
authentication/role/identity proof.

- `apps/api/src/common/auth/auth.extractor.ts`: removed `"x-tenant-id"` from `hasAuthSignal`'s header list.
  A request carrying only `x-tenant-id` (and no other bootstrap identity header) no longer synthesizes a
  bootstrap identity; on protected routes it now returns `null` (→ `401 AUTH_REQUIRED` from the guard), and
  on anonymous/open-route fallback it returns the generic system identity with `tenantId: null` instead of
  leaking the selector value into an unauthenticated identity.
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`: removed `"x-tenant-id"` from
  `hasBootstrapAuthSignal`'s header list (the mirrored, strict-environment pre-check), so a Bearer token
  accompanied only by the required tenant selector reaches JWT verification instead of being rejected
  up front.
- **Unchanged**: `x-actor-type`, `x-actor-id`, `x-realm`, `x-roles`, `x-role-families`, `x-scopes`,
  `x-auth-mode` remain in both signal lists — genuine identity-spoofing headers are still forbidden in
  strict environments even alongside a valid Bearer token (regression-tested below). `x-partner-id`,
  `x-partner-program-id`, `x-partner-entry-slug` are untouched (out of this task's scope; they are not the
  reported conflict). No change to `TenantPartnerService`'s `assertTenantAccessScope`/`TENANT_SCOPE_MISMATCH`
  enforcement or any SQL/persistence path — cross-tenant selector mismatches for an authenticated caller
  already 403 there and continue to do so unmodified.

---

## 3. Verification & Acceptance Evidence

### 3.1 Regression Suite (`tests/unit/system-remediation/sr-auth-selector-001/tenant-selector-auth.test.ts`)

- `auth.extractor` unit coverage: a lone `x-tenant-id` header returns `null` identity on protected routes,
  does not leak into the anonymous-fallback identity, and dev bootstrap identity building is unaffected
  when a real `x-actor-type` signal is present alongside the selector.
- `BootstrapAuthGuard` coverage: selector-only request → `401 AUTH_REQUIRED` in `local`, `test`, `staging`,
  and `production` environments (`it.each`); a verified Bearer token + matching `x-tenant-id` selector
  reaches and passes JWT verification in `staging` (the exact pre-Bearer-rejection regression); real
  identity-spoofing headers (`x-actor-type`/`x-actor-id`/`x-realm`) remain `401
  AUTH_BOOTSTRAP_HEADERS_FORBIDDEN` in `staging` even alongside a valid Bearer token and the selector header;
  an open route does not let a selector-only header grant tenant-scoped identity.
- End-to-end guard + `TenantPartnerController.listApiKeys` acceptance: selector-only request never reaches
  the controller (guard throws first); a same-tenant JWT + matching selector reaches the controller and
  returns only that tenant's keys; a JWT scoped to a different tenant than the selector is rejected `403
  TENANT_SCOPE_MISMATCH` with no data returned — reproducing the three acceptance clauses
  (`401` / same-tenant works / mismatch `403`) end to end through the actual guard and controller code paths.

### 3.2 Verification Commands Run & Results

```bash
# 0. Contracts build (populates packages/contracts/dist that this checkout's tsconfig path-maps against;
#    unrelated to this change, required for a clean apps/api typecheck)
pnpm --filter @drts/contracts build
# Output: exit 0

# 1. New + directly related regression suites
pnpm exec vitest run tests/unit/system-remediation/sr-auth-selector-001/ tests/unit/bootstrap-auth-guard-strict-env.test.ts tests/security/iam-auth-negative-matrix.test.ts
# Output: 3 files passed, 20 tests passed

# 2. Sibling tenant-scope / IAM negative-matrix suites (no regressions introduced)
pnpm exec vitest run tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ tests/unit/iam-min-accses-001.test.ts tests/contract/iam-contracts.test.ts
# Output: 3 files passed, 20 tests passed

# 3. Typecheck
pnpm --filter @drts/api typecheck
# Output: tsc -p tsconfig.json --noEmit (exit 0)

# 4. ESLint
pnpm exec eslint tests/unit/system-remediation/sr-auth-selector-001/ apps/api/src/common/auth/auth.extractor.ts apps/api/src/common/auth/bootstrap-auth.guard.ts
# Output: clean (exit 0)
```

No product server, browser/preview server, or Docker Compose was started (per VM restriction).

### 3.3 Remaining Acceptance Gate

`required_acceptance: tenant_selector_real_jwt_http_sql` — "Full remote AppModule two-tenant JWT HTTP SQL
acceptance passes on exact new runtime" — requires a real GitHub-hosted Postgres run against this exact
candidate SHA
(`tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts` itself
throws if `DRTS_TENANT_BINDING_DATABASE_URL` is not set). This worker VM cannot start that infrastructure
locally per the VM restriction. Per the task's integration notes, this remains an outstanding lifecycle
gate to be run against the produced candidate/runtime SHA after review, independent of this local unit
verification.

---

## 4. Modified / Added Artifacts

- `apps/api/src/common/auth/auth.extractor.ts`
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `tests/unit/system-remediation/sr-auth-selector-001/tenant-selector-auth.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-AUTH-SELECTOR-001.md`
