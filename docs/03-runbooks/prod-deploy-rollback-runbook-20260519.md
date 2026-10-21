# Production Deploy And Rollback Runbook

Updated: 2026-10-12 — SR-PROD-FULL-SURFACE-RAIL-20261012.
Owner: release engineering. Executable authority: `.github/workflows/deploy-prod.yml`
and `operations/verification/production-release-rail/`. The earlier rail-spec and
rollback-drill documents retain historical evidence; use this graph and the actual
workflow for current deployment configuration.

Production deployment remains operator-only, through GitHub WIF, with required
`production` environment review on every job and serialized, non-cancellable
runs. Do not host product services, previews, browser tests, or Compose on the
worker VM. This source repair does not perform a production deployment.

## Active topology

| Image / app                | `PROD_GCP_*_SERVICE` suffix | Port | Protected read probe                    |
| -------------------------- | --------------------------- | ---- | --------------------------------------- |
| api                        | API                         | 3001 | `/api/identity/context`                 |
| platform-admin-web         | PLATFORM_ADMIN              | 3002 | `/control-plane-proxy/identity/context` |
| ops-console-web            | OPS_CONSOLE                 | 3003 | `/control-plane-proxy/identity/context` |
| fleet-partner-portal-web   | FLEET_PARTNER_PORTAL        | 3007 | `/control-plane-proxy/identity/context` |
| tenant-console-web         | TENANT_CONSOLE              | 3004 | `/control-plane-proxy/identity/context` |
| bank-console-web           | BANK_CONSOLE                | 3008 | `/api/statements/<YYYY-MM>/export`      |
| referral-embed-web         | REFERRAL_EMBED              | 3014 | `/api/referral/active`                  |
| enterprise-dispatch-web    | ENTERPRISE_DISPATCH         | 3010 | `/control-plane-proxy/tenant/bookings`  |
| channel-partner-portal-web | CHANNEL_PARTNER_PORTAL      | 3013 | `/control-plane-proxy/identity/context` |
| passenger-app-web          | PASSENGER_APP               | 3009 | `/api/passenger-app/me`                 |

Partner Booking remains **PAUSED**. Retired `passenger-web`, concierge and
assisted-entry services remain excluded. This workflow does not delete services.
The eleventh image is `migrate`, built from `Dockerfile.migrate`; it is a job,
not another active service.

All services have `internal-and-cloud-load-balancing` ingress and
`--no-allow-unauthenticated` on the **backend**. API and the seven consoles use
authenticated IAP frontends. Referral Embed and Passenger App require explicit,
approved **public entry through their own LB/IAP policy**, described below;
they must not require an employee Google account. API and console/BFF upstreams
use the protected API origin and its IAP OAuth client ID as the workload token
audience. Passenger App has its own first-party BFF, with no inherited tenant
identity, console proxy URL, JWT secret or OAuth client secret.

## Required GitHub configuration

Read live repository and `production` environment configuration before a run;
do not infer a project, service, audience, or institution identifier from an old
runbook. Use sanitized canonical production fixtures, not real financial
institution identifiers or public demonstration defaults.

Required variables:

