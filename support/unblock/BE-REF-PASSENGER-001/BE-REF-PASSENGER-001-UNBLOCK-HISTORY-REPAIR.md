# BE-REF-PASSENGER-001 Unblock History Repair

## Scope

- Task: `BE-REF-PASSENGER-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `BE-REF-PASSENGER-001`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Audit timestamp: `2026-08-01T15:56:00Z`

## Diagnosis

The parent was blocked by shared-branch history contamination plus an unrelated
integration-trunk guard failure, not by missing BE-REF-PASSENGER-001 code.

1. `codex/be-ref-passenger-001 @ 01904db48156f8c8b97ca8d238bf54d340d8fcca`
   is the current shared owner rail behind PR `#1230`
   (`BE-REF-PASSENGER-001: closeout reviewed referral passenger authority`).
   Relative to `origin/dev` it is `2 ahead / 0 behind`.
2. The entire task diff on PR `#1230` lives in the first commit
   `2748c91e6de0af9641c1850bd21759f21cca7918`
   (`feat(BE-REF-PASSENGER-001): wire referral passenger booking authority`).
   The second commit `01904db48156f8c8b97ca8d238bf54d340d8fcca` is an empty
   closeout commit that only carries metadata and verification trailers.
3. Repo CI validates **every** commit subject in the PR range. Running
   `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/be-ref-passenger-001`
   fails on `2748c91e...` because the subject starts with `feat(...)` instead
   of the required `<TASK-ID>: ...` or `wip(<TASK-ID>): ...` form. That defect
   cannot be repaired on PR `#1230` without rewriting shared history.
4. `codex2/be-ref-passenger-001 @ 3373e5eea20efe24480f6a32750926cbbe6f76c4`
   is a stale pushed owner rail with no PR. Relative to `origin/dev` it is
   `4 ahead / 3 behind`, and its 17-file diff still uses older referral route
   shapes such as `app/api/referral/booking/route.ts` and
   `cancel/[orderId]/route.ts`. Its isolated worktree remains parked at
   `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-be-ref-passenger-001`
   in `locked initializing` state.
5. `gemini2/be-ref-passenger-001 @ 70f359a949cbffd80e13c95b46eff85b3c65eedb`
   is a local reviewer rail only. Relative to `origin/dev` it is
   `18 ahead / 2 behind`, and `git ls-remote --heads origin` shows no matching
   `refs/heads/gemini2/be-ref-passenger-001` remote ref.
6. The remaining integration blocker after repairing the branch history is the
   unrelated `i18n-guard` failure against
   `apps/referral-embed-web/components/passenger-embed.tsx` inherited from the
   current `dev` line. That blocker is external to the BE-REF-PASSENGER-001
   task diff.

## Evidence

### Branch and PR state

- `origin/dev @ 664e786a047e02a09d1c55557e2ac0c8ac1b5faa`
- `codex/be-ref-passenger-001 @ 01904db48156f8c8b97ca8d238bf54d340d8fcca`
  with `git rev-list --left-right --count origin/dev...codex/be-ref-passenger-001`
  returning `0 2`
- `git log --oneline origin/dev..codex/be-ref-passenger-001` shows exactly:
  - `2748c91e feat(BE-REF-PASSENGER-001): wire referral passenger booking authority`
  - `01904db4 BE-REF-PASSENGER-001: closeout reviewed referral passenger authority`
- `git show --stat 01904db...` prints the closeout metadata only and no file
  diff, confirming the closeout commit is empty
- PR `#1230` (`codex/be-ref-passenger-001 -> dev`) is still open and reports:
  - branch-local `Commit trailers` failure
  - branch-local `i18n guard` queued/failed state
  - integration-trunk `i18n-guard` failure on the inherited dev surface
- `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/be-ref-passenger-001`
  fails with:
  - `subject must be <TASK-ID>: <summary>, got: 'feat(BE-REF-PASSENGER-001): wire referral passenger booking authority'`
- `codex2/be-ref-passenger-001 @ 3373e5ee...`
  with `git rev-list --left-right --count origin/dev...codex2/be-ref-passenger-001`
  returning `3 4`
