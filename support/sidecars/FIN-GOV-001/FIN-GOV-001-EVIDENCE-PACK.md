# FIN-GOV-001 - Governance-Aware Billing & Reporting Evidence Pack

**Task:** `FIN-GOV-001` - governance-aware billing and reporting live evidence pack
**Intended owner:** `Codex2`
**Intended reviewer:** `Codex`
**Collected:** `2026-05-19 (UTC)`
**Current read:** `PARTIAL - static evidence consolidated; 2026-05-19 live rerun and 2026-05-26 governed-dispatch rerun (run 26450437008 / staging job 77869361661 on origin/codex/ph1gc-fin-gov-001-rebased-20260526@cc7eca66) reconfirmed blocked by credential/ingress gates`

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

### 4.4 2026-05-26 governed `workflow_dispatch` rerun reread

After the 2026-05-19 baseline above, the reviewer lane on `origin/codex/ph1gc-fin-gov-001-rebased-20260526@cc7eca66` continued to drive governed `workflow_dispatch` reruns against `ci-integ.yml` `staging-e2e-010`. The latest such rerun (run `26450437008`, staging job `77869361661`, captured at `2026-05-26T15:23Z`) recovered from the prior 2026-05-26 GitHub-side setup outage (run `26447438902`): `typecheck`, `lint`, `integration`, `unit`, `orchestrator-tests`, and `build` all passed, and `staging-e2e-010` again reached the bearer probe ladder. It then failed at `Fail when no staging bearer path works`, with the same external evidence as §4.1–§4.3:

- `auth_token` probe → HTTP 401 `Invalid IAP credentials: Unable to parse JWT`.
- direct Cloud Run auto-discovery → `gcloud run services describe drts-api` blocked by `403 Permission 'iam.serviceAccounts.getAccessToken' denied`.
- primary IAP ID-token path → `iam.serviceAccounts.getOpenIdToken` denied for the staging deployer.
- shared fallback provider → `invalid_target`.
- dev fallback path → reached IAP only to receive HTTP 403 `Access denied` for `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com`.
- `DIRECT_API_ORIGIN_INPUT` / `DIRECT_API_ORIGIN_VAR` both empty, so the direct `run.app` branch stayed skipped (`gh variable list --repo ajoe734/drts-fleet-platform` still shows no `STAGING_DIRECT_API_ORIGIN`).

Local ingress checks at `2026-05-26T15:10Z` reproduced the same external state:

- `https://api.staging.drts-fleet.cctech-support.com/api/health` → HTTP 302 into Google OAuth with `Invalid IAP credentials: empty token`.
- `https://drts-api-kdhu6wzufa-uc.a.run.app/api/health` and `https://drts-api-1071409254673.us-central1.run.app/api/health` → Google frontend HTTP 404 `Page not found`.

The same-session retry chain on the owner branch failed pre-run with `HTTP 500: Failed to run workflow dispatch` on both `codex/ph1gc-fin-gov-001-rebased-20260526@5ee50d96` and `codex/ph1gc-fin-gov-001@dbdedbfc`, so the latest *successfully created* governed-dispatch run remains `26450437008`. The earlier task-branch rerun `26411905501` (`origin/codex/ph1gc-fin-gov-001@91b8b723`, staging job `77747988423`) reconfirmed the same external gate before the GitHub-side setup outage, and the earlier proof of the `direct_api_origin` override (`26382603169` on `origin/codex/ph1gc-fin-gov-001-rebased-20260525@45ad7d22`, staging job `77654656937`) showed that the direct-host branch is mechanically working but the historical `run.app` host now returns Google frontend `404 Page not found`.

This refresh does **not** unblock §4.1–§4.3; it only adds the freshest run handle for the gate-uplift owner. The unblock list (operator action) is unchanged from §5.

---

## 5. Blocker Summary

Fresh staging live evidence for the governance-aware `WF-FIN-001` sub-slice is
currently blocked by two concrete environment issues:

1. non-interactive IAP token minting is unavailable on this machine because the
   current `gcloud` session requires reauthentication
2. the older direct Cloud Run origin is not serving the expected `/api/*`
   routes as a usable fallback

Until one of those is resolved, this task can only deliver a consolidated
static-evidence packet plus a reproducible blocker record. The 2026-05-19
rerun did not surface a hidden alternate ingress or a valid non-interactive
token path from this machine.

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
