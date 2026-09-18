# SR-OPS-SHELL-001 history repair audit

- Date: 2026-09-08; owner: Codex2; reviewer: Codex.
- Helper branch: `codex2/sr-ops-shell-001-unblock-history-repair`.
- Inspected `origin/dev`: `c4c4a35f88907df6bf68e781059dde397c06ba03`.
- Parent local and remote branch: `codex2/sr-ops-shell-001`, both at `e2ec3c1922824123f310aeb1023e805662a0c1e0`.
- Disposition: historical branch provenance/rebase divergence is already repaired non-destructively. No current unrelated-file contamination was found in the parent diff. Do not reset or force-push the parent. Product scope/receiver-contract blockers remain.

## Exact history and workspace evidence

`git reflog show codex2/sr-ops-shell-001` records, oldest first:

1. Branch created from dev at `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`.
2. Reset to `origin/claude2/sr-ops-shell-001` at `2f3df818f48a6bf45196b000bc58ea5f0e8fc51c`. This explains the cross-lane source in the reconstructed parent record; the source commit itself changes only five parent-scoped files, not unrelated tasks.
3. Rebase onto `70355aba9` produced `4b9130a52`; evidence commit `415e783b3f50a7e4aada2d9c4b186f02e554256e` followed.
4. Rebase onto current inspected dev produced implementation `c0d0ac6dc2ff45e5909fba5b3ec7a2c823fcd022` and evidence `f66b09d7e1e8d435f34ae3c513ecf19f16c30f1e`. Replayed commits have different identities from the already-published history.
5. Merge `6a13a1006e2d0f737b8258ec1c62403208ff0b57` has parents `f66b09d7e1e8d435f34ae3c513ecf19f16c30f1e` and `415e783b3f50a7e4aada2d9c4b186f02e554256e`. Its tree equals the first parent's tree: it preserves published ancestry without changing the recovered content.
6. Evidence anchor `e2ec3c1922824123f310aeb1023e805662a0c1e0` is present locally, remotely and at PR #1714. The ancestry-preserving repair therefore predates this helper dispatch; repeating it is unnecessary.

At inspection, `git worktree list --porcelain` contains no checkout of the parent branch. The helper is in its assigned isolated worktree; canonical root remains on `dev`. The available reflog does not establish the cwd that performed the historical reset, so no claim of a particular contaminated historical worktree is made.

There are six open parent PRs: Codex2 #1714, Codex #1728, Claude #1763, Claude2 #1672, Gemini #1648 and Gemini2 #1636. They are alternate histories, not six accepted candidates. Parent owner is currently Codex2; supervisor should reconcile alternate PRs against machine truth before integration. This helper neither merges nor closes another lane's PR.

## Verification performed

| Command / observation | Result |
| --- | --- |
| `git fetch origin` | exit 0 |
| `git rebase origin/dev` on helper | exit 0; already up to date |
| `git rev-list --left-right --count codex2/sr-ops-shell-001...origin/codex2/sr-ops-shell-001` | exit 0; `0 0` |
| `git merge-base --is-ancestor 415e783b3 origin/codex2/sr-ops-shell-001` | exit 0; published history retained |
| `git diff --quiet f66b09d7e 6a13a1006` | exit 0; merge introduces no content |
| `git diff --name-only origin/dev...origin/codex2/sr-ops-shell-001` | five files, all within parent write scopes |
| `gh pr view 1714 --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup` | head `e2ec3c192`; `MERGEABLE`, merge state `BLOCKED`; reported completed checks successful except one skipped, aggregate `ci-integ` queued at inspection |

The five changed files are assistant `assistant-widget.tsx`, `audit-link.ts`, `widget-geometry.ts`, task UAT evidence and task unit tests. `MERGEABLE` confirms absence of a Git content conflict; it does not waive protected-branch or candidate-lifecycle gates. CI observations are not a claim of product acceptance.

Parent PR: <https://github.com/ajoe734/drts-fleet-platform/pull/1714>. Inspected parent CI run: <https://github.com/ajoe734/drts-fleet-platform/actions/runs/34243298480>.

## Concrete non-destructive next step

1. Supervisor retains the current parent branch and PR #1714. No history rewrite, stash recovery, broad cherry-pick or replacement of assistant changes is needed. When resuming the parent, reuse an existing parent worktree if one exists; otherwise create an isolated checkout of the existing local parent branch. Do not switch canonical root or this helper's checkout to do parent work.
2. Resolve the still-current planning prerequisite documented in [the planning helper](SR-OPS-SHELL-001-UNBLOCK-PLANNING-DECISION.md): authorize the required sender/resolver scopes and overlapping-writer dependencies, and confirm audit receiver resource identity/query handling under `Q-SR-OPS-SHELL-001`. The parent additionally identified complaints and incidents sender paths in its `e2ec3c192` evidence. The planning helper's merged PR #1749 records routing, not authorization to expand write scopes.
3. After authorization, parent owner fetches dev and inspects its advance. Follow the required rebase protocol in an isolated parent checkout. If rebasing published commits diverges from the remote, preserve the pre-rebase published tip and merge that tip into the rebased branch, resolve only authorized content, and verify the remote tip remains an ancestor before an ordinary push. If that cannot be done safely, stop with a blocker rather than force-pushing.
4. Complete authorized implementation and rerun parent-scoped tests/typecheck plus actual 1440/390px navigation, focus and CTA checks. Commit and push normally, then hand off the exact new candidate to Codex. The existing WIP anchor is not an accepted candidate; this helper does not hand off the parent or clear its product blocker.

## Helper delivery boundary

This helper changes only this support artifact. Product tests and browser/live acceptance were not rerun because no product code changed. Final whitespace validation, helper commit, ordinary push, PR URL and exact helper candidate are recorded in machine truth at handoff. Parent receives a separate status update preserving the outstanding scope/contract blocker. Review, CI and merge remain with the candidate lifecycle.