- `gh pr list --state all --head codex2/be-ref-passenger-001` returns `[]`
- `git diff --stat origin/dev...codex2/be-ref-passenger-001` shows a 17-file
  older implementation surface, including:
  - `apps/api/package.json`
  - `apps/api/src/common/auth/auth.extractor.ts`
  - `apps/referral-embed-web/app/api/referral/booking/route.ts`
  - `apps/referral-embed-web/app/api/referral/cancel/[orderId]/route.ts`
  - `tests/unit/referral-embed-passenger-lifecycle.test.ts`
- local `gemini2/be-ref-passenger-001 @ 70f359a9...`
  with `git rev-list --left-right --count origin/dev...gemini2/be-ref-passenger-001`
  returning `2 18`
- `git ls-remote --heads origin` returns pushed heads for:
  - `codex/be-ref-passenger-001`
  - `codex/be-ref-passenger-001-replay`
  - `codex2/be-ref-passenger-001`
  and no `gemini2/be-ref-passenger-001`

### Non-destructive replay rail

- new replay branch:
  `codex/be-ref-passenger-001-replay @ 2c988eb2280b5ee6b52053c79bcb6d5b206be926`
- new PR `#1232`:
  `BE-REF-PASSENGER-001: replay reviewed referral passenger authority on clean history`
- `git rev-list --left-right --count origin/dev...codex/be-ref-passenger-001-replay`
  returns `0 1`
- `git diff --exit-code codex/be-ref-passenger-001 HEAD` succeeds in the replay
  worktree, proving the replay commit tree matches the approved `#1230` head
- `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
  succeeds on the replay rail
- replay worktree:
  `/tmp/be-ref-passenger-001-replay`

## Exact Contamination

The block came from four distinct history/worktree problems:

1. The shared owner PR `#1230` carries the real task diff on an intermediate
   `feat(BE-REF-PASSENGER-001): ...` commit, so CI rejects the branch before
   merge. A later empty closeout commit cannot repair that.
2. The older pushed branch `codex2/be-ref-passenger-001` still exists with a
   divergent pre-review implementation and a locked isolated worktree, so the
   same task stem maps to multiple incompatible owner rails.
3. The reviewer rail `gemini2/be-ref-passenger-001` remains local and highly
   diverged from current `origin/dev`, so it is evidence only, not a canonical
   merge candidate.
4. Even after the commit-history repair, the branch still depends on an
   unrelated inherited `dev` blocker (`i18n-guard` on
   `apps/referral-embed-web/components/passenger-embed.tsx`).

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any existing shared branch.

1. Freeze PR `#1230` and branch `codex/be-ref-passenger-001` as audit evidence.
   They remain the reviewer-approved original owner rail, but not the merge
   candidate.
2. Freeze `codex2/be-ref-passenger-001` and local
   `gemini2/be-ref-passenger-001` as stale evidence rails only.
3. Create a clean replay branch from current `origin/dev`:
   `codex/be-ref-passenger-001-replay`.
4. Replay only the approved tree diff from `2748c91e...` onto that branch and
   recommit it once as:
   `2c988eb2280b5ee6b52053c79bcb6d5b206be926`
   (`BE-REF-PASSENGER-001: replay reviewed referral passenger authority`).
5. Push the replay branch and open PR `#1232` against `dev`.
6. Update the parent task to treat PR `#1232` as the canonical merge rail and
   leave PR `#1230` as audit-only evidence.
7. After the unrelated `dev` i18n guard issue clears, continue integration
   closeout on PR `#1232`.

## Current Unblocked Result

- The history/branch contamination is repaired non-destructively by
  `codex/be-ref-passenger-001-replay @ 2c988eb...` and PR `#1232`.
- PR `#1230` remains available for audit and reviewer provenance.
- The parent task's concrete next step is now:
  - use PR `#1232` as the canonical merge rail
  - keep PR `#1230` audit-only
  - wait for or coordinate the unrelated `dev` `i18n-guard` fix before merge

## Why This Is Safe

