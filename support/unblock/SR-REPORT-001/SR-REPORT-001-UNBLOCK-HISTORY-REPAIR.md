# SR-REPORT-001 History Repair Note

- Task: `SR-REPORT-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `SR-REPORT-001`
- Owner: `Codex2`
- Reviewer: `Claude`
- Audit date: `2026-09-08`

## Finding

The parent is blocked by divergent history on the same published branch, not by
an uncommitted worktree or another task's changes.

| Ref | SHA | Parent | Meaning |
| --- | --- | --- | --- |
| common ancestor | `69c519702047862212bc0e4890350e6b58917062` | — | pre-report stack base |
| published remote head | `f95532988616389fc40ee794f9eef23d05ea14c0` | `73b91900d...` | original three anchored report commits |
| local rebased head | `ecd9125a41d69c5045dfcbec52b33a56eb009e5f` | `d62e0a50b...` | rewritten three-commit stack on current `origin/dev`, plus evidence |
| current base | `70355aba97c23dd1cd592b71f1d3dfe6315d91ff` | — | `origin/dev` when the rebase completed |

The original commits `bd10a2c25`, `73b91900d`, and `f95532988` were rebased as
`27c906849`, `41e15d584`, and `d62e0a50b`; `ecd9125a4` then added eight lines
of verification evidence.  Therefore a normal push of local
`codex2/sr-report-001` to `origin/codex2/sr-report-001` is correctly rejected
as non-fast-forward.  `git rev-list --left-right --count
origin/codex2/sr-report-001...codex2/sr-report-001` reports `3 7`.

Both stacks touch the same six report-task paths.  The local rebased stack is
based on current `origin/dev`; the remote stack is not.  No foreign task commit
is present in either report stack, and this helper worktree is clean.

## Checked repair options

`git merge-tree --write-tree ecd9125a4 f95532988` proves that a merge preserving
the old remote branch is possible in principle but creates an add/add conflict
in `docs/04-uat/system-remediation-20260906/SR-REPORT-001.md`.  Resolving and
pushing that merge would be non-force, but it would retain an obsolete base and
make the candidate harder to review.  Do not force-push the published branch.

## Chosen non-destructive continuation

Use the already-rebased local stack as the source, but publish it under a new
branch.  This preserves `origin/codex2/sr-report-001` unchanged for audit and
creates a normal, reviewable candidate based on current `origin/dev`:

```bash
git fetch origin
git switch -c codex2/sr-report-001-rebased codex2/sr-report-001
git push -u origin codex2/sr-report-001-rebased
gh pr create --base dev --head codex2/sr-report-001-rebased \
  --title "SR-REPORT-001: report formats on current dev" \
  --body "Non-destructive continuation of the rebased SR-REPORT-001 stack; preserves origin/codex2/sr-report-001."
```

Before handoff, the resumed parent owner must re-run its declared checks against
that branch and lock its resulting SHA with `ai-status.sh handoff`; no push may
occur after that handoff.  The existing scope issue remains independent of this
history repair: `packages/contracts/src/index.ts` and
`tests/unit/reporting-filing.test.ts` must not be edited unless the supervisor
expands `SR-REPORT-001` write scopes.

## Machine-truth next step

The parent may be resumed as `in_progress` with this concrete next step:

> Publish `codex2/sr-report-001-rebased` from local `ecd9125a4`, open its PR to
> `dev`, rerun the parent validation plan, and hand off that exact SHA; request
> write-scope expansion separately if shared contracts/tests are still needed.

## Verification record

| Check | Result |
| --- | --- |
| parent / helper task status queried via `ai-status.sh show` | parent blocked; helper in progress at audit start |
| `git status --short --branch` in helper worktree | clean, expected branch |
| common ancestor | `69c519702047862212bc0e4890350e6b58917062` |
| divergence count | remote-only `3`, local-only `7` |
| `git merge-tree --write-tree ecd9125a4 f95532988` | one expected add/add conflict in parent UAT evidence file |
| `git diff --check origin/codex2/sr-report-001...codex2/sr-report-001` | passes |

This note records a branch/commit repair path only.  It neither rewrites shared
history nor claims parent implementation validation has passed.
