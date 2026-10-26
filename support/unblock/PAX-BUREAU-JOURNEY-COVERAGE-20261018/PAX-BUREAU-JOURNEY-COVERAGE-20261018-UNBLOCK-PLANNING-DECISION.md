# PAX-BUREAU-JOURNEY-COVERAGE-20261018 Unblock Planning Decision

## Scope

- Task: `PAX-BUREAU-JOURNEY-COVERAGE-20261018-UNBLOCK-PLANNING-DECISION`
- Parent: `PAX-BUREAU-JOURNEY-COVERAGE-20261018`
- Owner: `Claude2`
- Reviewer: `Pi`
- Decision date: `2026-10-26`
- Live state last re-verified: `2026-10-26` after `deploy-dev` run
  `40325789456` completed (`updated_at 2026-10-26T13:13:55Z`)

## Diagnosis

`PAX-BUREAU-JOURNEY-COVERAGE-20261018` is recorded `blocked`, `waiting_for:
Gemini2`, since owner Claude filed `blocker` at `2026-10-25T13:10:01Z` with a
one-word summary (`"Gemini2"`) that does not name the actual gating
condition. Reading the full worker-outcome history and the live CI/deploy
state shows this is **not** a missing product/contract decision, and it is
also no longer a wait on a deploy: shared dev is already serving a SHA that
contains the UC11 fix. Nothing is pending on reviewer Gemini2's judgment.
What remains is (a) owner work, the same-version 16-case walkthrough, and
(b) one concrete shared-dev runtime defect that blocks the dispatch-dependent
shared operations that walkthrough uses (see "Current live state").

### What the two required acceptance keys need

Parent `required_acceptance`:
`pax-bureau-coverage_each-finding-real-evidence-and-applicability` and
`pax-bureau-coverage_same-release-hosted-journeys`.

The task spec defines the second key on line 17. The spec file is a
machine-local, untracked `.local/` artifact at
`.local/passenger-bureau-gap-correction-20261018/PAX-BUREAU-JOURNEY-COVERAGE-20261018.md`.
Gemini2 quoted line 17 in the `2026-10-25T13:06:53Z` reopen:
"Root 統一部署後在同版本走適用的共享操作，保留新戶／原單／實際
UI／原圖與 pass／fail／未執行，逐項回填原16案例". In English: after the
unified Root deploy, walk the applicable shared operations on that same
version, then backfill the original 16 UC cases. Each case keeps its new
account, original order, real UI, real screenshots and a
pass/fail/not-run status.

### Why owner's `done` claim was correctly reopened, not a new defect

