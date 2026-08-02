# IAM-SES-002 Unblock History Repair

## Scope

- Task: `IAM-SES-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-SES-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-08-02T03:49:25+00:00`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-ses-002-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-ses-002-unblock-history-repair`

## Diagnosis

`IAM-SES-002` is blocked by branch / PR evidence contamination, not by a missing
implementation diff. The canonical implementation tree already exists on the
clean owner rail, but the original owner rail carries a second head SHA and a
closed duplicate PR that can mislead any future resume or closeout.

1. The canonical open delivery rail is `codex/iam-ses-002-clean @ e8b71e29`
   with PR `#1255` (`https://github.com/ajoe734/drts-fleet-platform/pull/1255`)
   targeting `dev`.
2. The original owner rail `codex/iam-ses-002 @ b45fe245` also has a PR, but
   that PR is the closed duplicate `#1256`
   (`https://github.com/ajoe734/drts-fleet-platform/pull/1256`).
3. `git diff --quiet codex/iam-ses-002-clean codex/iam-ses-002` exits `0`, so
   both branch tips have the same tree contents.
4. `git range-diff d0d4cbd9..codex/iam-ses-002-clean
   d0d4cbd9..codex/iam-ses-002` shows that the only meaningful history delta is:
   - the first implementation commit was replayed onto the clean branch with a
     different subject line (`IAM-SES-002: ...` vs `feat(IAM-SES-002): ...`)
   - the second implementation commit is the same work
   - the original branch adds one extra closeout commit
     `b45fe245 chore(IAM-SES-002): finalize approved session-claim hardening`
5. `git diff-tree --no-commit-id --stat -r b45fe245` prints nothing, proving
   that `b45fe245` is an empty verification-only closeout commit. It changes
   history and PR state, but not repository content.
6. The branch reflogs show the contamination path exactly:
   - `codex/iam-ses-002` was created from `origin/dev` at
     `2026-08-02 02:31:58 +0000`, then accumulated the feature commit, the WIP
     hardening commit, and the empty closeout commit.
   - `codex/iam-ses-002-clean` was created fresh from `origin/dev` at
     `2026-08-02 03:34:46 +0000`, then received a replayed first implementation
     commit plus a cherry-picked WIP hardening commit at `2026-08-02 03:34:55
     +0000`.
7. `git worktree list --porcelain` shows an active review worktree for
   `codex/iam-ses-002-clean`, but no active worktree for
   `codex/iam-ses-002`. That makes the closed duplicate rail even easier to
   misuse by name alone.

## Evidence

### Canonical open rail

- local / remote branch:
  `codex/iam-ses-002-clean @ e8b71e29e1f39c3403c14e1face2e948391065ce`
- `git ls-remote --heads origin 'refs/heads/codex/iam-ses-002-clean'`
  confirms the remote head exists at the same SHA
- `gh pr view 1255 --json number,state,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`
  reports:
  - PR `#1255`
  - state `OPEN`
  - head `codex/iam-ses-002-clean`
  - head SHA `e8b71e29e1f39c3403c14e1face2e948391065ce`
  - base `dev`
  - merge state `BLOCKED`
  - `Commit trailers` succeeded
  - `lint`, `unit`, and `Smoke acceptance` failed on the current head

### Contaminated duplicate rail

- local / remote branch:
  `codex/iam-ses-002 @ b45fe245dd9c4a9c73e037dbf7a899781cdcf238`
- `git ls-remote --heads origin 'refs/heads/codex/iam-ses-002'`
  confirms the remote head exists at the same SHA
- `gh pr view 1256 --json number,state,closedAt,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`
  reports:
  - PR `#1256`
  - state `CLOSED`
  - closed at `2026-08-02T03:38:36Z`
  - head `codex/iam-ses-002`
  - head SHA `b45fe245dd9c4a9c73e037dbf7a899781cdcf238`
  - base `dev`
  - merge state `BLOCKED`
  - `Commit trailers` failed on the duplicate head

### Exact history delta

- `git diff --quiet codex/iam-ses-002-clean codex/iam-ses-002` exits `0`
- `git range-diff d0d4cbd9..codex/iam-ses-002-clean
  d0d4cbd9..codex/iam-ses-002` reports:
  - `4fd7819f ! af48218d` with the same body but different subject line
  - `e8b71e29 = be229b0d`
  - an extra `b45fe245` closeout commit on the original branch
- `git diff-tree --no-commit-id --stat -r b45fe245` is empty

### Worktree / reflog state

- `git reflog show --date=iso codex/iam-ses-002` records:
  - `branch: Created from origin/dev`
  - `af48218d feat(IAM-SES-002): enforce revocable JWT session claims`
  - `be229b0d wip(IAM-SES-002): harden durable session claims`
  - `b45fe245 chore(IAM-SES-002): finalize approved session-claim hardening`
- `git reflog show --date=iso codex/iam-ses-002-clean` records:
  - `branch: Created from origin/dev`
  - `4fd7819f IAM-SES-002: enforce revocable JWT session claims`
  - `e8b71e29 cherry-pick: wip(IAM-SES-002): harden durable session claims`
