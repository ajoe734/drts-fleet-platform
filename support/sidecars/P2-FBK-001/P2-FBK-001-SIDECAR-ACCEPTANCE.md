# P2-FBK-001 — Acceptance Packet & Dependency Map (Sidecar Support)

> **Sidecar self-status:** `in_progress` → handoff to reviewer `Codex`
> **Task:** P2-FBK-001-SIDECAR-ACCEPTANCE · **Owner:** Claude · **Reviewer:** Codex
> **Parent:** P2-FBK-001 (owner Codex, reviewer Codex2, `review_approved`)
> **Helper kind:** `acceptance_packet` · **Mutates canonical:** no
> **Refreshed:** 2026-06-26 — re-anchored to parent owner-closeout commit `cd6c4a5f9a`
> (tree-equal to the prior `4b2f86e8f` anchor — implementation evidence below is
> unchanged) at current branch tip `d83ed7d34` (merge of `origin/dev`); parent advanced
> `review` → `review_approved`. The dev-merge **reconciled the CI/e2e harness deltas**
> (former G5 — `ci-integ.yml` / `run-e2e-hermetic.sh` now match `dev`). The prior open
> review failure (G1/G2 / AC-2) remains **closed on-branch** via the
> `SANDBOX_FALLBACK_NOT_REQUIRED` guard + negative INT-P2-008 case. The only remaining
> step to parent `done` is **merge to `dev`** (G4); `done` is gate-blocked until then.

This is a **support-only** artifact. It does **not** modify L1 canonical truth, the
phase2 contract surface, or the parent runtime implementation. It maps the acceptance
criteria for the **AV-failure human-taxi fallback**, records the present-vs-absent
implementation surface as evidence, and confirms the dependency chain is unblocked so
the parent owner/reviewer (Codex / Codex2) have a single reference for what "done"
requires.

Evidence anchors below were re-read at refresh time from:
- `origin/dev` @ `92dbd14e6` (canonical trunk; the dependency P2-GATE-001 is merged here)
- the parent fallback branch `origin/codex/p2-fbk-001`, current tip **`d83ed7d34`**
  (a merge of `origin/dev` into the branch, 04:47Z). The implementation/owner-closeout
  commit is **`cd6c4a5f9a`** ("P2-FBK-001: finalize owner closeout"), which is
  **tree-equal** to the prior `4b2f86e8f` anchor (empty diff) — so every line/symbol
  anchor in §3 is unchanged; only the diff-vs-`dev` stat shifts because `dev` moved
  under the branch. The fallback surface is **still not merged to `dev`**.
- this sidecar branch `claude/p2-fbk-001-sidecar-acceptance`, base `origin/dev`

---

## 1. Scope of P2-FBK-001

The parent task delivers the **human-taxi fallback on AV failure**: when an autonomous
vehicle cannot fulfil a sandbox trip, the system creates a Phase-1 **human-driver
fallback assignment** that **reuses the same `booking` / `order`**, revises the
passenger ETA/service status, and produces a **sandbox-exception report** — all without
breaking the SLA / billing / audit chain.

- **Canonical basis:** SD §10, flows §5, PRD hard-rules §10 (per task brief).
- **Triggers:** gate `fallback_required` and ROC `fallback-to-human` (manual).
- **Parent artifact dirs:** `apps/api/src/modules/sandbox-dispatch-gate/`,
  `apps/api/src/modules/owned-mobility/` (the implementation also touches a new
  `apps/api/src/modules/roc-operations/` controller, see §3).
- **Parent declared status:** `review_approved` (owner Codex, reviewer Codex2). Parent
  `next` note: *"Owner closeout commit `cd6c4a5f9a` is pushed to `origin/codex/p2-fbk-001`,
  but `done` is currently blocked by the integration gate until the approved branch is
  merged to `dev`; re-run `done` with `INTEGRATION_STATUS=merged_to_dev` after merge."* —
  i.e. the review is **passed**; the earlier review failure stayed **resolved on-branch**
  (see §3.3, §4 G1/G2 closed, §5 AC-2) and the only open step is merge-to-`dev` (G4).
