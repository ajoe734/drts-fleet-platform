# Worker Anchor Commit

Use this checklist **during** task work (between dispatch and closeout) whenever you have a non-trivial in-flight change. Companion to `task-closeout-finalization.md`, which covers the formal `review_approved → done` commit.

## When to anchor commit

Anchor commit at the first describable middle state — do **not** wait for completion — when **any** of the following hold:

1. The change touches a **fragile surface**:
   - `.orchestrator/supervisor.py` (especially routing / dispatch / chair-review)
   - `.orchestrator/skills/*.md`
   - `.orchestrator/templates/*`
   - `.orchestrator/config*.json`
   - `docs/ops/branch-strategy.md`, `docs/**`
   - `.github/workflows/**`
   - `.husky/*`
2. The change spans **more than one file** with shared design intent.
3. The change is expected to take **more than one supervisor cycle**.
4. You are **about to yield**: planned reassignment, blocker, end-of-shift, supervisor told you to pause.

Working tree is **not** a staging area for design intent. Stash is **not** an alternative — see Rules below.

## Required steps

1. Confirm current branch matches `<lane>/<task-id-kebab>`. If not:
   ```bash
   git switch -c <lane>/<task-id-kebab> origin/dev
   ```
   In v4 the single integration trunk is `dev` for backend, frontend, and docs. `branch_routing.route_task(...)` returns `base_branch="dev"` for all current track rules.
2. Run `git status --short` and confirm the listed files belong to this task. If files from another task are present, stop and report a blocker — do not sweep unrelated edits into the anchor.
3. Stage only task-owned files (`git add <paths>`). Never `git add -A`.
4. Commit with `wip:` prefix and trailers:
   ```bash
   git commit -m "wip(<TASK-ID>): anchor <scope>" \
     -m "LLM-Agent: <lane>" -m "Task-ID: <TASK-ID>" -m "Reviewer: <reviewer>"
   ```
5. If the file has a parallel designer on another lane, expand the commit body to declare the layer:

   ```
   wip(<TASK-ID>): anchor <scope>

   Touches <file>: <slice>.
   Does not change <other slices>.
   Intended to compose with <PR# or task-id> on <other-slice>.
   ```

6. Push the anchor — do not leave it local only:
   ```bash
   git push -u origin <lane>/<task-id-kebab>
   ```
7. Before you pause, hand off, or tell a human "implemented" / "ready", run `git status --short` again. If task-owned tracked changes are still uncommitted, do not stop — anchor-commit them first.
8. Continue the task. Subsequent anchors on the same branch are allowed and encouraged; closeout will squash or keep them per `task-closeout-finalization.md` step 5a.

## Rules

- **`git stash` is forbidden for design-intent diffs.** Acceptable only for tiny, throwaway, no-design-intent edits (e.g. a forgotten `console.log`). Any diff in a fragile surface above must become a commit, never a stash.
- **If supervisor reassigns you mid-task**, anchor-commit _before_ yielding. Do not rely on supervisor stash. The supervisor's opt-in `worker_tree_guard` (OPS-GIT-WORKFLOW-006) will block reassignment when fragile-surface diffs are uncommitted; the correct response to that block is anchor-commit, not bypass.
- **If `dev` advances while you were paused**, rebase the branch — never `git stash pop` onto a moved trunk:
  ```bash
  git fetch origin
  git rebase origin/dev
  ```
- **No local-only completion.** Do not tell a human or supervisor "fixed", "implemented", "ready for review", or equivalent completion language while task-owned tracked changes exist only in the working tree. Commit first, or explicitly report why commit/push is blocked.
- **Anchor commits are not closeouts.** They have `wip:` prefix and do not require a `Verification:` trailer. The closeout commit (per `task-closeout-finalization.md`) is the one that satisfies the `<TASK-ID>: <summary>` subject regex required by CI.
- **doc / skill / config changes** (per `branch-strategy.md` §11.5) always go branch → commit → push → PR. They must not accumulate in-session across supervisor cycles.

## Trigger checklist (ask before each significant save)

1. Am I touching a fragile surface?
2. Will this take more than one supervisor cycle?
3. Am I about to yield?
4. Is this a doc / skill / config change?

If any answer is yes and current branch is not `<lane>/<task-id-kebab>`, stop and create the branch first.

## Canonical anchor example

```bash
git switch -c claude/ops-git-workflow-004 origin/dev
# edit docs/ops/branch-strategy.md
git status --short
git add docs/ops/branch-strategy.md
git commit -m "wip(OPS-GIT-WORKFLOW-004): anchor branch-strategy §11 anchor commit protocol" \
  -m "LLM-Agent: claude" -m "Task-ID: OPS-GIT-WORKFLOW-004" -m "Reviewer: codex"
git push -u origin claude/ops-git-workflow-004
# continue editing; subsequent anchors land on the same branch
```

## References

- [`docs/ops/branch-strategy.md`](../../docs/ops/branch-strategy.md) §11 — protocol rationale + table of fragile surfaces
- [`task-closeout-finalization.md`](task-closeout-finalization.md) — formal closeout commit (after `review_approved`)
- [`.orchestrator/templates/wakeup.txt`](../templates/wakeup.txt) — supervisor wakeup template (will reference this skill once OPS-GIT-WORKFLOW-005 lands)
