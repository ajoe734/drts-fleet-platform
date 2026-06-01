# PH1GC-FWD-001 Unblock History Repair

## Scope

- Task: `PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-FWD-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-24`

## Diagnosis

This helper branch/worktree was dispatched for `PH1GC-FWD-001`, but it was not
created on top of the forwarder parent branch. The branch exists only as a
local alias of an unrelated `PH1GC-PROD-001` closeout commit, so the intended
repair artifact was never created and the helper has no remote or PR evidence.

1. `refs/heads/codex2/ph1gc-fwd-001-unblock-history-repair` was created from
   `origin/dev` at `a7f88919fd15385ff32d5f70f05c74d5b36d7122` on
   `2026-05-22 10:54:01 +0000`.
2. The current `HEAD` of this helper worktree is still exactly that same commit
   `a7f88919`, whose subject is
   `docs(PH1GC-PROD-001): finalize owner closeout`.
3. `git log --oneline --decorate --max-count=1` shows the same `a7f88919`
   commit is shared by multiple unrelated branches, including:
   - `codex2/ph1gc-fwd-001-unblock-history-repair`
   - `codex2/ph1gc-partner-002-unblock-planning-decision`
   - `codex/ph1gc-pbk-001`
   - `claude2/ph1gc-prod-001`
4. The helper artifact declared in machine truth,
   `support/unblock/PH1GC-FWD-001/PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR.md`,
   did not exist in this worktree before this repair commit.
5. The real parent proof-set lives on
   `origin/codex2/ph1gc-fwd-001 @ bf1a1256846dce552ca780e1afbf7bd4b5176324`,
   which is `10` commits ahead of `origin/dev` and contains the forwarder
   sidecar files that are absent from this helper branch.
6. There was no remote helper branch
   `origin/codex2/ph1gc-fwd-001-unblock-history-repair` and no PR from that
   head before this repair, so the unblock path had no task-scoped push/PR
   evidence at all.

## Exact Contamination

The contamination is branch/worktree history contamination, not a code merge
conflict.

1. The helper branch name points at an unrelated `PH1GC-PROD-001` closeout
   commit instead of a `PH1GC-FWD-001` repair commit.
2. The worktree therefore starts from a commit graph that does not carry the
   parent branch's forwarder proof-set history.
3. Because the helper had no remote ref and no artifact file, the task existed
   in `ai-status.json` but had no corresponding git evidence on its own branch.
4. If someone resumed `PH1GC-FWD-001` work from this helper branch, they would
   silently miss the real parent branch content already present on
   `origin/codex2/ph1gc-fwd-001`.

## Evidence

### Helper branch state before repair

- `git reflog show refs/heads/codex2/ph1gc-fwd-001-unblock-history-repair --date=iso`
  recorded only one event: branch creation from `origin/dev` at `a7f88919`.
- `git rev-list --left-right --count origin/dev...HEAD` returned `15 0`,
  showing this helper branch was not a forwarder delta on top of `dev`; it was
  just sitting on a newer unrelated history line.
- `git show --stat --summary --oneline HEAD` showed only a `PH1GC-PROD-001`
  closeout change.
- `git ls-remote --heads origin 'refs/heads/codex2/ph1gc-fwd-001-unblock-history-repair'`
  returned nothing.
- `gh pr list --head codex2/ph1gc-fwd-001-unblock-history-repair --state all`
  returned `[]`.

### Canonical parent replay surface

- `git ls-remote --heads origin 'refs/heads/codex2/ph1gc-fwd-001'` resolved to
  `bf1a1256846dce552ca780e1afbf7bd4b5176324`.
- `git log --oneline origin/dev..origin/codex2/ph1gc-fwd-001` showed the
  forwarder-only stack ending at
  `bf1a1256 wip(PH1GC-FWD-001): record external sandbox blocker`.
- `git diff --name-only origin/dev..origin/codex2/ph1gc-fwd-001` showed the
  parent branch owns the forwarder sidecar and status-truth updates, including:
  - `support/sidecars/FWD-LIVE-001/README.md`
  - `support/sidecars/FWD-LIVE-001/PH1GC-FWD-001-BLOCKER-20260524.md`
  - `support/sidecars/FWD-LIVE-001/PH1GC-FWD-001-CLOSEOUT-20260523.md`
  - `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`

## Non-Destructive Repair Path

