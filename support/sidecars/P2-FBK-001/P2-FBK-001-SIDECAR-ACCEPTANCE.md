# P2-FBK-001 — Acceptance Packet & Dependency Map (Sidecar Support)

> **Sidecar self-status:** `in_progress` → handoff to reviewer `Codex`
> **Task:** P2-FBK-001-SIDECAR-ACCEPTANCE · **Owner:** Claude · **Reviewer:** Codex
> **Parent:** P2-FBK-001 (owner Codex, reviewer Codex2; integration **`merged_to_dev`**)
> **Helper kind:** `acceptance_packet` · **Mutates canonical:** no
> **Refreshed:** 2026-06-26 (reviewer reopen #5) — **post-merge trunk CI truth corrected.** The
> dev-push run `28218927968` on the merge commit `c4126ee…` was previously described as "green
> except still-running `e2e` shards." Current GitHub truth: all non-e2e jobs are `success`, but
> **`e2e (3)` (job `83595749448`) FAILED at `2026-06-26T05:34:22Z`** (`e2e (0..2)` still
> `in_progress`). Job log root cause is an **unrelated `TeslaRegulatoryEventsService` DI boot
> break** (hermetic API never came up), **not** a fallback-route regression — the fallback's own
> coverage runs in the green `integration` job. The merge to `dev` stays durable (`merged_to_dev`;
> the failure is post-merge). §3.8, the G4 row, AC-7, and Handoff Notes are refreshed accordingly.
> Prior-revision history (reviewer reopen #3) is retained below.
>
> **Refreshed:** 2026-06-26 (reviewer reopen #3) — re-anchored to **`origin/dev`** after the
> parent's follow-up integration **PR #901 squash-merged to `dev` at 2026-06-26T05:21:46Z**
> (merge commit **`c4126ee8899ee672503ac314d957d9338b382056`**, *"P2-FBK-001: integrate
> fallback route registration to dev (#901)"*; head `codex/p2-fbk-001-dev-merge-local`).
> **`git merge-base --is-ancestor c4126ee… origin/dev` → true.** The earlier base surface
> landed via **PR #898** (squash merge **`40ee45aba`**, 2026-06-26T04:55:20Z). **The entire
> P2-FBK-001 fallback surface — base *and* the route-coverage follow-up — is now on `dev`.**
>
> **What changed since the prior revision (reviewer reopen #3):** the prior packet stated the
> parent was `in_progress`, with PR #901 **OPEN / `ci_pending`** and the follow-up `70bbad660`
> *"not yet on `dev`."* That is now stale. **PR #901 is MERGED** (state `MERGED`, `mergedAt`
> `2026-06-26T05:21:46Z`, merge commit `c4126ee…`, base `dev`). The follow-up content
> (route-registration HTTP test + the gate `isEnabled()` in-memory-fallback fix) is now
> **present and content-identical on `dev`** — verified file-by-file:
> `git diff origin/dev origin/codex/p2-fbk-001 -- <follow-up files>` is **empty** for both the
> gate service and the route test (§3.5 / §3.6). The integration level is therefore
> **`merged_to_dev`** (former G4 now **fully closed** — both base and follow-up merged).
>
> **Parent machine-truth caveat (unchanged framing).** There is **no standalone `P2-FBK-001`
> task in `ai-status`**: `scripts/ai-status.sh show P2-FBK-001` returns *"Task not found"*; the
> only registry record under this id is this `…-SIDECAR-ACCEPTANCE`. The parent's last recorded
> activity (`2026-06-26T05:23:39Z`) is the owner (Codex) note that **PR #901 merged to `dev` …
> waiting for dev-push CI run `28218927968` (CI integration trunk) to finish**, followed by
> *"reconciled from origin/dev@c4126ee…"* and then *"Worker superseded after task responsibility
> moved to another agent."* So the parent's integration status is restated here on **repo/GitHub
> merge evidence** (PR #901 merged, commit on `dev`), consistent with how this packet treats the
> dependency P2-GATE-001.
>
> **dev↔codex tree relation (post-squash, explained).** `origin/codex/p2-fbk-001` shows
> *ahead 6 / behind 4* by **commit count** — an artifact of the two squash merges (the codex
> branch's individual commits are not ancestors of the squashed `dev` commits). **By content it
> carries nothing the fallback needs that `dev` lacks:** the only non-empty
> `git diff origin/dev origin/codex/p2-fbk-001` (two-dot) paths are **unrelated**
> tesla-regulatory-events + `V0040` migration files that `dev` has and the codex branch does not
> (the "behind by 4"). **Every P2-FBK-001 fallback file is content-identical on `dev`.** No
> rebase or further merge of the codex branch is required for the fallback surface.
>
> **Post-merge `dev` trunk CI (e2e shard now RED — unrelated cause).** The dev-push run on the
> merge commit `c4126ee…` (`CI (integration trunk)`, run `28218927968`) shows
> `typecheck`/`unit`/`integration`/`build`/`lint`/`i18n-guard`/`orchestrator-tests` =
> **`success`**, but **`e2e (3)` (job `83595749448`) FAILED at `2026-06-26T05:34:22Z`**
> (`e2e (0..2)` still `in_progress`; run status `in_progress`). **Root cause is unrelated to the
> fallback surface:** the hermetic API failed to boot with
> `UnknownDependenciesException: Nest can't resolve dependencies of the TeslaRegulatoryEventsService`
> — the Tesla-regulatory module DI wiring (the same unrelated tesla/`V0040` surface noted above),
> not the ROC fallback route. The merge to `dev` is durable (`merged_to_dev`, the failure is
> **post-merge** and does not un-merge `c4126ee…`); a `dev_deployed` claim is **not** made here
> (no `Deploy - Dev` evidence and the post-merge trunk e2e is now red on an unrelated boot break).
>
> The earlier open review failure (G1/G2 / AC-2) remains **closed** via the
> `SANDBOX_FALLBACK_NOT_REQUIRED` guard + negative INT-P2-008 case, present **on `dev`**. The
> only standing functional item is **G3 (report durability)**.

This is a **support-only** artifact. It does **not** modify L1 canonical truth, the
phase2 contract surface, or the parent runtime implementation. It maps the acceptance
criteria for the **AV-failure human-taxi fallback**, records the present-vs-absent
implementation surface as evidence, and confirms the dependency chain is unblocked so
the parent owner/reviewer (Codex / Codex2) have a single reference for what "done"
requires.

> **Evidence-precision notes (carried forward).** (1) **P2-GATE-001 is not a machine-truth
> `done` task** — `scripts/ai-status.sh show P2-GATE-001` returns *"Task not found"*, so the
> dependency's completion is stated as **repo/GitHub merge evidence only** (PR #892
> `31d3ed308` on `dev`); the only registry record is the `…-SIDECAR-ACCEPTANCE`. (2) **PR #898
> merge vs. CI timing** is given exactly in §3.7 (merge `04:55:20Z`; pre-merge head `ci-integ`
> completed `04:55:24Z`, ~4 s *after* merge; durable `dev` green = the post-merge trunk run on
> `40ee45aba`). (3) **PR #901 merge** is given exactly in §3.8.
>
> **Parent-status history (carried forward — for audit).** This packet's parent-integration
> claim has tracked machine truth as it moved: `review` → `review_approved` → `review` →
> `in_progress` (owner resumed post-PR #898) → `review_approved` (`05:11:06Z`, after the
> route-coverage follow-up `70bbad660` was reviewed/approved by Codex2) → `in_progress`
> (`05:18:00Z`, owner driving the follow-up integration via PR #901) → **`merged_to_dev`**
> (current — PR #901 merged `05:21:46Z`, follow-up now on `dev`; last parent activity
> `05:23:39Z`). Each prior revision is superseded by the one above. The **dev-branch base
> evidence** (PR #898 merge `40ee45aba`, the `SANDBOX_FALLBACK_NOT_REQUIRED` guard, the
> negative INT-P2-008 case) is unchanged and consistent across all revisions; what moved is
> the **follow-up's integration**, which is now **landed on `dev`** (PR #901 / `c4126ee…`).
>
> **Sidecar branch surface (re-verified).** `git diff --name-only
> origin/dev...origin/claude/p2-fbk-001-sidecar-acceptance` returns **exactly one path** —
> `support/sidecars/P2-FBK-001/P2-FBK-001-SIDECAR-ACCEPTANCE.md`. The net reviewable surface vs
> `origin/dev` is **support-only**; the branch's ahead-count reflects packet-refresh history,
> not runtime edits. No rebase is required to make the surface support-only — it already is.

Evidence anchors below were re-read at refresh time from:
- **`origin/dev`** — canonical trunk now carrying the **full** fallback surface: the PR #898
  base squash merge **`40ee45aba`**, the dependency P2-GATE-001 `31d3ed308`/#892, the
  `CI-E2E-SHARD` harness `92dbd14e6`, **and the PR #901 follow-up squash merge `c4126ee…`**
  (route-registration coverage + gate `isEnabled()` fix).
- **PR #901** — `codex/p2-fbk-001-dev-merge-local`, base `dev`, **state `MERGED`**, `mergedAt`
  `2026-06-26T05:21:46Z`, merge commit `c4126ee8899ee672503ac314d957d9338b382056`; files
  `sandbox-dispatch-gate.service.ts`, `int-p2-008-roc-human-fallback-route.test.ts`,
  `sandbox-dispatch-gate.service.test.ts`. `is-ancestor` of `origin/dev` → true.
- the parent fallback branch `origin/codex/p2-fbk-001` — its fallback content is now
  **content-identical to `dev`** (the only two-dot diff vs `dev` is unrelated tesla-regulatory
  + `V0040` files the branch is *behind* on). Owner closeout `cd6c4a5f9a` / review head
  `8a3f38b40` are folded into the PR #898 squash `40ee45aba`; the follow-up `70bbad660` is
  folded into the PR #901 squash `c4126ee…`.
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
  `apps/api/src/modules/owned-mobility/`, and the
  `apps/api/src/modules/roc-operations/` controller/service (see §3) — all now on `dev`.
- **Parent integration status:** **`merged_to_dev`** (owner Codex, reviewer Codex2). The base
  fallback surface merged via **PR #898 / `40ee45aba`** (04:55:20Z); the route-coverage /
  gate-fix follow-up (`70bbad660`) was reviewed and approved by Codex2 (*"repository-disabled
  fallback now uses in-memory lastDecision, route registration is covered by HTTP integration,
  no regressions … vitest → 4 files / 23 tests passed."*) and then **merged to `dev` via
  PR #901 / `c4126ee…`** at 05:21:46Z. Both pieces are now present and content-identical on
  `dev`. There is **no standalone `P2-FBK-001` task in `ai-status`** (`show` → "Task not
  found"), so this status rests on repo/GitHub merge evidence; the last parent activity
  (`05:23:39Z`) records the owner reconciling from `origin/dev@c4126ee…` after the merge and the
  worker then being superseded. Beyond `merged_to_dev`, `dev_deployed` is **not** reachable yet:
  the post-merge trunk CI (run `28218927968`) has all non-e2e jobs green but its **`e2e (3)`
  shard FAILED on an unrelated `TeslaRegulatoryEventsService` DI boot break** (§3.8), and there
  is no `Deploy - Dev` run — neither is claimed here, and the e2e red is an unrelated Tesla
  module break rather than a fallback-route regression.
- **Sidecar role:** prepare the acceptance checklist + dependency map so the parent
  owner/reviewer have one reference for what "done" requires and which item (the standing
  **G3 durability follow-up**) remains beyond the now-merged fallback surface.

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
P2-FBK-001 is **not dependency-blocked**, and **its own surface is now fully merged to `dev`**
— base via PR #898 (`40ee45aba`) and the route-coverage follow-up via PR #901 (`c4126ee…`).
The remaining work is **not** an upstream dependency wait and **not** an integration wait:
the integration is **`merged_to_dev`**. The only open item is the optional **G3 durability
follow-up** (in-memory report persistence).

---

## 3. Present Implementation Surface (verified evidence)

Read from **`origin/dev`** — now carrying both the PR #898 base squash (`40ee45aba`) and the
PR #901 follow-up squash (`c4126ee…`). These are the surfaces a reviewer can confirm exist
**on `dev`**; the line/symbol anchors are stable at the merged tree. Each file below was
re-verified present on `origin/dev` this refresh (`git cat-file -e origin/dev:<path>`), and the
former "codex-branch-only" follow-up files (§3.5 gate fix, §3.6 route test) were confirmed
**content-identical between `origin/dev` and `origin/codex/p2-fbk-001`** (empty
`git diff origin/dev origin/codex/p2-fbk-001 -- <path>`). **No caveat remains: the full
fallback surface is on `dev`.**

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
- **Follow-up delta — now ON `dev`** (PR #901 / `c4126ee…`): the repository guard is tightened
  from `if (this.repository)` to **`if (this.repository?.isEnabled())`** (verified on
  `origin/dev` at `sandbox-dispatch-gate.service.ts:299`), so a **present-but-disabled**
  repository now also falls through to the in-memory `lastDecision` path (previously only an
  *absent* repository did). This is what makes gate-triggered ROC fallback work in no-DB module
  graphs. `git diff origin/dev origin/codex/p2-fbk-001 -- <this file>` is **empty** → identical
  on `dev`.

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
  delta, now ON `dev`** (PR #901 / `c4126ee…`). A +135-line HTTP integration test that
  exercises **ROC fallback route registration** end-to-end (the owner's "verify route wiring /
  finish missing integration coverage" item). Reviewer Codex2 verified it (vitest → 4 files /
  23 tests passed); `git cat-file -e origin/dev:<path>` → present, and the content diff vs the
  codex branch is **empty**.

### 3.7 PR #898 (base) merge vs. CI timing (repo/GitHub evidence — exact)
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

**Net:** the base **dev-level green signal is real and is the post-merge trunk run on
`40ee45aba`** (all `success`).

### 3.8 PR #901 (follow-up) merge + post-merge trunk CI (repo/GitHub evidence — exact)
- **Merge:** PR #901 (*"P2-FBK-001: integrate fallback route registration to dev"*, base `dev`,
  head `codex/p2-fbk-001-dev-merge-local`) squash-merged to `dev` at
  **`2026-06-26T05:21:46Z`**, state **`MERGED`**, merge commit
  **`c4126ee8899ee672503ac314d957d9338b382056`** (`is-ancestor` of `origin/dev` → true).
  Changed files: `sandbox-dispatch-gate.service.ts`,
  `int-p2-008-roc-human-fallback-route.test.ts`, `sandbox-dispatch-gate.service.test.ts`.
- **Post-merge `dev` trunk run on `c4126ee…`** (`CI (integration trunk)`, run `28218927968`):
  `typecheck` / `unit` / `integration` / `build` / `lint` / `i18n-guard` / `orchestrator-tests`
  = **`success`**; **`e2e (3)` (job `83595749448`) = `failure`** (completed
  `2026-06-26T05:34:22Z`); `e2e (0..2)` still `in_progress` (run status `in_progress`).
- **`e2e (3)` failure root cause — unrelated to the fallback surface.** The job log shows the
  hermetic API never became healthy:
  `UnknownDependenciesException: Nest can't resolve dependencies of the TeslaRegulatoryEventsService (?, Object)`
  → `[hermetic] API failed to become healthy` → `[hermetic] FAIL (5): 004 008 012 016 020` →
  `exit code 1`. This is a **Tesla-regulatory module DI boot break** (the same unrelated
  tesla/`V0040` surface that is the only `dev`↔codex content diff), **not** a regression in the
  ROC fallback route — the fallback's own coverage runs in the `integration` job, which is green.
- **Integration level: `merged_to_dev`** (unchanged — PR #901 merged at `05:21:46Z`; the e2e
  failure is post-merge and does not un-merge `c4126ee…`). `dev_deployed` is **not** asserted —
  there is no `Deploy - Dev` run evidence **and** the post-merge trunk e2e is now red (on the
  unrelated Tesla boot break, which must be cleared before any `dev_deployed` claim).

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
| ~~G4~~ | **Full surface merged to `dev`.** The base fallback surface merged via **PR #898** (squash `40ee45aba`, 04:55:20Z) **and** the approved route-coverage follow-up (`70bbad660`: route-registration test + gate `isEnabled()` fix) merged via **PR #901** (squash `c4126ee…`, **05:21:46Z**, `is-ancestor` of `origin/dev` → true). Both are content-identical on `dev`. Integration level = **`merged_to_dev`**; post-merge trunk CI (run `28218927968`) has all non-e2e jobs green but **`e2e (3)` failed on an unrelated `TeslaRegulatoryEventsService` DI boot break** (§3.8) — does not un-merge or regress the fallback surface. | ✅ closed — both base + follow-up `merged_to_dev` | `git merge-base --is-ancestor c4126ee… origin/dev` → true; `…isEnabled()` at `sandbox-dispatch-gate.service.ts:299` on `dev`; route test present on `dev`; follow-up content diff vs codex branch empty |
| ~~G5~~ | **CI/e2e harness deltas reconciled.** The branch's earlier edits to `.github/workflows/ci-integ.yml` and `tests/e2e/run-e2e-hermetic.sh` are reconciled with `dev`'s `CI-E2E-SHARD` (`92dbd14e6`). PR #898 head checks were green (see §3.7 timing note); the **post-merge `dev` trunk** then re-ran the full suite on `40ee45aba` and all passed. | ✅ closed (on `dev`) | post-merge `dev` checks on `40ee45aba` all `success` (ci-integ completed 04:58:27Z); harness files match `dev` (§3.7) |

---

## 5. Acceptance Checklist (AC-1 … AC-7)

For the **parent** P2-FBK-001 to finalize. The sidecar verifies present evidence (✅),
flags gaps (⛔), and leaves locally-unrun runtime checks honest (◻️ — the sidecar did
not re-run build/typecheck/test; the GitHub trunk checks are the `dev`-level signal).

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
  coverage on `dev`** via the follow-up `int-p2-008-roc-human-fallback-route.test.ts`
  (`70bbad660`, merged via **PR #901** / `c4126ee…`, reviewer-verified; §3.6).
- **AC-7 — E2E-P2-008 + UAT-AV-010 covered; integration green on mainline.** Specs
  exist (int-p2-008: **4 cases** incl. both named scenarios + the negative guard case;
  e2e shell present), on `dev`; the **route-registration** integration spec (follow-up
  `70bbad660`) is now **on `dev`** via PR #901 (reviewer-verified 23 tests pass). The base
  `dev`-level CI/e2e signal is the **post-merge trunk run on `40ee45aba`** (full suite
  `success`, §3.7); the follow-up's post-merge trunk run on `c4126ee…` (run `28218927968`) has
  all non-e2e jobs green but its **`e2e (3)` shard FAILED on an unrelated
  `TeslaRegulatoryEventsService` DI boot break** (not a fallback-route regression — the
  fallback's coverage is in the green `integration` job; §3.8). ◻️ runtime not re-run in this
  sidecar; ⚠️ the post-merge trunk e2e is red on an unrelated Tesla module break.

**Summary:** AC-1, AC-2, AC-3, AC-4, AC-6 present-and-verified **on `dev`** (AC-2's
gate-decision guard closed); AC-5 present with one open follow-up (G3 report durability);
AC-7 covered with the base post-merge `dev` trunk checks on `40ee45aba` green (§3.7); the
follow-up trunk run on `c4126ee…` has all non-e2e jobs green but its **`e2e (3)` shard failed
on an unrelated `TeslaRegulatoryEventsService` DI boot break** (§3.8). **No AC is blocked by the
fallback surface** — the dependency is merged and the **full fallback surface is merged to
`dev`** (base PR #898 + follow-up PR #901). The parent integration status is **`merged_to_dev`**:
the owner's route-coverage / wiring follow-up (`70bbad660`) was reviewed and approved by Codex2
(23 tests pass) and **merged via PR #901** (`c4126ee…`, 05:21:46Z). The remaining steps toward
`dev_deployed` are (a) the **unrelated Tesla-module DI boot break clearing the trunk e2e**, and
(b) a `Deploy - Dev` run (neither claimed here). **G3 report durability is the only standing
open functional item attributable to this slice**; the trunk e2e red is an unrelated Tesla break.

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
- **Parent full surface is merged to `dev` (PR #898 + PR #901).** Base squash `40ee45aba`
  (merged **04:55:20Z**) carries the base fallback surface incl. the
  `SANDBOX_FALLBACK_NOT_REQUIRED` guard and the negative INT-P2-008 case; follow-up squash
  **`c4126ee…`** (PR #901, merged **05:21:46Z**) carries the route-registration coverage + the
  gate `isEnabled()` in-memory-fallback fix. **Both are present and content-identical on `dev`**
  (the only `dev`↔codex content diff is *unrelated* tesla-regulatory + `V0040` files the codex
  branch is behind on). **G4 and G5 are closed.**
- **Follow-up `70bbad660` is now landed (was the prior packet's "open" item).** The earlier
  revision listed PR #901 as OPEN / `ci_pending` with the follow-up "not yet on `dev`." That is
  superseded: **PR #901 is `MERGED`** (`c4126ee…`, 05:21:46Z, `is-ancestor` of `origin/dev`).
  No further merge of the codex branch is needed for the fallback surface.
- **Parent integration status is `merged_to_dev`** (owner Codex; reviewer Codex2; last parent
  activity `2026-06-26T05:23:39Z` — owner reconciled from `origin/dev@c4126ee…` after the merge,
  then the worker was superseded). The post-merge trunk CI run `28218927968` on `c4126ee…` has
  all non-e2e jobs green but its **`e2e (3)` shard (job `83595749448`) FAILED at `05:34:22Z`**
  (`e2e (0..2)` still in flight). **`dev_deployed` is not claimed** — no `Deploy - Dev` evidence
  and the post-merge trunk e2e is now red.
- **The trunk `e2e (3)` failure is unrelated to the fallback surface.** Job log root cause:
  `UnknownDependenciesException: Nest can't resolve dependencies of the TeslaRegulatoryEventsService`
  → hermetic API never booted → `[hermetic] FAIL (5): 004 008 012 016 020` → `exit code 1`. This
  is a **Tesla-regulatory module DI break** (the same unrelated tesla/`V0040` surface that is the
  only `dev`↔codex content diff), **not** a regression in the ROC fallback route. The fallback's
  own coverage runs in the green `integration` job. Owner should route the e2e red to the Tesla
  module owner, not treat it as a P2-FBK-001 defect.
- **Recommended parent focus order (remaining):** (1) treat the post-merge trunk `e2e (3)`
  failure as an **unrelated `TeslaRegulatoryEventsService` DI boot break** — hand it to the Tesla
  module owner; do not block P2-FBK-001 finalize on it as a fallback defect. (2) finalize parent
  `done` with `INTEGRATION_STATUS=merged_to_dev` (evidence: PR #898 `40ee45aba` + PR #901
  `c4126ee…`); `dev_deployed` only once the trunk e2e is green **and** a `Deploy - Dev` run
  includes the change. (3) **G3** — persist the sandbox-exception report — remains a follow-up if
  regulatory retention is in-scope for this slice.
- **Sidecar made no canonical edits.** Only this support artifact was added; the base + follow-up
  fallback implementation is owned by the parent and is fully on `dev`.
- **Runtime checks honestly unrun here.** The sidecar did not run build/typecheck/test; the
  GitHub trunk checks on `40ee45aba` (base, full suite green) and `c4126ee…` (follow-up: all
  non-e2e jobs green, `e2e (3)` red on the unrelated Tesla DI boot break) are the `dev`-level
  signal of record.

### Self-status
`in_progress` → **handoff** to `Codex` for review. On approval, owner closeout is
`NO_COMMIT_REQUIRED`-eligible (support-only) with `INTEGRATION_STATUS=not_applicable`;
this packet is committed to the sidecar branch as evidence.
