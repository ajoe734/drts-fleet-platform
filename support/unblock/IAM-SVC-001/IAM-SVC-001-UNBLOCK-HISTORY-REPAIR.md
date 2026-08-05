# IAM-SVC-001 Unblock History Repair

## Scope

- Task: `IAM-SVC-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-SVC-001`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-08-05T11:53:00+00:00`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-svc-001-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-svc-001-unblock-history-repair`

## Diagnosis

`IAM-SVC-001` was blocked by branch / commit history contamination, not by a
missing implementation diff.

The accepted workload-identity tree already existed, but every previously known
delivery rail inherited at least one commit that cannot pass the required
`Commit trailers` gate, and the parent machine-truth `next` message mixed stale
and contradictory branch evidence.

1. The accepted implementation tree is `d59c8b0b8a87728cb365d3dfc95706815dcb096b`.
   It exists on three different local heads:
   - `codex/iam-svc-001 @ aa6d089c`
   - `origin/claude/iam-svc-001 @ 26f386ef`
   - `gemini2/iam-svc-001 @ 6db197b5`
2. `git diff --stat aa6d089c 26f386ef` is empty, and
   `git diff --stat 26f386ef 6db197b5` is empty. The contention is history and
   metadata, not repository content.
3. Both shared rails that could plausibly be resumed from `dev` still contain
   two range-level trailer blockers:
   - `08aff296 fix(IAM-SVC-001): unblock workload identity token exchange`
   - `bc411d7b Merge remote-tracking branch 'origin/dev' into codex/iam-svc-001`
4. `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-svc-001`
   fails on `08aff296` and `bc411d7b`.
5. `python3 scripts/git/check_commit_trailers.py --base origin/dev --head origin/claude/iam-svc-001`
   fails on `26f386ef`, `08aff296`, and `bc411d7b`.
6. No PR existed for any mergeable rail:
   - `gh pr list --head codex/iam-svc-001` returned `[]`
   - `gh pr list --head claude/iam-svc-001` returned `[]`
   - `gh pr list --head gemini2/iam-svc-001` returned `[]`
7. The parent task `IAM-SVC-001` was therefore blocked by a false choice:
   one branch (`codex/iam-svc-001`) had the owner closeout commit but an
   unmergeable history range, while another (`claude/iam-svc-001`) had the
   reviewer-pushed fix but inherited the same blocked range and was not the
   owner rail.

## Evidence

### Contaminated owner and review rails

- `git ls-remote --heads origin 'refs/heads/*iam-svc-001*'` confirmed:
  - `origin/codex/iam-svc-001 @ aa6d089ca73e2b5375c7d7d9de607c7dd8e8da64`
  - `origin/claude/iam-svc-001 @ 26f386ef0a5d85527ae1d95c4053b2b037038ccc`
- `git log --reverse --format='%h %s' origin/dev..codex/iam-svc-001` showed the
  exact blocked range, including:
  - `08aff296 fix(IAM-SVC-001): unblock workload identity token exchange`
  - `bc411d7b Merge remote-tracking branch 'origin/dev' into codex/iam-svc-001`
  - `aa6d089c IAM-SVC-001: finalize workload identity token exchange guard path`
- `git log --reverse --format='%h %s' origin/dev..origin/claude/iam-svc-001`
  showed the same inherited blocked range ending at `26f386ef`.
- `git range-diff origin/dev..origin/claude/iam-svc-001 origin/dev..codex/iam-svc-001`
  showed that the only meaningful delta between the two rails is the final
  metadata-bearing closeout commit:
  - `26f386ef fix(IAM-SVC-001): allow workload identity token exchange through BootstrapAuthGuard`
  - `aa6d089c IAM-SVC-001: finalize workload identity token exchange guard path`

### Reflog contamination path

- `git reflog show --date=iso codex/iam-svc-001` records:
  - branch created from `origin/dev` at `2026-08-03 03:12:03 +0000`
  - implementation anchors and closeout commits
  - merge commit `bc411d7b` at `2026-08-05 06:27:29 +0000`
  - owner closeout commit `aa6d089c` at `2026-08-05 11:45:42 +0000`
- `git reflog show --date=iso claude/iam-svc-001` records:
  - review-tree anchor commits
  - reset to `gemini2/iam-svc-001`
  - final head `26f386ef` at `2026-08-05 11:06:09 +0000`
- `git reflog show --date=iso gemini2/iam-svc-001` records:
  - reset back to `bc411d7b`
  - local-only final amend `6db197b5`

This proves the parent branch history was not a single linear delivery rail. It
was a sequence of owner work, review-tree anchors, branch resets, and a local
amend on a second lane, all pointing at the same final tree.

### Exact gate failure

- `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-svc-001`
  reports:
  - `08aff296` subject is invalid because it uses `fix(IAM-SVC-001): ...`
  - `bc411d7b` subject is invalid and is missing `Task-ID`, `LLM-Agent`, and
    `Reviewer` trailers
- `python3 scripts/git/check_commit_trailers.py --base origin/dev --head origin/claude/iam-svc-001`
  reports the same inherited failures plus the final `26f386ef fix(...)` subject
- Because the check validates every commit in `origin/dev..<head>`, neither
  shared rail can be repaired in place without force-pushing or rewriting
  accepted shared history.

## Exact Contamination

The exact contamination is a three-layer history split:

1. The accepted repository tree exists on multiple heads with different commit
   identities and branch names.
2. Every existing shared rail still inherits at least one non-compliant commit
   subject, and the owner rail additionally inherits a merge commit with missing
   trailers.
3. The parent task state referenced branch-level evidence that was true only in
   fragments:
   - owner closeout on `aa6d089c`
   - reviewer safety note pointing at `26f386ef`
   - no canonical PR that could actually satisfy merge policy

