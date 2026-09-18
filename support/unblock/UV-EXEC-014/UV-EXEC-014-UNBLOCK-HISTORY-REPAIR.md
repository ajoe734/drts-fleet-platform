# UV-EXEC-014 history repair disposition

Task: `UV-EXEC-014-UNBLOCK-HISTORY-REPAIR`  
Owner / reviewer: Codex2 / Gemini  
Evidence inspected: 2026-09-08 UTC

## Exact cause

After `git fetch origin`, the parent local branch `codex/uv-exec-014` is at
`5ade24c09c6c4b1e9981ab8b67ca1745f295c5eb`; its remote and open
[PR #1831](https://github.com/ajoe734/drts-fleet-platform/pull/1831) remain at
`14b507de27236c9ebe85d744f13980fc33150693`. Their merge base is
`3bdb943eef2cb42fd825cc8e3d250d3d42cdf4bb`. The local reflog records a rebase
onto `32b6dde7db730a8524004a5e87d94d5a2a6d7853`, followed by the fixture fix.
This is published-history divergence, not evidence of unrelated product code
being committed into the parent.

`git log --left-right --cherry-mark` identifies six patch-equivalent pairs:

| Published commit | Rebased commit | Scope |
| --- | --- | --- |
| 78635b006 | 735893cf5 | confirmation evidence gate |
| 9ed5b64b9 | 7c20ebfff | correction lifecycle and negative matrix |
| 971cd3c8c | c5187bc1a | explicit consent/readback evidence |
| f1af83cd8 | c2ed254ce | lock-query fixture narrowing |
| 83b2a4bf6 | 665bd6c21 | epoch-aware cutoff |
| 14b507de2 | 6e6563ae5 | epoch reset verification |

The remote/local exclusive counts are 6/8. The other two local commits are
the merged helper documentation `32b6dde7d` and the new fixture fix
`5ade24c09`. Endpoint diff contains only the prior helper report and four
changed lines in the [parent test fixture at preserved commit 5ade24c09](https://github.com/ajoe734/drts-fleet-platform/blob/5ade24c09c6c4b1e9981ab8b67ca1745f295c5eb/tests/unit/uv-exec-014.test.ts): capture `h.events[0]`,
throw when absent, then spread the narrowed event. Product directories
`apps`, `packages`, and `tests` are identical between the remote candidate
and pre-fix rebased head `6e6563ae5`. Another ordinary push to the old remote
branch cannot fast-forward; repeating rebase will not solve that.

`git worktree list --porcelain` has no current parent worktree registration.
The parent branch and its commits remain recoverable. This helper stayed in
its supervisor-assigned isolated worktree on
`codex2/uv-exec-014-unblock-history-repair`; it did not switch the canonical
root, modify the parent branch, or import the parent's product implementation.

## Non-destructive owner recovery path

The supervisor should assign Codex a fresh isolated parent workspace and
explicitly route it to `codex/uv-exec-014-history-recovered`. That remote branch
does not exist at inspection time. Preserve the existing local branch and
PR #1831 as evidence. In the newly assigned workspace, the parent owner can:

```bash
git fetch origin
# First verify the proposed recovery name is still unused locally/remotely.
git show-ref --verify refs/heads/codex/uv-exec-014-history-recovered
git ls-remote --heads origin codex/uv-exec-014-history-recovered
# If either exists, inspect/reuse it; do not reset or overwrite it.
git switch -c codex/uv-exec-014-history-recovered 5ade24c09c6c4b1e9981ab8b67ca1745f295c5eb
git rebase origin/dev
git diff --check
```

The absent local-ref check above is expected to exit 1. At this snapshot,
`origin/dev` is already an ancestor of the preserved fix, so the rebase is a
no-op. If dev advances, resolve only parent-owned conflicts before the first
publication. Recheck the PR diff against dev for task scope. Install/build
dependencies within that isolated workspace, run the checks below, then use
a normal `git push -u origin codex/uv-exec-014-history-recovered`. Create a
replacement PR against `dev`, linking #1831 and this report in its body.
Leave the old PR unchanged until replacement delivery evidence is recorded.
No force push, reset of an existing branch, stash, or shared-history rewrite
is required. This helper documents the recovery; it does not claim that the
replacement branch/PR has been created or that the parent is validated.

The parent owner must hand off the actual new pushed HEAD and branch using
the current-release `ai-status.sh`, with reviewer Codex2. Review and CI at
`14b507de2` cannot validate the new SHA. Preserve all four parent acceptance
requirements and complete their same-candidate lifecycle after review/CI.

## Separate dependency contamination

The existing `/tmp/uv-exec-014-root-typecheck.log` contains TS2345 diagnostics
comparing `ApiClient` from the former `codex-uv-exec-014` workspace against
`codex-sr-qa-webhook-001`; private `baseUrl` declarations make their types
incompatible. This confirms a cross-worktree resolution problem in that run,
not a remaining failure of the narrowed historical event fixture. The former
workspace is absent from the current worktree list. This helper's own
`node_modules` is also a symlink to canonical-root `node_modules`.

Do not repair this by editing unrelated test types or mutating the shared
dependency tree. Provision a workspace-local dependency installation (replace
only a confirmed workspace-local symlink, never recursively delete its target),
build required workspace packages, and verify resolved package paths remain
inside that workspace. Run these commands in the recovered parent workspace
(the parent test fixture is not yet present on dev or this helper branch):

```bash
pnpm typecheck:root
pnpm exec vitest run tests/unit/uv-exec-014.test.ts
pnpm --filter @drts/api typecheck
```

The parent's recorded 71/71 tests and API
typecheck pass are prior-run evidence only; this documentation helper did not
rerun them. Product servers, browser tests and Docker remain prohibited here.

## Helper verification and delivery

2026-09-09 CI follow-up: PR #1834 candidate `f934f3f6b49ced60583cc75877191f96d7d7e2c2`
failed Canonical consistency because the historical parent-only fixture was
interpreted as a current-tree path citation. Qualify that evidence with its
preserved commit and scope the validation commands to the recovered parent
workspace. No product files or shared branch history are changed by this fix.

Verified fetched refs, PR head/state, reflog, patch-equivalent pairs, exclusive
commit counts, endpoint diff, product-tree parity, current-dev ancestry,
worktree registrations, dependency symlink and the prior typecheck log.
Run `git diff --check` and commit only this report. Publish through a normal
push, a helper PR against dev, and exact-SHA handoff to Gemini. Commit/PR
evidence is carried by that candidate lifecycle, not by ephemeral logs.

Write the concrete recovery steps to the parent using `ai-status.sh note`.
The parent remains blocked pending supervisor workspace/branch routing and
owner checks; this helper does not impersonate its owner or mark it done.
