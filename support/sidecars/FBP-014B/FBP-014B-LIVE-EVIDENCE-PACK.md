# FBP-014B - Live Integrated Evidence Pack

**Task:** `FBP-014B` - final integrated cross-repo evidence run  
**Owner:** `Codex`  
**Reviewer:** `Claude`  
**Collected:** `2026-04-17 (UTC)`  
**Status:** `PASS - live integrated staging evidence refreshed on the deployed 929072c runtime`

---

## 1. Executive Summary

`FBP-014B` is now ready for review. The final live rerun on staging succeeded after
`fix(FBP-014B): align completed booking projection and billing` (`929072c`) deployed through
GitHub Actions `Deploy - Staging` run `24545508036`.

- `E2E-001` passed end to end on live staging:
  - tenant booking creation
  - explicit dispatch trigger and queue discovery
  - candidate resolution and assignment
  - full driver lifecycle through `complete`
  - tenant booking read-back converged to `status="completed"`
  - tenant invoice generation succeeded and the invoice was retrievable
  - audit entries were visible on the same runtime
- `E2E-004` passed on live staging:
  - platform-admin tenant creation
  - booking creation under the new tenant
  - no cross-tenant leak in the tenant booking list
  - direct detail read by `TEN_ACME` returned `404 BOOKING_NOT_FOUND`
- The pre-fix blockers reproduced earlier in the same task line are now resolved on the deployed
  runtime:
  - booking projection rolls up `completed`
  - billing can see live completed owned trips
  - cross-tenant booking access is blocked on both list and direct-detail paths
- GitHub Actions `CI` run `24545508043` stayed red on unrelated repo-wide unit/typecheck
  failures, but the staging deploy itself completed successfully and the runtime under test is the
  fixed revision.

Result: the reviewer can now inspect one coherent
`booking -> dispatch -> driver -> billing/audit` chain plus a live cross-tenant isolation proof.

---

## 2. Runtime Under Test

### 2.1 Live API origin

The staging API origin used for the final run was:

`https://drts-api-kdhu6wzufa-uc.a.run.app`

### 2.2 Private ingress

Live access still requires an identity token:

```bash
export E2E_API_URL="https://drts-api-kdhu6wzufa-uc.a.run.app"
export E2E_AUTH_BEARER_TOKEN="$(gcloud auth print-identity-token)"
export E2E_TIMEOUT=60
```

Requests still require the app bootstrap headers:

- `x-actor-type`
- `x-actor-id`
- `x-realm`
- `x-tenant-id` where relevant

### 2.3 Deployed runtime details

- GitHub Actions deploy workflow: `Deploy - Staging` run `24545508036`
- Workflow conclusion: `success`
- API revision under test: `drts-api-00016-s4v`
- API image under test:
  `us-central1-docker.pkg.dev/autotaxi-492811/drts/api:929072c1a567`

---

## 3. Execution Record

### 3.1 Pre-fix rerun on the old staging runtime

Command:

```bash
export E2E_API_URL="https://drts-api-kdhu6wzufa-uc.a.run.app"
export E2E_AUTH_BEARER_TOKEN="$(gcloud auth print-identity-token)"
export E2E_TIMEOUT=60
./tests/e2e/run-e2e.sh --suite 001,004 --verbose
```

Observed run ID: `859357`

Outcome:

- `E2E-001-enterprise-dispatch` failed because:
  - booking read-back remained `status="active"` after driver completion
  - invoice generation returned `VALIDATION_ERROR: No eligible trips found for the requested billing period.`
- `E2E-004-tenant-attribution` already passed list isolation, and a direct follow-up probe also
  confirmed `GET /tenant/bookings/:bookingId` returned `404 BOOKING_NOT_FOUND`

This run justified the runtime fix carried by `929072c`.

### 3.2 Runtime fix and staging deploy

- Commit: `929072c`
- Subject: `fix(FBP-014B): align completed booking projection and billing`
- `Deploy - Staging` run `24545508036`: `success`
- `CI` run `24545508043`: `failure`

The failing `CI` run did not block the deployed staging verification because the deploy workflow
completed and the live API revision switched to the `929072c1a567` image before the final rerun.

### 3.3 Final live rerun on the deployed staging runtime

Command:

```bash
export E2E_API_URL="https://drts-api-kdhu6wzufa-uc.a.run.app"
export E2E_AUTH_BEARER_TOKEN="$(gcloud auth print-identity-token)"
export E2E_TIMEOUT=60
./tests/e2e/run-e2e.sh --suite 001,004 --verbose
```

Observed run ID: `874878`

Outcome: `2/2 passed`

- `E2E-001-enterprise-dispatch`: `PASS`
- `E2E-004-tenant-attribution`: `PASS`

Captured artifacts:

- chain file: `/tmp/drts-e2e-chain-874878.json`
- evidence log: `/tmp/drts-e2e-evidence-874878.log`

Scope note:

- This final acceptance rerun explicitly executed suites `001` and `004`.
- `E2E-002-forwarded-order` was not rerun in this closeout pass.

---

## 4. Live Evidence

### 4.1 E2E-001 owned happy path

The final live chain was:

- booking: `booking-000014`
- tenant: `10000000-0000-0000-0000-000000000201`
- order: `d3b3b294-6cb6-443c-abe8-82aa5532fb93`
- dispatch job: `c930fef0-f757-4db7-aa12-2deff19c82c6`
- driver: `drv-demo-001`
- vehicle: `veh-demo-001`
- task: `2beb8ad3-1358-4bdf-9adf-100d7e1c2073`
- completion timestamp: `2026-04-17T03:11:26Z`
- invoice: `invoice-f96c5710-a2fa-4d45-b153-7e5d247ca49c`

Observed assertions from the passing run:

- booking status after creation: `active`
- booking final status after driver completion: `completed`
- invoice generation: `PASS`
- invoice retrieval: `PASS`
- audit entry count visible to `ops_user`: `65`

Evidence capture excerpt:

```text
2026-04-17T03:11:24Z | E2E-001 | tenant | bookingId=booking-000014
2026-04-17T03:11:25Z | E2E-001 | ops | dispatchJobId=c930fef0-f757-4db7-aa12-2deff19c82c6
2026-04-17T03:11:25Z | E2E-001 | ops | taskId=2beb8ad3-1358-4bdf-9adf-100d7e1c2073
2026-04-17T03:11:26Z | E2E-001 | tenant | bookingStatusFinal=completed
2026-04-17T03:11:28Z | E2E-001 | billing | invoiceId=invoice-f96c5710-a2fa-4d45-b153-7e5d247ca49c
2026-04-17T03:11:28Z | E2E-001 | audit | entryCount=65
```

Interpretation:

- the tenant-facing booking read model now converges with the completed owned-order state
- live completed owned trips now surface into billing eligibility
- the integrated `booking -> dispatch -> driver -> billing/audit` path is reviewer-usable on
  deployed staging

### 4.2 E2E-004 tenant isolation

The final live isolation proof was:

- new tenant: `t_9cdf3f99`
- new tenant code: `E2E-ATTR-6395488`
- new-tenant booking: `booking-000015`
- TEN_ACME list leak detected: `false`
- TEN_ACME direct detail read: `404 BOOKING_NOT_FOUND`

Evidence capture excerpt:

```text
2026-04-17T03:11:29Z | E2E-004 | platform_admin | newTenantId=t_9cdf3f99
2026-04-17T03:11:29Z | E2E-004 | tenant_newco | bookingId=booking-000015
2026-04-17T03:11:29Z | E2E-004 | safety | crossTenantLeakDetected=false
2026-04-17T03:11:29Z | E2E-004 | safety | directDetailStatus=404
```

Interpretation:

- tenant booking list isolation is correct on the deployed runtime
- direct booking detail reads are also correctly tenant-scoped
- the previously reproduced cross-tenant leak is no longer present on staging

---

## 5. Key Findings

### Finding 1 - Live staging now satisfies the UAT completion expectation

The owned happy path no longer stalls at the final read model. After driver completion, the
tenant booking surface now returns `status="completed"` instead of exposing a stale `active`
projection.

### Finding 2 - Billing continuity is closed on the deployed runtime

The just-completed owned trip is now eligible for invoice generation in the same billing window,
and the generated invoice is retrievable on the tenant surface.

### Finding 3 - Cross-tenant isolation proof is now live and reviewer-usable

The final rerun proves both list isolation and direct-detail isolation on live staging. The old
cross-tenant leak evidence should now be treated as historical pre-fix evidence only.

### Finding 4 - The final acceptance packet can move forward even though CI is still red

The repo-wide `CI` workflow remains unstable for unrelated reasons, but the staging deploy for the
runtime under test succeeded. `FBP-014B` is an evidence-closeout task, and its acceptance hinges on
the truth of the deployed integrated path, which is now verified.

---

## 6. Recommended Task State

`FBP-014B` should move from `in_progress` to `review`.

Recommended owner handoff summary:

- live staging evidence pack refreshed with passing run `874878`
- deploy run `24545508036` succeeded on commit `929072c`
- `E2E-001` proves the end-to-end owned chain through billing and audit
- `E2E-004` proves no cross-tenant leak on both list and direct-detail surfaces
- reviewer can now inspect one coherent integrated packet instead of a blocker report

This task is not yet `done` only because the owner still needs formal reviewer approval in the
shared-truth lifecycle.

---

## 7. Files Changed While Producing This Evidence

- `packages/contracts/src/index.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
- `tests/unit/billing-settlement.test.ts`
- `tests/unit/owned-mobility.test.ts`
- `tests/e2e/E2E-001-enterprise-dispatch.sh`
- `tests/e2e/E2E-004-tenant-attribution.sh`
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`

Verification already performed in this task line:

- `pnpm exec vitest run tests/unit/owned-mobility.test.ts tests/unit/billing-settlement.test.ts`
- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api typecheck`
- `bash -n tests/e2e/E2E-001-enterprise-dispatch.sh tests/e2e/E2E-004-tenant-attribution.sh tests/e2e/run-e2e.sh tests/e2e/lib/helpers.sh`
- live staging rerun `874878` on deployed revision `drts-api-00016-s4v`

No shared-truth source file was edited directly; status transitions continue to flow through
`scripts/ai-status.sh` / `scripts/ai_status.py`.