- **Sidecar role:** prepare the acceptance checklist + dependency map so the parent's
  finalization has one reference for what "done" requires and which gap (now just G3
  durability follow-up + G4 merge-to-`dev`) remains.

---

## 2. Dependency Map

| Dependency | Provides to fallback | Status (machine truth) | Anchor evidence |
|---|---|---|---|
| **P2-GATE-001** *(declared)* | Sandbox dispatch decision + the `fallbackRequired` signal that drives the `gate_fallback_required` trigger; `findDecisionForOrder(orderId, decisionId?)` lookup the ROC service consumes | **merged to dev** (`31d3ed308`, PR #892) | `apps/api/src/modules/sandbox-dispatch-gate/` (now has controller / repository / service / types on `dev`) |
| P2-WP0 *(transitive)* | Phase2 contract foundation (`SandboxDispatchDecision`, outcomes, reason codes, ROC intervention types, audit catalog) | `merged_to_dev` (`a00a3bbd7`) | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` |
| Phase-1 owned-mobility *(transitive base)* | Booking/order records, assignment + task creation, ETA snapshot, trace/audit chain reused by the fallback path | present on `dev` | `apps/api/src/modules/owned-mobility/` (controller/service/repository/module/events) |

**Dependency verdict:** the single *declared* dependency, **P2-GATE-001, is `done` and
merged to `dev`** (`31d3ed308`/#892). P2-FBK-001 is therefore **not
dependency-blocked**. With the parent now `review_approved`, the remaining work is **not**
implementation correctness and **not** an upstream dependency wait — it is the
integration step: **merge the approved branch to `dev`** so the gate lets `done` re-run
with `INTEGRATION_STATUS=merged_to_dev` (G4).

---

## 3. Present Implementation Surface (verified evidence)

Read from the parent branch `origin/codex/p2-fbk-001` (owner-closeout commit `cd6c4a5f9a`,
tree-equal to the prior `4b2f86e8f` anchor; current tip `d83ed7d34` merges `origin/dev`).
After the dev-merge, `git diff --stat origin/dev origin/codex/p2-fbk-001` = **12 files,
+1590/−3** (was 14 files/−24 before the merge — the two CI/e2e harness files,
`.github/workflows/ci-integ.yml` and `tests/e2e/run-e2e-hermetic.sh`, now match `dev`'s
`CI-E2E-SHARD` `92dbd14e6`, so they drop out of the delta; this closes former G5). These
are the surfaces a reviewer can confirm exist; line/symbol anchors are stable at the
tree-equal closeout commit.

### 3.1 Contract additions (`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`, +47)
- `SandboxDispatchDecision.fallbackRequired: boolean` added (the gate's fallback signal).
- `ROC_INTERVENTION_TYPES` gains `"fallback_to_human"`.
- `ROC_FALLBACK_TRIGGERS = ["gate_fallback_required", "roc_manual_intervention"]`
  + `RocFallbackTrigger` type.
- `RocFallbackToHumanCommand` — request DTO (`humanVehicleId`, `humanDriverId`,
  `revisedEtaMinutes`, `reason`, optional `dispatchJobId` / `sandboxDecisionId` /
  `rocOperatorId` / `avVehicleId` / `avDriverId` / `triggeredByEventId` / `trigger`).
- `RocFallbackToHumanReport` — sandbox-exception report DTO (`reportId`,
  `interventionId`, `tripId`, `orderId`, `bookingId`, `dispatchJobId`, `trigger`,
  `sandboxDecisionId`, `previousAssignmentId`, `fallbackAssignmentId`, `fallbackTaskId`,
  `humanVehicleId`/`humanDriverId`, `revisedEtaMinutes`, hard/soft reason codes,
  `reportArtifactId`, `generatedAt`).
- `PHASE2_AUDIT_EVENT_CATALOG.roc.fallbackToHumanReported = "roc.fallback_to_human.reported"`.

### 3.2 HTTP surface (`apps/api/src/modules/roc-operations/roc-operations.controller.ts`, new)
- `@Controller("roc")` → `@Post("trips/:tripId/fallback-to-human")`
  `fallbackToHuman(...)` → `RocOperationsService.fallbackTripToHuman(...)`, wrapped in
  `toApiSuccessEnvelope`. Matches the acceptance route
  **`POST /api/roc/trips/{id}/fallback-to-human`**.
- `roc-operations.module.ts` now imports `OwnedMobilityModule`,
  `SandboxDispatchGateModule`, `AuditNotificationModule` and registers the controller.
- `RocOperationsModule` is already registered in `apps/api/src/app.module.ts` (L59/L106
  on `dev`), so the new route is wired once the module change lands.

### 3.3 Orchestration (`apps/api/src/modules/roc-operations/roc-operations.service.ts`, +387)
- `fallbackTripToHuman(tripId, command, identity, requestId)`:
  - resolves the trip's order; defaults `trigger` to `roc_manual_intervention`.
  - looks up the gate decision via `sandboxDispatchGateService.findDecisionForOrder(orderId, sandboxDecisionId)`.
  - **gate-trigger guard (two-branch, @ `cd6c4a5f9a`):** when
    `trigger === "gate_fallback_required"` —
    - if **no decision** is found → `409 ApiRequestError("SANDBOX_FALLBACK_DECISION_REQUIRED", …)`;
    - if a decision **is** found but `sandboxDecision.fallbackRequired === false` →
      `409 ApiRequestError("SANDBOX_FALLBACK_NOT_REQUIRED", …)` (detail carries
      `decisionId`, `decision`, `fallbackRequired`). This is the fix for the earlier
      open review failure: a gate decision that did not mandate fallback can no longer
      drive a human fallback (`roc-operations.service.ts` L~88–110).
  - identity guard: requires ops/ROC operator → `ROC_OPERATOR_REQUIRED`; trip id guard
    → `TRIP_ID_REQUIRED`.
  - delegates the booking/order reuse to `ownedMobilityService.fallbackTripToHuman(...)`.
  - builds the `fallback_to_human` intervention + the `RocFallbackToHumanReport`
    (`reportArtifactId = ART-<uuid>`), retains reports in-memory (`fallbackReports`).
  - emits audit records: `roc.intervention.started`, `roc.intervention.resolved` (and
    the report path uses `sandbox_exception_report` resource type / `roc_operator`
    source system).

### 3.4 Booking/order reuse (`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, +256)
- `fallbackTripToHuman(orderId, command, context)`:
  - **same order reused** (`requireOrder(orderId)`; no new booking/order created).
  - validates `revisedEtaMinutes` positive; requires a non-AV human vehicle
    (`FALLBACK_REQUIRES_HUMAN_VEHICLE`).
  - cancels the active AV assignment / task and creates the human replacement
    assignment on the **same dispatch job** (`resolveFallbackDispatchJob`,
    `findLatestActiveAssignment`); idempotency guard `HUMAN_FALLBACK_ALREADY_ACTIVE`.
  - **revised ETA written back** to the same order: `nextOrder.status = "assigned"`,
    `nextOrder.etaSnapshot = { etaMinutes: revisedEtaMinutes, … }`,
    `lastDispatchFailureReason = "roc_fallback_to_human"`.
  - **audit/trace chain preserved**: `appendTrace(orderId, "roc.fallback_to_human", …)`
    records `fallbackRequired`, previous + new assignment/task ids; adds compliance flag
    `sandbox_human_fallback`.

