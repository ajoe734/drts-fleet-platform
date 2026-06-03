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
10. Decide and record integration status before finalizing:
    - `branch_pushed` means branch closeout is done, but PR/CI/merge/dev deploy remains open.
    - `merged_to_dev` means the delivered commit is reachable from `origin/dev`.
    - `dev_deployed` means a successful `Deploy - Dev` run includes the change.
    - `not_applicable` is only for sidecar/support-only work with no deploy target.
11. Run `scripts/ai-status.sh done <task-id> "<message>"` or `python3 scripts/ai_status.py done ...` only after commit, push, and integration-status evidence are ready.

Rules:

- `review_approved` is not the finish line; it is the reviewer gate.
- Do not mark `done` before closeout, verification, commit metadata, and push metadata are ready.
- `done` without `INTEGRATION_STATUS=dev_deployed` is not a dev-environment publish claim.
- If PR/CI/merge/deploy remains, say so in the done message and create or hand off the explicit integration closeout follow-up.
- If a safe normal push is not possible, record a blocker or progress note instead of marking `done`.

Canonical closeout example:

```bash
git status --short
git add <task-owned-files>
git commit -m "<type>(<task-id>): <summary>" -m "LLM-Agent: <owner>" -m "Task-ID: <task-id>" -m "Reviewer: <reviewer>" -m "Verification: <commands>"
git push
AI_NAME=<owner> COMMIT_HASH=<sha> COMMIT_SUBJECT="<subject>" PUSH_REMOTE=origin PUSH_BRANCH=<branch> INTEGRATION_STATUS=branch_pushed ./scripts/ai-status.sh done <task-id> "Owner finalized approved task, committed, pushed, and recorded branch-only integration status"
```

For full development closeout, follow [`integration-closeout.md`](integration-closeout.md) after this branch-level checklist.
