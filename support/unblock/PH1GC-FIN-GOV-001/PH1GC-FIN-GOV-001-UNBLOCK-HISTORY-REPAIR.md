# PH1GC-FIN-GOV-001 Unblock History Repair

## Scope

- Task: `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-FIN-GOV-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-22`

## Diagnosis

The parent is blocked by owner-lane branch/worktree/commit contamination, not by
a missing spec or UAT commit.

1. The canonical spec and UAT already landed on `origin/dev` in
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
   (`PH1GC-DOC-BATCH-1`), which includes
   `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
   and `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`.
2. The parent owner branch `codex2/ph1gc-fin-gov-001` is still a local-only ref
   at that merged doc-batch commit. There is still no
   `origin/codex2/ph1gc-fin-gov-001`.
3. The helper branches, not the parent branch, accumulated the unblock
   diagnosis:
   - `origin/codex/ph1gc-fin-gov-001-unblock-manual-unblock @ 0d4ac04b`
   - `origin/codex2/ph1gc-fin-gov-001-unblock-history-repair @ 8080d204`
4. The task was then reassigned from `Codex2` to `Codex`, but the assigned
   branch/worktree `codex/ph1gc-fin-gov-001-unblock-history-repair` was still a
   local alias of `origin/dev @ 6607dea8` with no task-scoped artifact. The
   current owner therefore inherited an empty helper branch while the latest
   history-repair evidence still lived on a different owner's helper branch.
5. The real follow-on delivery inputs already exist on separate remote branches:
   - `origin/claude2/wf-fin-gov-001-e2e @ ddc02c4e24ecf924e83d47f0cc86c1c21ce223f6`
     with source commits `f450a1e8` and `ddc02c4e`
   - `origin/codex2/ph1gc-matrix-002 @ 07b3a245a87a93fbea09c806e8a7ea5c085d3df5`

The blockage is therefore history contamination, not missing content. The
parent has merged docs on `dev`, audit notes on helper branches, and replay
inputs on separate delivery branches, but still no pushed owner branch where
those inputs have been replayed together.

## Evidence

### Branch and worktree state

- `origin/dev @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- local `codex2/ph1gc-fin-gov-001 @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- local + remote
  `codex/ph1gc-fin-gov-001-unblock-history-repair @ dffe0af26e9e671e13f41b1e38af5fd33eb9325b`
- local + remote
  `codex2/ph1gc-fin-gov-001-unblock-history-repair @ 8080d204d0b86105e57044f69a69babb435964a7`
- local + remote
  `codex/ph1gc-fin-gov-001-unblock-manual-unblock @ 0d4ac04bd198595843f960bfd7bf0a8e8266f4ea`
- `git ls-remote --heads origin` returns no refs for:
  - `refs/heads/codex2/ph1gc-fin-gov-001`
- `git ls-remote --heads origin` confirms these related pushed refs:
  - `refs/heads/codex/ph1gc-fin-gov-001-unblock-history-repair @ dffe0af2`
  - `refs/heads/codex2/ph1gc-fin-gov-001-unblock-history-repair @ 8080d204`
  - `refs/heads/codex/ph1gc-fin-gov-001-unblock-manual-unblock @ 0d4ac04b`
  - `refs/heads/claude2/wf-fin-gov-001-e2e @ ddc02c4e`
  - `refs/heads/codex2/ph1gc-matrix-002 @ 07b3a245`
- `git branch -vv` shows `codex2/ph1gc-fin-gov-001` still tracking
  `origin/dev`, while `codex/ph1gc-fin-gov-001-unblock-history-repair` now
  tracks its own pushed helper ref after the lane repair; before `dffe0af2`
  that reassigned branch was still an empty alias of `origin/dev`
- `git worktree list --porcelain` shows separate worktrees for:
  - `codex2/ph1gc-fin-gov-001`
  - `codex2/ph1gc-fin-gov-001-unblock-history-repair`
  - `codex/ph1gc-fin-gov-001-unblock-history-repair`
  - `codex/ph1gc-fin-gov-001-unblock-manual-unblock`
- `git show --name-only --stat 6607dea8` confirms the PH1GC-FIN-GOV-001 spec
  and UAT already merged through the doc-batch commit, so the remaining gap is
  not a missing parent artifact on `dev`

### Machine-truth anchors

- Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json` marks
  `PH1GC-FIN-GOV-001` as `blocked`
- Before owner closeout, parent `next` still lagged on stale helper-tip wording
  (`d6a6bb69`) even though the real replay work was already clear: reuse local
  `codex2/ph1gc-fin-gov-001`, replay `f450a1e8`, `ddc02c4e`, and `07b3a245`,
  then push `origin/codex2/ph1gc-fin-gov-001`
- Canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
  records the history-repair helper as originally started under `Codex2` at
  `2026-05-22T08:37:16Z` and proactively reassigned to `Codex` at
  `2026-05-22T09:47:41Z`

## Exact Contamination

The contamination is a two-layer mismatch:

