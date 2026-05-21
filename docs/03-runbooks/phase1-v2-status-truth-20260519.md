# Phase 1 v2 — Status Truth Anchor (2026-05-19)

**Date:** 2026-05-19
**Owner:** Codex2
**Reviewer:** Claude
**Task:** `DEV-STATUS-001` (Group D — Status Truth)
**Planning ref:** [`phase1-v2-execution-wave-planning-20260519.md`](phase1-v2-execution-wave-planning-20260519.md)
**Wave name:** `phase1-v2-business-flow-gates`

This document anchors what is **actually true on `origin/dev`** for the SA/SD
v2.0 completion definition, what the v2 wave has registered into machine
truth, and what the active slice of work looks like. It exists so reviewers
can read a single "what is the truth as of today" page instead of
reconstructing it from the planning packet, `ai-status.json`, and four
workflow runbooks.

This is a status truth document, not a plan. The plan lives in the planning
packet. Where the two diverge, the truth doc cites the planning packet but
records the actual repo state.

---

## 1. Anchor Commits and References

| Anchor                           | SHA / Path                                                                                                                   | What it represents                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/dev` HEAD                | `949a49f` (`OPS-GIT-WORKFLOW-007: extend worker_tree_guard to chatbox PreToolUse hook`)                                      | Trunk truth. Carries v1 product docs and the 8-family workflow gate matrix. Does **not** yet carry the v2 planning packet or any v2 workflow rows. |
| Phase 1 v2 wave registration     | `c8c2d01` on `claude/phase1-v2-execution-wave` (`PHASE1-V2-WAVE: register 14 P0 tasks ...`)                                  | Adds the v2 planning packet + writes the 14 P0 tasks into `ai-status.json`. **Not merged to `dev`.**                                               |
| `DEV-STATUS-001` earlier draft   | `c298f20` on `claude/dev-status-001` (`DEV-STATUS-001: anchor Phase 1 v2 status truth ...`)                                  | Prior lane's status-truth draft. Useful evidence source, but this task is now reassigned to `Codex2` / `Claude`.                                   |
| PBK-CUTOVER-001 partner runbook  | `417914e` on `claude2/pbk-cutover-001` (`PBK-CUTOVER-001: partner-booking pilot cutover runbook`)                            | Pilot cutover runbook + WF-PBK-001 matrix row. Task is treated below as approved work awaiting owner closeout to `dev`.                            |
| Existing workflow gate matrix    | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on `origin/dev`                                               | 8 families: `WF-RLS-001`, `WF-TEN-001`, `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-FWD-001`, `WF-COM-001`, `WF-FIN-001`.                        |
| Canonical product truth on `dev` | `phase1_system_analysis_v1.md`, `phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`, `phase1_migration_plan_v1.md` | The L1 product truth `dev` is still anchored to. **No SA/SD v2 file is committed on any branch.**                                                  |

## 2. SA/SD v2.0 Source-Truth Gap

The planning packet names three v2 source documents as the product source for
this wave:

- `phase1_complete_sa_v2_20260519.md`
- `phase1_complete_sd_v2_20260519.md`
- `phase1_complete_sasd_package_index_20260519.md`

These files are referenced by
`docs/03-runbooks/phase1-v2-execution-wave-planning-20260519.md` §"Product
source" and by the wave-registration commit body (`c8c2d01`).

Verified by `git rev-list --all -- '*sa_v2_20260519*' 'phase1_complete_*'`:
**no commit in any branch contains these files**. They exist as conceptual
outputs of the discussion-planning phase, not as repo artifacts.

Implications:

- Workers cannot satisfy the planning packet's "read SA v2 / SD v2 first"
  rule from the repo. The current binding product truth on `dev` is still the
  v1 layer in `phase1_*_v1.md`.
- The v2 vocabulary — workflow-family release gates as the unit of release,
  five new families (`WF-TGV-001`, `WF-DRV-MP-001`, `WF-PARTNER-001`,
  `WF-PBK-001`, `WF-PROD-001`), live evidence packs, prod-rail completion —
  is only encoded in the planning packet and task-registration branch.
- The wave is operating against an authoritative plan that lives off-trunk,
  plus machine truth in this task branch.

This gap is **not** a reason to stall the wave. The planning packet is
self-contained enough to direct execution, and `ai-status.json` carries the
machine-truth backlog. But it is the single highest-risk source of status
confusion: nothing on `origin/dev` tells a reader that Phase 1 completion is
now scored against the v2 gate vocabulary.

Mitigation, in order of priority:

1. Merge the planning packet and v2 task registration to `dev` before any
   other v2 worker claims a closeout on top of stale machine truth.
2. Either commit the SA v2 / SD v2 source documents to the repo, or explicitly
   amend the planning packet to say those artifacts remain external and that
   the planning packet is the durable in-repo substitute.
3. Re-anchor the L1 Product Truth list in `AI_COLLABORATION_GUIDE.md` once (2)
   is resolved.

Until those land, every v2 worker should treat the **planning packet** as the
immediate source of design intent and the **v1 product docs** as the semantic
backstop, and cite both.

## 3. Workflow Gate Matrix — `dev` Truth vs v2 Target

The current matrix on `dev`
(`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`) covers 8
families with the following reads. The v2 wave's target reads are the
right-most column, none of which are on `origin/dev` yet.

| Family ID        | On `dev`? | Current gate read (on `dev`)   | v2 target gate read                                   | Path to v2 target                                 |
| ---------------- | --------- | ------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| `WF-RLS-001`     | yes       | `PASS (live staging evidence)` | `PASS (live production evidence)`                     | `PROD-RAIL-001` + `TST-E2E-009-PROD-RAIL`         |
| `WF-TEN-001`     | yes       | `PASS (live staging evidence)` | unchanged                                             | —                                                 |
| `WF-ORD-001`     | yes       | `PASS (live staging evidence)` | unchanged                                             | —                                                 |
| `WF-DSP-001`     | yes       | `PASS (live staging evidence)` | unchanged                                             | —                                                 |
| `WF-DRV-001`     | yes       | `PASS (static evidence)`       | unchanged                                             | —                                                 |
| `WF-FWD-001`     | yes       | `EXTERNAL-GATED`               | live sandbox + adapter proof, or partial blockers     | `FWD-LIVE-001`                                    |
| `WF-COM-001`     | yes       | `HOLD`                         | live activation + sidecar, or partial blockers        | `COM-LIVE-001`                                    |
| `WF-FIN-001`     | yes       | `PASS (static evidence)`       | live cost-center-aware proof                          | `FIN-GOV-001`                                     |
| `WF-TGV-001`     | **no**    | n/a                            | `PASS (live staging evidence)`                        | `WF-TGV-001` matrix row + `TST-E2E-005-TGV`       |
| `WF-DRV-MP-001`  | **no**    | n/a                            | `PASS (live staging evidence)`                        | `WF-DRV-MP-001` matrix row + `TST-E2E-006-DRV-MP` |
| `WF-PARTNER-001` | **no**    | n/a                            | mock-mode `PASS (repo-local)` + live `EXTERNAL-GATED` | `WF-PARTNER-001` matrix row + `TST-E2E-007-PRT`   |
| `WF-PBK-001`     | **no**    | n/a                            | runbook + rollback drill                              | `PBK-CUTOVER-001` + `TST-E2E-008-PBK-CUTOVER`     |
| `WF-PROD-001`    | **no**    | n/a                            | `deploy-prod.yml` job-complete + dry-run              | `PROD-RAIL-001` + `TST-E2E-009-PROD-RAIL`         |

Important corollary: until the 5 new rows are merged to `dev`, **no v2
closeout statement is allowed to claim those families pass any gate**.
Negative-path coverage (the ORX-GV-001 table) also does not currently include
the 5 new families; whoever writes each row is responsible for adding the
negative-path entry at the same time.

## 4. 14 P0 Task State Survey (machine truth for this branch)

Snapshot basis:

- `origin/dev` HEAD = `949a49f`
- task branch machine truth refreshed at `2026-05-19T03:41:18Z`

Owners and reviewers below follow the **current dispatch truth**, which may
diverge from the original planning packet due to availability-first
reassignment.

### Group A — Workflow Family Gates (5)

| ID                | Status            | Owner  | Reviewer | Depends on                                               | Notes                                                                                               |
| ----------------- | ----------------- | ------ | -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `WF-TGV-001`      | `backlog`         | Codex  | Codex2   | `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001` | Dependencies clear; can start any time. Matrix row + E2E-005 citation.                              |
| `WF-DRV-MP-001`   | `backlog`         | Codex2 | Codex    | `DRV-MP-001`, `DRV-MP-010`                               | Dependencies clear; can start any time. Matrix row + E2E-006 citation.                              |
| `WF-PARTNER-001`  | `backlog`         | Codex  | Claude2  | none                                                     | No predecessors. Matrix row + E2E-007 citation.                                                     |
| `PBK-CUTOVER-001` | `review_approved` | Codex  | Claude   | `PBK-UI-005`                                             | Approved work awaiting owner closeout to `dev`; runbook anchor exists on `claude2/pbk-cutover-001`. |
| `PROD-RAIL-001`   | `backlog`         | Codex2 | Codex    | none                                                     | No predecessors. Matrix row + `deploy-prod.yml` completion + WIF / Cloud SQL config.                |

### Group B — E2E Shell Coverage (5)

| ID                        | Status    | Owner   | Reviewer | Depends on        | Notes                                                     |
| ------------------------- | --------- | ------- | -------- | ----------------- | --------------------------------------------------------- |
| `TST-E2E-005-TGV`         | `backlog` | Codex   | Claude2  | `WF-TGV-001`      | Blocked until matrix row lands on `dev`.                  |
| `TST-E2E-006-DRV-MP`      | `backlog` | Gemini2 | Codex    | `WF-DRV-MP-001`   | Blocked until matrix row lands on `dev`.                  |
| `TST-E2E-007-PRT`         | `backlog` | Codex   | Claude2  | `WF-PARTNER-001`  | Blocked until matrix row lands on `dev`.                  |
| `TST-E2E-008-PBK-CUTOVER` | `backlog` | Codex2  | Claude2  | `PBK-CUTOVER-001` | Blocked until cutover runbook + matrix row are on `dev`.  |
| `TST-E2E-009-PROD-RAIL`   | `backlog` | Gemini2 | Gemini   | `PROD-RAIL-001`   | Blocked until prod rail config + matrix row are on `dev`. |

### Group C — Live Evidence Packs (3)

| ID             | Status    | Owner | Reviewer | Depends on | Notes                                                                                                   |
| -------------- | --------- | ----- | -------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `FWD-LIVE-001` | `backlog` | Codex | Codex2   | none       | Resolve 7 `EXT-002-BLK-*` blockers or produce a partial-mode sidecar pack.                              |
| `COM-LIVE-001` | `backlog` | Codex | Claude   | none       | CTI / recording / filing activation. Partial-mode sidecar allowed if CTI webhook env is still pending.  |
| `FIN-GOV-001`  | `backlog` | Codex | Codex2   | none       | Governance-aware billing/reporting pack: cost-center invoice, quota usage report, approval audit chain. |

### Group D — Status Truth (1)

| ID               | Status        | Owner  | Reviewer | Depends on | Notes                                              |
| ---------------- | ------------- | ------ | -------- | ---------- | -------------------------------------------------- |
| `DEV-STATUS-001` | `in_progress` | Codex2 | Claude   | none       | This document + sprint switch + task registration. |

### Roll-up

| Group                     | done  | review_approved | in_progress | backlog |
| ------------------------- | ----- | --------------- | ----------- | ------- |
| A — Workflow family gates | 0     | 1               | 0           | 4       |
| B — E2E shell coverage    | 0     | 0               | 0           | 5       |
| C — Live evidence packs   | 0     | 0               | 0           | 3       |
| D — Status truth          | 0     | 0               | 1           | 0       |
| **Total**                 | **0** | **1**           | **1**       | **12**  |

## 5. Owner Drift Note

The planning packet and current dispatch truth diverge on several tasks:

| Task              | Planning packet owner | Current owner | Note                                                                 |
| ----------------- | --------------------- | ------------- | -------------------------------------------------------------------- |
| `DEV-STATUS-001`  | Claude                | Codex2        | This task was availability-reassigned; this branch reflects that.    |
| `PBK-CUTOVER-001` | Claude2               | Codex         | Codex claimed and shipped the runbook while Claude2 was unavailable. |
| `PROD-RAIL-001`   | Gemini                | Codex2        | Reassigned at registration.                                          |
| `COM-LIVE-001`    | Gemini                | Codex         | Reassigned at registration.                                          |
| `FWD-LIVE-001`    | Gemini2               | Codex         | Reassigned at registration.                                          |

The planning packet remains the design-intent record. `ai-status.json` is the
dispatch truth. If this gap causes review conflict, the task should be
reassigned explicitly instead of silently editing history.

## 6. Sprint Switch and Active Slice Plan

### Sprint switch confirmation

`ai-status.json.sprint` now records:

```json
{
  "name": "phase1-v2-business-flow-gates",
  "phase": "Phase 1 v2 — Business Flow Gates",
  "wave": "phase1-v2-business-flow-gates",
  "started_at": "2026-05-19T02:33:50Z",
  "predecessor": {
    "name": "ui-redesign-wave-202605",
    "started_at": "2026-05-10T11:08:04Z"
  }
}
```

That switch is **not yet true on `origin/dev`**; it is true only in the
machine-truth branch state for this wave.

### Active slice (immediately dispatchable)

Per the planning packet dispatch graph and the dependency survey above:

1. Wave-1 design / matrix work that can start now:
   - `WF-TGV-001`
   - `WF-DRV-MP-001`
   - `WF-PARTNER-001`
   - `PROD-RAIL-001`
2. Wave-1 evidence packs that can start now:
   - `FWD-LIVE-001`
   - `COM-LIVE-001`
   - `FIN-GOV-001`
3. Single biggest unblock:
   - `PBK-CUTOVER-001` owner closeout to `dev`, which unlocks
     `TST-E2E-008-PBK-CUTOVER`.

### Wave-2 blockers

- `TST-E2E-005-TGV` waits on `WF-TGV-001`.
- `TST-E2E-006-DRV-MP` waits on `WF-DRV-MP-001`.
- `TST-E2E-007-PRT` waits on `WF-PARTNER-001`.
- `TST-E2E-008-PBK-CUTOVER` waits on `PBK-CUTOVER-001` reaching `done`.
- `TST-E2E-009-PROD-RAIL` waits on `PROD-RAIL-001`.

## 7. Codified Acceptance Bar

This restates the planning packet's wave-done definition in machine-truth
terms:

1. `ai-status.json` shows all 14 P0 tasks at `status = done`.
2. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on
   `origin/dev` contains rows for `WF-TGV-001`, `WF-DRV-MP-001`,
   `WF-PARTNER-001`, `WF-PBK-001`, `WF-PROD-001`.
3. `tests/e2e/E2E-005..009` exist and pass in their declared modes.
4. `support/sidecars/FWD-LIVE-001/`, `support/sidecars/COM-LIVE-001/`, and
   `support/sidecars/FIN-GOV-001/` exist with explicit gate verdicts.
5. `.github/workflows/deploy-prod.yml` no longer self-identifies as
   `SKELETON`, and `validate-config` succeeds for the configured prod project.
6. A Phase 1 v2 closeout packet is written and merged.

## 8. Risks and Open Items

| Severity | Item                                                                       | Why it matters                                                      | Mitigation owner                  |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- |
| high     | SA/SD v2 files are absent from every branch                                | Workers cannot cite the named v2 source files directly.             | wave lead / supervisor            |
| high     | `origin/dev` still lacks the planning packet and the 5 new workflow rows   | Trunk readers will under-report Phase 1 v2 scope.                   | owners of `WF-*` + planning merge |
| medium   | `PBK-CUTOVER-001` is approved but not closed out on `dev`                  | Keeps one v2 workflow family in a branch-only state.                | Codex                             |
| medium   | multiple owner drifts exist between planning intent and machine truth      | Can cause duplicate work or review thrash.                          | supervisor                        |
| medium   | Group C evidence packs depend on external systems staying explicitly gated | Wrong wording could over-claim live readiness.                      | task owners + reviewers           |
| low      | current L0/L1 collaboration guide still points only at v1 product truth    | New workers may miss v2 framing unless they read this packet first. | supervisor                        |
