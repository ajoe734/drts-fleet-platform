# P2-WP0 Unblock History Repair

## Scope

- Task: `P2-WP0-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-WP0`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-25T21:50:11Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-wp0-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-wp0-unblock-history-repair`

## Diagnosis

`P2-WP0` is blocked by branch/commit routing drift, not by missing Phase2 code.

1. The originally reviewed owner rail is `origin/claude/p2-wp0 @ 7ca2b66c749a320c5d16ba411effdce6aa1d72d4`.
   It is exactly one commit ahead of `origin/dev`, but its single commit uses
   subject `feat(P2-WP0): ...`, so PR `#873` fails the required `Commit trailers`
   check even though every other check is green.
2. `scripts/git/check_commit_trailers.py` validates every commit in the PR range,
   not only the tip commit. Adding another good commit on top of
   `claude/p2-wp0` would still leave `7ca2b66c7` failing the gate.
3. A clean non-destructive replay branch already exists:
   `origin/claude2/p2-wp0 @ fe1fd7f6b898c296f4de0299059b3605e63b0c8d`. It is also
   exactly one commit ahead of `origin/dev`, its subject is the compliant
   `P2-WP0: ...`, and its tree is byte-identical to `7ca2b66c7`.
4. No PR exists for `origin/claude2/p2-wp0`, so the clean replay rail is not yet
   wired into the normal `dev` merge path.
5. Parent machine truth still points at the blocked `claude/p2-wp0` / PR `#873`
   path and does not mention the already-pushed clean replay rail. That leaves
   the parent blocked by stale branch/PR targeting rather than by implementation
   work.
6. Local `codex/p2-wp0 @ fe1fd7f6b898c296f4de0299059b3605e63b0c8d` is an unpublished
   alias of the clean replay commit. It is additional branch-name noise, but it
   does not need cleanup to unblock the parent.

## Evidence

### Branch and PR state

- `origin/dev @ 622e1e89b4a185c5b1b8a7020cfcb0b410139ab0`
- `origin/claude/p2-wp0 @ 7ca2b66c749a320c5d16ba411effdce6aa1d72d4`
- `origin/claude2/p2-wp0 @ fe1fd7f6b898c296f4de0299059b3605e63b0c8d`
- local `codex/p2-wp0 @ fe1fd7f6b898c296f4de0299059b3605e63b0c8d`
  with `git branch -vv` showing `[origin/dev: ahead 1]` and no matching remote
  ref
- helper branch `codex/p2-wp0-unblock-history-repair @ 622e1e89b4a185c5b1b8a7020cfcb0b410139ab0`
- `git rev-list --left-right --count origin/dev...origin/claude/p2-wp0`
  returns `0 1`
- `git rev-list --left-right --count origin/dev...origin/claude2/p2-wp0`
  returns `0 1`
- `git merge-base origin/dev origin/claude/p2-wp0`
  and `git merge-base origin/dev origin/claude2/p2-wp0`
  both return `622e1e89b4a185c5b1b8a7020cfcb0b410139ab0`
- `git rev-parse 7ca2b66c7^{tree} fe1fd7f6b^{tree}` returns the same tree id:
  `6ce6a5ebab8b40cd9ecc9373e5fa12bb81875236`
- `git diff --stat 7ca2b66c7 fe1fd7f6b` is empty
- `git diff --check origin/dev...origin/claude/p2-wp0`
  and `git diff --check origin/dev...origin/claude2/p2-wp0` are clean
- `gh pr view 873` shows the only open parent PR is:
  - PR `#873`
  - head `claude/p2-wp0`
  - base `dev`
  - title `P2-WP0: Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds`
  - merge state `BLOCKED`
- `gh pr list --head claude2/p2-wp0 ...` returns `[]`

### Gate evidence

- `gh pr checks 873` reports:
  - `Commit trailers` = `fail`
  - `BFF-only imports` = `pass`
  - `Runtime mirror guard` = `pass`
  - `Smoke acceptance` = `pass`
  - `ci-integ` = `pass`
  - `build` = `pass`
  - `typecheck` = `pass`
  - `unit` = `pass`
  - `integration` = `pass`
  - `e2e` = `pass`
- `git show -s --format=fuller 7ca2b66c7` confirms the failing subject is:
  `feat(P2-WP0): Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds`
- `git show -s --format=fuller fe1fd7f6b` confirms the replay subject is:
  `P2-WP0: Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds`
- `scripts/git/check_commit_trailers.py` uses:
  `git rev-list <base>..<head>` and validates every commit subject against
  `^(?:wip\\()?[A-Z][A-Z0-9-]*[A-Z0-9]\\)?: \\S`

### Worktree state

- `git worktree list --porcelain` shows only the assigned helper worktree for
  this task under the current repo clone.
- There is no active local worktree attached to `claude/p2-wp0` or
  `claude2/p2-wp0` in this clone, so the remaining contamination is ref/PR
  routing drift, not stray uncommitted parent worktree state.

### Parent machine-truth state

