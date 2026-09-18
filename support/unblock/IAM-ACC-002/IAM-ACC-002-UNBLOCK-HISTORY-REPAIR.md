# IAM-ACC-002 Unblock History Repair

## Scope

- Task: `IAM-ACC-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-ACC-002`
- Owner: `Codex`
- Reviewer: `Gemini`
- Audit timestamp: `2026-08-03T09:00:00Z`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-acc-002-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-acc-002-unblock-history-repair`

## Diagnosis

`IAM-ACC-002` is no longer blocked by missing code or failing CI. As of
`2026-08-03`, the real blocker is branch-history ambiguity created during
closeout: the same accepted task tree now exists on two Codex rails, while the
parent task's machine-truth note still describes both as live integration
options.

1. The canonical owner rail is `origin/codex/iam-acc-002 @ 4d31deffca9e0d0ab5e18e68dbdc240c80aa72f0`
   with open PR `#1282`
   (`https://github.com/ajoe734/drts-fleet-platform/pull/1282`) targeting
   `dev`.
2. A second Codex rail also exists:
   `origin/codex/iam-acc-002-linear @ fbed41387274e1dccf2c6b84d62604bccf05dd7e`.
   It has no PR and was created later by cherry-picking the task diff onto a
   fresh branch from `origin/dev`.
3. `git diff --stat codex/iam-acc-002 codex/iam-acc-002-linear` is empty, so
   both rails currently point at the same repository tree even though their
   commit graphs differ.
4. `git range-diff origin/dev..codex/iam-acc-002-linear
   origin/dev..codex/iam-acc-002` shows the exact history mismatch:
   - both rails carry the same durable platform-admin anchor work
   - both rails carry the same `platform-admin-web` auth-resolution fix
   - only `codex/iam-acc-002` carries the empty closeout commit
     `45abc7b2 IAM-ACC-002: finalize approved durable platform admin persistence`
5. `git diff-tree --no-commit-id --stat -r 45abc7b2` prints nothing, proving
   that `45abc7b2` changes history only, not content.
6. `codex/iam-acc-002` then advanced again with merge commit
   `4d31deff IAM-ACC-002: merge origin/dev for integration closeout`, whose
   parents are:
   - `45e0d13c IAM-ACC-002: fix platform admin web control-plane auth resolution`
   - `74aa50ad origin/dev`
7. The reflogs capture the contamination path exactly:
   - `codex/iam-acc-002` was created from `origin/dev` on `2026-08-02`,
     gained the anchor commit, the empty closeout commit, the follow-up web
     fix, then merged `origin/dev`
   - `codex/iam-acc-002-linear` was created from `origin/dev` on
     `2026-08-03 07:40:20 +0000`, then cherry-picked only the non-merge task
     commits
8. Local-only stale aliases still exist for the same task stem:
   - `gemini/iam-acc-002 @ 45e0d13c` in active worktree
     `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-002`
   - `codex2/iam-acc-002 @ c1e07046`
   - `codex/iam-acc-002-emptytree-backup @ 52fc08b3`
   None of those refs have a pushed remote head, but they add branch-name
   ambiguity when workers resume by task stem rather than by verified PR.
9. The parent task was blocked at `2026-08-03T07:42:45Z` with a `next` message
   that treated both `origin/codex/iam-acc-002` and
   `origin/codex/iam-acc-002-linear` as active candidates. That is the exact
   machine-truth contamination this helper task repairs.

## Evidence

### Canonical integration rail

- remote branch:
  `origin/codex/iam-acc-002 @ 4d31deffca9e0d0ab5e18e68dbdc240c80aa72f0`
- open PR:
  - `#1282`
  - head `codex/iam-acc-002`
  - head SHA `4d31deffca9e0d0ab5e18e68dbdc240c80aa72f0`
  - base `dev`
  - state `OPEN`
  - merge state `CLEAN`
- `gh pr view 1282 --json ...` on `2026-08-03` reports all current checks
  green, including `Commit trailers`, `Runtime mirror guard`,
  `Smoke acceptance`, `lint`, `typecheck`, `unit`, `integration`, `build`,
  `e2e`, and `ci-integ`

### Duplicate replay rail

- remote branch:
  `origin/codex/iam-acc-002-linear @ fbed41387274e1dccf2c6b84d62604bccf05dd7e`
- `gh pr list --head codex/iam-acc-002-linear --state all` returns `[]`
- reflog shows this branch was created by cherry-pick replay, not by review:
  - `2026-08-03 07:40:20 +0000`: branch created from `origin/dev`
  - `2026-08-03 07:40:27 +0000`: cherry-pick
    `wip(IAM-ACC-002): anchor durable platform admin persistence`
  - `2026-08-03 07:40:32 +0000`: cherry-pick
    `IAM-ACC-002: fix platform admin web control-plane auth resolution`

### Exact history delta

- `git diff --stat codex/iam-acc-002 codex/iam-acc-002-linear` is empty
- `git range-diff origin/dev..codex/iam-acc-002-linear
  origin/dev..codex/iam-acc-002` reports:
  - the anchor commit is the same work under different SHAs
  - `codex/iam-acc-002` adds the empty closeout commit `45abc7b2`
  - both rails carry the same follow-up web build fix
- `git diff-tree --no-commit-id --stat -r 45abc7b2` is empty

### Stale local aliases

