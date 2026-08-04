# IAM-MFA-001 Unblock History Repair

## Scope

- Task: `IAM-MFA-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-MFA-001`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-08-04T15:08:00Z`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-mfa-001-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-mfa-001-unblock-history-repair`
- Latest pushed helper anchor:
  `26b9c661e64251d4964a15a281580f4dab9b0f7d`

## Diagnosis

The prior unblock artifact is stale and now points at the wrong rail.
`codex2/iam-mfa-001 @ c317d836` is no longer the live owner rail. The active
implementation history moved to `codex/iam-mfa-001`, then to
`codex/iam-mfa-001-integration`, and both open PR attempts carried contaminated
history that fails the trailer gate without any force-push-safe repair path on
those shared branches.

As of `2026-08-04` the only safe repair is to keep the contaminated rails as
audit evidence, rebuild the task content onto a fresh branch from `origin/dev`,
and continue integration from that new clean rail.

## Current Evidence

### Helper branch repair evidence

- remote branch:
  `origin/codex/iam-mfa-001-unblock-history-repair @ 26b9c661e64251d4964a15a281580f4dab9b0f7d`
- `git rev-list --left-right --count origin/codex/iam-mfa-001-unblock-history-repair...codex/iam-mfa-001-unblock-history-repair`
  => `0 0`
- conclusion:
  the refreshed unblock evidence and parent-route corrections are now on the
  pushed helper branch rather than stranded in a local-only anchor commit

### Canonical contaminated owner rail

- remote branch: `origin/codex/iam-mfa-001 @ b78dcb2e7e53f0def6bb4eac9ca2bb659d6bfae7`
- open PR: `#1287` `codex/iam-mfa-001 -> dev`
- `gh pr view 1287 --json commits,statusCheckRollup` shows:
  - head pinned at `b78dcb2e`
  - `Commit trailers` failed at run `30882208407`
  - failing commits are:
    - `b78dcb2e` subject `fix(IAM-MFA-001): gate runtime step-up helper`
    - `9a492365` subject `closeout(IAM-MFA-001): finalize approved MFA step-up policy`
    - merge commits `8a92da2f`, `2183f4d8`, `6be53f18` missing required trailers
- this rail is `4` commits ahead and `29` behind `origin/dev`

### Superseded intermediate clean-up attempt

- remote branch:
  `origin/codex/iam-mfa-001-integration @ 91c19366019ffe9e28f0f256c32d9218ef813ef2`
- open PR: `#1293` `codex/iam-mfa-001-integration -> dev`
- `gh pr view 1293 --json commits,statusCheckRollup` shows:
  - commit history removed the merge commits
  - `Commit trailers` still failed at run `30882247205`
  - the remaining failure is only commit `91c19366` subject
    `fix(IAM-MFA-001): gate runtime step-up helper`
- this rail is `6` commits ahead and `3` behind `origin/dev`
- tree diff versus `b78dcb2e` is still non-empty:
  `16 files changed, 855 insertions, 16 deletions`
- conclusion: cleaner than `#1287`, but not yet a valid canonical integration
  rail

### New clean integration rail

- remote branch:
  `origin/codex/iam-mfa-001-clean-route @ e3ecc0a0ee6db9258358c25cf096ad032b054aea`
- open PR: `#1303` `codex/iam-mfa-001-clean-route -> dev`
- commits on the clean rail:
  - `c0c283d2` `IAM-MFA-001: integrate MFA step-up policy to dev`
  - `42b08904` `IAM-MFA-001: refresh step-up bearer-path integration`
  - `e3ecc0a0` `IAM-MFA-001: gate runtime step-up helper`
- local validation on the clean rail:
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
    => `3 commit(s) OK.`
  - `git rev-list --left-right --count origin/dev...HEAD` => `0 3`
  - `gh pr view 1303 --json statusCheckRollup` at `2026-08-04T14:18:18Z`
    shows `Commit trailers = SUCCESS`
- current GitHub integration state for the same PR:
  - `gh pr view 1303 --json statusCheckRollup` at `2026-08-04T14:32:31Z`
    shows `iam-negative-matrix = FAILURE`, `e2e = FAILURE`, and downstream
    `ci-integ = FAILURE`
- baseline integration comparison on `dev`:
  - `gh run list --workflow "CI (integration trunk)" --branch dev --limit 5`
    at `2026-08-04T15:01:xxZ` shows the most recent completed `dev` run
    `30906537102` for `ORCH-QUEUE-VALIDATION-004` concluded `success`
