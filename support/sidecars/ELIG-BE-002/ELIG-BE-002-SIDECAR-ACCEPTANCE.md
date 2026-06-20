# ELIG-BE-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `ELIG-BE-002` — exact service product propagation across order / dispatch / task  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Claude2`  
**Parent Owner / Reviewer (machine-truth snapshot):** `Codex` / `Codex2`  
**Generated:** `2026-06-20` (UTC)  
**Snapshot Status:** parent `ELIG-BE-002` is already `done` in machine truth as of `2026-06-20T05:17:21Z`, with closeout commit `a4ab66bad89cffbeecf7406f7505a75726421ef6` (`closeout(ELIG-BE-002): finalize exact service product propagation`) and `integration_status=merged_to_dev`. This sidecar is support-only and does not reopen or mutate the parent slice.

This packet exists so a reviewer or downstream owner can quickly re-verify what `ELIG-BE-002` closed: exact service-product identity and eligibility-policy version are preserved through booking/order creation, dispatch-job creation, assignment creation, and driver-task materialization, without broad-bucket downgrade or silent fallback to guessed `business_dispatch` semantics.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar from machine truth as a reviewer checklist
- pin the formal upstream dependency `P1D-WP0`
- summarize the design and persistence anchors from the 2026-06-19 Phase 1 delta spec
- point to the concrete code and test anchors landed by the parent closeout commit
- provide reviewer / consumer handoff wording for this sidecar helper task

Out of scope:

- editing canonical product truth
- changing runtime behavior under `apps/api`
- re-litigating the parent task's closeout, commit, push, or merged-to-dev status
- inventing new dependencies beyond machine truth

---

## 2. Machine-Truth Anchors

### 2.1 Sidecar task

