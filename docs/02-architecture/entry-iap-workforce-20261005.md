# Platform-Admin / Ops-Console Workforce Entry via Google Cloud IAP

**Task ID**: `ENTRY-IAP-WORKFORCE-AUTH-20261005`
**Status**: Implemented (dev/test verified; staging/production require a real IAP resource — see §5)
**Owner**: Claude
**Reviewer**: Codex
**Last Updated**: 2026-10-06

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
