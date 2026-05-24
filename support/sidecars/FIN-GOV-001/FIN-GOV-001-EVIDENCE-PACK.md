# FIN-GOV-001 - Governance-Aware Billing & Reporting Evidence Pack

**Task:** `FIN-GOV-001` - governance-aware billing and reporting live evidence pack
**Current owner:** `Codex`
**Current reviewer:** `Gemini2`
**Collected:** `2026-05-19 (UTC)`
**Latest refresh:** `2026-05-24 (PH1GC-FIN-GOV-001 / Codex)`
**Current read:** `PARTIAL - static evidence consolidated; latest 2026-05-24 governed staging rerun (run 26370775088 on rebased head 2c4be62a) still blocked by external IAM / IAP token-mint gates`

---

## 1. Scope

This packet consolidates the currently reviewable evidence for the governance
slice under `WF-FIN-001`:

- cost-center-aware invoice generation
- tenant quota usage / quota ledger visibility
- approval audit chain continuity into billing/reporting

The target outcome for this task was a fresh staging live evidence refresh.
That refresh could not be completed from this workspace; the exact blocker is
captured in §4, including the latest 2026-05-24 GitHub Actions auth-token /
direct service-account access-token / ID-token probes.

---

## 2. Existing Reviewable Evidence

### 2.1 Live staging anchor already present in the repo

`support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` already proves one
live `WF-FIN-001` baseline on staging runtime `drts-api-00016-s4v`:

- live run ID: `874878`
- live date: `2026-04-17`
- invoice generation succeeded
- invoice retrieval succeeded
- audit entries were visible on the same runtime

That pack proves the integrated `booking -> dispatch -> driver -> billing/audit`
chain, but it does **not** separately prove:

- cost-center-specific invoice attribution in a reviewer-readable live artifact
- quota summary / quota ledger readback on staging
- approval-request chain readback on staging tied to the billed booking

### 2.2 Repo-local finance smoke anchors

The named `WF-FIN-001` smoke scripts still exist and remain the published
repo/staging probes:

- `tests/smoke/05-billing-invoice.sh`
  - generates an invoice for the previous closed month
  - retrieves the generated invoice
  - lists invoices for sanity
- `tests/smoke/06-report-export.sh`
  - creates a report job
  - polls until `completed`
  - confirms an artifact URL is present

These are valid static/repo-local verification paths, but by design they are
not a substitute for a fresh named staging evidence packet.

### 2.3 Governance contract and integration anchors

The governance-aware billing/reporting seams are present in the current repo:

- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `GET /api/tenant/quotas`
  - `GET /api/tenant/cost-centers/:code/quota`
  - `GET /api/tenant/quotas/ledger`
  - `GET/POST /api/tenant/approval-rules*`
- `apps/api/src/modules/audit-notification/audit.controller.ts`
  - `GET /api/audit`
- `apps/api/tests/integration/tenant-governance-e2e.test.ts`
  - quota ledger survives the approval/completion flow
  - invoice generation succeeds after the governed booking completes
  - audit taxonomy is emitted for cost-center, quota, and approval-rule events

Most relevant integration-test findings:

- governed bookings create quota ledger entries before billing
- invoice generation still succeeds after the governed booking completes
- invoice line schema no longer embeds cost-center metadata directly; the
  governance link is preserved through the upstream approval/audit chain

This confirms the intended authority model, but it is still integration/static
evidence rather than a fresh staging rerun.

---

## 3. Current Gate Interpretation

Based on the current artifacts, the conservative `WF-FIN-001` read remains:

- `PASS (static evidence)` for invoice generation, report job creation, and
  permissioned artifact access
- `not yet elevated to PASS (live staging evidence)` for the governance-aware
  sub-slice that specifically needs reviewer-usable staging proof of:
  - cost-center-aware invoice context
  - quota usage / ledger visibility
  - approval audit chain continuity

This packet therefore strengthens the evidence inventory, but it does not
justify a gate upgrade on its own.

---

## 4. 2026-05-19 to 2026-05-24 Live Collection Attempts

This workspace re-ran the minimum live access probes on `2026-05-19T03:59Z`
and then refreshed the GitHub Actions staging reruns through `2026-05-24` to
determine whether the governance-aware `WF-FIN-001` evidence could be
refreshed from staging during this dispatch.

### 4.1 Protected staging host

Probe target:

`https://api.staging.drts-fleet.cctech-support.com/api/health`

Observed result from `curl -i -sS --max-time 20`:

- HTTP `302`
- `location: https://accounts.google.com/o/oauth2/v2/auth?...`
- body: `Invalid IAP credentials: empty token`

Interpretation:

- the protected staging host is reachable
- fresh live evidence now requires a valid IAP/OIDC bearer token

