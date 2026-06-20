# MOB-BE-002 Unblock History Repair

## Scope

- Task: `MOB-BE-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `MOB-BE-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-20T06:47:10Z`

## Diagnosis

The parent is blocked by contaminated integration history, not by missing
feature work on the owner branch.

1. The canonical owner branch already exists on origin as
   `origin/codex/mob-be-002 @ 2767bba968e47f5c3e73eb7deb5b27253c382cb1`
   with the accepted task diff and reviewer-approved closeout evidence.
2. The integration branch currently used by PR `#805`
   (`origin/integrate/mob-be-002 @ 1372f1e8ed808ba16540455b04ecde80a7e2abcb`)
   was created from `dcfedfc7a616a343c48ae7cca97e34bd0aee0d07`
   (`merge(dev): integrate ELIG-BE-003 closeout`) instead of from a clean
   `origin/dev` plus the `MOB-BE-002` task diff.
3. Because of that parentage, PR `#805` drags unrelated `ELIG-BE-003` and
   `REP-BE-001` commits and tree changes into the integration rail.
4. PR `#805` also fails `Commit trailers` because the integration closeout
   subject is `closeout(MOB-BE-002): ...` instead of the required
   `MOB-BE-002: ...`.
5. The previous blocker text on `MOB-BE-002` and this helper artifact both
   referenced an older `origin/dev` failure, but latest `origin/dev` has
   advanced to `daa4a11bc7b482782c9de730ca1856b33373a1e7`; the previously cited
   unit target now passes in a clean verification worktree.
6. This reassigned worker branch started at `origin/dev` and did not contain the
   earlier unblock artifact committed on
   `origin/codex/mob-be-002-unblock-history-repair @ 8bb07adb9f67f44950cfb99c17063d77175a7fd6`,
   so the repair evidence needed to be replayed onto the assigned
   `codex2/mob-be-002-unblock-history-repair` branch without rewriting any
   shared ref.

## Evidence

### Branch and PR state

- `origin/dev @ daa4a11bc7b482782c9de730ca1856b33373a1e7`
- `origin/codex/mob-be-002 @ 2767bba968e47f5c3e73eb7deb5b27253c382cb1`
- `origin/integrate/mob-be-002 @ 1372f1e8ed808ba16540455b04ecde80a7e2abcb`
- `origin/codex2/mob-be-002-unblock-history-repair @ 84bf339d42c7f3ae1cf720b74e3a9732b3d4b865`
- open PR `#805`
  (`https://github.com/ajoe734/drts-fleet-platform/pull/805`) from
  `integrate/mob-be-002 -> dev`
- `git ls-remote --heads origin 'refs/heads/codex/mob-be-002' 'refs/heads/integrate/mob-be-002'`
  confirms those remote refs point at different closeout commits
  (`2767bba9` vs `1372f1e8`)
- `git merge-base origin/dev origin/codex/mob-be-002`
  returns `8ed60a27a1bfab03ecee55216d038c02e28b6703`
- `git rev-list --left-right --count origin/dev...origin/codex/mob-be-002`
  returns `20 3`
- `git merge-base origin/dev origin/integrate/mob-be-002`
  returns `dcfedfc7a616a343c48ae7cca97e34bd0aee0d07`
- `git rev-list --left-right --count origin/dev...origin/integrate/mob-be-002`
  returns `10 1`

### Exact contamination

- `git show --no-patch --pretty=raw 1372f1e8e` shows:
  - commit `1372f1e8ed808ba16540455b04ecde80a7e2abcb`
  - parent `dcfedfc7a616a343c48ae7cca97e34bd0aee0d07`
  - subject `closeout(MOB-BE-002): finalize approved heartbeat monotonicity`
- `git show --no-patch --pretty=raw 2767bba96` shows:
  - commit `2767bba968e47f5c3e73eb7deb5b27253c382cb1`
  - parent `f492c7e7cac7941e4f69802fbc3b380d582b6eda`
  - same closeout subject, but on the clean owner rail
- `git log --left-right --oneline origin/codex/mob-be-002...origin/integrate/mob-be-002`
  shows the contaminated branch contains unrelated commits:
  - `dcfedfc7a merge(dev): integrate ELIG-BE-003 closeout`
  - `a748c2f09 closeout(ELIG-BE-003): finalize runtime eligibility evaluator`
  - `d88e7431e wip(ELIG-BE-003): anchor runtime evaluator and decision persistence`
  - `24a1603e9 merge(dev): bring origin/dev into codex2/rep-be-001 before integration closeout`
  - `0f67086e4 REP-BE-001: finalize approved daily dispatch record rebuild`
  - `2814ded39 feat(REP-BE-001): rebuild daily dispatch records from persisted events`
  - `491675deb REP-BE-001: build daily dispatch records from runtime events`
  - `9660c1835 REP-BE-001: finalize approved daily dispatch record rebuild`
  - `0d4cdef50 feat(REP-BE-001): rebuild daily dispatch records from persisted events`
  - `a6805ff7d REP-BE-001: build daily dispatch records from runtime events`
- `git diff --name-status origin/codex/mob-be-002 origin/integrate/mob-be-002`
  confirms tree contamination by unrelated files under
  `apps/api/src/modules/reporting*`,
  `apps/api/src/modules/vehicle-eligibility/*`, and associated tests
