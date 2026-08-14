# S1F-REL-001 Unblock History Repair

## Scope

- Task: `S1F-REL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `S1F-REL-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-08-14`

## Exact Contamination

The blocked release is affected by a **local remote-tracking-ref ambiguity plus
stale PR merge metadata**.  It is not evidence that `codex/s1f-rel-001` should
be rewritten.

1. This isolated worktree configures `origin` with only
   `+refs/heads/dev:refs/remotes/origin/dev` in `remote.origin.fetch`.
   Consequently, `git fetch origin` refreshes `origin/dev` but does not refresh
   `refs/remotes/origin/codex/s1f-rel-001`.
2. The local remote-tracking ref is still
   `origin/codex/s1f-rel-001 @ 444121b9a97a0ffa949841bc6761c162dd0c703d`,
   whereas the authoritative remote query resolves
   `refs/heads/codex/s1f-rel-001` to
   `82109422d0a9ee8be67518b9031d2c06c7826be1`.
3. The local `codex/s1f-rel-001` ref and the task's locked candidate both point
   to that same authoritative SHA.  `git rev-list --left-right --count
   82109422...444121b9` reports `8 0`: the stale tracking ref is an ancestor,
   not an alternative or a repair target.
4. PR #1404 reports head `82109422`, but its GitHub API base SHA remains
   `001b88caca2a9e2bb93b6b19e274a9ced370323b`, while current `origin/dev` is
   `6cf0531d6ee82561d23c045655be066100c3122c`.  The API currently labels the
   PR `mergeable=false` / `mergeable_state=dirty`.
5. Deterministic local checks do not reproduce a content conflict: both
   `git merge-tree --write-tree 001b88ca 82109422` and
   `git merge-tree --write-tree 6cf0531d 82109422` exit successfully.  The
   dirty status is therefore stale or platform-side mergeability metadata until
   GitHub recomputes it; it is not justification for a force push.

There is no worktree currently attached to `codex/s1f-rel-001`.  The helper
worktree is correctly attached to its separate repair branch.

## Non-Destructive Repair Path

Do not reset, rebase-and-force-push, or otherwise rewrite
`codex/s1f-rel-001`.

1. When inspecting the parent branch in this checkout, use
   `git ls-remote --heads origin refs/heads/codex/s1f-rel-001` (or explicitly
   fetch that ref) rather than the stale local `origin/codex/s1f-rel-001` ref.
2. Treat `82109422d0a9ee8be67518b9031d2c06c7826be1` as the only current
   parent candidate.  Do not use `444121b9` as a replay source because it is an
   ancestor of the candidate and omits eight candidate commits.
3. Ask GitHub to recompute PR #1404 mergeability.  If it remains dirty after a
   fresh computation, update it only through the normal PR update-branch flow
   (a new non-force merge commit), then re-run review and CI against that new
   immutable SHA.  Updating the branch changes the candidate and must not be
   represented as approval of `82109422`.
4. If the parent instead needs an exact deployable release candidate, create a
   new task-scoped replay branch from current `origin/dev`, apply the reviewed
   release delta with ordinary commits, push normally, and open a replacement
   PR.  Lock review, CI, and deployment evidence to the resulting new SHA.
   Leave PR #1404 and its existing head intact for auditability.

## Concrete Parent Next Step

Update `S1F-REL-001` to replace the incorrect claim that candidate `82109422`
is reachable from `origin/dev`.  The observed graph is `5 16` for
`origin/dev...82109422`, so it is not reachable from current `dev`.

The parent should remain blocked pending one owner decision:

> Verify/recompute PR #1404 against its real remote head `82109422`.  If
> GitHub still reports dirty, make a normal update-branch commit or open a new
> replay PR from current `origin/dev`; lock a new candidate SHA and re-run
> review/CI/deployment.  Do not force-push `codex/s1f-rel-001`, and do not use
> the stale local tracking ref `444121b9` as the parent head.

This unblocks history diagnosis.  It does not close the release's independent
G6--G8 deployment and operational-acceptance gates.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md` and the worker anchor-commit protocol.
- Queried task slices through the released `ai-status.sh` command.
- Compared worktrees and refs with `git worktree list`, `git show-ref`,
  `git rev-list`, `git log`, and `git ls-remote`.
- Queried PR #1404 metadata through GitHub CLI/API.
- Verified both the recorded PR base and current `origin/dev` merge cleanly
  with `git merge-tree --write-tree`.