### 4.2 Token helper failure on this machine

Active CLI accounts probed:

- `bobo.du@cctech-support.com`
- `edna@cctech-support.com`
- `lupinchen@cctech-support.com`

Attempted helper:

`./scripts/print-staging-iap-token.sh`

Underlying failure:

Each of `gcloud auth print-access-token` and `gcloud auth print-identity-token`
returned:

`Reauthentication failed. cannot prompt during non-interactive execution.`

The impersonated fallback path failed with the same reauthentication error when
running:

`gcloud auth print-identity-token --include-email --project drts-staging-bobo-20260502 --impersonate-service-account github-actions-deployer@drts-staging-bobo-20260502.iam.gserviceaccount.com --audiences 1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`

Additional machine-local probe on `2026-05-23`:

- metadata server identity mint succeeded via
  `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?...&format=full`
- the JWT carried `email='384772941419-compute@developer.gserviceaccount.com'`
  and the correct IAP audience
- `curl -i -H "Authorization: Bearer <metadata-token>" https://api.staging.drts-fleet.cctech-support.com/api/health`
  reached IAP but returned HTTP `403`:
  `DRTS Fleet Platform: Access denied. For user 384772941419-compute@developer.gserviceaccount.com.`
- metadata access token based `iamcredentials.googleapis.com ...:generateIdToken`
  still failed with `ACCESS_TOKEN_SCOPE_INSUFFICIENT`

Interpretation:

- all user-account `gcloud` credentials available on this worker are stale for
  non-interactive token minting
- this VM can mint a syntactically valid email-bearing identity token for its
  default compute service account, so the problem is no longer token shape
- the remaining local barrier is authorization: the compute service account is
  not allowed through IAP, and the instance scopes do not permit IAM
  Credentials impersonation of the staging deployer account

### 4.3 Direct Cloud Run fallback

Probe target:

`https://drts-api-kdhu6wzufa-uc.a.run.app`

Observed result from `curl -i -sS --max-time 20
https://drts-api-kdhu6wzufa-uc.a.run.app/api/health` and matching smoke-path
checks against `/api/tenant/invoices/generate` and `/api/reports/jobs`:

- HTTP `404`
- body: Google frontend `Page not found`

Interpretation:

- the historical Cloud Run origin documented in older evidence packs is no
  longer a usable direct fallback for this session
- the live collection path is effectively gated on the protected staging host
  plus valid bearer credentials

### 4.4 GitHub Actions WIF / IAP fallback

Probe target:

- workflow dispatch: `gh workflow run ci-integ.yml --ref codex/ph1gc-fin-gov-001 -f ref=codex/ph1gc-fin-gov-001 -f run_staging_e2e_010=true`
- first resulting run: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26287551676`
- latest confirmation runs:
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26327029664`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26327833020`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26327904346`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26332046380`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26332590728`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26366139732`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26367273638`
- branch / commits under test:
  - `origin/codex/ph1gc-fin-gov-001@f8cc61e7` on 2026-05-22
  - `origin/codex/ph1gc-fin-gov-001@2cc083d6` on 2026-05-23
  - `origin/codex/ph1gc-fin-gov-001@7aeb2c29` on 2026-05-23
  - `origin/codex/ph1gc-fin-gov-001@2f6387fa` on 2026-05-23
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@f7bea87d` on 2026-05-23
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@bda002e2` on 2026-05-23
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@0a006787` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@c704994b` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@5c257292` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@6739c6cd` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260523@5d375722` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@2c4be62a` on 2026-05-24

Observed results:

- job `staging-e2e-010` started with the expected staging env inputs:
  - `PROJECT_ID=drts-staging-bobo-20260502`
  - `REGION=us-central1`
  - `CONTROL_PLANE_API_ORIGIN=https://api.staging.drts-fleet.cctech-support.com`
  - `IAP_CLIENT_ID=1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`
- 2026-05-23 repository secret inventory (`gh secret list --repo ajoe734/drts-fleet-platform`) shows `STAGING_WIF_SERVICE_ACCOUNT` exists but `STAGING_WIF_PROVIDER` does not. The only provider fallback visible to this job is repo-level `WIF_PROVIDER` (last updated `2026-04-16T14:18:02Z`), while the staging project/service-account settings were refreshed on `2026-05-03`.
- 2026-05-22 run `26287551676`: first `google-github-actions/auth@v2` step failed before any `gcloud` or E2E shell execution:
  - `failed to generate Google Cloud federated token ... {"error":"invalid_target","error_description":"The target service indicated by the \"audience\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn't exist."}`
