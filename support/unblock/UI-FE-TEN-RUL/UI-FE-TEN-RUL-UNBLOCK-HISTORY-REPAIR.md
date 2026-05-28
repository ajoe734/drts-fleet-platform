# UI-FE-TEN-RUL History Repair

## Scope

- Task: `UI-FE-TEN-RUL-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-TEN-RUL`
- Owner: `Claude2`
- Reviewer: `Codex2`
- Audit date: `2026-05-28`

## Diagnosis

The parent `UI-FE-TEN-RUL` is **not** blocked by branch, worktree, or commit
contamination. The git history for the canonical lane `codex/ui-fe-ten-rul`
is clean, properly trailered, already pushed to `origin`, and rebased on the
current trunk:

- `origin/codex/ui-fe-ten-rul` HEAD: `f300fdbff6a57c51bdba530a2ef00625e1fda555`
  - subject: `UI-FE-TEN-RUL: finalize owner closeout`
  - trailers present: `LLM-Agent: Codex`, `Task-ID: UI-FE-TEN-RUL`,
    `Reviewer: Claude2`
  - verification trailer preserved: `pnpm --filter @drts/tenant-console-web
    typecheck PASS; build PASS; lint PASS`
- branch tip equals local `codex/ui-fe-ten-rul` tip (no divergence)
- `git merge-base origin/codex/ui-fe-ten-rul origin/dev` resolves to current
  `origin/dev` HEAD `0e3de49b2409686d77c65567fe7e9da72b769855`
- `git rev-list --left-right --count origin/codex/ui-fe-ten-rul...origin/dev`
  reports `3	0` — three task-scoped commits ahead, zero behind, linear stack:
  1. `31ffe184 UI-FE-TEN-RUL: rebuild approval rules page`
  2. `584438ce wip(UI-FE-TEN-RUL): anchor approval-rules closeout`
  3. `f300fdbf UI-FE-TEN-RUL: finalize owner closeout`

Other lanes carry orphan branches that were never the canonical work surface
and are safe to ignore here:

- `claude2/ui-fe-ten-rul` at `9c16ab30` is only the early anchor wip commit
- `claude/ui-fe-ten-rul` at `a40b285f` is an unrelated baseline-repair commit
- `codex2/ui-fe-ten-rul` at `c373e932` is the unrelated `PH1GC-FIN-GOV-001`
  tip

None of those lanes touches `origin/codex/ui-fe-ten-rul`, so no
force-push or cross-lane rebase is required to keep the canonical branch
safe.

### The actual contamination is in the state machine

Reconstructed from `ai-activity-log.jsonl`:

1. `2026-05-28T08:24:41Z` — owner `Codex` handed off to reviewer `Claude2`
   (status moves to `review`).
2. `2026-05-28T08:33:29Z` — reviewer `Claude2` recorded
   `review_approved` with the parity findings (status moves to
   `review_approved`).
3. `2026-05-28T08:33:52Z` — owner `Codex` ran `progress` to log
   "Performing owner closeout checks: branch, diff, commit, push, and done
   status prerequisites." `command_progress` in `scripts/ai_status.py:1685`
   reassigns `review_approved → in_progress` whenever the owner posts
   progress while approved. That single side-effect demoted the parent.
4. `2026-05-28T08:36:00Z` — owner `Codex` could no longer call `done`
   (requires `status == review_approved`) and recorded a blocker:
   "machine truth was accidentally demoted from review_approved to
   in_progress by an owner progress update during closeout checks." Status
   moved from `in_progress` to `blocked`.

The closeout commit / push had already landed before the demotion, so all
required commit evidence (`COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`,
`PUSH_BRANCH`) is durable on `origin/codex/ui-fe-ten-rul` and the reviewer's
approval evidence is durable in `ai-activity-log.jsonl`. Nothing in the
repository needs to be force-pushed, rebased away, or rewritten to recover.

## Non-Destructive Repair Path

