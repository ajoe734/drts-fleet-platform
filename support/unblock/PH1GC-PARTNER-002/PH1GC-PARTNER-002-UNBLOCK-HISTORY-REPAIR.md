# PH1GC-PARTNER-002 Unblock History Repair

## Scope

- Task: `PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR`
- Dispatch parent: `PH1GC-PARTNER-002`
- Canonical parent lineage: `PARTNER-ELIG-LIVE-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-22`

## Diagnosis

`PH1GC-PARTNER-002` is not blocked by a missing product decision.

The actual contamination is that the original PH1GC dispatch parent existed in
historical machine truth, was later replaced by the canonical
`PRT-SPEC-001` / `PARTNER-ELIG-LIVE-001` chain, and then received new branch
activity after the dispatch row had already disappeared from canonical
`ai-status.json`.

That leaves the repo with valid task-scoped commits but no single live parent
row for the PH1GC alias. The result is branch/worktree ambiguity, not a missing
issuer-sandbox plan.

## Evidence

### 1. Historical task row existed, current canonical row does not

Historical `ai-status.json` still contained the PH1GC parent on:

- `26df6fd7` (`PH1GC-DISPATCH-001`)
- `59bae1c9` (`PH1GC-DISPATCH-002`)

At `59bae1c9`, the parent state was already:

- `PH1GC-PARTNER-001 status=review_approved`
- `PH1GC-PARTNER-002 status=blocked`
- parent `next = "BLOCKED EXTERNAL: ... issuer / bank sandbox credentials + allowed test cards required ..."`

Current canonical machine truth no longer contains `PH1GC-PARTNER-001` or
`PH1GC-PARTNER-002`. `REL-SYNC-001` replaced that dispatch lineage with the
canonical tasks:

- `PRT-SPEC-001`
- `PARTNER-ELIG-LIVE-001`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR`

### 2. Canonical parent is closed on a different lineage

Current canonical root records:

- `PRT-SPEC-001 status=done`, closeout commit `bea9ffe`, push branch
  `origin/codex2/prt-spec-001`
- `PARTNER-ELIG-LIVE-001 status=done`, closeout commit `5213efc`, push branch
  `origin/codex2/partner-elig-live-001`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK status=done`, closeout commit
  `8d5c47c`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION status=done`, closeout
  commit `a30be45`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR status=done`, closeout commit
  `fc2b9bf`

This means the real parent task already has a canonical machine-truth chain.
The PH1GC lineage is now an alias, not a second parent.

### 3. The same sidecar path diverged across three unmerged branches

The canonical sidecar path
`support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md` is not
reachable from `origin/dev`, but it exists on three different remote branches:

- `origin/codex2/partner-elig-live-001 @ 5213efc416a5fae4bd1b72e49ac9987c88983b3a`
  - `git rev-list --left-right --count origin/dev...origin/codex2/partner-elig-live-001`
    = `43 2`
  - no PR exists for head `codex2/partner-elig-live-001`
- `origin/codex/partner-elig-live-001 @ 0f33fae0eef522b92f91ff7cb79d3fce332e38d6`
  - `git rev-list --left-right --count origin/dev...origin/codex/partner-elig-live-001`
    = `43 3`
- `origin/codex/ph1gc-partner-002 @ a8b2b3ad020e1a0e8bf6859eed325427ade8d59e`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002`
    = `0 1`
  - no PR exists for head `codex/ph1gc-partner-002`

The PH1GC branch is the only current-dev-based branch carrying the sidecar path.
The two older canonical parent branches both sit 43 commits behind `origin/dev`.

### 4. PH1GC helper branches are split across multiple worktrees and bases

Related PH1GC helper branches currently present:

- `origin/codex/ph1gc-partner-002-unblock-planning-decision @ 67de513269b716ccc02303b1311cfde5aeb69f1b`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-planning-decision`
    = `0 1`
  - PR `#251`: <https://github.com/ajoe734/drts-fleet-platform/pull/251>
