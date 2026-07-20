# P5S3-FOUND-001 History Repair

- Task: `P5S3-FOUND-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P5S3-FOUND-001`
- Owner: `Codex`
- Reviewer: `Gemini`
- Date: `2026-07-20`
- Status: `local ref contamination repaired without force-pushing shared history`

## Diagnosis

The parent branch content is valid on the remote owner branch and PR #1108 is
open against `dev`. The blocker came from contaminated local refs inside the
shared repo, not from broken shared remote history.

Before repair, three different histories existed for the same task:

1. canonical remote `origin/dev` at `781258283c75904d94817ff8ee1dc659683a44aa`
2. remote owner / PR head at `origin/feat/phase1-p5-s3-foundations-anchors-20260720`
   and `origin/gemini/p5s3-found-001`, both at
   `81bdf59356c94a69dadeb85760e5012aa4195b8e`
3. contaminated local refs:
   - local `dev` also at `81bdf59356c94a69dadeb85760e5012aa4195b8e`, even
     though `origin/dev` had not merged the PR
   - local `feat/phase1-p5-s3-foundations-anchors-20260720` at
     `2d7c85e2f08c07aa62ea98ec549e1731964afb42`, which diverged from the real
     remote PR branch

That split made the parent appear simultaneously "already on dev" and "still on
an outdated feature branch", depending on which local ref a worker inspected.

## Exact contamination

### 1. Local `dev` was fast-forwarded to the unmerged task branch

Evidence from `git reflog show dev`:

- `2026-07-20 07:41:08 +0000`: `dev` reset to `origin/dev`
- `2026-07-20 07:41:09 +0000`: `dev` fast-forwarded from `gemini/p5s3-found-001`

This moved local `dev` to `81bdf59356c94a69dadeb85760e5012aa4195b8e` while
`origin/dev` still remained at `781258283c75904d94817ff8ee1dc659683a44aa`.

Result: a worker using local `dev` as truth could incorrectly conclude that the
task had already landed on `dev`, even though PR #1108 was still open.

### 2. Local `feat/...` kept a stale pre-amend commit identity

Before repair:

- local `feat/phase1-p5-s3-foundations-anchors-20260720`:
  `2d7c85e2f08c07aa62ea98ec549e1731964afb42`
- remote `origin/feat/phase1-p5-s3-foundations-anchors-20260720`:
  `81bdf59356c94a69dadeb85760e5012aa4195b8e`

The stale local feature ref was `ahead 1, behind 2` relative to its remote.
Its reflog shows it was created from `origin/dev` and committed before the
owner branch was amended and extended:

- `2026-07-20 06:47:34 +0000`: branch created from `origin/dev`
- `2026-07-20 06:52:32 +0000`: commit `2d7c85e2f08c07aa62ea98ec549e1731964afb42`

The stale commit and the amended owner commit have the same tree:

- `2d7c85e2f08c07aa62ea98ec549e1731964afb42^{tree}` =
  `b40c63153ea3526c8885530b59ae175fc2f726ec`
- `d108cae0be36f2754604f8f21a549373d4b65cff^{tree}` =
  `b40c63153ea3526c8885530b59ae175fc2f726ec`

So the contamination was not missing content. It was stale local commit
identity plus branch drift after amend / closeout commits landed on the owner
branch.

### 3. Shared remote history is healthy

Remote refs are consistent:

- `origin/dev` = `781258283c75904d94817ff8ee1dc659683a44aa`
- `origin/feat/phase1-p5-s3-foundations-anchors-20260720` =
  `81bdf59356c94a69dadeb85760e5012aa4195b8e`
- `origin/gemini/p5s3-found-001` =
  `81bdf59356c94a69dadeb85760e5012aa4195b8e`

As checked on `2026-07-20`, PR #1108 targets `dev`, reports
`mergeable=MERGEABLE`, reports `mergeStateStatus=UNSTABLE`, and has only the
`e2e` check still in progress. Its head commit matches the remote owner branch.
No force-push is required.

## Repair performed

No shared remote branch was rewritten.

Because no worktree was checked out on local `dev` or the local `feat/...`
branch, the contaminated local refs were repaired in place:

1. `git branch -f dev origin/dev`
2. `git update-ref refs/heads/feat/phase1-p5-s3-foundations-anchors-20260720 refs/remotes/origin/feat/phase1-p5-s3-foundations-anchors-20260720`

After repair:

- local `dev` = `origin/dev` = `781258283c75904d94817ff8ee1dc659683a44aa`
- local `feat/phase1-p5-s3-foundations-anchors-20260720` =
  `origin/feat/phase1-p5-s3-foundations-anchors-20260720` =
  `81bdf59356c94a69dadeb85760e5012aa4195b8e`

This restores a single correct local view:

- `dev` means merged trunk
- `feat/...` means the still-open PR head
- `gemini/p5s3-found-001` remains the owner branch carrying the same reviewed
  task content as the PR head

## Non-force repair path

If this contamination reappears elsewhere, repair it with the same additive
sequence:

1. Verify the remote canonical refs first:
   - `origin/dev`
   - the owner branch
   - the PR head branch
2. If the remote refs are healthy, do not rewrite them.
3. Reset only the contaminated local refs to their remote counterparts.
4. Treat merge completion as true only when `origin/dev` contains the task
   commit, not when a local `dev` ref happens to contain it.

## Parent next step after this repair

The parent is no longer blocked by branch/history ambiguity.

Concrete next step:

1. Let PR `#1108` finish its remaining `e2e` CI requirement on the existing
   remote branch.
2. Merge PR `#1108` normally into `dev` once GitHub marks it green.
3. After `origin/dev` advances to include
   `81bdf59356c94a69dadeb85760e5012aa4195b8e`, the owner can finalize
   `P5S3-FOUND-001` with the already prepared closeout evidence:
   - `COMMIT_HASH=81bdf59356c94a69dadeb85760e5012aa4195b8e`
   - `COMMIT_SUBJECT='P5S3-FOUND-001: record owner closeout verification evidence'`
   - `PUSH_REMOTE=origin`
   - `PUSH_BRANCH=gemini/p5s3-found-001`
   - `PR_NUMBER=1108`

No content rewrite is needed on the task branch.

## Evidence checked

- `git ls-remote --heads origin dev feat/phase1-p5-s3-foundations-anchors-20260720`
- `gh pr view 1108 --json headRefOid,baseRefOid,mergeable,mergeStateStatus,statusCheckRollup`
- `git reflog show dev`
- `git reflog show feat/phase1-p5-s3-foundations-anchors-20260720`
- `git reflog show gemini/p5s3-found-001`
- `git rev-parse <sha>^{tree}` for `2d7c85e2f08c07aa62ea98ec549e1731964afb42`
  and `d108cae0be36f2754604f8f21a549373d4b65cff`
