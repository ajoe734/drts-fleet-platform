# I18N-ADM-06 Unblock History Repair

## Scope

- Task: `I18N-ADM-06-UNBLOCK-HISTORY-REPAIR`
- Parent: `I18N-ADM-06`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-04T10:03:20Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-adm-06-unblock-history-repair`
- Assigned helper branch:
  `codex2/i18n-adm-06-unblock-history-repair`

## Diagnosis

`I18N-ADM-06` is not blocked by a missing owner commit. It is blocked by a
branch/worktree routing split between the real parent rail and the newly
assigned helper rail.

1. The real owner worktree already exists at
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-adm-06`
   on branch `codex2/i18n-adm-06`.
2. That parent branch contains the task commit
   `36e21b6ee80bcc20ffa0df587416282622d43be9`
   (`wip(I18N-ADM-06): anchor tenants i18n centralization`), which carries the
   actual tenant list/detail i18n centralization diff.
3. Before this repair, the parent branch existed only locally. There was no
   `origin/codex2/i18n-adm-06` remote ref and no PR for that branch, so the
   parent's canonical task content was not available on a shared review rail.
4. The assigned helper branch
   `codex2/i18n-adm-06-unblock-history-repair` was created later at
   `2026-06-04 10:03:20 +0000` directly from `origin/dev @ 94c3aa2d` and
   contains no task-specific history at all.
5. The helper branch head `94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25` is an
   unrelated merged commit from `PA-AI-E2E-001`, not an ancestor or extension
   of the parent task commit.
6. The parent task's existing machine-truth blocker is still real after the
   branch repair: acceptance remains blocked by baseline platform-admin
   typecheck/build failures outside this task. History repair only fixes the
   missing shared branch rail; it does not claim those unrelated failures are
   resolved.

## Evidence

### Parent rail

- local parent branch:
  `codex2/i18n-adm-06 @ 36e21b6ee80bcc20ffa0df587416282622d43be9`
- parent worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-adm-06`
- parent reflog:
  - `2026-06-04 09:18:35 +0000`: branch created from `origin/dev`
  - `2026-06-04 09:34:45 +0000`: commit `36e21b6e`
- task commit subject:
  `wip(I18N-ADM-06): anchor tenants i18n centralization`
- task commit trailers:
  - `LLM-Agent: codex2`
  - `Task-ID: I18N-ADM-06`
  - `Reviewer: Codex`
- parent diff vs `origin/dev` before any closeout replay:
  - `apps/platform-admin-web/app/tenants/page.tsx`
  - `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`
  - `apps/platform-admin-web/lib/translations.ts`

### Helper rail contamination

- assigned helper branch:
  `codex2/i18n-adm-06-unblock-history-repair @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- helper reflog:
  - `2026-06-04 10:03:20 +0000`: branch created from `origin/dev`
- helper branch log contains no `I18N-ADM-06` commit
- helper branch head subject:
  `PA-AI-E2E-001: fix llm gateway Nest injection at startup (#520)`
- remote helper ref before this repair:
  absent from `git ls-remote --heads origin 'codex2/i18n-adm-06-unblock-history-repair'`

### Shared review evidence repaired by this task

- pushed parent ref:
  `origin/codex2/i18n-adm-06 @ 36e21b6ee80bcc20ffa0df587416282622d43be9`
- `git rev-list --left-right --count codex2/i18n-adm-06...origin/codex2/i18n-adm-06`
  returns `0 0`
- GitHub now advertises the normal PR creation URL for the pushed parent branch:
  `https://github.com/ajoe734/drts-fleet-platform/pull/new/codex2/i18n-adm-06`
- `gh pr list --head codex2/i18n-adm-06 --state all` currently returns no PRs

## Exact Contamination

The contamination is a three-part mismatch:

1. The parent task's real implementation existed only in the owner worktree on
   `codex2/i18n-adm-06`, while the helper dispatch pointed at a separate branch
   created later from clean `origin/dev`.