### 3.5 Gate hook (`apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts`, +24)
- `findDecisionForOrder(orderId, decisionId?)` — repository-backed
  (`loadDecisionById` / `loadLatestDecision`) with in-memory `lastDecision` fallback;
  returns a defensively cloned decision or `null`.
- Decision now sets `fallbackRequired: decision === "block"`.

### 3.6 Tests (present on parent branch)
- `apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts` (+705) — 4 cases:
  - **E2E-P2-008** reuses the same booking and order on gate-required human fallback.
  - **negative (new @ `cd6c4a5f9a`, L306)** — *"rejects gate-triggered human fallback when
    the sandbox decision does not require fallback"*: builds an `allow` decision
    (`fallbackRequired === false`), asserts the call throws `ApiRequestError` with code
    `SANDBOX_FALLBACK_NOT_REQUIRED`, **and proves zero side effects** — 0 interventions,
    0 fallback reports, 0 driver tasks for the order.
  - cancels active AV assignment + creates human replacement on the same dispatch job.
  - **UAT-AV-010** keeps billing + audit chain intact after AV→human fallback.
- `apps/api/tests/unit/roc-operations.controller.test.ts` (+70) — controller awaits the
  service before wrapping the envelope.
- `apps/api/tests/unit/sandbox-dispatch-gate.service.test.ts` (+2).
- `tests/e2e/E2E-P2-008-roc-human-fallback.sh` — runs the int-p2-008 vitest spec.
- `apps/api/docs/.../phase2-av-fallback-to-human-uat-20260626.md` (+52) — UAT notes.

