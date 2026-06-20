# REP-BE-001 Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `REP-BE-001` — Daily dispatch record builder + `reporting.dispatch_daily_records`  
**Sidecar Task:** `REP-BE-001-SIDECAR-ACCEPTANCE`  
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`  
**Parent Owner / Reviewer At Snapshot:** `Codex` / `Claude`  
**Packet Date:** `2026-06-20` (UTC)  
**Status Snapshot:** `review_approved` for this sidecar as of `2026-06-20T05:26:49Z`; support-only artifact, no canonical truth or runtime implementation changes

This packet converts the current machine-truth brief for `REP-BE-001` into a reviewer-facing acceptance checklist and dependency map. It is limited to support material. The canonical implementation under review is parent closeout commit `0fd0c710c69149e64d1530ba9f3d906680f3d166` (`REP-BE-001: build dispatch daily records from event history`), while upstream dependency `P1D-WP0` is already recorded as `done` on `origin/dev` at `43a34659572402b8b5aeafc58a1312c9d3afe1d1`.

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar from machine truth as a concrete checklist
- map the formal dependency on `P1D-WP0` and the practical code-surface dependencies inside parent commit `0fd0c710c`
- freeze reviewer evidence anchors for builder logic, persistence path, migration, contract baseline, and integration test
- note the current delivery gate: parent remains `in_progress` because machine truth says `0fd0c710c` is pushed but not yet merged to `origin/dev`

Out of scope:

- editing L1/L2 canonical truth, parent implementation, or task-board topology
- re-approving or closing the parent task from this sidecar
- asserting `done` for the parent without the merge evidence already called out in machine truth

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

`REP-BE-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`review_approved`
- depends_on=`[P1D-WP0]`
- helper_parent=`REP-BE-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/REP-BE-001/REP-BE-001-SIDECAR-ACCEPTANCE.md`
- latest approval wording matches the machine-truth `next` field captured at `2026-06-20T05:26:49Z`

### 2.2 Parent task

`REP-BE-001`

- owner=`Codex`
- reviewer=`Claude`
- status=`in_progress`
- depends_on=`[P1D-WP0]`
- acceptance=`Daily records rebuilt from real events; one row per order; arrival rule honored; INT-REP-001 passes`
- current `next` state: closeout commit `0fd0c710c69149e64d1530ba9f3d906680f3d166` is already pushed on `origin/codex/rep-be-001`, prior verification was green, but machine truth still says `origin/dev` does not contain that commit, so parent `done` must wait for `INTEGRATION_STATUS=merged_to_dev` or higher evidence

### 2.3 Upstream dependency

`P1D-WP0`

- status=`done`
- commit_hash=`43a34659572402b8b5aeafc58a1312c9d3afe1d1`
- commit_subject=`P1D-WP0: supply/eligibility/telemetry/reporting contracts + migration skeleton + module scaffolds (#791)`
- push_ref=`origin/dev`
- reviewer implication: reporting contracts, migration skeletons, and module scaffolds already exist on trunk, so `REP-BE-001` is expected to fill in behavior rather than redefine the reporting surface

## 3. Dependency Map

### 3.1 Formal dependency

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `P1D-WP0` | `done` | Provides `DispatchDailyRecord` contract export, reporting table skeleton, and reporting module scaffold that `REP-BE-001` extends with real event-history rebuild logic and durable quality flags. |

### 3.2 Canonical/spec anchors for the parent acceptance bar

| Source | Anchor | Why it matters |
| --- | --- | --- |
| `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md` | §4.10 `reporting.dispatch_daily_records` | Defines the reporting table shape and one-row-per-order primary key `(service_date, order_id)`. |
| `docs/02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md` | §7.3 到場時間來源 | States `arrivedPickupAt` only comes from an arrived event, otherwise keep `null` and emit `ARRIVAL_EVENT_MISSING`. |
| `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md` | §11.2 `INT-REP-001` | Declares `INT-REP-001 daily record joins dispatch/task data` as the integration gate. |
| `packages/contracts/src/phase1-delta-supply-eligibility.ts` | `DispatchDailyRecord` export | Confirms the parent builds on the upstream contract surface already landed by `P1D-WP0`. |

### 3.3 Parent commit surfaces under review

| Surface | Evidence anchor | Reviewer focus |
| --- | --- | --- |
| Builder service | `0fd0c710c:apps/api/src/modules/reporting/dispatch-daily-record-builder.service.ts` | One row per order, service-date filter, event-history joins, final-assignment selection, redispatch count, complaint count, arrival rule. |
| Reporting repository | `0fd0c710c:apps/api/src/modules/reporting/reporting.repository.ts` | Reads from owned-order / dispatch / driver-task / complaint / vehicle tables and upserts `reporting.dispatch_daily_records` by `(service_date, order_id)`. |
| Reporting module wiring | `0fd0c710c:apps/api/src/modules/reporting/reporting.module.ts`, `0fd0c710c:apps/api/src/app.module.ts` | Builder service is registered and exported through the app module. |
| Migration | `0fd0c710c:infra/migrations/V0035__reporting_dispatch_daily_record_quality_flags.sql` | Adds durable `quality_flags` storage needed for `ARRIVAL_EVENT_MISSING`. |
| Integration test | `0fd0c710c:apps/api/tests/integration/int-rep-001-daily-dispatch-record-builder.test.ts` | Proves the arrival-null rule, redispatch count, complaint count, and persistence payload. |

