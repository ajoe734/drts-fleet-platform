# Agent Workflow Rules

Read `AI_COLLABORATION_GUIDE.md` first. This file is a short operational overlay for coding agents in this repo.

## Branch and commit discipline

- Do not stop after implementation or verification with task-owned tracked changes left only in the local working tree.
- Before you report "fixed", "implemented", "ready for review", "ready to merge", or similar completion language, run `git status --short`.
- If task-owned tracked files changed, move to the correct task/topic branch first if needed, then create:
  - an anchor commit for in-flight work, or
  - a formal task-scoped closeout commit for `review_approved` work
- For `docs/**`, `.orchestrator/skills/**`, `.orchestrator/templates/*`, `.orchestrator/config*.json`, `.github/workflows/**`, and other fragile multi-cycle surfaces, follow branch -> commit -> push. Do not leave those edits local-only across sessions.
- If a safe commit or normal non-force push is not possible, say so explicitly and record a blocker/progress note instead of presenting the work as complete.

## Git hygiene

- Stage only task-owned files. Do not use `git add -A` for mixed worktrees.
- Do not use `git stash` for design-intent diffs.
- Rebase on `origin/dev` when trunk moved. Do not recover long-lived work with `git stash pop`.

## References

- `AI_COLLABORATION_GUIDE.md`
- `.orchestrator/skills/worker-anchor-commit.md`
- `.orchestrator/skills/task-closeout-finalization.md`
- `docs/ops/branch-strategy.md`
