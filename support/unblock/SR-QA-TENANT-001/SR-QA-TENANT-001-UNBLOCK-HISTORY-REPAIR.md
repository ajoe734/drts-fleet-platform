# SR-QA-TENANT-001-UNBLOCK-HISTORY-REPAIR

2026-09-08 · Owner Codex · Reviewer Codex2

## Finding

No current out-of-scope tree contamination or non-fast-forward push blocker was found. The parent remains blocked on tenant UAT provisioning, as recorded in canonical task state at 16:26:34Z. History repair was automatically requested at 16:28:49Z without a specific offending commit. Do not erase the environment blocker merely because this helper merges.

The historical complication is repeated rebasing followed by merging the previously published ancestry. At inspected dev `5cff9b36082998a0295f2550039306dc1f84c3d2`, the Codex parent has 46 additional commits, including five ancestry merges: `25301446b`, `2f0565aa2`, `8749a5b6a`, `1958c705c`, and `c67d8b1d12068171afe899c9816933111382bf26`. For example, the last merge joins rebased head `a1d743f1421ceaad03cb28138171d5c359b448ae` and published head `8fb5162de6d07a71ba029542c7ee92a1bd7b495b`; its tree equals its first parent's tree. Duplicate commit subjects therefore do not establish duplicate file content.

## Exact branch and worktree evidence

| Item | Observed value |
| --- | --- |
| Local and remote Codex parent | `bee34ad806ca3f4376314ebc7ef257c93ae45954`; left/right divergence `0 0` |
| Parent tree delta from dev | Five files, 743 additions, all within parent write scopes: UAT document and directory/cost-centers/approval-rules/SLA e2e specs |
| Existing parent PR | [#1769](https://github.com/ajoe734/drts-fleet-platform/pull/1769), OPEN, `claude/sr-qa-tenant-001`, head `3cc1a39117f49de1c1cca4e3f24848d1bb551ed8` |
| Old PR delta | Two unit test files plus the same UAT document; distinct from current Codex e2e work |
| Provisioning diagnosis | [#1788](https://github.com/ajoe734/drts-fleet-platform/pull/1788), head `6e38cae8b3af781e472818962d70e218e6a2b7de` |
| Registered parent worktree | None in `git worktree list --porcelain` at inspection; parent branch still exists locally and remotely |
| This helper | Assigned isolated worktree, branch `codex/sr-qa-tenant-001-unblock-history-repair`, initially clean and based on inspected dev |

PR #1769's body still describes Claude ownership and review, whereas canonical parent state describes Codex ownership and blocked provisioning. Its head is not a candidate for the current Codex work. Preserve both branches; do not treat the stale PR text as machine truth or approve it as the latest parent candidate.

## Non-destructive continuation

1. Keep published parent refs unchanged. No force-push, reset, stash, branch deletion, or old PR merge is needed to resolve this diagnosis.
2. On parent dispatch, recheck registered worktrees and reuse the one holding `codex/sr-qa-tenant-001`. If none exists, supervisor can attach the existing local branch to an unused isolated worktree with `git worktree add <unused-parent-path> codex/sr-qa-tenant-001`. Check path availability first; do not overwrite residual files. Stay out of canonical root for task edits.
3. Fetch and verify local/remote equality and dev ancestry again. At this snapshot, dev is already an ancestor, so the published parent can simply continue with descendant commits and ordinary pushes. If dev advances, follow the required rebase protocol in an isolated checkout; if publishing that result would require force, preserve the original ref and have supervisor route a fresh task recovery branch from current dev with a reviewed, task-scoped cumulative patch. Do not replay all 46 duplicate historical commits or use force to keep the old branch name.
4. Compare and reconcile the two unit-test files from #1769 with the Codex e2e suite when continuing the parent acceptance matrix. Reconcile the shared evidence document explicitly; neither wholesale overwrite nor blind cherry-pick of the competing document is justified. This helper does not change parent test scope or claim to finish that matrix.
5. Supervisor/Gemini coordinates provisioned disposable tenants A/B and six environment settings: `DRTS_TENANT_UAT_API_URL` (including `/api`), `DRTS_TENANT_UAT_TENANT_A`, `DRTS_TENANT_UAT_TENANT_B`, `DRTS_TENANT_UAT_TOKEN_A`, `DRTS_TENANT_UAT_TOKEN_B`, `DRTS_TENANT_UAT_TOKEN_READONLY`. Record nonsecret provenance, identity expiry and cleanup ownership; do not publish tokens. Then run `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` in the parent checkout, retaining actual HTTP/same-ID readback/resource evidence and finishing the outstanding matrix.
6. Only after parent checks are complete, commit and ordinary push, open/update a PR for the actual Codex branch, and hand off that exact candidate SHA. Supervisor must reconcile the stale #1769 association before review; its CI/review cannot be reused for a different candidate.

## Validation and lifecycle

Executed here: `git fetch origin` and helper `git rebase origin/dev` (exit 0, already current); `git ls-remote --heads origin '*sr-qa-tenant*'` (exit 0, published SHAs above); `git rev-list --left-right --count codex/sr-qa-tenant-001...origin/codex/sr-qa-tenant-001` (exit 0, `0 0`); `git merge-base --is-ancestor origin/dev codex/sr-qa-tenant-001` (exit 0); `git diff --check origin/dev...codex/sr-qa-tenant-001` (exit 0); `git diff a1d743f14 c67d8b1d1 --stat` (exit 0, empty). GitHub PR head/files inspection confirms the separate branch contents. No live acceptance was rerun for this documentation-only helper.

Task-scoped commit, normal push and PR evidence are recorded by this helper's canonical candidate handoff. Parent stays `blocked`, `waiting_for=Gemini`. Merge-evidence actor must set `PARENT_STATUS=blocked`, `PARENT_WAITING_FOR=Gemini`, and `PARENT_NEXT` preserving provisioning and the continuation above: the current lifecycle's default helper resolution to `todo` must not be interpreted as provisioned access. This helper documents a safe path; it does not change shared lifecycle code or claim the parent is accepted.