- `git worktree list --porcelain` shows:
  - review worktree
    `/home/lupin/drts-fleet-platform/.artifacts/worktrees/review/codex-iam-ses-002-clean`
    attached to `codex/iam-ses-002-clean`
  - helper worktree
    `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-ses-002-unblock-history-repair`
    attached to `codex/iam-ses-002-unblock-history-repair`
  - no active worktree attached to `codex/iam-ses-002`

### Parent dependency status

- `gh pr view 1254 --json number,state,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`
  reports:
  - PR `#1254`
  - state `OPEN`
  - head `codex2/iam-p0-006-clean`
  - head SHA `f96c7d9dd69aa64aaf80b04ac540e0590b7c6427`
  - base `dev`
  - merge state `BLOCKED`
  - the dependency has not landed yet, so the parent task is still waiting on
    that rail before rebasing `codex/iam-ses-002-clean`

## Exact Contamination

The exact contamination is a dual-rail / dual-PR identity split for the same
implementation tree:

1. The same code tree exists on two owner branches with different head SHAs.
2. Only one of those rails is the intended canonical review path:
   `codex/iam-ses-002-clean` / PR `#1255`.
3. The original rail `codex/iam-ses-002` adds an empty closeout commit, which
   creates a different branch tip and a second PR `#1256` even though the tree
   content is unchanged.
4. That second PR is already closed, so any future worker who resumes from
   `codex/iam-ses-002` will inherit a non-canonical head SHA and a dead review
   rail.

This is why the parent stayed blocked on "history repair": the task needed a
documented answer for which branch / PR / SHA is safe to trust without
rewriting shared history.

## Non-Destructive Repair Path

Do not force-push either owner branch. Do not reopen or reuse PR `#1256`.

1. Treat `codex/iam-ses-002-clean @ e8b71e29...` and PR `#1255` as the only
   canonical owner rail for `IAM-SES-002`.
2. Treat `codex/iam-ses-002 @ b45fe245...` and PR `#1256` as audit evidence
   only. They explain how the duplicate rail happened, but they are not a safe
   place to continue review or closeout.
3. Leave the closed duplicate branch untouched. The repair is documentary and
   procedural, not a history rewrite.
4. Once dependency PR `#1254` lands on `dev`, continue from
   `codex/iam-ses-002-clean` only:

```bash
git fetch origin
git switch codex/iam-ses-002-clean
git rebase origin/dev
```

5. Rerun the parent CI on the rebased clean head, then have `Codex2` re-review
   that rebased SHA. Only after that review should the parent task attempt
   closeout again.

## Concrete Parent Next Step

As of `2026-08-02`, `IAM-SES-002` should stay blocked on dependency
`IAM-P0-006` / PR `#1254`, but its next step is now unambiguous:

1. Wait for PR `#1254` (`codex2/iam-p0-006-clean @ f96c7d9d...`) to land on
   `dev`.
2. Resume from `codex/iam-ses-002-clean @ e8b71e29...`, not from
   `codex/iam-ses-002 @ b45fe245...`.
3. Rebase `codex/iam-ses-002-clean` onto the new `origin/dev`, rerun CI, and
   request `Codex2` review on the rebased clean SHA.
4. Ignore closed duplicate PR `#1256` for all future review, merge, and closeout
   evidence.

## Why This Is Safe

- No shared history is rewritten.
- No force-push is required.
- PR `#1255` stays valid as the active review rail.
- PR `#1256` remains preserved as historical evidence of the contamination.
- The parent task gets a concrete, current next step tied to verified GitHub
  state instead of to a stale or ambiguous local branch name.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `docs/ops/branch-strategy.md` with focus on §11
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-002`
- Inspected local branch / worktree state:
  - `git branch --show-current`
  - `git status --short`
  - `git fetch origin --prune`
  - `git branch -vv`
  - `git show-ref --heads | rg 'iam-ses-002($|-clean|-unblock-history-repair)'`
  - `git worktree list --porcelain`
  - `git rev-list --left-right --count dev...codex/iam-ses-002`
  - `git rev-list --left-right --count dev...codex/iam-ses-002-clean`
  - `git log --oneline --decorate --graph --max-count=30 dev..codex/iam-ses-002`
  - `git log --oneline --decorate --graph --max-count=30 dev..codex/iam-ses-002-clean`
  - `git reflog show --date=iso codex/iam-ses-002`
  - `git reflog show --date=iso codex/iam-ses-002-clean`
  - `git diff --quiet codex/iam-ses-002-clean codex/iam-ses-002`
  - `git range-diff d0d4cbd9..codex/iam-ses-002-clean d0d4cbd9..codex/iam-ses-002`
  - `git diff-tree --no-commit-id --stat -r b45fe245`
  - `git ls-remote --heads origin 'refs/heads/codex/iam-ses-002' 'refs/heads/codex/iam-ses-002-clean'`
- Inspected GitHub PR state:
  - `gh pr view 1254 --json number,state,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`
  - `gh pr view 1255 --json number,state,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`
  - `gh pr view 1256 --json number,state,closedAt,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,statusCheckRollup`

No application code or runtime tests were changed or rerun in this helper task.
This repair is limited to branch / PR history evidence and machine-truth
triage.
