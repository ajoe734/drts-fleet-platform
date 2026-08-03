# IAM-ACC-003 Unblock History Repair

## Scope

- Task: `IAM-ACC-003-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-ACC-003`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Audit timestamp: `2026-08-03T09:05:00+00:00`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-acc-003-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-acc-003-unblock-history-repair`

## Diagnosis

`IAM-ACC-003` is blocked by branch / worktree / commit-evidence contamination, not
by missing implementation work. The current open delivery PR is healthy, but the
machine-truth closeout evidence points at an older reviewed SHA that is no
longer on the active remote branch, and there is now a second nested PR built
on top of that already-shifted parent branch.

1. Machine truth still records the parent as approved on
   `origin/codex/iam-acc-003-secure @ 2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0`.
2. The owner branch reflog shows `codex/iam-acc-003-secure` was created on
   `2026-08-02 09:59:29 +0000` from `codex/iam-ses-002-refresh-atomic`, not
   from `origin/dev`.
3. On `2026-08-03 07:43:13 +0000`, the owner branch was rebased onto
   `563897762f4457621eb1d9706546c71751393976`, producing rewritten IAM-ACC-003
   SHAs `dc01e6d8`, `23cf9f19`, and `bd6f36a9`; the reviewed SHA `2a9a5c5` is
   not an ancestor of that rewritten rail.
4. The active GitHub delivery rail is still PR `#1279`
   (`https://github.com/ajoe734/drts-fleet-platform/pull/1279`) targeting
   `dev`, but GitHub now reports its head SHA as
   `516e72f31ede181755bee2cd9f5a3cd38a9f2210`, not `2a9a5c5`.
5. A second PR `#1283`
   (`https://github.com/ajoe734/drts-fleet-platform/pull/1283`) was opened from
   `codex/iam-acc-003-secure-fixed-work @ 17a9a75c` into the parent branch
   `codex/iam-acc-003-secure`. That PR is nested on top of the already-shifted
   parent rail and GitHub marks it `CONFLICTING`.
6. The helper / repair branches are three parallel heads for the same
   five-line bootstrap fix:
   `codex/iam-acc-003-secure-fixed-work @ 17a9a75c`,
   `codex/iam-acc-003-secure-rebuilt @ 6f37bdd6`, and
   `codex/iam-acc-003-secure-repair @ 516e72f3`.
7. `git diff --quiet e78333cd 516e72f3` exits `0`, proving the latest amend on
   `codex/iam-acc-003-secure-repair` changed metadata / commit identity, not
   repository content.

## Evidence

### Parent machine-truth mismatch

- `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-003` reports:
  - status `blocked`
  - branch `origin/codex/iam-acc-003-secure`
  - recorded commit / push commit `2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0`
  - next summary saying the current remote branch no longer contains `2a9a5c5`
- `git merge-base --is-ancestor 2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0 516e72f31ede181755bee2cd9f5a3cd38a9f2210`
  exits `1`, so the approved SHA is not on the current PR `#1279` head.
- `git merge-base --is-ancestor 2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0 17a9a75cdfa3be2e6f6e1a918e561ceed2ac4673`
  exits `0`, which shows the nested fix branch was created from the old approved
  rail before the parent branch moved again.

### Owner-rail contamination

- `git reflog show --date=iso codex/iam-acc-003-secure` records:
  - branch created from `codex/iam-ses-002-refresh-atomic`
  - commits `765ad0ec`, `5f974082`, `2a9a5c5`
  - merge commit `8d926e1b`
  - rebase finish onto `56389776`
  - cherry-pick `589c3e9d`
- `git rev-list --left-right --count origin/codex/iam-acc-003-secure...codex/iam-acc-003-secure`
  reports `6 15`, which matches the parent task note that the assigned local
  worktree diverged heavily from the active remote rail.
- `git range-diff origin/dev..codex/iam-acc-003-secure origin/dev..origin/codex/iam-acc-003-secure`
  shows the original IAM-SES-002 ancestry disappears and the three IAM-ACC-003
  commits are replayed as `dc01e6d8`, `23cf9f19`, and `bd6f36a9`, followed by
  the five-line bootstrap fix as `e78333cd`.

### Current GitHub rails

