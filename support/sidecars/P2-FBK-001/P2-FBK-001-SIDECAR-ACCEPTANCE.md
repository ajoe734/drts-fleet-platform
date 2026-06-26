# P2-FBK-001 — Acceptance Packet & Dependency Map (Sidecar Support)

> **Sidecar self-status:** `in_progress` → handoff to reviewer `Codex`
> **Task:** P2-FBK-001-SIDECAR-ACCEPTANCE · **Owner:** Claude · **Reviewer:** Codex
> **Parent:** P2-FBK-001 (owner Codex, reviewer Codex2, `in_progress`)
> **Helper kind:** `acceptance_packet` · **Mutates canonical:** no

This is a **support-only** artifact. It does **not** modify L1 canonical truth, the
phase2 contract surface, or the parent runtime implementation. It maps the acceptance
criteria for the **AV-failure human-taxi fallback**, records the present-vs-absent
implementation surface as evidence, and confirms the dependency chain is unblocked so
the parent owner/reviewer (Codex / Codex2) have a single reference for what "done"
requires.

Evidence anchors below were read at sidecar build time from:
- `origin/dev` @ `92dbd14e6` (canonical trunk; the dependency P2-GATE-001 is merged here)
- the parent fallback branch `origin/codex/p2-fbk-001` @ `f5a990088` (where the
  fallback implementation currently lives; **not yet on `dev`**)
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
- **Parent declared status:** `in_progress` (owner Codex, reviewer Codex2). Parent
  `next` note: *"Investigating review failure: reject non-fallback gate decisions and
  add negative integration test."*
- **Sidecar role:** prepare the acceptance checklist + dependency map so the parent's
  finalization review has one reference for what "done" requires and which gap the
  open review failure maps to (see §4 G1, §5 AC-2).

---

## 2. Dependency Map