- `AI_NAME=Codex scripts/ai-status.sh show P2-WP0` shows:
  - status `blocked`
  - owner `Claude`
  - reviewer `Codex`
  - `next` still anchored to blocked commit `7ca2b66c7` / PR `#873`
  - no mention of pushed clean replay branch `origin/claude2/p2-wp0`

## Exact Contamination

The exact contamination is a three-part branch-history mismatch:

1. `origin/claude/p2-wp0` is the only parent branch currently referenced by
   machine truth and PR `#873`, but its single commit `7ca2b66c7` has a
   non-compliant subject that can never pass `Commit trailers` without history
   rewrite.
2. `origin/claude2/p2-wp0` already contains the same accepted tree under a
   compliant subject, but it has no PR and is invisible to the parent task's
   current `next` message.
3. local `codex/p2-wp0` points at the same clean replay commit without a remote
   branch, which reinforces the branch-name ambiguity but is not itself the
   blocker.

The parent is therefore blocked by stale routing to the wrong branch/PR, not by
missing code and not by an unverified replay.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Freeze `origin/claude/p2-wp0 @ 7ca2b66c7` and PR `#873` as audit evidence of
   the bad closeout subject.
2. Treat `origin/claude2/p2-wp0 @ fe1fd7f6b` as the canonical parent replay
   branch. It already contains the accepted tree under a compliant subject, so
   no new code changes are required.
3. Open a fresh PR from the clean replay branch to `dev` instead of trying to
   repair PR `#873` in place:

```bash
gh pr create \
  --base dev \
  --head claude2/p2-wp0 \
  --title "P2-WP0: Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds" \
  --body "Supersedes blocked PR #873 from claude/p2-wp0. Replay uses identical tree content under commit fe1fd7f6b with a compliant P2-WP0 subject and no force-push."
```

4. Parent owner `Claude` should replay the review handoff on the already-pushed
   clean branch:

```bash
AI_NAME=Claude scripts/ai-status.sh handoff P2-WP0 Codex \
  "Replay review on pushed clean branch origin/claude2/p2-wp0 @ fe1fd7f6b898c296f4de0299059b3605e63b0c8d. This branch is tree-identical to blocked origin/claude/p2-wp0 @ 7ca2b66c7 but uses a compliant P2-WP0 subject; supersede PR #873 with a new PR from claude2/p2-wp0 -> dev."
```

5. Parent reviewer `Codex` then reviews the same pushed commit on the clean PR
   instead of the blocked one. If no new issues are found, the parent can return
   to the normal `review -> review_approved -> done` flow on that replay rail.
6. Leave local `codex/p2-wp0` untouched unless someone explicitly wants to
   delete stale local aliases later. It is not part of the unblock path.

## Concrete Parent Next Step

`P2-WP0` should stop targeting `origin/claude/p2-wp0` / PR `#873` and resume on
`origin/claude2/p2-wp0 @ fe1fd7f6b898c296f4de0299059b3605e63b0c8d`.

Concrete next step:

1. Open a new PR from `claude2/p2-wp0` to `dev`.
2. Owner `Claude` reruns `scripts/ai-status.sh handoff P2-WP0 Codex ...`
   pointing at `fe1fd7f6b`.
3. Reviewer `Codex` reviews the clean replay PR.
4. Close out the parent through normal non-force merge/reconcile once the clean
   PR lands.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The blocked branch and PR stay available for audit.
- The clean replay branch is already pushed and tree-identical to the approved
  content.
- The repair path uses normal branch + PR flow on top of the current `dev` base.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-WP0-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-WP0`
- Inspected relevant refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -a -vv | grep 'p2-wp0'`
  - `git ls-remote --heads origin 'refs/heads/*p2-wp0*'`
  - `git worktree list --porcelain`
  - `git log --graph --oneline --decorate --max-count=12 origin/claude/p2-wp0 origin/claude2/p2-wp0 origin/dev`
  - `git rev-list --left-right --count origin/dev...origin/claude/p2-wp0`
  - `git rev-list --left-right --count origin/dev...origin/claude2/p2-wp0`
  - `git merge-base origin/dev origin/claude/p2-wp0`
  - `git merge-base origin/dev origin/claude2/p2-wp0`
  - `git rev-parse 7ca2b66c7^{tree} fe1fd7f6b^{tree}`
  - `git diff --stat 7ca2b66c7 fe1fd7f6b`
  - `git diff --name-only origin/dev...origin/claude/p2-wp0`
  - `git diff --check origin/dev...origin/claude/p2-wp0`
  - `git diff --check origin/dev...origin/claude2/p2-wp0`
- Inspected commit and CI evidence:
  - `git show -s --format=fuller 7ca2b66c7`
  - `git show -s --format=fuller fe1fd7f6b`
  - `sed -n '1,260p' scripts/git/check_commit_trailers.py`
  - `gh pr view 873 --json number,title,headRefName,baseRefName,state,mergeStateStatus,statusCheckRollup,url`
  - `gh pr checks 873`
  - `gh pr list --head claude2/p2-wp0 --json number,title,headRefName,baseRefName,state,url`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
