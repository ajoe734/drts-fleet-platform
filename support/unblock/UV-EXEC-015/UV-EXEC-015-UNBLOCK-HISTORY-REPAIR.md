# UV-EXEC-015 history repair diagnosis

Task: UV-EXEC-015-UNBLOCK-HISTORY-REPAIR. Owner: Codex. Reviewer: Codex2.
Observed: 2026-09-09 UTC. This is a history diagnosis, not product acceptance.

## Finding

No branch/commit contamination was found in the parent's published work.
The chair's 02:01:34 UTC task-creation event explicitly requested diagnosis
without presuming contamination and retained the external PostgreSQL gate.
The parent remains blocked on actual database/crash/hangup verification.

Published `origin/codex2/uv-exec-015` was verified with `git ls-remote` at
`013777c37ced98a557d3f59c86f7a6751b30b04b`. Its four commits are task-scoped:

| Commit | Scope |
| --- | --- |
| `fea500b4c8453614536fa71dc531006705f8e273` | Durable proof migration and pure order preparation |
| `5ee55bf58e522eb40e08da904fa8a6204ae2e130` | Atomic command acceptance and recovery runner |
| `e10b34f33d2c3f2ceb69380fdc8bea6333c53931` | Receipt replay and PostgreSQL crash matrix |
| `013777c37ced98a557d3f59c86f7a6751b30b04b` | Database validation gate and recovery evidence |

All four carry Task-ID UV-EXEC-015 and Reviewer Gemini. Git author is Gemini
while the lane trailer is codex2; author metadata alone does not establish
cross-task contamination. Their paths and subjects match the parent scope.
The merge base is `3062ea363769cc393e59384251f5aedc7e570ac5`.
Against observed `origin/dev` `7d04833053b63558c10fb678a422dff3522e0150`,
`git rev-list --left-right --count origin/dev...013777c37` returns `1 4`:
ordinary trunk advancement, not unrelated branch history.

## Concurrent supervisor work

The branch is checked out in the locked worktree
`/home/lupin/workspace/drts-fleet-platform/.local/uv015-ci-worktree`, with lock
reason “Active supervisor PostgreSQL CI wiring for UV-EXEC-015”. It was clean.
The supervisor's 02:02:39 UTC parent note confirms ownership of the CI change.
The original dispatch worktree `.../.artifacts/worktrees/auto/codex2-uv-exec-015`
is no longer listed; do not recreate it or switch the canonical root.

During inspection the local CI commit changed from `2a13794ec5c0406d38208019ebb1a41c40b382c3`
to `392dc5a84fe47a4dab4082da5e9bbd7ed7b32d67`. The reflog records a local commit
amend; the remote still pointed to `013777c37` at inspection. The latter is
an ancestor of `392dc5a84`, so the observed change needs only a normal push.
It touches `.github/workflows/ci-integ.yml` and the parent recovery runbook.
No parent PR was returned by `gh pr list --state all --head codex2/uv-exec-015`
at inspection. These are time-bound observations; supervisor work is ongoing.

## Non-destructive next step

1. Supervisor finishes its existing locked-worktree CI change, re-reads local
   and remote heads, and normal-pushes the descendant of the four anchors.
   Preserve the published anchors. This helper does not mutate that worktree.
2. Open/reuse the parent PR against dev and run the hosted PostgreSQL job.
   The parent runbook requires at least 14 cases, all passing, none skipped;
   record the exact tested SHA, workflow URL and JSON result artifact.
3. If dev integration is required, merge current origin/dev into the published
   parent branch with task-scoped trailers, resolve and test, then normal-push.
   Do not rebase published anchors if doing so would require force-push. If
   branch policy instead requires rebase, use a new recovery branch/worktree
   from current origin/dev, replay only the four listed anchors and the final
   supervisor CI patch, and open a replacement PR; retain the original refs.
4. If a push rejects because the remote advanced, fetch and inspect ancestry.
   Integrate the actual remote work or use the fresh recovery branch above;
   never force-push, reset the shared branch, or transfer design intent by stash.
5. Codex2 verifies the final pushed SHA and hands the parent candidate to Gemini.
   Record postgres_atomic_booking_evidence, receipt_recovery_crash_matrix,
   hangup_command_evidence and reviewed_candidate_sha through the lifecycle.
   Keep the parent blocked until the outstanding verification is actually met.

## Verification and delivery boundary

Read parent/helper task slices, task-filtered activity events, worktree list,
parent reflog, commit bodies/path diffs, merge base and remote ref. Parent
`git diff --check origin/dev...codex2/uv-exec-015` passed. Published anchor
ancestry of the observed local CI head passed. No product code was changed,
no database tests were claimed, and no VM infrastructure was started.

This helper delivers only this artifact on
`codex/uv-exec-015-unblock-history-repair`; its commit, normal push, PR and
locked candidate are recorded by the helper handoff. Parent history needs no
repair at the inspected heads. CI preparation is not PostgreSQL acceptance.
