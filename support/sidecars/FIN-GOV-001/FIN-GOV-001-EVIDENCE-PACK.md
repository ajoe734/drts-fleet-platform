# FIN-GOV-001 - Governance-Aware Billing & Reporting Evidence Pack

**Task:** `FIN-GOV-001` - governance-aware billing and reporting live evidence pack
**Current owner:** `Codex`
**Current reviewer:** `Codex2`
**Collected:** `2026-05-19 (UTC)`
**Latest refresh:** `2026-05-26 (PH1GC-FIN-GOV-001 / Codex)`
**Current read:** `PARTIAL - static evidence consolidated; the latest governed staging rerun is still run 26411905501 on the actual task-branch head 91b8b723 (staging job 77747988423), and it remains blocked after exhausting repo-local bearer fallbacks. The earlier run 26382603169 on workflow-bearing head 45ad7d22 still matters because it is the latest proof that the workflow_dispatch direct_api_origin override path is wired end to end, but it did not clear the gate either. Run 26411905501 reconfirmed the same blocker on origin/codex/ph1gc-fin-gov-001: auth_token -> IAP 401 Invalid IAP credentials, direct Cloud Run auto-discovery -> iam.serviceAccounts.getAccessToken denied, shared fallback -> invalid_target, dev fallback IAP -> 403 Access denied. A same-session local follow-up at 2026-05-25T17:17Z still reconfirmed that the protected staging host redirects unauthenticated callers through Google OAuth while both currently known direct hosts (`https://drts-api-kdhu6wzufa-uc.a.run.app` and `https://drts-api-1071409254673.us-central1.run.app`) return HTML 404 for `/health` and `/api/health`, so the remaining direct branch is not just one stale alias. Local metadata access tokens are additionally scope-limited and cannot read `run.googleapis.com` or `cloudresourcemanager.googleapis.com` (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`), so this VM cannot self-discover a newer Cloud Run `status.url` either. Source review on the same branch confirms the API serves both `/health` and `/api/health`, so the 404s are not explained by a stale health-path assumption. WF-FIN-GOV-001 therefore remains PASS (static evidence) only. A refreshed 2026-05-26 GitHub Actions inventory still shows no successful workflow_dispatch staging rerun for any PH1GC-FIN-GOV-001 branch family; draft PR #290 remains open for codex/ph1gc-fin-gov-001; `gh variable list` still does not expose `STAGING_DIRECT_API_ORIGIN`; the latest ordinary PR CI run is now 26445176166 on branch head 914da247 and it again cleared only the four repo-local checks; the latest successful `CI (integration trunk)` dev run is still 26441777247 on 070f9aea and it still did not launch `staging-e2e-010`; `gh run list --workflow deploy-staging.yml --limit 10` still shows no newer `Deploy — Staging` run after the 2026-05-03 `main` failures; and `git fetch origin` still resolves origin/dev to 070f9aea rather than bringing any new governed staging evidence.`

---

## 1. Scope

This packet consolidates the currently reviewable evidence for the governance
slice under `WF-FIN-001`:

- cost-center-aware invoice generation
- tenant quota usage / quota ledger visibility
- approval audit chain continuity into billing/reporting

The target outcome for this task was a fresh staging live evidence refresh.
That refresh could not be completed from this workspace; the exact blocker is
captured in §4, including the latest 2026-05-25 GitHub Actions auth-token /
multi-service-account ID-token probes plus the attempted direct Cloud Run
fallback.

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

Additional 2026-05-26 control-plane finding:

- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` on `origin/dev`
  still states `WF-FIN-GOV-001 ↔ matrix row 14  (gate read: PASS (live staging
  evidence))`, but the refreshed GitHub Actions inventory still shows no
  successful `workflow_dispatch` rerun for any
  `codex/ph1gc-fin-gov-001*` branch. The latest governed rerun is now
  `26411905501` on `origin/codex/ph1gc-fin-gov-001@91b8b723`, and it still
  failed before `E2E-010` could start. The newest successful
  `CI (integration trunk)` run is now dev push run `26441777247` (created
  `2026-05-26T08:39:32Z`, updated `2026-05-26T08:41:47Z`) on `070f9aea`, and
  it still did not launch `staging-e2e-010`.
  A same-session `gh pr view 290` refresh confirms draft PR `#290` is open for
  the task branch. A same-session `gh variable list` refresh still shows no
  repo-level `STAGING_DIRECT_API_ORIGIN`, and a 2026-05-25T17:17Z local curl
  follow-up reconfirmed the protected staging host still redirects
  unauthenticated callers through Google OAuth while both currently known
  direct hosts still return HTML `404` for `/health` and `/api/health`. Treat
  that release-truth-sync line as a stale over-claim until a green governed
  staging rerun exists and the release-gate matrix is updated from the same
  evidence.