---

## 4. Absent / Partial Surface (gaps the parent slice must close for full acceptance)

These are **not defects in the sidecar**; they are the delta to full acceptance, listed
so the parent review is explicit about what "done" still requires.

**Status legend:** ✅ closed on-branch · ⛔ open delta to full acceptance.

| # | Gap | Status | Evidence |
|---|---|---|---|
| ~~G1~~ | **Non-fallback gate decisions now rejected.** The ROC guard rejects a `gate_fallback_required` trigger both when **no** decision is found *and* when a found decision has `fallbackRequired === false` (new `SANDBOX_FALLBACK_NOT_REQUIRED` 409). The earlier review failure is closed. | ✅ closed @ `cd6c4a5f9a` | `roc-operations.service.ts` L95 `"SANDBOX_FALLBACK_NOT_REQUIRED"`; two-branch guard (§3.3) |
| ~~G2~~ | **Negative integration test present.** A `gate_fallback_required` request backed by an `allow` (`fallbackRequired:false`) decision is asserted to be rejected with `SANDBOX_FALLBACK_NOT_REQUIRED` and to produce no side effects. | ✅ closed @ `cd6c4a5f9a` | `int-p2-008-roc-human-fallback.test.ts` L306 (§3.6) |
| G3 | **Report persistence is in-memory.** `fallbackReports` / `reportArtifactId` are retained in-process; no durable repository for the sandbox-exception report the contract/regulatory retention implies. | ⛔ open | `private fallbackReports: RocFallbackToHumanReport[] = []` |
| G4 | **Not yet on `dev`.** The whole fallback surface (incl. the merged-dependency consumer) lives on `origin/codex/p2-fbk-001` (closeout `cd6c4a5f9a`, tip `d83ed7d34`); the parent is `review_approved` but `done` is gate-blocked until `INTEGRATION_STATUS=merged_to_dev`. | ⛔ open | `git diff --stat origin/dev origin/codex/p2-fbk-001` = 12 files, +1590/−3 |
| ~~G5~~ | **CI/e2e harness deltas reconciled.** The branch previously edited `.github/workflows/ci-integ.yml` and `tests/e2e/run-e2e-hermetic.sh`; the `origin/dev` merge at `d83ed7d34` brings in `dev`'s `CI-E2E-SHARD` (`92dbd14e6`) so both files now match `dev` and drop out of the delta. Only the additive `E2E-P2-008` registration (`tests/e2e/E2E-P2-008-roc-human-fallback.sh`, +8) remains. | ✅ closed @ `d83ed7d34` | both harness files absent from `git diff --name-only origin/dev origin/codex/p2-fbk-001` |

---

## 5. Acceptance Checklist (AC-1 … AC-7)

For the **parent** P2-FBK-001 to finalize. The sidecar verifies present evidence (✅),
flags gaps (⛔), and leaves runtime checks honestly unrun (◻️ — the parent owner runs
build/typecheck/test on the mainline branch).

- **AC-1 — Same booking/order reuse.** Fallback reuses the original booking/order; no
  new order is created. ✅ present (`owned-mobility.service.ts` `fallbackTripToHuman`
  resolves the existing order; §3.4) — covered by E2E-P2-008 case 1.
- **AC-2 — Triggered correctly by gate `fallback_required` + ROC manual.** Both
  `ROC_FALLBACK_TRIGGERS` exist and route through the service. ✅ present — and the gate
  trigger now *rejects* a found decision whose `fallbackRequired` is false
  (`SANDBOX_FALLBACK_NOT_REQUIRED`, §3.3), with the negative INT-P2-008 case proving it
  (§3.6). **G1/G2 closed @ `cd6c4a5f9a`** — the prior open review failure is resolved.
