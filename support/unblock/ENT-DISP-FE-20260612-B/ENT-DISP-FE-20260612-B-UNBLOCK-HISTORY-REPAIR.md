# ENT-DISP-FE-20260612-B Unblock History Repair

## Scope

- Task: `ENT-DISP-FE-20260612-B-UNBLOCK-HISTORY-REPAIR`
- Parent: `ENT-DISP-FE-20260612-B`
- Owner: `Codex`
- Reviewer: `Claude2`
- Audit timestamp: `2026-06-12`

## Diagnosis

The parent is blocked by a combination of helper-branch identity drift and an
integration-gate closeout mismatch, not by missing task commits.

1. The parent branch `origin/codex/ent-disp-fe-20260612-b` already contains the
   full B delivery stack on top of `ENT-DISP-FE-20260612-A`:
   `97297e1c` (anchor), `cbdd7ecf`, `8ec676e0`, and owner closeout
   `4145a37f`.
2. `git merge-base origin/dev origin/codex/ent-disp-fe-20260612-b` resolves to
   `19ecc7c1`, which is also `origin/codex/ent-disp-fe-20260612-a`, so the
   branch ancestry is task-correct and not rewritten.
3. The actual blocker recorded on the parent is the branch-strategy integration
   gate: closeout `4145a37f` is pushed on the task branch but is not merged to
   `origin/dev`, so `done` with branch-only evidence is refused by
   `docs/ops/branch-strategy.md` §11.6.
4. The supervisor-assigned helper branch
   `codex/ent-disp-fe-20260612-b-unblock-history-repair` was auto-created from
   `origin/dev @ 0cb53c20` and had no task-specific remote branch or artifact
   before this repair. Its reflog reports `branch: Created from origin/dev`.
5. That means the helper worktree initially landed on the same tip as unrelated
   completed work now on `origin/dev`, rather than on a B-specific unblock
   anchor. The branch/worktree contamination is identity drift on the helper
   rail, not corruption of the parent task branch.

## Evidence

### Parent branch state

- `origin/codex/ent-disp-fe-20260612-b @ 4145a37f`
- `origin/codex/ent-disp-fe-20260612-a @ 19ecc7c1`
- `origin/dev @ 0cb53c20`
- `git merge-base origin/dev origin/codex/ent-disp-fe-20260612-b`
  => `19ecc7c1`
- `git rev-list --left-right --count origin/dev...origin/codex/ent-disp-fe-20260612-b`
  => `2 4`
- `git rev-list --left-right --count origin/codex/ent-disp-fe-20260612-a...origin/codex/ent-disp-fe-20260612-b`
  => `0 4`
- `git cherry -v origin/dev origin/codex/ent-disp-fe-20260612-b`
  shows `97297e1c`, `cbdd7ecf`, and `8ec676e0` as still absent from `dev`,
  while closeout `4145a37f` is metadata-only and does not satisfy the gate.

### Helper branch / worktree drift

- local `codex/ent-disp-fe-20260612-b-unblock-history-repair @ 0cb53c20`
  before this repair commit
- upstream for the helper branch was `origin/dev`, not a task-specific remote
  branch
- `git reflog show --date=iso codex/ent-disp-fe-20260612-b-unblock-history-repair`
  reported:
  `0cb53c20 ... branch: Created from origin/dev`
- `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/codex/ent-disp-fe-20260612-b* refs/remotes/origin/codex/ent-disp-fe-20260612-b*`
  showed:
  - `codex/ent-disp-fe-20260612-b 4145a37f origin/codex/ent-disp-fe-20260612-b`
  - `codex/ent-disp-fe-20260612-b-sidecar-review fa16bb27 origin/codex/ent-disp-fe-20260612-b-sidecar-review`
  - `codex/ent-disp-fe-20260612-b-unblock-history-repair 0cb53c20 origin/dev`
  - no pre-existing `origin/codex/ent-disp-fe-20260612-b-unblock-history-repair`

### Mergeability

- `git merge-tree 19ecc7c1 origin/dev origin/codex/ent-disp-fe-20260612-b`
  produced a normal merged tree for the B shell/primitives files and did not
  surface conflict markers.
- `git diff --name-status origin/dev...origin/codex/ent-disp-fe-20260612-b`
  is limited to the enterprise-dispatch shell/primitives surface:
  app routes, `enterprise-shell`, `enterprise-primitives`, fixtures/theme, and
  shared canvas token primitives.

## Exact Contamination

The contamination is not a damaged parent branch. It is the mismatch between:

1. a valid parent task branch that already contains the intended B commits,
2. a helper worktree branch that was created directly from `origin/dev` and
   therefore carried unrelated tip identity,
3. and machine truth on the parent that correctly blocks `done` until a normal
   merge to `dev`, but did not yet have a task-scoped helper artifact spelling
   out that the required next step is integration rather than history rewrite.

## Non-Destructive Repair Path

Do not force-push or rewrite any shared branch.

1. Add this helper artifact on the expected
   `codex/ent-disp-fe-20260612-b-unblock-history-repair` branch and push it as a
   normal forward commit, so the supervisor-assigned helper rail now has
   task-specific identity.
2. Leave `origin/codex/ent-disp-fe-20260612-b @ 4145a37f` untouched. Its
   history is already linear and correctly rooted at `19ecc7c1`.
3. Open or resume a normal non-force integration path from
   `origin/codex/ent-disp-fe-20260612-b` into `dev`.
4. After that merge lands on `origin/dev`, rerun parent closeout with concrete
   `merged_to_dev` evidence instead of `branch_pushed`.
5. If the team decides B is superseded rather than merged, that requires an
   explicit parent-task reopen/rescope. Nothing in the current branch history
   requires force-push repair.

## Concrete Unblocked Next Step For Parent

For `ENT-DISP-FE-20260612-B`, the next operator step is:

`merge origin/codex/ent-disp-fe-20260612-b into dev via a normal PR/merge, then rerun owner done with INTEGRATION_STATUS=merged_to_dev and the resulting dev commit evidence`

## Why This Is Safe

- No existing branch or commit is rewritten.
- The helper branch gains identity through a normal additive commit.
- The parent branch remains available as-is for audit and integration.
- The repair aligns machine truth with the actual next action: merge, not force
  push.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected task machine truth with `scripts/ai-status.sh show`
- Compared branch/worktree state with:
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex/ent-disp-fe-20260612-b-unblock-history-repair`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/codex/ent-disp-fe-20260612-b* refs/remotes/origin/codex/ent-disp-fe-20260612-b*`
  - `git merge-base origin/dev origin/codex/ent-disp-fe-20260612-b`
  - `git rev-list --left-right --count origin/dev...origin/codex/ent-disp-fe-20260612-b`
  - `git rev-list --left-right --count origin/codex/ent-disp-fe-20260612-a...origin/codex/ent-disp-fe-20260612-b`
  - `git cherry -v origin/dev origin/codex/ent-disp-fe-20260612-b`
  - `git merge-tree 19ecc7c1b2dbd2e99733394fc4b88ce9564d4688 origin/dev origin/codex/ent-disp-fe-20260612-b`
  - `git diff --name-status origin/dev...origin/codex/ent-disp-fe-20260612-b`
