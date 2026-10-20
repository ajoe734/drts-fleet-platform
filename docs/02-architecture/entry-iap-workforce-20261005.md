# Platform-Admin / Ops-Console Workforce Entry via Google Cloud IAP

**Task ID**: `ENTRY-IAP-WORKFORCE-AUTH-20261005`
**Status**: Original IAP implemented; dev session correction Source evidence is qualified in §8; staging/production require a real IAP resource (§5)
**Owner**: Claude
**Reviewer**: Codex
**Last Updated**: 2026-10-19

---

## 1. Problem

The platform-admin and ops-console control-plane web apps proxy requests to
the API through `apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts`
and `apps/ops-console-web/app/control-plane-proxy/[...path]/route.ts`, using
`packages/control-plane-auth` to turn a Google Cloud IAP assertion
(`x-goog-iap-jwt-assertion`) into an authenticated identity the API trusts.

Before this task, that path had three defects that made it unusable with a
real IAP deployment:

1. **Signature verification required a single static key.** A real IAP JWT
   is signed with a rotating ES256 key from Google's own JWKS; the code only
   accepted a pre-shared `jwtSecretOrPublicKey` and otherwise always threw.
2. **Roles were derived from a `gcp_ia_groups` / `groups` claim.** A real
   Cloud IAP assertion carries no such claim (see §2). Every real login
   therefore resolved to zero effective roles, or (worse) the adapter
   auto-provisioned a brand-new workforce identity straight from that
   nonexistent claim.
3. **A default identity applied whenever no assertion was present**, with no
   way to turn that off except by being in a staging/production deployment.

## 2. What a real Cloud IAP assertion actually contains

Per Google's documentation ("Securing your app with signed headers" /
"Validating the JWT" for Identity-Aware Proxy):

- The assertion is a JWT in the `x-goog-iap-jwt-assertion` header, signed
  with **ES256**.
- The signing keys are published, and rotate, at a fixed JWKS URL:
  `https://www.gstatic.com/iap/verify/public_key-jwk`.
