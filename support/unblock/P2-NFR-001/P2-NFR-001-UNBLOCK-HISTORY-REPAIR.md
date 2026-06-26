# P2-NFR-001 Unblock History Repair

## Scope

- Task: `P2-NFR-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-NFR-001`
- Parent owner at audit time: `Codex`
- Parent reviewer at audit time: `Codex2`
- Helper branch: `codex2/p2-nfr-001-unblock-history-repair`
- Helper remote ref before this refresh:
  `origin/codex2/p2-nfr-001-unblock-history-repair @ 78078bb723c056b95488212ab52ac2bb172057b3`
- Prior diagnostic source:
  `codex/p2-nfr-001-unblock-history-repair @ 5a9192e3ac9a7c8b11e0bc56aa232ec433367b0c`
- Live-ref audit timestamp: `2026-06-26T02:03:21Z`

This refresh replaces the stale assumption that shared branch
`origin/codex2/p2-nfr-001` still pointed at `d6e009ace731acb6cc451223dfb710cf59bce464`.
After `git fetch origin --prune`, the live shared ref is
`aa8bc533992682a91b50053bdb014fc9e11ed67e`.

## Diagnosis

`P2-NFR-001` is blocked by stale branch-history routing, not by missing Phase 2
AV infra content.

1. The old approved closeout commit `d6e009ace731acb6cc451223dfb710cf59bce464`
   still exists locally, but it is no longer the shared remote tip.
2. The current shared branch is now
   `origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e`,
   based directly on current `origin/dev @ 054ca4f5de255d0f366b359727c918edb06f413e`.
3. The local owner replay branch still points at
   `codex2/p2-nfr-001 @ 1ef1ef8a20b5b4b945324b923c21b72baba2a946`, which is a
   six-commit replay rooted on the older `dev` commit
   `e723d0f2c37c4336da5ddc4769813582af9a28d5`.
4. `git merge-base --is-ancestor d6e009ace731acb6cc451223dfb710cf59bce464 origin/codex2/p2-nfr-001`
   fails, so every repair step that treats `d6e009ace` as the live shared-branch
   anchor is wrong.
5. The six canonical P2-NFR-001 artifact blobs on `aa8bc533` are byte-identical
   to the six blobs on `d6e009ace`, so the content review can be preserved even
   though the ancestry narrative cannot.
6. The extra local alias `codex/p2-nfr-001 @ 3a9a374d1f06d6da7619ab5e1cb168691ee9864c`
   keeps older history visible and adds naming noise, but it is not the direct
   blocker.

## Evidence

### Branch and commit state

- `origin/dev @ 054ca4f5de255d0f366b359727c918edb06f413e`
- `origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e`
- local `codex2/p2-nfr-001 @ 1ef1ef8a20b5b4b945324b923c21b72baba2a946`
- local `codex/p2-nfr-001 @ 3a9a374d1f06d6da7619ab5e1cb168691ee9864c`
- helper branch
  `codex2/p2-nfr-001-unblock-history-repair @ 78078bb723c056b95488212ab52ac2bb172057b3`
- historical closeout commit
  `d6e009ace731acb6cc451223dfb710cf59bce464`
- `git branch -vv --list ...` reports:
  - `codex2/p2-nfr-001 [origin/codex2/p2-nfr-001: ahead 6, behind 3]`
  - `codex/p2-nfr-001 [origin/dev: ahead 5, behind 4]`
