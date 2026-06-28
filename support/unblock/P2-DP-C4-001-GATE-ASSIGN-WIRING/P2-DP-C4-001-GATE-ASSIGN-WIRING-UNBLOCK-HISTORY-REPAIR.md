# P2-DP-C4-001-GATE-ASSIGN-WIRING Unblock History Repair

## Scope

- Task: `P2-DP-C4-001-GATE-ASSIGN-WIRING-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-DP-C4-001-GATE-ASSIGN-WIRING`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-06-28T05:57:50+00:00`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-dp-c4-001-gate-assign-wiring-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-dp-c4-001-gate-assign-wiring-unblock-history-repair`

## Diagnosis

`P2-DP-C4-001-GATE-ASSIGN-WIRING` is no longer blocked by missing code or by
an active feature PR. The actual gate-wiring delivery already landed on
`origin/dev`, but the parent task's machine-truth note still points at a stale
PR `#982` CI failure message even though the PR merged, while local
branches/worktrees still advertise older history-repair rails that are no
longer safe to resume from.

1. The canonical delivered parent result is `origin/dev @ 589df2125dc8...`
   with subject
   `P2-DP-C4-001-GATE-ASSIGN-WIRING: wire sandbox gate into owned-mobility assign (#982)`.
   `gh pr view 982` confirms PR `#982` is `MERGED` into `dev` at
   `2026-06-28T05:46:15Z`.
2. The clean task branch that produced PR `#982` still exists locally as
   `codex/p2-dp-c4-001-gate-assign-wiring @ 52c0dbe6c9b3...`, but
   `git fetch origin --prune` removed its upstream
   `origin/codex/p2-dp-c4-001-gate-assign-wiring` after merge. Its reflog shows
   only the expected two task commits created from `origin/dev @ 9a1afeda34ba...`.
   It is now audit evidence only, not an active resume rail.
3. A different branch family,
   `origin/codex2/p2-dp-c4-001-history-repair @ c9df97a2ebd6...`, is the head
   of PR `#951`. `gh pr view 951` reports that PR is `CLOSED` (not merged) and
   has `mergeStateStatus: DIRTY`.
4. That old `codex2/...-history-repair` rail is itself contaminated in two
   ways:
   - the remote head is based on `7fcee8ff5b25...` and sits `11` commits behind
     `origin/dev` while carrying `3` unique commits
   - the active local worktree branch
     `codex2/p2-dp-c4-001-history-repair @ 55d209156257...`
     (`/tmp/p2-dp-c4-001-history-repair`) is not even at the PR head SHA; it is
     based on the much older `1170c229143f...`, sits `24` commits behind
     `origin/dev`, and is missing remote head commit `c9df97a2ebd6...`
5. The old `codex2/...-history-repair` diff against current `origin/dev`
   touches only `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
   (1284 insertions / 35 deletions). It does not represent the final three-file
   gate-wiring delivery that merged through PR `#982`.
6. The parent task stays artificially `blocked` only because machine truth still
   cites the stale PR `#982` CI failure note instead of the already-merged dev
   commit `589df2125dc8...`.

## Evidence

### Canonical parent delivery rail

- `origin/dev @ 589df2125dc8422ab027ef18800f69ab9af12a8c`
- `git show --stat --summary --no-patch origin/dev` shows subject
  `P2-DP-C4-001-GATE-ASSIGN-WIRING: wire sandbox gate into owned-mobility assign (#982)`
- `gh pr view 982 --json number,title,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit,url`
  reports:
  - PR `#982`
  - state `MERGED`
  - head `codex/p2-dp-c4-001-gate-assign-wiring`
  - head SHA `52c0dbe6c9b31d7e1393d4607f466d299c5b617d`
  - merge commit `589df2125dc8422ab027ef18800f69ab9af12a8c`
  - merged at `2026-06-28T05:46:15Z`
  - URL `https://github.com/ajoe734/drts-fleet-platform/pull/982`

### Merged clean owner branch now reduced to audit evidence

