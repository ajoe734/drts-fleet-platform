# I18N-OPS-04 Unblock History Repair

## Scope

- Task: `I18N-OPS-04-UNBLOCK-HISTORY-REPAIR`
- Parent alias in machine truth: `I18N-OPS-04`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-04`

## Current Diagnosis

The stale unblock note was diagnosing the wrong problem.

1. `origin/codex2/i18n-ops-04 @ 4f5e71c9` does fork directly from
   `origin/dev @ 94c3aa2d`. Its first task commit `47f4d479` has parent
   `94c3aa2d`, so the current owner rail is not stacked on top of
   `4e925b0d`.
2. The real contamination is lane/history divergence after the shared middle
   state. `origin/codex2/i18n-ops-04` and `origin/codex/i18n-ops-04` share the
   same base `94c3aa2d`, but they diverge into different task trees:
   `git rev-list --left-right --count origin/codex2/i18n-ops-04...origin/codex/i18n-ops-04`
   returns `3 5`.
3. The two rails briefly converge on the same content tree:
   `a1dfe85f` on `codex2/i18n-ops-04` and `4570b055` on `codex/i18n-ops-04`
   both resolve to tree `7ac1b5874e3382cf3c0f0bd285fbdbf7de33599c`.
4. After that shared tree, the owner rail adds only
   `4f5e71c9 "normalize driver i18n glossary"`, while the reviewer rail carries
   formal closeout `6f8e506c`, then an extra content commit `c1dc37c4`, then
   closeout `3ea01e2d`.
5. Because both tails mutate the same three files
   (`app/drivers/[driverId]/page.tsx`, `app/drivers/drivers-table.tsx`,
   `lib/translations.ts`), the published owner rail is not the accepted final
   tree and cannot be repaired by pretending both branches already match.
6. There is a second unblock gap in machine truth: this helper task points to
   parent alias `I18N-OPS-04`, but `scripts/ai-status.sh show I18N-OPS-04`
   returns `Task not found: I18N-OPS-04`. Even after the rail choice is clear,
   auto-resume cannot target the parent until that alias is mapped to a real
   task ID.

## Exact Contamination

The blocking contamination is a crossed-lane history:

1. Owner work started on `codex2/i18n-ops-04` with commits `47f4d479`,
   `a1dfe85f`, and `4f5e71c9`.
2. Reviewer work recreated the same mid-state on `codex/i18n-ops-04` as
   `c6a726eb` and `4570b055`, then closed that state at `6f8e506c`.
3. Additional accepted content was later committed only on the reviewer rail as
   `c1dc37c4`, followed by passing closeout `3ea01e2d`.
4. The result is that the accepted branch state lives on the reviewer namespace
   (`origin/codex/i18n-ops-04`), while the original owner namespace
   (`origin/codex2/i18n-ops-04`) remains a divergent WIP rail.

This is branch/commit contamination by mixed ownership and stale closeout
identity, not by WP0 ancestry.

## Evidence

### Branch state

- `origin/dev @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- `origin/codex2/i18n-ops-04 @ 4f5e71c92c9a8c6d7c303a45ef465876de54976c`
- `origin/codex/i18n-ops-04 @ 3ea01e2dee5c7e5c294ab0be826b47b0b53de645`
- task branch
  `origin/codex/i18n-ops-04-unblock-history-repair @ 86072889`
- earlier helper rail
  `origin/codex2/i18n-ops-04-unblock-history-repair @ 52f0d654`

### Commit graph facts

- `47f4d479^ == 94c3aa2d`, so the current owner rail starts from `origin/dev`.
- `c6a726eb^ == 94c3aa2d`, so the reviewer rail also starts from `origin/dev`.
- `git merge-base origin/codex2/i18n-ops-04 origin/codex/i18n-ops-04`
  returns `94c3aa2d`.
- `git rev-list --left-right --count origin/codex2/i18n-ops-04...origin/codex/i18n-ops-04`
  returns `3 5`.
- `a1dfe85f` and `4570b055` have the same tree object
  `7ac1b5874e3382cf3c0f0bd285fbdbf7de33599c`.
- `6f8e506c` has the same tree as `4570b055`, so it is a formal closeout of the
  shared middle state, not a content delta.
- `c1dc37c4` and `3ea01e2d` have the same tree object
  `7884656941fd63513585462ac2aef105934f1b88`.
- `4f5e71c9` has a different tree object
  `2717f16dad8596dca4eae2954c392a3fdd1c8feb`.

### File-level divergence

- `git diff --name-status origin/codex2/i18n-ops-04..origin/codex/i18n-ops-04`
  reports changes in exactly three files:
  `apps/ops-console-web/app/drivers/[driverId]/page.tsx`,
  `apps/ops-console-web/app/drivers/drivers-table.tsx`, and
  `apps/ops-console-web/lib/translations.ts`.
- `git diff --stat origin/dev..origin/codex2/i18n-ops-04` shows the expected
  five driver-scope task files, but with a smaller patch than the accepted rail.
- `git diff --stat origin/dev..origin/codex/i18n-ops-04` shows the same task
  surface, with the additional accepted content now present only on the codex
  rail.
- `git range-diff origin/dev...origin/codex2/i18n-ops-04 origin/dev...origin/codex/i18n-ops-04`
  shows the two rails share the same middle state conceptually, then diverge
  into unmatched tails: owner-only `4f5e71c9` versus reviewer-side
  `c1dc37c4` and `3ea01e2d`.

