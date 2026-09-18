# SR-BANK-002 Unblock History Repair

## Scope and result

- Helper task: `SR-BANK-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `SR-BANK-002`
- Audit timestamp: `2026-09-08T09:xxZ`
- Parent branch audited: `origin/codex2/sr-bank-002 @ e150fcfe109b14fcab6e219b296eaf84766364ad`
- Current integration base: `origin/dev @ b5c3774e5e62fab7cf43b67a7e69fae7e0ca91ef`

The parent is blocked by a real branch-history / candidate-identity split.  It
is not safe to hand off `e150fcfe1` as an `SR-BANK-002` candidate: it is a
non-linear merge of two incompatible rails, is `1` commit behind and `10`
commits ahead of current `origin/dev`, and has no PR.  The repair is
non-destructive: preserve that ref as audit evidence, then have the parent
owner make a new clean, rebased delivery branch from `origin/dev`.  No
force-push, ref rewrite, or mutation of shared `dev` history is needed.

This diagnosis does not claim that the parent product acceptance is complete.
The parent machine-truth note separately records five failing, non-skipped
regressions around API scope and `bank-dev-read-models` fallback.  Those are
the next product blockers once the delivery rail is clean.

## Exact contamination

The existing parent ref contains two separately-created versions of the same
four WIP commits.

| rail | head / characteristic | consequence |
| --- | --- | --- |
| Remote original rail | `07273996a` (`origin/codex2/sr-bank-002` before the later push) | The machine-truth reconstruction records this SHA as its only surviving branch evidence. |
| Local rebased rail | `473975750`, following `e00170c61`, `dbec26678`, `92832f50e`, `b2290a1a4` | These commits were rebased onto `70355aba9`; their commit IDs changed while retaining the task WIP subjects. |
| Contaminated published result | `e150fcfe1`, parents `473975750` and `07273996a` | A `git pull`-style merge joined both rails and was then pushed to `origin/codex2/sr-bank-002`. |

The local reflog records the sequence precisely:

```
2026-09-08 08:45:39  branch created from origin/codex2/sr-bank-002 (07273996a)
2026-09-08 08:46:38  rebase finished onto 70355aba9 (b2290a1a4)
2026-09-08 08:49:43  anchor rebased isolation evidence (473975750)
2026-09-08 08:51:17  merge origin/codex2/sr-bank-002 (e150fcfe1)
2026-09-08 08:51:19  pushed e150fcfe1 to origin/codex2/sr-bank-002
```

This is contamination rather than a benign merge for three independently
checkable reasons:

1. `git show --format=raw e150fcfe1` has both `473975750` and `07273996a` as
   parents, so the canonical remote ref is no longer the linear WIP stack that
   the task history and candidate lifecycle expect.
2. The two paths carry duplicate task intent but are not identical trees.  The
   final commits' stable patch IDs differ (`473975750`:
   `3c9732f53241609be59bfcbdd03ad7b3c8be873b`; `07273996a`:
   `d1df508ed627df9b8e4e88d2145a11782dcdc7b8`), and
   `git diff --stat 473975750 07273996a` reports 85 files.  The original path
   also contains unrelated changes outside SR-BANK-002's write scopes.
3. `git rev-list --left-right --count origin/dev...origin/codex2/sr-bank-002`
   returns `1 10`.  It therefore neither starts from the current integration
   trunk nor describes a reviewable, task-only diff.  `gh pr list` found no PR
   with `codex2/sr-bank-002` as its head, so no existing PR/candidate evidence
   can disambiguate it.

The historical task reconstruction compounds the ambiguity: its
`reconstruction.branch_head` remains `07273996a`, even though the remote now
points at merge `e150fcfe1`.  Treat neither SHA as a resume or candidate SHA.

## Non-destructive repair path

1. Freeze `origin/codex2/sr-bank-002 @ e150fcfe1` as audit-only evidence.  Do
   not force-push it, reset it, rebase it in place, or open a PR from it.
2. The assigned parent owner creates a new uniquely named replacement rail from
   current `origin/dev` (for example `codex2/sr-bank-002-clean-repair`).  The
   helper does not create it because it would be a canonical product change
   outside this task's artifact scope.
3. Reconstruct only the parent-owned changes from the clean rebased sequence
   (`e00170c61..473975750`), resolving each conflict against current `dev` and
   retaining only the allowed SR-BANK-002 paths:

   ```text
   apps/bank-console-web/app/statements/
   apps/bank-console-web/app/users/
   apps/bank-console-web/lib/session.ts
   tests/unit/system-remediation/sr-bank-002/
   docs/04-uat/system-remediation-20260906/SR-BANK-002.md
   ```

   The owner must not replay the merge commit `e150fcfe1`, the old
   `07273996a` rail, or out-of-scope files such as workflow/API/partner changes.
4. Run the parent task's declared `git diff --check`, Bank Console typecheck,
   and SR-BANK-002 Vitest suite.  Address or separately route the already
   recorded API-policy / read-model fallback regressions; a history repair does
   not erase those failures.
5. Commit with the parent task trailers, push normally, create a PR to `dev`,
   and hand off that exact new SHA.  The reviewer must inspect the new
   candidate, not `e150fcfe1` or `07273996a`.

This keeps every historical commit reachable for audit while producing a
linear, current-base candidate without rewriting shared history.

## Parent machine-truth update

The parent should retain `blocked` until the owner receives the expanded/clean
delivery rail, but its `next` note must identify this concrete next action:

> History repair identified `origin/codex2/sr-bank-002@e150fcfe1` as a
> contaminated merge of old `07273996a` and rebased `473975750` rails. Preserve
> it audit-only; reassign/authorize the parent owner to reconstruct the
> task-scoped diff on a new branch from `origin/dev`, then validate the five
> existing API-scope/read-model regressions before normal push/PR/handoff. See
> `support/unblock/SR-BANK-002/SR-BANK-002-UNBLOCK-HISTORY-REPAIR.md`.

## Evidence collected

- `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md` §11, and
  `tools/development-orchestrator/skills/worker-anchor-commit.md` were read.
- `ai-status.sh show SR-BANK-002`, `SR-BANK-001`, and `SR-IAM-001` confirmed
  the parent is blocked while both declared dependencies are done/merged.
- `git worktree list --porcelain`, `git show-ref`, `git log --graph`,
  `git reflog show`, `git merge-base`, `git rev-list --left-right --count`,
  `git diff --stat`, and stable `git patch-id` comparisons established the
  two rails and the merge contamination.
- `gh pr list --head codex2:sr-bank-002 --state all` returned `[]`.

No application code was changed, no parent ref was rewritten, and no
force-push was used.