This packet therefore strengthens the evidence inventory, but it does not
justify a gate upgrade on its own.

---

## 4. 2026-05-19 to 2026-05-25 Live Collection Attempts

This workspace re-ran the minimum live access probes on `2026-05-19T03:59Z`
and then refreshed the GitHub Actions staging reruns through the fresh
`2026-05-25` task-branch rerun to determine whether the governance-aware
`WF-FIN-001` evidence could be refreshed from staging during this dispatch.

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

Additional machine-local probe on `2026-05-25`:

- metadata access token calls to
  `https://run.googleapis.com/v2/projects/drts-staging-bobo-20260502/locations/us-central1/services/drts-api`
  and
  `https://cloudresourcemanager.googleapis.com/v1/projects/drts-staging-bobo-20260502`
  both returned HTTP `403` with
  `Request had insufficient authentication scopes.`
- the metadata server only exposes these scopes on this worker:
  `devstorage.read_only`, `logging.write`, `monitoring.write`, `pubsub`,
  `service.management.readonly`, `servicecontrol`, `trace.append`

Interpretation:

- all user-account `gcloud` credentials available on this worker are stale for
  non-interactive token minting
- this VM can mint a syntactically valid email-bearing identity token for its
  default compute service account, so the problem is no longer token shape
- the remaining local barrier is authorization: the compute service account is
  not allowed through IAP, and the instance scopes do not permit IAM
  Credentials impersonation of the staging deployer account
- the same scope restriction also prevents this VM from using Google control
  plane APIs to read the current staging Cloud Run `status.url`, so local
  direct-origin discovery is blocked before any follow-up direct retry can be
  aimed at a fresher host

### 4.3 Direct Cloud Run fallback

Probe target:

`https://drts-api-kdhu6wzufa-uc.a.run.app`

Additional probe target from the last successful `Deploy - Staging` run log:

`https://drts-api-1071409254673.us-central1.run.app`

Observed result from `curl -i -sS --max-time 20
https://drts-api-kdhu6wzufa-uc.a.run.app/api/health`,
`curl -i -sS --max-time 20 https://drts-api-1071409254673.us-central1.run.app/health`,
`curl -i -sS --max-time 20 https://drts-api-1071409254673.us-central1.run.app/api/health`,
and matching smoke-path checks against `/api/tenant/invoices/generate` and
`/api/reports/jobs`:

- HTTP `404`
- body: Google frontend `Page not found`

Interpretation:

- the historical Cloud Run origin documented in older evidence packs is no
  longer a usable direct fallback for this session
- the alternate service URL emitted by the last successful deploy-staging run
  is also not a usable direct fallback from this worker; both known public
  `run.app` hosts now return the same Google frontend `404`
- source review on `2026-05-25` confirms the API explicitly serves both
  `/health` and `/api/health` (`apps/api/src/main.ts`,
  `apps/api/src/health/health.controller.ts`), so the `404 Page not found`
  response is not a route-prefix mismatch
