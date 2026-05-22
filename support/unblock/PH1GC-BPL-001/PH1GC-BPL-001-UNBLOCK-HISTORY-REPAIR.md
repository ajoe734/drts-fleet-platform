# PH1GC-BPL-001 Unblock History Repair

## Scope

- Task: `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-BPL-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-22`

## Diagnosis

The parent is blocked by branch and delivery-history contamination, not by a
missing document.

1. Canonical machine truth already says the parent blocker is delivery-state,
   not content quality: `PH1GC-BPL-001` is `blocked` because
   `origin/dev` does not yet contain
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`.
2. The actual audit document was landed by Claude in doc batch commit
   `7dd7a23b428ed9c34af9f2e266d6ec6fd4f77e4d`
   on `origin/docs/ph1gc-doc-batch-1-20260522`, one commit ahead of `origin/dev`,
   with PR `#237`.
3. The expected task branches for both the parent and this unblock helper do not
   contain any task-scoped commit:
   - `codex/ph1gc-bpl-001-unblock-history-repair @ 6607dea8`
   - `codex2/ph1gc-bpl-001-unblock-history-repair @ 6607dea8`
   - both point at the same commit as `origin/dev @ 6607dea8`
   - neither has a task-specific remote branch
4. The only Codex2 branch carrying related PH1GC-BPL-001 work is the sidecar
   branch `origin/codex2/ph1gc-bpl-001-sidecar-acceptance @ 158629cc`, which
   contains only `support/sidecars/PH1GC-BPL-001/PH1GC-BPL-001-SIDECAR-ACCEPTANCE.md`.
   That work is real, but it belongs to a different task and does not repair the
   parent closeout path.
5. This leaves the control plane with a mismatch:
   the required parent artifact exists only on a batch-delivery branch,
   while the parent branch/worktree names and the unblock-helper branch/worktree
   names still resolve to clean `origin/dev`.

## Evidence

### Machine-truth anchors

- Canonical `ai-status.json` records:
  - `PH1GC-BPL-001` as `blocked`
  - `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR` as `in_progress`
- Parent `next` says:
  `origin/dev` is missing
  `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`,
  while the artifact exists only on
  `origin/docs/ph1gc-doc-batch-1-20260522 @ 7dd7a23b`, and the parent has no
  task-scoped commit/push metadata usable for `done`.
- `current-work.md` mirrors the same blocker and lists this helper task as the
  active repair lane.

### Branch and commit state

- `origin/dev @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `docs/ph1gc-doc-batch-1-20260522 @ 7dd7a23b428ed9c34af9f2e266d6ec6fd4f77e4d`
- `origin/codex2/ph1gc-bpl-001-sidecar-acceptance @ 158629cc66051e1c32c1107813d70f9e4c09430e`
- `codex/ph1gc-bpl-001-unblock-history-repair @ 6607dea8`
- `codex2/ph1gc-bpl-001-unblock-history-repair @ 6607dea8`
- `git show --stat 7dd7a23b -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  shows the parent artifact was created in the doc-batch commit.
- `git for-each-ref` shows no
  `origin/codex2/ph1gc-bpl-001-unblock-history-repair` remote branch before
  this repair.

## Exact Contamination

The contamination is a four-part mismatch:

1. Parent machine truth requires a task artifact on `origin/dev` or a normal
   task-scoped delivery path that can be reviewed and closed out.
2. The artifact was actually delivered in a shared batched branch
   (`origin/docs/ph1gc-doc-batch-1-20260522`) rather than on the parent task
   branch.
3. The expected parent and helper branch names were still empty aliases of
   `origin/dev`, so the branch/worktree identity for `PH1GC-BPL-001` provided
   no durable delivery evidence.
4. The nearest Codex2 work for the same parent family was pushed to a sidecar
   branch for a different task, which further obscures which branch should be
   treated as canonical for closeout.

This means the parent is not blocked by missing content. It is blocked because
the content landed outside the parent lane, while the parent lane's own
branch/worktree history still looks untouched.

## Non-Destructive Repair Path

Do not rewrite or force-push any shared branch. Repair by treating the doc-batch
delivery as canonical content evidence, then replaying parent closeout through a
normal branch or merge path.

1. Treat commit `7dd7a23b428ed9c34af9f2e266d6ec6fd4f77e4d` on
   `origin/docs/ph1gc-doc-batch-1-20260522` as the canonical content source for
   the parent artifact. The file is already authored and pushed there.
2. Keep the empty helper branches and the sidecar branch unchanged. They are
   contamination evidence and do not need history surgery.
3. Use one of these non-destructive replay paths:

   Path A: merge the existing doc-batch branch / PR `#237` into `dev`.
   After merge, parent owner `Codex` can close `PH1GC-BPL-001` against the now
   visible `origin/dev` artifact, using PR `#237` and commit `7dd7a23b` as the
   delivery evidence.

   Path B: if PR `#237` will not be merged as-is, replay only the parent file
   onto a task-specific branch with a normal cherry-pick or file replay, then
   push that branch and review it normally. No force-push is required because
   this creates a new commit instead of rewriting the shared batch branch.

4. Parent task should remain blocked only on the chosen replay path completing,
   not on ambiguity about where the artifact lives.

## Recommended Next Step For Parent

Set parent `PH1GC-BPL-001` next step to:

`History ambiguity resolved: parent artifact already exists on origin/docs/ph1gc-doc-batch-1-20260522@7dd7a23b (PR #237) while codex/codex2 helper branches stayed at origin/dev@6607dea8. Non-destructive replay path is to merge PR #237 into dev, then close PH1GC-BPL-001 against the merged artifact; if PR #237 cannot merge, re-land docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md from 7dd7a23b onto a task-scoped branch with a normal push/review.` 

## Why This Is Safe

- No branch history is rewritten.
- No force-push is required.
- The already-pushed content commit stays intact.
- The empty helper branches stay available for audit.
- The parent gets an explicit replay path tied to existing pushed evidence.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/current-work.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared related refs:
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads refs/remotes/origin | grep 'ph1gc-bpl-001'`
  - `git show-ref | grep 'ph1gc-bpl-001'`
- Verified content delivery commit:
  - `git show --no-patch --pretty=fuller 7dd7a23b`
  - `git show --stat --summary 7dd7a23b -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
- Verified helper branch contamination:
  - `git branch --show-current`
  - `git rev-parse --short HEAD`
  - `git branch -vv`
