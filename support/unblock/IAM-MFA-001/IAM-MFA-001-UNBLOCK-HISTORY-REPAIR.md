# IAM-MFA-001 Unblock History Repair

## Scope

- Task: `IAM-MFA-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-MFA-001`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Audit timestamp: `2026-08-03T07:11:14+00:00`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-mfa-001-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-mfa-001-unblock-history-repair`

## Diagnosis

`IAM-MFA-001` is blocked by branch / worktree evidence contamination, not by a
missing implementation diff. The implementation tree already exists on the
parent's canonical owner rail, but the helper repair rail was created from the
wrong base SHA and there is still an older same-tree anchor rail that can be
mistaken for the real delivery branch.

1. `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001` reports the parent as
   `blocked`, with `next` explicitly naming
   `codex2/iam-mfa-001 @ c317d8365b5751b5583820d64578bc38b9d6e85c` as the owner
   closeout commit now waiting on integration review.
2. `codex2/iam-mfa-001 @ c317d8365b5751b5583820d64578bc38b9d6e85c` is the only
   rail that carries the formal owner closeout commit
   `feat(IAM-MFA-001): enforce trusted step-up proof for privileged actions`.
3. `codex/iam-mfa-001` and `gemini2/iam-mfa-001` both point at
   `6dd795b70fdbe6861b598e3a3fe401d1c43ac7e6`, an older WIP anchor commit
   `wip(IAM-MFA-001): anchor step-up proof policy`.
4. `git diff --quiet codex/iam-mfa-001 codex2/iam-mfa-001` exits `0`, so the
   old owner rail and the canonical owner rail have identical tree contents.
5. `git range-diff origin/dev..codex/iam-mfa-001
   origin/dev..codex2/iam-mfa-001` shows the history delta is commit metadata
   and closeout identity only:
   - same patch content
   - older branch uses WIP subject / older trailers
   - canonical branch uses final feature subject and current owner/reviewer
     trailers plus verification note
6. `git reflog show --date=iso codex/iam-mfa-001` proves the stale rail was
   created from `origin/dev` on `2026-08-02`, committed once, then rebased onto
   `74aa50ad`, which is unrelated `origin/dev` history.
7. `git reflog show --date=iso codex2/iam-mfa-001` proves the canonical rail
   was created fresh from `origin/dev` on `2026-08-03 01:59:00 +0000` and then
   received one clean owner closeout commit `c317d836`.
8. `git reflog show --date=iso codex/iam-mfa-001-unblock-history-repair` shows
   this helper branch was also created directly from `origin/dev` at
   `74aa50ad`, before any repair evidence existed.
9. `git worktree list --porcelain` shows the helper worktree for
   `codex/iam-mfa-001-unblock-history-repair` and the unrelated helper worktree
   for `codex/iam-uat-001-unblock-history-repair` both attached to the same
   `74aa50ad` SHA. That confirms the helper rail was provisioned as a blank
   duplicate worktree, not as a continuation of the parent rail.
10. `gh pr list --state all --head codex/iam-mfa-001`,
    `--head codex2/iam-mfa-001`, `--head gemini/iam-mfa-001`, and
    `--head gemini2/iam-mfa-001` all return `[]`. There is no active PR yet,
    so the clean integration route must start from the canonical branch named in
    machine truth, not from any previously opened review rail.

## Evidence

### Canonical parent rail

- machine truth names:
  `codex2/iam-mfa-001 @ c317d8365b5751b5583820d64578bc38b9d6e85c`
- `git show --stat --summary c317d836` reports the formal closeout commit:
  `feat(IAM-MFA-001): enforce trusted step-up proof for privileged actions`
- `git rev-list --left-right --count origin/dev...codex2/iam-mfa-001` reports
  `0 1`
- `git ls-remote --heads origin 'refs/heads/codex2/iam-mfa-001'` confirms the
  remote head exists at the same SHA

### Stale same-tree rail

- local / remote branch:
  `codex/iam-mfa-001 @ 6dd795b70fdbe6861b598e3a3fe401d1c43ac7e6`
- `git show --stat --summary 6dd795b7` reports only the older WIP anchor commit
- `git rev-list --left-right --count origin/dev...codex/iam-mfa-001` reports
  `0 1`
- `git ls-remote --heads origin 'refs/heads/codex/iam-mfa-001'` confirms the
  remote head exists at the same SHA
- `git ls-remote --heads origin 'refs/heads/gemini2/iam-mfa-001'` prints
  nothing, so the reviewer-side same-SHA branch exists only locally

### Exact history delta

- `git diff --quiet codex/iam-mfa-001 codex2/iam-mfa-001` exits `0`
- `git range-diff origin/dev..codex/iam-mfa-001
  origin/dev..codex2/iam-mfa-001` reports a one-commit replacement:
  `6dd795b7 ! c317d836`
- the file list and patch sizes from `git show --stat --summary` are identical
  across both commits:
  - 12 files changed
  - 1322 insertions
  - 24 deletions

### Helper branch / worktree contamination

- `git rev-parse HEAD`, `git merge-base HEAD origin/dev`, and
  `git rev-parse origin/dev` all resolve to
  `74aa50add1066f51c1ddaabc35251f46c8bfb648`
- `git rev-list --left-right --count origin/dev...HEAD` reports `0 0`
- `git show-ref --heads | rg 'iam-mfa-001-unblock-history-repair|iam-uat-001-unblock-history-repair'`
  shows both helper branches point at the same `74aa50ad` SHA
- `git worktree list --porcelain` shows:
  - helper worktree
    `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-mfa-001-unblock-history-repair`
    attached to `codex/iam-mfa-001-unblock-history-repair`
  - unrelated helper worktree
    `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-uat-001-unblock-history-repair`
    attached to `codex/iam-uat-001-unblock-history-repair`
  - both helper heads currently equal `74aa50ad`

### PR state

- `gh pr list --state all --head codex/iam-mfa-001 --json ...` returns `[]`
- `gh pr list --state all --head codex2/iam-mfa-001 --json ...` returns `[]`
- `gh pr list --state all --head gemini/iam-mfa-001 --json ...` returns `[]`
- `gh pr list --state all --head gemini2/iam-mfa-001 --json ...` returns `[]`

## Exact Contamination

The exact contamination is a three-part identity split:

1. The implementation patch exists on two owner-facing branches with different
   head SHAs but identical tree contents.
2. Machine truth already chose `codex2/iam-mfa-001 @ c317d836...` as the
   canonical owner rail, while the older `codex/iam-mfa-001 @ 6dd795b7...`
   branch still exists remotely and can be mistaken for the live branch by
   name alone.
3. The dedicated helper repair branch / worktree was provisioned at plain
   `origin/dev @ 74aa50ad`, so the "repair" rail initially contained zero task
   evidence and visually resembled another helper worktree for a different task.

That combination blocks safe continuation because a future worker could choose
the wrong branch, believe the helper worktree contains task state when it does
not, or open the first PR from the stale WIP rail instead of from the canonical
owner closeout rail.

## Non-Destructive Repair Path

Do not force-push any branch. Do not rewrite or delete the stale rails.

1. Treat `codex2/iam-mfa-001 @ c317d836...` as the only canonical owner rail
   for `IAM-MFA-001`.
2. Treat `codex/iam-mfa-001 @ 6dd795b7...` and local-only
   `gemini2/iam-mfa-001 @ 6dd795b7...` as audit evidence only.
3. Treat `codex/iam-mfa-001-unblock-history-repair @ 74aa50ad...` as the
   documentation rail for this helper task only. It is not a code continuation
   branch for the parent.
4. Open or continue integration only from the canonical owner branch:

```bash
git fetch origin
git switch codex2/iam-mfa-001
gh pr create --base dev --head codex2/iam-mfa-001 \
  --title "IAM-MFA-001: enforce trusted step-up proof for privileged actions"