- `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`,
  `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `PROD_GCP_MIGRATION_JOB`.
- All ten `PROD_GCP_<suffix>_SERVICE` names from the table. No service-name
  fallback is provided. Names and origins must be distinct.
- `PROD_CONTROL_PLANE_API_ORIGIN`, `PROD_IAP_CLIENT_ID` (API OAuth transport
  audience), `PROD_IAP_EXPECTED_AUDIENCE` (API IAP assertion **resource** audience).
  The last two are different contracts; do not substitute one for the other.
- Nine `PROD_<suffix>_ORIGIN` and seven `PROD_<suffix>_IAP_CLIENT_ID` values for
  the private console services. Referral Embed and Passenger App need no
  frontend employee IAP client ID; their BFF still uses the private API audience.
- `PROD_BANK_IAP_AUDIENCE`, the bank IAP assertion resource audience, distinct
  from `PROD_BANK_CONSOLE_IAP_CLIENT_ID`.
- `PROD_AUTH_MODE=production`, `PROD_JWT_ISSUER`, `PROD_JWT_AUDIENCE`,
  `PROD_JWT_ALGORITHMS=HS256`. This rail supports the current shared
  `JWT_SECRET` web-authority contract. Other JWT signing families require a
  reviewed change across the affected callers; they fail preflight here.
- `PROD_OIDC_ISSUER`, `PROD_OIDC_CLIENT_ID`, `PROD_OIDC_AUTHORIZATION_ENDPOINT`,
  `PROD_OIDC_TOKEN_ENDPOINT`. Issuer/endpoints must be real HTTPS provider URLs.
  A confidential Google code exchange also requires
  `PROD_OIDC_CLIENT_SECRET_SECRET` naming its managed secret.
- `PROD_WORKLOAD_IDENTITY_ISSUER`, `PROD_WORKLOAD_IDENTITY_AUDIENCE`,
  `PROD_WORKLOAD_IDENTITY_JWT_ALGORITHMS`. The signing key and registry must
  match these settings; no internal-key fallback is mounted.
- `PROD_AUTH_ALLOWED_ORIGINS`: semicolon/comma-separated HTTPS origins including
  all nine active web origins. Wildcards and local origins are rejected.
- `PROD_DRTS_FLEET_PARTNER_ID` for the single-tenant fleet SSR scope;
  `PROD_DRTS_PARTNER_ID`, `PROD_DRTS_TENANT_ID`, `PROD_DRTS_PARTNER_PROGRAM_ID`,
  `PROD_DRTS_PARTNER_ENTRY_SLUG` for Channel Partner; and
  `PROD_DRTS_ENTERPRISE_DISPATCH_TENANT_ID`,
  `PROD_DRTS_ENTERPRISE_DISPATCH_ACTOR_ID` for Enterprise Dispatch. Use verified
  canonical ownership, never the development seed values as a production guess.
- `PROD_REFERRAL_EMBED_ALLOWED_HOSTS`: space-separated exact embed hostnames.
- `PROD_MAP_PROVIDER_BACKEND`: explicit `mock` or `google`. Mock requires an
  HTTPS `PROD_MAP_TILE_URL_TEMPLATE` containing `{z}`, `{x}`, `{y}`. Google
  requires `PROD_MAP_PROVIDER_ALLOWED_ORIGINS`, a positive
  `PROD_MAP_PROVIDER_MONTHLY_BUDGET_USD`, and semicolon-separated
  `PROD_MAP_PROVIDER_BUDGET_ALERT_PCT` percentages. Existing configuration and
  live Google map gates run before building any image.
- `PROD_RELEASE_SMOKE_CONFIG_JSON`: all ten authenticated read probes described
  below. Missing/partial fixtures fail preflight.
- `PROD_PUBLIC_ENTRY_CONFIG_JSON`: the two public entry policies below.

Repository/environment secrets: `PROD_WIF_PROVIDER`,
`PROD_WIF_SERVICE_ACCOUNT`. Runtime and deployer identities must differ.

Registry configuration can use `PROD_ARTIFACT_REGISTRY`, or
`PROD_ARTIFACT_REGION`, `PROD_ARTIFACT_PROJECT_ID`, `PROD_ARTIFACT_REPOSITORY`.
The derived defaults are the target region/project and repository `drts`.
`PROD_SECRET_PREFIX` defaults to `drts-prod`. These infrastructure naming
defaults do not supply missing identity/provider/product settings.

Exposure flags `PROD_<suffix>_ALLOW_UNAUTHENTICATED` default to `false` and must
remain exactly `false` for Cloud Run backends. This does not make customer
entry staff-only: its separate LB/IAP policy must permit anonymous access.
The older umbrella `PROD_PRODUCT_WEB_ALLOW_UNAUTHENTICATED` must also be absent
or `false`. Insecure auth, MFA waiver, mock OIDC, CI tenant-actor,
Bank demo-login and Referral demo switches are rejected if enabled.

## Public customer entry: F-PUBLIC-ENTRY release gate

The actual application boundaries differ from workforce IAP: Passenger
`/login` discovers `/api/passenger-app/auth/providers`, then uses OTP or
Facebook/LINE/Google transactions through its first-party BFF. Its `/me`
requires a passenger session. Referral `/embed/<entrySlug>` resolves a
canonical partner entry and offers standalone fallback without a handoff;
`/api/referral/active` requires an active, signed referral session. Neither
frontend uses an IAP employee subject as the passenger identity.

The rail provides an explicit `iap-public-entry` adapter for **approved existing**
global LB policies, one regional serverless NEG and separate backend service per
public surface. It does not provision or approve a new exposure policy. Supply
`PROD_PUBLIC_ENTRY_CONFIG_JSON` with exactly `referral-embed-web` and
`passenger-app-web` keys. Both entries require `mode: "iap-public-entry"`,
`backendService` (actual global backend service name), and `approvalRef`
(repository issue/PR URL containing the operator's approved exposure decision
and IAM/OAuth review evidence). Passenger also requires `expectedProviders`, a
nonempty array of the approved, enabled `phone`, `email`, `facebook`, `line`,
`google` methods. Referral requires canonical `entrySlug` and `entryHost`;
the host must appear in `PROD_REFERRAL_EMBED_ALLOWED_HOSTS`.

The authorization reference is not proof of cloud state. Before image build,
preflight reads project number, enabled backend IAP, the exact regional NEG
target, resource-specific IAP policy, Run invoker policy and ingress. It requires
an unconditional `allUsers` grant of `roles/iap.httpsResourceAccessor` on **each
public LB backend**, with the IAP service agent allowed to invoke its private
Run service. Run public IAM members, disabled invoker IAM, tagged/wildcard/wrong
NEG targets, missing evidence, read denial, and staff-only or
`allAuthenticatedUsers` grants block deployment. The approved policy must not
cover API or private consoles; other LB designs require a reviewed adapter.
Existing public services/LB policies must be provisioned through the operator
workflow before this gate can succeed for a first rollout.

Google documents that [ingress does not waive IAM](https://cloud.google.com/run/docs/securing/ingress)
and that [IAP public requests have no subject/email and public grants cannot be conditional](https://cloud.google.com/iap/docs/managing-access).
Application passenger/referral sessions remain the authority for personal data;
the public IAP grant is transport access only. No broad API/console opening or
authentication bypass is performed by this rail.

Expected social providers require their complete, separate passenger credential
bundles and exact `PROD_OAUTH_REDIRECT_ALLOWLIST` callbacks at
`<PROD_PASSENGER_APP_ORIGIN>/auth/callback/<provider>` before build. The workforce
OIDC client is not a substitute. Email OTP requires its managed pepper and SMTP
configuration plus `PROD_NOTIFICATION_OUTBOX_TYPE=postgres` for the actual durable
delivery factory. Required phone login is blocked before build while the current
`PassengerAppModule` binds `SMS_PORT` to `UnconfiguredSmsPort`; credentials/pepper
alone cannot enable it. This records a missing production SMS adapter, preserving
the phone-login requirement rather than pretending it is ready.
Actual provider availability is checked by anonymous discovery;
this is not proof of provider login, SMS/email delivery or consent/legal readiness.

Verification re-reads external policies and records their hashes, then makes
credential-free GETs to the canonical Referral entry, Passenger login and provider
discovery. It rejects employee login redirects and generic HTML/HTTP success.
Anonymous and invalid-session `/me` must return the application's 401 passenger
denial; Referral active-trip must return its 400 missing-session contract. Neither
may return personal data. Signed customer read fixtures then run separately,
without employee IAP transport tokens on these two surfaces. Private console/API
probes retain signed IAP transport. The single source-SHA artifact includes both
public-entry and protected-contract results without response bodies or tokens.

**Concrete deployment blocker (2026-10-12):** approved production public-entry
IAM/OAuth evidence and `PROD_PUBLIC_ENTRY_CONFIG_JSON` are not supplied to this
worker; no actual cloud policy or public customer request has been verified.
Keep the public product scope and this fail-closed gate. Operator-only success
cannot clear F-PUBLIC-ENTRY. Required live environment review and all previously
listed production settings/fixtures remain outstanding.

## Secret Manager and IAM

### Durable document/proof providers: F-ARTIFACT-PROVIDERS

These inputs are mandatory, including on rollback. The rail calls the actual
`createDocumentArtifactStore`, `createRemittanceProofStorage` and
`createRemittanceProofScanner` factories before publishing a plan or starting
any build/migration/deploy. It requires configured durable adapters and a
supported scanner; `unprovisioned`, memory and test scanners cannot pass.
`--set-env-vars` carries every selected setting below; unknown, raw-credential
and stale settings for a different provider are rejected rather than discarded.

- `PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER` and
  `PROD_REMITTANCE_PROOF_STORAGE_PROVIDER`: each explicitly `gcs` or `s3`.
  Configure them independently; there is no implied provider/bucket default.
- For `gcs`, supply respectively `PROD_DOCUMENT_ARTIFACT_GCS_BUCKET` and
  `PROD_REMITTANCE_PROOF_GCS_BUCKET`, naming approved private durable buckets.
  The actual native client validates its supported bucket-name contract.
- For `s3`, use each prefix `PROD_DOCUMENT_ARTIFACT_S3_` and/or
  `PROD_REMITTANCE_PROOF_S3_`: required `BUCKET`, `REGION` and explicit
  `FORCE_PATH_STYLE=true|false`; optional `ENDPOINT` must be HTTPS without
  embedded credentials, query or fragment. Required `ACCESS_KEY_ID_SECRET`
  and `SECRET_ACCESS_KEY_SECRET` name a complete managed credential pair;
  optional `SESSION_TOKEN_SECRET` names its managed session token. The GCP
  runtime has no approved ambient AWS credential configuration in this rail.
  All three secret inputs mount their actual runtime names with enabled numeric
  Secret Manager versions; values stay in preflight memory, outside artifacts.
- `PROD_REMITTANCE_PROOF_SCANNER_PROVIDER`: explicitly `cloud-run-clamd` or
  `clamd`. Cloud Run requires `PROD_REMITTANCE_PROOF_SCANNER_URL`, an exact HTTPS
  `.run.app` origin, and explicit `PROD_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS`
  (integer 100–60000). The actual adapter validates the origin/deadline and
  obtains audience-bound metadata identity tokens when scanning.
- Native clamd requires explicit `PROD_REMITTANCE_PROOF_CLAMD_HOST`,
  `PROD_REMITTANCE_PROOF_CLAMD_PORT` (integer 1–65535),
  `PROD_REMITTANCE_PROOF_CLAMD_TIMEOUT_MS` (integer 100–60000), and
  `PROD_REMITTANCE_PROOF_CLAMD_TLS=true|false`. The operator must verify private
  network isolation and certificate trust; disabling TLS is an explicit
  private-network decision, matching the existing factory contract.

**Outstanding production evidence:** no approved production bucket/scanner
settings, private bucket access/versioning/retention evidence, runtime object
permissions, scanner deployment/image provenance, scanner invoker IAM or native
connectivity/certificate evidence have been supplied or verified by this worker.
Construction/`availability()` means configuration is complete; it does not prove
that live object reads or genuine malware scans work. The operator must supply
these settings and collect real private storage and genuine clean/infected scan
receipts through the authorized hosted acceptance route before claiming readiness.

Preserve the full original C125 live gates: **supply documents AND case/reply
attachments and their composite manifests**, real binary upload, hash-correlated
clean scan, durable cross-instance/restart readback, and actual legal-role access.
Both lawful fleet-partner and platform-reviewer read paths plus cross-partner,
cross-case/reply, wrong-realm, forged-header and public-download denial evidence
remain required. Provider configuration, release smoke, or the supply path alone
cannot close C125, document/proof or whole-system acceptance. The existing
[C125 delivery evidence](../../tests/unit/C125-REAL-UPLOAD-STORAGE-20261005.md)
retains its independent live/hosted limits; this rail does not reduce those gates.

Before build, preflight resolves enabled numeric versions, reads values only
into runner memory, and executes the **production** auth startup, passenger
payment/capture/recovery/OTP/SMTP validators and document/proof/scanner factories.
Error output includes configuration
names only. Plans contain secret names/versions, never values. It does not mint
credentials or create secrets. No deployment uses `:latest`.

Required suffixes under `${PROD_SECRET_PREFIX}-`:

- API: `db-url`, `api-key-salt`, `jwt-secret`, `cookie-secret`, `csrf-secret`,
  `controlled-download-signing-secret`, `passenger-subject-pepper`,
  `passenger-ride-token-pepper`, `workload-identity-jwt-public-key`,
  `workload-identity-service-principals`,
  `workload-identity-google-service-principals`.
- Tenant and Enterprise BFF: `bff-state-secret` (plus shared `jwt-secret`).
- Bank: `bank-session-secret`, `bank-iap-jwt-public-key` (Google IAP ES256
  public key), `bank-artifact-signing-private-key`,
  `bank-artifact-signing-public-key`, `bank-artifact-signing-key-id`.
  Preflight executes the actual Bank signer and verifies the matching RSA
  signature. Provision/rotate the IAP verification key through the existing
  operator process; invalid key material fails closed.
- Referral: `referral-embed-session-secret` (plus shared `jwt-secret`).
- Release verification: `release-smoke-headers`, described below.
- Google map mode: `google-maps-geocoding-api-key`, `google-maps-routes-api-key`,
  `google-maps-browser-key` (only Ops mounts the browser key).

Database URL must configure durable PostgreSQL. The API explicitly sets durable
session/audit stores backed by that database. The Google principal registry must
bind the exact runtime service-account email to the protected API workload
audience and the actual proxy routes. It remains separate from the custom
workload JWT registry. Preflight checks route scopes using the production
`matchesScope` function, including its `GET /path` syntax. Registry contents,
roles and tenant memberships are never rewritten by the deployment rail.

Optional API settings use `PROD_<runtime-env-name>` for non-secrets and
`PROD_<runtime-env-name>_SECRET` for Secret Manager names, from the explicit lists
in `rail.cjs` (`OPTIONAL_API_FIELDS`, `OPTIONAL_SECRET_FIELDS`). They cover
non-Google tenant verification, passenger OAuth/OTP, SMTP and PSP configuration.
Provider credential groups must be complete or wholly absent. The real startup
factories validate any selected configuration; absent PSP/mail/OTP integrations
remain unavailable. No provider or financial capture policy is invented. Fake
PSP is forbidden in production and enabling capture with an unavailable real
adapter fails preflight. This rail does not claim provider acceptance.

Deployer needs Artifact Registry push, Cloud Run service/job administration,
`iam.serviceAccounts.actAs` on the **separate runtime identity**, Secret Manager
version access for private preflight/smoke validation, ID-token impersonation,
and the existing invoker/IAP policy permissions. Runtime needs Cloud SQL client,
secret access, API invoker/IAP access and its documented application roles.
Missing IAM tests or binding commands fail the run; there is no warning-only
IAM bypass. Authenticated frontends must allow the deployer's signed smoke
transport identity. All such IAM provisioning uses the authorized cloud route.

## Protected smoke fixtures

`PROD_RELEASE_SMOKE_CONFIG_JSON` is an object keyed by the ten image IDs, each
with `path` from the topology table and `expect`, a dictionary of dotted JSON
paths to exact scalar values. For the six identity-context probes (API plus
five console proxy services), require `data.principalId` equal to the approved
fixture's real principal and `data.authMode=jwt_bearer`. The route is open at
the application layer; these predicates ensure anonymous/default context does
not pass as authenticated smoke. Add realm/tenant predicates appropriate to
that fixture. For example, use the actual realm and principal returned by the
existing session contract, not a forged identity header.

Enterprise uses an authorized tenant session and a fixture booking predicate;
Passenger uses its first-party passenger cookie and account predicate; Referral
uses its signed consent/handoff session and approved active-trip predicate.
The Bank read export is CSV: supply a real approved fixture statement with at
least one trip, path `/api/statements/<YYYY-MM>/export`, and exactly
`expect: {"Period":"<YYYY-MM>","StatementNo":"<fixture statement>"}`.
CSV contents and response bodies are not written into release artifacts.

Managed `release-smoke-headers` is an object keyed by the same service IDs. Each
entry contains the required existing signed session credential in `cookie`,
`x-drts-authorization`, or `x-drts-google-id-token`. Secret Manager holds these
private fixtures; never put their values in repo variables, commits, artifacts
or logs. No actor, role, tenant, internal-key or spoofed proxy headers are allowed.
Public entry fixtures must use only the actual customer session `cookie`.
The workflow separately mints a real Google transport token for each private
console/API audience. Prepare renewable, scoped fixture credentials before approving
the release; their validity is proven by the protected smoke, not by merely
finding a secret name.

HTTP 200, a healthy process, or a login page is insufficient. Every smoke must
return its exact JSON/CSV contract with redirects disabled. All ten services
must also have `Ready=True`, matching latest-created/latest-ready revisions,
100% traffic on that revision, the expected runtime identity, exact built image
digest, and the source SHA in revision configuration.

## Deploy and rollback

1. Verify live target variables, fixture ownership and credential validity,
   database migration compatibility, rollout sign-off and rollback owner.
2. Select a protected `prod/v<YYYY.MM.DD>.<N>` tag produced by hourly-promote
   containing the reviewed rail. The tag is resolved **once** to a full commit
   SHA. Every subsequent helper/build checkout uses that SHA.
3. Dispatch `gh workflow run deploy-prod.yml -f tag=<approved prod/v tag>` and
   obtain the required GitHub `production` environment review.
4. Graph: `resolve-tag -> validate-config -> build-push (ten apps + migrate)
-> migrate once -> deploy all ten -> health-check all ten`. Any validation,
   build or migration failure prevents deployment. `skip_migration=true` is an
   explicit operator exception for an already-applied migration or approved
   application rollback; a failed migration cannot be mistaken for a skip.
5. Retain `production-release-evidence-<full SHA>` with the frozen plan,
   eleven image digest records, per-service exact revision and protected smoke
   result, source tag/SHA, target, workflow run/attempt and migration disposition.

For rollback, confirm the previous known-good rail tag and schema compatibility
**before** dispatching it with `-f skip_migration=true`. The same complete graph
and identity/secret preflight apply. Do not down-migrate, delete volumes, reset
history, or force-push. Escalate incompatible forward migrations to the database
owner. Partial deployment or any verification failure is an incident, not a
successful rollout; record the failed/restored tag pair, run URLs, owner,
approvals and per-service outcomes in the existing rollout evidence pack.

A tag predating this helper cannot use this updated graph: it fails closed rather
than mixing release code with mutable default-branch helpers. Keep a reviewed,
compatible rollback release containing this rail before the first live rollout.

Review/CI/protected merge of this repair and live production deployment are
separate gates. Deployment smoke does not establish physical-device, real PSP,
legal/manual, restoration or complete end-to-end acceptance. Those remain with
the existing rollout gates and owners in `docs/03-runbooks/phase1-rollout.md`.
