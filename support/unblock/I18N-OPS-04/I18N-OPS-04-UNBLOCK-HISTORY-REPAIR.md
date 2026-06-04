# I18N-OPS-04 Unblock History Repair

## Scope

- Task: `I18N-OPS-04-UNBLOCK-HISTORY-REPAIR`
- Parent: `I18N-OPS-04`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-04`

## Diagnosis

The parent is blocked by published branch ancestry contamination, not by missing
driver i18n edits.

1. `origin/dev` is currently at `94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`.
2. The current owner rail for the parent is `origin/codex2/i18n-ops-04 @
   4f5e71c92c9a8c6d7c303a45ef465876de54976c`.
3. That owner rail does not fork directly from `origin/dev`. Its merge-base
   with both `origin/dev` and `codex2/i18n-wp0` is the same
   `94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`, and
   `git rev-list --left-right --count codex2/i18n-wp0...codex2/i18n-ops-04`
   returns `1 3`, proving the branch is stacked on top of the private WP0
   commit `4e925b0df2073e8eccfb868b49dbc8bd7213db6a`.
4. That inherited WP0 commit carries unrelated guard, CI, and shared
   translation-foundation changes in `.github/workflows/ci.yml`,
   `.husky/pre-commit`, `scripts/i18n-guard.mjs`,
   `scripts/i18n-guard-baseline.json`, `apps/ops-console-web/lib/i18n.tsx`,
   `apps/ops-console-web/lib/localized-labels.ts`,
   `apps/platform-admin-web/lib/localized-labels.ts`, and both app translation
   modules. Those surfaces are outside `I18N-OPS-04` acceptance.
5. The reviewer rail `origin/codex/i18n-ops-04 @
   6f8e506cfb63b022b4f52f2d45aa75ad93ad2c77` lands the same task on top of
   clean `origin/dev` ancestry, proving the task implementation is valid while
   the published owner ancestry is not.

## Evidence

### Branch and worktree state

- `origin/dev @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- local-only reviewer worktree branch
  `codex/i18n-ops-04-unblock-history-repair @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- published owner parent rail
  `origin/codex2/i18n-ops-04 @ 4f5e71c92c9a8c6d7c303a45ef465876de54976c`
- published reviewer parent rail
  `origin/codex/i18n-ops-04 @ 6f8e506cfb63b022b4f52f2d45aa75ad93ad2c77`
- prior helper audit rail
  `origin/codex2/i18n-ops-04-unblock-history-repair @ 464e9bc985bd3207c7e49dcf4aa6f93092091d10`

### Canonical change evidence

- task commit
  `6a32c1d578b1e9f4dc1b1c3a081794dedc979c13`
  `I18N-OPS-04-UNBLOCK-HISTORY-REPAIR: document owner-rail ancestry contamination`
- push target
  `origin/codex/i18n-ops-04-unblock-history-repair`
- task PR
  `https://github.com/ajoe734/drts-fleet-platform/pull/525`
- prior related audit PR
  `https://github.com/ajoe734/drts-fleet-platform/pull/522`

- `git rev-list --left-right --count origin/dev...codex2/i18n-ops-04`
  returns `0 3`, confirming the owner rail is only three commits ahead of dev.
- `git rev-list --left-right --count codex2/i18n-wp0...codex2/i18n-ops-04`
  returns `1 3`, confirming the owner rail is stacked on top of WP0's private
  commit instead of branching directly from dev.
- `git diff --stat origin/dev..codex2/i18n-ops-04` shows only the five driver
  i18n task files:
  `app/drivers/[driverId]/page.tsx`, `app/drivers/drivers-table.tsx`,
  `app/drivers/page.tsx`, `components/driver-platform-actions.tsx`, and
  `lib/translations.ts`.
- `git diff --stat 4e925b0d..codex2/i18n-ops-04` still includes the unrelated
  WP0 foundation footprint beneath those five task files, proving the final tree
  is acceptable but the ancestry is contaminated.
- `git diff --stat codex2/i18n-ops-04..origin/codex/i18n-ops-04` shows only a
  10-line glossary delta in `apps/ops-console-web/lib/translations.ts`. This is
  a clean-rail review refinement, not evidence that the owner branch needs the
  WP0 foundation commit.

### Parent provenance

- `git show --stat --summary --name-only 4e925b0d` confirms the inherited WP0
  dependency commit touched CI, husky, guard scripts, and shared translation
  infrastructure outside the parent task scope.
- `git log --oneline origin/dev..codex2/i18n-ops-04` confirms the owner rail is
  exactly three task commits:
  `47f4d479`, `a1dfe85f`, and `4f5e71c9`.
- `git log --oneline origin/dev..origin/codex/i18n-ops-04` confirms the clean
  reviewer rail is `c6a726eb`, `4570b055`, and formal closeout
  `6f8e506c`.