### 3.4 Delivery-state dependency

| Dependency | Status | Reviewer implication |
| --- | --- | --- |
| Parent closeout merge check | `pending` | Parent cannot move from `in_progress` to `done` until the owner can prove the closeout commit is safely integrated with the correct `INTEGRATION_STATUS`. |

## 4. Parent Acceptance Checklist

Source: `REP-BE-001.acceptance` in machine truth, parent closeout commit metadata, and the SD/SA anchors above.

### AC-1: Daily records are rebuilt from real events

| Check | Evidence | Status |
| --- | --- | --- |
| Builder loads source state from owned orders, dispatch jobs, assignments, driver tasks, trace logs, complaints, and vehicles | `reporting.repository.ts:32-134` in commit `0fd0c710c` | PASS |
| Builder filters by `serviceDate` and emits a row per order in that date slice | `dispatch-daily-record-builder.service.ts:66-78` and `:132-135` in commit `0fd0c710c` | PASS |
| `firstDispatchAt` is derived from dispatch job / dispatch trace history, not synthetic state | `dispatch-daily-record-builder.service.ts:80-86` and `:165-188` in commit `0fd0c710c` | PASS |
| Final assignment / driver / vehicle fields come from the final non-rejected assignment and matching task/vehicle records | `dispatch-daily-record-builder.service.ts:87-129` and `:190-197` in commit `0fd0c710c` | PASS |
| Redispatch and complaint counts are computed from trace history and complaint cases | `dispatch-daily-record-builder.service.ts:37-44` and `:153-158` in commit `0fd0c710c` | PASS |

### AC-2: One row per order is persisted into `reporting.dispatch_daily_records`

| Check | Evidence | Status |
| --- | --- | --- |
| Upsert target is `reporting.dispatch_daily_records` | `reporting.repository.ts:141-193` in commit `0fd0c710c` | PASS |
| Conflict key is `(service_date, order_id)` to preserve one-row-per-order semantics | `reporting.repository.ts:194-219` in commit `0fd0c710c`; SD §4.10 table primary key | PASS |
| Persisted columns include dispatch timing, final assignment, complaint count, and quality flags | `reporting.repository.ts:145-192` in commit `0fd0c710c` | PASS |

### AC-3: Arrival rule is honored

| Check | Evidence | Status |
| --- | --- | --- |
| `arrivedPickupAt` is only kept when an explicit `driver.arrived_pickup` trace exists for the final task | `dispatch-daily-record-builder.service.ts:92-117` in commit `0fd0c710c`; SA §7.3 | PASS |
| Missing arrival event adds `ARRIVAL_EVENT_MISSING` instead of inferring arrival from later transitions | `dispatch-daily-record-builder.service.ts:119-121` and `V0035__reporting_dispatch_daily_record_quality_flags.sql:1-9` in commit `0fd0c710c`; SA §7.3 | PASS |
| Integration test fixes the regression bar: `arrivedPickupAt` remains `null` while `tripStartedAt`/`tripCompletedAt` still populate | `int-rep-001-daily-dispatch-record-builder.test.ts:367-406` in commit `0fd0c710c` | PASS |

### AC-4: `INT-REP-001` exists and matches the intended behavior

| Check | Evidence | Status |
| --- | --- | --- |
| Test fixture includes two assignments, final completed task, redispatch trace, and no `driver.arrived_pickup` trace for the final task | `int-rep-001-daily-dispatch-record-builder.test.ts:7-361` in commit `0fd0c710c` | PASS |
| Test asserts one row, final driver/vehicle selection, redispatch count `1`, complaint count `2`, and `qualityFlags=[\"ARRIVAL_EVENT_MISSING\"]` | `int-rep-001-daily-dispatch-record-builder.test.ts:367-406` in commit `0fd0c710c` | PASS |
| Parent commit records executable verification commands for typecheck and `INT-REP-001` | commit message for `0fd0c710c` | PASS |

