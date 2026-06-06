# DH-DRV-STATE-DEEPEN Unblock History Repair

## Scope

- Task: `DH-DRV-STATE-DEEPEN-UNBLOCK-HISTORY-REPAIR`
- Parent: `DH-DRV-STATE-DEEPEN`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-06`

## Diagnosis

The parent is blocked by machine-truth status contamination, not by a branch,
worktree, or shared-commit history problem.

1. The canonical owner branch already exists remotely as
   `origin/codex2/dh-drv-state-deepen @ 25ba44a4f116fbd01949e358b67b956b8793f975`.
2. That remote branch already contains the implementation commit
   `d3812aad3d4aeb69bec5f033d585b3d8fa156860`
   (`feat(DH-DRV-STATE-DEEPEN): deepen driver task states`) and the owner
   closeout verification commit
   `25ba44a4f116fbd01949e358b67b956b8793f975`
   (`chore(DH-DRV-STATE-DEEPEN): closeout verification`).
3. The reviewer already moved the parent to `review_approved` at
   `2026-06-06T10:15:12Z`, with reproduced green gates for:
   `pnpm --filter @drts/ui-tokens build`,
   `pnpm --filter @drts/driver-app typecheck`, and
   `pnpm --filter @drts/driver-app test`.
4. The owner then recorded `progress` at `2026-06-06T10:16:03Z`. In this
   control plane, `progress` on a `review_approved` task demotes the status back
   to `in_progress`.
5. The owner subsequently recorded a `blocker` at `2026-06-06T10:17:47Z`,
   which left the parent `blocked` even though the branch had already been
   pushed and the verification evidence was complete.
6. The assigned reviewer worktree for `claude2/dh-drv-state-deepen` is not a
   contaminated replay surface; it simply remains at `origin/dev` tip
   `9899fbe1` because no code replay is needed there. The missing action is a
   reviewer status restoration, not a git history repair on that branch.

## Exact Contamination

The contamination is control-plane state regression with misleading helper
branch optics:

1. Parent branch history is healthy and already pushed on the correct owner
   branch.
2. Reviewer evidence is healthy and already logged in machine truth.
3. A `progress` state transition on the owner side demoted the parent from
   `review_approved` to `in_progress`.
4. The follow-up `blocker` then made the task appear blocked on reviewer
   action, even though the only missing step is to re-issue the reviewer
   approval so the owner can legally run `done`.
5. Because the helper reviewer branch name
   `claude2/dh-drv-state-deepen` points at `origin/dev`, it can look like
   branch contamination, but that branch never needed the parent code stack.
   The real state-bearing branch is still
   `origin/codex2/dh-drv-state-deepen @ 25ba44a4`.

## Evidence

### Branch and commit state

- `git show-ref` confirms:
  - `refs/heads/codex2/dh-drv-state-deepen @ 25ba44a4f116fbd01949e358b67b956b8793f975`
  - `refs/remotes/origin/codex2/dh-drv-state-deepen @ 25ba44a4f116fbd01949e358b67b956b8793f975`
  - `refs/heads/claude2/dh-drv-state-deepen @ 9899fbe11723765d965cb06c01c3c40b7594746b`
- `git ls-remote --heads origin` confirms the canonical remote parent branch:
  - `origin/codex2/dh-drv-state-deepen @ 25ba44a4f116fbd01949e358b67b956b8793f975`
- `git show --stat --summary 25ba44a4` confirms the pushed closeout verification
  commit with trailers:
  - `LLM-Agent: Codex2`
  - `Task-ID: DH-DRV-STATE-DEEPEN`
  - `Reviewer: Claude2`
  - `Verification: pnpm --filter @drts/ui-tokens build; pnpm --filter @drts/driver-app typecheck; pnpm --filter @drts/driver-app test`
- `git show --stat --summary d3812aad` confirms the implementation diff exists
  on the parent branch across:
  - `apps/driver-app/app/jobs.tsx`
  - `apps/driver-app/app/trip.tsx`
  - `apps/driver-app/lib/trip-workflow.ts`
  - `apps/driver-app/tests/unit/trip-workflow.test.ts`
  - `apps/driver-app/vitest.config.ts`
- `git rev-list --left-right --count origin/dev...origin/codex2/dh-drv-state-deepen`
  returns `2 2`, which is consistent with a normal owner branch on an older
  `dev` base plus two task commits; it does not indicate contamination or a
  missing push.

### Machine-truth timeline

- `ai-activity-log.jsonl` records:
  - `2026-06-06T10:09:53Z` owner handoff to reviewer
  - `2026-06-06T10:15:12Z` reviewer `review_approved`
  - `2026-06-06T10:16:03Z` owner `progress`
  - `2026-06-06T10:17:47Z` owner `blocker`
- `.orchestrator/state.json` blocked-task triage records the chair diagnosis:
  the task is a "pure machine-truth status regression" and the concrete repair
  is to have `Claude2` restore `review_approved`, after which `Codex2` can
  immediately finalize `done` with pushed metadata.

## Non-Destructive Repair Path

Do not force-push, rewrite, or replay any shared branch. Repair the parent by
restoring the status transition sequence on top of the already-pushed owner
branch.

1. Keep `origin/codex2/dh-drv-state-deepen @ 25ba44a4` as the canonical parent
   branch. No git repair is required there.
2. Have the assigned reviewer `Claude2` re-approve the parent task
   `DH-DRV-STATE-DEEPEN` with the already-verified evidence. The message should
   explicitly cite the pushed branch and closeout commit:

```bash
AI_NAME=Claude2 scripts/ai-status.sh approve DH-DRV-STATE-DEEPEN \
  "Re-restored review_approved after machine-truth regression: pushed owner branch origin/codex2/dh-drv-state-deepen@25ba44a4 already contains implementation commit d3812aad and closeout verification commit 25ba44a4; reproduced pnpm --filter @drts/ui-tokens build, pnpm --filter @drts/driver-app typecheck, pnpm --filter @drts/driver-app test."