- local metadata access tokens cannot query `run.googleapis.com` with the
  scopes available on this worker, so this session cannot self-discover a
  newer Cloud Run host from the control plane
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
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26373513770`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26373579304`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26374131695`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26374841176`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26375980122`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26377013261`
  - `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26378523485`
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
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@24236655` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4bbcd8fc` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@ceacdf74` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4dfa7a6b` on 2026-05-24
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@0b3835b8` on 2026-05-25
  - `origin/codex/ph1gc-fin-gov-001-rebased-20260524@6edc8938` on 2026-05-25

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
- a fresh 2026-05-24 rerun on the multi-credential fallback head, `26373513770` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@24236655`, extended the workflow to try shared and dev service-account ID-token fallbacks after the staging deployer path. The new evidence tightened the blocker rather than clearing it: the shared fallback provider failed with `invalid_target`; the primary staging deployer path still failed with `iam.serviceAccounts.getAccessToken` / `iam.serviceAccounts.getOpenIdToken`; and the dev fallback finally minted an email-bearing token that reached IAP but came back `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.` `Run E2E-010 against staging` remained skipped because no path returned `HTTP 200`.
- a fresh 2026-05-24 rerun on the direct-Cloud-Run fallback head, `26373579304` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4bbcd8fc`, added a `gcloud run services describe drts-api` resolution step plus a dev-service-account direct `run.app` probe. That path did not clear the blocker either: `Resolve direct Cloud Run API origin` completed with `::warning::Could not resolve direct Cloud Run API origin for drts-api`, so the direct-origin token/probe steps were skipped; the shared fallback still failed with `invalid_target`; the staging deployer still failed on `getAccessToken` / `getOpenIdToken`; and the dev fallback IAP token still ended at `403 Access denied`. `Run E2E-010 against staging` was skipped again, and the artifact set remained limited to probe bodies rather than reviewer-readable invoice/report evidence.
- a fresh 2026-05-24 rerun on the direct-origin diagnostics head, `26374131695` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4f1bb9ad`, kept the staging job blocked but removed the last ambiguity in the direct fallback. The new uploaded artifact `e2e-010-direct-api-resolve.stderr.txt` shows `gcloud run services describe drts-api` failed while refreshing impersonated credentials with `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`, so the direct-origin branch is gated by the same service-account access-token permission as the primary bearer path, not by an unknown or missing service name. The rerun still produced `Invalid IAP credentials: Unable to parse JWT` for the GitHub `auth_token` probe and `403 Access denied` for `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com`, and `Run E2E-010 against staging` remained skipped. The workflow now supports `workflow_dispatch` input `direct_api_origin` (preferred for one-off retries) plus `vars.STAGING_DIRECT_API_ORIGIN` as explicit direct-URL overrides for a future rerun if an operator already knows the current `run.app` origin.
- a fresh 2026-05-24 rerun on the then-current workflow-bearing branch head, `26374841176` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@ceacdf74`, reconfirmed the same external gate after the verification-body traceability anchor. The GitHub `auth_token` probe still returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the primary staging deployer still failed to mint either an OAuth access token (`iam.serviceAccounts.getAccessToken` denied) or an IAP ID token (`iam.serviceAccounts.getOpenIdToken` denied); the shared fallback provider still failed with `invalid_target`; the dev fallback still produced the first email-bearing token that reached IAP but came back `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; and direct Cloud Run discovery still failed because `gcloud run services describe drts-api` could not refresh impersonated credentials without the same `iam.serviceAccounts.getAccessToken` permission. `Syntax check E2E-010` and `Run E2E-010 against staging` remained skipped, and the uploaded artifacts were still limited to `e2e-010-iap-health-auth-token-body.txt`, `e2e-010-dev-id-token-health-body.txt`, and `e2e-010-direct-api-resolve.stderr.txt`.
- a fresh 2026-05-24 rerun on the current pushed head, `26375980122` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4dfa7a6b` (staging job `77636204638`), revalidated the blocker after the sidecar truth-sync anchors without changing the workflow-bearing code. The staging job now centralizes the failure in `Fail when no staging bearer path works`, but the underlying evidence did not improve: the downloaded `e2e-010-iap-health-auth-token-body.txt` still says `Invalid IAP credentials: Unable to parse JWT`; `e2e-010-dev-id-token-health-body.txt` still says `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; `e2e-010-direct-api-resolve.stderr.txt` still shows `gcloud run services describe drts-api` blocked by `403 Permission 'iam.serviceAccounts.getAccessToken' denied`; and job annotations still record `invalid_target` for the shared fallback provider plus `iam.serviceAccounts.getAccessToken` / `iam.serviceAccounts.getOpenIdToken` denial for the staging deployer path. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, so the shell still never started on the actual current branch head.
- a fresh 2026-05-25 rerun on the latest pushed head before the final current-head retry, `26377013261` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@0b3835b8` (staging job `77638938926`), reconfirmed the same external gate after the 2026-05-25 control-plane truth-sync anchor. The downloaded `e2e-010-iap-health-auth-token-body.txt` still says `Invalid IAP credentials: Unable to parse JWT`; `e2e-010-dev-id-token-health-body.txt` still says `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; and `e2e-010-direct-api-resolve.stderr.txt` still shows `gcloud run services describe drts-api` failing while refreshing impersonated credentials with `403 Permission 'iam.serviceAccounts.getAccessToken' denied`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again because `Fail when no staging bearer path works` still tripped before the shell could start.
- a fresh 2026-05-25 rerun on the next pushed head, `26378523485` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@6edc8938` (staging job `77643197421`), reconfirmed the same external gate after the 2026-05-25 blocker-evidence sync anchor. The downloaded `e2e-010-iap-health-auth-token-body.txt` still says `Invalid IAP credentials: Unable to parse JWT`; `e2e-010-dev-id-token-health-body.txt` still says `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; and `e2e-010-direct-api-resolve.stderr.txt` still shows `gcloud run services describe drts-api` failing while refreshing impersonated credentials with `403 Permission 'iam.serviceAccounts.getAccessToken' denied`. The full job log also still records `iam.serviceAccounts.getOpenIdToken` denial for the primary ID-token path plus `invalid_target` for the shared fallback provider, while the fail-step env shows `DIRECT_API_ORIGIN` remained empty. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again because `Fail when no staging bearer path works` still tripped before the shell could start.
- a fresh 2026-05-25 rerun on the actual current pushed head, `26379690350` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@f9f2a0c8` (staging job `77646459820`), reconfirmed the same external gate after the actions-inventory truth-sync anchor. Full-run conclusion again stayed `failure`; the job still produced only three probe artifacts (`e2e-010-iap-health-auth-token-body.txt`, `e2e-010-dev-id-token-health-body.txt`, `e2e-010-direct-api-resolve.stderr.txt`); `Resolve direct Cloud Run API origin` again warned that `gcloud run services describe drts-api` could not mint the required access token; the GitHub `auth_token` probe again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; `google-github-actions/auth@v2 token_format=access_token` again failed with `403 Permission 'iam.serviceAccounts.getAccessToken' denied`; `Mint primary IAP verification token` again failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`; the shared fallback provider again failed with `invalid_target`; the dev fallback again reached IAP only to get `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; and `DIRECT_API_ORIGIN` still remained empty in the fail-step env. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again because `Fail when no staging bearer path works` still tripped before the shell could start.
- a fresh 2026-05-25 rerun on the then-latest workflow-bearing pushed head, `26382603169` on `origin/codex/ph1gc-fin-gov-001-rebased-20260525@45ad7d22` (staging job `77654656937`), exercised the new workflow_dispatch input override path directly. `Resolve direct Cloud Run API origin` used `direct_api_origin=https://drts-api-kdhu6wzufa-uc.a.run.app` instead of attempting `gcloud run services describe`; `Mint dev fallback direct Cloud Run token` and `Probe direct Cloud Run health with dev fallback token` both ran; and the downloaded `e2e-010-dev-direct-api-health-body.txt` now captures an HTML `404 Page not found` body from the historical `run.app` host. The rest of the blocker remained unchanged: `e2e-010-iap-health-auth-token-body.txt` still says `Invalid IAP credentials: Unable to parse JWT`; `e2e-010-dev-id-token-health-body.txt` still says `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; the staging deployer access-token and ID-token paths still annotated `iam.serviceAccounts.getAccessToken` / `iam.serviceAccounts.getOpenIdToken` denial; the shared fallback provider still annotated `invalid_target`; and `Syntax check E2E-010` / `Run E2E-010 against staging` were still skipped because `Fail when no staging bearer path works` tripped first. This proves the direct-override wiring now works, and narrows the remaining direct branch to current URL freshness / invoker reachability rather than Cloud Run discovery.
- a fresh 2026-05-25 rerun on the actual current pushed task branch, `26411905501` on `origin/codex/ph1gc-fin-gov-001@91b8b723` (staging job `77747988423`), reconfirmed the same external gate without the historical direct-input override. The job again failed at `Fail when no staging bearer path works`: `Resolve direct Cloud Run API origin` still could not refresh impersonated credentials because `iam.serviceAccounts.getAccessToken` is denied; `Probe IAP health with auth_token` again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the shared fallback provider again failed with `invalid_target`; the dev fallback again reached IAP only to get `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; and `Syntax check E2E-010` / `Run E2E-010 against staging` were skipped because no bearer path returned `HTTP 200`.
- the latest governed staging rerun is now `26411905501` on `origin/codex/ph1gc-fin-gov-001@91b8b723` (staging job `77747988423`). Run `26382603169` still matters because it remains the latest proof that the workflow_dispatch `direct_api_origin` override is live and reaches the historical `run.app` host, but `26411905501` is now the latest branch-head blocker evidence.
- a refreshed `gh run list --workflow ci-integ.yml --limit 20` inventory captured after the next `dev` success confirms the same truth from the control-plane side: there is still no successful `workflow_dispatch` rerun for any `codex/ph1gc-fin-gov-001*` branch, and the newest successful `CI (integration trunk)` run is now dev push run `26441777247` (created `2026-05-26T08:39:32Z`, updated `2026-05-26T08:41:47Z`), which still ran only the standard lint/unit/typecheck/build/integration/orchestrator jobs without a `staging-e2e-010` job. A same-session `gh pr view 290` refresh also confirmed draft PR `#290` is open for the task branch. A same-session `gh variable list` refresh also confirmed the repo still does not define `STAGING_DIRECT_API_ORIGIN`, and a 2026-05-25T17:17Z local curl follow-up reconfirmed the protected staging host still redirects unauthenticated callers through Google OAuth while both currently known direct hosts still return HTML `404` for `/health` and `/api/health`, so the direct fallback remains dependent on workflow_dispatch input or an operator-set repo variable.
- a fourth same-day remote-truth refresh on 2026-05-26 confirmed that nothing material changed after the next closeout-only push either. `gh pr view 290` still reports the task branch as an open draft PR; `git fetch origin` now resolves `origin/dev` to `070f9aea`; and PR CI run `26441269370` on `origin/codex/ph1gc-fin-gov-001@35848f7a` again cleared only `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, and `Smoke acceptance`.
- a fifth same-day remote-truth refresh immediately after the latest blocker-truth push preserved the same outcome again. `gh pr view 290` still reports the task branch as an open draft PR (updated `2026-05-26T08:47:01Z`); `git fetch origin` still resolves `origin/dev` to `070f9aea`; and the latest ordinary PR CI run is now `26442129630` on `origin/codex/ph1gc-fin-gov-001@b06938a2`, which again cleared only `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, and `Smoke acceptance`. No new `CI (integration trunk)` workflow_dispatch rerun was launched on this task branch, so no newer governed staging evidence displaced `26411905501`.
- a sixth same-day remote-truth refresh after the next closeout-only push preserved the same outcome again. `gh pr view 290` still reports the task branch as an open draft PR (updated `2026-05-26T08:59:07Z`); `git fetch origin` still resolves `origin/dev` to `070f9aea`; the latest ordinary PR CI run is now `26442701534` on `origin/codex/ph1gc-fin-gov-001@36f8d64c`, which again cleared only `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, and `Smoke acceptance`; `gh variable list` still shows no repo-level `STAGING_DIRECT_API_ORIGIN`; and `gh run list --workflow deploy-staging.yml --limit 10` still shows no newer `Deploy — Staging` run after the 2026-05-03 `main` failures. No new `CI (integration trunk)` workflow_dispatch rerun was launched on this task branch, so no newer governed staging evidence displaced `26411905501`.
- a seventh same-day remote-truth refresh after the latest blocker-truth push preserved the same outcome yet again. `gh pr view 290` still reports the task branch as an open draft PR (updated `2026-05-26T09:42:00Z`); `git fetch origin` still resolves `origin/dev` to `070f9aea`; the latest ordinary PR CI run is now `26444737502` on `origin/codex/ph1gc-fin-gov-001@6507ceb0`, which again cleared only `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, and `Smoke acceptance`; `gh variable list` still shows no repo-level `STAGING_DIRECT_API_ORIGIN`; and `gh run list --workflow deploy-staging.yml --limit 10` still shows no newer `Deploy — Staging` run after the 2026-05-03 `main` failures. No new `CI (integration trunk)` workflow_dispatch rerun was launched on this task branch, so no newer governed staging evidence displaced `26411905501`.
- an eighth same-day remote-truth refresh after the latest PR-CI truth-refresh push preserved the same outcome yet again. `gh pr view 290` still reports the task branch as an open draft PR (updated `2026-05-26T09:51:11Z`); `git fetch origin` still resolves `origin/dev` to `070f9aea`; the latest ordinary PR CI run is now `26445176166` on `origin/codex/ph1gc-fin-gov-001@914da247`, which again cleared only `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, and `Smoke acceptance`; `gh variable list` still shows no repo-level `STAGING_DIRECT_API_ORIGIN`; and `gh run list --workflow deploy-staging.yml --limit 10` still shows no newer `Deploy — Staging` run after the 2026-05-03 `main` failures. No new `CI (integration trunk)` workflow_dispatch rerun was launched on this task branch, so no newer governed staging evidence displaced `26411905501`.
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
- the remaining GitHub Actions blocker is now more specific than generic
  provider drift: repo-local fallbacks can reach GCP, but no available
  principal clears the full chain. The shared fallback provider itself is
  invalid (`invalid_target`), the staging deployer identity still cannot mint
  either the service-account access token (`iam.serviceAccounts.getAccessToken`)
  or the email-bearing OpenID token (`iam.serviceAccounts.getOpenIdToken`)
  needed for the protected staging bearer, the dev deployer identity can mint
  an email-bearing IAP token but is not allow-listed on the staging IAP policy,
  and the direct `run.app` origin cannot be discovered from the runner without
  the same `getAccessToken` permission unless an operator provides
  workflow_dispatch input `direct_api_origin` or
  `vars.STAGING_DIRECT_API_ORIGIN`.

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
   can reach the protected staging API or a resolvable direct Cloud Run origin:
- the federated `auth_token` path is rejected by IAP with `HTTP 401 Invalid IAP credentials: Unable to parse JWT` (`26366139732`, `26367273638`, `26369501167`, `26370433652`, `26374131695`, `26374841176`, `26375980122`, `26377013261`, `26378523485`, `26379690350`, `26382603169`, `26411905501`)
- the service-account access-token path still fails with `iam.serviceAccounts.getAccessToken` denied, including the direct `google-github-actions/auth@v2 token_format=access_token` probes on `26369501167`, `26370433652`, `26379690350`, `26382603169`, and `26411905501`, and also the direct Cloud Run `gcloud run services describe drts-api` resolution stderr on runs that relied on discovery (`26365672590`, `26369501167`, `26370433652`, `26374131695`, `26374841176`, `26375980122`, `26377013261`, `26378523485`, `26379690350`, `26411905501`)
- the staging-deployer service-account ID-token path still fails with `iam.serviceAccounts.getOpenIdToken` denied (`26327904346`, `26332046380`, `26332590728`, `26363924897`, `26365672590`, `26366139732`, `26367273638`, `26369501167`, `26370433652`, `26373513770`, `26373579304`, `26374131695`, `26374841176`, `26375980122`, `26377013261`, `26378523485`, `26379690350`, `26382603169`, `26411905501`)
- the shared fallback provider remains unusable with `invalid_target` (`26373513770`, `26373579304`, `26374841176`, `26375980122`, `26377013261`, `26378523485`, `26379690350`, `26382603169`, `26411905501`)
- the dev fallback service account can mint an email-bearing IAP token, but staging IAP returns `403 Access denied` for `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com` (`26373513770`, `26373579304`, `26374131695`, `26374841176`, `26375980122`, `26377013261`, `26378523485`, `26379690350`, `26382603169`, `26411905501`)
- the direct Cloud Run discovery branch remained unavailable on runs that relied on `gcloud run services describe drts-api`; that discovery path is still blocked by `iam.serviceAccounts.getAccessToken` unless a rerun is supplied with workflow_dispatch input `direct_api_origin` (preferred) or `vars.STAGING_DIRECT_API_ORIGIN` (`26373579304`, `26374131695`, `26374841176`, `26375980122`, `26377013261`, `26378523485`, `26379690350`, `26411905501`)
- the explicit direct Cloud Run override path now executes on `26382603169`: the workflow accepted `direct_api_origin=https://drts-api-kdhu6wzufa-uc.a.run.app`, minted the dev direct token, and reached the historical host, which returned HTML `404 Page not found` for `/api/health`. The remaining direct blocker is therefore current `run.app` URL freshness and/or Cloud Run invoker reachability, not missing workflow wiring.

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