- `git show --stat --summary --name-only 6f8e506c` confirms the reviewer rail
  already closes out successfully on top of `origin/dev`.

## Exact Contamination

The contamination is the published owner rail, not the task diff itself:

1. `codex2/i18n-ops-04` was branched from `codex2/i18n-wp0` after WP0's private
   commit `4e925b0d`, not from `origin/dev`.
2. The branch therefore appears to depend on unrelated guard, CI, and shared
   translation-foundation edits outside `I18N-OPS-04` acceptance.
3. Because `origin/codex2/i18n-ops-04` is already published and referenced by
   the parent machine-truth status, repairing that ancestry in place would
   require rewriting shared history.

This is branch/worktree/commit contamination. The blocking issue is the owner
rail's ancestry, not missing task implementation.

## Non-Destructive Repair Path

Do not force-push or rewrite `origin/codex2/i18n-ops-04`.

1. Leave `origin/codex2/i18n-ops-04 @ 4f5e71c9...` in place as contamination
   evidence only.
2. Reuse `origin/codex/i18n-ops-04 @ 6f8e506c...` as proof that the driver i18n
   tree can close out directly on top of `origin/dev`.
3. Create a fresh owner recovery rail from `origin/dev`, then cherry-pick only
   the task commits from the clean reviewer rail:
   `c6a726eb`, `4570b055`, and, if the glossary wording should match the latest
   owner branch exactly, manually port the `4f5e71c9` glossary delta as a final
   clean commit on top.
4. Create a formal owner closeout commit on that fresh rail with
   `LLM-Agent: Codex2`, `Task-ID: I18N-OPS-04`, and `Reviewer: Codex`, then push
   the new branch normally.
5. Resume the parent task from that fresh clean rail instead of from the
   contaminated published branch.

Concrete command sequence for the parent owner:

```bash
git fetch origin
git switch -c codex2/i18n-ops-04-repair origin/dev
git cherry-pick c6a726eb
git cherry-pick 4570b055
# Port the 4f5e71c9 glossary-only wording if the owner wants the same final copy.
git commit --allow-empty -m "I18N-OPS-04: finalize drivers i18n centralization closeout" \
  -m "LLM-Agent: Codex2" \
  -m "Task-ID: I18N-OPS-04" \
  -m "Reviewer: Codex"
git push -u origin codex2/i18n-ops-04-repair
```

## Why This Is Safe

- No remote ref is rewritten.
- No force-push is required.
- The contaminated owner rail remains available as audit evidence.
- The clean reviewer rail already proves the task can close on top of
  `origin/dev`.
- The parent can resume from a fresh branch with correct ancestry and the same
  task-scoped file tree.

## Concrete Unblocked Next Step

The parent owner should stop advancing `origin/codex2/i18n-ops-04` and instead
create `codex2/i18n-ops-04-repair` from `origin/dev`, cherry-pick the clean
reviewer task commits, then hand that new rail back to review. That unblocks the
parent without rewriting any shared branch history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Queried machine-truth task slices:
  - `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-04`
  - `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-04-UNBLOCK-HISTORY-REPAIR`
- Compared related branch and worktree state:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git branch -r | grep 'codex/i18n-ops-04\\|codex2/i18n-ops-04' | sort`
  - `git log --graph --oneline --decorate --boundary origin/dev..codex/i18n-ops-04 origin/dev..codex/i18n-ops-04-unblock-history-repair origin/dev..codex2/i18n-ops-04-unblock-history-repair origin/dev..codex2/i18n-ops-04 --`
  - `git merge-base origin/dev codex2/i18n-ops-04`
  - `git merge-base origin/dev codex2/i18n-wp0`
  - `git rev-list --left-right --count origin/dev...codex2/i18n-ops-04`
  - `git rev-list --left-right --count codex2/i18n-wp0...codex2/i18n-ops-04`
  - `git diff --stat origin/dev..codex2/i18n-ops-04`
  - `git diff --stat 4e925b0d..codex2/i18n-ops-04`
  - `git diff --stat codex2/i18n-ops-04..origin/codex/i18n-ops-04`
- Confirmed parent provenance:
  - `git show --stat --summary --name-only 4e925b0d`
  - `git show --stat --summary --name-only 47f4d479`
  - `git show --stat --summary --name-only a1dfe85f`
  - `git show --stat --summary --name-only 4f5e71c9`
  - `git show --stat --summary --name-only c6a726eb`
  - `git show --stat --summary --name-only 4570b055`
  - `git show --stat --summary --name-only 6f8e506c`
- Recorded task-scoped publish evidence:
  - `git push -u origin codex/i18n-ops-04-unblock-history-repair`
  - `gh pr list --head codex/i18n-ops-04-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  - `gh pr create --base dev --head codex/i18n-ops-04-unblock-history-repair --title "I18N-OPS-04-UNBLOCK-HISTORY-REPAIR: document owner-rail ancestry contamination" --draft`
