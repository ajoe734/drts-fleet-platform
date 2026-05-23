# FIN-GOV-001 - Governance-Aware Billing & Reporting Evidence Pack

**Task:** `FIN-GOV-001` - governance-aware billing and reporting live evidence pack
**Intended owner:** `Codex2`
**Intended reviewer:** `Codex`
**Collected:** `2026-05-19 (UTC)`
**Current read:** `PARTIAL - static evidence consolidated; 2026-05-23 revalidation still blocked by IAP / WIF / IAM gates`

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

Interpretation:

- all locally configured human `gcloud` credentials are stale for non-interactive token minting
- no fresh email-bearing IAP token can be produced from this session via user-account auth

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

### 4.4 2026-05-23 revalidation

Fresh probes on `2026-05-23` still stop before any governed E2E request can be issued:

- `curl -i -sS --max-time 20 https://api.staging.drts-fleet.cctech-support.com/api/health` still returns HTTP `302` with `Invalid IAP credentials: empty token`
- `gh secret list --repo ajoe734/drts-fleet-platform | grep 'WIF'` shows `DEV_WIF_PROVIDER`, `DEV_WIF_SERVICE_ACCOUNT`, `STAGING_WIF_SERVICE_ACCOUNT`, `WIF_PROVIDER`, and `WIF_SERVICE_ACCOUNT`, but **no** `STAGING_WIF_PROVIDER`
- the missing `STAGING_WIF_PROVIDER` explains why the staging GitHub Actions auth path falls back to older provider settings unless the workflow adds an explicit fallback order

Interpretation:

- the protected staging host is still reachable but still requires a valid email-bearing IAP token
- repo-side staging WIF configuration remains incomplete on this date
- `WF-FIN-GOV-001` cannot honestly claim `PASS (live staging evidence)` until the auth path is repaired and a strict-mode governed rerun succeeds

---

## 5. Blocker Summary

Fresh staging live evidence for the governance-aware `WF-FIN-GOV-001` slice is
currently blocked by three concrete environment issues:

1. non-interactive user-account IAP token minting is unavailable on this machine because every probed `gcloud` account requires reauthentication
2. the repo currently exposes `STAGING_WIF_SERVICE_ACCOUNT` but not `STAGING_WIF_PROVIDER`, so the CI-side staging auth path still lacks the intended provider configuration
3. the older direct Cloud Run origin is not serving the expected `/api/*` routes as a usable fallback

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