1. Parent contamination:
   `PH1GC-FIN-GOV-001` already points at merged doc work on `origin/dev`, but
   the actual owner branch `codex2/ph1gc-fin-gov-001` never became a pushed
   replay branch. That leaves the remaining E2E + matrix work with no canonical
   owner history.
2. Helper-lane contamination after reassignment:
   the latest repair evidence lived on `origin/codex2/ph1gc-fin-gov-001-unblock-history-repair`,
   while the currently assigned branch `codex/ph1gc-fin-gov-001-unblock-history-repair`
   was still an empty alias of `origin/dev`. The current owner could not close
   the task from the dispatched branch until the evidence was rehomed onto the
   current helper lane.

This explains why the parent stayed blocked even though:

- the spec and UAT are already on `origin/dev`
- the manual-unblock diagnosis is already on `origin/codex/ph1gc-fin-gov-001-unblock-manual-unblock`
- the E2E and matrix inputs already exist on other pushed branches

The missing piece is a single canonical owner replay branch for the parent, plus
current-owner helper evidence for this unblock task.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any existing branch.

### Step 1: repair the helper evidence lane

Use the currently assigned helper branch
`codex/ph1gc-fin-gov-001-unblock-history-repair` for the task-scoped artifact
and push it as a new remote branch. This commit is that lane repair. Leave
`origin/codex2/ph1gc-fin-gov-001-unblock-history-repair` untouched as older
audit evidence.

### Step 2: resume the parent on its owner branch

Reuse the existing worktree
`/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001`
on local branch `codex2/ph1gc-fin-gov-001`. Its current tip `6607dea8` is a
clean `origin/dev` anchor, even though it is not yet a canonical remote ref.

From that branch, replay the already-pushed delivery work in order:

1. Replay the governance-aware E2E commits from
   `origin/claude2/wf-fin-gov-001-e2e`:
   - `f450a1e8` `feat(WF-FIN-GOV-001-E2E): add governance-aware billing/reporting E2E-010 shell`
   - `ddc02c4e` `feat(WF-FIN-GOV-001-E2E): bind invoice evidence to governed booking and harden FG-08/FG-09`
2. Replay `origin/codex2/ph1gc-matrix-002 @ 07b3a245` after the E2E work so
   the `WF-FIN-GOV-001` / `E2E-010` matrix row rides on the same owner branch.
3. Push that replay result as the first canonical owner remote:

```bash
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 fetch origin
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 cherry-pick f450a1e8 ddc02c4e
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 cherry-pick 07b3a245
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 push -u origin codex2/ph1gc-fin-gov-001
```

4. After the push succeeds, hand the parent back for review on that pushed owner
   branch instead of on any helper branch:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-FIN-GOV-001 Codex \
  "History repair complete: resume review on origin/codex2/ph1gc-fin-gov-001 after replaying WF-FIN-GOV-001-E2E (f450a1e8, ddc02c4e) and PH1GC-MATRIX-002 (07b3a245). The branch was previously local-only at merged doc-batch commit 6607dea8; no force-push or branch rename required."
```

5. If any cherry-pick conflict appears, record that as a normal implementation
   blocker on `PH1GC-FIN-GOV-001`; do not reopen history repair unless the
   parent branch itself becomes ambiguous again.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The merged doc-batch commit on `origin/dev` stays untouched.
- The older helper branches remain valid audit evidence.
- The parent resumes on its own owner branch name instead of borrowing a helper
  branch as a pseudo-canonical history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  and `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared related branch and worktree state:
  - `git branch -vv | grep 'ph1gc-fin-gov-001'`
  - `git worktree list --porcelain | grep -n 'ph1gc-fin-gov-001'`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-fin-gov-001-unblock-history-repair' 'refs/heads/codex2/ph1gc-fin-gov-001-unblock-history-repair' 'refs/heads/codex2/ph1gc-fin-gov-001' 'refs/heads/codex/ph1gc-fin-gov-001-unblock-manual-unblock' 'refs/heads/claude2/wf-fin-gov-001-e2e' 'refs/heads/codex2/ph1gc-matrix-002'`
  - `git log --oneline --decorate --graph --max-count=30 --all --grep='PH1GC-FIN-GOV-001\\|FIN-GOV-001'`
- Confirmed merged doc-batch provenance:
  - `git show --stat --summary --name-only 6607dea8`
- Confirmed the follow-on commits are already pushed elsewhere:
  - `git show --stat --summary ddc02c4e`
  - `git show --stat --summary 07b3a245`

## Closeout Evidence

- Current helper-lane repair branch:
  `origin/codex/ph1gc-fin-gov-001-unblock-history-repair @ dffe0af2`
- Preserved older audit-only helper branch:
  `origin/codex2/ph1gc-fin-gov-001-unblock-history-repair @ 8080d204`
- Existing review PR for the older helper lane remains open at
  `https://github.com/ajoe734/drts-fleet-platform/pull/244`; formal owner
  closeout on the reassigned `codex/...` lane must carry its own commit/push
  evidence and refresh the parent machine-truth `next` field to the replay
  sequence described above.
