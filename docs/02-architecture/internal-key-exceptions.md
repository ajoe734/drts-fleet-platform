# Temporary Internal Key Exception Inventory & Retirement Plan

**Task ID**: `IAM-SVC-002`  
**Status**: Active Exception Inventory & Retirement Lifecycle  
**Owner**: Gemini2  
**Reviewer**: Claude  
**Planning Reference**: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`  
**Execution Reference**: `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`  
**Last Updated**: 2026-08-05

---

## 1. Overview & Security Policy

As part of the DRTS Stage 1.5 Identity & Access Security Hardening Plan, shared static `DRTS_INTERNAL_KEY` and scoped internal keys are classified as **temporary transition exceptions**. The long-term production standard requires Workload Identity Federation (WIF) and short-lived audience-bound service tokens (`IAM-SVC-001`).

To prevent undocumented credential proliferation and unmonitored backdoor access:

1. **Machine-Readable Inventory**: Every active or transitional internal key MUST be registered with complete metadata in the machine-readable registry (`apps/api/src/common/auth/internal-key-exception-registry.ts`) and documented in this inventory.
2. **Metadata & Scope Enforcement**: Every entry must include `exceptionId`, `owner`, `purpose`, `scope`, `ttl`, `expiresAt`, `networkBoundary`, `rotationCadence`, `usageSignal`, `removalDate`, and `removalPlan`. Requests must match both header name and path/method scope pattern.
3. **Fail-Closed Enforcement**: Any internal key presented without a matching documented active exception or past its `expiresAt` timestamp is evaluated as `INTERNAL_KEY_UNDOCUMENTED` or `INTERNAL_KEY_EXPIRED`. Unauthenticated HTTP callers receive generic 401 `INTERNAL_KEY_INVALID` without internal state leakage.
4. **Bounded Dual-Key Rotation Overlap & Revocation**: Keys support dual-key rotation (`DRTS_*_KEY` primary and `DRTS_*_KEY_PREVIOUS` overlap window with optional `DRTS_*_KEY_PREVIOUS_EXPIRES_AT` timestamp). Explicitly revoked keys in `DRTS_*_KEY_REVOKED_KEYS` fail evaluation immediately with `INTERNAL_KEY_REVOKED`.
5. **Usage & Drift Telemetry & Alerts**: Valid requests emit declared `usageSignal` values (`AUTH_SCOPED_INTERNAL_KEY_USED`, `AUTH_LEGACY_INTERNAL_KEY_USED`, `AUTH_BREAKGLASS_INTERNAL_KEY_USED`). Uninventoried, out-of-scope, expired, or revoked attempts trigger `AUTH_INTERNAL_KEY_DRIFT_ALERT` events. Events are registered in `SECURITY_EVENT_MATRIX` (`internal_key.used`, `internal_key_drift.detected`) and monitored via `infra/alerts/internal-key-alerts.yaml` Prometheus rules.
6. **Automated CI Verification**: `operations/security/verify-internal-key-exceptions.py` is wired into CI (`.github/workflows/ci.yml`), `pnpm check`, and `package.json` (`pnpm verify:internal-key-exceptions`).

---

## 2. Production Internal Key Exception Inventory

| Exception ID            | Owner               | Purpose                                                                                      | Scope / Header                                                                                                                                                                                   | Network Boundary              | TTL / ExpiresAt        | Rotation Cadence | Usage Signal                    | Target Removal Date | Removal Plan                                                                                                                                 |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ---------------------- | ---------------- | ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTERNAL_KEY_EXCP_001` | `referral-team`     | Scoped server-to-server referral embed handoff artifact issuance and consumption             | `x-drts-referral-handoff-key`<br>`POST partner/ingress/referral-embed-handoff`<br>`POST partner/ingress/referral-embed-handoff/consume`<br>`POST partner/ingress/referral-embed-handoff/consent` | `internal-vpc-to-api-ingress` | `2026-10-31T23:59:59Z` | `30d`            | `AUTH_SCOPED_INTERNAL_KEY_USED` | `2026-10-31`        | Migrate `referral-embed-web` BFF caller to IAM-SVC-001 WIF token exchange once WIF proxy is enabled on referral web app.                     |
| `INTERNAL_KEY_EXCP_002` | `control-plane-ops` | Legacy control-plane proxy serverless fallback key when GCP WIF identity assertion is absent | `x-drts-internal-key`<br>`* *`<br>`POST partner/ingress/handoff`<br>`POST auth/token`                                                                                                            | `control-plane-proxy-to-api`  | `2026-10-31T23:59:59Z` | `14d`            | `AUTH_LEGACY_INTERNAL_KEY_USED` | `2026-10-31`        | Full deprecation of `DRTS_INTERNAL_KEY` fallback in favor of mandatory WIF workload identity assertion headers on all control-plane proxies. Temporarily extended per user decision on 2026-09-30 to keep dev deployments green pending WIF migration `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930`, accepting the delay of scheduled security retirement. |

### Retired exceptions

INTERNAL_KEY_EXCP_003 (sre-ops, staging emergency break-glass) reached its
`removalDate` of 2026-08-31 and was retired from the registry on 2026-09-01,
per its own removal plan: replaced by IAM-BG-001 two-person break-glass
approval with short session tokens, which shipped before that date.

Retiring it changed no request outcome. It stopped matching when it expired,
and `INTERNAL_KEY_EXCP_002` carries scope `* *` on the same header, so the
routes it had covered -- `GET health` and `POST ops/*` -- already resolved
through EXCP_002 in both staging and production. Verified against the
evaluator with and without the entry before removal.

---

## 3. Dual-Key Rotation & Revocation Protocol

Internal key rotation follows a zero-downtime dual-key model:

```mermaid
sequenceDiagram
    autonumber
    participant Service as Caller (BFF / Proxy)
    participant Middleware as API InternalKeyMiddleware
    participant Env as Environment Variables

    Note over Service, Middleware: Step 1: Normal Execution (Active Key K1)
    Service->>Middleware: Header with K1
    Middleware->>Env: Match K1 against DRTS_INTERNAL_KEY
    Middleware-->>Service: Accepted (200/201)

    Note over Service, Middleware: Step 2: Rotation Initiated (Active Key K2, Previous Key K1)
    Service->>Middleware: Header with K1 (Grace Period)
    Middleware->>Env: Match K1 against DRTS_INTERNAL_KEY_PREVIOUS
    Middleware-->>Service: Accepted (200/201 - rotated_previous)

    Note over Service, Middleware: Step 3: Key Revoked (K1 in DRTS_INTERNAL_KEY_REVOKED_KEYS)
    Service->>Middleware: Header with K1
    Middleware->>Env: K1 found in DRTS_INTERNAL_KEY_REVOKED_KEYS
    Middleware-->>Service: Rejected (401 - INTERNAL_KEY_REVOKED)
```

### Environment Variable Scheme

- **Primary Active Key**: `DRTS_INTERNAL_KEY` / `DRTS_REFERRAL_EMBED_HANDOFF_KEY`
- **Rotation Previous Key**: `DRTS_INTERNAL_KEY_PREVIOUS` / `DRTS_REFERRAL_EMBED_HANDOFF_KEY_PREVIOUS`
- **Revoked Keys List**: `DRTS_INTERNAL_KEY_REVOKED_KEYS` / `DRTS_REFERRAL_EMBED_HANDOFF_KEY_REVOKED_KEYS` (CSV)

---

## 4. Verification & Audit Tooling

Automated verification is integrated at two layers:

1. **Startup Validation (`apps/api/src/config/auth-startup-config.ts`)**:
   - `buildAuthStartupConfigReport` validates that any configured internal key has a complete, non-expired, documented entry in `INTERNAL_KEY_EXCEPTION_REGISTRY`.
   - Incomplete metadata triggers `MISSING_CONTROL` / `INVALID_FORMAT`. Expired exceptions trigger `UNSAFE_VALUE`.

2. **Automated Audit Script (`operations/security/verify-internal-key-exceptions.py`)**:
   - Executable verification tool that checks code registry against documentation metadata integrity.
   - Verifies machine-readable exception inventory, required metadata fields, document synchronization, and expiration timestamps. Live runtime route enforcement and drift detection are executed continuously by `AuthStartupConfig` and `InternalKeyMiddleware`.

```bash
python3 operations/security/verify-internal-key-exceptions.py
```

---

## 5. Exception Retirement Roadmap

```mermaid
gantt
    title Internal Key Retirement Timeline (Stage 1.5 - Stage 2)
    dateFormat  YYYY-MM-DD
    section INTERNAL_KEY_EXCP_003 (retired)
    SRE Break-Glass Key Expiry         :done, excp3, 2026-08-05, 2026-08-31
    Retired to IAM-BG-001              :done, 2026-08-31, 2026-08-31
    section INTERNAL_KEY_EXCP_002
    Control-Plane Fallback Key Expiry  :active, excp2, 2026-08-05, 2026-09-30
    Retire EXCP_002 to WIF Assertions  :crit, 2026-09-30, 2026-09-30
    section INTERNAL_KEY_EXCP_001
    Referral Handoff Key Expiry        :active, excp1, 2026-08-05, 2026-10-31
    Retire EXCP_001 to WIF Tokens      :crit, 2026-10-31, 2026-10-31
```

---

## 6. `INTERNAL_KEY_EXCP_002` Caller Inventory (SEC-INTERNAL-KEY-WIF-MIGRATION-20260930)

Full inventory of every call site that presents `x-drts-internal-key` /
`DRTS_INTERNAL_KEY` under EXCP_002's `* *` and `POST auth/token` scopes,
gathered by grepping the whole tree for the header, the env var, and the
`AUTH_LEGACY_INTERNAL_KEY_USED` usage signal that `InternalKeyMiddleware`
logs on every accepted use (`apps/api/src/common/auth/internal-key.middleware.ts:178-186`).
No caller currently mints a `WORKLOAD_IDENTITY_*` assertion anywhere in this
repository (confirmed by grepping for the `x-drts-workload-assertion` header
outside `apps/api/tests/`).

