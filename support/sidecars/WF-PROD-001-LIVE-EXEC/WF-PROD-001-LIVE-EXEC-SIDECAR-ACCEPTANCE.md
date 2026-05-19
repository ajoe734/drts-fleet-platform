# WF-PROD-001-LIVE-EXEC Sidecar Acceptance Packet

This document is a support-only acceptance packet for `WF-PROD-001-LIVE-EXEC`.
It does not modify canonical truth. It consolidates the current machine-truth
state, dependency map, and reviewer notes after the dispatch brief was found to
be stale relative to `ai-status.json`.

Anchors used here come from:

- `ai-status.json`
- `current-work.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`

## 1. Scope Boundary

- **Packet Artifact:** `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- **Parent Task:** `WF-PROD-001-LIVE-EXEC`
- **Helper Kind:** `acceptance_packet`
- **Mutates Canonical:** `false`
- **Objective:** prepare a reviewer-facing support packet for the held first
  live production deploy task without changing parent machine truth, workflow
  code, or product/runtime contracts.

Guardrails:

- This packet is support-only. It does not claim the parent task is ready to
  execute.
- `ai-status.json` is authoritative over the embedded task brief when they
  disagree.
- No attempt is made here to repair missing canonical artifacts or reassign the
  parent owner/reviewer.

## 2. Machine-Truth Anchors

### 2.1 Parent task row - `WF-PROD-001-LIVE-EXEC`

At packet refresh time, shared machine truth records:

| Field | Value |
| --- | --- |
| Title | `Production deploy live execution (HELD)` |
| Owner | `Gemini` |
| Reviewer | `Gemini2` |
| Status | `blocked` |
| Depends on | `PROD-SPEC-001`, `PROD-DRILL-001` |
| Artifact | `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` |
| Planning ref | `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` |
| Next | `Held — see conflicts doc / external resources` |
| Last update | `2026-05-19T14:52:33Z` |
| Waiting for | `Gemini2` |

`current-work.md` matches that row: `WF-PROD-001-LIVE-EXEC` is still `blocked`
and still depends on `PROD-SPEC-001` and `PROD-DRILL-001`.

Artifact resolution snapshot in this worktree:

| Path from machine truth | Resolution |
| --- | --- |
| `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` | missing |
| `docs/03-runbooks/production-deploy-rail-spec-20260519.md` | missing |
| `docs/03-runbooks/production-rollback-drill-20260519.md` | missing |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` | present |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` | present |

### 2.2 Dispatch mismatch that the reviewer must know

The dispatch brief embedded in this session is not current:

- it describes the sidecar as already in `review`
- it says the parent owner/reviewer are `Claude2` / `Codex`
- it says the packet should be refreshed against a sidecar row that does not
  currently exist in `ai-status.json`
- it names `support/sidecars/WF-PROD-001-LIVE-EXEC/...` as the artifact path,
  while the parent row still points at
  `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`

This packet therefore uses live machine truth, not the stale dispatch snapshot.

### 2.3 Sidecar control-plane state

At packet refresh time:

- `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE` is not present in
  `ai-status.json`
- no pending handoff row exists for this sidecar task in `current-work.md`
- because the task row does not exist, lifecycle commands such as `start`,
  `progress`, `handoff`, `approve`, or `done` cannot be recorded for this
  sidecar without first adding the task to machine truth

Reviewer implication:

- treat this file as a support artifact created under dispatch, but not yet
  backed by a canonical sidecar task row
- if the supervisor expects a tracked sidecar lifecycle, the control-plane row
  must be created separately before reviewer/owner state transitions are
  possible

## 3. Dependency Map

### 3.1 `PROD-SPEC-001` - production deploy rail spec

Current machine truth:

| Field | Value |
| --- | --- |
| Owner | `Codex2` |
| Reviewer | `Gemini2` |
| Status | `review` |
| Artifact | `docs/03-runbooks/production-deploy-rail-spec-20260519.md` |
| Last update | `2026-05-19T15:14:44Z` |
| Next | `Added docs/03-runbooks/production-deploy-rail-spec-20260519.md formalizing WF-PROD-001 from prod-deploy-rollback-runbook + PROD-RAIL-CLOSEOUT-EVIDENCE; verified source alignment by reading deploy-prod workflow/runbook/evidence; task commit 2bee5bb pushed to origin/codex2/prod-spec-001` |

Packet note:

- the artifact path recorded in `ai-status.json` does not exist in this
  worktree at packet refresh time
- the underlying source anchors that row refers to do exist:
  `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` and
  `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
- parent reviewers should not treat `PROD-SPEC-001` as materially reviewable in
  this worktree until that missing artifact file is present or the machine truth
  is corrected

### 3.2 `PROD-DRILL-001` - production rollback drill protocol

