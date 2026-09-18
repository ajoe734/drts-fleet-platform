# SR-AUTH-MFA-POLICY-20260915 — v1 Ordinary Login MFA Policy Adjustment

- **Task ID**: `SR-AUTH-MFA-POLICY-20260915`
- **Owner**: `Claude2`
- **Reviewer**: `Gemini`
- **Wave / Phase**: `system-remediation-20260906`
- **Base**: `dev`
- **Execution Branch**: `claude2/sr-auth-mfa-policy-20260915`

---

## 1. Product Decision & Scope

User product decision (2026-09-15): v1 does not require ordinary users to have MFA. This is a **policy
adjustment**, not a removal of a security control, and it explicitly does **not** adopt the previously
evaluated-and-rejected approach of treating `tenant_bootstrap_fixture` as a trusted verification method in
production/staging.

The change is scoped to exactly the two blanket gates identified in the task brief, both in
`apps/api/src/modules/auth/oidc-pkce.service.ts`:

- `exchangeTenantCallbackSession` — tenant OIDC session exchange
- `exchangePartnerCallbackSession` — partner OIDC session exchange

Both previously rejected the exchange with `403 AUTH_SESSION_EXCHANGE_DENIED` (`reasonCode:
IAM_MFA_REQUIRED`) whenever the ID token's `amr` claim did not contain one of
`mfa/otp/totp/hwk/sms/swk/pin`, regardless of role. v1 now allows the exchange to succeed for ordinary
users without that claim.

### 1.1 Explicitly unchanged (verified, not modified)

- `apps/api/src/modules/auth/auth.controller.ts`: the `tenant_admin` / `tenant_ops_admin` trusted-MFA gate
  (`isHighPrivilegeTenantRole` + `hasTrustedMfa`, `issueTenantOidcSession`, line ~635) — untouched. Holders
  of these roles must still present a trusted OIDC MFA assertion; this task does not weaken that check.
- privileged-role-governance fresh step-up requirement (`step-up.policy.ts`, `step-up-proof.service.ts`) —
  untouched.
- `STRICT_TRUSTED_AMR` / `NON_STRICT_TRUSTED_AMR` (`apps/api/src/common/auth/step-up-proof.service.ts`) —
  untouched. `tenant_bootstrap_fixture` remains outside `STRICT_TRUSTED_AMR`; production/staging step-up
  proofs still go through the strict list.
- `apps/api/src/config/auth-startup-config.ts` `FORBIDDEN_MODE` checks for `ALLOW_INSECURE_DEV_AUTH` and
  `AUTH_MODE` in production/staging — untouched (only new, additive exports were introduced; see below).

---

## 2. Implementation

### 2.1 Named, auditable policy switch

Added to `apps/api/src/config/auth-startup-config.ts`:

- `isOrdinaryLoginMfaRequired(env)` — returns `false` by default (v1 product decision, 2026-09-15).
  Explicit `AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true` restores the requirement; explicit `=false` or unset both
  resolve to "not required". Reverting the policy is a **config-only** change — no code change is required.
- `resolveOrdinaryLoginMfaPolicy(env)` — returns `"v1_not_required"` or `"required"`, used to honestly label
  security events (see §2.3).

The switch is scoped only to the two OIDC-PKCE session-exchange gates above. It is not read anywhere else —
in particular, `auth.controller.ts`'s high-privilege gate and `step-up-proof.service.ts`'s
`STRICT_TRUSTED_AMR` continue to hardcode their own requirements and never consult this flag.

### 2.2 Gate change

In both `exchangeTenantCallbackSession` and `exchangePartnerCallbackSession`
(`apps/api/src/modules/auth/oidc-pkce.service.ts`), the unconditional

```ts
if (!mfaVerified) { throw 403 AUTH_SESSION_EXCHANGE_DENIED / IAM_MFA_REQUIRED }
```

became

```ts
const mfaRequired = isOrdinaryLoginMfaRequired();
if (mfaRequired && !mfaVerified) { throw 403 AUTH_SESSION_EXCHANGE_DENIED / IAM_MFA_REQUIRED }
```

All other checks in both flows (state/nonce/PKCE validation, issuer/audience, email verification, immutable
subject binding, active-membership enforcement, partner entry/identity-link binding) are unchanged.

### 2.3 Honest security-event recording

Per the task brief's requirement that security events must not fabricate `amr` or record a session as
MFA-verified when it was not: the `tenant_oidc_session.issued` and `partner_oidc_session.issued` security
events now also carry `mfaPolicy` (`"v1_not_required"` / `"required"`) alongside the pre-existing
`mfaVerified` and `amr` fields, which continue to reflect the caller's actual claims unmodified. A session
issued under the v1 policy without MFA is recorded as `mfaVerified: false, mfaPolicy: "v1_not_required"` —
never as verified.