- **AC-3 — New human-driver assignment created.** Active AV assignment cancelled,
  human replacement created on the same dispatch job; non-AV vehicle required. ✅
  present (§3.4) — covered by case 2; idempotency guarded (`HUMAN_FALLBACK_ALREADY_ACTIVE`).
- **AC-4 — Revised ETA emitted.** `revisedEtaMinutes` written back to the same order's
  `etaSnapshot`; status moved to `assigned`. ✅ present (§3.4).
- **AC-5 — Billing + audit chain intact.** Trace appended (`roc.fallback_to_human`),
  audit records emitted (`roc.intervention.started/resolved`), compliance flag
  `sandbox_human_fallback` set; sandbox-exception report generated. ✅ present —
  asserted by UAT-AV-010 case 3. ⛔ partial **G3** (report durability is in-memory).
- **AC-6 — `POST /api/roc/trips/{id}/fallback-to-human` exposed + wired.** Controller +
  route present; module imports deps; `RocOperationsModule` registered in `app.module`.
  ✅ present (§3.2).
- **AC-7 — E2E-P2-008 + UAT-AV-010 covered; integration green on mainline.** Specs
  exist (int-p2-008: **4 cases** incl. both named scenarios + the new negative guard
  case; e2e shell present). The parent passed review (`review_approved`). The CI/e2e
  harness deltas are now reconciled with `dev` via the `d83ed7d34` merge (**G5 closed**).
  ◻️ runtime **not re-run in this sidecar**; ⛔ **G4** the approved branch is not yet
  merged to `dev`, so `dev`-level CI green is pending the merge.

**Summary:** AC-1, AC-2, AC-3, AC-4, AC-6 present-and-verified (AC-2's gate-decision
guard closed @ `cd6c4a5f9a`); AC-5 present with one open gap (G3 report durability);
AC-7 covered on-branch (parent `review_approved`, harness deltas reconciled / G5 closed)
but deferred to the branch→`dev` merge for the `dev`-level green (G4). **No AC is blocked
by an unmet dependency** — P2-GATE-001 is merged.

---

## 6. Handoff Notes

- **Dependency is unblocked.** P2-GATE-001 is `done` and merged to `dev`
  (`31d3ed308`/#892); the gate exposes `fallbackRequired` + `findDecisionForOrder` that
  the fallback consumes. The parent should not be parked on dependencies.
- **Parent has passed review (`review_approved`).** The prior review failure
  (G1/G2 / AC-2) was closed on-branch: at closeout `cd6c4a5f9a` (tree-equal to
  `4b2f86e8f`) `roc-operations.service.ts` rejects a found decision whose
  `fallbackRequired` is `false` via `SANDBOX_FALLBACK_NOT_REQUIRED`, and
  `int-p2-008-roc-human-fallback.test.ts` L306 asserts that rejection with zero side
  effects. Reviewer Codex2 has approved; this is no longer an open review item.
- **Recommended parent focus order (remaining):** G4 — **merge the approved branch to
  `dev`**, then re-run `done` with `INTEGRATION_STATUS=merged_to_dev` (the integration
  gate currently blocks `done` until then). G5 is closed: the `d83ed7d34` `origin/dev`
  merge reconciled the `ci-integ.yml` / `run-e2e-hermetic.sh` harness deltas with `dev`'s
  `CI-E2E-SHARD`. G3 (persist the sandbox-exception report) remains a follow-up if
  regulatory retention is in-scope for this slice.
- **Sidecar made no canonical edits.** Only this support artifact was added; the
  fallback implementation remains owned by the parent on `origin/codex/p2-fbk-001`.
- **Runtime checks honestly unrun here.** The sidecar did not run build/typecheck/test;
  AC-7 runtime is the parent owner's to execute on the mainline branch.

### Self-status
`in_progress` → **handoff** to `Codex` for review. On approval, owner closeout is
`NO_COMMIT_REQUIRED`-eligible (support-only) with `INTEGRATION_STATUS=not_applicable`;
this packet is committed to the sidecar branch as evidence.