- `gh pr checks 805` at `2026-06-20T06:41Z` reports:
  - `Commit trailers`: fail
  - `Smoke acceptance`: fail
  - `BFF-only imports`: pass
  - `Runtime mirror guard`: pass
  - `i18n guard`: pass

### Latest trunk verification

- `git rev-parse origin/dev` returns
  `daa4a11bc7b482782c9de730ca1856b33373a1e7`
- in a clean temporary worktree detached at `origin/dev`, the commands
  `pnpm install --frozen-lockfile` and
  `pnpm --filter @drts/api test -- --run tests/unit/regulatory-registry.service.test.ts`
  completed successfully with:
  - `Test Files 74 passed (74)`
  - `Tests 618 passed (618)`
  - `Duration 9.24s`

## Exact Contamination

This blocker is a four-part branch/worktree/commit contamination issue:

1. The owner branch `origin/codex/mob-be-002` already contains the task-owned
   closeout evidence and should remain the canonical owner rail.
2. The integration branch `origin/integrate/mob-be-002` was created from
   `dcfedfc7` instead of from a clean `origin/dev` plus the task diff, so it
   carries unrelated commits and file changes from other tasks.
3. The contaminated PR branch also uses an invalid integration closeout subject
   (`closeout(MOB-BE-002): ...`), which independently fails the commit trailer
   gate.
4. The reassigned unblock worker branch initially lacked the prior analysis
   artifact, even though the diagnosis had already been captured on a different
   lane branch; replaying that evidence onto the assigned `codex2/...` branch is
   required to close this helper task on its own canonical rail.
5. Parent machine truth is also contaminated by staleness: `MOB-BE-002.next`
   still tells the owner to respin from `origin/dev@156338686708ce...`, which is
   no longer the live trunk tip and can send the parent back to an outdated base.

## Non-Destructive Repair Path

Do not force-push, rewrite, or rename any shared branch.

1. Treat `origin/codex/mob-be-002 @ 2767bba9` as the only canonical owner rail
   for `MOB-BE-002`.
2. Freeze `origin/integrate/mob-be-002 @ 1372f1e8` and PR `#805` as audit-only
   contamination evidence. Do not merge it and do not attempt to salvage it by
   rebasing or force-pushing.
3. Resume the parent from the pushed owner branch, not from the contaminated
   integration branch.
4. Create a fresh integration branch from current
   `origin/dev @ daa4a11bc7b482782c9de730ca1856b33373a1e7` using only the
   `MOB-BE-002` task diff from `origin/codex/mob-be-002`. A safe path is:
   - branch from `origin/dev`
   - replay the task-owned change only
   - create a compliant integration closeout commit with subject
     `MOB-BE-002: finalize approved heartbeat monotonicity`
   - open a replacement PR against `dev`
5. Update parent machine truth so the next step explicitly says:
   - do not reuse `integrate/mob-be-002` / PR `#805`
   - respin a clean integration branch from
     `origin/dev@daa4a11bc7b482782c9de730ca1856b33373a1e7`
   - reopen PR with the compliant subject once the new branch is pushed

## Current Unblocked Result

- The exact contamination has been isolated to `origin/integrate/mob-be-002`
  and PR `#805`, not the owner branch.
- The stale trunk-regression blocker is no longer current; latest verified
  `origin/dev @ daa4a11bc7b482782c9de730ca1856b33373a1e7` passes the previously
  cited regulatory-registry unit target in a clean verification worktree.
- Parent task `MOB-BE-002` can resume from
  `origin/codex/mob-be-002 @ 2767bba968e47f5c3e73eb7deb5b27253c382cb1`
  with a concrete next step: rebuild a clean integration PR and abandon the
  contaminated one, with parent machine truth refreshed to the current dev tip.

## Why This Is Safe

- No remote ref is rewritten.
- No force-push is required.
- The clean owner branch remains unchanged.
- The contaminated integration branch remains available for audit.
- The repair path uses a new clean integration branch instead of mutating the
  shared history already visible in PR `#805`.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md` and
  `.orchestrator/skills/worker-anchor-commit.md`
- Queried machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show MOB-BE-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show MOB-BE-002`
- Inspected branch/worktree/commit state:
  - `git worktree list --porcelain`
  - `git branch -vv`
  - `git log --left-right --oneline origin/codex/mob-be-002...origin/integrate/mob-be-002`
  - `git diff --name-status origin/codex/mob-be-002 origin/integrate/mob-be-002`
  - `git show --no-patch --pretty=raw 1372f1e8e`
  - `git show --no-patch --pretty=raw 2767bba96`
  - `git ls-remote --heads origin 'refs/heads/codex/mob-be-002' 'refs/heads/integrate/mob-be-002'`
  - `git merge-base origin/dev origin/codex/mob-be-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/mob-be-002`
  - `git merge-base origin/dev origin/integrate/mob-be-002`
  - `git rev-list --left-right --count origin/dev...origin/integrate/mob-be-002`
- Checked GitHub evidence:
  - `gh pr view 805 --json number,title,url,state,baseRefName,headRefName,commits`
  - `gh pr checks 805`
- Re-verified the stale trunk blocker on latest `origin/dev` in a clean temp
  worktree:
  - `git worktree add --detach /tmp/mob-be-002-devcheck.WGZ5T7 origin/dev`
  - `cd /tmp/mob-be-002-devcheck.WGZ5T7`
  - `pnpm install --frozen-lockfile`
  - `pnpm --filter @drts/api test -- --run tests/unit/regulatory-registry.service.test.ts`
