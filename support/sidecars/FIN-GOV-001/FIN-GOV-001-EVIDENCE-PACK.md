# FIN-GOV-001 - Governance-Aware Billing & Reporting Evidence Pack

**Task:** `FIN-GOV-001` - governance-aware billing and reporting live evidence pack
**Intended owner:** `Codex2`
**Intended reviewer:** `Codex`
**Collected:** `2026-05-19 (UTC)`
**Current read:** `PARTIAL - static evidence consolidated; 2026-05-19 live rerun reconfirmed blocked by credential/ingress gates`

---

## 1. Scope

This packet consolidates the currently reviewable evidence for the governance
slice under `WF-FIN-001`:

- cost-center-aware invoice generation
- tenant quota usage / quota ledger visibility
- approval audit chain continuity into billing/reporting

The target outcome for this task was a fresh staging live evidence refresh.
That refresh could not be completed from this workspace on `2026-05-19`; the
exact blocker is captured in §4.

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

## 4. 2026-05-19 Live Collection Attempt

This workspace re-ran the minimum live access probes on `2026-05-19T03:59Z`
to determine whether the governance-aware `WF-FIN-001` evidence could be
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

Active CLI account:

- `bobo.du@cctech-support.com`

Attempted helper:

`./scripts/print-staging-iap-token.sh`

Underlying failure:

`gcloud auth print-access-token` returned:

`Reauthentication failed. cannot prompt during non-interactive execution.`

The impersonated fallback path failed with the same reauthentication error when
running:

`gcloud auth print-identity-token --include-email --project drts-staging-bobo-20260502 --impersonate-service-account github-actions-deployer@drts-staging-bobo-20260502.iam.gserviceaccount.com --audiences 1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`

Interpretation:

- this workspace had an active `gcloud` account selected
- the local credentials were stale for non-interactive token minting
- no fresh IAP token could be produced from this session

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
- resulting run: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26287551676`
- branch / commit under test: `origin/codex/ph1gc-fin-gov-001@f8cc61e7`

Observed result from `gh run view 26287551676 --job 77378907824 --log`:

- job `staging-e2e-010` started with the expected staging env inputs:
  - `PROJECT_ID=drts-staging-bobo-20260502`
  - `REGION=us-central1`
  - `CONTROL_PLANE_API_ORIGIN=https://api.staging.drts-fleet.cctech-support.com`
  - `IAP_CLIENT_ID=1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`
- first `google-github-actions/auth@v2` step failed before any `gcloud` or
  E2E shell execution:
  - `failed to generate Google Cloud federated token ... {"error":"invalid_target","error_description":"The target service indicated by the \"audience\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn't exist."}`
- no E2E console/evidence artifacts were produced because auth failed before
  the shell could start

Interpretation:

- the repo-configured non-interactive WIF path is currently broken
- this is no longer just a local `gcloud` credential-staleness issue: even the
  GitHub Actions runner cannot mint the first federated credential from
  `secrets.STAGING_WIF_PROVIDER || secrets.WIF_PROVIDER`
- until that provider reference is repaired (or an alternate CI-safe bearer
  path is supplied), the governed staging rerun cannot start from either the
  current worker or GitHub Actions

---

## 5. Blocker Summary

Fresh staging live evidence for the governance-aware `WF-FIN-001` sub-slice is
currently blocked by three concrete environment issues:

1. non-interactive IAP token minting is unavailable on this machine because the
   current `gcloud` session requires reauthentication
2. the older direct Cloud Run origin is not serving the expected `/api/*`
   routes as a usable fallback
3. the repository-configured GitHub Actions WIF provider now fails with
   `invalid_target`, so the CI-side federated token path is also unavailable

Until one of those is resolved, this task can only deliver a consolidated
static-evidence packet plus a reproducible blocker record. The 2026-05-19
local rerun and the 2026-05-22 GitHub Actions rerun did not surface a hidden
alternate ingress or a valid non-interactive token path from this machine or
from the repo's configured WIF automation.

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