- PR `#1303` is the first rail that:
  - starts directly from `origin/dev`
  - avoids merge commits from prior contaminated rails
  - keeps only `<TASK-ID>: <summary>` commit subjects
  - passes the GitHub trailer gate without rewriting shared history

## Exact Contamination

The contamination was no longer a simple stale same-tree branch problem.
By `2026-08-04` it had become a three-rail integration split:

1. `#1287` used the historical owner branch and accumulated merge commits plus
   two invalid subjects, making trailer repair impossible without force-pushing
   or abandoning the PR.
2. `#1293` rebuilt part of the history but still retained one invalid
   `fix(IAM-MFA-001): ...` subject, so the trailer gate still failed.
3. Parent machine truth still said `IAM-MFA-001` was `done` with
   `integration_status=not_applicable` even though the real integration state
   was an open PR with failed CI history.

That combination meant a future worker could pick the wrong PR, assume the
parent was already integrated, or keep retrying CI on history that can never
pass the trailer gate as-is.

## Non-Destructive Repair Path

Do not force-push any existing branch. Do not rewrite `codex/iam-mfa-001`,
`codex/iam-mfa-001-integration`, or their PR history.

1. Treat `#1287` and `#1293` as audit evidence only.
2. Treat `codex/iam-mfa-001-clean-route @ e3ecc0a0` and PR `#1303` as the only
   canonical clean integration route.
3. Continue review and CI only on `#1303`.
4. Keep the older branches/PRs open only long enough for reviewers to cross-map
   evidence, then close them without merging once `#1303` becomes the accepted
   integration rail.
5. Do not move the parent forward as integrated until machine truth references
   the clean rail rather than the contaminated rails.

## Parent Resume Status

`IAM-MFA-001` must not stay `done` with `integration_status=not_applicable`.
The unblock result proves the parent still needs active integration follow-up.

That machine-truth correction has now been executed and refreshed:

- `AI_NAME=Codex scripts/ai-status.sh reopen IAM-MFA-001 "..."`
- `IAM-MFA-001` is now `status=in_progress` as of `2026-08-04T14:48:39Z`
- `next` now points to PR `#1303` on
  `codex/iam-mfa-001-clean-route @ e3ecc0a0` and marks `#1287` / `#1293` as
  audit-only contaminated attempts
- parent integration metadata now records the live clean route instead of the
  stale closeout residue:
  - `integration_status=ci_failed`
  - `pr_url=https://github.com/ajoe734/drts-fleet-platform/pull/1303`
  - `ci_status=CI (integration trunk) failed on run 30918215661`
  - `ci_run_url=https://github.com/ajoe734/drts-fleet-platform/actions/runs/30918215661`

## Validation Status

### What is now validated

- a force-push-free repair path exists
- the repaired path is materialized as branch
  `codex/iam-mfa-001-clean-route`
- the repaired path is materialized as PR `#1303`
- the repaired path passes the `Commit trailers` GitHub gate

### What is still pending on the new clean rail

At `2026-08-04T14:32:31Z`, PR `#1303` no longer has in-flight integration
checks. The clean rail is trailer-compliant, but it is not yet a validated
`merged_to_dev` route because `CI (integration trunk)` failed:

- `iam-negative-matrix` failed in run `30918215661`
  - hermetic `E2E-004` failed on `POST /api/platform-admin/tenants`
  - hermetic `E2E-018` failed on `POST /api/auth/driver/device/register`
  - both returned `401` with `JWT_INVALID`
- `e2e` failed in run `30918215661`
  - hermetic failures include `E2E-001`, `002`, `003`, `004`, `007`, `008`,
    `011`, `012`, `013`, `014`, `015`, `016`, `017`, `018`, `019`, `020`,
    `021`, and `022`
  - the repeated signature is `401 JWT_INVALID` on authenticated routes such as
    `/api/regulatory-registry/driver-location`,
    `/api/forwarder/orders/inbound`, `/api/admin/service-products`, and
    `/api/driver/location-heartbeats/batch`
- `ci-integ` then concluded `FAILURE` because the upstream integration jobs did
  not pass

This means Acceptance 2 remains open: the clean route is documented and proven
history-safe, but it is blocked on real runtime/auth integration failures
rather than branch contamination.

Those failures are now narrowed to the clean-route helper delta rather than an
ambient `dev` outage:

- `origin/dev` had a successful completed `CI (integration trunk)` run
  (`30906537102`) earlier on `2026-08-04`
- the last clean-route-only commit on PR `#1303` is
  `e3ecc0a0 IAM-MFA-001: gate runtime step-up helper`
