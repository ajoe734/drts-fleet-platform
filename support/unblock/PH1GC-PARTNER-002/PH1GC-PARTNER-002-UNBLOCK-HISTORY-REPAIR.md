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

The actual contamination is not that the PH1GC row disappeared. Current
canonical machine truth still carries `PH1GC-PARTNER-002 status=blocked` while
also carrying the older canonical `PRT-SPEC-001` / `PARTNER-ELIG-LIVE-001`
held lineage for the same issuer-sandbox evidence lane.

That leaves the repo with two task families pointing at one sidecar path and
one blocker story, but different branch families own the commits. The result is
branch/worktree/replay ambiguity, not a missing issuer-sandbox plan.

## Evidence

### 1. Historical PH1GC row existed, and the alias row still exists today

Historical `ai-status.json` still contained the PH1GC parent on:

- `26df6fd7` (`PH1GC-DISPATCH-001`)
- `59bae1c9` (`PH1GC-DISPATCH-002`)

At `59bae1c9`, the parent state was already:

- `PH1GC-PARTNER-001 status=review_approved`
- `PH1GC-PARTNER-002 status=blocked`
- parent `next = "BLOCKED EXTERNAL: ... issuer / bank sandbox credentials + allowed test cards required ..."`

Current canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
still records:

- `PH1GC-PARTNER-001 status=done`, closeout commit `68b13f1b`, push branch
  `origin/codex2/ph1gc-partner-001`
- `PH1GC-PARTNER-002 status=blocked`, with `next` already stating that
  `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md` was
  restored by `a8b2b3ad` on `origin/codex/ph1gc-partner-002`, and that the
  remaining blockers are `EXT-001-BLK-001` through `EXT-001-BLK-006`

So the PH1GC lineage was not removed from machine truth. It still exists as a
live gap-closure alias row.

### 2. Canonical PARTNER-ELIG lineage exists in parallel

Current canonical root records:

- `PRT-SPEC-001 status=done`, closeout commit `bea9ffe`, push branch
  `origin/codex2/prt-spec-001`
- `PARTNER-ELIG-LIVE-001 status=done`, closeout commit `0f33fae`, push branch
  `origin/codex/partner-elig-live-001`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK status=done`, closeout commit
  `130e3f7f`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION status=done`, closeout
  commit `a30be45`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR status=done`, closeout commit
  `fc2b9bf`

`PARTNER-ELIG-LIVE-001.next` already says that if current `dev` needs the
sidecar path before issuer inputs arrive, replay `a8b2b3ad` from
`origin/codex/ph1gc-partner-002` onto a fresh canonical branch; otherwise stay
externally gated on `EXT-001-BLK-001` through `EXT-001-BLK-006`.

So canonical machine truth currently carries both:

- the live `PH1GC-PARTNER-002` alias row for the current dev-based sidecar
  commit
- the older `PARTNER-ELIG-LIVE-001` held lineage that describes how that same
  commit should be replayed

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
separate lane names. The parent alias still has a live task row, but its
current-dev sidecar commit is not yet represented by a normal replay PR.

### 5. `origin/dev` still lacks the sidecar path

On this repair branch, which starts at `origin/dev`, the canonical sidecar file
is absent:

- `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`

So the branch ambiguity is not theoretical: the repo trunk still does not have
the sidecar path that the canonical parent and PH1GC alias both reference.

## Exact Contamination

The contamination is a five-part mismatch:

1. Machine truth tracks the same issuer-sandbox evidence lane twice:
   `PH1GC-PARTNER-002` as a live blocked gap-closure alias, and
   `PARTNER-ELIG-LIVE-001` as a done/HELD canonical lineage.
2. The alias row points at current-dev-based sidecar commit `a8b2b3ad`, while
   the two canonical partner-elig branches remain 43 commits behind
   `origin/dev`.
3. `PARTNER-ELIG-LIVE-001.next` already depends on replaying `a8b2b3ad` if the
   sidecar path is needed on trunk, but that replay has not landed, so
   `origin/dev` still lacks the sidecar path that both rows reference.
4. The PH1GC helper branches are split across multiple owners, worktrees, and
   bases, and only the planning helper currently has a PR.
5. Without an explicit replay target, future issuer evidence can be attached to
   the wrong branch family even though both task families describe the same
   external blocker set.

This keeps the parent blocked in practice because the repo has a live alias row
and a canonical held row, but no single merged current-dev branch carrying the
sidecar path they both rely on.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any published branch.

Repair by aligning the live PH1GC alias row and the canonical PARTNER-ELIG held
lineage around the same additive replay target.

1. Keep current machine truth as-is. Do not delete, resurrect, or rewrite task
   rows during repair:
   - `PH1GC-PARTNER-002` stays the live blocked alias row for the current
     gap-closure dispatch.
   - `PARTNER-ELIG-LIVE-001` stays the canonical held lineage that already
     names the same external blockers and replay instruction.
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
5. Keep both task families aligned on one blocker story:
   - product semantics are already covered by `PRT-SPEC-001` and PR `#251`
   - `PH1GC-PARTNER-002` stays blocked until real issuer inputs satisfy
     `EXT-001-BLK-001` through `EXT-001-BLK-006`
   - future redacted evidence still belongs under
     `support/sidecars/PARTNER-ELIG-LIVE-001/`

## Parent Next Step

The concrete next step for the live alias row and its canonical held
counterpart is:

1. If the repo needs the reserved sidecar path on current `dev`, replay
   `a8b2b3ad` onto a fresh canonical parent branch with a normal PR.
2. Otherwise keep `PH1GC-PARTNER-002` blocked and `PARTNER-ELIG-LIVE-001`
   externally gated on `EXT-001-BLK-001` through `EXT-001-BLK-006`, attach
   redacted evidence under `support/sidecars/PARTNER-ELIG-LIVE-001/`, and rerun
   the live issuer proof from that shared sidecar path.

That unblocks the history question without reopening any settled spec or
planning work, and without pretending the live PH1GC alias row disappeared.

## Why This Is Safe

- no shared branch is force-pushed
- no old closeout branch is rewritten
- no existing task row is deleted or recreated
- the current-dev-based sidecar diff is replayed additively
- the live alias row and canonical held lineage stay aligned on one blocker story
- older PH1GC and canonical branches stay available for audit

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- inspected historical and current task state:
  - `git show 26df6fd7:ai-status.json`
  - `git show 59bae1c9:ai-status.json`
  - `sed -n '18247,18285p' /home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `sed -n '19981,20110p' /home/edna/workspace/drts-fleet-platform/ai-status.json`
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
