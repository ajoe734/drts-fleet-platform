# I18N-OPS-02 Unblock History Repair

## Scope

- Task: `I18N-OPS-02-UNBLOCK-HISTORY-REPAIR`
- Parent: `I18N-OPS-02`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-04`

## Diagnosis

The parent is not blocked by missing task delivery. It is blocked by a stale
history-repair helper branch/worktree that was auto-created from `origin/dev`
instead of the already-pushed parent branch.

1. The actual owner parent branch already exists locally and on origin as
   `codex2/i18n-ops-02 @ 5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
   with closeout subject `I18N-OPS-02: record closeout verification`.
2. The assigned helper branch
   `codex2/i18n-ops-02-unblock-history-repair @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
   was created directly from `origin/dev`, as confirmed by the branch reflog:
   `branch: Created from origin/dev`.
3. The helper branch is not descended from the pushed parent tip. Its merge-base
   with `codex2/i18n-ops-02` is only `94c3aa2d`, which is also current
   `origin/dev`, so the helper branch omits all three parent commits:
   `3f825e70`, `e86ee5f2`, and `5f7e103b`.
4. The helper branch now also exists on origin as
   `origin/codex2/i18n-ops-02-unblock-history-repair @ fa867106`, but that ref
   only publishes this audit on top of the stale helper lineage. The only
   canonical owner delivery rail remains `origin/codex2/i18n-ops-02 @ 5f7e103b`.
5. A similarly named reviewer-lane branch also exists as
   `codex/i18n-ops-02 @ 94c3aa2d [origin/dev]`, which reinforces that the
   contamination is branch-routing ambiguity, not missing product work.

## Evidence

### Branch and worktree state

- `origin/dev @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- local + remote parent branch
  `codex2/i18n-ops-02 @ 5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
- local + remote helper branch
  `codex2/i18n-ops-02-unblock-history-repair @ fa8671068f43f15086efdb4e096f89959222bd80`
- parent worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-ops-02`
- helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-ops-02-unblock-history-repair`
- `git rev-list --left-right --count codex2/i18n-ops-02-unblock-history-repair...origin/codex2/i18n-ops-02`
  returns `0 3`, proving the helper branch is exactly three parent commits
  behind the pushed owner branch.
- `git diff --name-status codex2/i18n-ops-02-unblock-history-repair...origin/codex2/i18n-ops-02`
  shows only the parent task files:
  - `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
  - `apps/ops-console-web/lib/translations.ts`
- `git reflog show refs/heads/codex2/i18n-ops-02-unblock-history-repair`
  reports `branch: Created from origin/dev`.
- `git ls-remote --heads origin` confirms:
  - `refs/heads/codex2/i18n-ops-02 @ 5f7e103b`
  - `refs/heads/codex2/i18n-ops-02-unblock-history-repair @ fa867106`

### Parent provenance

- `git show --stat --summary --name-only 5f7e103b` confirms the parent already
  has a formal closeout commit carrying:
  - `LLM-Agent: codex2`
  - `Task-ID: I18N-OPS-02`
  - `Reviewer: Codex`
- `git log --graph --oneline codex2/i18n-ops-02 origin/dev` shows the parent's
  three task commits sit strictly on top of `94c3aa2d`:
  - `3f825e70 wip(I18N-OPS-02): anchor dispatch detail i18n`
  - `e86ee5f2 I18N-OPS-02: clean dispatch detail glossary`
  - `5f7e103b I18N-OPS-02: record closeout verification`

### PR visibility

- `gh pr list --head codex2:i18n-ops-02 --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  returned `[]`
- `gh pr list --head codex2:i18n-ops-02-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  returned `[]`

## Exact Contamination

The contamination is a three-part mismatch:

1. The parent task already has a pushed owner branch and closeout commit.
2. The helper branch with the `-unblock-history-repair` stem was auto-created
   from `origin/dev`, not from the pushed parent branch, and still carries that
   stale ancestry even after the audit commit was pushed to origin.
3. The helper branch therefore excludes the canonical parent delivery commits
   and cannot be used as the branch of record for review, resume, or closeout.

This is branch/worktree/commit contamination, not missing implementation work.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any branch. Repair by treating the pushed
parent branch as canonical and this helper branch as audit evidence only.

1. Reuse the existing parent worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-ops-02`
   on branch `codex2/i18n-ops-02`.
2. Treat `origin/codex2/i18n-ops-02 @ 5f7e103b...` as the only valid owner
   closeout rail for `I18N-OPS-02`.
3. Leave `codex2/i18n-ops-02-unblock-history-repair` unmerged. Its only purpose
   is to store this contamination audit.
4. Do not reopen or rebase the helper branch to continue parent work. Any future
   parent resume must happen on `codex2/i18n-ops-02`.
5. Return the parent task to its real remaining blocker: acceptance closure is
   still waiting on the existing validation-baseline issue or reviewer decision,
   not on missing branch history.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The pushed owner parent branch remains unchanged.
- The helper branch stays available as task-scoped diagnostic evidence.
- The parent can resume on the correct branch name without replaying commits.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Compared related branch and worktree state:
  - `git branch -vv | grep 'i18n-ops-02'`
  - `git worktree list --porcelain`
  - `git log --oneline --decorate --graph --max-count=25 codex2/i18n-ops-02-unblock-history-repair codex2/i18n-ops-02 origin/dev --`
  - `git merge-base codex2/i18n-ops-02-unblock-history-repair codex2/i18n-ops-02`
  - `git rev-parse codex2/i18n-ops-02-unblock-history-repair codex2/i18n-ops-02 origin/dev`
  - `git rev-list --left-right --count codex2/i18n-ops-02-unblock-history-repair...origin/codex2/i18n-ops-02`
  - `git diff --name-status codex2/i18n-ops-02-unblock-history-repair...origin/codex2/i18n-ops-02`
  - `git reflog show --date=iso refs/heads/codex2/i18n-ops-02-unblock-history-repair`
  - `git ls-remote --heads origin 'refs/heads/codex2/i18n-ops-02' 'refs/heads/codex2/i18n-ops-02-unblock-history-repair' 'refs/heads/codex/i18n-ops-02'`
- Confirmed parent provenance:
  - `git show --stat --summary --name-only 5f7e103b`
  - `git show --stat --summary --name-only 94c3aa2d`
- Checked GitHub PR visibility for both parent and helper branch heads:
  - `gh pr list --head codex2:i18n-ops-02 --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  - `gh pr list --head codex2:i18n-ops-02-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