- that commit only changes `tests/e2e/lib/helpers.sh`
- the helper now auto-mints `x-drts-authorization` runtime bearer tokens for
  every mutating request, and when such a bearer exists it suppresses the
  legacy bootstrap `x-actor-*` headers
- the resulting failures are concentrated on authenticated mutating routes that
  previously relied on bootstrap actor headers, producing `401 JWT_INVALID` on
  paths such as `/api/platform-admin/tenants`,
  `/api/regulatory-registry/driver-location`,
  `/api/forwarder/orders/inbound`,
  `/api/admin/service-products`, and
  `/api/driver/location-heartbeats/batch`

So the remaining block is no longer "clean route unknown"; it is a concrete
runtime-bearer regression introduced on top of the repaired history-safe rail.

Acceptance 3 is now satisfied in machine truth: the parent may proceed only
against PR `#1303`, and canonical status no longer implies that integration is
complete or not applicable.

## Why This Is Safe

- no shared branch was rewritten
- no force-push was used
- contaminated rails remain preserved for audit
- the clean route is reproducible from `origin/dev` plus three explicit commits
- the new canonical route is already recognized by GitHub as trailer-compliant

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `docs/ops/branch-strategy.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001`
  - `AI_NAME=Codex scripts/ai-status.sh progress IAM-MFA-001-UNBLOCK-HISTORY-REPAIR "..."`
  - `AI_NAME=Codex scripts/ai-status.sh reopen IAM-MFA-001 "..."`
  - `_AI_STATUS_DELEGATED=1 AI_STATUS_ROOT=/home/lupin/drts-fleet-platform INTEGRATION_STATUS=ci_failed PR_URL=https://github.com/ajoe734/drts-fleet-platform/pull/1303 CI_STATUS="CI (integration trunk) failed on run 30918215661" CI_RUN_URL=https://github.com/ajoe734/drts-fleet-platform/actions/runs/30918215661 AI_NAME=Codex python3 scripts/ai_status.py progress IAM-MFA-001 "..."`
- Inspected contaminated rails and PRs:
  - `gh pr view 1287 --json number,title,state,url,headRefName,baseRefName,headRefOid,commits,statusCheckRollup,mergeable,reviewDecision,updatedAt`
  - `gh pr view 1293 --json number,title,state,url,headRefName,baseRefName,headRefOid,commits,statusCheckRollup,mergeable,reviewDecision,updatedAt`
  - `gh run view 30882208407 --log-failed`
  - `gh run view 30882247205 --log-failed`
  - `gh run view 30882247215 --job 91905876695 --log-failed`
  - `gh run view 30882247215 --job 91905876663 --log-failed`
- Rebuilt the clean rail in a temporary worktree from `origin/dev`:
  - `git worktree add -b codex/iam-mfa-001-clean-route /tmp/iam-mfa-001-clean-route origin/dev`
  - `git cherry-pick a398dcd03a09f61fff145eae581904a9628b3ccb`
  - `git cherry-pick 7e3e7603516756cd20b461219be5f3a302c7f126`
  - `git cherry-pick --no-commit 91c19366019ffe9e28f0f256c32d9218ef813ef2`
  - recommitted as
    `IAM-MFA-001: gate runtime step-up helper`
- Validated and published the clean rail:
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
  - `git push -u origin codex/iam-mfa-001-clean-route`
  - `git push origin codex/iam-mfa-001-unblock-history-repair`
  - `gh pr create --base dev --head codex/iam-mfa-001-clean-route ...`
  - `gh pr view 1303 --json number,title,state,url,headRefName,baseRefName,headRefOid,commits,statusCheckRollup,mergeable,updatedAt`
  - `gh run view 30918215661 --job 92021690866 --log-failed`
  - `gh run view 30918215661 --job 92021690769 --log-failed`
  - `gh run list --workflow "CI (integration trunk)" --branch dev --limit 5 --json databaseId,headSha,status,conclusion,createdAt,updatedAt,displayTitle,event`
  - `git show --stat --summary e3ecc0a0ee6db9258358c25cf096ad032b054aea`
  - `sed -n '1,260p' tests/e2e/lib/helpers.sh`
  - `git show e3ecc0a0ee6db9258358c25cf096ad032b054aea^:tests/e2e/lib/helpers.sh | sed -n '1,260p'`

## Verification Limits

- `pnpm exec vitest ...` could not be rerun inside `/tmp/iam-mfa-001-clean-route`
  because that temporary worktree did not have an immediately resolvable
  `vitest` binary (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`)
- this task therefore relies on:
  - original commit verification trailers already recorded on the replayed
    commits
  - fresh local trailer validation
  - live GitHub `Commit trailers` success on `#1303`