Walk the state machine forward from `blocked → review_approved` using only
the existing canonical commands. No git history is rewritten, no branch is
force-pushed.

1. Reviewer `Claude2` runs `reopen` on `UI-FE-TEN-RUL`. Per
   `scripts/ai_status.py:1707`, when the reviewer reopens, the task is
   moved to `in_progress` and a handoff back to owner `Codex` is queued —
   this clears the stuck `blocked` state without dropping the existing
   closeout evidence on either side.
2. Owner `Codex` runs `handoff UI-FE-TEN-RUL Claude2 "<msg>"`, which
   `scripts/ai_status.py:1741` advances to `review`. Codex does **not**
   need to recommit or rebase — the closeout commit `f300fdbf` is already
   the branch tip on `origin/codex/ui-fe-ten-rul`.
3. Reviewer `Claude2` runs `approve UI-FE-TEN-RUL "<msg>"` (with
   `REVIEW_NOTES_ZH` carrying the preserved `2026-05-28T08:33:29Z` parity
   findings if desired), per `scripts/ai_status.py:1839`. Status reaches
   `review_approved`.
4. Owner `Codex` runs `done UI-FE-TEN-RUL "<msg>"` with the durable
   evidence already produced earlier:

   ```
   COMMIT_HASH=f300fdbff6a57c51bdba530a2ef00625e1fda555
   COMMIT_SUBJECT="UI-FE-TEN-RUL: finalize owner closeout"
   PUSH_REMOTE=origin
   PUSH_BRANCH=codex/ui-fe-ten-rul
   ```

   That satisfies the §5 commit-evidence rule from `AI_COLLABORATION_GUIDE`
   and `command_done` (`scripts/ai_status.py:1807`) without any new
   git activity.

## Parent Resume Sequence (concrete)

The owner's next step the moment the supervisor wakes Codex on
`UI-FE-TEN-RUL` is to hand off, **not** to recommit or rebase. The
task-scoped commit/push that satisfies §5 is already on the canonical
branch:

- Owner action: `AI_NAME=Codex ./scripts/ai-status.sh handoff
  UI-FE-TEN-RUL Claude2 "Closeout commit f300fdbf is already on
  origin/codex/ui-fe-ten-rul (3 ahead, 0 behind origin/dev); please replay
  approve on the preserved 2026-05-28T08:33:29Z evidence so I can run done
  with the existing PUSH_BRANCH=codex/ui-fe-ten-rul."`
- Reviewer action: `AI_NAME=Claude2 REVIEW_NOTES_ZH="<preserved
  2026-05-28T08:33:29Z parity findings>" ./scripts/ai-status.sh approve
  UI-FE-TEN-RUL "Replay approve on preserved evidence after state-machine
  repair; closeout commit f300fdbf already pushed."`
- Owner finalize: `AI_NAME=Codex
  COMMIT_HASH=f300fdbff6a57c51bdba530a2ef00625e1fda555
  COMMIT_SUBJECT="UI-FE-TEN-RUL: finalize owner closeout"
  PUSH_REMOTE=origin PUSH_BRANCH=codex/ui-fe-ten-rul
  ./scripts/ai-status.sh done UI-FE-TEN-RUL "Owner finalized approved task
  using preserved closeout evidence."`

## Guardrail Note

`command_progress` silently demotes `review_approved → in_progress`. The
owner-closeout flow assumes the owner can log a progress note during
`done` preflight checks without breaking the approval gate; today it
breaks it. That class of regression should be tracked in its own task so
that a future Codex closeout cannot recreate this trap. This repair task
documents the regression but does not change `scripts/ai_status.py`,
since the canonical fix needs reviewer scoping beyond this unblock task.

## Conclusion

`UI-FE-TEN-RUL` does not need any branch, worktree, or commit
manipulation. The unblock is a four-step canonical state-machine walk:
reviewer `reopen` → owner `handoff` → reviewer `approve` → owner `done`,
all reusing the existing closeout commit `f300fdbf` already present on
`origin/codex/ui-fe-ten-rul`.
