# P2-NFR-001 Unblock History Repair

## Scope

- Task: `P2-NFR-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-NFR-001`
- Owner closeout branch: `codex2/p2-nfr-001-unblock-history-repair`
- Reviewer-approved diagnostic source:
  `codex/p2-nfr-001-unblock-history-repair @ 5a9192e3ac9a7c8b11e0bc56aa232ec433367b0c`
- Closeout audit timestamp: `2026-06-26T01:39:00Z`

This packet records the already approved diagnosis on the owner closeout branch
so the unblock task can be finalized without rewriting shared history.

## Diagnosis

`P2-NFR-001` is blocked by shared-branch history divergence, not by missing
Phase2 AV infra content.

1. The only pushed owner branch is `origin/codex2/p2-nfr-001 @ d6e009ace731`.
   That branch contains the accepted closeout tree and already has a normal
   non-force push on the shared remote.
2. After that push, the local owner branch `codex2/p2-nfr-001` was rebased onto
   the newer `origin/dev @ e723d0f2c37c`. The reflog shows:
   `rebase (finish): refs/heads/codex2/p2-nfr-001 onto e723d0f2c37c...`
3. The rebase rewrote all six task commits, producing a new local tip
   `1ef1ef8a20b5` with the same commit subjects but different commit ids. A
   normal push back to `origin/codex2/p2-nfr-001` would therefore require force
   because the upstream still points at the pre-rebase tip `d6e009ace731`.
4. `git range-diff a00a3bbd7..origin/codex2/p2-nfr-001 e723d0f2c..codex2/p2-nfr-001`
   shows all six patches as `=`. The branch content did not drift; only the
   ancestry changed.
5. A second local alias, `codex/p2-nfr-001 @ 3a9a374d1f06`, still points at the
   pre-rebase anchor lineage and tracks `origin/dev`, which adds branch-name
   noise but is not the blocker by itself.
6. `git worktree list --porcelain` shows no active local worktree attached to
   `codex2/p2-nfr-001` in this clone. The contamination is in refs/history, not
   in an uncommitted parent worktree.

## Evidence

### Branch and commit state

- `origin/dev @ e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `origin/codex2/p2-nfr-001 @ d6e009ace731acb6cc451223dfb710cf59bce464`
- local `codex2/p2-nfr-001 @ 1ef1ef8a20b5b4b945324b923c21b72baba2a946`
- local `codex/p2-nfr-001 @ 3a9a374d1f06d6da7619ab5e1cb168691ee9864c`
- helper branch
  `codex/p2-nfr-001-unblock-history-repair @ 5a9192e3ac9a7c8b11e0bc56aa232ec433367b0c`
- closeout branch
  `codex2/p2-nfr-001-unblock-history-repair @ e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `git branch -vv --list codex2/p2-nfr-001 codex/p2-nfr-001` reports:
  - `codex2/p2-nfr-001 [origin/codex2/p2-nfr-001: ahead 8, behind 6]`
  - `codex/p2-nfr-001 [origin/dev: ahead 5, behind 2]`
- `git rev-list --left-right --count origin/codex2/p2-nfr-001...codex2/p2-nfr-001`
  returns `6 8`
- `git merge-base origin/dev origin/codex2/p2-nfr-001`
  returns `a00a3bbd7cee08b0146b3998dc745bfe58386bb9`