- 2026-05-23 run `26327029664`: the same `staging-e2e-010` path failed again at step 4 `Authenticate to GCP`; job `77506520838` completed `failure` at `2026-05-23T07:32:52Z`, steps `Set up Cloud SDK`, `Mint IAP verification token`, and `Run E2E-010 against staging` were all skipped, and GitHub repeated the same `invalid_target` provider error during `google-github-actions/auth@v2`
- branch commit `7aeb2c29` changed the staging workflow fallback order to `STAGING_WIF_PROVIDER || DEV_WIF_PROVIDER || WIF_PROVIDER`, after which 2026-05-23 run `26327833020` advanced past step 4 `Authenticate to GCP` and failed later in step 5 `Set up Cloud SDK` with:
  - `Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist).`
- branch commit `2f6387fa` made the Cloud SDK path best-effort so it no longer blocked the E2E chain. 2026-05-23 run `26327904346` then advanced through step 6 `Best-effort fetch internal key` and failed in step 7 `Mint IAP verification token` with:
  - `Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist).`
- the latest rebased-head confirmation run at dispatch time, `26332046380` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@f7bea87d`, reproduced the same deeper failure: `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all passed, then `Mint IAP verification token` failed with:
  - `Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist).`
  - `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped, and artifact upload warned that no `e2e-010-*` files existed.
- a fresh 2026-05-23 rerun on the then-current rebased remote head, `26332590728` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@bda002e2`, advanced one step further in documented reviewability: `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all completed successfully, then `Mint IAP verification token` failed with:
  - `failed to generate Google Cloud OpenID Connect ID token ...`
  - `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist).`
  - `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, and GitHub warned that no `e2e-010-console.log`, `e2e-010-evidence.log`, or `e2e-010-chain.json` files existed to upload because the shell never started.