`ai-status.json -> ELIG-BE-002-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Claude2`
- status=`in_progress` at packet generation time
- depends_on=`[P1D-WP0]`
- artifacts=`support/sidecars/ELIG-BE-002/ELIG-BE-002-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 2.2 Parent task

`ai-status.json -> ELIG-BE-002`

- status=`done`
- owner=`Codex`
- reviewer=`Codex2`
- depends_on=`[P1D-WP0]`
- acceptance=`Exact product persists end-to-end; no broad-bucket downgrade; unit tests pass; pnpm --filter @drts/api typecheck + test pass`
- commit_hash=`a4ab66bad89cffbeecf7406f7505a75726421ef6`
- push_ref=`origin/codex/elig-be-002`
- integration_status=`merged_to_dev`
- merged_ref=`origin/dev`

### 2.3 Formal upstream dependency

`ai-status.json -> P1D-WP0`

- status=`done`
- owner=`Claude`
- reviewer=`Codex`
- commit_hash=`43a34659572402b8b5aeafc58a1312c9d3afe1d1`
- push_ref=`origin/dev`
- why it matters: this slice established the contracts, scaffolds, and migration baseline for `ExactServiceProductContext`, `RuntimeEligibilityDecisionRecord`, and the `ops.phase1_*` exact-product columns that `ELIG-BE-002` then had to materialize end-to-end

---

## 3. Canonical Design Anchors

### 3.1 Delta spec

`docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`

- §2.7 defines `ExactServiceProductContext` with `serviceProductId`, `serviceProductCode`, `serviceProductVersion`, `serviceBucket`, and source-resolution metadata.
- §2.7 explicitly extends this context into `CreateTenantBookingCommand`, `OwnedOrderRecord`, `DispatchJobRecord`, `DispatchCandidateRecord`, `AssignmentRecord`, `DriverTaskRecord`, and `SettlementTripRecord`.
- §4.7 requires exact-product persistence columns on order / dispatch / task records, with the guardrail that actual ALTER targets must align to the repo's existing runtime table names.
- §5.3 keeps mobile offline queuing separate from exact-product truth; `ELIG-BE-002` is about preserving resolved product identity, not redesigning mobile queue semantics.

### 3.2 Migration baseline from dependency

`infra/migrations/V0034__phase1_delta_supply_eligibility_mobile_reporting.sql`

- comment lines 13-16 state the SD §4.7 intent but align the actual runtime tables to `ops.phase1_owned_orders`, `ops.phase1_dispatch_jobs`, and `ops.phase1_driver_tasks`
- lines 202-218 add `service_product_id`, `service_product_code`, `service_product_version`, and `eligibility_policy_version` to those three runtime tables

This means the parent task did not need a new table family. It needed to propagate the exact-product fields through existing owned-mobility runtime records without semantic downgrade.

---

## 4. Parent Implementation Anchors

All file/line anchors in this section refer to parent closeout commit `a4ab66bad89cffbeecf7406f7505a75726421ef6`.

### 4.1 Booking / order creation

`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`

- lines 301-315: app-origin order creation stamps `serviceProductId`, `serviceProductCode`, `serviceProductVersion`, and `eligibilityPolicyVersion` directly from `exactProduct`
- lines 620-635: tenant booking creation does the same for portal-created business-dispatch orders

### 4.2 Dispatch job propagation

`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`

- lines 1527-1533: `DispatchJobRecord` copies all four exact-product fields from the order before candidate / attempt state is derived

### 4.3 Assignment and driver-task propagation

`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`

- lines 2628-2643: `DispatchAssignmentRecord` carries forward the exact-product fields from `dispatchJob` and falls back to `order` if needed
- lines 2654-2662: `DriverTaskRecord` copies the exact-product fields from the assignment, preserving the same identity all the way to driver work execution

### 4.4 Contract-surface propagation

`packages/contracts/src/index.ts`

- lines 2348-2351 add the four exact-product fields to `OwnedOrderRecord`
- lines 2534-2556 add them to `DispatchCandidate` and `DispatchJobRecord`
- lines 2641-2644 and 2671-2674 add them to `DispatchAssignmentRecord` and `DriverTaskRecord`

### 4.5 Repository persistence anchors

`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`

- write paths at lines 249-252, 295-298, and 421-424 persist the exact-product fields for order, dispatch job, and driver task records respectively

---

## 5. Acceptance Checklist For Reviewers

This checklist restates the parent machine-truth acceptance without changing it.

### AC-1: exact product persists end-to-end

- [x] `ExactServiceProductContext` is defined in the dependency baseline (`P1D-WP0`) and named in the delta spec §2.7.
- [x] Order creation writes the exact-product fields from `exactProduct` (`owned-mobility.service.ts:301-315`, `620-635` at parent closeout commit).
- [x] Dispatch jobs copy the same four fields from the order (`owned-mobility.service.ts:1527-1533`).
- [x] Assignments and driver tasks preserve the same four fields (`owned-mobility.service.ts:2628-2662`).
- [x] Persistence exists for order / dispatch job / driver task write paths (`owned-mobility.repository.ts:249-252`, `295-298`, `421-424` at parent closeout commit).

### AC-2: no broad-bucket downgrade

- [x] The parent flow preserves exact `serviceProductCode` / `serviceProductVersion` / `eligibilityPolicyVersion`; it does not collapse back to the broad `serviceBucket` as the only runtime truth.
- [x] The migration and contract surface carry exact-product columns on the existing `ops.phase1_*` runtime tables and records.
- [x] The task summary in machine truth explicitly forbids guessing or silent downgrade and sends unresolved mappings to `manual_review`.

### AC-3: unit tests pass

- [x] `apps/api/tests/unit/owned-mobility.service.test.ts:343-381` asserts that the same exact-product values appear on the order, booking record, dispatch job, candidate, assignment, and task.
- [x] The task closeout recorded `pnpm --filter @drts/api test` passing with 69 files / 595 tests.

### AC-4: typecheck + test verification recorded

- [x] Parent closeout commit message records `pnpm --filter @drts/api typecheck && pnpm --filter @drts/api test`.
- [x] Parent machine truth records that both commands passed before finalize.

---

## 6. Dependency Map

### 6.1 Formal upstream dependency

| Dependency | Status | Commit | Role |
| --- | --- | --- | --- |
| `P1D-WP0` | `done` | `43a34659572402b8b5aeafc58a1312c9d3afe1d1` | Established contracts, scaffolds, and migration skeleton for exact-product context and persistence columns. |

### 6.2 Parent-closeout anchor

| Task | Status | Commit | Role |
| --- | --- | --- | --- |
| `ELIG-BE-002` | `done` | `a4ab66bad89cffbeecf7406f7505a75726421ef6` | Materialized exact-product propagation through owned-mobility order, dispatch, assignment, task, repository, and tests. |

### 6.3 Practical downstream consumers

- `apps/api/src/modules/owned-mobility/*` consumers now have a stable exact-product chain for assignment, task, and settlement-adjacent logic.
- Any later runtime-eligibility or reporting slice can now rely on `serviceProductId` and `eligibilityPolicyVersion` surviving dispatch creation instead of reconstructing them from broad bucket state.
- Because the parent is already `merged_to_dev`, this sidecar is informative only; it is not a release gate.

---

## 7. Reviewer Focus (`Claude2`)

Review this sidecar against the following questions:

1. Does the packet stay support-only and avoid touching canonical truth or runtime code?
2. Does it keep `P1D-WP0` as the sole formal dependency, matching machine truth?
3. Does the acceptance framing match the parent's actual closeout claim: end-to-end exact-product propagation, no broad-bucket downgrade, tests/typecheck recorded?
4. Do the file anchors point to the real propagation seam: order creation, dispatch job creation, assignment creation, driver task creation, repository persistence, and the owned-mobility unit test?
5. Does the packet avoid overstating scope by claiming new business semantics, new dependencies, or any post-merge runtime change not recorded in machine truth?

Suggested approval wording:

> `ELIG-BE-002 acceptance packet is ready: it keeps P1D-WP0 as the only formal dependency, pins the SD §2.7 / §4.7 exact-product requirements to the landed owned-mobility propagation seams, and packages reviewer-facing acceptance anchors without changing canonical truth.`

Suggested reopen wording:

> `packet needs revision: [specify dependency drift / anchor mismatch / acceptance mismatch / scope violation]`

---

## 8. Handoff Commands

Owner -> reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff ELIG-BE-002-SIDECAR-ACCEPTANCE Claude2 "ELIG-BE-002 acceptance packet is ready at support/sidecars/ELIG-BE-002/ELIG-BE-002-SIDECAR-ACCEPTANCE.md. It keeps P1D-WP0 as the sole formal dependency, anchors the exact-product propagation requirements to the landed owned-mobility service / repository / contracts / test seams, and remains support-only with no canonical-truth or runtime changes."
```

Reviewer approve:

```bash
AI_NAME=Claude2 scripts/ai-status.sh approve ELIG-BE-002-SIDECAR-ACCEPTANCE "ELIG-BE-002 acceptance packet is ready: it keeps P1D-WP0 as the only formal dependency, maps the SD exact-product requirements to the landed owned-mobility propagation seams, and stays support-only without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Claude2 scripts/ai-status.sh reopen ELIG-BE-002-SIDECAR-ACCEPTANCE "packet needs revision: [specify dependency drift / anchor mismatch / acceptance mismatch / scope violation]"
```

---

## 9. Notes For Downstream Owners

- This helper packet is retrospective: the parent task is already closed and merged to `origin/dev`.
- If a later slice observes exact-product loss, treat that as a new regression or follow-up task rather than reopening this support packet by implication.
- The packet intentionally avoids declaring any new blocker beyond machine truth. If future reporting or eligibility work depends on this chain, those dependencies should be recorded in `ai-status.json` separately.