Do not rewrite or force-push any shared ref. Repair by making this helper branch
an explicit audit record and by reaffirming the real parent replay target.

1. Keep `origin/codex2/ph1gc-fwd-001 @ bf1a1256846dce552ca780e1afbf7bd4b5176324`
   as the canonical repo-local parent branch for `PH1GC-FWD-001`.
2. Treat this helper branch as audit-only. It is not a replay surface for the
   parent proof-set because it was created from `origin/dev` and then left on an
   unrelated `PH1GC-PROD-001` tip.
3. Create the missing task artifact on this helper branch, push it normally to
   `origin/codex2/ph1gc-fwd-001-unblock-history-repair`, and open a task-scoped
   PR so the unblock path has its own durable evidence.
4. Resume future forwarder work only from
   `origin/codex2/ph1gc-fwd-001 @ bf1a1256846dce552ca780e1afbf7bd4b5176324`
   until fresh external sandbox material is available.
5. Leave the parent `PH1GC-FWD-001` in `blocked`; this repair only fixes the
   contaminated helper history, not the missing external forwarder bundle.

## Concrete Parent Next Step

`PH1GC-FWD-001` should remain `blocked` with a branch-aware next step:

> `2026-05-24`: `PH1GC-FWD-001` remains externally blocked. The canonical
> repo-local replay branch is
> `origin/codex2/ph1gc-fwd-001 @ bf1a1256846dce552ca780e1afbf7bd4b5176324`.
> Do not resume from `codex2/ph1gc-fwd-001-unblock-history-repair`; that helper
> branch was created from `origin/dev` on `2026-05-22` and initially pointed at
> unrelated `PH1GC-PROD-001` history. Wait for the real external forwarder
> sandbox bundle: reachable sandbox host, masked credential reference, webhook
> signing metadata, callback lifecycle samples, replay/idempotency proof,
> settlement retrieval proof, and no-owned-assignment evidence. When those
> inputs arrive, continue on `origin/codex2/ph1gc-fwd-001`, not on any helper
> branch.

## Why This Is Safe

- No shared branch is rebased
- No force-push is required
- The real parent branch remains unchanged
- The contaminated helper branch becomes explicit audit evidence instead of an
  accidental replay target
- The repair clarifies branch ownership and preserves all existing refs

## Closeout Evidence

- Reviewed task-owned anchor commit:
  `a1718d27f4e488fd8fb764760c3ba1ee6461a8c6`
  (`wip(PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR): anchor helper history diagnosis`)
- Reviewer approval was recorded against
  `origin/codex2/ph1gc-fwd-001-unblock-history-repair@a1718d27` on
  `2026-05-24T15:31:46Z`
- Task-scoped remote branch exists:
  `origin/codex2/ph1gc-fwd-001-unblock-history-repair`
- Task-scoped draft PR remains open to `dev`:
  `#277 https://github.com/ajoe734/drts-fleet-platform/pull/277`
- Canonical parent replay branch remains:
  `origin/codex2/ph1gc-fwd-001 @ bf1a1256846dce552ca780e1afbf7bd4b5176324`
- Owner closeout requirement for this dispatch is therefore limited to a formal
  non-force closeout commit plus `done` machine-truth finalization; no history
  rewrite or parent-branch replay is required

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical machine truth in
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Compared refs and worktrees:
  - `git branch --show-current`
  - `git status --short`
  - `git log --oneline --decorate --graph --max-count=25`
  - `git branch -vv`
  - `git worktree list --porcelain`
  - `git reflog show refs/heads/codex2/ph1gc-fwd-001-unblock-history-repair --date=iso`
  - `git ls-remote --heads origin 'refs/heads/codex2/ph1gc-fwd-001' 'refs/heads/codex2/ph1gc-fwd-001-unblock-history-repair' 'refs/heads/codex/ph1gc-fwd-001-unblock-history-repair' 'refs/heads/codex/ph1gc-fwd-001-unblock-manual-unblock'`
- Verified parent branch composition:
  - `git log --oneline origin/dev..origin/codex2/ph1gc-fwd-001`
  - `git diff --name-only origin/dev..origin/codex2/ph1gc-fwd-001`
- Verified helper-branch absence:
  - `gh pr list --head codex2/ph1gc-fwd-001-unblock-history-repair --state all --json number,title,state,isDraft,url,headRefName,baseRefName`
