# SR-AUTH-ADMIN-MFA-ENV-20260915 — High-Privilege MFA Gate Made Environment-Aware & Unified

- **Task ID**: `SR-AUTH-ADMIN-MFA-ENV-20260915`
- **Owner**: `Claude2`
- **Reviewer**: `Gemini`
- **Wave / Phase**: `system-remediation-20260906`
- **Base**: `dev`
- **Execution Branch**: `claude2/sr-auth-admin-mfa-env-20260915`
- **Depends on**: `SR-AUTH-MFA-POLICY-20260915` (merged to `dev` at `6eeff0374` before this task started)

---

## 1. Product Decision & Scope

User decision (2026-09-15): the trusted-MFA gate for high-privilege tenant roles (`tenant_admin`,
`tenant_ops_admin`) becomes environment-aware — dev/test can be exercised without a real IdP MFA challenge,
while production and staging keep the real MFA requirement unchanged.

This fixes a pre-existing inconsistency: two functions named `hasTrustedMfa` existed with different
behavior.

- `apps/api/src/common/auth/step-up-proof.service.ts` already switched between `STRICT_TRUSTED_AMR` and
  `NON_STRICT_TRUSTED_AMR` (which adds `tenant_bootstrap_fixture`) based on
  `isStrictAuthEnvironment()` — so dev already accepted the fixture AMR for privileged-action step-up.
- `apps/api/src/modules/auth/auth.controller.ts` (`verifyTenantOidcIdToken`, used by
  `issueTenantOidcSession`'s `isHighPrivilegeTenantRole` gate) hardcoded its own AMR allow-list
  (`mfa/otp/webauthn/hwk/fido2`) plus an acr regex, with no environment awareness at all. This blocked
  exercising `tenant_admin` / `tenant_ops_admin` bootstrap logins in dev without a real MFA assertion,
  blocking `SR-LIVE-ENTRY-001`.

### 1.1 Explicitly unchanged (verified, not modified)

- Production and staging: `tenant_bootstrap_fixture` remains untrusted; only `STRICT_TRUSTED_AMR` (or an
  `aal2`/`aal3` acr) satisfies the gate in strict environments.
- The privileged-role-governance fresh step-up requirement (`step-up.policy.ts`) — untouched.
- `apps/api/src/config/auth-startup-config.ts` `FORBIDDEN_MODE` checks for `ALLOW_INSECURE_DEV_AUTH` and
  `AUTH_MODE` in production/staging — untouched.
- The v1 ordinary tenant/partner login MFA policy (`SR-AUTH-MFA-POLICY-20260915`,
  `isOrdinaryLoginMfaRequired`) — untouched and unrelated; that switch only governs the blanket ordinary
  login gate in `oidc-pkce.service.ts`, never the high-privilege gate touched here.

---

## 2. Implementation

### 2.1 New shared module

Added `apps/api/src/common/auth/trusted-mfa.policy.ts` as the single source of truth for:

- `STRICT_TRUSTED_AMR` — AMR values trusted in every environment (`mfa`, `otp`, `totp`, `push`, `webauthn`,
  `fido2`, `verified_iap_workforce`).
- `NON_STRICT_TRUSTED_AMR` — `STRICT_TRUSTED_AMR` plus `tenant_bootstrap_fixture`, used only outside
  production/staging.
- `isStrictAuthEnvironment()` — `true` for `production` and `staging` (via `detectAuthEnvironment`).
- `hasTrustedMfa({ amr, acr })` — `true` if `acr` is `aal2`/`aal3`, or if any `amr` entry is in the
  environment-appropriate trusted set.

This is exactly the pre-existing `step-up-proof.service.ts` logic, moved verbatim into a shared module.

### 2.2 `step-up-proof.service.ts`

Removed its local `STRICT_TRUSTED_AMR` / `NON_STRICT_TRUSTED_AMR` / `isStrictAuthEnvironment()` /
`hasTrustedMfa()` and now imports `hasTrustedMfa` from `./trusted-mfa.policy`. Behavior is unchanged (same
sets, same logic) — this file now has zero duplicated policy state.

### 2.3 `auth.controller.ts`

`verifyTenantOidcIdToken` previously computed:

```ts
const hasTrustedMfa =
  amr.some((m) => ["mfa", "otp", "webauthn", "hwk", "fido2"].includes(m.toLowerCase())) ||
  /(?:aal|urn:.*:aal)[2-9]/i.test(acr);
```

with no environment check at all. It now calls the shared function:

```ts
hasTrustedMfa: hasTrustedMfa({ amr, acr }),
```

Net effect on the `isHighPrivilegeTenantRole` gate (`issueTenantOidcSession`, `tenant_admin` /
`tenant_ops_admin`):

- **dev/test**: `amr: ["tenant_bootstrap_fixture"]` now satisfies the gate — unblocking
  `SR-LIVE-ENTRY-001` local role-login acceptance.
- **production/staging**: `tenant_bootstrap_fixture` is still rejected; a real trusted AMR method (or
  `aal2`/`aal3` acr) is still required — this direction was the acceptance bar carried over from
  `step-up-proof.service.ts`'s pre-existing, already-approved production/staging behavior.
- The controller's `isStrictAuthEnvironment()` (used elsewhere in the file, e.g. bootstrap-header
  rejection) is untouched; it is a separate, unrelated local helper.