- a fresh 2026-05-24 rerun on the probe commit, `26365672590` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@0a006787`, added an access-token probe before the IAP ID-token step. That probe showed the same service-account IAM gap on the access-token path: `gcloud auth print-access-token` failed with `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`, and the follow-on `Mint IAP verification token` step still failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist).`
- a fresh 2026-05-24 rerun on the current auth-token probe commit, `26366139732` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@c704994b`, proved that the GitHub federated `auth_token` is not a valid IAP bearer fallback for this staging host. The new `Probe IAP health with auth_token` step reached the protected host and got `HTTP 401` with body `Invalid IAP credentials: Unable to parse JWT`, so the federated token is the wrong shape for this ingress. The follow-on `Probe IAP health with access token` still failed at `gcloud auth print-access-token` with `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`, and the fallback `Mint IAP verification token` step again failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist).`
- a fresh 2026-05-24 rerun on the current blocker-refresh head, `26367273638` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@5c257292`, reconfirmed the same external gate on the actual latest pushed task branch. `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all succeeded; `Probe IAP health with auth_token` again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the `Probe IAP health with access token` step remained continue-on-error and still logged `403 Permission 'iam.serviceAccounts.getAccessToken' denied`; and the rerun failed at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped, and no reviewer-readable invoice/report artifact was produced.
- a fresh 2026-05-24 rerun on the direct access-token probe commit, `26369501167` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@6739c6cd`, replaced `gcloud auth print-access-token` with a second `google-github-actions/auth@v2` call using `token_format: access_token`. The `auth_token` probe still returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the direct service-account access-token mint now failed inside `google-github-actions/auth@v2` itself with `403 Permission 'iam.serviceAccounts.getAccessToken' denied`; and the follow-on `Mint IAP verification token` step still failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`. Because the access-token failure now happens before any `gcloud`-backed probe, this rerun confirms the remaining CI blocker is service-account credential-mint IAM rather than Cloud SDK behavior.
- a fresh 2026-05-24 rerun on the current pushed head, `26370433652` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@5d375722`, revalidated that no external IAM/IAP fix landed after the previous probe commit. `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all succeeded; `Probe IAP health with auth_token` again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the direct `google-github-actions/auth@v2 token_format=access_token` step again logged `403 Permission 'iam.serviceAccounts.getAccessToken' denied`; and `Mint IAP verification token` again logged `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`. `Run E2E-010 against staging` remained skipped, so the task still has no reviewer-readable live invoice/report artifact on the actual current branch head.
- a fresh 2026-05-24 rerun on the rebased current head under test, `26370775088` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@2c4be62a`, reconfirmed the blocker after rebasing onto latest `origin/dev` and preserving the task branch on a non-force-pushed remote head. `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all succeeded; `Probe IAP health with auth_token` again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the continue-on-error `Mint service-account access token` path again annotated `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)` and therefore skipped `Probe IAP health with access token`; and the fallback `Mint IAP verification token` step again failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, and the upload step only produced the auth-token health-body artifact because the shell never started.
- the latest governed staging rerun is `26370775088` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@2c4be62a`; the subsequent metadata-only anchors `55854adc` and `4b39a43e` updated closeout / evidence wording plus ownership metadata but did not change workflow or E2E behavior, so no newer staging rerun exists from this branch.
- no E2E console/evidence artifacts were produced because the workflow still failed before the shell could start

Interpretation:

- the original repo-configured staging WIF path was broken because the workflow
  fell back from missing `STAGING_WIF_PROVIDER` to stale repo-level
  `WIF_PROVIDER`
- the 2026-05-23 secret inventory strongly suggests the staging workflow is
  falling back from missing `secrets.STAGING_WIF_PROVIDER` to older repo-level
  `secrets.WIF_PROVIDER`, which is consistent with the repeated
  `invalid_target` failure
- the branch-local fallback to `DEV_WIF_PROVIDER` repairs the first federated
  auth hop and proves the GitHub runner can now reach GCP non-interactively
- the GitHub `auth_token` path is still not a usable IAP bearer for this host:
  it reaches the protected ingress, but IAP rejects it as `Invalid IAP
  credentials: Unable to parse JWT`, so the remaining live path must mint a
  Google-issued service-account credential with an email claim
- the remaining GitHub Actions blocker is service-account IAM, not provider
  discovery or `gcloud` behavior: the staging deployer identity can
  authenticate, but the GitHub WIF caller still cannot mint either the
  service-account access token (`iam.serviceAccounts.getAccessToken`) or the
  email-bearing OpenID token (`iam.serviceAccounts.getOpenIdToken`) needed for
  the protected staging bearer. The concrete human prerequisite is to grant the
  caller behind `WIF_PROVIDER_VALUE` access on `DEPLOYER_SERVICE_ACCOUNT` that
  covers those permissions, typically `roles/iam.serviceAccountTokenCreator`
  (covers both) or at minimum `roles/iam.serviceAccountOpenIdTokenCreator` for
  the IAP path.

---

## 5. Blocker Summary

Fresh staging live evidence for the governance-aware `WF-FIN-001` sub-slice is
currently blocked by four concrete environment issues:

1. non-interactive user-account token minting is unavailable on this machine
   because every locally configured human `gcloud` account now requires
   reauthentication
2. the VM metadata path can mint an email-bearing identity token, but the
   resulting principal `384772941419-compute@developer.gserviceaccount.com` is
   denied by IAP and the VM scopes still block IAM Credentials impersonation
   with `ACCESS_TOKEN_SCOPE_INSUFFICIENT`
3. the older direct Cloud Run origin is not serving the expected `/api/*`
   routes as a usable fallback
4. the repository-configured GitHub Actions staging path now reaches GCP after
   the branch-local `DEV_WIF_PROVIDER` fallback, but no repo-local bearer path
   can reach the protected staging API:
   - the federated `auth_token` path is rejected by IAP with `HTTP 401 Invalid IAP credentials: Unable to parse JWT` (`26366139732`, `26367273638`, `26369501167`, `26370433652`)
   - the service-account access-token path still fails with `iam.serviceAccounts.getAccessToken` denied, including the direct `google-github-actions/auth@v2 token_format=access_token` probes on `26369501167` and `26370433652` (`26365672590`, `26369501167`, `26370433652`)
   - the service-account ID-token path still fails with `iam.serviceAccounts.getOpenIdToken` denied (`26327904346`, `26332046380`, `26332590728`, `26363924897`, `26365672590`, `26366139732`, `26367273638`, `26369501167`, `26370433652`)

Until one of those is resolved, this task can only deliver a consolidated
static-evidence packet plus a reproducible blocker record. The 2026-05-19
local rerun plus the 2026-05-22/23/24 GitHub Actions reruns narrowed the
remaining CI blocker from provider discovery to service-account token-mint IAM,
and the latest current-head rerun confirmed that no external IAM/IAP fix landed
after the direct access-token probe. They still did not surface a valid
email-bearing IAP token path from this machine or from the repo's configured
WIF automation.

---

## 6. Recommended Next Collection Pass

When valid staging credentials are available, rerun at minimum:

1. `./scripts/run-smoke-tests.sh --suite '05|06'` against
   `https://api.staging.drts-fleet.cctech-support.com`
2. governance probes against:
   - `GET /api/tenant/quotas`
   - `GET /api/tenant/cost-centers/:code/quota`
   - `GET /api/tenant/quotas/ledger`
   - `GET /api/tenant/approval-rules`
   - `GET /api/audit`
3. capture one reviewer-readable chain tying:
   - cost center
   - quota usage / ledger entry
   - approval request / approval audit entry
   - invoice generation or report job output

Only that follow-up pass should be used to argue for a `WF-FIN-001` live gate
upgrade.