- `git rev-list --left-right --count origin/codex2/p2-nfr-001...codex2/p2-nfr-001`
  returns `3 6`
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-nfr-001`
  returns `0 1`
- `git rev-list --left-right --count e723d0f2c37c4336da5ddc4769813582af9a28d5...codex2/p2-nfr-001`
  returns `0 6`
- `git merge-base origin/dev origin/codex2/p2-nfr-001`
  returns `054ca4f5de255d0f366b359727c918edb06f413e`
- `git merge-base origin/dev codex2/p2-nfr-001`
  returns `e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `git merge-base origin/codex2/p2-nfr-001 codex2/p2-nfr-001`
  returns `e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `git show --no-patch --pretty=raw aa8bc533 1ef1ef8a2` confirms:
  - shared branch parent = `054ca4f5de25...`
  - local replay closeout parent = `c3c9575bfc95...`

### Shared-branch contamination proof

- `git merge-base --is-ancestor d6e009ace731acb6cc451223dfb710cf59bce464 origin/codex2/p2-nfr-001`
  exits with status `1`
- `git show --no-patch --pretty=raw aa8bc533` shows the current shared branch
  is a single commit on top of `origin/dev`, not the old six-commit replay
  lineage
- `git range-diff d6e009ace..origin/codex2/p2-nfr-001 d6e009ace..codex2/p2-nfr-001`
  shows:
  - `aa8bc5339 ! e6ab4c0c4` for the logical P2-NFR-001 payload
  - extra local-only replay commits
    `f431c6f44`, `573ca3dac`, `145365802`, `c3c9575bf`, `1ef1ef8a2`
- `git diff-tree --no-commit-id --name-only -r aa8bc533`
  lists the six canonical task files only:
  - `apps/api/src/config/index.ts`
  - `apps/api/src/config/phase2-av-infra-config.ts`
  - `apps/api/tests/unit/phase2-av-infra-config.test.ts`
  - `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md`
  - `infra/gcp/phase2/README.md`
  - `infra/gcp/phase2/av-sandbox-infra-config.json`

### Blob-equivalence evidence

The six task-scoped blobs on `d6e009ace` and `aa8bc5339` are identical:

- `apps/api/src/config/index.ts`
  - `d6 = 34b6f26097751df65ff851c943b57580634a402f`
  - `aa8 = 34b6f26097751df65ff851c943b57580634a402f`
- `apps/api/src/config/phase2-av-infra-config.ts`
  - `d6 = 890c5fd1366e50ba7ca1e62b6c8000e99878d009`
  - `aa8 = 890c5fd1366e50ba7ca1e62b6c8000e99878d009`
- `apps/api/tests/unit/phase2-av-infra-config.test.ts`
  - `d6 = 8fb8e857954b7db078d0ffc2c6dacac9c099aed9`
  - `aa8 = 8fb8e857954b7db078d0ffc2c6dacac9c099aed9`
- `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md`
  - `d6 = 3459965050e7fbd3798d641d5177eaf1b5f1ef38`
  - `aa8 = 3459965050e7fbd3798d641d5177eaf1b5f1ef38`
- `infra/gcp/phase2/README.md`
  - `d6 = d1c1fba7b7c040ca2ee14c29fc7610f42476bc32`
  - `aa8 = d1c1fba7b7c040ca2ee14c29fc7610f42476bc32`
- `infra/gcp/phase2/av-sandbox-infra-config.json`
  - `d6 = 5cf842895ffa7c7fe7405cca5b3812080c3ddbc8`
  - `aa8 = 5cf842895ffa7c7fe7405cca5b3812080c3ddbc8`

### PR and mergeability state

- `gh pr list --head codex2/p2-nfr-001 ...` returns `[]`
- `gh pr list --head codex2/p2-nfr-001-unblock-history-repair ...` returns `[]`
- `git merge-tree $(git merge-base origin/dev origin/codex2/p2-nfr-001) origin/dev origin/codex2/p2-nfr-001`
  produces no conflict markers

## Exact Contamination

The exact contamination is now a three-layer history split:

1. The old approved repair packet still treats
   `d6e009ace731acb6cc451223dfb710cf59bce464` as the live shared branch tip,
   but that commit is no longer on the current shared-branch ancestry.
2. The actual shared branch is
   `origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e`,
   a new single-commit replay on top of current `origin/dev`.
3. The local branch `codex2/p2-nfr-001 @ 1ef1ef8a20b5...` still holds the older
   six-commit replay on top of `e723d0f2c37c...`.

That leaves one logical task with two viable non-destructive rails and one stale
diagnostic packet:

- audit-only historical closeout commit `d6e009ace`
- live shared review rail `aa8bc533`
- local-only replay rail `1ef1ef8a2`

The parent is blocked because its unblock narrative still points at the wrong
shared-branch state, not because the task payload disappeared.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Freeze `origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e`
   as the current canonical parent branch.
2. Treat `d6e009ace731acb6cc451223dfb710cf59bce464` as historical audit evidence
   only. It can still be cited to preserve prior content review because all six
   task blobs match `aa8bc533`.
3. Treat local `codex2/p2-nfr-001 @ 1ef1ef8a2` as a private replay only. Do not
   push it over `origin/codex2/p2-nfr-001`.
4. Resume the parent on the live shared branch by opening a PR from
   `codex2/p2-nfr-001` to `dev`:

```bash
gh pr create \
  --base dev \
  --head codex2/p2-nfr-001 \
  --title "P2-NFR-001: phase2 AV infra config + DR runbook" \
  --body "Use the existing pushed branch origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e. Historical closeout d6e009ace and local replay 1ef1ef8a remain audit/reference only; no force-push."
