# P2-FBK-001 — Acceptance Packet & Dependency Map (Sidecar Support)

> **Sidecar self-status:** `in_progress` → handoff to reviewer `Codex`
> **Task:** P2-FBK-001-SIDECAR-ACCEPTANCE · **Owner:** Claude · **Reviewer:** Codex
> **Parent:** P2-FBK-001 (owner Codex, reviewer Codex2, status **`review`**)
> **Helper kind:** `acceptance_packet` · **Mutates canonical:** no
> **Refreshed:** 2026-06-26 — re-anchored to **`origin/dev`** after the parent's
> **PR #898 squash-merged to `dev` at 2026-06-26T04:55:20Z** (merge commit
> **`40ee45aba`**, "[codex] P2-FBK-001: human taxi fallback on AV failure (#898)";
> review head `8a3f38b40` "P2-FBK-001: finalize owner closeout"). The fallback surface
> is therefore **now on `dev`** — `git diff origin/dev origin/codex/p2-fbk-001` is
> **empty**. This **closes former G4 (merge-to-`dev`)** and former G5 (CI/e2e harness
> deltas, reconciled by the same merge). The parent advanced to **`review`** (owner Codex
> finalized closeout; reviewer Codex2 to give final approval → `done`); the prior open
> review failure (G1/G2 / AC-2) stays **closed** via the `SANDBOX_FALLBACK_NOT_REQUIRED`
> guard + negative INT-P2-008 case, which are present **on `dev`**. The only remaining
> follow-up delta is **G3 (report durability)**.

This is a **support-only** artifact. It does **not** modify L1 canonical truth, the
phase2 contract surface, or the parent runtime implementation. It maps the acceptance
criteria for the **AV-failure human-taxi fallback**, records the present-vs-absent
implementation surface as evidence, and confirms the dependency chain is unblocked so
the parent owner/reviewer (Codex / Codex2) have a single reference for what "done"
requires.

> **Truth-correction note (this refresh).** The prior revision of this packet stated the
> parent was `review_approved` and "only waiting on merge-to-`dev`" (former G4 open). That
> is now superseded by machine truth: PR #898 **has merged to `dev`**, so the merge step
> is done; the parent is in `review` pending the reviewer's final approval. This packet is
> re-aligned to that state.

Evidence anchors below were re-read at refresh time from:
- **`origin/dev` @ `40ee45aba`** (canonical trunk; the PR #898 squash merge — the entire
  fallback surface now lives here, alongside the dependency P2-GATE-001 `31d3ed308`/#892
  and the `CI-E2E-SHARD` harness `92dbd14e6`).
- the parent fallback branch `origin/codex/p2-fbk-001` — its tree is **equal to `dev`**
  for tracked files (`git diff origin/dev origin/codex/p2-fbk-001` empty); the owner
  closeout commit was `cd6c4a5f9a` / review head `8a3f38b40`, both folded into the squash
  merge `40ee45aba`.
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
  `apps/api/src/modules/owned-mobility/`, and the new
  `apps/api/src/modules/roc-operations/` controller/service (see §3) — all now on `dev`.
- **Parent declared status:** **`review`** (owner Codex, reviewer Codex2). Parent
  `next` note: *"PR #898 merged to dev at 2026-06-26T04:55:20Z after all GitHub checks
  passed. Review head 8a3f38b4 (P2-FBK-001: finalize owner closeout), merge commit
  40ee45ab … Prior local verification recorded: commit trailers, targeted integration
  vitest, and eslint passed."* — i.e. the implementation **is merged to `dev`** and the
  owner has finalized closeout; the task sits in `review` for the reviewer's final
  approval before `done`. The earlier review failure stayed **resolved** (see §3.3,
  §4 G1/G2, §5 AC-2) and those fixes are now **on `dev`**.
- **Sidecar role:** prepare the acceptance checklist + dependency map so the parent's
  finalization has one reference for what "done" requires and which gap (now just **G3
  durability follow-up**) remains.

---

## 2. Dependency Map