---

## 3. Verification & Acceptance Evidence

### 3.1 Regression Suite

`tests/unit/system-remediation/sr-auth-admin-mfa-env-20260915/admin-mfa-gate-environment-aware.test.ts`
(new, 10 tests):

1. **Dev accepts fixture** — `APP_ENV=local`, `issueTenantOidcSession` succeeds for both `tenant_admin`
   (`admin@acme.example`) and `tenant_ops_admin` (`ops@acme.example`) fixture users with
   `amr: ["tenant_bootstrap_fixture"]`.
2. **Production/staging reject fixture** — `APP_ENV=production` / `APP_ENV=staging`,
   `issueTenantOidcSession` rejects the same fixture AMR with a `403`, for both roles.
3. **Shared implementation direct checks** — `NON_STRICT_TRUSTED_AMR` vs `STRICT_TRUSTED_AMR` membership;
   `hasTrustedMfa` environment-awareness for the fixture AMR; a real trusted AMR (`webauthn`, `fido2`) or an
   `aal2`/`aal3` acr remains trusted in production/staging (unchanged happy path — not weakened).
4. **No divergent copy** — source-level assertions that `auth.controller.ts` imports `hasTrustedMfa` from
   `trusted-mfa.policy` and no longer contains the old hardcoded allow-list literal, and that
   `step-up-proof.service.ts` imports the same function and no longer defines its own `STRICT_TRUSTED_AMR` /
   `NON_STRICT_TRUSTED_AMR`.

### 3.2 Verification Commands Run & Results

```bash
# 0. Workspace package builds (path-mapped dependencies; unrelated to this change)
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
# Output: exit 0 for both

# 1. New regression suite
pnpm exec vitest run tests/unit/system-remediation/sr-auth-admin-mfa-env-20260915/
# Output: 1 file passed, 10 tests passed

# 2. Sibling suites proving the step-up gate and dependency task stayed correct
pnpm exec vitest run tests/unit/step-up-proof-policy.test.ts \
  apps/api/tests/unit/auth-bootstrap.test.ts \
  tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts
# Output: 3 files passed, 24 tests passed

# 3. Broader auth regression sweep
pnpm exec vitest run apps/api/tests tests/unit/step-up-iap-path.test.ts \
  tests/security/iam-tenant-session-revocation-e2e.test.ts \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/unit/system-remediation/sr-auth-selector-001 \
  tests/unit/system-remediation/sr-qa-identity-001
# Output: 8 files passed, 75 tests passed

# 4. Privileged-role-governance / production-oidc / auth-startup-config sweep
pnpm exec vitest run tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/e2e/tenant-console-oidc-production.test.ts \
  tests/unit/auth-startup-config.test.ts \
  tests/integration/auth-startup-config.integration.test.ts \
  tests/unit/auth-oidc-pkce.test.ts
# Output: 6 files passed, 131 tests passed, 2 skipped (pre-existing skips, unrelated to this change)

# 5. Typecheck
pnpm --filter @drts/api typecheck
# Output: tsc -p tsconfig.json --noEmit (exit 0)

# 6. ESLint
pnpm exec eslint apps/api/src/common/auth/trusted-mfa.policy.ts \
  apps/api/src/common/auth/step-up-proof.service.ts \
  apps/api/src/modules/auth/auth.controller.ts \
  apps/api/src/common/auth/index.ts \
  tests/unit/system-remediation/sr-auth-admin-mfa-env-20260915/
# Output: clean (exit 0)
```

No product server, browser/preview server, or Docker Compose was started (per VM restriction).

### 3.3 Required Acceptance Mapping

- `admin_mfa_gate_environment_aware_dev_accepts_bootstrap_fixture` — covered by §3.1.1.
- `admin_mfa_gate_still_requires_real_mfa_in_production_and_staging` — covered by §3.1.2 and §3.1.3's
  unchanged-happy-path assertions.
- `single_shared_trusted_mfa_implementation_no_divergent_copy` — covered by §3.1.4's source-level checks,
  plus both call sites now importing from the single new `trusted-mfa.policy.ts` module.

---

## 4. Modified / Added Artifacts

- `apps/api/src/common/auth/trusted-mfa.policy.ts` (new — shared `hasTrustedMfa` implementation)
- `apps/api/src/common/auth/step-up-proof.service.ts` (now imports the shared implementation; local
  duplicate removed)
- `apps/api/src/modules/auth/auth.controller.ts` (`verifyTenantOidcIdToken` now calls the shared
  implementation instead of its own hardcoded allow-list/regex)
- `apps/api/src/common/auth/index.ts` (barrel export for the new module)
- `tests/unit/system-remediation/sr-auth-admin-mfa-env-20260915/admin-mfa-gate-environment-aware.test.ts`
  (new)
- `docs/04-uat/system-remediation-20260906/SR-AUTH-ADMIN-MFA-ENV-20260915.md` (this file)

Not modified (verified unchanged, listed for traceability against the task brief's guardrails):

- `apps/api/src/config/auth-startup-config.ts`
- `apps/api/src/common/auth/step-up.policy.ts`
- `apps/api/src/modules/auth/oidc-pkce.service.ts`