- No remote ref was rewritten.
- No force-push was used.
- The original approved owner rail and stale evidence rails remain inspectable.
- The replay branch contains a single valid closeout commit with the same tree
  as the current reviewer-approved PR head.
- The remaining blocker is isolated to the inherited `dev` i18n surface instead
  of being conflated with task-history contamination.

## Verification Performed

- Read:
  - `AI_COLLABORATION_GUIDE.md`
  - `.orchestrator/skills/worker-anchor-commit.md`
  - `docs/ops/branch-strategy.md` §11
- Inspected task status and activity:
  - `AI_NAME=Codex scripts/ai-status.sh show BE-REF-PASSENGER-001`
  - `AI_NAME=Codex scripts/ai-status.sh show BE-REF-PASSENGER-001-UNBLOCK-HISTORY-REPAIR`
  - `rg -n '"task_id": "BE-REF-PASSENGER-001' /home/lupin/drts-fleet-platform/ai-activity-log.jsonl | tail -n 80`
- Compared branches, worktrees, and diffs:
  - `git worktree list --porcelain`
  - `git rev-parse origin/dev dev codex/be-ref-passenger-001 codex2/be-ref-passenger-001 gemini2/be-ref-passenger-001`
  - `git log --graph --oneline --decorate --max-count=30 codex2/be-ref-passenger-001 gemini2/be-ref-passenger-001 codex/be-ref-passenger-001 origin/dev --`
  - `git rev-list --left-right --count origin/dev...codex/be-ref-passenger-001`
  - `git rev-list --left-right --count origin/dev...codex2/be-ref-passenger-001`
  - `git rev-list --left-right --count origin/dev...gemini2/be-ref-passenger-001`
  - `git diff --stat origin/dev...codex/be-ref-passenger-001`
  - `git diff --stat origin/dev...codex2/be-ref-passenger-001`
  - `git log --oneline origin/dev..codex/be-ref-passenger-001`
  - `git show --stat 2748c91e6de0af9641c1850bd21759f21cca7918`
  - `git show --stat 01904db48156f8c8b97ca8d238bf54d340d8fcca`
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/be-ref-passenger-001`
  - `git ls-remote --heads origin 'refs/heads/codex/be-ref-passenger-001' 'refs/heads/codex2/be-ref-passenger-001' 'refs/heads/gemini2/be-ref-passenger-001' 'refs/heads/codex/be-ref-passenger-001-replay'`
- Created and verified the replay rail:
  - `git worktree add /tmp/be-ref-passenger-001-replay -b codex/be-ref-passenger-001-replay origin/dev`
  - `git cherry-pick -n 2748c91e6de0af9641c1850bd21759f21cca7918`
  - `git commit -m "BE-REF-PASSENGER-001: replay reviewed referral passenger authority" ...`
  - `git diff --check origin/dev...HEAD`
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
  - `git diff --exit-code codex/be-ref-passenger-001 HEAD`
  - `git push -u origin codex/be-ref-passenger-001-replay`
  - `gh pr create --base dev --head codex/be-ref-passenger-001-replay --title "BE-REF-PASSENGER-001: replay reviewed referral passenger authority on clean history" ...`
  - `gh pr view 1230 --json number,title,headRefName,baseRefName,state,url,mergeStateStatus,commits,statusCheckRollup`
  - `gh pr view 1232 --json number,title,headRefName,baseRefName,state,url,commits,statusCheckRollup`

## Owner Closeout

- Closeout timestamp: `2026-08-01T16:01:37Z`
- Approved scope still matches the task branch: this helper branch only carries
  the unblock evidence artifact, while the canonical repaired merge rail remains
  `codex/be-ref-passenger-001-replay @ 2c988eb2280b5ee6b52053c79bcb6d5b206be926`
  via PR `#1232`.
- Parent machine truth already points `BE-REF-PASSENGER-001` at the repaired
  replay rail and the remaining inherited `dev` `i18n-guard` blocker.
- This closeout branch has no deploy target of its own; integration remains
  branch-level evidence only until the parent merges PR `#1232`.