- `gh pr view 1279 --json number,state,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`
  reports:
  - PR `#1279`
  - state `OPEN`
  - head `codex/iam-acc-003-secure`
  - head SHA `516e72f31ede181755bee2cd9f5a3cd38a9f2210`
  - base `dev`
  - merge state `CLEAN`
  - all listed CI checks passed on `2026-08-03`
- `gh pr view 1283 --json number,state,headRefName,headRefOid,baseRefName,baseRefOid,url,mergeable`
  reports:
  - PR `#1283`
  - state `OPEN`
  - head `codex/iam-acc-003-secure-fixed-work`
  - head SHA `17a9a75cdfa3be2e6f6e1a918e561ceed2ac4673`
  - base `codex/iam-acc-003-secure`
  - base SHA `516e72f31ede181755bee2cd9f5a3cd38a9f2210`
  - mergeable `CONFLICTING`

### Parallel repair heads

- `git reflog show --date=iso codex/iam-acc-003-secure-fixed-work` records
  creation from `2a9a5c5` and commit `17a9a75c`.
- `git reflog show --date=iso codex/iam-acc-003-secure-rebuilt` records a reset
  to `origin/dev`, three cherry-picks recreating IAM-ACC-003 as `dc01e6d8`,
  `23cf9f19`, `bd6f36a9`, then a bootstrap fix commit `6f37bdd6`.
- `git reflog show --date=iso codex/iam-acc-003-secure-repair` records branch
  creation from `origin/codex/iam-acc-003-secure`, cherry-pick `e78333cd`, then
  amend `516e72f3`.
- `git diff --quiet 589c3e9d 17a9a75c`, `git diff --quiet 589c3e9d 516e72f3`,
  and `git diff --quiet 589c3e9d 6f37bdd6` all exit `1`, so these branches are
  not the same tree as the stale local parent branch.
- `git diff --quiet e78333cd 516e72f3` exits `0`, so the final amend changed
  commit identity only.

### Remote-tracking staleness

- `git ls-remote --heads origin refs/heads/codex/iam-acc-003-secure` reports
  remote SHA `516e72f31ede181755bee2cd9f5a3cd38a9f2210`.
- Local `refs/remotes/origin/codex/iam-acc-003-secure` still resolves to
  `e78333cd8654fe8b828b1e3d55b6f690b0f36c0d`.
- The remote-tracking reflog shows a forced update
  `56389776 -> bd6f36a9` at `2026-08-03 07:47:23 +0000`, then a fast-forward to
  `e78333cd` at `2026-08-03 07:57:05 +0000`; GitHub already sees the later
  amended head `516e72f3`. This makes local remote-tracking refs unsafe as the
  sole source of truth for closeout.

## Exact Contamination

The exact contamination is a four-part history split around the same parent
task:

1. The original owner branch started from another task rail
   (`codex/iam-ses-002-refresh-atomic`) instead of `origin/dev`.
2. The reviewed parent evidence in machine truth (`2a9a5c5`) was later replaced
   by rewritten commits (`dc01e6d8` / `23cf9f19` / `bd6f36a9`) plus a new fix
   commit, so the approved SHA is no longer on the active PR head.
3. A nested PR `#1283` was opened from the old approved rail into the rewritten
   parent branch, creating a second, conflicting review path for the same fix.
4. Local remote-tracking state is itself stale relative to GitHub, so simply
   trusting `origin/codex/iam-acc-003-secure` inside one clone can point to the
   wrong head SHA.

This is why the parent stayed blocked: there was no longer a single unambiguous
answer to "which branch / PR / SHA should the next reviewer trust?"

## Non-Destructive Repair Path

Do not force-push or rewrite any shared owner branch.

1. Treat PR `#1279` on `codex/iam-acc-003-secure` as the only canonical delivery
   rail for `IAM-ACC-003`.
2. Treat machine-truth commit `2a9a5c5`, nested PR `#1283`, and helper branches
   `codex/iam-acc-003-secure-fixed-work`,
   `codex/iam-acc-003-secure-rebuilt`, and
   `codex/iam-acc-003-secure-repair` as audit evidence only.
3. Do not continue review, closeout, or additional fixes from PR `#1283`. It is
   a nested recovery rail, not the canonical parent PR.