- local `codex/p2-dp-c4-001-gate-assign-wiring @ 52c0dbe6c9b31d7e1393d4607f466d299c5b617d`
- `git reflog show --date=iso codex/p2-dp-c4-001-gate-assign-wiring` records:
  - `branch: Created from origin/dev`
  - `wip(P2-DP-C4-001-GATE-ASSIGN-WIRING): anchor owned-mobility assign gate wiring`
  - `P2-DP-C4-001-GATE-ASSIGN-WIRING: close out approved gate wiring`
- `git fetch origin --prune` reports deleted upstream:
  `- [deleted] (none) -> origin/codex/p2-dp-c4-001-gate-assign-wiring`
- `git rev-list --left-right --count origin/dev...codex/p2-dp-c4-001-gate-assign-wiring`
  returns `1 2` because the canonical result now lives as the squash/merge commit
  on `origin/dev`, not on the deleted remote head branch

### Contaminated old history-repair rail

- remote `origin/codex2/p2-dp-c4-001-history-repair @ c9df97a2ebd6957d9a61504a2df8ad66d15f112c`
- local worktree branch `codex2/p2-dp-c4-001-history-repair @ 55d209156257fc5b309b6477ca5b451e745deff6`
- active attached worktree:
  `/tmp/p2-dp-c4-001-history-repair`
- `gh pr view 951 --json number,title,state,headRefName,headRefOid,baseRefName,mergeStateStatus,closedAt,url`
  reports:
  - PR `#951`
  - state `CLOSED`
  - head `codex2/p2-dp-c4-001-history-repair`
  - head SHA `c9df97a2ebd6957d9a61504a2df8ad66d15f112c`
  - `mergeStateStatus: DIRTY`
  - closed at `2026-06-27T12:37:30Z`
  - URL `https://github.com/ajoe734/drts-fleet-platform/pull/951`
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-dp-c4-001-history-repair`
  returns `11 3`
- `git rev-list --left-right --count origin/dev...codex2/p2-dp-c4-001-history-repair`
  returns `24 2`
- `git reflog show --date=iso codex2/p2-dp-c4-001-history-repair` shows the local
  worktree branch was created from `origin/dev @ 1170c229143f...` on
  `2026-06-26`, then stopped at:
  - `P2-DP-C4-001: repair sandbox fulfillment ledger delivery on clean dev base`
  - `P2-DP-C4-001: finalize review-approved owner closeout`
- `git log --oneline --reverse origin/dev..origin/codex2/p2-dp-c4-001-history-repair`
  shows the remote PR head additionally carries:
  - `P2-DP-C4-001: reconcile e2e-p2-006 evidence-freeze test with restored full gate`
- `git diff --stat origin/dev...origin/codex2/p2-dp-c4-001-history-repair -- apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/src/modules/owned-mobility/owned-mobility.module.ts apps/api/tests/integration/e2e-p2-008-human-fallback.test.ts`
  shows only `owned-mobility.service.ts` changed on that stale rail

## Exact Contamination

The exact contamination is a four-way identity collision around the same parent
task:

1. The true delivered parent rail is already the merged `origin/dev` commit
   `589df2125dc8...` from PR `#982`.
2. The clean task branch `codex/p2-dp-c4-001-gate-assign-wiring` still exists
   locally, but its upstream branch was deleted after merge. It is historical
   evidence, not a live branch to continue from.
3. The older PR rail `origin/codex2/p2-dp-c4-001-history-repair` is closed,
   dirty, and based on an outdated dev ancestor. It never became the canonical
   delivery.
4. The attached local worktree branch `codex2/p2-dp-c4-001-history-repair` is
   worse than stale: it does not even match the closed PR head SHA, so a worker
   resuming from `/tmp/p2-dp-c4-001-history-repair` would be on a third,
   branch-local history that is neither the canonical merge nor the final PR
   head.

That combination makes the parent appear blocked even though the real fix is
already merged.

## Non-Destructive Repair Path