Current machine truth:

| Field | Value |
| --- | --- |
| Owner | `Gemini2` |
| Reviewer | `Gemini` |
| Status | `backlog` |
| Artifact | `docs/03-runbooks/production-rollback-drill-20260519.md` |
| Last update | `2026-05-19T14:52:33Z` |
| Next | `Awaiting owner pickup (phase1-v3 wave)` |

Reviewer implication:

- the parent task cannot be accepted as live-execution ready while
  `PROD-DRILL-001` remains `backlog`
- this is a hard machine-truth dependency, not a soft follow-up
- the recorded artifact path
  `docs/03-runbooks/production-rollback-drill-20260519.md` is also missing in
  this worktree, so there is no local drill protocol to review yet

### 3.3 Existing production rail evidence already in repo

`support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
proves only the dry-run/static-contract rail:

- `deploy-prod.yml` has real `validate-config`, `build-push`, `migrate`,
  `deploy`, and `health-check` jobs
- `tests/e2e/E2E-009-prod-rail-dry-run.sh` passed as a static contract check
- the repo still explicitly does not claim a real production deploy, Cloud Run
  revision, Cloud SQL migration, or WIF-authenticated live execution

This means the parent `WF-PROD-001-LIVE-EXEC` remains external-resource gated
even if the runbook rail itself is structurally complete.

## 4. Parent Acceptance Checklist

These are the reviewer-facing gates implied by the current dependency state.
They are framed as hold conditions because the parent is still `blocked`.

### A. Machine-truth gates

- [ ] `WF-PROD-001-LIVE-EXEC` remains blocked until both `PROD-SPEC-001` and
  `PROD-DRILL-001` are no longer open dependencies.
- [ ] The parent artifact path in `ai-status.json` resolves to a real evidence
  file before any live-execution handoff is considered complete.
- [ ] Parent owner/reviewer assignment is taken from `ai-status.json`
  (`Gemini` / `Gemini2`), not from this stale dispatch brief.

### B. Production-rail gates

- [ ] The deploy rail requirements in
  `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` are satisfied:
  GitHub `production` environment reviewer rule, prod variables/secrets, WIF,
  runtime service account, Cloud SQL target, Secret Manager entries, and
  Artifact Registry wiring.
- [ ] A real `prod/vYYYY.MM.DD.N` tag exists on `origin` for the live run.
- [ ] The first actual `gh workflow run deploy-prod.yml -f tag=prod/v...`
  completes `validate-config -> build-push -> migrate -> deploy -> health-check`
  successfully.

### C. Rollback/drill gates

- [ ] `PROD-DRILL-001` produces the formal rollback drill protocol and evidence
  template referenced by machine truth.
- [ ] A rollback owner/approver path exists and the live packet records whether
  migration ran or was skipped, the workflow run URL, health results, and any
  rollback decision per the runbook evidence section.

### D. Sidecar guardrails

- [x] This packet only creates or updates support material.
- [x] No canonical truth, workflow code, or runtime implementation was edited.
- [x] The packet explicitly preserves the non-claim boundary between dry-run
  rail evidence and real prod execution evidence.

## 5. Reviewer Handoff Notes

1. The first review question is not "is the packet written cleanly"; it is
   whether the supervisor/control plane intends this sidecar to exist at all,
   because there is no sidecar row in `ai-status.json`.
2. If the sidecar is meant to be tracked, add the machine-truth task row first,
   then replay lifecycle state with `scripts/ai-status.sh`; otherwise this file
   can only be treated as an untracked support note.
3. The packet should not be used to imply that `WF-PROD-001-LIVE-EXEC` is
   review-ready. Current truth still says `blocked`.
4. `PROD-SPEC-001` needs a follow-up verification pass in this branch/worktree
   because its recorded artifact path is missing here even though the row is in
   `review`.
5. `PROD-DRILL-001` is still `backlog`; parent acceptance must reject any claim
   of live prod readiness until that dependency closes.

## 6. Packet Verification

Verification performed for this packet:

- read `AI_COLLABORATION_GUIDE.md`
- read `ai-status.json` and `current-work.md`
- read `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- read `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- read `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
- confirmed that `docs/03-runbooks/production-deploy-rail-spec-20260519.md`
  is missing in this worktree despite being referenced by `PROD-SPEC-001`
- confirmed that `docs/03-runbooks/production-rollback-drill-20260519.md` is
  missing in this worktree despite being referenced by `PROD-DRILL-001`
- confirmed that `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
  is missing in this worktree despite being referenced by
  `WF-PROD-001-LIVE-EXEC`
- confirmed that `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE` is absent from
  `ai-status.json`

No runtime tests were run because this change is documentation-only and the
sidecar task has no machine-truth row to transition.