### 2.4 Known consequence (documented per task brief)

Holders of `tenant_admin` or `tenant_ops_admin` still must present IdP-issued MFA, because the privileged
step-up requirement was not relaxed. The gate this task adjusts (`oidc-pkce.service.ts`) governs the
ordinary/base tenant and partner login path only.

---

## 3. Verification & Acceptance Evidence

### 3.1 Regression Suite
(`tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts`)

- Named policy switch: defaults to `v1_not_required`; `AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true` restores
  `required`; explicit `false` behaves the same as unset.
- Tenant exchange: a bound tenant subject (`sub_oidc_admin_acme`, real HTTP OIDC exchange path with a
  signed ID token) without an MFA-bearing `amr` succeeds under v1; the recorded `tenant_oidc_session.issued`
  event carries `mfaVerified: false`, `mfaPolicy: "v1_not_required"`, and the real (unmodified) `amr`;
  `AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true` restores the `403` denial; an `amr` that does carry `mfa` still
  succeeds unchanged.
- Partner exchange: the same three cases (success under v1, honest audit event, denial restored via the
  env override) using a pre-bound partner identity link.
- Production/staging guards: `ALLOW_INSECURE_DEV_AUTH=true` in `production` and `AUTH_MODE=local` in
  `staging` both still fail `buildAuthStartupConfigReport` with `FORBIDDEN_MODE`, regardless of the new MFA
  policy env var — confirming the new switch does not interact with those checks.

`tests/unit/auth-oidc-pkce.test.ts` was updated in place: the prior test asserting a blanket partner MFA
denial (`"rejects partner login when subject claims lack required MFA proof"`) is replaced with a v1-success
assertion plus a companion test proving the `AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true` override still denies —
covering both directions of the named switch in the original suite.

### 3.2 Verification Commands Run & Results

```bash
# 0. Workspace package builds (path-mapped dependencies; unrelated to this change)
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
# Output: exit 0 for both

# 1. New + directly modified regression suites
pnpm exec vitest run tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ tests/unit/auth-oidc-pkce.test.ts
# Output: 2 files passed, 41 tests passed

# 2. Sibling suites proving the unchanged gates stayed unchanged
pnpm exec vitest run tests/unit/step-up-proof-policy.test.ts \
  tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/e2e/tenant-console-oidc-production.test.ts
# Output: 4 files passed, 60 tests passed, 2 skipped (pre-existing skips, unrelated to this change)

# 3. auth-startup-config suites (production/staging FORBIDDEN_MODE guards)
pnpm exec vitest run tests/unit/auth-startup-config.test.ts tests/integration/auth-startup-config.integration.test.ts
# Output: 2 files passed, 45 tests passed

# 4. Typecheck
pnpm --filter @drts/api typecheck
# Output: tsc -p tsconfig.json --noEmit (exit 0)

# 5. ESLint
pnpm exec eslint apps/api/src/config/auth-startup-config.ts apps/api/src/modules/auth/oidc-pkce.service.ts \
  tests/unit/auth-oidc-pkce.test.ts tests/unit/system-remediation/sr-auth-mfa-policy-20260915/
# Output: clean (exit 0)
```

No product server, browser/preview server, or Docker Compose was started (per VM restriction).

### 3.3 Required Acceptance Mapping

- `v1_optional_mfa_ordinary_tenant_and_partner_login` — covered by §3.1 tenant/partner v1-success cases.
- `privileged_stepup_and_high_privilege_mfa_unchanged` — `auth.controller.ts`, `step-up.policy.ts`, and
  `step-up-proof.service.ts` were not modified; covered by the unmodified sibling suites in §3.2 step 2
  passing against this candidate.
- `production_staging_auth_startup_guards_unchanged` — covered by §3.1's dedicated guard assertions and the
  full `auth-startup-config` suites in §3.2 step 3.

---

## 4. Modified / Added Artifacts

- `apps/api/src/config/auth-startup-config.ts` (additive: `isOrdinaryLoginMfaRequired`,
  `resolveOrdinaryLoginMfaPolicy`, `OrdinaryLoginMfaPolicy` type)
- `apps/api/src/modules/auth/oidc-pkce.service.ts` (tenant + partner MFA gate wired to the named switch;
  honest `mfaPolicy` added to both issued security events)
- `tests/unit/auth-oidc-pkce.test.ts` (updated partner MFA test expectations for the v1 policy)
- `tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts` (new)
- `docs/04-uat/system-remediation-20260906/SR-AUTH-MFA-POLICY-20260915.md` (this file)

Not modified (verified unchanged, listed for traceability against the task brief's guardrails):

- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/common/auth/auth.policy.ts`
- `apps/api/src/common/auth/step-up.policy.ts`
- `apps/api/src/common/auth/step-up-proof.service.ts`