That is why the parent stayed blocked even though the code itself was already in
an accepted shape.

## Non-Destructive Repair Performed

Do not force-push `codex/iam-svc-001`, `claude/iam-svc-001`, or
`gemini2/iam-svc-001`.

Instead, create a clean replay branch from `origin/dev` that reproduces the
accepted tree as a single compliant commit.

Repair performed on `2026-08-05`:

1. Created clean replay worktree `/tmp/iam-svc-001-clean-repair`
2. Created branch `codex/iam-svc-001-clean` from `origin/dev`
3. Restored the full accepted tree from `aa6d089c`
4. Committed a single clean replay commit:
   - `6a1447816875db1fd83d1e18a197be286e232feb`
   - subject:
     `IAM-SVC-001: replay workload identity primary path for clean PR`
5. Pushed the branch normally:
   - `origin/codex/iam-svc-001-clean @ 6a1447816875db1fd83d1e18a197be286e232feb`
6. Verified the replay rail:
   - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-svc-001-clean`
     => `1 commit(s) OK.`
   - `git rev-parse origin/codex/iam-svc-001-clean^{tree}`
     => `d59c8b0b8a87728cb365d3dfc95706815dcb096b`
   - tree matches `aa6d089c` and `26f386ef`
7. Opened a fresh PR:
   - PR `#1310`
   - `https://github.com/ajoe734/drts-fleet-platform/pull/1310`
   - head `codex/iam-svc-001-clean`
   - base `dev`

This preserves all contaminated rails as audit evidence while creating a
mergeable canonical path with no history rewrite.

## Concrete Parent Next Step

`IAM-SVC-001` should stop treating `codex/iam-svc-001` and
`claude/iam-svc-001` as delivery rails.

Concrete next step:

1. Use PR `#1310` from `codex/iam-svc-001-clean @ 6a144781...` as the only
   canonical integration rail.
2. Let CI finish on PR `#1310`.
3. Review and merge PR `#1310` to `dev` if green.
4. Keep `codex/iam-svc-001 @ aa6d089c`, `claude/iam-svc-001 @ 26f386ef`, and
   `gemini2/iam-svc-001 @ 6db197b5` as historical evidence only.
5. Retain the known migration-version collision note from the parent review:
   `infra/migrations/V0072__workload_identity_assertions.sql` still conflicts by
   version number with `IAM-ACC-002`'s `V0072__platform_admin_users.sql`; that
   issue remains an integration concern outside this history repair.

## Why This Is Safe

- No shared branch was force-pushed or rewritten.
- The previously contaminated rails remain intact for audit.
- The new replay rail is tree-identical to the accepted implementation.
- The new replay rail is PR-connected and trailer-compliant.
- The parent task now has a concrete, currently valid branch and PR to advance.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-SVC-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-SVC-001`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-P0-002`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-P0-004`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-KEY-001`
- Inspected refs and worktrees:
  - `git branch --show-current`
  - `git status --short`
  - `git fetch origin --prune`
  - `git branch -a -vv | sed -n '/iam-svc-001/p'`
  - `git ls-remote --heads origin 'refs/heads/*iam-svc-001*'`
  - `git worktree list --porcelain`
  - `git log --graph --oneline --decorate --max-count=40 origin/dev claude/iam-svc-001 codex/iam-svc-001 gemini/iam-svc-001 gemini2/iam-svc-001 review/iam-svc-001-verify review-backup/iam-svc-001-anchors`
  - `git log --reverse --format='%h %s' origin/dev..codex/iam-svc-001`
  - `git log --reverse --format='%h %s' origin/dev..origin/claude/iam-svc-001`
  - `git log --reverse --format='%h %s' origin/dev..gemini2/iam-svc-001`
  - `git reflog show --date=iso codex/iam-svc-001`
  - `git reflog show --date=iso claude/iam-svc-001`
  - `git reflog show --date=iso gemini2/iam-svc-001`
  - `git range-diff origin/dev..origin/claude/iam-svc-001 origin/dev..codex/iam-svc-001`
  - `git rev-parse aa6d089c^{tree} 26f386ef^{tree} 6db197b5^{tree}`
  - `git diff --stat aa6d089c 26f386ef`
  - `git diff --stat 26f386ef 6db197b5`
  - `git diff --stat origin/codex/iam-svc-001 26f386ef`
- Verified gate and replay rail:
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-svc-001`
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head origin/claude/iam-svc-001`
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-svc-001-clean`
  - `git rev-list --left-right --count origin/dev...origin/codex/iam-svc-001-clean`
  - `git rev-parse origin/codex/iam-svc-001-clean`
  - `git rev-parse origin/codex/iam-svc-001-clean^{tree}`
- Verified PR state:
  - `gh pr list --state all --head codex/iam-svc-001 --json number,title,state,headRefName,baseRefName,url,closedAt,mergeStateStatus,statusCheckRollup,headRefOid`
  - `gh pr list --state all --head claude/iam-svc-001 --json number,title,state,headRefName,baseRefName,url,closedAt,mergeStateStatus,statusCheckRollup,headRefOid`
  - `gh pr list --state all --head gemini2/iam-svc-001 --json number,title,state,headRefName,baseRefName,url,closedAt,mergeStateStatus,statusCheckRollup,headRefOid`
  - `gh pr create --base dev --head codex/iam-svc-001-clean --title 'IAM-SVC-001: replay workload identity primary path for clean PR' ...`
  - `gh pr view 1310 --json number,state,title,headRefName,headRefOid,baseRefName,url,mergeStateStatus,isDraft,statusCheckRollup`

No additional runtime tests were executed in this helper task beyond the parent
task's recorded verification and the new branch trailer validation. The clean
replay branch is tree-identical to the already-verified accepted implementation.
