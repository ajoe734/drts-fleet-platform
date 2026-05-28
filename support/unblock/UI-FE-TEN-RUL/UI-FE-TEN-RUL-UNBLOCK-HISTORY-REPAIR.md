# UI-FE-TEN-RUL History Repair

## Scope

- Task: `UI-FE-TEN-RUL-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-TEN-RUL`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit date: `2026-05-28`

## Diagnosis

The parent `UI-FE-TEN-RUL` is not blocked by branch, worktree, or commit
contamination. The git history for the canonical lane `codex/ui-fe-ten-rul`
is clean, properly trailered, already pushed to `origin`, and rebased on the
current trunk:

- `origin/codex/ui-fe-ten-rul` HEAD: `f300fdbff6a57c51bdba530a2ef00625e1fda555`
  - subject: `UI-FE-TEN-RUL: finalize owner closeout`
  - trailers present: `LLM-Agent: Codex`, `Task-ID: UI-FE-TEN-RUL`,
    `Reviewer: Claude2`
  - verification trailer preserved: `pnpm --filter @drts/tenant-console-web typecheck PASS; build PASS; lint PASS`
- branch tip equals local `codex/ui-fe-ten-rul` tip (no divergence)
- `git merge-base origin/codex/ui-fe-ten-rul origin/dev` resolves to current
  `origin/dev` HEAD `0e3de49b2409686d77c65567fe7e9da72b769855`
- `git rev-list --left-right --count origin/codex/ui-fe-ten-rul...origin/dev`
  reports `3 0` - three task-scoped commits ahead, zero behind, linear stack:
  1. `31ffe184 UI-FE-TEN-RUL: rebuild approval rules page`
  2. `584438ce wip(UI-FE-TEN-RUL): anchor approval-rules closeout`
  3. `f300fdbf UI-FE-TEN-RUL: finalize owner closeout`

Other lanes carry orphan branches that were never the canonical work surface
and are safe to ignore here:

- `claude2/ui-fe-ten-rul` at `9c16ab30` is only the early anchor wip commit
- `claude/ui-fe-ten-rul` at `a40b285f` is an unrelated baseline-repair commit
- `codex2/ui-fe-ten-rul` at `c373e932` is the unrelated `PH1GC-FIN-GOV-001`
  tip

None of those lanes touches `origin/codex/ui-fe-ten-rul`, so no force-push or
cross-lane rebase is required to keep the canonical branch safe.

### The actual contamination is in the state machine

Reconstructed from `ai-activity-log.jsonl` and the existing closeout branch:

1. `2026-05-28T08:24:41Z` - owner `Codex` handed off to reviewer `Claude2`
   (`status=review`).
2. `2026-05-28T08:33:29Z` - reviewer `Claude2` recorded `review_approved`
   with parity findings.
3. `2026-05-28T08:33:52Z` - owner `Codex` ran `progress` to log
   "Performing owner closeout checks: branch, diff, commit, push, and done
   status prerequisites." `command_progress` in `scripts/ai_status.py:1685`
   demotes `review_approved -> in_progress` when the owner posts progress
   during closeout.
4. `2026-05-28T08:36:00Z` - owner `Codex` could no longer call `done`
   (`done` requires `status == review_approved`) and recorded a blocker:
   "machine truth was accidentally demoted from review_approved to
   in_progress by an owner progress update during closeout checks." Status
   then moved from `in_progress` to `blocked`.

The closeout commit and push had already landed before the demotion, so all
required commit evidence (`COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`,
`PUSH_BRANCH`) is durable on `origin/codex/ui-fe-ten-rul` and the reviewer's
approval evidence is durable in `ai-activity-log.jsonl`. Nothing in the repo
needs to be force-pushed, rebased away, or rewritten to recover.

## Non-Destructive Repair Path

Walk the state machine forward from `blocked` back to `review_approved` using
only the existing canonical commands. No git history is rewritten, and no
branch is force-pushed.

1. Reviewer `Claude2` runs `reopen UI-FE-TEN-RUL "<msg>"`. Per
   `scripts/ai_status.py:1707`, reviewer reopen moves the task to
   `in_progress` and hands it back to owner `Codex`, clearing the stuck
   `blocked` state without touching the existing closeout evidence.
2. Owner `Codex` runs `handoff UI-FE-TEN-RUL Claude2 "<msg>"`, which
   `scripts/ai_status.py:1741` advances to `review`. No recommit or rebase is
   needed because `f300fdbf` is already the branch tip on
   `origin/codex/ui-fe-ten-rul`.
3. Reviewer `Claude2` runs `approve UI-FE-TEN-RUL "<msg>"` (optionally with
   the preserved `2026-05-28T08:33:29Z` parity findings in `REVIEW_NOTES_ZH`),
   which returns the task to `review_approved`.
4. Owner `Codex` runs `done UI-FE-TEN-RUL "<msg>"` with the durable evidence
   already produced earlier:

   ```
   COMMIT_HASH=f300fdbff6a57c51bdba530a2ef00625e1fda555
   COMMIT_SUBJECT="UI-FE-TEN-RUL: finalize owner closeout"
   PUSH_REMOTE=origin
   PUSH_BRANCH=codex/ui-fe-ten-rul
   ```

   That satisfies the closeout evidence rule in `AI_COLLABORATION_GUIDE.md`
   and `command_done` in `scripts/ai_status.py` without new git activity on
   the parent branch.

## Parent Resume Sequence

The next concrete parent step is state repair, not branch repair:

- Owner action:
  `AI_NAME=Codex ./scripts/ai-status.sh handoff UI-FE-TEN-RUL Claude2 "Closeout commit f300fdbf is already on origin/codex/ui-fe-ten-rul (3 ahead, 0 behind origin/dev); please replay approve on the preserved 2026-05-28T08:33:29Z evidence so I can run done with existing push metadata."`
- Reviewer action:
  `AI_NAME=Claude2 REVIEW_NOTES_ZH="<preserved 2026-05-28T08:33:29Z parity findings>" ./scripts/ai-status.sh approve UI-FE-TEN-RUL "Replay approve on preserved evidence after state-machine repair; closeout commit f300fdbf already pushed."`
- Owner finalize:
  `AI_NAME=Codex COMMIT_HASH=f300fdbff6a57c51bdba530a2ef00625e1fda555 COMMIT_SUBJECT="UI-FE-TEN-RUL: finalize owner closeout" PUSH_REMOTE=origin PUSH_BRANCH=codex/ui-fe-ten-rul ./scripts/ai-status.sh done UI-FE-TEN-RUL "Owner finalized approved task using preserved closeout evidence."`

## Guardrail Note

`command_progress` silently demotes `review_approved -> in_progress`. That is
the regression that trapped the parent during closeout. This unblock task
documents the regression and the safe recovery path, but intentionally does
not change `scripts/ai_status.py`; any behavioral fix belongs in a separately
scoped task.

## Conclusion

`UI-FE-TEN-RUL` does not need branch, worktree, or commit manipulation. The
unblock is a four-step canonical state-machine walk: reviewer `reopen` ->
owner `handoff` -> reviewer `approve` -> owner `done`, all reusing closeout
commit `f300fdbf` already present on `origin/codex/ui-fe-ten-rul`.