- `gemini/iam-acc-002 @ 45e0d13c` still has an attached worktree
- `codex2/iam-acc-002 @ c1e07046` still exists locally
- `codex/iam-acc-002-emptytree-backup @ 52fc08b3` still exists locally
- `git ls-remote --heads origin` shows no remote heads for those aliases

### Parent machine-truth drift

- `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-002` before this repair
  reported:
  - status `blocked`
  - owner `Codex`
  - reviewer `Gemini`
  - `next`: task branch pushed, `linear` replay branch ready for PR, direct
    push to `dev` rejected
- `rg -n 'IAM-ACC-002' "$AI_STATUS_ROOT/ai-activity-log.jsonl" | tail -n 40`
  shows the exact blocker event at `2026-08-03T07:42:45Z`

## Exact Contamination

The contamination is not code drift. It is rail identity drift:

1. `codex/iam-acc-002` is already a valid pushed review rail with PR `#1282`.
2. `codex/iam-acc-002-linear` replays the same tree on a second pushed branch
   but has no PR.
3. The parent blocker message names both rails as current candidates, so the
   next worker cannot tell whether to continue from the active PR rail or from
   the replay rail.
4. Additional local aliases (`gemini/...`, `codex2/...`, `emptytree-backup`)
   further increase the chance that a future resume picks the wrong ref by name
   alone.

That ambiguity is what kept the parent blocked on "history repair" even after
the implementation and CI issues were already resolved.

## Non-Destructive Repair Path

Do not force-push any existing branch. Do not replace PR `#1282` with a new
PR from `codex/iam-acc-002-linear`.

1. Treat `origin/codex/iam-acc-002 @ 4d31deff...` and PR `#1282` as the only
   canonical owner rail for integration, merge, and final task closeout.
2. Treat `origin/codex/iam-acc-002-linear @ fbed4138...` as audit evidence
   only. It explains the replay attempt, but it is not the canonical PR rail.
3. Treat local-only refs `gemini/iam-acc-002`, `codex2/iam-acc-002`, and
   `codex/iam-acc-002-emptytree-backup` as stale aliases only. Do not resume
   work from them.
4. Preserve every existing branch as historical evidence. This repair is
   documentary and machine-truth cleanup only.
5. Update parent machine truth so its `next` field points to one path only:
   merge PR `#1282` into `dev`, then record parent `done` from the merged
   branch evidence.

## Concrete Parent Next Step

As of `2026-08-03`, `IAM-ACC-002` should no longer describe the replay branch
as "ready for PR". Its next step is:

1. Continue only from PR `#1282`
   (`codex/iam-acc-002 @ 4d31deffca9e0d0ab5e18e68dbdc240c80aa72f0`).
2. Ignore `codex/iam-acc-002-linear` for review and merge purposes.
3. Wait for PR `#1282` to merge into `dev` through the normal protected-branch
   path.
4. After merge, have `Codex` record parent closeout with merged-rail evidence
   and `INTEGRATION_STATUS=merged_to_dev`.

## Why This Is Safe

- No shared history is rewritten.
- No force-push is required.
- The active PR rail stays unchanged.
- The replay branch remains available for audit.
- The stale local aliases remain preserved but explicitly demoted.
- The parent gets one canonical next step instead of two competing branch
  names.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` with focus on §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task slices:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-002`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-002-UNBLOCK-HISTORY-REPAIR`
- Inspected canonical activity log slice:
  - `rg -n 'IAM-ACC-002' "$AI_STATUS_ROOT/ai-activity-log.jsonl" | tail -n 40`
- Inspected branch, reflog, worktree, and remote-ref state:
  - `git fetch origin --prune`
  - `git branch -vv | rg 'iam-acc-002|iam-idp-002|iam-ses-002|iam-aud-001'`
  - `git show-ref --heads | rg 'iam-acc-002($|-linear|-emptytree-backup|-unblock-history-repair)'`
  - `git worktree list --porcelain`
  - `git log --graph --oneline --decorate --max-count=30 origin/dev codex/iam-acc-002 codex/iam-acc-002-linear codex2/iam-acc-002 gemini/iam-acc-002 --`
  - `git log --oneline --decorate --graph --max-count=20 origin/dev..codex/iam-acc-002`
  - `git log --oneline --decorate --graph --max-count=20 origin/dev..codex/iam-acc-002-linear`
  - `git reflog show --date=iso codex/iam-acc-002`
  - `git reflog show --date=iso codex/iam-acc-002-linear`
  - `git show --no-patch --pretty=raw 4d31deffca9e0d0ab5e18e68dbdc240c80aa72f0`
  - `git diff --stat codex/iam-acc-002 codex/iam-acc-002-linear`
  - `git range-diff origin/dev..codex/iam-acc-002-linear origin/dev..codex/iam-acc-002`
  - `git diff-tree --no-commit-id --stat -r 45abc7b295d7d58f9a1e67a7ed8576b2bd0efcfe`
  - `git ls-remote --heads origin 'refs/heads/codex/iam-acc-002' 'refs/heads/codex/iam-acc-002-linear'`
- Inspected GitHub PR state:
  - `gh pr view 1282 --json number,state,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup,commits`
  - `gh pr list --head codex/iam-acc-002-linear --state all --json number,title,headRefName,baseRefName,state,url`

No application code changed in this helper task. This repair is limited to
history evidence, branch selection, and parent machine-truth cleanup.