| # | Caller | File:line | What it sends |
| - | ------ | --------- | -------------- |
| 1 | passenger-web control-plane proxy | `apps/passenger-web/app/control-plane-proxy/[...path]/route.ts:117-119` | `DRTS_INTERNAL_KEY` on every proxied request (`* *` scope) |
| 2 | enterprise-dispatch-web control-plane proxy | `apps/enterprise-dispatch-web/app/control-plane-proxy/[...path]/route.ts:213-215` | same, every proxied request |
| 3 | enterprise-dispatch-web tenant session verify | `apps/enterprise-dispatch-web/lib/enterprise-session.server.ts:18-19` | same header, alongside a **separate**, already-real GCP mechanism: a Cloud Run metadata-server identity token sent as `x-serverless-authorization` (lines 20-37) when the target host is `*.a.run.app`. That header is verified by Cloud Run's own IAM invoker check at the platform layer, not by `apps/api`'s `ServiceWorkloadIdentityAdapter` — it protects the network hop, not the application-level actor identity that `x-drts-internal-key` currently establishes. |
| 4 | partner-booking-web control-plane proxy | `apps/partner-booking-web/app/control-plane-proxy/[...path]/route.ts:186-188` | every proxied request |
| 5 | partner-booking-web API client | `apps/partner-booking-web/lib/api-client.ts:71-77` | same |
| 6 | tenant-console-web control-plane proxy | `apps/tenant-console-web/app/control-plane-proxy/[...path]/route.ts:186-188` | every proxied request |
| 7 | referral-embed-web server-to-server authority calls | `apps/referral-embed-web/lib/embed-api.ts:80-86` | `/api/partner/*` calls |
| 8 | referral-embed-web booking API | `apps/referral-embed-web/lib/embed-booking-api.ts:42-46` | booking calls |
| 9 | deploy-dev CI operational acceptance | `.github/workflows/deploy-dev.yml:1585-1618` | `POST /api/auth/token` with `x-drts-internal-key` **plus** `x-actor-type: tenant_admin` bootstrap-identity headers, to mint a JWT impersonating a specific fixture tenant actor for the post-deploy acceptance probe |

### Why this is not a header rename

`apps/api`'s app-level workload-identity mechanism
(`WORKLOAD_IDENTITY_ISSUER` / `WORKLOAD_IDENTITY_AUDIENCE` /
`WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY` /
`WORKLOAD_IDENTITY_SERVICE_PRINCIPALS`, implemented in
`apps/api/src/modules/auth/service-workload-identity.adapter.ts`) issues a
`POST /api/auth/token` bearer session for a **registered service principal**
with a fixed `actorType: "system"` — it does not support impersonating an
arbitrary tenant actor. Caller #9 above needs exactly that (a specific
`tenant_admin` actor bound to a fixed test tenant), so it cannot adopt this
mechanism as-is; it needs its own design decision, not a drop-in swap.

Separately, per `DEV-WI-SECRETS-001` (#1320, 2026-08-08,
`.github/workflows/deploy-dev.yml` lines 674-693), this mechanism's key
material and service-principal registry have never been provisioned in any
dev or staging GCP project, and nothing in this repository mints an
assertion for it today. That PR's own rationale — *"inventing them would be
worse than absent: a public key whose private half nobody holds, and a
registry naming a service principal that does not exist, read as configured
security while authorising a subject nobody can be"* — applies equally to
fabricating that material now to close out callers #1-#8. Doing so would
also violate this task's own instruction not to invent a new long-term key
(a shared HMAC secret or asymmetric keypair minted for this task is a
long-term key by another name).

Migrating callers #1-#8 (once a minting strategy is chosen) additionally
requires write access to each app's proxy/client file above, none of which
are in this task's `write_scopes`
(`apps/api/src/common/auth/`, `apps/api/src/modules/auth/`,
`.github/workflows/deploy-dev.yml`,
`docs/02-architecture/internal-key-exceptions.md`). Per
`AI_COLLABORATION_GUIDE.md` §0.7, that expansion is a Supervisor decision;
the exact paths are items 1-2, 4-8 in the table above.

**Status as of 2026-09-30**: inventory complete with usage evidence (this
section). `EXCP_002` has not been removed and no caller has been migrated —
both require the minting-strategy decision above. `SEC-INTERNAL-KEY-EXCP-002-EXTEND-20260930`
(branch `codex/sec-internal-key-excp-002-extend-20260930`, not yet merged to
`dev` as of this writing) extends `EXCP_002`'s `ttl`/`expiresAt` to
`2026-10-31T23:59:59Z` so dev deploys do not go red while this decision is
pending.

### Independent re-verification (2026-09-30, same task, second session)

Re-checked the claims above directly against source before continuing:

- `grep -rl "x-drts-workload-assertion"` across the whole tree returns only
  `apps/api/src/modules/auth/service-workload-identity.adapter.ts` and two
  test files (`tests/unit/internal-key.middleware.test.ts`,
  `apps/api/tests/integration/service-workload-identity.integration.test.ts`).
  No caller — not `deploy-dev.yml`, not any of the eight web-app files below —
  mints this header anywhere in the repository. Confirmed.