1. The UC11 payment-status-sync defect went through two legitimate fix/reopen
   rounds:
   - `3813d268e` (gen `eb8340f1`) was reopened for stale retry feedback.
   - `86df25c6a` (gen `d1b3b34d`, PR #3001) was approved, then reopened again
     because it treated `captured` as a terminal state and missed the
     `captured→refunded` sync.
   - `5e0daca26` (gen `e5ac9fb2`) was approved by Gemini2 at
     `2026-10-25T12:03:11Z` with hosted CI `40190775873` / `40190775827`
     green. PR #3001 was squash-merged to `dev` as
     `2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901` (committed
     `2026-10-25T12:28:40Z`).
2. Owner recorded acceptance evidence for both required-acceptance keys at
   `2026-10-25T12:51:25Z`. The evidence cited that same-SHA CI and the merge
   being an `origin/dev` ancestor, and the task auto-transitioned to `done`.
3. Gemini2's `2026-10-25T13:06:53Z` reopen is a bounded runtime-evidence
   correction, not a new finding and not a request for new source code:
   - The **first** acceptance key and the Source fix are explicitly
     retained, with no rework needed.
   - The correction is narrow. At review time, the last successful shared-dev
     deploy (`deploy-dev` run `40176220695`, head
     `a852615e5737b8bb47f90a95c0e1a1ae872c8cec`, `2026-10-25T08:20:25Z`)
     predated the merge. Shared dev was therefore still serving a SHA without
     the fix. Re-verified: `2a7ccb31` is **not** an ancestor of `a852615e`.
   - `ai_status.py` has no `done → acceptance` downgrade command.
     `record-acceptance` and `request-acceptance-review` both require
     `status == 'acceptance'`, and `reconcile-candidate` is a no-op once
     `status == 'done'`.
   - So `reopen` by the assigned reviewer was the only lifecycle-legal way to
     correct a premature `done` claim without hand-editing machine truth.
4. Owner's `2026-10-25T13:10:01Z` `blocker` correctly reflected "I cannot
   produce this evidence yet." It names only the reviewer lane, though,
   instead of the real gating condition. (`blocker`'s third argument
   requires a known lane agent.) That condition has since changed (below).

### Current live state (re-verified 2026-10-26, after run `40325789456` ended)

**1. The fix is in `dev`.** `git merge-base --is-ancestor
2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901
0e7243c5cb13aad82941d1567ef1813c185c586e` exits `0`. The UC11 fix merge is an
ancestor of the current `dev` head `0e7243c5`. It is also an ancestor of every
`deploy-dev` head since run `40242519016` (`2755ce2e`,
`2026-10-25T22:57:00Z`).

**2. CI and publish on `0e7243c5` are green.**
- CI (integration trunk) run `40322481968`: `success`.
- Nightly publish (cut snapshot) run `40325746488`, dispatched
  `2026-10-26T12:51:19Z`: `success`. It cut `publish/v2026.10.26.4`, and that
  push triggered `deploy-dev` run `40325789456` at `2026-10-26T12:51:39Z`.

These are two different runs in one chain, publish then deploy, not two IDs
for the same execution. The Supervisor's `2026-10-26T12:51:45Z` note cites
`40325746488`, which is the publish run.

**3. `deploy-dev` since the UC11 merge: the red runs are not undeployed runs.**
`deploy-dev.yml`'s own `Deploy outcome` job defines `deployed=yes` as "the
`Deploy services` job succeeded". The red runs below failed on checks that run
after the deploy.

| Run | Head | Started (UTC) | Deploy services | First failing stage |
| --- | --- | --- | --- | --- |
| `40242519016` | `2755ce2e` | 10-25 22:57 | success | Dev health check (`Verify agency portal endpoints`) |
| `40251649137` | `d3d6ce62` | 10-26 00:55 | (not re-read) | failure |
| `40276824861` | `50387a6a` | 10-26 05:54 | (not re-read) | failure |
| `40288800229` | `680bd563` | 10-26 07:55 | (not re-read) | failure |
| `40310500957` | `9a0a4a69` | 10-26 10:50 | success | Candidate SHA quote-expiry and operational acceptance |
| `40325789456` | `0e7243c5` | 10-26 12:51 | success (13:04:22Z) | Candidate SHA quote-expiry and operational acceptance |

Run `40325789456` is the latest `deploy-dev` run, so **shared dev is serving
`0e7243c5`, which contains the UC11 fix.** "Root 統一部署後同版本" is
therefore already satisfiable. The earlier premise of this document, a deploy
still `in_progress` that might not land, no longer holds.

**4. In run `40325789456`, everything that does not need Ops rehearsal supply
passed:**
- Prepare, all 12 image builds, DB migration, Deploy services, the paused
  Partner Booking enforcement, the health check and the retired-service
  cleanup.
- `operational-candidate.spec.ts`: 14/14.
- `operational-browser-acceptance.spec.ts`: 16/16.

**5. The real blocker is a shared-dev runtime defect, reproduced on two
consecutive deployed candidates.** Both PAX shared-order journeys fail at the
same Ops step, the original Ops page button `準備虛構演練車司` (prepare the
synthetic rehearsal driver/vehicle supply):
- `tests/e2e/pax-review-shared-order-demo.spec.ts` ("three new PG orders
  travel through real Passenger, Ops and Driver UIs, including retry/case,
  cancellation and exception controls"), step `Ops prepare real persisted
  rehearsal supply`.
- `tests/e2e/pax-real-quote-expiry.spec.ts` ("a real fifteen-minute quote
  expires without booking, then requotes and cancels one real order"), step
  `Prepare existing synthetic external supply through the original Ops page`.
- Error, identical on both candidates: `Ops prepare status=400
  code=VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT reason=unclassified`.
- Trace ids:
  - `9a0a4a69` (run `40310500957`), quote-expiry:
    `b2d371df-0ab2-4b7d-8e64-a8a1d809eee8`.
  - `0e7243c5` (run `40325789456`), quote-expiry:
    `0ab2416e-13a2-41c4-b80a-ab74c59926c6`.
  - `0e7243c5` (run `40325789456`), shared-order:
    `c92f9536-259b-4a7f-80b7-eda1e9c740da`.
- The public error code only became visible after
  `PAX-OPS-PREPARE-ERROR-DIAGNOSTIC-20261026` (PR #3049, merge `c821bb07`)
  added the safe Ops prepare diagnostic. That task surfaced the code but did
  not fix the rejection.
- The code is produced by the vehicle-eligibility module
  (`apps/api/src/modules/vehicle-eligibility/`) and mapped in
  `owned-mobility.service.ts`.

**6. Why this defect blocks the parent.** These are the same shared Passenger
→ Ops → Driver operations that the parent's "適用的共享操作" walkthrough relies
on. Every UC case that needs a dispatched real order cannot get past Ops
supply preparation on shared dev until the rejection is fixed.

## Canonical sources consulted

1. `.local/passenger-bureau-gap-correction-20261018/PAX-BUREAU-JOURNEY-COVERAGE-20261018.md`
   (machine-local, untracked). Line 17 is the second acceptance key
   definition, quoted by Gemini2.
2. `ai-status.json` task slice for `PAX-BUREAU-JOURNEY-COVERAGE-20261018`
   (`worker_outcomes`, `blockers`, `required_acceptance`). Machine-local.
3. `ai-activity-log.jsonl` entries for `PAX-BUREAU-JOURNEY-COVERAGE-20261018`,
   `2026-10-25T10:47:36Z` through `2026-10-26T12:52:52Z`. Machine-local; not
   re-readable from the cloud re-verification pass.
4. `deploy-dev.yml` workflow run list and per-job results for runs
   `40242519016`, `40310500957` and `40325789456`, plus failed-job logs for
   `40310500957` and `40325789456`.
5. CI (integration trunk) run `40322481968` and Nightly publish run
   `40325746488`.
6. `.github/workflows/deploy-dev.yml`: the `operational-candidate-acceptance`,
   `operational-quote-expiry-acceptance` and `outcome` jobs (the
   `deployed=yes` semantics).
7. `docs/ops/branch-strategy.md` §4 (Workflows) and §5 (Promotion gates):
   the nightly publish → `publish/*` → `deploy-dev` chain.
8. `AGENTS.md`: the VM restriction and the authorized-workflow-only shared-dev
   deploy rule.

## Decision

`PAX-BUREAU-JOURNEY-COVERAGE-20261018` needs **no new product or contract
decision** and **no scope cut**:

- The bar for `pax-bureau-coverage_same-release-hosted-journeys` is already
  specified correctly in the task spec, and Gemini2's reopen enforced it
  correctly. The bar is a live, same-version, screenshot-backed backfill of
  the 16 UC cases with pass/fail/not-run kept per case.
- The deploy precondition is now met: Cloud Run serves `0e7243c5`, a
  descendant of `2a7ccb31`.
- The remaining blocker is an engineering/runtime defect: shared-dev Ops
  rehearsal supply is rejected with `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`.
  It is not a planning gap.

This is a routing gap, not a missing decision. That is consistent with the
`SR-PROOF-001-UNBLOCK-PLANNING-DECISION` precedent for this task class.

The rejection is still `reason=unclassified`, and its root cause is not yet
diagnosed. There are two possibilities:
- **Seed/fixture mismatch or code regression.** If root-causing shows a
  rehearsal-vehicle seed mismatch or a code regression, it is pure
  engineering.
- **Contract question.** Root-causing might instead show that the current
  service-product applicability contract *intentionally* excludes the
  synthetic rehearsal vehicle. Then whether the rehearsal supply should be
  eligible becomes a product/contract question. That question belongs to the
  fix task's owner and the planning lane at that time. This helper does not
  pre-decide it.

## Scope cut and routing

Out of scope for this helper task:

1. Triggering, retrying or otherwise operating `deploy-dev.yml` or any other
   deploy/publish workflow. This is forbidden from the VM, and no re-deploy is
   needed anyway.
2. Re-reviewing or redoing the UC11 Source fix (`5e0daca26`, PR #3001,
   squash-merged as `2a7ccb31`). It is already approved on hosted CI, and
   Gemini2's reopen did not request rework.
3. Performing the actual 16-case live walkthrough/backfill. That is the parent
   owner's job.
4. Root-causing or fixing the `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`
   rehearsal-supply rejection. This is routed to a separate engineering task
   (see next step 2). It is not folded into the parent and not handled here.
5. The agency portal health-check failure in run `40242519016`. It is
   unrelated to the passenger journeys and was not repeated in the later
   runs that were re-read.

## Parent unblocked next step

The parent should stay `blocked`, but against the real condition instead of
the terse `"Gemini2"` summary. Its `waiting_for` should name the
engineering/owner lane, not the reviewer.

1. Treat as settled, with no further review or rework from Gemini2 on the
   code:
   - the UC11 Source fix;
   - the first acceptance key
     (`pax-bureau-coverage_each-finding-real-evidence-and-applicability`).
2. Route the shared-dev Ops rehearsal-supply rejection to one engineering
   task. That task can be a follow-up of
   `PAX-OPS-PREPARE-ERROR-DIAGNOSTIC-20261026` or a new task, whichever the
   Supervisor/planning lane already has open. Do not create a second
   planning-decision helper. The task:
   - starts from the three trace ids above and the
     `apps/api/src/modules/vehicle-eligibility/` evaluator path;
   - defines green as `operational-candidate-acceptance` and
     `operational-quote-expiry-acceptance` passing in a `deploy-dev` run;
   - escalates to planning only if root-causing shows the exclusion is
     intended by contract (see Decision).
3. Once a `deploy-dev` run shows both PAX shared-order journeys green on a
   SHA descending from `2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901`, owner
   Claude does the same-version walkthrough:
   - Pin the walkthrough to that one candidate SHA. Confirm the served SHA via
     the API `/api/health` `candidateSha` before and after the walkthrough,
     because a later nightly deploy can replace it mid-walk.
   - Walk the 16 UC cases with a new account, original order, real UI, real
     screenshots and a pass/fail/not-run status for each case.
   - Record the result against
     `pax-bureau-coverage_same-release-hosted-journeys` and hand off to
     Gemini2, citing only that runtime evidence. A new Source candidate is
     needed only if the live run surfaces an actual regression.
4. Optional: the owner may start the walkthrough now, on the currently served
   `0e7243c5`, without waiting for step 2. The spec explicitly allows a
   per-case `fail` / `未執行`. In that case:
   - Run every case that does not need Ops rehearsal supply.
   - Record each dispatch-dependent case as `fail` / `未執行`, with the
     `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` trace id as evidence.

   Whether a backfill with such recorded failures satisfies the key is
   Gemini2's acceptance judgment, not this helper's. The recommended path is
   to finish step 2 first, so the backfill is not redone.

## Acceptance mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as no decision needed. The same-release hosted-journey bar is already correctly specified and enforced. The live blocker is routed as an engineering defect (Ops rehearsal-supply `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`), with an explicit escalation condition if it proves contractual. |
| Record the decision | Recorded here: no new product or contract decision is required for `PAX-BUREAU-JOURNEY-COVERAGE-20261018`. |
| Scope cut | Recorded in "Scope cut and routing". This helper does not deploy, does not re-review the Source fix, does not perform the backfill and does not fix the eligibility defect. |
| Or explicit follow-up needed by the parent task | Recorded in "Parent unblocked next step": fix the rehearsal-supply rejection in one engineering task, then the owner does a pinned same-SHA 16-case backfill. |
| Produce task-scoped commit/push/PR evidence for any canonical change | This file is committed and pushed on `claude2/pax-bureau-journey-coverage-20261018-unblock-planning-decision`. |
| Update the parent task with the concrete unblocked next step | To be recorded on `PAX-BUREAU-JOURNEY-COVERAGE-20261018` via `ai-status.sh note` referencing this file. This is a machine-local board action, outside this branch. |

## Verification basis

- Read-only re-verification on 2026-10-26, after run `40325789456`
  completed:
  - `deploy-dev.yml` run list (runs 607–614).
  - Per-job conclusions for runs `40242519016`, `40310500957` and
    `40325789456`.
  - Failed-job logs: `121589819371`, `121589819458` and `121539506722`.
  - CI run `40322481968` and Nightly publish run `40325746488`.
- `git merge-base --is-ancestor 2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901 X`:
  exit `0` for `0e7243c5`, `d3d6ce62` and `2755ce2e`; exit `1` for
  `a852615e`.
- `ai-status.json` / `ai-activity-log.jsonl` task history for
  `PAX-BUREAU-JOURNEY-COVERAGE-20261018`. The worker outcomes run from
  `gemini2-20261025T104100Z-7d40a003` through
  `claude-20261025T130655Z-1d2818a6`, and the Supervisor notes run through
  `2026-10-26T12:52:52Z`. These were read on the local machine for the
  initial draft and are not re-readable from the cloud pass.
- No product runtime, browser, payment, deploy, workflow or cloud-credential
  action was executed by this helper. Only read-only `git` and GitHub Actions
  metadata/log reads were used.
