# PH1GC-E2E-011 Unblock History Repair

## Scope

- Task: `PH1GC-E2E-011-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-E2E-011`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-23`

## Diagnosis

The parent is blocked by a control-plane lifecycle regression plus a split
owner/reviewer branch history, not by a missing implementation commit.

1. The reviewed implementation lives on
   `origin/codex/ph1gc-e2e-011 @ 560a9b8f`
   (`PH1GC-E2E-011: assert rejected control-plane audits`). That branch carries
   the final reviewed script state, including the three rejected-audit
   assertions that reviewer `Codex2` approved at `2026-05-23T14:45:49Z`.
2. The closeout branch that the reassigned owner later used is
   `origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6`
   (`PH1GC-E2E-011: finalize owner closeout`). It forked from
   `cca1de6b` before `54d02a6b` and `560a9b8f`, so it preserves pushed closeout
   metadata but not the last two reviewed implementation commits.
3. A stale review worktree still exists at
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-e2e-011`
   on local branch `codex2/ph1gc-e2e-011-review @ d303e302`. That worktree is
   older than both remote rails and confirms the task was already being carried
   across multiple owner/reviewer rails.
4. After `Codex2` approved the parent at `2026-05-23T14:45:49Z`, the
   orchestrator reassigned the parent owner/reviewer at `2026-05-23T14:47:35Z`
   from `Codex`/`Codex2` to `Codex2`/`Codex`. The follow-on finalize wake then
   targeted the `codex2/ph1gc-e2e-011` worktree rather than the reviewed
   `codex/ph1gc-e2e-011` rail.
5. The reassigned owner ran
   `AI_NAME=Codex2 scripts/ai-status.sh start PH1GC-E2E-011 "closing out review-approved task and verifying commit/push state"`
   at `2026-05-23T14:48:11Z`. Per `scripts/ai_status.py`, `start` always sets
   task status to `in_progress`, so that command overwrote the prior
   `review_approved` machine-truth state.
6. The later blocker note at `2026-05-23T14:50:13Z` correctly records the
   regression: closeout evidence is already pushed, but `scripts/ai-status.sh done`
   now rejects direct closeout because the parent is no longer
   `review_approved`.

## Evidence

### Canonical machine truth

- Canonical parent record in
  `/home/edna/workspace/drts-fleet-platform/ai-status.json` shows
  `PH1GC-E2E-011` as:
  - owner=`Codex2`
  - reviewer=`Codex`
  - status=`blocked`
  - waiting_for=`Codex`
  - `next` already describes the lifecycle regression and cites existing
    closeout metadata (`8f2d6cd6`, `origin/codex2/ph1gc-e2e-011`)
- Canonical `ai-activity-log.jsonl` records the exact sequence:
  - `2026-05-23T14:43:11Z` `Codex` handoff citing reviewed branch
    `codex/ph1gc-e2e-011 (HEAD 560a9b8f)`
  - `2026-05-23T14:45:49Z` `Codex2` `review_approved`
  - `2026-05-23T14:47:35Z` orchestrator owner/reviewer reassignment
  - `2026-05-23T14:48:11Z` `Codex2` `start`
  - `2026-05-23T14:50:13Z` `Codex2` blocker describing the regression

### Branch and worktree state

- `origin/codex/ph1gc-e2e-011 @ 560a9b8f7efb8bd97d8b926024c63e6a11372e6a`
- `origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6292d6f7da353eae442a320232c03c1bc`
- local `codex2/ph1gc-e2e-011-review @ d303e3024946e03ba4d78b9609fe700b99fcdad9`
- `git rev-list --left-right --count origin/codex/ph1gc-e2e-011...origin/codex2/ph1gc-e2e-011`
  returns `2 1`
- `git log --oneline origin/codex2/ph1gc-e2e-011..origin/codex/ph1gc-e2e-011`
  shows the reviewed branch has two commits missing from the closeout branch:
  - `54d02a6b` `PH1GC-E2E-011: fix control-plane e2e runtime gaps`
  - `560a9b8f` `PH1GC-E2E-011: assert rejected control-plane audits`
- `git log --oneline origin/codex/ph1gc-e2e-011..origin/codex2/ph1gc-e2e-011`
  shows the closeout rail has one unique commit:
  - `8f2d6cd6` `PH1GC-E2E-011: finalize owner closeout`
