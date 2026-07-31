# STAGE1-UAT-CLOSURE-20260731 Unblock History Repair

## Scope

- Task: `STAGE1-UAT-CLOSURE-20260731-UNBLOCK-HISTORY-REPAIR`
- Parent: `STAGE1-UAT-CLOSURE-20260731`
- Owner: `Codex2`
- Reviewer: `Gemini`
- Audit date: `2026-07-31`

## Diagnosis

The parent is blocked by owner-lane branch/worktree contamination, not by a
missing parent branch or by missing predecessor state.

1. The canonical owner parent branch already exists on the remote as
   `origin/codex2/stage1-uat-closure-20260731 @ 36d40052ef631c6e6a586f36c838c5908d1d18d0`.
   Relative to `origin/dev @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41`, it
   carries the full 10-commit implementation stack for this task.
2. The owner helper branch
   `origin/codex2/stage1-uat-closure-20260731-unblock-manual-unblock @ a1f999e0adbab6119fee8d11cc45ee4e212fd4d0`
   is not the parent replay rail. It diverges from the parent by two support
   commits that only record blocker sequencing.
3. The assigned history-repair branch
   `codex2/stage1-uat-closure-20260731-unblock-history-repair` started as a
   clean alias of `origin/dev` and had no remote ref before this repair. It is
   the correct place to preserve the diagnosis artifact, but it is not a code
   replay branch.
4. The parent worktree currently checked out on
   `codex2/stage1-uat-closure-20260731` is dirty beyond the pushed parent tip.
   It contains tracked edits in 10 files plus large untracked `node_modules/`
   trees. The tracked dirt mixes parent-owned files
   (`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`,
   `apps/api/tests/unit/owned-mobility.service.test.ts`,
   `tests/smoke/05-billing-invoice.sh`) with unrelated sidecar evidence JSON
   under `support/sidecars/MAP-*`.
5. Because that dirty worktree overlays the canonical pushed tip, the parent is
   at risk of continuing from a non-reproducible mixed state even though the
   correct owner branch already exists on the remote.

## Evidence

### Branch and helper state

- `origin/dev @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41`
- `origin/codex2/stage1-uat-closure-20260731 @ 36d40052ef631c6e6a586f36c838c5908d1d18d0`
- `origin/codex2/stage1-uat-closure-20260731-unblock-manual-unblock @ a1f999e0adbab6119fee8d11cc45ee4e212fd4d0`
- local `codex2/stage1-uat-closure-20260731-unblock-history-repair @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41`
  before this closeout, with no matching remote ref yet
- `git rev-list --left-right --count origin/dev...codex2/stage1-uat-closure-20260731`
  returns `0 10`
- `git rev-list --left-right --count origin/dev...codex2/stage1-uat-closure-20260731-unblock-manual-unblock`
  returns `0 2`
- `git rev-list --left-right --count codex2/stage1-uat-closure-20260731...codex2/stage1-uat-closure-20260731-unblock-manual-unblock`
  returns `10 2`
- `git ls-remote --heads origin` confirms pushed refs for:
  - `codex2/stage1-uat-closure-20260731 @ 36d40052`
  - `codex2/stage1-uat-closure-20260731-unblock-manual-unblock @ a1f999e0`
- `git ls-remote --heads origin` returned no ref for
  `codex2/stage1-uat-closure-20260731-unblock-history-repair` before this
  helper closeout
- `gh pr list --search 'STAGE1-UAT-CLOSURE-20260731 in:title' --state all --json number,title,headRefName,baseRefName,state,url`
  returned `[]` during this audit pass

### Parent branch shape

`git log --reverse origin/dev..codex2/stage1-uat-closure-20260731` shows the
entire owner stack already anchored on the parent branch:

1. `aea09015` `STAGE1-CORE-CANDIDATE: close controllable governance gaps`
2. `da01295d` `wip(STAGE1-UAT-CLOSURE-20260731): anchor quota consume exactly-once and UAT truth`
3. `c1a901b1` `wip(STAGE1-UAT-CLOSURE-20260731): anchor smoke contract parsing drift`
4. `36ab7f00` `wip(STAGE1-UAT-CLOSURE-20260731): anchor db-backed driver completion`
5. `a644d275` `wip(STAGE1-UAT-CLOSURE-20260731): anchor quota postcommit apply`
6. `fbc68b10` `STAGE1-UAT-CLOSURE-20260731: fix quota completion closeout and billing smoke`
7. `9dfe2038` `wip(STAGE1-UAT-CLOSURE-20260731): anchor quota and driver completion locking`
8. `1db9166f` `wip(STAGE1-UAT-CLOSURE-20260731): anchor locked driver completion replay`
9. `86136720` `wip(STAGE1-UAT-CLOSURE-20260731): anchor db-backed integration gate`
10. `36d40052` `wip(STAGE1-UAT-CLOSURE-20260731): anchor driver completion outbox and quota integration gate`

This means the parent already has a single pushed owner rail. The contamination
is not branch absence; it is the mismatch between that rail and the current
dirty worktree layered on top of it.

### Dirty worktree contamination

`git -C /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-stage1-uat-closure-20260731 diff --name-only`
returned these tracked files:

- `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `tests/smoke/05-billing-invoice.sh`
- `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json`
- `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json`
- `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json`
- `support/sidecars/MAP-QA-002/artifacts/final-evidence-20260708/map-admin-publish-closeout-proof-20260708T120500Z.json`
- `support/sidecars/MAP-QA-002/artifacts/final-evidence-20260708/map-qa-final-evidence-proof-20260708T120000Z.json`
- `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json`
- `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json`

The same worktree also has untracked `node_modules/` directories across the repo.

## Exact Contamination

The contamination is a two-layer mismatch:

1. The parent branch itself is canonical and already pushed on the owner lane.
2. The active parent worktree no longer reflects that canonical branch tip,
   because it carries uncommitted task-overlapping edits plus unrelated sidecar
   evidence churn and generated package-install output.

If the parent resumes from that worktree without repair, later workers cannot
tell which file state belongs to the pushed task branch and which state is local
drift. That is the real unblock failure.

## Non-Destructive Repair Path

Do not force-push, rebase, or rewrite any shared branch history.

1. Keep `origin/codex2/stage1-uat-closure-20260731 @ 36d40052` as the sole
   canonical parent rail.
2. Treat the currently dirty parent worktree as contaminated until its tracked
   edits are either intentionally committed on a dedicated task branch or
   discarded by the owner who created them. Do not continue parent work on top
   of that mixed state.
3. Resume the parent from a clean checkout of the existing pushed owner branch,
   not from the contaminated worktree. The safest repair is to recreate the
   worker checkout from the canonical branch tip after preserving or removing
   the local dirt outside this helper flow.
4. Leave both helper branches untouched:
   - `origin/codex2/stage1-uat-closure-20260731-unblock-manual-unblock`
   - `codex2/stage1-uat-closure-20260731-unblock-history-repair`
   They are audit evidence, not the parent replay branch.
5. Once a clean parent checkout exists, follow the already-correct sequencing
   diagnosis from the manual unblock artifact:
   - finish `STAGE1-UAT-OUTBOX-RECOVERY-20260731`
   - finish `STAGE1-UAT-DURABLE-SINKS-20260731`
   - then execute `STAGE1-UAT-DISPATCHER-REPLAY-20260731`
   - then execute `STAGE1-UAT-PG-GATE-20260731`
6. Update the parent machine-truth next step to point at the canonical branch
   tip explicitly and to forbid resuming from the dirty worktree:

```bash
AI_NAME=Codex2 scripts/ai-status.sh progress STAGE1-UAT-CLOSURE-20260731 \
  "History repair confirmed canonical owner rail origin/codex2/stage1-uat-closure-20260731 @ 36d40052. Do not resume from the dirty assigned worktree; first recreate or clean the checkout to that pushed tip, then continue the already-recorded helper sequence STAGE1-UAT-OUTBOX-RECOVERY-20260731 -> STAGE1-UAT-DURABLE-SINKS-20260731 -> STAGE1-UAT-DISPATCHER-REPLAY-20260731 -> STAGE1-UAT-PG-GATE-20260731."
```

## Current Unblocked Result

- The parent is no longer blocked by uncertainty about which owner branch to
  trust.
- The canonical parent rail is
  `origin/codex2/stage1-uat-closure-20260731 @ 36d40052`.
- The remaining branch/worktree repair action is purely local:
  stop using the contaminated parent worktree and resume only from a clean
  checkout of that pushed branch tip.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The parent branch tip remains unchanged.
- The dirty worktree is quarantined as local contamination instead of being
  silently mixed into canonical history.
- The helper branches remain available as immutable unblock evidence.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read machine-truth slices for:
  - `STAGE1-UAT-CLOSURE-20260731`
  - `STAGE1-UAT-CLOSURE-20260731-UNBLOCK-HISTORY-REPAIR`
- Compared branch and helper refs:
  - `git branch --show-current`
  - `git worktree list --porcelain`
  - `git rev-parse origin/dev codex2/stage1-uat-closure-20260731 codex2/stage1-uat-closure-20260731-unblock-history-repair`
  - `git show-ref --verify refs/heads/codex2/stage1-uat-closure-20260731`
  - `git show-ref --verify refs/heads/codex2/stage1-uat-closure-20260731-unblock-manual-unblock`
  - `git show-ref --verify refs/heads/codex2/stage1-uat-closure-20260731-unblock-history-repair`
  - `git ls-remote --heads origin 'codex2/stage1-uat-closure-20260731' 'codex2/stage1-uat-closure-20260731-unblock-manual-unblock' 'codex2/stage1-uat-closure-20260731-unblock-history-repair'`
  - `git rev-list --left-right --count origin/dev...codex2/stage1-uat-closure-20260731`
  - `git rev-list --left-right --count origin/dev...codex2/stage1-uat-closure-20260731-unblock-manual-unblock`
  - `git rev-list --left-right --count codex2/stage1-uat-closure-20260731...codex2/stage1-uat-closure-20260731-unblock-manual-unblock`
  - `git log --oneline --reverse origin/dev..codex2/stage1-uat-closure-20260731`
- Inspected parent worktree contamination:
  - `git -C /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-stage1-uat-closure-20260731 status --short --branch`
  - `git -C /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-stage1-uat-closure-20260731 diff --name-only`
- Verified helper-branch PR state:
  - `gh pr list --search 'STAGE1-UAT-CLOSURE-20260731 in:title' --state all --json number,title,headRefName,baseRefName,state,url`

No runtime test was executed for this helper because the diagnosed issue is
branch/worktree state contamination, not a new executable code path.