## 5. Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| E-1 | Parent machine-truth snapshot | `AI_NAME=Codex scripts/ai-status.sh show REP-BE-001` on `2026-06-20` |
| E-2 | Dependency machine-truth snapshot | `AI_NAME=Codex scripts/ai-status.sh show P1D-WP0` on `2026-06-20` |
| E-3 | Parent closeout commit metadata | `git show --stat --summary 0fd0c710c69149e64d1530ba9f3d906680f3d166` |
| E-4 | Upstream contract export | `packages/contracts/src/phase1-delta-supply-eligibility.ts:294-327` |
| E-5 | SD table spec | `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md:1040-1069` |
| E-6 | SA arrival rule | `docs/02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md:1175-1180` |
| E-7 | SD integration test gate | `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md:1626-1633` |
| E-8 | Builder implementation | `0fd0c710c:apps/api/src/modules/reporting/dispatch-daily-record-builder.service.ts` |
| E-9 | Repository load/upsert path | `0fd0c710c:apps/api/src/modules/reporting/reporting.repository.ts` |
| E-10 | Reporting module wiring | `0fd0c710c:apps/api/src/modules/reporting/reporting.module.ts` |
| E-11 | App-module registration | `0fd0c710c:apps/api/src/app.module.ts` |
| E-12 | Quality-flag migration | `0fd0c710c:infra/migrations/V0035__reporting_dispatch_daily_record_quality_flags.sql` |
| E-13 | Integration test | `0fd0c710c:apps/api/tests/integration/int-rep-001-daily-dispatch-record-builder.test.ts` |

## 6. Packet Completeness Check

- [x] Sidecar scope stays support-only and does not modify canonical truth or parent runtime code.
- [x] Formal dependency map matches machine truth: `depends_on=[P1D-WP0]`.
- [x] Upstream dependency is pinned to the actual `done` commit on `origin/dev`.
- [x] Parent acceptance framing is tied to both machine truth and SD/SA source anchors.
- [x] Reviewer evidence is pinned to parent closeout commit `0fd0c710c`.
- [x] Parent integration gate is preserved: this packet does not overstate parent merge status.

## 7. Reviewer Focus

`Codex2` should verify these points first:

1. The packet stays support-only and does not pretend to approve or close the parent task.
2. The arrival rule is evidence-backed: `arrivedPickupAt` must remain `null` without a `driver.arrived_pickup` trace, even if later trip events exist.
3. One-row-per-order semantics are anchored in the upsert key, not just implied by the builder loop.
4. The packet correctly distinguishes the shipped upstream scaffold (`P1D-WP0` on `origin/dev`) from the parent behavioral implementation (`0fd0c710c` on `origin/codex/rep-be-001`).
5. Parent closeout is still blocked on merge reconciliation, so this sidecar should move to review independently of parent `done`.

**Suggested approval wording:**

> `REP-BE-001 acceptance packet ready: it preserves the formal P1D-WP0 dependency now landed on origin/dev, pins parent review to closeout commit 0fd0c710c, correctly frames one-row-per-order persistence plus the SA arrival-null rule with ARRIVAL_EVENT_MISSING, and stays within support-only sidecar boundaries without mutating canonical truth.`

## 8. Handoff Commands

Owner handoff to reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff REP-BE-001-SIDECAR-ACCEPTANCE Codex2 "REP-BE-001 acceptance packet ready at support/sidecars/REP-BE-001/REP-BE-001-SIDECAR-ACCEPTANCE.md. It preserves the formal P1D-WP0 dependency now landed on origin/dev, pins parent review to closeout commit 0fd0c710c, frames one-row-per-order persistence plus the SA arrival-null rule with ARRIVAL_EVENT_MISSING, and stays support-only without changing canonical truth or parent runtime."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve REP-BE-001-SIDECAR-ACCEPTANCE "REP-BE-001 acceptance packet ready: it preserves the formal P1D-WP0 dependency now landed on origin/dev, pins parent review to closeout commit 0fd0c710c, correctly frames one-row-per-order persistence plus the SA arrival-null rule with ARRIVAL_EVENT_MISSING, and stays within support-only sidecar boundaries without mutating canonical truth."
```

## 9. Sidecar Verification

This pass changes only `support/sidecars/REP-BE-001/REP-BE-001-SIDECAR-ACCEPTANCE.md`.

Verification performed for the sidecar artifact:

- `AI_NAME=Codex scripts/ai-status.sh show REP-BE-001`
- `AI_NAME=Codex scripts/ai-status.sh show P1D-WP0`
- `git show --stat --summary 0fd0c710c69149e64d1530ba9f3d906680f3d166`
- source/spec anchor review against the SD/SA documents, `packages/contracts/src/phase1-delta-supply-eligibility.ts`, and parent commit files

No runtime checks were run for this sidecar itself because it is support-only and does not change executable behavior.

## 10. Change Log

- `2026-06-20` — refreshed the sidecar status snapshot for owner closeout so the packet now matches machine truth at `review_approved` and records that the approval wording in `next` is the active reviewer-facing conclusion.
- `2026-06-20` — refreshed the acceptance packet to align with the current shared machine truth after review failure: formal dependency pinned to `P1D-WP0` on `origin/dev`, parent review pinned to commit `0fd0c710c`, SD/SA source anchors added for table shape and arrival-null rule, and reviewer handoff wording updated so the packet can be re-submitted with concrete evidence.