```

5. Have `Gemini` review the canonical PR / SHA only. Ignore
   `codex/iam-mfa-001` for review, merge, and closeout evidence.
6. After CI and review pass, merge the canonical PR to `dev`. Only then may the
   parent task move past the integration gate from branch-only evidence.

## Concrete Parent Next Step

As of `2026-08-03`, `IAM-MFA-001` can proceed without any history rewrite, but
only on the canonical rail already named in machine truth:

1. Resume from `codex2/iam-mfa-001 @ c317d836...`.
2. Open the missing PR from `codex2/iam-mfa-001` to `dev`.
3. Run CI on that PR head and request `Gemini` review there.
4. Ignore `codex/iam-mfa-001`, `gemini2/iam-mfa-001`, and the helper branch for
   all future integration evidence.

## Why This Is Safe

- No shared history is rewritten.
- No force-push is required.
- The parent already has a clean single-commit owner rail on `codex2`.
- The stale WIP rail remains preserved as audit evidence.
- The helper worktree contamination is neutralized by documentation rather than
  by risky branch surgery.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `docs/ops/branch-strategy.md` with focus on §11
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh start IAM-MFA-001-UNBLOCK-HISTORY-REPAIR "Documenting canonical IAM-MFA-001 rail and helper worktree contamination"`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001`
- Inspected local branch / worktree state:
  - `git branch --show-current`
  - `git status --short`
  - `git fetch origin --prune`
  - `git branch -vv | rg 'iam-mfa-001|iam-idp-001|iam-idp-002|iam-ses-002'`
  - `git show-ref --heads | rg 'iam-mfa-001($|-unblock-history-repair)|iam-uat-001-unblock-history-repair'`
  - `git worktree list --porcelain`
  - `git rev-parse HEAD`
  - `git merge-base HEAD origin/dev`
  - `git rev-parse origin/dev`
  - `git rev-list --left-right --count origin/dev...codex/iam-mfa-001`
  - `git rev-list --left-right --count origin/dev...codex2/iam-mfa-001`
  - `git rev-list --left-right --count origin/dev...HEAD`
  - `git log --oneline --decorate --graph --max-count=20 origin/dev..codex/iam-mfa-001`
  - `git log --oneline --decorate --graph --max-count=20 origin/dev..codex2/iam-mfa-001`
  - `git reflog show --date=iso codex/iam-mfa-001`
  - `git reflog show --date=iso codex2/iam-mfa-001`
  - `git reflog show --date=iso codex/iam-mfa-001-unblock-history-repair`
  - `git diff --quiet codex/iam-mfa-001 codex2/iam-mfa-001`
  - `git range-diff origin/dev..codex/iam-mfa-001 origin/dev..codex2/iam-mfa-001`
  - `git show --stat --summary 6dd795b7`
  - `git show --stat --summary c317d836`
  - `git ls-remote --heads origin 'refs/heads/codex/iam-mfa-001' 'refs/heads/codex2/iam-mfa-001' 'refs/heads/gemini2/iam-mfa-001' 'refs/heads/codex/iam-mfa-001-unblock-history-repair'`
- Inspected GitHub PR state:
  - `gh pr list --state all --head codex/iam-mfa-001 --json number,title,state,url,headRefName,baseRefName,headRefOid,updatedAt`
  - `gh pr list --state all --head codex2/iam-mfa-001 --json number,title,state,url,headRefName,baseRefName,headRefOid,updatedAt`
  - `gh pr list --state all --head gemini/iam-mfa-001 --json number,title,state,url,headRefName,baseRefName,headRefOid,updatedAt`
  - `gh pr list --state all --head gemini2/iam-mfa-001 --json number,title,state,url,headRefName,baseRefName,headRefOid,updatedAt`

No application code or runtime tests were changed or rerun in this helper task.
This repair is limited to branch / commit / worktree / PR evidence and
machine-truth triage.