- `git merge-base origin/dev codex2/p2-nfr-001`
  returns `e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `git merge-base origin/codex2/p2-nfr-001 codex2/p2-nfr-001`
  returns `a00a3bbd7cee08b0146b3998dc745bfe58386bb9`
- `git show --no-patch --pretty=raw d6e009ace 1ef1ef8a2` confirms:
  - remote closeout parent = `3a9a374d1f06...`
  - local rebased closeout parent = `c3c9575bfc95...`
- `git reflog show codex2/p2-nfr-001` confirms the branch was created from
  `origin/dev` at `a00a3bbd7` and later rebased onto `e723d0f2c`

### Patch-equivalence evidence

- `git range-diff a00a3bbd7..origin/codex2/p2-nfr-001 e723d0f2c..codex2/p2-nfr-001`
  shows all six task commits as patch-equivalent (`=`), including:
  - remote `d6e009ace` = local `1ef1ef8a2`
  - remote `3a9a374d1` = local `c3c9575bf`
- `git rev-parse d6e009ace^{tree} 3a9a374d1^{tree}` returns the same tree id:
  `bad02b78e3f974a43da5d2dbce11894ac333b24b`
- `git rev-parse 1ef1ef8a2^{tree} c3c9575bf^{tree}` returns the same tree id:
  `7ac1c6bc4a77f26d93dc8d02fd789aa0686a5dde`

### PR and mergeability state

- `git ls-remote --heads origin 'refs/heads/*p2-nfr-001*'` returns only:
  `origin/codex2/p2-nfr-001 @ d6e009ace731`
- `gh pr list --head codex2/p2-nfr-001 --json ...` returns `[]`
- `gh pr list --search 'd6e009ace' --json ...` returns `[]`
- `git merge-tree $(git merge-base origin/dev origin/codex2/p2-nfr-001) origin/dev origin/codex2/p2-nfr-001`
  produces no conflict markers, so the pushed remote branch is mergeable onto
  current `dev` without first rewriting history

### Residual content note

- `git diff --check origin/dev...origin/codex2/p2-nfr-001` reports trailing
  whitespace in
  `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md`. That is an
  existing parent-branch content issue, not a history-repair issue.

## Exact Contamination

The exact contamination is a two-layer ref/history split:

1. `origin/codex2/p2-nfr-001` is the shared branch with the pushed closeout
   commit `d6e009ace`, based on `a00a3bbd7`.
2. local `codex2/p2-nfr-001` was later rebased onto the newer
   `origin/dev @ e723d0f2c`, rewriting the entire task lineage to
   `e6ab4c0c4 -> ... -> 1ef1ef8a2`.

That left the owner with two incompatible histories for the same logical task:
the audit-safe pushed remote history and a newer local-only rebased history. The
content is equivalent, but updating the shared branch in place would need a
force-push, which is forbidden here.

The extra local alias `codex/p2-nfr-001 @ 3a9a374d1` reinforces the ambiguity by
keeping the pre-rebase anchor visible under a second branch name, but it does
not need repair to unblock the parent.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Freeze `origin/codex2/p2-nfr-001 @ d6e009ace731` as the canonical shared
   parent branch. It already carries the accepted closeout commit and has a
   normal pushed remote ref.
2. Treat local `codex2/p2-nfr-001 @ 1ef1ef8a2` as a private rebased replay only.
   Do not push it over `origin/codex2/p2-nfr-001`.
3. Resume the parent from the already-pushed remote branch by opening a PR from
   `codex2/p2-nfr-001` to `dev`:

```bash
gh pr create \
  --base dev \
  --head codex2/p2-nfr-001 \
  --title "P2-NFR-001: phase2 av infra and DR runbook" \
  --body "Uses existing pushed closeout branch origin/codex2/p2-nfr-001 @ d6e009ace731. Local rebased codex2/p2-nfr-001 @ 1ef1ef8a2 is patch-equivalent but intentionally not force-pushed."
```

4. If the owner explicitly wants the rebased ancestry on the remote, push that
   lineage under a fresh branch name instead of rewriting the shared branch:

```bash
git branch codex2/p2-nfr-001-rebased-20260626 codex2/p2-nfr-001
git push -u origin codex2/p2-nfr-001-rebased-20260626
```

5. After PR creation, the parent owner `Codex2` should rerun handoff on the
   canonical PR branch:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff P2-NFR-001 Codex \
  "Resume review on pushed branch origin/codex2/p2-nfr-001 @ d6e009ace731acb6cc451223dfb710cf59bce464. Local rebased codex2/p2-nfr-001 @ 1ef1ef8a2 is patch-equivalent but must not overwrite the shared branch; open PR from codex2/p2-nfr-001 -> dev."
```

6. Reviewer `Codex` then reviews the PR on the pushed shared branch. If someone
   prefers the rebased branch for aesthetics, review can happen on the newly
   named replay branch instead, but the shared branch must remain untouched.

## Concrete Parent Next Step

`P2-NFR-001` should stop trying to reconcile the rebased local branch back onto
`origin/codex2/p2-nfr-001`.

Concrete next step:

1. Use the existing pushed branch
   `origin/codex2/p2-nfr-001 @ d6e009ace731acb6cc451223dfb710cf59bce464` as the
   canonical rail.
2. Open a PR from `codex2/p2-nfr-001` to `dev`.
3. Rerun `scripts/ai-status.sh handoff P2-NFR-001 Codex ...` pointing at that
   pushed branch and explicitly stating that local `1ef1ef8a2` must not be
   force-pushed.
4. Only if a dev-current replay branch is still desired, publish it under a new
   branch name and review that new PR instead of rewriting the shared one.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The pushed closeout branch remains available for audit.
- The rebased local lineage remains usable under a new branch name if needed.
- Current `dev` mergeability was checked before recommending the existing remote
  branch as the primary path.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `.orchestrator/skills/task-closeout-finalization.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-NFR-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-NFR-001`
- Inspected branch/worktree state:
  - `git status --short`
  - `git status -sb`
  - `git branch --show-current`
  - `git branch -a --list '*p2-nfr-001*'`
  - `git log --all --decorate --oneline --grep='P2-NFR-001' -n 50`
  - `git show --stat --summary 5a9192e3a`
  - `git show 5a9192e3a:support/unblock/P2-NFR-001/P2-NFR-001-UNBLOCK-HISTORY-REPAIR.md`
  - `git remote -v`
  - `git ls-remote --heads origin 'codex2/p2-nfr-001-unblock-history-repair'`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