```

3. Once the parent is back in `review_approved`, have the owner `Codex2`
   immediately finalize it to `done` with the pushed metadata already known to
   be correct:

```bash
AI_NAME=Codex2 \
COMMIT_HASH=25ba44a4f116fbd01949e358b67b956b8793f975 \
COMMIT_SUBJECT="chore(DH-DRV-STATE-DEEPEN): closeout verification" \
PUSH_REMOTE=origin \
PUSH_BRANCH=codex2/dh-drv-state-deepen \
INTEGRATION_STATUS=branch_pushed \
scripts/ai-status.sh done DH-DRV-STATE-DEEPEN \
  "Finalized after review restoration: owner branch origin/codex2/dh-drv-state-deepen was already pushed at 25ba44a4 with implementation commit d3812aad included; verification green for ui-tokens build, driver-app typecheck, and driver-app test."
```

4. Do not reopen the implementation task unless a new code defect appears. The
   existing `blocked` state is procedural, not product-semantic.
5. Leave `claude2/dh-drv-state-deepen` untouched. It is only a reviewer worktree
   alias at `origin/dev` and does not need any replay commit.

## Concrete Parent Next Step

`DH-DRV-STATE-DEEPEN` should remain `blocked` only until `Claude2` restores
`review_approved`, then `Codex2` should immediately run `done` using pushed
metadata from `origin/codex2/dh-drv-state-deepen @ 25ba44a4`.

Recommended machine-truth wording:

> Parent code and push evidence are complete on
> `origin/codex2/dh-drv-state-deepen @ 25ba44a4` (implementation
> `d3812aad`, closeout `25ba44a4`). This is a status regression only:
> `Claude2` should re-approve `DH-DRV-STATE-DEEPEN`, then `Codex2` should
> immediately finalize `done` with `COMMIT_HASH=25ba44a4`,
> `PUSH_REMOTE=origin`, `PUSH_BRANCH=codex2/dh-drv-state-deepen`, and
> `INTEGRATION_STATUS=branch_pushed`. No force-push or branch replay is needed.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The already-pushed owner branch remains the sole canonical implementation
  branch.
- The reviewer only replays a control-plane approval, not any code change.
- The owner finalizes from already-existing pushed evidence.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected parent/helper machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show DH-DRV-STATE-DEEPEN`
  - `AI_NAME=Codex scripts/ai-status.sh show DH-DRV-STATE-DEEPEN-UNBLOCK-HISTORY-REPAIR`
- Compared branch/worktree state:
  - `git branch --show-current`
  - `git status --short`
  - `git branch -a | grep 'dh-drv-state-deepen'`
  - `git show-ref | grep 'dh-drv-state-deepen'`
  - `git ls-remote --heads origin | grep 'dh-drv-state-deepen'`
  - `git worktree list --porcelain`
- Confirmed parent commits and delta:
  - `git show --stat --summary 25ba44a4`
  - `git show --stat --summary d3812aad`
  - `git rev-list --left-right --count origin/dev...origin/codex2/dh-drv-state-deepen`
  - `git diff --name-only origin/dev..origin/codex2/dh-drv-state-deepen`
- Confirmed status-regression timeline:
  - `grep -n 'DH-DRV-STATE-DEEPEN' /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl | tail -n 20`
  - `sed -n '27488,27518p' /home/edna/workspace/drts-fleet-platform/.orchestrator/state.json`