Do not force-push, resurrect, or continue either historical repair branch.

1. Treat `origin/dev @ 589df2125dc8422ab027ef18800f69ab9af12a8c` as the only
   canonical parent delivery rail for `P2-DP-C4-001-GATE-ASSIGN-WIRING`.
2. Treat local `codex/p2-dp-c4-001-gate-assign-wiring @ 52c0dbe6c...` as audit
   evidence only; do not use the deleted upstream branch as the source of truth.
3. Treat both `origin/codex2/p2-dp-c4-001-history-repair @ c9df97a2...` and the
   active local worktree branch `codex2/p2-dp-c4-001-history-repair @ 55d209156...`
   as contaminated stale rails. Do not resume coding, CI reruns, or closeout
   from either SHA.
4. Repair machine truth to point at the merged canonical evidence instead of the
   stale closed PR:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen \
  P2-DP-C4-001-GATE-ASSIGN-WIRING \
  "Canonical rail is origin/dev@589df2125 via merged PR #982; do not resume closed DIRTY PR #951 or stale codex2/p2-dp-c4-001-history-repair worktree. Finalize parent against merged dev evidence."
```

5. If any follow-up bug remains after the merged gate wiring, branch fresh from
   current `origin/dev` instead of either stale parent rail:

```bash
git fetch origin --prune
git switch -c <lane>/p2-dp-c4-001-gate-assign-followup origin/dev
```

## Concrete Parent Next Step

`P2-DP-C4-001-GATE-ASSIGN-WIRING` should no longer be blocked on the old
history-repair rail. The concrete safe next step is:

1. Update machine truth so the parent no longer cites stale PR `#951` / old CI
   notes as its active blocker.
2. Use merged PR `#982` and `origin/dev @ 589df2125dc8...` as the canonical
   closeout evidence.
3. If supervisor still wants an owner closeout pass, do it from fresh current
   `origin/dev`, not from `/tmp/p2-dp-c4-001-history-repair`.
4. Any residual runtime or CI concern after that should be tracked as a new
   follow-up task, not as continued work on the contaminated history-repair rail.

## Why This Is Safe

- No shared history is rewritten.
- No force-push is required.
- PR `#982` remains the authoritative review/merge record for the delivered
  gate-wiring change.
- The stale `codex2/...-history-repair` branch and its active worktree are
  explicitly marked unsafe instead of being silently reused.
- Future follow-up work starts from current `origin/dev`, which already contains
  the feature delivery.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C4-001-GATE-ASSIGN-WIRING-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C4-001-GATE-ASSIGN-WIRING`
- Inspected related refs, worktrees, and drift:
  - `git fetch origin --prune`
  - `git worktree list --porcelain`
  - `git branch -vv | grep 'p2-dp-c4-001'`
  - `git log --graph --decorate --oneline --max-count=25 origin/dev codex/p2-dp-c4-001-gate-assign-wiring codex2/p2-dp-c4-001-history-repair`
  - `git merge-base <ref> origin/dev`
  - `git rev-list --left-right --count origin/dev...<ref>`
  - `git reflog show --date=iso codex/p2-dp-c4-001-gate-assign-wiring`
  - `git reflog show --date=iso codex2/p2-dp-c4-001-history-repair`
  - `git diff --stat origin/dev...origin/codex2/p2-dp-c4-001-history-repair -- apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/src/modules/owned-mobility/owned-mobility.module.ts apps/api/tests/integration/e2e-p2-008-human-fallback.test.ts`
- Inspected merge / PR evidence:
  - `git show --stat --summary --no-patch origin/dev`
  - `git show --stat --summary --no-patch 52c0dbe6c`
  - `git show --stat --summary --no-patch 55d209156`
  - `gh pr view 982 --json number,title,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit,url`
  - `gh pr view 951 --json number,title,state,headRefName,headRefOid,baseRefName,mergeStateStatus,closedAt,url`

No runtime or package tests were run in this helper task. This repair is
branch/worktree/commit history triage and machine-truth correction only.