4. Resume the parent from the current PR `#1279` head SHA that GitHub reports,
   not from any stale local remote-tracking ref:

```bash
git fetch origin
git switch codex/iam-acc-003-secure
git reset --hard 516e72f31ede181755bee2cd9f5a3cd38a9f2210
```

5. Re-review the current PR `#1279` head as a new closeout candidate, because
   the previously approved SHA `2a9a5c5` is not the same history anymore.
6. After that re-review, update the parent machine truth with the current pushed
   branch / commit evidence and ignore PR `#1283` for all future closeout.

## Concrete Parent Next Step

As of `2026-08-03`, the parent task should resume from the current canonical
delivery rail:

1. Use PR `#1279` (`codex/iam-acc-003-secure @ 516e72f31ede181755bee2cd9f5a3cd38a9f2210`)
   as the sole branch of record.
2. Ask `Gemini2` to review the current PR `#1279` head SHA `516e72f3`, because
   the older approval on `2a9a5c5` no longer applies to the active pushed
   history.
3. Ignore nested PR `#1283` and all helper / rebuilt branches unless more audit
   evidence is needed.
4. Once `Gemini2` re-approves `516e72f3`, finalize `IAM-ACC-003` against that
   pushed commit and PR `#1279`, not against `2a9a5c5`.

## Why This Is Safe

- No shared history is rewritten.
- The already-open canonical PR `#1279` stays in place.
- The conflicting nested PR `#1283` remains preserved as contamination evidence.
- The parent gets a concrete resume target tied to current GitHub state rather
  than to stale branch-local refs.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `docs/ops/branch-strategy.md` with focus on §11
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-003-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-003`
- Inspected local branch / worktree state:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git branch -a --list '*iam-acc-003*'`
  - `git branch -vv | rg 'iam-acc-003'`
  - `git log --decorate --oneline --graph --all --grep='IAM-ACC-003' -n 80`
  - `git reflog show --date=iso codex/iam-acc-003-secure`
  - `git reflog show --date=iso refs/remotes/origin/codex/iam-acc-003-secure`
  - `git reflog show --date=iso codex/iam-acc-003-secure-fixed-work`
  - `git reflog show --date=iso codex/iam-acc-003-secure-rebuilt`
  - `git reflog show --date=iso codex/iam-acc-003-secure-repair`
  - `git rev-list --left-right --count origin/codex/iam-acc-003-secure...codex/iam-acc-003-secure`
  - `git rev-list --left-right --count origin/codex/iam-acc-003-secure...codex/iam-acc-003-secure-repair`
  - `git rev-list --left-right --count origin/codex/iam-acc-003-secure...codex/iam-acc-003-secure-fixed-work`
  - `git range-diff origin/dev..codex/iam-acc-003-secure origin/dev..origin/codex/iam-acc-003-secure`
  - `git range-diff origin/dev..codex/iam-acc-003-secure origin/dev..codex/iam-acc-003-secure-fixed-work`
  - `git diff --stat 2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0..origin/codex/iam-acc-003-secure`
  - `git diff --quiet e78333cd 516e72f3`
  - `git diff --quiet 589c3e9d 17a9a75c`
  - `git diff --quiet 589c3e9d 516e72f3`
  - `git diff --quiet 589c3e9d 6f37bdd6`
  - `git merge-base --is-ancestor 2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0 516e72f31ede181755bee2cd9f5a3cd38a9f2210`
  - `git merge-base --is-ancestor 2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0 17a9a75cdfa3be2e6f6e1a918e561ceed2ac4673`
  - `git ls-remote --heads origin refs/heads/codex/iam-acc-003-secure refs/heads/codex/iam-acc-003-secure-fixed-work`
- Inspected GitHub PR state:
  - `gh pr list --state all --search 'IAM-ACC-003 in:title' --json number,title,headRefName,baseRefName,state,url`
  - `gh pr view 1279 --json number,state,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup,commits`
  - `gh pr view 1283 --json number,state,title,headRefName,headRefOid,baseRefName,baseRefOid,url,mergeable,commits`

No application code or runtime tests were changed or rerun in this helper task.
This repair is limited to history evidence, resume-rail diagnosis, and machine
truth unblocking.