2. The helper branch name looks canonical for the unblock task but actually
   carries zero `I18N-ADM-06` evidence, so a reviewer following that rail lands
   on unrelated merged trunk history.
3. Because the owner branch was not pushed yet, the task had no shared remote
   rail for review or replay even though the actual task diff already existed
   locally.

This is branch/worktree/commit contamination, not missing delivery work.

## Non-Destructive Repair Path

Do not force-push, rebase, or rewrite any shared branch.

1. Treat `origin/codex2/i18n-adm-06 @ 36e21b6e...` as the canonical parent
   evidence rail for the tenant i18n changes.
2. Preserve `codex2/i18n-adm-06-unblock-history-repair` as the diagnostic
   helper branch that documents the mismatch instead of trying to transplant the
   parent diff onto it.
3. Push the parent branch normally, which this task has now done, so reviewers
   and later owner replays have a shared remote ref.
4. Record this repair packet on the helper branch and push that branch normally
   as audit evidence.
5. Leave the parent task blocked on its actual remaining issue:
   unrelated platform-admin typecheck/build baseline failures. When that blocker
   is addressed or explicitly waived, resume the parent from the already-pushed
   owner branch instead of reopening this helper branch.

## Concrete Parent Next Step

`I18N-ADM-06` should continue from the pushed owner branch, not from the helper
branch.

1. Use `origin/codex2/i18n-adm-06 @ 36e21b6e...` as the canonical branch for
   any later review or closeout.
2. Keep the parent status blocked until the unrelated platform-admin baseline
   failures named in machine truth are cleared or waived.
3. Once that upstream blocker clears, re-run the required parent verification on
   the existing pushed branch and then continue the normal owner flow
   (`handoff -> approve -> done`) on `I18N-ADM-06`.
4. Ignore `codex2/i18n-adm-06-unblock-history-repair @ 94c3aa2d` for parent
   delivery. Its purpose is only to preserve this diagnosis.

## Why This Is Safe

- no shared history is rewritten
- no force-push is required
- the parent branch now has a normal remote ref
- the helper branch remains available as audit evidence
- the real parent blocker stays explicit instead of being hidden behind branch
  ambiguity

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- inspected parent/helper branch and worktree state:
  - `git worktree list --porcelain | grep -nA2 -B1 'codex2/i18n-adm-06'`
  - `git branch -vv --all | grep 'i18n-adm-06'`
  - `git log --oneline --decorate --max-count=20 codex2/i18n-adm-06`
  - `git reflog show --date=iso codex2/i18n-adm-06`
  - `git reflog show --date=iso codex2/i18n-adm-06-unblock-history-repair`
  - `git show --stat --summary 36e21b6e`
  - `git show --no-patch --pretty=fuller 94c3aa2d`
  - `git merge-base 36e21b6e origin/dev`
  - `git rev-list --left-right --count origin/dev...36e21b6e`
  - `git ls-remote --heads origin 'codex2/i18n-adm-06' 'codex2/i18n-adm-06-unblock-history-repair'`
- repaired the shared parent rail:
  - `git push -u origin codex2/i18n-adm-06`
  - `git rev-list --left-right --count codex2/i18n-adm-06...origin/codex2/i18n-adm-06`
- checked PR visibility:
  - `gh pr list --head codex2/i18n-adm-06 --state all --json number,title,headRefName,baseRefName,state,url,isDraft`

No runtime tests were run. This task is branch/history evidence repair only.

## Owner Closeout Evidence

- Closeout timestamp: `2026-06-04T10:12:05Z`
- Approved helper branch head:
  `origin/codex2/i18n-adm-06-unblock-history-repair @ 02014bc067a8e85c1d0ce090426ae343d2bbbf7c`
- `git rev-list --left-right --count origin/codex2/i18n-adm-06-unblock-history-repair...HEAD`
  returns `0 0`
- `git status --branch --short` at closeout shows only the task artifact change on
  `codex2/i18n-adm-06-unblock-history-repair`
- Closeout integration level for this helper task is `branch_pushed`; this task
  only repairs shared branch/history evidence and does not represent a dev
  deployment