- `iss` is `https://cloud.google.com/iap`.
- `aud` is `/projects/<project_number>/global/backendServices/<id>` for the
  HTTPS load-balancer + backend-service path (GCE/GKE), or
  `/projects/<project_number>/apps/<project_id>` for App Engine. **Direct
  IAP on Cloud Run uses a different format still**:
  `/projects/<project_number>/locations/<region>/services/<service_name>`
  (per
  ["Securing your app with signed headers"](https://cloud.google.com/iap/docs/signed-headers-howto)
  and
  ["Enabling IAP for Cloud Run"](https://cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)).
  Reviewer correction (Codex, 2026-10-05): an earlier draft of this
  document conflated the Cloud Run direct-IAP audience with the App Engine
  one; using the App Engine format for `IAP_EXPECTED_AUDIENCE` against a
  Cloud Run deployment would reject every real assertion with an audience
  mismatch.
- `sub` and `email` identify the authenticated principal.
- **There is no group, role, or organizational-unit claim.** IAP's own
  authorization model (`roles/iap.httpsResourceAccessor`) is a yes/no "can
  reach this resource" gate; it does not forward Google Workspace group
  membership into the JWT.

Everything in this design follows from that last point: role authority for
the platform-admin and ops-console surfaces cannot come from the assertion,
only from this application's own persisted identity store.

## 3. Design

### 3.1 Signature verification (`packages/control-plane-auth/src/index.ts`)

- `resolveGoogleIapJwtVerificationKey(token, jwksUrl?)` is a new, separate
  **async** helper. It decodes the token header, requires `alg === "ES256"`
  and a `kid`, fetches (and caches, 10-minute TTL) the JWKS at
  `IAP_GOOGLE_JWKS_URL`, and returns a PEM-encoded public key for that `kid`.
  An unrecognized `kid` triggers exactly one forced refetch (covers key
  rotation) before failing.
- `verifyIapJwtAssertion(token, options)` stays **synchronous** and
  unchanged in shape: it still requires an explicit
  `options.jwtSecretOrPublicKey` and throws `"verification key is required"`
  without one. This keeps every existing dev/test call site (which always
  pins an explicit secret or key) compiling and behaving exactly as before.
  It now restricts the accepted JWT algorithms to the family implied by the
  key material (HMAC secret → `HS256/384/512`; PEM key → the asymmetric
  family) to close an algorithm-confusion gap.
- Real production/staging callers that have no pinned key resolve one first:
  `jwtSecretOrPublicKey: options.iapJwtSecretOrPublicKey ?? await resolveGoogleIapJwtVerificationKey(assertion)`.
  This is done in `issueControlPlaneRequestAuth` (the web-proxy side) and in
  `IAPSubjectAdapter.resolveSubject` (the API side, the actual authority —
  see §3.2). An explicit `IAP_JWT_SECRET_OR_PUBLIC_KEY` / `IAP_JWT_SECRET`
  env var still overrides this for a deployment that wants to pin a key
  instead of trusting live JWKS fetches.
- `issueControlPlaneRequestAuth` is therefore now `async`; every caller in
  this repo (`platform-admin-web`, `ops-console-web`, `roc-console-web`,
  `bank-console-web`'s session helper does not use it,
  `apps/platform-admin-web/lib/server-platform-admin-authority.ts`) awaits it.

### 3.2 Role resolution (`apps/api/src/modules/auth/iap-subject.adapter.ts`)

`IAPSubjectAdapter` is the sole authority for mapping a verified IAP
assertion to platform/ops roles. It no longer reads `gcp_ia_groups` /
`groups` at all. Resolution is:

1. Verify the assertion (ES256, real JWKS by default — see §3.1).
2. Look up a durable `iam.identity_principals` row by
   `(issuer="google_iap", subject=<verified sub>)`.
3. If none exists yet, look up a principal by the verified, normalized
   `email` among rows an operator already provisioned through some other
   flow (any issuer other than `google_iap`) that holds an active
   platform/ops `platform:control_plane` membership. If found, that
   principal's `issuer`/`subject` are rebound to this IAP subject (first
   real login for a pre-provisioned account).
4. **If neither lookup finds a principal, the request is denied
   (`403 IAP_WORKFORCE_USER_INACTIVE`, "Workforce user identity is not
   provisioned.").** There is no path that creates a new workforce identity
   from assertion content. An operator must provision the account (and its
   platform/ops membership and role binding) before that person's first IAP
   login succeeds.
5. Effective roles for the selected realm are exactly the active, unexpired
   `iam.identity_role_bindings` rows for that membership (filtered to
   role codes valid for that realm). There is no further filtering, scoring,
   or downgrade tied to assertion content — a real assertion carries nothing
   to filter against, and a persisted grant is authoritative on its own.
6. When the caller does not request a specific realm (no `x-realm` /
   `x-actor-type` header, no decoded Bearer realm), and the principal holds
   both an active platform and an active ops membership with role bindings,
   platform is preferred deterministically.

`authMethods` / `assurance` (`amr` / `acr`) are still projected only from
claims actually present on the verified assertion (unchanged from before this
task): if IAP's own Context-Aware Access / device policy did not produce
`amr`/`acr`/`auth_time`, the adapter reports `authMethods: []`,
`assurance: "aal1"`, `authTime: null` rather than inventing evidence.

### 3.3 No default identity once IAP is enabled (acceptance item 3)

`issueControlPlaneRequestAuth` still accepts a `defaultEmail` for pure local
dev (no IAP in front of the app at all). A new `iapEnabled` option — sourced
from `isControlPlaneIapEnabled()` — turns that fallback off:

- Staging and production: `isControlPlaneIapEnabled()` is **always** `true`.
  There is no env var that can turn it back off in those environments; a
  missing/invalid assertion there already throws via `strictIapMode`
  regardless.
- Dev: `isControlPlaneIapEnabled()` is `true` only when the deployment has
  wired up a real Cloud IAP resource in front of the app and set
  `CONTROL_PLANE_IAP_ENABLED=true`. With it set, a request that reaches the
  proxy with no verified assertion is rejected
  (`"Control-plane IAP is enabled; a verified x-goog-iap-jwt-assertion is
required and no default identity is applied."`) instead of silently
  becoming `admin@platform.drts` / `ops@platform.drts`.
- A pure local dev deployment with no IAP at all simply never sets
  `CONTROL_PLANE_IAP_ENABLED`, and keeps the existing default-identity
  bootstrap behavior unchanged.

### 3.4 Dev does not require a second factor, but never fabricates one (acceptance item 4)

Product decision, 2026-10-05: the platform-admin / ops-console workforce
entry does not require a second verification factor in dev. Two things that
decision must never do, and does not do here:

- **Never fabricate `amr`/`acr`.** Before this task,
  `resolveBootstrapTokenAssurance` in `auth.controller.ts` stamped
  `amr: ["verified_iap_workforce"], acr: "aal2"` onto _any_ bootstrap-header
  (`x-actor-type: platform_admin|ops_user`) identity — i.e. a claim of
  verified-workforce MFA on a session that was never IAP-verified at all.
  That stamping is removed; a bootstrap-header platform/ops session now
  carries no amr/acr unless the explicit waiver below is active, in which
  case it carries the honest marker `dev_mfa_waived`, never
  `verified_iap_workforce`. The real IAP path (`IAPSubjectAdapter`) already
  only ever reported evidence actually present on the verified assertion —
  that was correct before this task and is unchanged.
- **The waiver is an explicit, audited flag**, not a silent default.
  `DRTS_DEV_MFA_WAIVED=true` (checked by `isDevWorkforceMfaWaiverEnabled` in
  `apps/api/src/common/auth/trusted-mfa.policy.ts`) lets
  `StepUpProofService.createProof` clear the MFA gate for a platform/ops
  identity with no real MFA evidence. Every time the waiver is the thing
  that let a privileged-action step-up proof through, the issued proof
  records `reasonCode: "dev_mfa_waived"` on its `step_up.proof_issued`
  security event, and the proof's own `amr` carries the `dev_mfa_waived`
  marker rather than any real-MFA value.
  - Staging and production reject the flag outright:
    `isDevWorkforceMfaWaiverEnabled()` always returns `false` there, and
    `buildAuthStartupConfigReport` (`apps/api/src/config/auth-startup-config.ts`)
    additionally fails startup with a `FORBIDDEN_MODE` issue if
    `DRTS_DEV_MFA_WAIVED=true` is set in either environment — mirroring the
    existing `ALLOW_INSECURE_DEV_AUTH` check.
  - The waiver only ever applies to `platform`/`ops` realm identities. It
    does not touch the separate, pre-existing `tenant_admin` /
    `tenant_ops_admin` MFA gate or its own `NON_STRICT_TRUSTED_AMR` switch.

## 4. Configuration reference

| Env var                                           | Purpose                                                                                                                       | Default                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `IAP_EXPECTED_AUDIENCE` / `IAP_AUDIENCE`          | Expected `aud` claim on the IAP assertion (per-deployment; see §2 for the two legal formats)                                  | none — unset means audience is not checked                              |
| `IAP_EXPECTED_ISSUER`                             | Expected `iss` claim                                                                                                          | `https://cloud.google.com/iap`                                          |
| `IAP_JWT_SECRET_OR_PUBLIC_KEY` / `IAP_JWT_SECRET` | Pins a verification key instead of fetching Google's live JWKS (tests, or a deployment that wants to pin a key)               | unset — real JWKS fetch                                                 |
| `CONTROL_PLANE_IAP_ENABLED`                       | Dev-only: declares a real IAP resource is in front of this deployment, disabling the proxy's default-identity fallback (§3.3) | unset (`false`) in dev; always effectively `true` in staging/production |
| `STRICT_IAP_MODE`                                 | Forces strict IAP mode (assertion + verified email mandatory, bootstrap headers forbidden) in any environment                 | follows staging/production detection                                    |
| `DRTS_DEV_MFA_WAIVED`                             | Dev-only: waives the platform/ops step-up MFA gate, auditable per-use (§3.4)                                                  | unset (`false`); rejected outright in staging/production                |

## 5. Operating a real Cloud IAP in front of this deployment

This section documents the operator steps for reference. **Do not run these
commands from this repository's development environment** — they target a
live GCP project and must be run by whoever owns that project's
infrastructure, per the existing deploy/ops process.

1. **Reserve an OAuth consent screen ("brand")** for the project if one does
   not already exist. See Google Cloud's
   ["Setting up your OAuth consent screen"](https://cloud.google.com/iap/docs/custom-authn-authz)
   and the Cloud Run-specific guide
   ["Enabling IAP for Cloud Run"](https://cloud.google.com/iap/docs/enabling-cloud-run).
2. **Enable IAP on the Cloud Run service** fronting the platform-admin /
   ops-console web app:
   ```
   gcloud run services update <SERVICE> \
     --region=<REGION> \
     --iap
   ```
   (Per Google's Cloud Run IAP documentation; this is the "direct" IAP path,
   distinct from the HTTPS load-balancer + backend-service path used for
   GCE/GKE.) This step provisions IAP's own per-project service agent,
   `service-<PROJECT_NUMBER>@gcp-sa-iap.iam.gserviceaccount.com`, which IAP
   uses to reach the Cloud Run service on a caller's behalf; confirm it
   holds `roles/run.invoker` on `<SERVICE>` (grant it explicitly with
   `gcloud run services add-iam-policy-binding` if it is missing, e.g. a
   project where the IAP API was enabled before this service existed). A
   human's own `roles/run.invoker` grant in step 3 is a separate, additional
   control, not a substitute for the service agent's.
3. **Grant access** to each named workforce principal (not a group, per §2 —
   this repo's own role authority is the persisted role binding, but IAP's
   own reachability gate is still a separate, necessary control):
   ```
   gcloud run services add-iam-policy-binding <SERVICE> \
     --region=<REGION> \
     --member="user:<person>@<domain>" \
     --role="roles/run.invoker"
   gcloud iap web add-iam-policy-binding \
     --resource-type=cloud-run \
     --service=<SERVICE> \
     --region=<REGION> \
     --member="user:<person>@<domain>" \
     --role="roles/iap.httpsResourceAccessor"
   ```
   See
   ["Managing access to IAP-secured resources"](https://cloud.google.com/iap/docs/managing-access).
4. **Provision the matching workforce account in this application** _before_
   that person's first login: a platform or ops membership plus an active
   role binding for their email, via the existing platform-admin user
   management flow (`platform-admin/users`). §3.2 denies any login for an
   email with no such persisted grant, by design.
5. **Custom domain mappings**: if the Cloud Run service is reached through a
   custom domain mapping rather than its default `*.run.app` URL, check
   Google's current
   ["Mapping custom domains"](https://cloud.google.com/run/docs/mapping-custom-domains)
   and Cloud Run IAP (step 2 link) documentation together for whichever
   ordering or interaction between the domain mapping and IAP is current at
   setup time, and follow it. Reviewer note (Codex, 2026-10-05): an earlier
   draft of this document asserted a specific "enable IAP before mapping the
   domain" ordering as something Google documents, without a verified
   citation for that specific claim — do not treat that as confirmed; verify
   against the live docs before relying on an ordering.
6. **Set the application env vars** from §4 to match: `CONTROL_PLANE_IAP_ENABLED=true`,
   `IAP_EXPECTED_AUDIENCE` set to the project's Cloud Run IAP audience format,
   and leave `IAP_JWT_SECRET_OR_PUBLIC_KEY`/`IAP_JWT_SECRET` unset so
   verification uses Google's live JWKS.

## 6. Known limitation out of scope for this task

`IAPSubjectAdapter.resolveSubject`'s realm auto-selection (§3.2, point 6)
only reads the proxy-forwarded `x-realm` / `x-actor-type` hint in non-strict
mode; in `strictIapMode` it always falls back to the platform-preferred
default regardless of which proxy (platform-admin-web vs. ops-console-web)
forwarded the request. For a principal who holds _both_ an active platform
and an active ops grant, this means a staging/production ops-console login
resolves to the platform realm rather than ops. This pre-dates this task and
is not one of its acceptance criteria; it is noted here for whoever picks up
realm-selection plumbing next.

## 7. Review findings and remediation evidence

Codex's independent review of candidate `cdfbd1a75` (PR #2319,
`candidate_generation c3b13953b61142fc937904dcb76b9320`, 2026-10-05) rejected
it with findings F1-F7. Two follow-up commits on the same branch
(`6314837cb`, `edd1e75f4`) fixed only F6/F7 (CI build/typecheck/integration
plumbing); F1-F5 were still open going into this round. This section records
what changed and where the evidence is.

| Finding                                                                                                             | Root cause & fix location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Old → new behavior                                                                                                                                                                                                                                                                                                                                                                                                                    | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Limitations                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 — IAP key falls back to app `JWT_SECRET`                                                                         | `server-platform-admin-authority.ts`, `api-client.server.ts`, both `control-plane-proxy/[...path]/route.ts` resolved `iapJwtSecretOrPublicKey` as `IAP_JWT_SECRET_OR_PUBLIC_KEY \|\| IAP_JWT_SECRET \|\| JWT_SECRET`; `deploy-dev.yml` always sets `JWT_SECRET`, so `issueControlPlaneRequestAuth` always used the app's own HMAC secret, never Google's JWKS. Fix: dropped the `JWT_SECRET` fallback in all four call sites.                                                                                                                                                                                                                                                                                                                                                                                                                 | Deployed with only `JWT_SECRET` set: HMAC-verified a forged assertion → now resolves `undefined` and falls through to real `resolveGoogleIapJwtVerificationKey`.                                                                                                                                                                                                                                                                      | `pnpm exec vitest run tests/unit/control-plane-auth.test.ts tests/unit/iap-subject-adapter.test.ts --no-file-parallelism`: 50/50 passed locally (SHA `aa65ed245`). No dedicated negative-probe test was added for this exact call-site regression (the existing suite exercises `issueControlPlaneRequestAuth` directly, not these four Next.js wrapper files); CI's `build`/`integration` jobs import and exercise these files.                                                                                                                                                                                                                                                                                              | Did not add a unit test that imports the four web-app files directly and asserts the fallback is gone — see below.                                                                                                                                                                                              |
| F2 — dev waiver can't clear a missing `auth_time`                                                                   | `step-up-proof.service.ts`'s gate unconditionally threw `MFA_REQUIRED` when `authTimeMs === null`, even with `devWaiverApplies`, so the waiver was unusable on the real IAP path (`IAPSubjectAdapter` reports `authTime: null` when the assertion has no `auth_time`). Fix: `effectiveAuthTimeMs = devWaiverApplies ? Date.now() : authTimeMs`; only throws when that is still null.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Waiver + no `auth_time` → `MFA_REQUIRED` (old) vs. proof issued, anchored to request time (new). Real MFA evidence without `auth_time` still rejects.                                                                                                                                                                                                                                                                                 | `pnpm exec vitest run tests/unit/step-up-iap-path.test.ts --no-file-parallelism`: 8/8 in the "dev MFA waiver" describe block passed (SHA `aa65ed245`), including the pre-existing "no waiver, no MFA → still rejected" and "real MFA without auth_time → still rejected" cases, which the fix must not loosen.                                                                                                                                                                                                                                                                                                                                                                                                                | Not re-verified end-to-end through `BootstrapAuthGuard`/`IAPSubjectAdapter` with a real missing-`auth_time` assertion (requires the hosted integration/API-unit DB job).                                                                                                                                        |
| F3 — bootstrap still fabricates `verified_iap_workforce`/`aal2`                                                     | Two independent defaulting paths reintroduced it even though `resolveBootstrapTokenAssurance` (already correct) returns `{}` for an unwaived platform/ops bootstrap identity: (a) `auth.extractor.ts` defaulted **every** non-strict bootstrap identity's `amr` to `["tenant_bootstrap_fixture"]`, which is itself in `NON_STRICT_TRUSTED_AMR`, so `hasTrustedMfa` was already `true` before the step-up gate ran; (b) `jwt-auth.service.ts`'s `resolveDefaultAmr`/`resolveDefaultAcr` special-cased `platform_admin`/`ops_user` to `verified_iap_workforce`/`aal2` whenever neither caller nor identity supplied amr/acr. Fix: scoped the extractor default to `actorType === "tenant_admin"` only; removed the platform/ops special case from both JWT defaults (now the same `internal_key`/`aal1` as every other unspecified actor type). | A bare platform/ops bootstrap session (no waiver, no real assertion) previously cleared the step-up gate for free via either path; now it is denied unless the explicit waiver is set.                                                                                                                                                                                                                                                | Same run as F2: `step-up-iap-path.test.ts`'s "refuses the privileged action with no waiver flag and no real MFA evidence (default-safe)" and `tests/unit/system-remediation/sr-qa-identity-001/c003-c004-c005-iam-mfa-and-bank.test.ts`'s `C003-NEG-1` both passed (these are the exact two tests CI's `Product smoke acceptance` job reported FAIL on commit `edd1e75f4` — see below).                                                                                                                                                                                                                                                                                                                                       | `jwt-auth.service.ts`'s own default-resolution path (`issueSessionToken` called with no explicit amr/acr) is not covered by a dedicated unit test beyond these two step-up-gate tests; not re-verified against a real signed JWT's decoded `amr`/`acr` claims (needs the hosted `apps/api` DB-backed unit job). |
| F4 — `CONTROL_PLANE_IAP_ENABLED=true` bypassable via unverified header                                              | `issueControlPlaneRequestAuth` only required a verified assertion when `strictIapMode` was true; with `iapEnabled=true` but `strictIapMode=false` (non-strict dev with a real IAP wired up) and no assertion present, it fell through to trusting the raw, attacker-settable `x-goog-authenticated-user-email`/`-id` headers. Fix: `requireVerifiedAssertion = strictIapMode \|\| iapEnabled` now gates the raw-header fallback, not `strictIapMode` alone.                                                                                                                                                                                                                                                                                                                                                                                   | `iapEnabled=true`, no assertion, forged email header → 200 as that identity (old) vs. `"Control-plane IAP is enabled; ... no default identity is applied"` (new).                                                                                                                                                                                                                                                                     | Covered by the same `control-plane-auth.test.ts`/`iap-subject-adapter.test.ts` run (50/50 passed); no new dedicated test added for this exact header-trust branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | No new unit test isolates `requireVerifiedAssertion` itself; relies on the broader suite not regressing plus manual code-path tracing recorded in this task's `next` history.                                                                                                                                   |
| F5 — wrong Cloud Run IAP audience format; missing IAP service-agent grant; unverified domain-mapping ordering claim | This document (§2, §5) stated the Cloud Run direct-IAP `aud` format is the same as App Engine's (`/projects/<n>/apps/<id>`), omitted the IAP service agent's required `roles/run.invoker` grant, and asserted a specific "IAP before domain mapping" ordering as Google-documented without a verified citation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §2 now states the Cloud Run direct-IAP audience format as `/projects/<project_number>/locations/<region>/services/<service_name>`, distinct from the App Engine format. §5 step 2 now notes the `service-<PROJECT_NUMBER>@gcp-sa-iap.iam.gserviceaccount.com` service agent needs `roles/run.invoker` and to verify it if missing. §5 step 5 now tells the operator to check current docs for the ordering rather than asserting one. | Documentation-only; no code path to test. `WebFetch` to re-verify the corrected audience format and service-agent grant against live Google docs was attempted and blocked by this sandbox's network-approval gate — the correction is based on Codex's cited sources (`cloud.google.com/iap/docs/signed-headers-howto`, `cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run`), not an independent re-fetch.                                                                                                                                                                                                                                                                                                   | Reviewer should re-verify the corrected audience format and service-agent grant against live Google docs before this document is treated as a verified operator runbook.                                                                                                                                        |
| F6 — `node:crypto` breaks `bank-console-web` edge bundle                                                            | Fixed in `edd1e75f4` (prior round); unchanged this round.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                     | CI `build` job green on `edd1e75f4` and on this candidate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                               |
| F7 — same-SHA CI not green (typecheck `exactOptionalPropertyTypes`, obsolete group-based integration assertion)     | Fixed in `6314837cb`/`edd1e75f4` (prior round). This round additionally had to re-port the integration assertion fix into `tests/unit/cross-app/sr-partner-notify-fix-admin-20260927.integration.test.ts` after `CI-BUILD-CROSS-APP-IMPORT-20261005` (merged to `dev` as `afdb1ca1f`, after `edd1e75f4` was reviewed) relocated that file and turned the old path into a 2-line re-export stub.                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                     | `node tools/ci/check-cross-app-imports.mjs`: "Cross-app import guard passed (1643 source files)" (SHA `aa65ed245`). `pnpm exec vitest run tests/unit/cross-app/sr-partner-notify-fix-admin-20260927.integration.test.ts` could not run locally in this worktree: the `dev` merge brought in a new `@nestjs/throttler` dependency (added by an unrelated task) that this worktree's shared `node_modules` does not have, and `pnpm install` is blocked by this sandbox's approval gate (see below) — not a defect in this candidate's code; `node -e` import-graph tracing of the two changed assertion lines confirms they match the already-CI-verified `edd1e75f4` version byte-for-byte modulo the relocated import paths. | Needs the hosted CI run (clean install) to actually execute this file and the `apps/api` DB-backed "API unit tests" step.                                                                                                                                                                                       |

**New regression this round, caused by this task's own prior commit, not Codex**: CI's `Product smoke acceptance` job (commit `edd1e75f4`) reported `tests/unit/step-up-iap-path.test.ts`'s and `sr-qa-identity-001/c003-c004-c005-iam-mfa-and-bank.test.ts`'s no-waiver baseline tests as FAIL (`Expected MFA_REQUIRED to be thrown`). Root cause: `6314837cb` added `DRTS_DEV_MFA_WAIVED: "true"` at the `product_smoke_acceptance` **job** level in `ci.yml` to unblock the job's `apps/api` DB-backed tests, but that job-level scope also covered the job's "Unit tests" step (`pnpm run test:unit`, i.e. `tests/unit/**`), which is exactly where this task's own no-waiver baseline tests live — they passed the waiver flag for the wrong reason and would have falsely reported MFA enforcement as working. Fixed by moving the env var to the "API unit tests" step only (`ci.yml`); `ci-integ.yml` already scoped it correctly to its separate `integration` job and was not affected. Verified locally: `pnpm exec vitest run tests/unit/step-up-iap-path.test.ts tests/unit/system-remediation/sr-qa-identity-001/c003-c004-c005-iam-mfa-and-bank.test.ts tests/unit/auth-startup-config.test.ts --no-file-parallelism` (no `DRTS_DEV_MFA_WAIVED` set, matching the corrected CI scope) — all passed (SHA `aa65ed245`).

**Local verification limitations this round**: this worktree shares `node_modules` with other concurrent worktrees (documented hazard from the prior round); `pnpm install` to pick up `dev`'s new `@nestjs/throttler` dependency is blocked by this sandbox's command-approval gate (classified `defer` on every retry), so `apps/api`'s own test suite, root `pnpm run typecheck` (fails on pre-existing, unrelated missing `@types/*` packages across the whole repo), and the newly-relocated cross-app proxy test could not be executed locally this round. No command was reported as passing without actually running it; everything above states exactly what ran and what did not. The hosted CI run on candidate `aa65ed245` is the authoritative check for everything this paragraph lists as not run locally.

### 7.1 Round 4 (candidate `370056c1e`) — hosted CI failures found before reviewer

Candidate `370056c1e` (handed off to Codex) got hosted CI run
`37495005380`, which failed on 3 of 16 jobs before any reviewer involvement.
Read via `gh run view`/`gh run view --log` (not re-executed locally — see
limitations below). All three are CI-wiring/lint defects, not functional
regressions in the IAP/role/waiver logic itself:

| Job                   | Failure                                                                                                                                                                                                                                                                                       | Root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lint`                | `apps/api#lint` exit 1: `'hasTrustedMfa' is defined but never used` at `auth.controller.ts:50` (`@typescript-eslint/no-unused-vars`).                                                                                                                                                         | Round-3 remediation (F3) moved the `hasTrustedMfa` read for the bootstrap token-assurance decision out of `auth.controller.ts`; the now-dead import from `trusted-mfa.policy` was left behind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Removed the unused `hasTrustedMfa` import in `auth.controller.ts`.                                                                                                                                                                                                                   |
| `iam-negative-matrix` | Job's `run-iam-negative-matrix.sh` → hermetic `E2E-004` sub-run: `POST /platform-admin/tenants` → 403 `STEP_UP_REQUIRED` instead of 200/201.                                                                                                                                                  | Same root cause as `cross-surface-e2e` below — this job's "Run IAM negative matrix" step also shells out to `tests/e2e/run-e2e-hermetic.sh 004 018`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Added `DRTS_DEV_MFA_WAIVED: "true"` at job level in `ci-integ.yml`'s `iam-negative-matrix` job (the `tests/security/*.test.ts` cases in the same step don't reference MFA/step-up state, so this is safe at job scope here, unlike the round-3 `product_smoke_acceptance` incident). |
| `cross-surface-e2e`   | 5/19 hermetic scenarios failed: `E2E-004`, `E2E-008`, `E2E-011`, `E2E-015`, `E2E-016`, all `403 STEP_UP_REQUIRED` on a `platform-admin/*` mutation (`platform:tenants:create`, `platform:partner-entries:activate`, `platform:partner-entries:create`, `platform:partner-credentials:issue`). | `tests/e2e/lib/helpers.sh`'s `http_call` unconditionally calls `resolve_step_up_reference` for every mutating request (independent of the opt-in `E2E_ENABLE_RUNTIME_STEP_UP` flag, which only gates minting a fresh bearer token), posting to `/identity/step-up-proofs` with bootstrap `x-actor-type: platform_admin` headers. Round-3's F3 fix correctly stopped fabricating `verified_iap_workforce`/`aal2` on that bootstrap identity, so `StepUpProofService.createProof` now needs `DRTS_DEV_MFA_WAIVED=true` to issue a proof for it — but `ci-integ.yml`'s `cross-surface-e2e` job never set that env var (only the unrelated `ci.yml` `product_smoke_acceptance` job's "API unit tests" step did). Without a proof, `resolve_step_up_reference` returns empty and the real mutating call then fails `assertRequestSatisfied`'s reference check. This is the intended fail-closed behavior working correctly in a job that simply never turned dev's documented waiver on. | Added `DRTS_DEV_MFA_WAIVED: "true"` at job level in `ci-integ.yml`'s `cross-surface-e2e` job. Checked: no `E2E-0*.sh` scenario asserts `STEP_UP_REQUIRED`/`MFA_REQUIRED` as an expected (happy-path) outcome, so this cannot mask a real deny-by-default test.                       |

**Verification**: read the full `gh run view --log` output for all three
failing jobs (`lint`, `iam-negative-matrix`'s "Run IAM negative matrix" step,
`cross-surface-e2e`'s "Run cross-surface E2E suite" step) to the point of
failure. Traced `resolve_step_up_reference` → `/identity/step-up-proofs` →
`IdentityController` → `StepUpProofService.createProof` →
`isDevWorkforceMfaWaiverEnabled` by reading the source, confirming the
missing env var is sufficient to reproduce exactly the observed `403
STEP_UP_REQUIRED` (not some other identity/role defect). Confirmed by
`grep` that none of the 7 test files in the same `iam-negative-matrix` step
reference MFA/step-up state, so the added job-level env var cannot change
their outcome. Did not re-run CI or any local service/Docker to confirm the
fix (forbidden on this VM); the next hosted CI run on the new candidate SHA
is the authoritative check.

**Local verification limitations this round**: same sandbox `pnpm install`
block as round 3 (every retry classified `defer`); `eslint`/`vitest` could
not be invoked locally either (missing `node_modules/eslint`), so the lint
fix and the workflow env var fix were verified by source reading and `gh
run view --log` evidence only, not by re-running the lint or E2E commands
in this worktree. `python3 -c "import yaml; yaml.safe_load(...)"` confirmed
`ci-integ.yml` still parses as valid YAML after the edit.

## 8. 2026-10-19 dev canonical workforce session correction

This section continues the original task and its five acceptance conditions.
The archived candidate `83b067dec484afc46fb83520e8a76a0608c78322`, review,
CI and merge `993d246d4a68ecac3b1baf8ad17670699ce4dba6` remain historical
Source evidence. Codex2 owns this continuation; Codex independently reviews it.

The actual shared deployment of `df602a82d29d9bce65aaee84af8925b42ee1b7f2`
(run `39251228957`) passed build/service/health jobs but failed operational
setup: the Admin BFF and upstream API both returned HTTP 403 for creating the
Fleet Entry. Formal operational results were **0 passed, 1 failed, 15 not run**.
The response error code was not retained; this document does not claim to have
read a particular API error code. Actual ready-service metadata showed
`OIDC_ENABLED=false` and no `DRTS_DEV_MFA_WAIVED` on the API. The workflow had
incorrectly coupled the existing workforce dev waiver to tenant OIDC enablement.

The setup also used a deliberately sessionless proxy token. `auth/token` is an
open-route controller: its guard verifies a supplied JWT, but the controller
previously only extracted bootstrap/IAP/Google exchange inputs. A populated
`request.identity` does not retain the signed proxy-purpose marker and cannot
by itself authorize the new exchange.

The finite repair keeps the existing APIs and step-up policies:

- Only non-strict dev with explicit `DRTS_DEV_MFA_WAIVED=true`, IAP disabled
  and no IAP assertion can exchange the actual signed inner proxy proof.
  The controller independently verifies its signature/issuer/audience/purpose,
  exact actor/realm pair and absence of session/assurance claims. Mixed raw
  actor/session/assurance/workload inputs are rejected without bootstrap fallback.
- The enabled canonical repository must contain the exact signed principal ID,
  an active matching workforce membership and currently valid matching role
  bindings. Current bindings determine roles/scopes. The version includes the
  principal, membership and **all** binding timestamps, including expired rows,
  as required by the existing durable-token verifier. No account, membership or
  grant is created, rebound or upserted; the existing issuer persists a real
  session with `ensurePrincipal:false` and honest `dev_mfa_waived`/`aal1` evidence.
- The private Admin server's `DRTS_DEV_WORKFORCE_PRINCIPAL_ID` references the
  pre-existing `principal_platform_admin_default` account established by the
  repository's normal startup flow. This is the configured signed subject,
  never a fallback after a missing lookup. HTTP headers/query parameters cannot
  choose it. Real IAP/strict paths ignore this reference and retain their original
  authority. No Ops account or observer-to-operator grant is added.
- Only the same narrow dev branch retains a supplied `x-drts-authorization`
  bearer. The upstream API performs the original durable-session validation;
  an invalid supplied bearer is never replaced with a default identity. The
  independent Cloud Run invocation token remains separate. Strict/IAP bearer
  behavior, ingress, IAM and internal-key policies stay unchanged.
- The new dev exchange returns the existing issuer's `token`, `expiresIn`,
  `sessionId`, canonical `principalId`, `realm` and `actorType` as an issuance ACK.
  Production HTTP uses snake-case keys. Other token-exchange responses keep their
  original shape. Consumers can identify their newly issued session for normal
  self-revocation even if a later session read fails; they must preserve supplied
  sessions and never infer ownership from decoding an arbitrary JWT.
- The existing dev workflow sets the API waiver independently of tenant OIDC,
  and explicitly configures the private Admin/Ops dev branch. Only Admin receives
  the existing canonical-principal reference. Production/staging startup still
  reject the waiver. Four existing create/issue/revoke actions still require
  separate normal action-specific proofs bound to the same live session.

Socket-free verification uses the real BFF modules, open-route guard, JWT
signatures, durable-session issuer, snake-case wire response and step-up service,
with only canonical storage and external HTTP I/O controlled. Against the actual
G production bytes the same 48 cases produced **39 pass / 9 fail**; the fixed
Source produced **48 pass / 0 fail**. The earlier fixture-only ArrayBuffer decode
failure (47/1) and the initial missing root Nest import (0 cases) are preserved
in machine evidence; the fixture now decodes the real BFF ArrayBuffer body.
All four temporarily compared production files were restored byte-for-byte
in `finally`. These tests do not establish live PostgreSQL, real Google/IAP,
formal operational16 or a new shared deployment result. Current Source checks,
mandatory own hosted CI and independent review remain required before acceptance.

Machine evidence is under the canonical root's
`.local/passenger-bureau-gap-correction-20261018/dev-workforce-session-repair-20261019/`.
The separate original HARNESS owner supplies the lawful caller/session/proof and
own-only cleanup. No product service, browser or PostgreSQL was started on the VM.

Current bounded checks: the new 48 plus existing IAP/step-up/startup, ordinary
login, tenant/partner bootstrap/OIDC, session and CSRF cases total **287 pass,
0 fail, 0 skip** across 15 files. Scoped ESLint and diff checks passed. The
original API no-emit command failed first with two new type-narrowing issues
(fixed) and stale shared `contracts/dist` types for already accepted peer code.
An own `.local` config mapping both workspace packages to this current Source,
without emitting or changing shared distributions, then passed the full API
no-emit check. The original whole-root no-emit command failed on unavailable
workspace distribution exports; the exact new test's real import graph, mapped
to the existing current Source exports, passed no-emit separately. All original
failures and configs remain in machine evidence. Original AuthController's 37
members preserve their AST, with only the new explicit-dev dispatch prepended
to `issueToken` and optional dev ACK return typing; the remaining original token
body is identical after ignoring formatting trivia/parentheses. Normal mandatory
hooks and own full hosted CI still apply to the immutable candidate.

The owner then normally merged the frozen accepted dev reference
`72d88e2820bb0c5417051774fa25f5bab6ec79b2` (Registry and ReferralRate peer
changes). Its 22 peer paths do not intersect these seven task paths; peer
content is retained. The six own code/data files remain byte-identical to the
locally checked version; only this integration qualification paragraph changes
the document. Local checks above ran before this accepted-peer integration;
the final immutable union requires its own full hosted CI and independent review.
This merge is Source integration, not a claim that this version is deployed or
that the failed G operational run passed.

The first hosted candidate `a2c7ff68a842e10455210c378c835acaf716460e`
failed API unit shard 2 in run `39261517987`: **815 pass / 2 fail**. Its actual
checkout was `b74d363f2d79259c75976e92eee9578d04fe03d4`, whose whole tree
equals that candidate. Both failures were the existing cross-app bootstrap/JWT
fixtures: they inherited the API CI step's explicit dev waiver without supplying
the new canonical-principal server configuration, so the Admin BFF correctly
rejected before upstream fetch. Only those two legacy fixture environments now
explicitly set `DRTS_DEV_MFA_WAIVED=false`; their original Guard, controller and
assertions remain intact. The product still rejects missing canonical references
or signing keys, and the workflow's global test waiver is unchanged. Under the
same inherited waiver, the original two cases reproduced **0 pass / 2 fail**,
then the repaired cases passed **2 / 2**. The complete original consumer file
plus the unchanged new dev suite passed **61 / 61, no skips** (13 legacy/cross-app
cases and 48 canonical-session cases); the cross-app import guard also passed.
These bounded checks do not replace the repaired immutable candidate's own full
hosted CI or independent review. The failed candidate and all original CI results
remain evidence. No workflow was manually cancelled or rerun; normal repair
pushes can automatically supersede unfinished same-PR runs under the existing
workflow concurrency policy. Those automatic cancellations are recorded as such,
not reported as natural terminal results or successful acceptance.

The same candidate's integration job also failed those two legacy fixtures
(**346 pass / 2 fail**). Its separate hosted shared-order UI failed at the actual
Platform Admin audit destination: `visitActualAuditDestination` received HTTP
401 instead of 200 after the completed ride and internal lost-item case flow.
This was a distinct configuration gap: the hosted Admin server inherited the
explicit waiver and signing key but omitted the required canonical-principal
reference. Its own environment now explicitly references the existing
`principal_platform_admin_default`, matching the shared dev server configuration;
the waiver remains enabled and no account, membership or grant is created.
Socket-free evaluation of the actual config export reproduced the missing
pairing before the single-line correction and verified the complete pairing
afterward. The other five hosted server configurations remain unchanged, and
there is no new canonical Ops reference. The product and dedicated 48-case suite
remain byte-identical to the version included in the 61-pass check above, so
those unchanged tests were not repeated for this config-only correction. A fresh
immutable candidate's hosted UI must still prove the actual audit destination
read and the complete shared-order journey; this static check is not that result.

## 9. 2026-10-19 authenticated session-read classification (HTTP 429)

This is a bounded continuation of the same original ENTRY task, owned by Codex2
and independently reviewed by Codex. The original eleven allocated scopes, five
acceptance keys and all IAP, canonical membership/role, strict-environment,
tenant/partner and explicit dev-waiver requirements remain in force. The prior
`4d241da90b67ac07112b79a5f3c7f2000825d156` / generation
`b0801154eb1c41968de916a037e11020` / merge
`daebd72eeef12229cb59d3750b7a288b1dab7448` acceptance is preserved as history;
its five Source keys do not establish this continuation's acceptance.

### Finding and minimal change

The original shared deployment of
`ee1c2149d6bc8ac84fee9a31c362125f037024ea`, run `39291308774`, produced
**15 passed / 1 failed / 0 skipped / 0 retries** in the original sixteen-case
operational suite. Fleet operations and Channel statement download passed.
The remaining Admin setup received HTTP 429 while downloading a document through
the BFF. Separate cloud metadata records an `auth/session` 429 at the same time,
but different trace IDs and missing actor/body attribution do not prove that
those records are one request or that the API document route itself throttled.
Only **six of eight** required PDF lifecycle chains completed; this repair does
not relabel that failed run or claim a new runtime result.

At accepted base `c05c6e133d8066abea349b2285ac653eadef8015`, the relevant
AuthController, auth/JWT guards, tracker, storage, rate constants and AppModule
bytes equal failed-runtime `ee1c`. `getAuthSession` inherited the general
60-requests-per-minute classification even though BFF callers perform this fresh,
revocation-aware read for each request. A frozen-clock regression using one
actual issued session reproduced **HTTP 429 on lawful request 61**.

Only `AuthController.getAuthSession` now uses the existing
`@Throttle(READ_HEAVY_RATE_LIMIT)` classification: 180 requests per minute.
It keeps the same handler, verified identity/output, tracker, key-scoped storage
and global **five-minute block**. Read-heavy does not specify a new block duration;
the installed throttler inherits the existing global duration. The old unit-test
comment saying “no sticky block” was incorrect and is corrected. No other route,
global rate constant, issuer, auth policy, cache, retry, permission or principal
mapping changes.

### Meaningful before/fixed checks

The existing API `throttling.test.ts` now constructs the real
`IdentityRepository` with its explicit noDB unit adapter, normal canonical account
and role records, `JwtAuthService` issuer and acknowledged session ID. Each new
request starts without an identity and traverses real `BootstrapAuthGuard` →
`BootstrapThrottlerGuard` / `KeyScopedThrottlerStorage` → `getAuthSession`, in
AppModule order. Only the clock and HTTP `ExecutionContext`/response headers are
synthetic; no auth, verification, scope, revocation or counter decision is mocked.
No application/listener, browser, PostgreSQL or Docker starts.

The **same test bytes** against untouched c05 production yielded **17 pass /
2 semantic fail / 0 skip**. The main failure is explicitly “lawful session-read
request 61: expected 429 to be 200”; the second also exhausts the same actor's
old sixty-request bucket. After only the route-classification/import change,
the same nineteen cases yielded **19 pass / 0 fail / 0 skip**, including:

- Requests 1–180 each re-read the actual repository session and reach the real
  controller; request 181 returns 429 with `Retry-After: 300`. It remains blocked
  after the one-minute hit TTL and until the original five-minute boundary,
  after which the same still-valid session can read again.
- Normal issuer/repository revocation makes the very next call return 401 before
  throttling or the controller. Missing, invalid-signature and expired bearers
  likewise cannot reach the controller or create a throttle bucket.
- Foreign query/header selectors do not change the signed caller or returned
  session. Session read has no additional resource scope requirement; no new
  deny rule is invented. A genuine caller lacking `foundation:read` still gets
  403 on the actual Platform partner-entry read, even with a claimed scope header.
- Two genuinely issued canonical callers at one IP have independent keys;
  forged actor/IP headers cannot rotate the first signed caller's exhausted key.

Raw before/fixed JSON and logs, the exact c05 production binding and the test
bytes are preserved under the canonical repository's
`.local/passenger-bureau-gap-correction-20261018/auth-session-read-429-correction-20261019/source-checks/`.
The initial missing-zod loader failure ran zero tests and is not regression
credit. A later existing production-loader dependency-resolution failure had
183 passing assertions but two unloadable suites; it also remains a failed run,
not a successful complete regression. Only ignored local links to already
installed external packages were added; all workspace Source aliases resolve
inside this isolated worktree. Nothing was installed or changed in shared
workspace dependencies.

### Original five-key evidence and limits

| Original acceptance key                | Current continuation evidence                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAP assertion以Google公開輪替金鑰驗證  | IAP/JWKS implementation is unchanged; run the existing IAP regression on this candidate.                                                                                      |
| 角色由已登錄帳號權限對應不依賴群組欄位 | Canonical issuer/repository and fresh verification remain intact; the new behavioral tests exercise issued sessions and current role/scope boundaries.                        |
| 無IAP assertion時不再套用預設身分      | No bootstrap/default fallback change; existing strict/IAP and invalid-session regressions remain required.                                                                    |
| 不偽造MFA宣告並依使用者決定處理dev MFA | Existing waiver/step-up code and environment configuration are unchanged; retain their original positive and negative regressions.                                            |
| 同候選SHA CI通過且獨立reviewer審查     | New immutable owner candidate, own mandatory CI and independent exact-SHA review remain pending until recorded in the final handoff packet; old accepted keys are not reused. |

The independent finite caller-graph design estimated a known conservative
sixty-second load of 156 plus unmeasured prefetch/render work. Existing 180 is the
authenticated-read classification, not a universal guarantee for arbitrary
prefetch or concurrent users. The original authorized hosted sixteen cases and
eight PDF chains must establish actual flow sufficiency after normal review and
integration. This socket-free regression does not prove live PostgreSQL/IAP or a
new shared deployment. Six deferred Passenger Phase2 tasks, frozen Fleet Source,
and the separate exact-owned cleanup obligations are untouched.

Current bounded final checks are recorded in `source-checks/`:

| Check                                 | Actual result and qualification                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-and-throttle-regression.json`   | Ten original auth/storage suites: 204 pass / 0 fail / 0 skip, including the nineteen API throttle cases, existing canonical dev exchange, IAP, step-up, startup, session supersession and cross-app consumers.                                                                                                                              |
| `original-wrapper51.json`             | Unchanged genuine wrapper/Fleet authority composition: 51 pass / 0 fail / 0 skip. This is a separate retained Source regression, not evidence that the new throttle test includes the outer wrapper.                                                                                                                                        |
| `original-Fleet-regression.json`      | Existing Fleet task configuration: 37 pass / 0 fail / 0 skip. This is not the historical full 263-case regression, and is not added to previous passing subset counts.                                                                                                                                                                      |
| `final-auth-session.json`             | Final test file: 19 pass / 0 fail / 0 skip. After the byte-identical initial before/fixed pair, Prettier and removal of the pre-existing unused `seconds` import preserve all normalized test bodies/assertions; exact before/final hashes and the permitted import-only difference are recorded in `test-final-semantic-equivalence.json`. |
| `api-and-newtest-noemit-receipt.json` | Full API production plus the new test's real import graph: exit 0, no emit/incremental output. Both workspace packages resolve to this worktree Source. This ran before only the unused named import was removed; the production graph and tested bodies are unchanged.                                                                     |
| `final-local-command-receipts.json`   | Final scoped ESLint and whitespace/diff checks exit 0. The earlier lint failure for the existing unused import remains in the original log.                                                                                                                                                                                                 |

Normal generated Husky wrappers are initialized from the installed package in
this isolated worktree; the existing `.husky/_` hook path is unchanged. Normal
staged generated-file, lint-staged and commit-trailer checks apply to the exact
three task files. Their actual commit result, immutable SHA, remote/PR equality,
new handoff generation, pending/current own CI and independent review are
recorded in the candidate packet rather than guessed here. No owner approval,
merge, deployment, or new hosted operational success is claimed.

## 2026-10-19：合併已接受的 UC03 修復後續作原 ENTRY

原 `9be172f4e79ea4981a6755bfd8f22fcdeb59c809`／generation `f44df0b871ee43bda0b89fddf1d4f5c9` 的 mandatory integration CI 因 Passenger UC03 reload 將上車選擇清空而失敗；原 7 PASS／1 FAIL／0 retry 及 blocked 歷史保留，不能以 main 成功或本段測試取代。Root 已獨立接受 Journey `607cf709dabbd115df77b491419506de8cfd61d9`，本分支由原 9be 普通 merge 該 immutable commit，沒有重跑未變的舊候選、rebase、amend 或 force。後續新候選仍須取得自己的完整 CI 與獨立 reviewer 審查。

本次保留原三檔 auth/session READ_HEAVY 修復與完整五項驗收。正式 hook 使用既有 Prettier 3.8.2，僅在 `jwt-auth.service.ts` 與既有 privileged-grant consumer test 產生預先核對的機械排版；其餘 accepted607 peer Source 原樣保留。READ_HEAVY 是既有 authenticated read route 分類，不是任意流量都不會 429 的保證；原五分鐘 block、逐次 durable session 驗證、撤銷、realm／tenant／partner 邊界與 IAP／dev-waiver 條件均未放寬。

真隔離依賴圖由 Root 將已凍結 Complaint worktree 的 26 個 ignored 本地 `node_modules` 目錄可逆 rename 借入；33 項依賴輸入逐 byte 相同，原 ENTRY 22 個目錄停放保留 inode，沒有 install、bulk copy 或外借 Root-global target。搬移後 installed helper check 為 0，實際工具解析皆在本 worktree 的 `.pnpm`。這是本機工具條件，不是 CI 或共享 runtime 驗收。

第一次當前 union 回歸有 192 assertion PASS、兩個既有 key-isolation／module-wiring suite load FAIL：原 `production-loader.ts` 將 contracts Source 宣告的外部 `zod` 一律從 API package 解析，並非依賴沒有安裝。單次 process-scoped `NODE_PATH` 的 21 PASS 僅保留作診斷。正式修復讓每個實際 Source file 用 `createRequire(file)` 解析自己的外部依賴；原 `apiRequire` export、workspace aliases、relative Source 遞迴、cache、decorator metadata 與 evaluation 流程保留，沒有 catch、假的依賴、symlink 或環境 fallback，真正 missing import 仍正常拋錯。

正常 fixed 回歸移除 `NODE_PATH`：原 key-isolation 20 案與 module-wiring 1 案共 21 PASS／0 skip；與前輪未受此 loader 影響且已通過的 192 案合為 213 個不同 assertion，原 auth/session 19 案包含其中，不重複加總診斷或歷史結果。實際 wrapper 51／51 與既有 Fleet consumer 37／37 另列。當前 API production＋原 auth/session test 的真 Source import graph noEmit／incremental false 為 0（19.58 秒）；helper 後續僅做其實際 import graph 的窄 noEmit（1.48 秒），以及 scoped lint／format check，均為 0。未啟動 VM HTTP、產品／browser／PG／Compose 或其他服務。

原五項 Source／安全條件及全部 read dependencies 持續適用。新 immutable candidate 的 full11／5 packet、原始 logs／reports 與後續 own CI 結果交獨立 reviewer；owner 不自行 approve、錄 keys、merge 或 deploy。舊共享 ee1c 的 operational 15／16、六條成功 PDF 鏈及剩餘義務仍各自保留，不能把本機回歸、已接受的 Journey CI 或尚未完成的新 own CI 寫成共享全流程成功。

## 2026-10-20：正常啟用既有開發環境 Ops 帳戶

`DEV-OPS-NORMAL-CANONICAL-ENABLEMENT-20261020` 接通既有人員管理與私人
Ops 入口，不在啟動或登入時建立、啟用帳戶。原實測的
`DEV_WORKFORCE_SESSION_EXCHANGE_DENIED` 只證明交換條件不成立，不能據此
判定資料庫缺少哪一筆 principal、membership 或有效 binding。

正常 `platform-admin/users` list／mutation ACK 的 `userId` 仍是 membership
ID；新增的唯讀 `canonicalPrincipalId` 直接來自實際 persisted principal，
HTTP wire 名稱為 `canonical_principal_id`。只能採這個實際讀回值，不能使用
membership ID、email hash 或舊 `pa-operator-001` 名稱猜測 principal ID。
公開角色 `operator` 在明確的正常 create／update 命令中對映為既有 canonical
`ops_user`；原 startup seed 的 migration-pending／角色資料不會因此被遷移
或自動啟用，未被明確操作的帳戶與其他角色也不受影響。

獨立、明確啟用的 hosted dev setup 使用既有正常 WIF／Admin durable session：

1. 讀取既有唯一的 `ops@platform.drts`／operator 人員與實際 canonical ID。
   缺少、模糊、foreign 或 suspended 狀態均停止，不建立同 email 的平行帳戶。
2. 對該實際 membership，以同一 Admin session 取得
   `platform:users:role:update` 的精確 action proof，再透過正常
   `POST /api/platform-admin/users/:userId/role` 明確送出
   `operator`／`active`／稽核 reason。保留既有 audit 與 session invalidation；
   取得 ACK 並讀回同一 membership、canonical principal、角色與 active 狀態後
   才進行設定。這項操作不屬於乘車 consumer 的 session setup。
3. 只把實際 canonical ID 設入私人 Ops server 的
   `DRTS_DEV_WORKFORCE_PRINCIPAL_ID`，保留同 Source image 與其他設定，記錄
   此次刻意產生的 Ops revision。Root 再將已確認的值保存為
   `DEV_OPS_WORKFORCE_PRINCIPAL_ID` repository variable，供後續正常部署使用；
   未確認前不填入猜測值。
4. 使用正常 Ops `/control-plane-proxy/auth/token` 換取新的 session，驗明
   canonical principal／membership／session ID、realm `ops`、actor
   `ops_user` 與實際所需 scopes，再正常 self-revoke 自己的 Ops／Admin
   sessions。安全 journal 僅保留限定 facts；失敗或未知 mutation ACK 保留原狀，
   不自動重跑或換一個帳戶。

既有 development Ops 部署已設定 `DRTS_DEV_MFA_WAIVED=true`。
本次 workflow 保留既有開發模態及其他設定，只接入私人 canonical reference；
共享環境是否生效仍須真部署及正常 session 驗證，production／staging 不會
因此啟用 waiver。
Ops server 只在原有程式的 nonstrict、explicit dev waiver、IAP disabled
且沒有真 IAP assertion 的 default 分支讀私人設定；空值或缺少簽章 key
會拒絕。
HTTP header／body／query 不能選 principal。提供的 inner JWT 仍原樣交 API
驗證，invalid token 不會換成 default。Strict／IAP 路徑忽略此引用，維持原
subject 與驗證方式；API 仍精確查 signed principal，要求 active membership
及有效 binding，以原 issuer 發真 durable session，`ensurePrincipal:false`。
`dev_mfa_waived`／`aal1` 如實表示開發環境免第二因子，並非真 IAP／MFA 證據。

本節是正常啟用契約與操作次序，不宣稱已部署、已啟用或取得 runtime PASS。
沒有 IAM／registry／role catalog 變更、startup autoactivation 或新建帳戶，
也不建立、推進、取消任何 business order。原 retained-order recovery、完整
Web 旅程及 exact-owned cleanup 各自需要原本的實際證據。