- `origin/codex/ph1gc-partner-002-unblock-manual-unblock @ a92b2983948122980bb076fae09a72cbcd358609`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-manual-unblock`
    = `6 2`
  - no PR exists for head `codex/ph1gc-partner-002-unblock-manual-unblock`
- `origin/codex2/ph1gc-partner-002-unblock-manual-unblock @ 8593a6ca78b811dd5936d02def2f6213d2dc28b3`
  - separate closeout lineage for the same dispatch alias

The planning helper already has a normal PR. The manual helper exists on two
separate lane names. The parent alias still has no PR and no live task row of
its own.

### 5. `origin/dev` still lacks the sidecar path

On this repair branch, which starts at `origin/dev`, the canonical sidecar file
is absent:

- `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`

So the branch ambiguity is not theoretical: the repo trunk still does not have
the sidecar path that the canonical parent and PH1GC alias both reference.

## Exact Contamination

The contamination is a four-part mismatch:

1. `PH1GC-PARTNER-002` previously existed as a real task row, but canonical
   machine truth removed that row and continued under `PARTNER-ELIG-LIVE-001`.
2. After that removal, new `PH1GC-PARTNER-002*` branches were still created and
   pushed, so the alias lineage kept evolving without a canonical dispatch
   parent to hand off or close.
3. The same sidecar path now exists on three different unmerged branch families
   with different owners, bases, and closeout messages.
4. The only current-dev-based copy of the sidecar is the PH1GC alias branch,
   while the canonical parent branches that machine truth cites are both 43
   commits behind trunk.

This keeps the old parent "blocked" in practice because there is no single
normal-PR replay target recorded for the alias lineage, even though the product
semantics and external blocker story are already settled.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any published branch.

Repair by treating the PH1GC lineage as an audit alias and replaying only the
current-dev-based sidecar commit onto the canonical task chain when needed.

1. Keep canonical machine truth on the `PARTNER-ELIG-LIVE-001` lineage.
   Do not resurrect `PH1GC-PARTNER-002` as a second authoritative parent.
2. Treat `origin/codex/ph1gc-partner-002 @ a8b2b3ad` as the source commit for
   the missing sidecar path on current `dev`, because it is the only pushed
   branch that:
   - contains the sidecar file
   - is based directly on current `origin/dev`
   - avoids replaying a 43-commit-old parent branch
3. If the repo needs the sidecar path on trunk, replay `a8b2b3ad` onto a fresh
   branch owned under the canonical parent workflow, using a normal additive
   change:

```bash
git fetch origin
git switch -c codex2/partner-elig-live-001-replay origin/dev
git cherry-pick a8b2b3ad020e1a0e8bf6859eed325427ade8d59e
git push -u origin codex2/partner-elig-live-001-replay
gh pr create --base dev --head codex2/partner-elig-live-001-replay \
  --title "PARTNER-ELIG-LIVE-001: replay current-dev sidecar path" \
  --body "Replays PH1GC-PARTNER-002 sidecar commit a8b2b3ad onto current dev without rewriting older partner lineage branches."
```

4. Leave these branches intact as audit history; do not merge them directly and
   do not rewrite them:
   - `origin/codex2/partner-elig-live-001`
   - `origin/codex/partner-elig-live-001`
   - `origin/codex/ph1gc-partner-002`
   - `origin/codex/ph1gc-partner-002-unblock-manual-unblock`
   - `origin/codex2/ph1gc-partner-002-unblock-manual-unblock`
5. Keep the planning scope cut and external-gate story on the canonical chain:
   - product semantics are already covered by `PRT-SPEC-001` and PR `#251`
   - remaining blockers stay `EXT-001-BLK-001` through `EXT-001-BLK-006`

## Parent Next Step

The concrete next step for the canonical parent is:

1. If the repo needs the reserved sidecar path on current `dev`, replay
   `a8b2b3ad` onto a fresh canonical parent branch with a normal PR.
2. Otherwise keep the parent on the existing external-gated hold sequence:
   wait for `EXT-001-BLK-001` through `EXT-001-BLK-006`, attach redacted
   evidence under `support/sidecars/PARTNER-ELIG-LIVE-001/`, and rerun the live
   issuer proof from the canonical `PARTNER-ELIG-LIVE-001` lineage.

That unblocks the history question without reopening any settled spec or
planning work.

## Why This Is Safe

- no shared branch is force-pushed
- no old closeout branch is rewritten
- the current-dev-based sidecar diff is replayed additively
- the canonical parent remains unique in machine truth
- older PH1GC and canonical branches stay available for audit

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- inspected historical and current task state:
  - `git show 26df6fd7:ai-status.json`
  - `git show 59bae1c9:ai-status.json`
  - current canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- inspected branch/worktree state:
  - `git branch -vv | grep 'ph1gc-partner-002\\|partner-elig-live-001'`
  - `git worktree list --porcelain`
  - `git branch -r --contains 5213efc4`
  - `git branch -r --contains 0f33fae0`
  - `git branch -r --contains a8b2b3ad`
- inspected reachability:
  - `git rev-list --left-right --count origin/dev...origin/codex2/partner-elig-live-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/partner-elig-live-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-manual-unblock`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-planning-decision`
- inspected PR state:
  - `gh pr list --state all --head codex/ph1gc-partner-002`
  - `gh pr list --state all --head codex/ph1gc-partner-002-unblock-manual-unblock`
  - `gh pr list --state all --head codex/ph1gc-partner-002-unblock-planning-decision`
  - `gh pr list --state all --head codex2/partner-elig-live-001`

No runtime or sandbox tests were run. This task is a docs/status/history audit
only.
