# Platform-Admin / Ops-Console Workforce Entry via Google Cloud IAP

**Task ID**: `ENTRY-IAP-WORKFORCE-AUTH-20261005`
**Status**: Implemented (dev/test verified; staging/production require a real IAP resource — see §5)
**Owner**: Claude
**Reviewer**: Codex
**Last Updated**: 2026-10-05

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
- `aud` is either `/projects/<project_number>/global/backendServices/<id>`
  (HTTPS load balancer) or `/projects/<project_number>/apps/<project_id>`
  (App Engine / the Cloud Run direct-IAP audience format).
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
  `amr: ["verified_iap_workforce"], acr: "aal2"` onto *any* bootstrap-header
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

| Env var | Purpose | Default |
| --- | --- | --- |
| `IAP_EXPECTED_AUDIENCE` / `IAP_AUDIENCE` | Expected `aud` claim on the IAP assertion (per-deployment; see §2 for the two legal formats) | none — unset means audience is not checked |
| `IAP_EXPECTED_ISSUER` | Expected `iss` claim | `https://cloud.google.com/iap` |
| `IAP_JWT_SECRET_OR_PUBLIC_KEY` / `IAP_JWT_SECRET` | Pins a verification key instead of fetching Google's live JWKS (tests, or a deployment that wants to pin a key) | unset — real JWKS fetch |
| `CONTROL_PLANE_IAP_ENABLED` | Dev-only: declares a real IAP resource is in front of this deployment, disabling the proxy's default-identity fallback (§3.3) | unset (`false`) in dev; always effectively `true` in staging/production |
| `STRICT_IAP_MODE` | Forces strict IAP mode (assertion + verified email mandatory, bootstrap headers forbidden) in any environment | follows staging/production detection |
| `DRTS_DEV_MFA_WAIVED` | Dev-only: waives the platform/ops step-up MFA gate, auditable per-use (§3.4) | unset (`false`); rejected outright in staging/production |

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
   GCE/GKE.)
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
4. **Provision the matching workforce account in this application** *before*
   that person's first login: a platform or ops membership plus an active
   role binding for their email, via the existing platform-admin user
   management flow (`platform-admin/users`). §3.2 denies any login for an
   email with no such persisted grant, by design.
5. **Custom domain mappings**: if the Cloud Run service is reached through a
   custom domain mapping rather than its default `*.run.app` URL, confirm
   the mapping is created *after* IAP is enabled on the service — Google
   documents that IAP must be enabled before attaching a domain mapping for
   the assertion header to be injected correctly on that domain. See
   ["Mapping custom domains"](https://cloud.google.com/run/docs/mapping-custom-domains)
   together with the Cloud Run IAP guide linked in step 2.
6. **Set the application env vars** from §4 to match: `CONTROL_PLANE_IAP_ENABLED=true`,
   `IAP_EXPECTED_AUDIENCE` set to the project's Cloud Run IAP audience format,
   and leave `IAP_JWT_SECRET_OR_PUBLIC_KEY`/`IAP_JWT_SECRET` unset so
   verification uses Google's live JWKS.

## 6. Known limitation out of scope for this task

`IAPSubjectAdapter.resolveSubject`'s realm auto-selection (§3.2, point 6)
only reads the proxy-forwarded `x-realm` / `x-actor-type` hint in non-strict
mode; in `strictIapMode` it always falls back to the platform-preferred
default regardless of which proxy (platform-admin-web vs. ops-console-web)
forwarded the request. For a principal who holds *both* an active platform
and an active ops grant, this means a staging/production ops-console login
resolves to the platform realm rather than ops. This pre-dates this task and
is not one of its acceptance criteria; it is noted here for whoever picks up
realm-selection plumbing next.
