# Task Closeout Finalization

Use this checklist when a canonical task is already in `review_approved` and you are the owner doing closeout.

Required steps:

1. Re-read the task brief, latest reviewer approval message, review notes, and touched artifacts.
2. Confirm the approved scope still matches the current worktree and that no unrelated changes were swept in.
3. Add or refresh review notes, evidence, handoff notes, and any docs needed for the approved slice.
4. Run focused verification for the approved scope only.
5. Check `git status --short`.
6. Stage only task-owned files.
7. Create a task-scoped commit.
8. Include these commit-body lines:
   - `LLM-Agent: <owner>`
   - `Task-ID: <task-id>`
   - `Reviewer: <reviewer>`
   - `Verification: <commands>`
9. Push the commit with a scoped normal non-force push.
   - Prefer `git push` when the current branch has a correct upstream.
   - Otherwise use `git push -u origin HEAD:<branch>` only when `<branch>` is the intended task branch.
   - Never use `--force`, `--force-with-lease`, `--mirror`, `--delete`, `--all`, or `--tags`.
10. Before you write any completion summary, run `git status --short` again and confirm no task-owned tracked changes remain outside the closeout commit.
11. Run `scripts/ai-status.sh done <task-id> "<message>"` or `python3 scripts/ai_status.py done ...` only after commit and push are complete.

Rules:

- `review_approved` is not the finish line; it is the reviewer gate.
- Do not mark `done` before closeout, verification, commit metadata, and push metadata are ready.
- Do not stop with a "finished locally" message while the closeout diff is still only in the working tree. If verification passed but commit/push is not complete, the task is not closed yet.
- If a safe normal push is not possible, record a blocker or progress note instead of marking `done`.

Canonical closeout example:

```bash
git status --short
git add <task-owned-files>
git commit -m "<type>(<task-id>): <summary>" -m "LLM-Agent: <owner>" -m "Task-ID: <task-id>" -m "Reviewer: <reviewer>" -m "Verification: <commands>"
git push
AI_NAME=<owner> COMMIT_HASH=<sha> COMMIT_SUBJECT="<subject>" PUSH_REMOTE=origin PUSH_BRANCH=<branch> ./scripts/ai-status.sh done <task-id> "Owner finalized approved task, committed, pushed, and closed it"
```