| Dependency | Provides to fallback | Status (machine truth) | Anchor evidence |
|---|---|---|---|
| **P2-GATE-001** *(declared)* | Sandbox dispatch decision + the `fallbackRequired` signal that drives the `gate_fallback_required` trigger; `findDecisionForOrder(orderId, decisionId?)` lookup the ROC service consumes | **merged to dev** (`31d3ed308`, PR #892) | `apps/api/src/modules/sandbox-dispatch-gate/` (controller / repository / service / types on `dev`) |
| P2-WP0 *(transitive)* | Phase2 contract foundation (`SandboxDispatchDecision`, outcomes, reason codes, ROC intervention types, audit catalog) | `merged_to_dev` (`a00a3bbd7`) | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` |
| Phase-1 owned-mobility *(transitive base)* | Booking/order records, assignment + task creation, ETA snapshot, trace/audit chain reused by the fallback path | present on `dev` | `apps/api/src/modules/owned-mobility/` (controller/service/repository/module/events) |

**Dependency verdict:** the single *declared* dependency, **P2-GATE-001, is `done` and
merged to `dev`** (`31d3ed308`/#892). P2-FBK-001 is therefore **not
dependency-blocked**, and — as of PR #898 — **its own surface is also merged to `dev`**.
The remaining work is **not** implementation correctness, **not** an upstream dependency
wait, and **no longer** the integration merge (done): it is only the parent reviewer's
**final approval** to flip `review` → `done` (with `INTEGRATION_STATUS=merged_to_dev`),
plus the optional G3 durability follow-up.

---

## 3. Present Implementation Surface (verified evidence)

Read from **`origin/dev` @ `40ee45aba`** (the PR #898 squash merge; tree-equal to the
parent branch `origin/codex/p2-fbk-001`). These are the surfaces a reviewer can confirm
exist **on `dev`**; the line/symbol anchors are stable at the merged tree. As of this
refresh, `git diff --stat origin/dev origin/codex/p2-fbk-001` is **empty** — i.e. every
file below is now part of `dev`.

### 3.1 Contract additions (`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`)
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

### 3.2 HTTP surface (`apps/api/src/modules/roc-operations/roc-operations.controller.ts`)
- `@Controller("roc")` → `@Post("trips/:tripId/fallback-to-human")`
  `fallbackToHuman(...)` → `RocOperationsService.fallbackTripToHuman(...)`, wrapped in
  `toApiSuccessEnvelope`. Matches the acceptance route
  **`POST /api/roc/trips/{id}/fallback-to-human`**.
- `roc-operations.module.ts` imports `OwnedMobilityModule`,
  `SandboxDispatchGateModule`, `AuditNotificationModule` and registers the controller.
- `RocOperationsModule` is registered in `apps/api/src/app.module.ts`, so the route is
  live on `dev`.

### 3.3 Orchestration (`apps/api/src/modules/roc-operations/roc-operations.service.ts`)
- `fallbackTripToHuman(tripId, command, identity, requestId)`:
  - resolves the trip's order; defaults `trigger` to `roc_manual_intervention`.
  - looks up the gate decision via `sandboxDispatchGateService.findDecisionForOrder(orderId, sandboxDecisionId)`.
  - **gate-trigger guard (two-branch):** when `trigger === "gate_fallback_required"` —
    - if **no decision** is found → `409 ApiRequestError("SANDBOX_FALLBACK_DECISION_REQUIRED", …)`;
    - if a decision **is** found but `sandboxDecision.fallbackRequired === false` →
      `409 ApiRequestError("SANDBOX_FALLBACK_NOT_REQUIRED", …)` (detail carries
      `decisionId`, `decision`, `fallbackRequired`). This is the fix for the earlier
      open review failure: a gate decision that did not mandate fallback can no longer
      drive a human fallback.
  - identity guard: requires ops/ROC operator → `ROC_OPERATOR_REQUIRED`; trip id guard
    → `TRIP_ID_REQUIRED`.
  - delegates the booking/order reuse to `ownedMobilityService.fallbackTripToHuman(...)`.
  - builds the `fallback_to_human` intervention + the `RocFallbackToHumanReport`
    (`reportArtifactId = ART-<uuid>`), retains reports in-memory (`fallbackReports`).
  - emits audit records: `roc.intervention.started`, `roc.intervention.resolved` (and
    the report path uses `sandbox_exception_report` resource type / `roc_operator`
    source system).

### 3.4 Booking/order reuse (`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`)
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

### 3.5 Gate hook (`apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts`)
- `findDecisionForOrder(orderId, decisionId?)` — repository-backed
  (`loadDecisionById` / `loadLatestDecision`) with in-memory `lastDecision` fallback;
  returns a defensively cloned decision or `null`.
- Decision now sets `fallbackRequired: decision === "block"`.

### 3.6 Tests (present on `dev`)
- `apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts` — 4 cases:
  - **E2E-P2-008** reuses the same booking and order on gate-required human fallback.
  - **negative case** — *"rejects gate-triggered human fallback when the sandbox decision
    does not require fallback"*: builds an `allow` decision (`fallbackRequired === false`),
    asserts the call throws `ApiRequestError` with code `SANDBOX_FALLBACK_NOT_REQUIRED`,
    **and proves zero side effects** — 0 interventions, 0 fallback reports, 0 driver
    tasks for the order.
  - cancels active AV assignment + creates human replacement on the same dispatch job.
  - **UAT-AV-010** keeps billing + audit chain intact after AV→human fallback.
- `apps/api/tests/unit/roc-operations.controller.test.ts` — controller awaits the
  service before wrapping the envelope.
- `apps/api/tests/unit/sandbox-dispatch-gate.service.test.ts`.
- `tests/e2e/E2E-P2-008-roc-human-fallback.sh` — runs the int-p2-008 vitest spec.
- `apps/api/docs/.../phase2-av-fallback-to-human-uat-20260626.md` — UAT notes.

---

## 4. Absent / Partial Surface (gaps remaining for full acceptance)

These are **not defects in the sidecar**; they are the delta to full acceptance, listed
so the parent review is explicit about what "done" still requires.

**Status legend:** ✅ closed (on `dev`) · ⛔ open follow-up delta.

| # | Gap | Status | Evidence |
|---|---|---|---|
| ~~G1~~ | **Non-fallback gate decisions rejected.** The ROC guard rejects a `gate_fallback_required` trigger both when **no** decision is found *and* when a found decision has `fallbackRequired === false` (`SANDBOX_FALLBACK_NOT_REQUIRED` 409). | ✅ closed (on `dev`) | `roc-operations.service.ts` `"SANDBOX_FALLBACK_NOT_REQUIRED"`; two-branch guard (§3.3) |
| ~~G2~~ | **Negative integration test present.** A `gate_fallback_required` request backed by an `allow` (`fallbackRequired:false`) decision is asserted to be rejected with `SANDBOX_FALLBACK_NOT_REQUIRED` and to produce no side effects. | ✅ closed (on `dev`) | `int-p2-008-roc-human-fallback.test.ts` negative case (§3.6) |
| G3 | **Report persistence is in-memory.** `fallbackReports` / `reportArtifactId` are retained in-process; no durable repository for the sandbox-exception report the contract/regulatory retention implies. | ⛔ open follow-up | `private fallbackReports: RocFallbackToHumanReport[] = []` |
| ~~G4~~ | **Merged to `dev`.** The whole fallback surface is on `dev` via **PR #898** (squash merge `40ee45aba`, merged 04:55:20Z). `git diff origin/dev origin/codex/p2-fbk-001` is empty. The parent is `review`; `done` needs only the reviewer's final approval (with `INTEGRATION_STATUS=merged_to_dev`). | ✅ closed (PR #898) | `git merge-base --is-ancestor 40ee45aba origin/dev` → true; surface files present on `origin/dev` |
| ~~G5~~ | **CI/e2e harness deltas reconciled.** The branch's earlier edits to `.github/workflows/ci-integ.yml` and `tests/e2e/run-e2e-hermetic.sh` are reconciled with `dev`'s `CI-E2E-SHARD` (`92dbd14e6`); PR #898 merged "after all GitHub checks passed". | ✅ closed (on `dev`) | both harness files match `dev`; PR #898 checks green |

---

## 5. Acceptance Checklist (AC-1 … AC-7)

For the **parent** P2-FBK-001 to finalize. The sidecar verifies present evidence (✅),
flags gaps (⛔), and leaves locally-unrun runtime checks honest (◻️ — the sidecar did
not re-run build/typecheck/test; PR #898's GitHub checks are the `dev`-level signal).

- **AC-1 — Same booking/order reuse.** Fallback reuses the original booking/order; no
  new order is created. ✅ present-on-`dev` (`owned-mobility.service.ts`
  `fallbackTripToHuman` resolves the existing order; §3.4) — covered by E2E-P2-008 case 1.
- **AC-2 — Triggered correctly by gate `fallback_required` + ROC manual.** Both
  `ROC_FALLBACK_TRIGGERS` exist and route through the service. ✅ present-on-`dev` — and
  the gate trigger *rejects* a found decision whose `fallbackRequired` is false
  (`SANDBOX_FALLBACK_NOT_REQUIRED`, §3.3), with the negative INT-P2-008 case proving it
  (§3.6). **G1/G2 closed and on `dev`.**
- **AC-3 — New human-driver assignment created.** Active AV assignment cancelled,
  human replacement created on the same dispatch job; non-AV vehicle required. ✅
  present-on-`dev` (§3.4) — covered by case 2; idempotency guarded
  (`HUMAN_FALLBACK_ALREADY_ACTIVE`).
- **AC-4 — Revised ETA emitted.** `revisedEtaMinutes` written back to the same order's
  `etaSnapshot`; status moved to `assigned`. ✅ present-on-`dev` (§3.4).
- **AC-5 — Billing + audit chain intact.** Trace appended (`roc.fallback_to_human`),
  audit records emitted (`roc.intervention.started/resolved`), compliance flag
  `sandbox_human_fallback` set; sandbox-exception report generated. ✅ present-on-`dev` —
  asserted by UAT-AV-010 case 3. ⛔ partial **G3** (report durability is in-memory).
- **AC-6 — `POST /api/roc/trips/{id}/fallback-to-human` exposed + wired.** Controller +
  route present; module imports deps; `RocOperationsModule` registered in `app.module`.
  ✅ present-on-`dev` (§3.2).
- **AC-7 — E2E-P2-008 + UAT-AV-010 covered; integration green on mainline.** Specs
  exist (int-p2-008: **4 cases** incl. both named scenarios + the negative guard case;
  e2e shell present), now on `dev`. **PR #898 merged after all GitHub checks passed**, so
  the `dev`-level CI/e2e signal is satisfied (former G5 closed). ◻️ runtime not re-run in
  this sidecar.

**Summary:** AC-1, AC-2, AC-3, AC-4, AC-6 present-and-verified **on `dev`** (AC-2's
gate-decision guard closed); AC-5 present with one open follow-up (G3 report durability);
AC-7 covered with PR #898's GitHub checks green (G4/G5 closed). **No AC is blocked** —
the dependency is merged and the fallback surface is merged. The parent's only remaining
step to `done` is the reviewer's final approval.

---

## 6. Handoff Notes

- **Dependency is unblocked.** P2-GATE-001 is `done` and merged to `dev`
  (`31d3ed308`/#892); the gate exposes `fallbackRequired` + `findDecisionForOrder` that
  the fallback consumes. The parent is not parked on dependencies.
- **Parent surface is merged to `dev` (PR #898).** Squash merge `40ee45aba` (merged
  04:55:20Z, "after all GitHub checks passed") carries the full fallback surface incl.
  the `SANDBOX_FALLBACK_NOT_REQUIRED` guard and the negative INT-P2-008 case.
  `git diff origin/dev origin/codex/p2-fbk-001` is empty. **G4 and G5 are closed.**
- **Parent is in `review`** (owner Codex finalized closeout `8a3f38b4`; reviewer Codex2).
  The remaining step to `done` is the **reviewer's final approval**, after which the owner
  re-runs `done` with `INTEGRATION_STATUS=merged_to_dev` (the merge evidence is PR #898 /
  `40ee45aba`).
- **Recommended parent focus order (remaining):** (1) reviewer Codex2 approves → `done`
  with `INTEGRATION_STATUS=merged_to_dev`. (2) **G3** — persist the sandbox-exception
  report — remains a follow-up if regulatory retention is in-scope for this slice.
- **Sidecar made no canonical edits.** Only this support artifact was added; the
  fallback implementation is owned by the parent and now lives on `dev`.
- **Runtime checks honestly unrun here.** The sidecar did not run build/typecheck/test;
  PR #898's GitHub checks are the `dev`-level signal of record.

### Self-status
`in_progress` → **handoff** to `Codex` for review. On approval, owner closeout is
`NO_COMMIT_REQUIRED`-eligible (support-only) with `INTEGRATION_STATUS=not_applicable`;
this packet is committed to the sidecar branch as evidence.