- `git worktree list --porcelain | grep -A2 -B1 'ph1gc-e2e-011'` confirms
  three separate task rails exist:
  - owner implementation worktree for `codex/ph1gc-e2e-011`
  - stale review worktree for `codex2/ph1gc-e2e-011-review`
  - closeout worktree for `codex2/ph1gc-e2e-011`

## Exact Contamination

The contamination is the interaction of branch split plus machine-truth state
regression:

1. Review approval was granted against the latest implementation rail
   `origin/codex/ph1gc-e2e-011 @ 560a9b8f`.
2. Before closeout landed in machine truth, the orchestrator flipped the parent
   owner/reviewer pair to `Codex2`/`Codex`.
3. The new owner finalized from a different rail,
   `origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6`, which preserved closeout metadata
   but not the two newest reviewed implementation commits.
4. The owner used `start` rather than replaying `handoff -> approve -> done`.
   That downgraded the parent from `review_approved` to `in_progress`, and the
   later blocker preserved that downgraded state as `blocked`.

So the parent is not blocked by missing code. It is blocked because the reviewed
implementation branch, the pushed closeout branch, and the machine-truth
lifecycle state no longer describe the same closeout moment.

## Non-Destructive Repair Path

Do not rewrite or delete any existing branch. Repair the parent by replaying the
status sequence against the current owner/reviewer assignment while reusing the
already-pushed refs.

1. Treat `origin/codex/ph1gc-e2e-011 @ 560a9b8f` as the canonical reviewed
   implementation rail. That is the branch commit explicitly cited in the
   approval at `2026-05-23T14:45:49Z`.
2. Treat `origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6` as the canonical closeout
   evidence rail. Keep its existing commit/push metadata unchanged; do not
   cherry-pick, force-push, or reword the commit.
3. Replay the lifecycle in machine truth using the current assignments
   (`owner=Codex2`, `reviewer=Codex`):

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-E2E-011 Codex \
  "Replay closeout after lifecycle regression: reviewer-approved implementation is origin/codex/ph1gc-e2e-011 @ 560a9b8f, while the existing owner closeout evidence remains origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6. No history rewrite required; please replay review approval so owner can finalize with the existing commit metadata."

AI_NAME=Codex scripts/ai-status.sh approve PH1GC-E2E-011 \
  "Replayed approval after lifecycle regression. Canonical reviewed implementation remains origin/codex/ph1gc-e2e-011 @ 560a9b8f; owner closeout evidence remains origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6."

AI_NAME=Codex2 COMMIT_HASH=8f2d6cd6292d6f7da353eae442a320232c03c1bc \
COMMIT_SUBJECT='PH1GC-E2E-011: finalize owner closeout' \
PUSH_REMOTE=origin PUSH_BRANCH=codex2/ph1gc-e2e-011 \
scripts/ai-status.sh done PH1GC-E2E-011 \
  "Closeout replay complete after lifecycle regression repair. Reviewed implementation stayed on origin/codex/ph1gc-e2e-011 @ 560a9b8f, owner closeout evidence stayed on origin/codex2/ph1gc-e2e-011 @ 8f2d6cd6, and no force-push or history rewrite was used."
```

4. Leave the stale local review branch `codex2/ph1gc-e2e-011-review` untouched.
   It is evidence of the rail split, not a branch that needs rewriting.
5. If the team later wants one single long-lived owner rail, do that as a
   future housekeeping task after closeout, not during this repair.

## Why This Is Safe

- No shared branch is force-pushed.
- No existing commit is replaced or amended.
- The approved implementation evidence (`560a9b8f`) remains exactly the one the
  reviewer approved.
- The existing closeout evidence (`8f2d6cd6`) remains exactly the one already
  pushed by the reassigned owner lane.
- The repair only replays `handoff -> approve -> done` in canonical machine
  truth.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical machine truth:
  - `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared related refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -vv | grep 'ph1gc-e2e-011'`
  - `git worktree list --porcelain | grep -A2 -B1 'ph1gc-e2e-011'`
  - `git ls-remote --heads origin 'refs/heads/*ph1gc-e2e-011*'`
  - `git rev-list --left-right --count origin/codex/ph1gc-e2e-011...origin/codex2/ph1gc-e2e-011`
  - `git log --oneline origin/codex2/ph1gc-e2e-011..origin/codex/ph1gc-e2e-011`
  - `git log --oneline origin/codex/ph1gc-e2e-011..origin/codex2/ph1gc-e2e-011`
  - `git show --stat --summary --name-only 560a9b8f`
  - `git show --stat --summary --name-only 8f2d6cd6`