```

5. After PR creation, parent owner `Codex` should rerun handoff on the live
   shared branch:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-NFR-001 Codex2 \
  "Resume review on pushed branch origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e. Historical d6e009ace carries identical six-file payload, but the live shared branch has advanced; do not push local replay codex2/p2-nfr-001 @ 1ef1ef8a2 over the shared ref. Open/review PR codex2/p2-nfr-001 -> dev."
```

6. Reviewer `Codex2` then reviews the PR on `aa8bc533`. No new content review is
   required unless the PR diff differs from the six-file payload already audited.
7. Only if someone explicitly wants the older six-commit replay ancestry
   published, push it under a fresh branch name instead of rewriting the shared
   branch:

```bash
git branch codex2/p2-nfr-001-replay-e723 codex2/p2-nfr-001
git push -u origin codex2/p2-nfr-001-replay-e723
```

## Concrete Parent Next Step

`P2-NFR-001` should stop using the stale assumption that shared branch
`codex2/p2-nfr-001` still equals `d6e009ace`.

Concrete next step:

1. Use `origin/codex2/p2-nfr-001 @ aa8bc533992682a91b50053bdb014fc9e11ed67e`
   as the canonical review rail.
2. Open a PR from `codex2/p2-nfr-001` to `dev`.
3. Owner `Codex` reruns `scripts/ai-status.sh handoff P2-NFR-001 Codex2 ...`
   with the exact `aa8bc533` branch reference and the explicit instruction not
   to overwrite the shared ref with local replay `1ef1ef8a2`.
4. Reviewer `Codex2` resumes review on that PR.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The live shared branch already sits cleanly on current `origin/dev`.
- The historical closeout commit remains available for audit.
- The six-file task payload is identical between `d6e009ace` and `aa8bc533`,
  so prior content review can be reused without preserving the stale ancestry
  story.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `.orchestrator/skills/task-closeout-finalization.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-NFR-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-NFR-001`
- Refreshed live refs:
  - `git fetch origin --prune`
- Inspected branch/commit state:
  - `git branch --show-current`
  - `git branch -vv --list 'codex2/p2-nfr-001' 'codex/p2-nfr-001' 'codex2/p2-nfr-001-unblock-history-repair' 'codex/p2-nfr-001-unblock-history-repair'`
  - `git rev-parse origin/dev origin/codex2/p2-nfr-001 codex2/p2-nfr-001`
  - `git rev-list --left-right --count origin/codex2/p2-nfr-001...codex2/p2-nfr-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/p2-nfr-001`
  - `git rev-list --left-right --count e723d0f2c37c4336da5ddc4769813582af9a28d5...codex2/p2-nfr-001`
  - `git merge-base origin/dev origin/codex2/p2-nfr-001`
  - `git merge-base origin/dev codex2/p2-nfr-001`
  - `git merge-base origin/codex2/p2-nfr-001 codex2/p2-nfr-001`
  - `git merge-base --is-ancestor d6e009ace731acb6cc451223dfb710cf59bce464 origin/codex2/p2-nfr-001`
  - `git show --no-patch --pretty=raw aa8bc533992682a91b50053bdb014fc9e11ed67e`
  - `git show --no-patch --pretty=raw 1ef1ef8a20b5b4b945324b923c21b72baba2a946`
  - `git range-diff d6e009ace731acb6cc451223dfb710cf59bce464..origin/codex2/p2-nfr-001 d6e009ace731acb6cc451223dfb710cf59bce464..codex2/p2-nfr-001`
  - `git diff-tree --no-commit-id --name-only -r aa8bc533992682a91b50053bdb014fc9e11ed67e`
  - `git rev-parse d6e009ace731acb6cc451223dfb710cf59bce464^{tree} aa8bc533992682a91b50053bdb014fc9e11ed67e^{tree}`
  - `git rev-parse <commit>:<path>` for each of the six task-scoped files on
    `d6e009ace` and `aa8bc533`
- Inspected PR/mergeability state:
  - `gh pr list --head codex2/p2-nfr-001 --json number,title,headRefName,baseRefName,state,url`
  - `gh pr list --head codex2/p2-nfr-001-unblock-history-repair --json number,title,headRefName,baseRefName,state,url`
  - `git merge-tree $(git merge-base origin/dev origin/codex2/p2-nfr-001) origin/dev origin/codex2/p2-nfr-001`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