| Dependency | Provides to fallback | Status (machine truth) | Anchor evidence |
|---|---|---|---|
| **P2-GATE-001** *(declared)* | Sandbox dispatch decision + the `fallbackRequired` signal that drives the `gate_fallback_required` trigger; `findDecisionForOrder(orderId, decisionId?)` lookup the ROC service consumes | **merged to dev** (`31d3ed308`, PR #892) | `apps/api/src/modules/sandbox-dispatch-gate/` (now has controller / repository / service / types on `dev`) |
| P2-WP0 *(transitive)* | Phase2 contract foundation (`SandboxDispatchDecision`, outcomes, reason codes, ROC intervention types, audit catalog) | `merged_to_dev` (`a00a3bbd7`) | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` |
| Phase-1 owned-mobility *(transitive base)* | Booking/order records, assignment + task creation, ETA snapshot, trace/audit chain reused by the fallback path | present on `dev` | `apps/api/src/modules/owned-mobility/` (controller/service/repository/module/events) |

**Dependency verdict:** the single *declared* dependency, **P2-GATE-001, is `done` and
merged to `dev`** (`31d3ed308`/#892). P2-FBK-001 is therefore **not
dependency-blocked**. The remaining parent work is implementation correctness inside
the fallback slice (notably the gate-decision validation called out in the parent's
review-failure note), **not an upstream wait**.

---

## 3. Present Implementation Surface (verified evidence)

Read from the parent branch `origin/codex/p2-fbk-001` @ `f5a990088`
(`git diff --stat origin/dev origin/codex/p2-fbk-001` = 14 files, +1430/−24). These are
the surfaces a reviewer can confirm exist; line/symbol anchors are stable at that tip.

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

### 3.3 Orchestration (`apps/api/src/modules/roc-operations/roc-operations.service.ts`, +366)
- `fallbackTripToHuman(tripId, command, identity, requestId)`:
  - resolves the trip's order; defaults `trigger` to `roc_manual_intervention`.
  - looks up the gate decision via `sandboxDispatchGateService.findDecisionForOrder(orderId, sandboxDecisionId)`.
  - **gate-trigger guard:** if `trigger === "gate_fallback_required"` and no decision is
    found → throws `ApiRequestError("SANDBOX_FALLBACK_DECISION_REQUIRED", …)`.
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
- `apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts` (+566) — 3 cases:
  - **E2E-P2-008** reuses the same booking and order on gate-required human fallback.
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

| # | Gap | Evidence |
|---|---|---|
| G1 | **Open review failure — non-fallback gate decisions not rejected.** The ROC guard only rejects a `gate_fallback_required` trigger when **no** decision is found; it does not (per parent `next` note) reject a found decision whose `fallbackRequired` is `false`. A gate decision that did not actually require fallback could still drive a human fallback. | parent `next`: *"reject non-fallback gate decisions and add negative integration test"*; service guard branches only on `!sandboxDecision` |
| G2 | **Negative integration test missing.** No test asserts that a `gate_fallback_required` request backed by a `fallbackRequired:false` (e.g. `allow`) decision is rejected. | int-p2-008 covers only positive + idempotency + billing/audit paths |
| G3 | **Report persistence is in-memory.** `fallbackReports` / `reportArtifactId` are retained in-process; no durable repository for the sandbox-exception report the contract/regulatory retention implies. | `private fallbackReports: RocFallbackToHumanReport[] = []` |
| G4 | **Not yet on `dev`.** The whole fallback surface (incl. the merged-dependency consumer) lives on `origin/codex/p2-fbk-001` @ `f5a990088`; `INTEGRATION_STATUS` for the parent is **branch-level**, not `merged_to_dev`. | `git diff --stat origin/dev origin/codex/p2-fbk-001` = 14 files |
| G5 | **CI/e2e harness deltas.** The branch edits `.github/workflows/ci-integ.yml` (−6) and `tests/e2e/run-e2e-hermetic.sh` (−15) alongside adding `E2E-P2-008`; reviewer should confirm the e2e wiring/registration is intentional and green. | diff stat shows both files modified |

---

## 5. Acceptance Checklist (AC-1 … AC-7)

For the **parent** P2-FBK-001 to finalize. The sidecar verifies present evidence (✅),
flags gaps (⛔), and leaves runtime checks honestly unrun (◻️ — the parent owner runs
build/typecheck/test on the mainline branch).

- **AC-1 — Same booking/order reuse.** Fallback reuses the original booking/order; no
  new order is created. ✅ present (`owned-mobility.service.ts` `fallbackTripToHuman`
  resolves the existing order; §3.4) — covered by E2E-P2-008 case 1.
- **AC-2 — Triggered correctly by gate `fallback_required` + ROC manual.** Both
  `ROC_FALLBACK_TRIGGERS` exist and route through the service. ✅ trigger plumbing
  present; ⛔ **G1/G2** — gate trigger must additionally *reject* a decision whose
  `fallbackRequired` is false (this is the parent's open review failure).
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
  exist (int-p2-008: 3 cases incl. both named scenarios; e2e shell present). ◻️ runtime
  **not run in this sidecar**; ⛔ **G2** negative case missing, **G4** not yet merged to
  `dev`, **G5** CI/e2e harness deltas need reviewer confirmation.

**Summary:** AC-1, AC-3, AC-4, AC-6 present-and-verified; AC-2 and AC-5 present but with
open gaps (G1/G2 the live review failure; G3 persistence); AC-7 deferred to parent
runtime + merge. **No AC is blocked by an unmet dependency** — P2-GATE-001 is merged.

---

## 6. Handoff Notes

- **Dependency is unblocked.** P2-GATE-001 is `done` and merged to `dev`
  (`31d3ed308`/#892); the gate exposes `fallbackRequired` + `findDecisionForOrder` that
  the fallback consumes. The parent should not be parked on dependencies.
- **The live review failure maps to G1/G2 / AC-2.** The shortest path to green is:
  in `roc-operations.service.ts`, when `trigger === "gate_fallback_required"`, also
  reject a found decision whose `fallbackRequired` is `false` (not just a missing
  decision), and add the matching negative integration case to
  `int-p2-008-roc-human-fallback.test.ts`. This is exactly the parent's `next` note.
- **Recommended parent focus order:** G1+G2 (close the review failure) → G3
  (persist the sandbox-exception report) → G4/G5 (merge to `dev`, confirm CI/e2e wiring).
- **Sidecar made no canonical edits.** Only this support artifact was added; the
  fallback implementation remains owned by the parent on `origin/codex/p2-fbk-001`.
- **Runtime checks honestly unrun here.** The sidecar did not run build/typecheck/test;
  AC-7 runtime is the parent owner's to execute on the mainline branch.

### Self-status
`in_progress` → **handoff** to `Codex` for review. On approval, owner closeout is
`NO_COMMIT_REQUIRED`-eligible (support-only) with `INTEGRATION_STATUS=not_applicable`;
this packet is committed to the sidecar branch as evidence.
