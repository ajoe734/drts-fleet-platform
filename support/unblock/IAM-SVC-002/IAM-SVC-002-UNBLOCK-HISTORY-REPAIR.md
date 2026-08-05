# IAM-SVC-002 Unblock History Repair

## Scope

- Task: `IAM-SVC-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-SVC-002`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-08-05T15:02:00Z`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-svc-002-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-svc-002-unblock-history-repair`
- Latest pushed helper closeout commit:
  `c2e51e3015d28f51f9378a0ce997bc464ee8c18e`

## What Kept The Parent Blocked

The original diagnosis correctly found a three-rail identity split, but it did
not repair the parent's actual promotion path.

1. The owner implementation rail exists at
   `gemini2/iam-svc-002 @ e868122fcd05ac2e276b44205c1ad7eb02be7489`.
2. The reviewer rail exists at
   `claude/iam-svc-002 @ 98520ae011ebc86c916880862554727a2241edc6`.
3. Both rails resolve to the same tree:
   `e74ef8cba2d04d06e8dfa9c621b14e24308f869a`.
4. The helper branch for this unblock task is separate diagnostic history:
   `codex/iam-svc-002-unblock-history-repair @ dbfc84f28ff66719ace5c300c36acea4308afc70`.

The contamination that still blocked `IAM-SVC-002` after PR `#1311` opened was
not missing push credentials. It was that the canonical owner PR used the raw
five-commit owner rail, and four of those commits violate Gate 1 commit-subject
rules:

- `718a3d043985...`
- `cbc9fdcad997...`
- `de0ae9af0a2e...`
- `e868122fcd05...`

Those commits use `fix(IAM-SVC-002): ...` subjects instead of the required
`<TASK-ID>: <summary>` format from `docs/ops/branch-strategy.md` §5.

At the same time, the replayed tree still contains a real owner defect that
fails `Smoke acceptance` / `lint` on GitHub Actions:

- [apps/api/src/main.ts](/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-svc-002-unblock-history-repair/apps/api/src/main.ts):
  unused `internalKeyMetrics` import on the owner rail tree

So the parent was blocked by two concrete history/path issues:

1. the only open owner PR (`#1311`) was built on a non-compliant multi-commit
   rail
2. the tree being replayed still needs an owner code fix before Gate 1 can go
   green

## Non-Destructive Repair Executed

The safe repair is the same clean-replay pattern already used for
`IAM-SVC-001`.

1. Preserve the original rails as audit evidence:
   - `origin/gemini2/iam-svc-002 @ e868122fcd05ac2e276b44205c1ad7eb02be7489`
   - `origin/claude/iam-svc-002 @ 98520ae011ebc86c916880862554727a2241edc6`
2. Create a fresh clean branch from `origin/dev`:
   - `origin/gemini2/iam-svc-002-clean`
3. Replay the reviewed tree as a single compliant commit:
   - `a8b36035e7d96c5d238e2dfbcc71d31bd5eeb3df`
   - subject: `IAM-SVC-002: replay internal-key exception path for clean PR`
   - trailers:
     - `Tree-Equivalent-To: e868122fcd05ac2e276b44205c1ad7eb02be7489`
     - `Tree-Equivalent-To: 98520ae011ebc86c916880862554727a2241edc6`
4. Open a new canonical PR from the clean branch:
   - PR `#1312`
   - `https://github.com/ajoe734/drts-fleet-platform/pull/1312`

No force-push was used. No shared branch history was rewritten.

## Exact Rails After Repair

- helper branch:
  `origin/codex/iam-svc-002-unblock-history-repair @ c2e51e3015d28f51f9378a0ce997bc464ee8c18e`
- original owner rail:
  `origin/gemini2/iam-svc-002 @ e868122fcd05ac2e276b44205c1ad7eb02be7489`
- original reviewer rail:
  `origin/claude/iam-svc-002 @ 98520ae011ebc86c916880862554727a2241edc6`
- clean replay rail:
  `origin/gemini2/iam-svc-002-clean @ a8b36035e7d96c5d238e2dfbcc71d31bd5eeb3df`
- superseded owner PR with bad commit history:
  `#1311`
- canonical clean replay PR:
  `#1312`

## Parent Next Step

`IAM-SVC-002` should no longer cite HTTPS credential failure. The real next step
is:

1. resume from `origin/gemini2/iam-svc-002-clean @ a8b36035...`
2. review PR `#1312` instead of PR `#1311`
3. land an owner follow-up that removes the unused `internalKeyMetrics` import
   from the replayed tree, then rerun Gate 1

Until that owner code defect is fixed, the correct parent status remains
`blocked`, but now for a true, actionable reason.

## Evidence

### Clean replay commit

- `git switch -c gemini2/iam-svc-002-clean origin/dev`
- `git restore --source e868122f --staged --worktree -- .`
- `git commit -m "IAM-SVC-002: replay internal-key exception path for clean PR" ...`
- `git push -u origin gemini2/iam-svc-002-clean`

### PR evidence

- PR `#1311` remains open against the original owner rail and is expected to
  fail `Commit trailers` plus `Smoke acceptance`
- PR `#1312` is the new clean replay PR and the only branch that can satisfy the
  commit-subject portion of Gate 1 without rewriting shared history

### Gate evidence

- local trailer check on clean replay:
  `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
  → `1 commit(s) OK`
- helper branch push evidence:
  `git ls-remote --heads origin codex/iam-svc-002-unblock-history-repair`
  → `c2e51e3015d28f51f9378a0ce997bc464ee8c18e`
- GitHub Actions evidence on PR `#1311`:
  - `Commit trailers` failed on `2026-08-05`
  - `Smoke acceptance` failed on `2026-08-05`
  - lint error:
    `apps/api/src/main.ts:10:10 'internalKeyMetrics' is defined but never used`

## Verification Performed

- `AI_NAME=Codex scripts/ai-status.sh show IAM-SVC-002-UNBLOCK-HISTORY-REPAIR`
- `AI_NAME=Codex scripts/ai-status.sh show IAM-SVC-002`
- `git branch --show-current`
- `git branch -vv | rg 'iam-svc-002|iam-svc-001'`
- `git log --oneline --decorate --graph --all --max-count=60 --grep='IAM-SVC-002\\|iam-svc-002'`
- `git rev-parse origin/dev e868122f^{tree} 98520ae0^{tree}`
- `gh pr view 1311 --json number,title,url,headRefName,baseRefName,state,isDraft,statusCheckRollup,commits`
- `gh run view 31015211816 --log-failed`
- `git show e868122f:apps/api/src/main.ts | sed -n '1,80p'`
- `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
- `gh pr list --state all --json number,title,url,headRefName,baseRefName,state,isDraft --search 'iam-svc-002-clean'`
- `gh pr view 1312 --json number,title,url,headRefName,baseRefName,state,isDraft,statusCheckRollup`

This helper task changes history routing and machine-truth evidence only. It
does not claim the parent implementation is ready to merge.