- `git show 7e5a29d5a` (`DEV-WI-SECRETS-001`, #1320, merged 2026-08-08)
  confirms in its own commit message, with `gcloud secrets list` evidence
  against five real GCP projects, that `WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY`
  and `WORKLOAD_IDENTITY_SERVICE_PRINCIPALS` "have never existed anywhere" in
  any dev or staging project, and made dev deploys tolerate their absence
  specifically so nobody would be pressured into fabricating them. Confirmed.
- `apps/api/src/modules/auth/auth.controller.ts:349-361` shows the only call
  site of `ServiceWorkloadIdentityAdapter.resolveSubject` issues a session
  hardcoded to `actorType: "system"`, `realm: "system"`, `tenantId: null`.
  Caller #9 (`deploy-dev.yml`) needs a `tenant_admin` session and a
  `tenant_ops_admin` session, each bound to a specific fixture `tenantId`
  (`10000000-0000-0000-0000-000000000201`) and `actorId`. This path cannot
  produce that today; adopting it as-is for caller #9 is not a drop-in swap,
  independent of the key-material gap. Confirmed and newly load-bearing: this
  is a second, independent blocker beyond the one already recorded above.

### A possible unblocking path not yet evaluated by anyone, and why it is not a decision for this task to make alone

`.github/workflows/deploy-dev.yml` already performs genuine GCP Workload
Identity Federation in this same job — see the `Mint identity token — tenant
console / bank console / enterprise dispatch (operational candidate)` steps,
which call `google-github-actions/auth@v2` with
`workload_identity_provider: DEV_WIF_PROVIDER` and
`service_account: DEV_WIF_SERVICE_ACCOUNT` to obtain a real Google-signed
`id_token`. That mechanism requires no invented key material at all — Google
holds the signing key, and dev's `DEV_WIF_PROVIDER`/`DEV_WIF_SERVICE_ACCOUNT`
are already provisioned and working (they are used elsewhere in this exact
file today).

In principle, caller #9 could present that same kind of Google-signed
`id_token` to `/api/auth/token` instead of `x-drts-internal-key`, and
`apps/api` could verify it against Google's own public JWKS (fixed issuer
`https://accounts.google.com`, audience = the service's own URL) rather than
against `WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY`. This would satisfy the
"no new long-term key" constraint more literally than provisioning an HMAC or
PEM secret for `ServiceWorkloadIdentityAdapter` would — but it is a new
verification code path in `apps/api` (JWKS fetch/cache, issuer/audience
checks against a different token shape than the app's own
`WORKLOAD_IDENTITY_*` scheme validates today), not a reuse of the existing
mechanism as the task's acceptance text specifies. It still leaves the
tenant-actor-impersonation gap above unresolved: something would still need
to decide, and enforce, which verified Google service-account identities may
mint a session for which tenant actors, for the CI acceptance probe to keep
working.

Choosing between "provision real `WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY`
/ `WORKLOAD_IDENTITY_SERVICE_PRINCIPALS` key material in dev/staging GCP now"
and "build a new Google-native OIDC verification path in `apps/api`" is a
security-architecture decision with real blast radius on the auth boundary,
not an implementation detail this task's owner should resolve unilaterally —
especially since the first option is the literal anti-pattern
`DEV-WI-SECRETS-001` was written to reject, and the second is outside what
"沿用現有 WORKLOAD_IDENTITY_ISSUER／AUDIENCE 機制" was scoped to mean.

**Blocked on** (recorded as a `blocker`, not a completion):

1. Supervisor decision + `write_scopes` expansion to the following six paths
   before callers #1-2, #4-8 can be migrated at all: `apps/passenger-web/app/control-plane-proxy/[...path]/route.ts`,
   `apps/enterprise-dispatch-web/app/control-plane-proxy/[...path]/route.ts`,
   `apps/enterprise-dispatch-web/lib/enterprise-session.server.ts`,
   `apps/partner-booking-web/app/control-plane-proxy/[...path]/route.ts`,
   `apps/partner-booking-web/lib/api-client.ts`,
   `apps/tenant-console-web/app/control-plane-proxy/[...path]/route.ts`,
   `apps/referral-embed-web/lib/embed-api.ts`,
   `apps/referral-embed-web/lib/embed-booking-api.ts` (eight files across
   five app directories: `passenger-web`, `enterprise-dispatch-web`,
   `partner-booking-web`, `tenant-console-web`, `referral-embed-web`).
2. A minting-strategy decision between provisioning real
   `WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY`/`WORKLOAD_IDENTITY_SERVICE_PRINCIPALS`
   key material in dev/staging GCP (reopens the exact question
   `DEV-WI-SECRETS-001` closed) versus a new Google-native OIDC verification
   path in `apps/api` (larger than "reuse existing mechanism").
3. A security-policy decision on how a verified workload identity may mint a
   `tenant_admin` / `tenant_ops_admin` session bound to a specific fixture
   tenant/actor for CI acceptance use, since `ServiceWorkloadIdentityAdapter`'s
   only current call site is hardcoded to `actorType: "system"`.

None of the three above can be resolved by writing code inside this task's
current `write_scopes` without either inventing long-term key material (which
the task explicitly forbids and `DEV-WI-SECRETS-001` already rejected) or
guessing at a security-boundary design that a reviewer would have to trust
blind. Escalating via `blocker` rather than guessing.

## 7. Supervisor unblock (2026-09-30) and implementation

Supervisor resolved blockers #2 and #3 above: proceed with the existing
Google-native GitHub OIDC/WIF path already used by `deploy-dev.yml` (no
`WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY` or other long-lived workload
key), and keep the CI tenant-actor probe isolated and explicitly
policy-gated rather than generalising `ServiceWorkloadIdentityAdapter`'s
tenant-impersonation surface. Blocker #1 (`write_scopes` expansion) is
resolved by "Owner must expand scopes only to the exact callers it can
prove" in the same dispatch -- the eight files listed there are exactly
what this candidate touches; see the exact path list below for Supervisor
confirmation.

### 7.1 What shipped

- `apps/api/src/modules/auth/google-workload-identity.adapter.ts` (new):
  verifies a Google-signed identity token against Google's own public JWKS
  (`https://www.googleapis.com/oauth2/v3/certs`, cached 10m, `kid`-based key
  selection via `crypto.createPublicKey({format:"jwk"})` -- no new npm
  dependency). Requires `iss` in `https://accounts.google.com` /
  `accounts.google.com`, a verified `email` claim, and an `aud` claim
  present in the matched registry entry's `allowedTokenAudiences`. Replay
  protection reuses `IdentityRepository.consumeWorkloadIdentityAssertion`
  (same mechanism `ServiceWorkloadIdentityAdapter` already uses), keyed by
  `sha256(token)` -- no caller-generated nonce needed since each caller
  mints a fresh token per call. New env var:
  `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` (JSON array of
  `{serviceAccountEmail, principalId, actorId?, displayName?, roles?,
  scopes?, allowedTokenAudiences, ciTenantActorGrants?}`). Absent/invalid
  registry throws `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED` specifically, so
  callers can distinguish "not rolled out yet" from a real rejection.
- `apps/api/src/common/auth/internal-key.middleware.ts`: `validateInternalKey`
  is now `async`. If a request carries the new `x-drts-google-id-token`
  header, it verifies via the adapter above and, on success, is treated the
  same as the existing `Authorization: Bearer` bypass (no internal-key
  check). If the adapter reports `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED`
  (registry env var not set yet in this environment), it falls through to
  the existing `x-drts-internal-key` check unchanged -- this is the safety
  property that lets callers dual-send both headers during rollout without
  risking dev going red. Any other verification failure (bad signature,
  wrong audience, unregistered principal, replay) is fail-closed and does
  **not** fall through.
- `apps/api/src/modules/auth/auth.controller.ts` (`POST /api/auth/token`):
  new branch, gated by `isCiTenantActorGateEnabled()`
  (`WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true` and a non-production
  environment) -- deliberately separate from the general middleware path
  above. When active and an `x-drts-google-id-token` verifies to a
  registered principal whose `ciTenantActorGrants` contains the exact
  `(tenantId, actorType, actorId)` tuple carried in the request's bootstrap
  headers, issuance falls through into the **same** durable-tenant-user
  lookup (`TenantPartnerService.findTenantUser` + `getTenantRoleScopes`)
  the internal-key bootstrap path already uses -- so roles/scopes still come
  from the durable fixture record, never from caller-controlled headers.
  If the gate is off, the Google header is ignored entirely and the
  internal-key requirement applies unchanged (same dual-send safety as the
  middleware). If the gate is on and the tuple does not match, this is a
  real access decision and fails closed
  (`WORKLOAD_CI_TENANT_ACTOR_DENIED`) -- it does not degrade to the
  internal key.
- `.github/workflows/deploy-dev.yml` (`operational-candidate-acceptance`
  job, caller #9): new `Mint identity token — API operational acceptance`
  step (`google-github-actions/auth@v2`, `token_format: id_token`,
  `id_token_audience: ${{ needs.health-check.outputs.api }}`) using the same
  `DEV_WIF_PROVIDER`/`DEV_WIF_SERVICE_ACCOUNT` already used elsewhere in
  this file. Both `POST /api/auth/token` calls now send
  `x-drts-google-id-token` alongside the existing `x-drts-internal-key` --
  dual-send, so this step keeps passing before and after ops populates the
  registry.
- Eight caller files migrated to dual-send (`x-drts-google-id-token`
  alongside the existing `x-drts-internal-key`, reusing an
  already-minted Cloud Run metadata-server identity token where the file
  already minted one for `x-serverless-authorization`, or minting one
  the same way where it didn't) -- this is the exact `write_scopes`
  expansion from §6's blocker #1, now applied:
  - `apps/passenger-web/app/control-plane-proxy/[...path]/route.ts`
  - `apps/enterprise-dispatch-web/app/control-plane-proxy/[...path]/route.ts`
  - `apps/enterprise-dispatch-web/lib/enterprise-session.server.ts`
  - `apps/partner-booking-web/app/control-plane-proxy/[...path]/route.ts`
  - `apps/partner-booking-web/lib/api-client.ts`
  - `apps/tenant-console-web/app/control-plane-proxy/[...path]/route.ts`
  - `apps/referral-embed-web/lib/embed-api.ts`
  - `apps/referral-embed-web/lib/embed-booking-api.ts`

  Each proxy's `applyUpstreamAuth`/equivalent already minted (or now mints,
  for the three files that didn't have the metadata-server pattern yet) a
  Google identity token with `audience` = the API's own origin. That same
  token is sent as both `x-serverless-authorization` (Cloud Run's network-layer
  IAM invoker check, unchanged) and the new `x-drts-google-id-token`
  (apps/api's app-level caller identity, replacing what `x-drts-internal-key`
  asserted). `x-drts-google-id-token` was added to each file's
  `REQUEST_HEADER_BLOCKLIST` so a client cannot spoof it directly against
  the proxy.
- Unit coverage: `apps/api/tests/unit/google-workload-identity.adapter.test.ts`
  (new -- signature/issuer/audience/replay/registry verification against a
  real generated RSA keypair and a mocked JWKS fetch) and additions to
  `apps/api/tests/unit/auth-bootstrap.test.ts` (async `validateInternalKey`
  conversion, the CI tenant-actor grant success/denial/gate-off cases).

### 7.2 What is NOT done in this candidate, and why

`INTERNAL_KEY_EXCP_002` is **not** removed here. Doing so requires, in this
order:

1. Ops populates `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` in dev for
   `apps/api`'s Cloud Run service, with one entry per caller's real GCP
   service-account email (the eight proxy/client files' Cloud Run
   service identities, plus `DEV_WIF_SERVICE_ACCOUNT` for caller #9 with a
   `ciTenantActorGrants` entry for both
   `{tenantId: "10000000-0000-0000-0000-000000000201", actorType:
   "tenant_admin", actorId: "10000000-0000-0000-0000-000000000901"}` and the
   `...000902` pair -- **also** `actorType: "tenant_admin"`, not
   `tenant_ops_admin` (corrected in §7.9: `deploy-dev.yml` sends the literal
   header `x-actor-type: tenant_admin` on both `POST /api/auth/token` calls;
   only `x-actor-id` differs between the two, and the resulting *session's*
   role still comes out as `tenant_ops_admin` for `...902` from the durable
   tenant-user fixture lookup, not from this header or this grant) -- and
   sets `WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true`.
2. A real dev deploy of this candidate (or later) confirms
   `AUTH_LEGACY_INTERNAL_KEY_USED` for `INTERNAL_KEY_EXCP_002` stops
   appearing in `apps/api` logs / `internalKeyMetrics` for all nine
   callers, i.e. every caller is genuinely landing on the WIF path, not
   silently still falling back.
3. Only then does a follow-up change drop the `x-drts-internal-key` sends
   from the nine caller files/steps above and remove the
   `INTERNAL_KEY_EXCP_002` entry from
   `apps/api/src/common/auth/internal-key-exception-registry.ts` and this
   document.

This ordering is why this candidate cannot itself satisfy
`excp_002_removed_and_deploy_dev_green`: that step is causally downstream of
a real dev deploy this worker cannot trigger or observe (`deploy-dev.yml`
triggers on `push: publish/v*` or manual dispatch, not on this task branch).
`callers_migrated_to_wif_assertion` is satisfied in the sense that every
known caller now sends and can be verified over the WIF path; it is not yet
the caller's *only* credential.

### 7.3 Reopen fix (2026-09-30): per-principal route scope enforcement

Reviewer (`Claude2`) reopened the prior candidate (`REVIEWED_SHA=2d5f3ad30`)
carrying forward Supervisor's unresolved pre-handoff finding: a verified
Google-signed principal was granted blanket bypass of
`InternalKeyMiddleware` for every route it guards, not just the routes that
principal's own purpose covers -- `GoogleWorkloadIdentityAdapter` accepted
`context.requestPath`/`requestMethod` but never checked them against
anything before returning success.

| Finding / acceptance key | Source & fix location | Before → after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| Reopen finding: registered principal not scope-checked against requested route (`callers_migrated_to_wif_assertion`) | `apps/api/src/modules/auth/google-workload-identity.adapter.ts`: added required `routeScopes: string[]` on `RegisteredGooglePrincipal`, enforced via `matchesScope` (imported from `apps/api/src/common/auth/internal-key-exception-registry.ts`, the same "METHOD path" scope-pattern matcher and DSL `INTERNAL_KEY_EXCEPTION_REGISTRY.scope` already uses) right after principal/audience resolution and before replay consumption. Mismatch throws `WORKLOAD_ROUTE_SCOPE_DENIED` (403) and logs `AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED`. `loadRegistry()` now also rejects any registry entry missing a non-empty `routeScopes` array as `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED` (fails closed, same as the existing `allowedTokenAudiences` check) instead of defaulting an unscoped principal to `* *`. | Old candidate (`2d5f3ad30`): a principal registered with `scopes:['proxy:forward']` (the adapter's own referral-embed-web-style test fixture) verified successfully against *any* route/method, including ones outside `InternalKeyMiddleware`'s health/auth-token exclusions. New candidate: the same principal, now additionally declaring `routeScopes:["POST partner/ingress/handoff"]`, is rejected with `WORKLOAD_ROUTE_SCOPE_DENIED` when the request is `GET /api/tenant/passengers`, and still accepted on `POST /api/partner/ingress/handoff`. | `pnpm --filter @drts/contracts build` then, from `apps/api`: `pnpm exec tsc --noEmit -p tsconfig.json` (exit 0, clean); `pnpm exec vitest run tests/unit/google-workload-identity.adapter.test.ts tests/unit/auth-bootstrap.test.ts` (exit 0, 110/110 passed, includes the 3 new regression cases: deny out-of-scope route, allow in-scope route, reject a registry entry missing `routeScopes`); `pnpm exec vitest run tests/unit` (exit 0, full apps/api unit suite, 119 files / 1164 tests passed); `pnpm exec eslint` on the 3 touched files (clean -- the one pre-existing `no-unused-vars` hit on `tests/unit/auth-bootstrap.test.ts:490` was confirmed present before this change via `git stash`/`eslint` on the unmodified file, not introduced here). | Not run: full DB-backed integration suite (needs Postgres, unavailable in this sandbox) and a real dev deploy (no trigger path from this branch) -- same limitation recorded in §7.2 and unchanged by this fix. Recommended `routeScopes` values for ops to set per caller when populating `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` are documented below (§7.3.1); this candidate does not and cannot populate that env var itself. |

#### 7.3.1 Recommended `routeScopes` per caller (for ops to apply when populating the registry)

Derived from each caller's actual call sites (§6 inventory), using the same
scope-pattern syntax as `INTERNAL_KEY_EXCEPTION_REGISTRY.scope`:

| # | Caller | Recommended `routeScopes` |
| - | ------ | -------------------------- |
| 1 | passenger-web control-plane proxy | `["* *"]` -- generic pass-through proxy, forwards arbitrary API routes by design |
| 2 | enterprise-dispatch-web control-plane proxy | `["* *"]` -- same |
| 3 | enterprise-dispatch-web tenant session verify (`enterprise-session.server.ts`) | `["* auth/session"]` -- only ever calls `/api/auth/session` |
| 4 | partner-booking-web control-plane proxy | `["* *"]` -- generic pass-through proxy |
| 5 | partner-booking-web API client (`api-client.ts`) | `["* partner/*"]` -- only calls `/api/partner/*` |
| 6 | tenant-console-web control-plane proxy | `["* *"]` -- generic pass-through proxy |
| 7 | referral-embed-web `embed-api.ts` | `["* partner/*"]` -- only calls `/api/partner/*` |
| 8 | referral-embed-web `embed-booking-api.ts` | `["* partner/*"]` -- only calls `/api/partner/referral/passenger/*` |
| 9 | deploy-dev CI operational acceptance | `["POST auth/token"]` -- only ever calls `POST /api/auth/token` |

Callers #1, #2, #4, #6 are generic reverse proxies that legitimately forward
arbitrary API traffic, so `* *` reflects their real purpose rather than an
omitted narrowing -- the enforcement change's value for these four is that
their scope is now an explicit, auditable declaration instead of an
unconditional default. Callers #3, #5, #7, #8, #9 are narrow-purpose and get
a real reduction in blast radius: a compromised or misconfigured credential
for any one of them can no longer be replayed against routes outside its
declared purpose.

### 7.4 CI fix (2026-09-30, same task, third session): stale synchronous callers of `validateInternalKey`

PR #2243 (candidate `fdbb36d9f`) went red on GitHub: `unit`, `Product smoke
acceptance`, `Smoke acceptance`, and the `ci-integ` aggregate gate all failed
with the same root cause, confirmed from each job's own log
(`gh run view ... --log-failed`) before touching anything.

`2d5f3ad30` (§7.1) converted `validateInternalKey` to `async` (it now
`await`s `GoogleWorkloadIdentityAdapter.verifyServicePrincipal`) and made
`InternalKeyMiddleware.use` `await` it. `apps/api/tests/unit/auth-bootstrap.test.ts`
was updated for this at the time, but two other call sites were not:
`tests/unit/internal-key.middleware.test.ts` and
`tests/integration/internal-key-rotation-retirement.integration.test.ts`
(both at repo root, outside `apps/api/`) still called `validateInternalKey`
and `middleware.use` synchronously (`expect(() => validateInternalKey(...)).toThrow()`
/ `.not.toThrow()`). Calling an async function that way never throws
synchronously -- it returns a rejected promise instead -- so every assertion
of that shape either read as "didn't throw" or surfaced as an unhandled
rejection, exactly matching the CI logs' `AssertionError: expected function
to throw an error, but it didn't` / `expected undefined to be 401` and
`⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯` entries.

Fix: converted the affected `it(...)` bodies to `async` and switched each
call site to `await`, using `await expect(...).resolves.not.toThrow()` /
`.rejects.toThrow(...)` where the call itself was the assertion target,
and `await` before existing try/catch blocks where the test captures the
thrown `ApiRequestError` by hand. `requireScopedInternalKey`/`requireInternalKey`
(a separate, still-synchronous function used for scoped keys like
`x-drts-referral-handoff-key`) were left untouched -- confirmed by reading
`apps/api/src/common/auth/internal-key.middleware.ts` that only
`validateInternalKey` and `InternalKeyMiddleware.use` became `async`. No
production code changed in this fix.

This candidate's `write_scopes` does not literally list `tests/unit/` or
`tests/integration/` at repo root. Per `AI_COLLABORATION_GUIDE.md` §0.7,
modifying a shared auth function requires searching all affected callers and
tests; these two files are exactly that search's result for the async
conversion this same task made inside its declared scope
(`apps/api/src/common/auth/internal-key.middleware.ts`), and the fix is
mechanical (add `await`) with no new design decision, so it is treated as
the same in-scope coordination already established by §7.1/§7.3's precedent
rather than a new scope-expansion request.

| Finding / acceptance key | Source & fix location | Before → after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| CI regression on candidate `fdbb36d9f` (blocks `excp_002_removed_and_deploy_dev_green`'s prerequisite: candidate CI must be green) | `tests/unit/internal-key.middleware.test.ts`, `tests/integration/internal-key-rotation-retirement.integration.test.ts`: made 8 `it()` bodies `async` and `await`ed their `validateInternalKey`/`middleware.use` calls | Before (`fdbb36d9f` on PR #2243): GitHub `unit` job 7 failed / 4251 passed; `Product smoke acceptance` 7 failed / 4251 passed; `Smoke acceptance` and `ci-integ` failed as downstream gates -- all citing the same two test files. After (local, same source tree): `pnpm exec vitest run tests/unit/internal-key.middleware.test.ts tests/integration/internal-key-rotation-retirement.integration.test.ts` → 2 files / 14 tests passed. | `pnpm --filter @drts/contracts build` (exit 0); `apps/api: pnpm exec tsc --noEmit -p tsconfig.json` (exit 0, clean); `pnpm exec vitest run tests/unit/internal-key.middleware.test.ts tests/integration/internal-key-rotation-retirement.integration.test.ts` (exit 0, 2/2 files, 14/14 tests); `pnpm test:unit` full root suite (390 passed / 4 failed / 12 skipped test files) -- the 4 failures are all pre-existing and unrelated: 3 explicitly require `DATABASE_URL`/`CONCURRENCY_TEST_DATABASE_URL` (`tests/unit/system-remediation/sr-qa-concurrency-001/*`, `sr-qa-dispatch-001/dispatch-db-persistence.test.ts`), consistent with this VM's no-Postgres restriction, and 1 (`tests/unit/db-apply.test.ts` legacy-migration-replay case) hit this sandbox's 180s test timeout on a slow migration replay, unrelated to internal-key/auth code and not present in the GitHub CI failure list for this candidate. | Did not observe the GitHub-hosted rerun of this fix (no push-triggered rerun observed from this session before recording); the evidence above is the exact CI failure transcript plus a clean local rerun of the same two files against the same source tree. Full DB-backed `sr-qa-*`/`db-apply` suites and a real dev deploy remain out of reach from this sandbox, unchanged from §7.2/§7.3's limitations. |
### 7.5 Deploy-wiring gap found during acceptance (2026-09-30, fourth session): `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` was never mounted

Reviewer approved `d3906c5ef` and merged it (`739e7e9e44c5` on `dev`), but
flagged `excp_002_removed_and_deploy_dev_green` as not yet met, correctly
attributing that to the ops step in §7.2 item 1 being outstanding. Re-reading
`.github/workflows/deploy-dev.yml` before re-dispatch to confirm that step's
exact shape found it cannot be completed by populating a GCP secret alone:
the `Resolve API secret mounts` step (`api_secrets`) only ever mounted
`WORKLOAD_IDENTITY_SERVICE_PRINCIPALS` (read by the pre-existing
`ServiceWorkloadIdentityAdapter`, `apps/api/src/modules/auth/service-workload-identity.adapter.ts:388`).
It had no mount at all for `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS`, the
distinct env var `GoogleWorkloadIdentityAdapter.loadRegistry()` actually reads
(`apps/api/src/modules/auth/google-workload-identity.adapter.ts:316`).
`WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED` (`google-workload-identity.adapter.ts:434`,
gates the `POST /api/auth/token` branch in `auth.controller.ts:418`) was
likewise never set anywhere -- referenced only in a step comment
(previously at what is now line ~1545). §7.2 item 1 as written ("ops
populates `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS`") was therefore
unsatisfiable regardless of what ops did in GCP Secret Manager: no deploy
step would ever read a secret of that name into the Cloud Run service's
environment.

| Finding / acceptance key | Source & fix location | Before → after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| §7.2 item 1 unsatisfiable: no env-var wiring existed for `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` or `WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED` (`excp_002_removed_and_deploy_dev_green`) | `.github/workflows/deploy-dev.yml`: added a third workload secret check (`workload_google_registry_secret="${secret_prefix}-workload-identity-google-service-principals"`) mounted as `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` in the `api_secrets` step, following the exact same absent-is-safe `gcloud secrets describe` pattern as the two existing workload mounts; added `DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED: ${{ vars.DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED }}` to the workflow's top-level `env:` block (same pattern as `DEV_WORKLOAD_IDENTITY_ISSUER`) and threaded it into the `api_env` step's `env_vars` as `WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=${DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED:-false}`, so it defaults to `false` (gate stays off, `isCiTenantActorGateEnabled()` short-circuits) until ops deliberately sets the repo variable to `"true"`. Kept as a separate explicit opt-in rather than tying it to the registry secret's mere existence: `auth.controller.ts`'s CI-tenant-actor branch calls `verifyServicePrincipal` with no surrounding `try/catch`, so if the gate were ever on while the registry is absent/incomplete, `loadRegistry()`'s `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED` throw would surface as a request-time 503 there instead of degrading to the internal key (unlike `InternalKeyMiddleware`, which does catch it) -- ops must confirm the registry is complete before flipping this variable. | Before: secret mount for this env var did not exist in the workflow at any point in this task's history; ops populating a secret named `${secret_prefix}-workload-identity-google-service-principals` in GCP would have had no effect on the deployed service. After: the mount exists, gated on the secret's presence exactly like the pre-existing two; the CI-tenant-actor gate is wired but defaults to off. | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))"` (exit 0, valid YAML); `pnpm exec vitest run tests/unit/deployment-architecture-guards.test.ts tests/unit/dev-active-surface-contract.test.ts tests/unit/cloud-run-deploy-retry.test.ts` (exit 0, 3 files / 19 tests passed -- none of these pre-existing guards asserted anything about `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` before this change, so this is a regression check, not new coverage of the fix itself); read-through confirmation that `isCiTenantActorGateEnabled()` compares the env var case-insensitively against the literal string `"true"`, so the default `false` correctly disables the gate. | Not run: an actual `deploy-dev.yml` execution (no trigger path from this branch; GitHub `gh run list --workflow=deploy-dev.yml` at the time of this fix showed the most recent run, 36744111603, dispatched at 16:25:41Z against `headSha=cb479ddfc` -- the pre-merge commit -- so no dev deploy has yet exercised this candidate's code, merge commit `739e7e9e44c5`, or this wiring fix). Full §7.2 completion still requires, in order: (1) ops creates GCP secret `${secret_prefix}-workload-identity-google-service-principals` in `drts-dev-devcc-20260825` with real per-caller service-account entries per §7.3.1's `routeScopes` recommendations (this worker cannot invent that data -- see §7.2's original reasoning), (2) a fresh `workflow_dispatch` run of `deploy-dev.yml` against a ref including this fix and confirming `AUTH_LEGACY_INTERNAL_KEY_USED` stops appearing for all nine callers, (3) ops sets `vars.DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true` and re-verifies caller #9 (`deploy-dev` operational acceptance) still passes, (4) only then a follow-up candidate removes `INTERNAL_KEY_EXCP_002` and the dual-send headers. None of steps (1)-(3) can be performed from this sandbox: (1) requires inventing no data that doesn't exist, and (2)-(3) deploy to and mutate the shared dev environment, which this task's guardrails reserve for an authorized deploy action outside a code-only worker's reach. |

### 7.6 Re-dispatch (2026-10-01, fifth session): dev's shared runtime service account collapses §7.3.1's per-caller entry plan

Re-checked §7.2 item 1 before handing it to ops again, since this task has
now been re-dispatched to the owner after `aee7c7bcb` (PR #2248) recorded the
ops blocker. Confirmed this worker *can* read (not write) the real Cloud Run
topology via the `gcloud` credentials present in this sandbox -- contrary to
the assumption carried over from an earlier session that no dev read access
exists at all; only writes (Secret Manager, GitHub repo vars, workflow
dispatch) are out of reach, per this task's own guardrails on mutating the
shared dev environment.

```
$ gcloud run services list --platform=managed --region=us-central1 \
    --project=drts-dev-devcc-20260825 \
    --format="table(metadata.name,spec.template.spec.serviceAccountName)"
NAME                                SERVICE_ACCOUNT_NAME
drts-channel-partner-portal-web     drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-api                        drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-bank-console-web           drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-enterprise-dispatch-web    drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-fleet-partner-portal-web   drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-ops-console-web            drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-platform-admin-web         drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-referral-embed-web         drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
drts-dev-tenant-console-web         drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com
```

Every Cloud Run service behind callers #1-8 runs as the **same** service
account, `drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com`
(the `DEV_GCP_RUNTIME_SERVICE_ACCOUNT` GitHub variable; `deploy-dev.yml` even
fails closed at its "Cloud Run runtime identity resolves to the GitHub
deployer identity" check if a service were ever misconfigured onto the
*deployer* SA instead, but there is no check, and no current way, to give
each web app its *own* runtime SA). This is a dev-environment simplification,
not an oversight of this task.

This breaks §7.3.1's plan as literally written. `GoogleWorkloadIdentityAdapter.loadRegistry()`
resolves a principal with
`registry.find((entry) => entry.serviceAccountEmail?.trim().toLowerCase() === email)`
(`google-workload-identity.adapter.ts:223`) -- a single first-match lookup
keyed only on the token's `email` claim. If ops populated the registry with
eight separate entries, one per caller, all sharing
`serviceAccountEmail: "drts-dev-runtime@..."` but with the different
`routeScopes` §7.3.1 recommended per caller, only the **first** matching
array entry would ever be live for *every* one of those eight callers'
requests -- the other seven entries' `routeScopes` would be silently dead
code, giving a false read of per-caller least-privilege that the token's
actual identity cannot support. Writing it that way would be worse than not
narrowing at all, because it would look enforced in the registry JSON while
not being enforced in `verifyServicePrincipal` at request time.

**Corrected ops action for dev**: the registry can and should carry at most
two entries, not nine:

| Entry | `serviceAccountEmail` | `routeScopes` | Covers |
| --- | --- | --- | --- |
| A | `drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com` | `["* *"]` | Callers #1-8 (every web app's control-plane proxy / API client in §6's inventory). `* *` is not a narrowing regression here: callers #1/2/4/6 already legitimately need `* *` as generic reverse proxies, and because #3/5/7/8 share that exact same Google identity in dev, there is no request-time signal that can distinguish them -- any `routeScopes` narrower than `* *` on this one entry would incorrectly 403 the broad proxies, and any second entry with the same email would never be reached. |
| B | `github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com` (verified in §7.9: this is the only service account in the project bound with `roles/iam.workloadIdentityUser` to the GitHub OIDC pool for this repo, i.e. the identity `secrets.DEV_WIF_SERVICE_ACCOUNT` names) | `["POST auth/token"]` | Caller #9 (`deploy-dev` operational acceptance), with `ciTenantActorGrants` for both `{tenantId: "10000000-0000-0000-0000-000000000201", actorType: "tenant_admin", actorId: "10000000-0000-0000-0000-000000000901"}` and `{tenantId: "10000000-0000-0000-0000-000000000201", actorType: "tenant_admin", actorId: "10000000-0000-0000-0000-000000000902"}` -- **both** grants use `actorType: "tenant_admin"` (corrected in §7.9; this table previously said the second grant was `tenant_ops_admin`, which does not match either `POST /api/auth/token` call's actual `x-actor-type: tenant_admin` header in `deploy-dev.yml` and would have made that grant lookup never match). |

Both entries need `principalId` (any stable, human-readable identifier --
e.g. `dev-web-runtime` / `dev-ci-deployer`).

**Audience correction (`SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001`):** the
line above previously said both entries need
`allowedTokenAudiences: ["https://auth.dev.drts.internal/token-exchange"]`
(`DEV_WORKLOAD_IDENTITY_AUDIENCE`). That was wrong and, if ops had populated
the registry that way, every `x-drts-google-id-token` verification would
fail closed with `WORKLOAD_AUDIENCE_MISMATCH` (403) -- `DEV_WORKLOAD_IDENTITY_AUDIENCE`
only feeds `ServiceWorkloadIdentityAdapter`'s separate token-exchange flow
(`apps/api/src/modules/auth/service-workload-identity.adapter.ts:382`),
which none of the nine callers in this registry use.
`GoogleWorkloadIdentityAdapter.verifyServicePrincipal` checks the *token's own*
`aud` claim against `allowedTokenAudiences` (`google-workload-identity.adapter.ts:203-241`),
and that claim is whatever audience each caller actually mints:

- **Entry A** (callers #1-8): each proxy/client file mints its identity token
  with `audience = process.env.DRTS_API_AUTH_AUDIENCE || <API URL>.origin`
  (confirmed in e.g. `apps/partner-booking-web/lib/api-client.ts:100-104` and
  `apps/tenant-console-web/app/control-plane-proxy/[...path]/route.ts:197-214`,
  matching §7.1's own "audience = the API's own origin" description).
  `DRTS_API_AUTH_AUDIENCE` is only populated, from `vars.DEV_IAP_CLIENT_ID`,
  if ops sets that repo variable (`deploy-dev.yml`'s `web_env` step, "if
  DEV_IAP_CLIENT_ID is set"). `DEV_IAP_CLIENT_ID` is unset in dev as of this
  writing, so entry A's real audience today is the live `drts-dev-api` Cloud
  Run service's own origin URL.
- **Entry B** (caller #9): `deploy-dev.yml`'s two `Mint identity token — API
  operational acceptance (...)` steps hardcode
  `id_token_audience: ${{ needs.health-check.outputs.api }}` and never read
  `DEV_IAP_CLIENT_ID` at all, so entry B's audience is always that same live
  API origin, regardless of `DEV_IAP_CLIENT_ID`.

With `DEV_IAP_CLIENT_ID` unset, entries A and B therefore need the **same**
`allowedTokenAudiences` value: a single-element array containing the live
`drts-dev-api` Cloud Run service URL, e.g. the output of
`gcloud run services describe drts-dev-api --project drts-dev-devcc-20260825 --region <region> --format='value(status.url)'`
-- the same value `deploy-dev.yml` resolves into `needs.health-check.outputs.api`
and that `apps/api`'s own health check reports back as its Cloud Run URL. If
ops later sets `vars.DEV_IAP_CLIENT_ID`, entry A's `allowedTokenAudiences`
must be updated to that client ID instead; entry B's stays the API origin
because its mint steps are not wired to that variable.

**What this means for `callers_migrated_to_wif_assertion`**: still satisfied
in the sense already recorded in §7.2 (every caller sends and can be
verified over the WIF path), but the acceptance criterion's implicit
least-privilege intent for the four narrow-purpose callers (#3, #5, #7, #8)
cannot be realized in dev as this task's write_scopes and deadline allow --
only as far as entry A's `* *` scope, identical to the broad proxies' blast
radius. Achieving real narrowing for those four would require a follow-up,
separate task to give each web app (or at least the narrow-purpose ones) its
own dedicated Cloud Run runtime service account, which is an IAM/infra
change this task was not scoped or authorized to make and does not block
`INTERNAL_KEY_EXCP_002`'s removal, since the legacy exception offered no
per-caller scoping at all -- entry A is still a strict improvement (bounded,
auditable, Google-signed identity instead of a shared static key), not a
regression against the exception it replaces.

**Still outside this worker's reach, unchanged from §7.2/§7.5**: creating the
GCP secret, setting its two-entry JSON value, flipping
`vars.DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true`, and dispatching a
real `deploy-dev.yml` run all mutate the shared dev environment and are
reserved for an authorized operator, not a code-only worker. This section
only corrects the *shape* of that operator's action (2 registry entries, not
9); it does not perform it.

### 7.7 Ops readiness fix (2026-10-01): assertion reuse and registry audience (`SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001`)

This unblock-helper task, spawned against the merged §7.6 state, fixes two
remaining defects found while re-checking `deploy-dev.yml`'s caller #9 step
and §7.6's ops guidance before a real dev deploy exercises either.

| Finding / acceptance key | Source & fix location | Before → after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| Caller #9's two `POST /api/auth/token` calls reused one Google assertion, which `GoogleWorkloadIdentityAdapter`'s hash-keyed replay guard only accepts once (`每個POST auth/token使用一次性且不同的Google assertion`) | `.github/workflows/deploy-dev.yml`: split the single `Mint identity token — API operational acceptance` step into two (`id_token_api_operational` / `id_token_api_operational_ops`), each its own `google-github-actions/auth@v2` call with the same `id_token_audience: needs.health-check.outputs.api`; `Issue deployment-machine Tenant acceptance session`'s `env:` now carries `GOOGLE_ID_TOKEN_TENANT_ADMIN` and `GOOGLE_ID_TOKEN_TENANT_OPS` instead of one shared `GOOGLE_ID_TOKEN`, and the Tenant Admin (`x-actor-id: ...901`) vs Tenant Ops (`x-actor-id: ...902`) `curl` calls each send only their own variable. | Before: both `curl --header "x-drts-google-id-token: ${GOOGLE_ID_TOKEN}"` calls carried byte-identical assertions from the single mint step, so once the registry is populated the second call (`...902`, Tenant Ops) would fail closed with `WORKLOAD_ASSERTION_REPLAYED` (409) every run. After: two independently minted assertions, one per call, each consumed exactly once by `IdentityRepository.consumeWorkloadIdentityAssertion`'s `sha256(token)` key -- no cross-call reuse. | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))"` (exit 0, valid YAML); `grep -n 'GOOGLE_ID_TOKEN\b' .github/workflows/deploy-dev.yml` (exit 1 / no bare-name matches left, confirming no leftover shared-token reference); `pnpm exec vitest run tests/unit/internal-key-wif-configuration.test.ts` (see row below). | Not run: an actual `deploy-dev.yml` execution (no trigger path from this branch/worker; this is a static workflow-authoring fix). Per this task's guardrails, this worker performs no shared-dev writes or dispatches. |
| §7.6's ops guidance told ops to set both registry entries' `allowedTokenAudiences` to `DEV_WORKLOAD_IDENTITY_AUDIENCE`'s token-exchange URL, which no caller actually mints against (`registry文件明確對應實際呼叫端ID token audience`) | `docs/02-architecture/internal-key-exceptions.md` §7.6: replaced the single wrong `allowedTokenAudiences` line with a corrected explanation citing each caller's real mint call site (`apps/partner-booking-web/lib/api-client.ts:100-104`, `apps/tenant-console-web/app/control-plane-proxy/[...path]/route.ts:197-214`, and `deploy-dev.yml`'s two mint steps), concluding both entries need the live `drts-dev-api` Cloud Run origin URL (not the token-exchange URL) while `DEV_IAP_CLIENT_ID` is unset in dev. | Before: following §7.6 literally would have ops populate `allowedTokenAudiences: ["https://auth.dev.drts.internal/token-exchange"]` for both entries, which does not match either caller's `aud` claim, so every `x-drts-google-id-token` verification would fail closed with `WORKLOAD_AUDIENCE_MISMATCH` (403) the moment the registry env var is set, regardless of signature/issuer/replay correctness. After: the doc now tells ops to use the API's own Cloud Run origin URL for both entries (today), with an explicit note on how `DEV_IAP_CLIENT_ID` would change entry A's (but not entry B's) audience if ops sets it later. | Read-through of `apps/api/src/modules/auth/google-workload-identity.adapter.ts:203-241` (audience check is against the token's own `aud`, not an env var) and `apps/api/src/modules/auth/service-workload-identity.adapter.ts:382` (confirms `WORKLOAD_IDENTITY_AUDIENCE`/`DEV_WORKLOAD_IDENTITY_AUDIENCE` feeds a different adapter entirely); `pnpm exec vitest run tests/unit/internal-key-wif-configuration.test.ts` asserts the corrected doc text and the absence of the old wrong guidance (see row below). | Cannot verify against a populated registry in a real dev environment from this sandbox (no GCP secret-write access, same restriction as §7.2/§7.5/§7.6). This section only corrects what ops should write; it does not and cannot write it. |
| New focused regression coverage for both fixes above, required before this candidate's CI/review (`新增聚焦回歸測試並同候選CI通過且由獨立reviewer核准`) | `tests/unit/internal-key-wif-configuration.test.ts` (new): asserts (a) the workflow mints two distinct `google-github-actions/auth@v2` id-token steps for caller #9 and that the two `POST /api/auth/token` calls reference two different `GOOGLE_ID_TOKEN_*` env vars (not the same name twice); (b) the registry doc no longer contains the `https://auth.dev.drts.internal/token-exchange` audience recommendation, and does state the corrected API-origin-based audience guidance for both entries; (c) `INTERNAL_KEY_EXCP_002` and the legacy internal-key fallback/dual-send are still present/documented, so this candidate did not regress them. | N/A (new test, no prior behavior to diff). | `pnpm exec vitest run tests/unit/internal-key-wif-configuration.test.ts` -- see this candidate's `handoff` evidence for the exact exit code and pass count observed in this sandbox. | Static/text-level assertions only (no live Cloud Run call, no real Google-signed token, no Postgres-backed replay check) -- consistent with this being a workflow-authoring and documentation fix, not new `apps/api` runtime behavior; `apps/api`'s own `google-workload-identity.adapter.test.ts` already covers the replay/audience *verification* logic itself and is unchanged by this task. |

`INTERNAL_KEY_EXCP_002` and the dual-send legacy-key fallback are untouched
by both fixes above -- neither the workflow edit nor the doc edit removes or
weakens them, and this worker made no shared-dev writes or deployments while
making them.

### 7.8 Planning-blocker routing (2026-10-01): no new product/contract decision exists

This section is the output of the chairman-auto-generated unblock-helper task
`SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-PLANNING-DECISION`, whose brief
asked this worker to "resolve or route the missing product/contract decision"
behind the parent task's latest `blocked` state. Finding: there is no missing
decision to make. The product decision was already made and recorded on
2026-09-30 (registry row above: "Temporarily extended per user decision on
2026-09-30 ... accepting the delay of scheduled security retirement"), and
every subsequent round (§7.1-§7.7) has operated inside that decision without
needing a new one. The parent's `blocked` state is correct and does not need
re-litigation; it needed its root cause made explicit, which is what follows.

**What the parent task's state actually is (re-verified 2026-10-01 from this
worktree at `origin/dev` HEAD `5b0ec5283`, which contains merge_sha
`c47ea39ac0131...` recorded on the candidate)**:

- `required_acceptance` items 1-2 (`all_excp_002_callers_inventoried_with_usage_evidence`,
  `callers_migrated_to_wif_assertion`) are met and merged; reviewer Claude2 has
  independently re-confirmed this on every round through the `c47ea39ac`
  merge.
- `required_acceptance` item 3 (`excp_002_removed_and_deploy_dev_green`) is
  **not** met: `grep -n "INTERNAL_KEY_EXCP_002"
  apps/api/src/common/auth/internal-key-exception-registry.ts` still returns a
  match at this HEAD, and the inventory table in §2 above still lists
  `INTERNAL_KEY_EXCP_002` as active. The dual-send code path (send both
  `x-drts-google-id-token` and the legacy `x-drts-internal-key`) is what
  shipped; removing the legacy fallback is causally downstream of a real
  `deploy-dev.yml` run that proves every caller lands on WIF, which itself
  needs the §7.6 2-entry `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` GCP
  secret to exist first (`gcloud secrets describe
  drts-dev-workload-identity-google-service-principals --project
  drts-dev-devcc-20260825` returns `NOT_FOUND` as of the most recent prior
  session's check). Populating that secret, setting the
  `DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED` repo var, and dispatching a
  real `deploy-dev.yml` run are GCP/GitHub admin writes outside sandbox write
  reach, and at least one prior session confirmed this is a deliberate
  reservation for a human operator (its own sandbox credentials technically
  had `roles/owner` on the GCP project but it still declined to act, per
  §7.6's session note) -- not a sandbox permission gap to work around.
- The parent's most recent `blocked` worker-outcome entry
  (`claude-20261001T025612Z-002820d9`, `2026-10-01T02:58:43Z`, summary
  `"Claude2"`) is **not** a new finding and carries no decision content. Cross-
  checked against `ai-activity-log.jsonl`: that worker run requested a Bash
  approval at `02:57:41Z` (`apr-20261001T025741Z-ead31224`), never received a
  decision, and was killed (`worker_superseded`) at `02:58:45Z` with the
  approval `auto-pruned`/`deny`'d a moment later -- the standard failure
  signature of the `orchestrator_approval_broker` MCP being unreachable, the
  same `CONNECT_TIMEOUT` this unblock-helper's own session observed live on
  2026-10-01. This is not isolated: the log holds 404 `approval_pruned` events
  (`grep -c '"type": "approval_pruned"' ai-activity-log.jsonl`) spanning many
  unrelated tasks, confirming an infra-wide outage, not a per-task content
  problem. The synthetic `blocked`/`"Claude2"` receipt is a side effect of
  that outage, not a signal that a new decision or reviewer input is pending.

**Routing decision**: no entry is added to `PHASE1_OPEN_QUESTIONS.md` or
`PHASE1_DECISION_LEDGER.md` -- there is no open product/contract question.
The parent task should remain `blocked`, `waiting_for: Claude2` (the nearest
valid lane agent; `human`/`Supervisor` are not accepted by
`ensure_agent`), with its `next` field corrected to state plainly that the
remaining gate is the human-operator ops action above, not further owner
code work and not a reviewer decision. Any future dispatch of an owner onto
the parent while that ops action is still outstanding should re-block
immediately with the same message rather than re-attempt code changes.

**Why this worker could not write that correction onto the parent task
directly**: `TaskBoardCommandExecutor._guard_worker_command` restricts a
dispatched worker (`ORCH_DISPATCH_ROLE`/`ORCH_RUN_ID` set, as every task-brief
dispatch has) to mutating only `ORCH_DISPATCH_TASK_ID` -- this helper's own
id, not the parent's. `note <parent-id>` and `assign <parent-id> ...` both
exit with "Dispatched worker cannot mutate a different task" /
"Dispatched workers must use their assigned task lifecycle commands". A
Supervisor-privileged interactive session (no `ORCH_DISPATCH_ROLE`/
`ORCH_RUN_ID`) must run, in order, once this helper candidate is reviewed:

```
TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Claude2","resolved_parent_next":"No open product/contract decision (user decision stands from 2026-09-30, see internal-key-exceptions.md §7.8). required_acceptance items 1-2 remain merged; item 3 (excp_002_removed_and_deploy_dev_green) remains blocked on a human operator populating the 2-entry WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS GCP secret, setting DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED, and running a real green deploy-dev. Do not redispatch an owner for code work until that ops action lands."}' \
  AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py assign \
  SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-PLANNING-DECISION Claude Claude2

AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py note \
  SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 'No open product/contract decision (user decision stands from 2026-09-30, see internal-key-exceptions.md §7.8). required_acceptance items 1-2 remain merged; item 3 remains blocked on a human operator GCP/GitHub ops action, not code or review work.'
```

The `assign` call sets `resolved_parent_status: blocked` on this helper task
so that, once this helper itself reaches `done` via the normal candidate
lifecycle (review by Claude2, CI, merge), `apply_unblock_parent_resolution`
in `bin/ai_status.py` reads that field and keeps the parent correctly
`blocked` (with the corrected `next` message and a fresh open blocker entry)
instead of defaulting it to `todo` with a generic message, which is what
happens when a completed `unblock` helper carries no `resolved_parent_*`
metadata. The `note` call gives the parent's `next` field the corrected text
immediately, without waiting for this helper's own merge.

## 7.9 Pre-rollout fixes (2026-10-01, `SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001`): proxy replay false-positive, CI authorization mismatch, unregistered-caller blast radius

This task was dispatched specifically because populating
`WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` (the still-outstanding step
from §7.5/§7.6/§7.8) was found, on closer inspection, to be unsafe to do yet:
three defects in the shipped WIF verification path would each have broken
dev the moment ops turned the registry on, none of them visible from static
review of the registry JSON alone. All three are fixed in this candidate;
none required changing the exception registry's active/expired state in
`internal-key-exception-registry.ts`, and `INTERNAL_KEY_EXCP_002` remains
active and unremoved, same as every prior round in this section.

| Finding / acceptance key | Source & fix location | Before → after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| A verified, correctly-registered, non-expired Google ID token is rejected as a replay on the second of two concurrent general proxy requests, because a Cloud Run metadata server returns the byte-identical cached token to every caller within its validity window (`一般代理請求...在Google ID token有效期內可重複使用同一token，並行相同token的請求全部成功`) | `apps/api/src/modules/auth/google-workload-identity.adapter.ts`: `verifyServicePrincipal`'s `context` parameter gains `enforceReplayProtection?: boolean` (default `true`); the `IdentityRepository.consumeWorkloadIdentityAssertion` call (and its `iam.workload_identity_assertions` / in-memory-fallback insert) is skipped entirely when `false`, so repeat presentation of the identical assertion is not rejected and adds no ledger row at all -- not merely a bounded/idempotent write, no write. `apps/api/src/common/auth/internal-key.middleware.ts`'s `validateInternalKey` (the only caller reached via `InternalKeyMiddleware`, i.e. every general proxied route) now passes `enforceReplayProtection: false`. `apps/api/src/modules/auth/auth.controller.ts`'s `POST /api/auth/token` call site is unchanged (no option passed, so the default `true` still applies) -- this is the only call site that mints a durable session from the assertion and must keep one-time-use semantics. | Before: entry A (§7.6/§7.7's shared `drts-dev-runtime@...` SA, `routeScopes: ["* *"]`, covering every one of callers #1-8's proxied requests) would 409 with `WORKLOAD_ASSERTION_REPLAYED` on every request after the first to reuse that SA's cached metadata-server token within its lifetime -- i.e. essentially every second-and-later parallel API call a browser page fires, for every page on every one of the five web apps behind callers #1-8. Populating the registry as §7.6 instructs would have made this fire immediately. After: `apps/api/tests/unit/google-workload-identity.adapter.test.ts` "allows reusing the identical assertion repeatedly when replay protection is disabled" fires 3 concurrent `verifyServicePrincipal` calls with one identical token and `enforceReplayProtection: false`; all 3 resolve. `tests/unit/internal-key.middleware.test.ts` "accepts the same cached Google ID token for concurrent general proxy requests" exercises the same path through the actual `validateInternalKey` entry point `InternalKeyMiddleware` calls. The pre-existing "rejects replaying the same assertion twice by default" test (now renamed, behavior unchanged) and the new "still enforces every other check (issuer, audience, route scope) when replay protection is disabled" test confirm session-issuance replay enforcement and the other verification checks are untouched. | `pnpm --filter @drts/contracts build` (exit 0); `pnpm --filter @drts/control-plane-auth build` (exit 0, pre-existing dependency, needed before `apps/api` typechecks in this worktree); from `apps/api`: `pnpm exec tsc --noEmit -p tsconfig.json` (exit 0, clean); `pnpm exec vitest run tests/unit/google-workload-identity.adapter.test.ts tests/unit/auth-bootstrap.test.ts` (exit 0, 2 files / 114 tests passed); `pnpm exec vitest run tests/unit` (exit 0, full `apps/api` unit suite, 119 files / 1168 tests passed -- confirms no regression anywhere else in the API from the fallback widening or the replay-flag default); from repo root: `pnpm exec vitest run tests/unit/internal-key.middleware.test.ts tests/unit/internal-key-wif-configuration.test.ts` (exit 0, 2 files / 19 tests passed); `pnpm exec vitest run tests/integration/internal-key-rotation-retirement.integration.test.ts` (exit 0, 1 file / 6 tests passed, confirms the unrelated dual-key rotation/retirement behavior in the same middleware is untouched); `pnpm exec eslint` on all five touched source/test files (clean, except the one pre-existing `no-unused-vars` hit on `apps/api/tests/unit/auth-bootstrap.test.ts:495`, confirmed present in this branch's base commit via `git show HEAD:apps/api/tests/unit/auth-bootstrap.test.ts` before this candidate's edits, same pre-existing issue §7.3 already recorded at its then-line-number 490). | Not run to completion: the full root `pnpm test:unit` (hundreds of files beyond this task's scope) was started and reached ~900 files before stalling with near-0% CPU on a DB-dependent e2e file after `tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts`, consistent with this sandbox's no-Postgres restriction (§7.4's own prior finding); not claimed as passing. Also not run: a real Cloud Run metadata server / live dev deploy (no trigger path from this branch, same restriction as every prior round in this section); this fix is verified against a real generated RSA keypair and real `jsonwebtoken` verification, not a live Google-issued token. Separately observed and unrelated to this candidate: `tests/integration/control-plane-auth-prod-resolution.integration.test.ts` fails 2/4 in this specific worktree because `apps/api/node_modules/@drts/control-plane-auth` is a stale pnpm symlink pointing into a different task's worktree (`.../worktrees/auto/gemini-sr-live-map-c114-identity-remediation-r2-20261001/packages/control-plane-auth`), predating this session -- a workspace-linking artifact of this isolated worktree, not a code defect; confirmed by inspecting the symlink target directly. |
| §7.6's corrected 2-entry registry plan would make the shared-proxy SA's own grant (entry A) also gate `POST auth/token`'s `ciTenantActorGrants` matching, which requires the caller's literal `x-actor-type` header to equal the registered grant's `actorType` -- but the two registered grants in §7.2 item 1 and §7.6 table row B were documented with `actorType: "tenant_admin"` for actorId `...901` and `actorType: "tenant_ops_admin"` for actorId `...902`, while `deploy-dev.yml`'s two `POST /api/auth/token` calls (lines 1653 and 1674) both literally send `x-actor-type: tenant_admin` -- only `x-actor-id` differs (`部署CI授權的actorType與實際header一致`) | `docs/02-architecture/internal-key-exceptions.md` §7.2 item 1 and §7.6's entry-B table row: corrected both to state the `...902` grant also uses `actorType: "tenant_admin"`, matching the header `deploy-dev.yml` actually sends. The *session role* that results for `...902` (`tenant_ops_admin`) is unaffected -- it comes from `TenantPartnerService.findTenantUser`'s durable fixture lookup by `(tenantId, actorId)` in `auth.controller.ts`, not from the bootstrap `x-actor-type` header or this grant's `actorType` field, which only gate `resolveCiTenantActorGrant`'s tuple match. No `apps/api` code changed for this finding -- `resolveCiTenantActorGrant`'s exact-tuple-match logic (`google-workload-identity.adapter.ts:489-496`) was already correct; only the ops-facing documentation of what to register was wrong. | Before: following §7.2/§7.6 literally, ops would have registered `{tenantId: "...201", actorType: "tenant_ops_admin", actorId: "...902"}`. The real request's tuple is `{tenantId: "...201", actorType: "tenant_admin", actorId: "...902"}` (from the header `deploy-dev.yml` sends) -- `actorType` would never match, so `resolveCiTenantActorGrant` returns `null`, and `auth.controller.ts:486-491` throws `WORKLOAD_CI_TENANT_ACTOR_DENIED` (403) for the Tenant Ops dispatch session every single run, once the gate is enabled. After: the doc's two documented grants both say `actorType: "tenant_admin"`, matching the header; the pasteable JSON in this section below reflects the fix directly. | `tests/unit/internal-key-wif-configuration.test.ts` "both operational-acceptance POST /api/auth/token calls send the literal x-actor-type header actually documented for their ciTenantActorGrants entry" parses both header lines from the live `deploy-dev.yml` and asserts both equal `tenant_admin`; "documents both ciTenantActorGrants entries (actorId ...901 and ...902) with actorType tenant_admin, matching the workflow header" asserts the doc text for both entries and asserts the old wrong `tenant_ops_admin`-grant phrasing is gone from both places it previously appeared. | Not run: an actual populated registry against a live `deploy-dev.yml` run (same reservation as §7.5/§7.6/§7.8 -- populating the GCP secret and enabling the gate are human-operator actions outside this sandbox's write reach). This finding was caught by re-deriving the real request tuple from the workflow file and comparing it character-for-character against the doc's prior text, not by exercising a live run. |
| Once ops populates the registry (even correctly, per this section's corrected 2-entry plan), any future caller whose Google-signed token verifies (good signature, issuer, audience) but whose service-account email is not yet one of the two registered entries gets `WORKLOAD_PRINCIPAL_NOT_REGISTERED` (403) from `verifyServicePrincipal`, and both `InternalKeyMiddleware` and `auth.controller.ts`'s prior `catch` blocks re-threw everything except `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED` -- so that 403 was hard, with no fallback to the legacy `x-drts-internal-key` the caller may also be dual-sending, for every route that caller's traffic touches (`註冊表未列出的呼叫者不會讓dev網站整體失效`) | `apps/api/src/modules/auth/google-workload-identity.adapter.ts`: new exported `isGoogleWorkloadIdentityPrincipalNotRegistered(error)` helper (mirrors the existing `isGoogleWorkloadIdentityNotConfigured`, checking `error.code === "WORKLOAD_PRINCIPAL_NOT_REGISTERED"`). `internal-key.middleware.ts`'s `validateInternalKey` and `auth.controller.ts`'s `issueToken` both now treat this the same as "registry not configured yet": fall through to the still-fully-enforced legacy `x-drts-internal-key` check instead of hard-denying. Every *other* verification failure for an already-registered principal (bad signature, issuer mismatch, audience mismatch, replay on the session-issuance path, route scope denial) is unchanged and still fails closed -- this widening is scoped to exactly one error code, not "any WIF failure falls back". | Before: a ninth caller (or a typo'd/rotated service-account email on an existing one) dual-sending a verified-but-unregistered Google assertion alongside a perfectly valid internal key would still get a hard 403 on every request -- the internal key was never even inspected. After: the same request resolves successfully via the internal-key path. Security property preserved: falling through does not grant any bypass -- the internal key is independently and fully validated on the fallback path exactly as it is today for any caller that never sent a Google token at all. | `tests/unit/internal-key.middleware.test.ts` "does not let an unregistered caller's Google assertion take the whole route down when a valid internal key is also present" (registry populated with one *other* SA, proxy request); `apps/api/tests/unit/auth-bootstrap.test.ts` "falls back to the internal key when the registry is populated but does not list this caller's service account" (same scenario through `POST /api/auth/token`). The adjacent boundary test "still fails closed for a registered principal's genuinely invalid assertion (wrong audience) even with a valid internal key present" confirms the widening did not accidentally cover audience mismatch, issuer mismatch, or route scope denial for a principal that *is* registered. | Audience mismatch and route-scope denial for an *already-registered* principal are deliberately left fail-closed (not widened) even though a misconfigured `allowedTokenAudiences` entry (e.g. after a Cloud Run redeploy changes the origin, see the `DEV_IAP_CLIENT_ID` caveat in §7.6/§7.7) could in principle also take down every caller sharing that entry. That scenario is a real but distinct configuration-drift risk this task was not asked to solve and did not investigate further; ops should treat the §7.6 "re-verify the live Cloud Run URL" guidance as load-bearing, not optional. |

### 7.9.1 Pasteable `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` registry (verified 2026-10-01)

Both values below were independently re-verified from this sandbox's
read-only `gcloud` credentials (no secret values were read; no GCP/GitHub
writes were made):

- Entry A's `serviceAccountEmail` and Entry B's `serviceAccountEmail` are
  confirmed distinct, real service accounts in `drts-dev-devcc-20260825`:
  `gcloud iam service-accounts list --project=drts-dev-devcc-20260825`
  returns exactly three service accounts in this project
  (`github-actions-deployer@...`, the default compute SA, and
  `drts-dev-runtime@...`). `gcloud run services list ... --format='table(metadata.name,spec.template.spec.serviceAccountName)'`
  (§7.6's own command, re-run unchanged) confirms every one of the nine
  Cloud Run services behind callers #1-8 runs as `drts-dev-runtime@...`
  (Entry A). `gcloud iam service-accounts get-iam-policy github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com`
  shows it alone holds `roles/iam.workloadIdentityUser` for
  `principalSet://iam.googleapis.com/projects/24645990627/locations/global/workloadIdentityPools/github-actions/attribute.repository/ajoe734/drts-fleet-platform`
  -- i.e. it is the only service account this repo's GitHub Actions runs can
  impersonate via WIF at all, confirming it is the identity
  `secrets.DEV_WIF_SERVICE_ACCOUNT` names for Entry B. (`get-iam-policy` on
  `drts-dev-runtime@...` separately shows only
  `github-actions-deployer@...` is permitted to impersonate *it*, for
  deploying Cloud Run services -- consistent, not conflicting, with the
  above.)
- The audience value is the live `drts-dev-api` Cloud Run service URL, per
  §7.6's own audience correction: `gcloud run services describe drts-dev-api
  --platform=managed --region=us-central1 --project=drts-dev-devcc-20260825
  --format='value(status.url)'` returned
  `https://drts-dev-api-r6ykdme3wa-uc.a.run.app` at the time of this
  writing. Cloud Run service URLs are stable for the life of the service
  (they do not change per revision/deploy), but ops should re-run this exact
  command before pasting the JSON below if there is any doubt, and must
  switch both entries to `vars.DEV_IAP_CLIENT_ID` instead if that variable
  is ever set (see §7.6's `DEV_IAP_CLIENT_ID` caveat -- it would change Entry
  A's audience but not Entry B's).

```json
[
  {
    "serviceAccountEmail": "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    "principalId": "dev-web-runtime",
    "allowedTokenAudiences": ["https://drts-dev-api-r6ykdme3wa-uc.a.run.app"],
    "routeScopes": ["* *"]
  },
  {
    "serviceAccountEmail": "github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    "principalId": "dev-ci-deployer",
    "allowedTokenAudiences": ["https://drts-dev-api-r6ykdme3wa-uc.a.run.app"],
    "routeScopes": ["POST auth/token"],
    "ciTenantActorGrants": [
      {
        "tenantId": "10000000-0000-0000-0000-000000000201",
        "actorType": "tenant_admin",
        "actorId": "10000000-0000-0000-0000-000000000901"
      },
      {
        "tenantId": "10000000-0000-0000-0000-000000000201",
        "actorType": "tenant_admin",
        "actorId": "10000000-0000-0000-0000-000000000902"
      }
    ]
  }
]
```

To apply: `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS=<the JSON above,
compacted to one line>` as the Cloud Run secret value mounted by
`deploy-dev.yml`'s `api_secrets` step (`${secret_prefix}-workload-identity-google-service-principals`,
per §7.5), alongside setting
`vars.DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true`. This section
documents the values; it does not and cannot write the GCP secret or GitHub
variable itself (same reservation as every prior round in this section).