### Parent alias gap

- `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-04` returns
  `Task not found: I18N-OPS-04`.
- This helper task therefore cannot automatically advance the canonical parent
  task on `done` unless the supervisor maps that alias to the real task ID.

## Non-Destructive Repair Path

Do not force-push `origin/codex2/i18n-ops-04`.

### Canonical interpretation

Treat `origin/codex/i18n-ops-04 @ 3ea01e2d` as the only currently published
clean closeout rail. It already carries the accepted final tree and passing
verification.

### Owner-namespace recovery option

If the parent must resume on a Codex2-owned branch, create a fresh owner repair
rail from `origin/dev` and replay the accepted branch, not the stale owner
tail.

```bash
git fetch origin
git switch -c codex2/i18n-ops-04-repair origin/dev
git cherry-pick c6a726eb
git cherry-pick 4570b055
git cherry-pick c1dc37c4
git commit --allow-empty -m "I18N-OPS-04: owner closeout after review approval" \
  -m "LLM-Agent: Codex2" \
  -m "Task-ID: <actual-parent-task-id>" \
  -m "Reviewer: Codex" \
  -m "Verification: grep -RInE 'locale\\s*===\\s*\"zh\"|locale\\s*===\\s*'\"'\"'zh'\"'\"'|copy\\(' apps/ops-console-web/app/drivers apps/ops-console-web/components --include='*.ts' --include='*.tsx' => clean; pnpm --filter @drts/contracts build PASS; pnpm --filter @drts/ops-console-web build PASS; pnpm --filter @drts/ops-console-web typecheck PASS"
git push -u origin codex2/i18n-ops-04-repair
```

Do not cherry-pick `4f5e71c9` onto the repair rail. That commit is the stale
owner-only tail that diverged from the accepted closeout path.

## Why This Is Safe

- No shared remote history is rewritten.
- The divergent owner rail remains available as audit evidence.
- The accepted closeout rail already exists on origin.
- If owner identity must be restored, the repair branch can be created with
  ordinary cherry-picks and a normal push.

## Concrete Unblocked Next Step

The supervisor or parent owner should do two things:

1. Point the parent task at the real accepted rail:
   `origin/codex/i18n-ops-04 @ 3ea01e2d`, or create
   `codex2/i18n-ops-04-repair` from that accepted content if owner namespace is
   required.
2. Replace helper parent alias `I18N-OPS-04` with the actual canonical parent
   task ID in machine truth, so unblock completion can resume the correct task
   instead of a nonexistent alias.

## Canonical Change Evidence

- task commits on this branch:
  - `6a32c1d578b1e9f4dc1b1c3a081794dedc979c13`
    `I18N-OPS-04-UNBLOCK-HISTORY-REPAIR: document owner-rail ancestry contamination`
  - `8607288995298d5a85f2f1114482f0ddf1b33bea`
    `I18N-OPS-04-UNBLOCK-HISTORY-REPAIR: add branch push and PR evidence`
- push target:
  `origin/codex/i18n-ops-04-unblock-history-repair`
- task PR:
  `https://github.com/ajoe734/drts-fleet-platform/pull/525`

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Queried helper task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-04-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh progress I18N-OPS-04-UNBLOCK-HISTORY-REPAIR "..."`
- Checked current task lists:
  - `AI_NAME=Codex scripts/ai-status.sh list --status in_progress`
  - `AI_NAME=Codex scripts/ai-status.sh list --status review`
  - `AI_NAME=Codex scripts/ai-status.sh list --status blocked`
- Confirmed parent alias gap:
  - `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-04`
- Refreshed refs and inspected branch state:
  - `git fetch origin --prune`
  - `git branch --show-current`
  - `git status --short`
  - `git for-each-ref --format='%(refname:short) %(objectname:short)' ...`
  - `git log --graph --oneline --decorate --boundary 94c3aa2d..origin/codex2/i18n-ops-04 94c3aa2d..origin/codex/i18n-ops-04 --`
- Verified commit ancestry and tree identity:
  - `git rev-parse 47f4d479^ 47f4d479 ... 3ea01e2d`
  - `git show --no-patch --pretty=raw 47f4d479 a1dfe85f 4f5e71c9 c6a726eb 4570b055 6f8e506c c1dc37c4 3ea01e2d`
  - `git merge-base origin/codex2/i18n-ops-04 origin/codex/i18n-ops-04`
  - `git rev-list --left-right --count origin/codex2/i18n-ops-04...origin/codex/i18n-ops-04`
- Verified file-level divergence:
  - `git diff --stat origin/dev..origin/codex2/i18n-ops-04`
  - `git diff --stat origin/dev..origin/codex/i18n-ops-04`
  - `git diff --stat origin/codex2/i18n-ops-04..origin/codex/i18n-ops-04`
  - `git diff --name-status origin/codex2/i18n-ops-04..origin/codex/i18n-ops-04`
  - `git diff --unified=20 origin/codex2/i18n-ops-04..origin/codex/i18n-ops-04 -- apps/ops-console-web/app/drivers/[driverId]/page.tsx apps/ops-console-web/app/drivers/drivers-table.tsx apps/ops-console-web/lib/translations.ts`
  - `git range-diff origin/dev...origin/codex2/i18n-ops-04 origin/dev...origin/codex/i18n-ops-04`
- Confirmed task branch publish evidence:
  - `gh pr list --head codex/i18n-ops-04-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
