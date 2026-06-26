# P2-FBK-001 — Acceptance Packet & Dependency Map (Sidecar Support)

> **Sidecar self-status:** `in_progress` → handoff to reviewer `Codex`
> **Task:** P2-FBK-001-SIDECAR-ACCEPTANCE · **Owner:** Claude · **Reviewer:** Codex
> **Parent:** P2-FBK-001 (owner Codex, reviewer Codex2, status **`in_progress`**)
> **Helper kind:** `acceptance_packet` · **Mutates canonical:** no
> **Refreshed:** 2026-06-26 — re-anchored to **`origin/dev`** after the parent's
> **PR #898 squash-merged to `dev` at 2026-06-26T04:55:20Z** (merge commit
> **`40ee45aba`**, "[codex] P2-FBK-001: human taxi fallback on AV failure (#898)";
> review head `8a3f38b40` "P2-FBK-001: finalize owner closeout"). The **base** fallback
> surface is therefore **on `dev`** — this closes former G4 (merge-to-`dev`) and former
> G5 (CI/e2e harness deltas).
> **State note (re-checked this refresh, machine truth `2026-06-26T05:18:53Z`): the parent
> moved `review_approved` → `in_progress` at `2026-06-26T05:18:00Z`.** The owner (Codex)
> resumed to drive the **integration closeout of the follow-up delta** to `dev`. That delta
> is commit `70bbad660` *"cover ROC fallback route registration"* on `origin/codex/p2-fbk-001`
> (a +135-line HTTP route-registration integration test
> `int-p2-008-roc-human-fallback-route.test.ts` + a 7-line `sandbox-dispatch-gate.service`
> fix so a repository-disabled graph falls back to the in-memory `lastDecision`); reviewer
> Codex2 previously reviewed and approved it (restored the codex task files into a reviewer
> worktree, vitest → **4 files / 23 tests passed**, no regressions). It is now being
> **integrated to `dev` via PR #901** ("P2-FBK-001: integrate fallback route registration to
> dev", base `dev`, head `codex/p2-fbk-001-dev-merge-local` @ `b9a798b1`). PR #901 is **OPEN /
> `mergeStateStatus=BLOCKED` / `mergeable`** — blocked only because its required checks are
> still **running**: `unit`/`integration`/`typecheck`/`lint`/`Commit trailers`/`orchestrator-tests`
> already `pass`, while `build`, `e2e (0..3)`, and `Smoke acceptance` are `pending` (state =
> **`ci_pending`**). The parent's `next` note confirms: *"Verifying PR #901 merge/check status
> and closeout requirements from task worktree before finalizing machine-truth state."* So the
> task is **back in active owner hands driving integration**, not parked at `review_approved`.
> **`git diff origin/dev origin/codex/p2-fbk-001` is non-empty:** the codex branch is
> **ahead** of `dev` by that approved follow-up (`70bbad660`, **not yet merged to `dev`** —
> PR #901 is its in-flight vehicle) and **behind** `dev` by 3 unrelated commits
> (tesla-regulatory ingress + V0040 migrations from other tasks). The base PR #898 surface
> remains present on `dev` (verified file-by-file, §3).
> The prior open review failure (G1/G2 / AC-2) stays **closed** via the
> `SANDBOX_FALLBACK_NOT_REQUIRED` guard + negative INT-P2-008 case, present **on `dev`**.
> The owner's integration-coverage follow-up is **reviewer-approved** and now **mid-integration
> on PR #901** (ci_pending); the only standing functional item is **G3 (report durability)**.

This is a **support-only** artifact. It does **not** modify L1 canonical truth, the
phase2 contract surface, or the parent runtime implementation. It maps the acceptance
criteria for the **AV-failure human-taxi fallback**, records the present-vs-absent
implementation surface as evidence, and confirms the dependency chain is unblocked so
the parent owner/reviewer (Codex / Codex2) have a single reference for what "done"
requires.

> **Truth-correction note (this refresh — reviewer reopen #2).** This revision fixes two
> evidence-precision items the reviewer flagged: (1) **P2-GATE-001 is no longer labelled a
> machine-truth `done` task** — `scripts/ai-status.sh show P2-GATE-001` returns *"Task not
> found"*, so the dependency's completion is restated as **repo/GitHub merge evidence only**
> (PR #892 `31d3ed308` on `dev`); the only registry record is the `…-SIDECAR-ACCEPTANCE`.
> (2) **The PR #898 "merged after all GitHub checks passed" claim is corrected** with exact
> pre/post-merge timing (new §3.7): merge `04:55:20Z`, pre-merge head `ci-integ` completed
> `04:55:24Z` (~4 s *after* merge), durable `dev` green = the post-merge trunk run on
> `40ee45aba` (full suite `success`, `ci-integ` `04:58:27Z`).
>
> **Parent-status history (carried forward — for audit).** This packet's parent-status claim
> has tracked machine truth as it moved: `review` → `review_approved` (early) → `review`
> again → `in_progress` (owner resumed post-PR #898) → `review_approved` (`05:11:06Z`, after
> the route-coverage follow-up `70bbad660` was reviewed/approved by Codex2) → **`in_progress`**
> (current, moved `05:18:00Z`, last_update `05:18:53Z` — owner Codex resumed to drive the
> follow-up's integration to `dev` via **PR #901**). Each prior revision is superseded by the
> one above. The **dev-branch base evidence** — PR #898 merge `40ee45aba`, the
> `SANDBOX_FALLBACK_NOT_REQUIRED` guard, and the negative INT-P2-008 case — has been confirmed
> consistent across all of these and is unchanged; what moved is (a) the parent **status**
> (now `in_progress`, integration in flight), and (b) the **dev↔codex tree relation**, which
> is non-empty because the approved follow-up sits on the codex branch ahead of `dev` and is
> now being merged through PR #901 (not yet landed). Both are corrected in this revision.
>
> **Sidecar branch surface (reviewer reopen #2 — addressed).** A prior reviewer note worried
> the sidecar branch carried runtime/docs paths beyond the support file. Re-verified this
> refresh: `git diff --name-only origin/dev...origin/claude/p2-fbk-001-sidecar-acceptance`
> returns **exactly one path** — `support/sidecars/P2-FBK-001/P2-FBK-001-SIDECAR-ACCEPTANCE.md`.
> The net reviewable surface vs `origin/dev` is **support-only**; the branch's commit count
> ahead reflects packet-refresh history, not runtime edits. No rebase is required to make the
> surface support-only — it already is.

Evidence anchors below were re-read at refresh time from:
- **`origin/dev` @ `40ee45aba`** (canonical trunk; the PR #898 squash merge — the entire
  fallback surface now lives here, alongside the dependency P2-GATE-001 `31d3ed308`/#892
  and the `CI-E2E-SHARD` harness `92dbd14e6`).
- the parent fallback branch `origin/codex/p2-fbk-001` — the owner closeout commit
  `cd6c4a5f9a` / review head `8a3f38b40` are folded into the squash merge `40ee45aba` on
  `dev`. **The branch is no longer tree-equal to `dev`:** it is **ahead** by the approved
  follow-up `70bbad660` (route-registration coverage + gate in-memory-fallback fix, *not yet
  on `dev`* — being integrated via **PR #901**, OPEN/`ci_pending`) and **behind** by 3
  unrelated `dev` commits (`git rev-list --count origin/codex/p2-fbk-001..origin/dev` → 3).
  The PR #898 base surface is still present on `dev` (verified per-file, §3).
- **PR #901** `codex/p2-fbk-001-dev-merge-local` @ `b9a798b1` (base `dev`) — the in-flight
  integration of follow-up `70bbad660`; OPEN, `mergeStateStatus=BLOCKED`/`mergeable`, checks
  partially `pass` / `build`+`e2e`+`Smoke acceptance` `pending` (`ci_pending`).
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
- **Parent declared status:** **`in_progress`** (owner Codex, reviewer Codex2; last_update
  `2026-06-26T05:18:53Z`, moved out of `review_approved` at `05:18:00Z`). The parent `next`
  note records the owner is *"Verifying PR #901 merge/check status and closeout requirements
  from task worktree before finalizing machine-truth state."* The base implementation is on
  `dev` (PR #898 / `40ee45aba`); the owner's follow-up route-coverage delta (`70bbad660`) was
  **reviewed and approved** by Codex2 (*"repository-disabled fallback now uses in-memory
  lastDecision, route registration is covered by HTTP integration, no regressions … vitest →
  4 files / 23 tests passed."*) and is now being **integrated to `dev` via PR #901** (base
  `dev`, head `codex/p2-fbk-001-dev-merge-local` @ `b9a798b1`; OPEN, `mergeStateStatus=BLOCKED`,
  `mergeable` — blocked only on still-running checks: `unit`/`integration`/`typecheck`/`lint`/
  trailers `pass`, `build`/`e2e (0..3)`/`Smoke acceptance` `pending` → **`ci_pending`**). The
  earlier review failure stayed **resolved** (see §3.3, §4 G1/G2, §5 AC-2), present **on `dev`**.
  The step left to a full integration closeout is **PR #901's checks going green and merging
  `70bbad660` to `dev`**, then finalizing `done` with `INTEGRATION_STATUS=merged_to_dev`.
- **Sidecar role:** prepare the acceptance checklist + dependency map so the parent
  owner/reviewer have one reference for what "done" requires and which item (the standing
  **G3 durability follow-up**) remains beyond the in-flight PR #901 integration.

---

## 2. Dependency Map

| Dependency | Provides to fallback | Status (evidence basis) | Anchor evidence |
|---|---|---|---|
| **P2-GATE-001** *(declared)* | Sandbox dispatch decision + the `fallbackRequired` signal that drives the `gate_fallback_required` trigger; `findDecisionForOrder(orderId, decisionId?)` lookup the ROC service consumes | **surface merged to `dev`** — *repo/GitHub evidence only* (PR #892 squash `31d3ed308`, merged 04:01:44Z). **No standalone `P2-GATE-001` task record exists in machine truth**: `scripts/ai-status.sh show P2-GATE-001` returns *"Task not found"*; the only matching record is `P2-GATE-001-SIDECAR-ACCEPTANCE` (`done`). | `git merge-base --is-ancestor 31d3ed308 origin/dev` → true; `apps/api/src/modules/sandbox-dispatch-gate/` (controller / repository / service / types) present on `origin/dev` |
| P2-WP0 *(transitive)* | Phase2 contract foundation (`SandboxDispatchDecision`, outcomes, reason codes, ROC intervention types, audit catalog) | `merged_to_dev` (`a00a3bbd7`) | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` |
| Phase-1 owned-mobility *(transitive base)* | Booking/order records, assignment + task creation, ETA snapshot, trace/audit chain reused by the fallback path | present on `dev` | `apps/api/src/modules/owned-mobility/` (controller/service/repository/module/events) |

**Dependency verdict:** the single *declared* dependency is **P2-GATE-001**, whose gate
surface is **merged to `dev`** by *repo/GitHub evidence* — PR #892 squash `31d3ed308`
(`git merge-base --is-ancestor 31d3ed308 origin/dev` → true), module present on `dev`.
**This is a repo/dev fact, not a machine-truth task status**: there is **no `P2-GATE-001`
task in `ai-status`** (`scripts/ai-status.sh show P2-GATE-001` → *"Task not found"*; the
only registry match is `P2-GATE-001-SIDECAR-ACCEPTANCE`, `done`). On that repo/dev basis
P2-FBK-001 is **not dependency-blocked**, and — as of PR #898 — **its own surface is also
merged to `dev`**.
The remaining work is **not** an upstream dependency wait. With the parent now
**`in_progress`** (integration in flight), the owner's follow-up integration coverage /
route-wiring delta is **reviewer-approved** (commit `70bbad660`) and is being merged to `dev`
via **PR #901** (OPEN, `ci_pending` — checks still running); what remains for a full
integration closeout is **PR #901 going green and merging**, after which the owner finalizes
`done` with `INTEGRATION_STATUS=merged_to_dev`. The optional G3 durability follow-up is the
only other open item.

---

## 3. Present Implementation Surface (verified evidence)

Read from **`origin/dev` @ `40ee45aba`** (the PR #898 squash merge). These are the surfaces
a reviewer can confirm exist **on `dev`**; the line/symbol anchors are stable at the merged
tree. Each base file below was re-verified present on `origin/dev` file-by-file this refresh
(`git cat-file -e origin/dev:<path>`). **Caveat:** the approved follow-up `70bbad660` (the
dedicated route-registration test in §3.6 and a 7-line gate fix in §3.5) lives on
`origin/codex/p2-fbk-001` and is **not yet on `dev`** — it is mid-integration via **PR #901**
(OPEN, `ci_pending`) and is flagged inline below.

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
- **Follow-up delta (codex-branch-only, `70bbad660` — NOT yet on `dev`):** the repository
  guard is tightened from `if (this.repository)` to `if (this.repository?.isEnabled())`, so a
  **present-but-disabled** repository now also falls through to the in-memory `lastDecision`
  path (previously only an *absent* repository did). This is what makes gate-triggered ROC
  fallback work in no-DB module graphs. On `dev`'s `40ee45aba` the un-tightened guard is
  still in place; this 7-line fix lands when **PR #901** merges to `dev`.

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
- **`apps/api/tests/integration/int-p2-008-roc-human-fallback-route.test.ts` — follow-up
  delta (codex-branch-only, `70bbad660`; NOT yet on `dev`).** A +135-line HTTP
  integration test that exercises **ROC fallback route registration** end-to-end (the
  owner's "verify route wiring / finish missing integration coverage" item). Reviewer
  Codex2 verified it by restoring the codex task files into a reviewer worktree and running
  vitest → **4 files / 23 tests passed**. It lands on `dev` when **PR #901** merges.

### 3.7 PR #898 merge vs. CI timing (repo/GitHub evidence — exact)
An earlier revision said PR #898 *"merged after all GitHub checks passed."* That is
**not exact** and is corrected here from `gh`/GitHub API timestamps:

- **Merge:** PR #898 squash-merged to `dev` at **`2026-06-26T04:55:20Z`** (merge commit
  `40ee45aba`; head commit `8a3f38b40`).
- **Pre-merge head checks (`8a3f38b40`):** all `success`, but **not all completed before
  the merge timestamp** — most finished earlier (`integration` 04:51:52Z, `e2e (0)`
  04:54:19Z, `build` 04:55:16Z), while **`ci-integ` started 04:55:20Z and completed
  `success` at 04:55:24Z — i.e. ~4 s *after* `mergedAt`**. So the integration-trunk
  `ci-integ` check finished concurrently with / just after the merge, not strictly before it.
- **Post-merge `dev` trunk (`40ee45aba`):** the full suite **re-ran on the merge commit and
  all passed** — `ci-integ` `success` (started 04:58:24Z, completed **04:58:27Z**),
  `integration` 04:55:43Z, `unit` 04:56:07Z, `typecheck` 04:57:00Z, `build` 04:58:20Z,
  `e2e (0..3)` 04:58:08–04:58:20Z, `lint`/`i18n-guard`/`orchestrator-tests` all `success`.

**Net:** the **dev-level green signal is real and is the post-merge trunk run on
`40ee45aba`** (all `success`). The pre-merge claim is restated: at `mergedAt` every head
check had passed **except `ci-integ`, which completed 4 s later**; durable green on `dev`
comes from the post-merge trunk run, not from a strictly-before-merge gate.

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
| ~~G4~~ | **Base surface merged to `dev`.** The base fallback surface is on `dev` via **PR #898** (squash merge `40ee45aba`, merged 04:55:20Z). One **approved follow-up** (`70bbad660`: route-registration test + gate `isEnabled()` fix) is on `origin/codex/p2-fbk-001` ahead of `dev` and is now mid-integration via **PR #901** (base `dev`, head `b9a798b1`; OPEN, `mergeStateStatus=BLOCKED` on still-running checks = `ci_pending`); the parent is `in_progress` driving that closeout, so `done` finalizes with `INTEGRATION_STATUS=merged_to_dev` once PR #901 goes green and merges. | ✅ base closed (PR #898) · ⏳ PR #901 ci_pending | `git merge-base --is-ancestor 40ee45aba origin/dev` → true; base surface files present on `origin/dev`; follow-up `70bbad660` ahead of `dev`, not an ancestor; PR #901 OPEN |
| ~~G5~~ | **CI/e2e harness deltas reconciled.** The branch's earlier edits to `.github/workflows/ci-integ.yml` and `tests/e2e/run-e2e-hermetic.sh` are reconciled with `dev`'s `CI-E2E-SHARD` (`92dbd14e6`). PR #898 head checks were green (see §3.7 timing note); the **post-merge `dev` trunk** then re-ran the full suite on `40ee45aba` and all passed. | ✅ closed (on `dev`) | post-merge `dev` checks on `40ee45aba` all `success` (ci-integ completed 04:58:27Z); harness files match `dev` (§3.7) |

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
  ✅ present-on-`dev` (§3.2). **Route registration now has dedicated HTTP integration
  coverage** via the approved follow-up `int-p2-008-roc-human-fallback-route.test.ts`
  (`70bbad660`, codex-branch-only, reviewer-verified — lands when **PR #901** merges; §3.6).
- **AC-7 — E2E-P2-008 + UAT-AV-010 covered; integration green on mainline.** Specs
  exist (int-p2-008: **4 cases** incl. both named scenarios + the negative guard case;
  e2e shell present), on `dev`; the **route-registration** integration spec is the approved
  follow-up `70bbad660` (codex-branch-only, reviewer-verified 23 tests pass — mid-integration
  via **PR #901**, `ci_pending`). The `dev`-level CI/e2e signal is satisfied by the
  **post-merge trunk run on merge commit `40ee45aba`** (full suite `success`, `ci-integ`
  completed 04:58:27Z; see §3.7) — note PR #898 merged at 04:55:20Z while the pre-merge
  head `ci-integ` completed 04:55:24Z (~4 s after), so the green of record is the
  post-merge trunk run (former G5 closed). ◻️ runtime not re-run in this sidecar.

**Summary:** AC-1, AC-2, AC-3, AC-4, AC-6 present-and-verified **on `dev`** (AC-2's
gate-decision guard closed); AC-5 present with one open follow-up (G3 report durability);
AC-7 covered with the post-merge `dev` trunk checks on `40ee45aba` green (§3.7; G4 base
closed, G5 closed). **No AC is blocked** — the dependency is merged and the base fallback
surface is merged. The parent is **`in_progress`** (`05:18:53Z`, moved at `05:18:00Z`): the
owner's route-coverage / wiring follow-up (`70bbad660`) was **reviewed and approved** by
Codex2 (23 tests pass) and is now **mid-integration via PR #901** (OPEN, `ci_pending` — checks
still running). The remaining step to full integration closeout is **PR #901 going green and
merging to `dev`**, after which the owner finalizes `done`
(`INTEGRATION_STATUS=merged_to_dev`). G3 report durability is the only standing open item.

---

## 6. Handoff Notes

- **Dependency is unblocked (repo/dev evidence).** The P2-GATE-001 gate surface is
  **merged to `dev`** via PR #892 squash `31d3ed308` (`is-ancestor` of `origin/dev` →
  true; module present on `dev`); the gate exposes `fallbackRequired` +
  `findDecisionForOrder` that the fallback consumes. **Caveat:** there is **no
  `P2-GATE-001` task in machine truth** (`ai-status.sh show P2-GATE-001` → *"Task not
  found"*; only `P2-GATE-001-SIDECAR-ACCEPTANCE` is `done`) — so "unblocked" rests on
  repo/GitHub merge evidence, not a task-status record. The parent is not parked on
  dependencies.
- **Parent base surface is merged to `dev` (PR #898).** Squash merge `40ee45aba` (merged
  **04:55:20Z**) carries the base fallback surface incl. the `SANDBOX_FALLBACK_NOT_REQUIRED`
  guard and the negative INT-P2-008 case. The `dev`-level green is the **post-merge trunk
  run on `40ee45aba`** (full suite `success`, `ci-integ` 04:58:27Z); the pre-merge head
  `ci-integ` completed 04:55:24Z (~4 s after `mergedAt`) — see §3.7, not a strictly
  before-merge gate. **G5 is closed; G4 base is closed with PR #901 (the follow-up merge) in
  flight / `ci_pending`** (below).
- **One approved follow-up is mid-integration via PR #901 (`70bbad660`).** `git diff
  origin/dev origin/codex/p2-fbk-001` is **non-empty**: the codex branch is **ahead** by the
  reviewer-approved route-coverage commit `70bbad660` (`int-p2-008-roc-human-fallback-route.test.ts`
  +135 + a 7-line gate `isEnabled()` fix, §3.5/§3.6) — **not yet on `dev`** — and **behind**
  by 3 unrelated `dev` commits. That follow-up is now being integrated to `dev` via **PR #901**
  ("P2-FBK-001: integrate fallback route registration to dev", base `dev`, head
  `codex/p2-fbk-001-dev-merge-local` @ `b9a798b1`; OPEN, `mergeStateStatus=BLOCKED` only on
  still-running checks — `unit`/`integration`/`typecheck`/`lint`/trailers `pass`,
  `build`/`e2e (0..3)`/`Smoke acceptance` `pending` = **`ci_pending`**). PR #901 going green
  and merging is the remaining integration step before `done`.
- **Parent is `in_progress`** (owner Codex; reviewer Codex2; last_update
  `2026-06-26T05:18:53Z`, moved out of `review_approved` at `05:18:00Z`). PR #898 merged the
  base surface; the owner completed the route-coverage / wiring follow-up (`70bbad660`), which
  reviewer Codex2 **reviewed and approved**, and has now resumed to drive its integration to
  `dev` (PR #901). The parent `next` confirms: *"Verifying PR #901 merge/check status and
  closeout requirements … before finalizing machine-truth state."* So the next step is **PR
  #901 closeout → owner `done` finalize**, not further owner implementation.
- **Recommended parent focus order (remaining):** (1) **drive PR #901 to green and merge
  `70bbad660` to `dev`** (the route-coverage test + gate `isEnabled()` fix; already
  reviewer-approved — blocked only on pending `build`/`e2e`/`Smoke acceptance` checks).
  (2) finalize `done` with `INTEGRATION_STATUS=merged_to_dev` (base merge evidence: PR #898 /
  `40ee45aba`; plus PR #901 for the follow-up). (3) **G3** — persist the sandbox-exception
  report — remains a follow-up if regulatory retention is in-scope for this slice.
- **Sidecar made no canonical edits.** Only this support artifact was added; the base
  fallback implementation is owned by the parent and lives on `dev`, with the approved
  follow-up mid-integration via PR #901.
- **Runtime checks honestly unrun here.** The sidecar did not run build/typecheck/test;
  PR #898's GitHub checks are the `dev`-level signal of record.

### Self-status
`in_progress` → **handoff** to `Codex` for review. On approval, owner closeout is
`NO_COMMIT_REQUIRED`-eligible (support-only) with `INTEGRATION_STATUS=not_applicable`;
this packet is committed to the sidecar branch as evidence.
