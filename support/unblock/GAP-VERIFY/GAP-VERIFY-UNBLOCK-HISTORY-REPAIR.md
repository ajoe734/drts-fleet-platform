# GAP-VERIFY Unblock History Repair

## Scope

- Task: `GAP-VERIFY-UNBLOCK-HISTORY-REPAIR`
- Parent: `GAP-VERIFY`
- Owner: `Codex`
- Reviewer: `Claude2`
- Audit timestamp: `2026-06-06`

## Diagnosis

The original 2026-06-04 history-repair artifact is no longer sufficient.

It correctly captured the first contamination wave, where helper branches were
spawned from stale `origin/dev @ 48ac41ed`. But the live 2026-06-06 state shows
that the unblock path is now blocked by a second, more important split:

1. The parent task machine truth is owned by `Claude2` and the live owner branch
   is `origin/claude2/gap-verify @ 9bc0a53a`.
2. The older `origin/codex/gap-verify @ 00a1121c` still exists and still looks
   like a plausible parent replay branch by name alone, but it is no longer the
   current parent branch.
3. Local worktrees also contain `claude/gap-verify`, `codex/gap-verify`, and
   `gemini2/gap-verify`, so branch-name matching alone is no longer safe.
4. The helper branches from the first unblock wave still exist and still fork
   from stale ancestry or carry helper-only documentation.

The current contamination is therefore not "missing parent history". It is
branch/worktree identity drift: multiple `gap-verify`-named branches now exist,
only one of them matches live machine truth, and the old artifact still points
future work at the wrong canonical branch.

## Exact Contamination

### 1. Canonical parent branch split

- `GAP-VERIFY` machine truth is `owner=Claude2`, `reviewer=Codex`,
  `status=blocked`, last updated `2026-06-06T07:14:34Z`.
- The live owner branch is `origin/claude2/gap-verify @ 9bc0a53a`, not
  `origin/codex/gap-verify`.
- `git merge-base origin/dev origin/claude2/gap-verify` returns
  `aee8a965`, which is the current `origin/dev` tip. This means the parent
  owner branch has already been brought current with dev.
- `git merge-base origin/dev origin/codex/gap-verify` returns `48ac41ed`, so
  the older Codex branch is still rooted at the stale 2026-06-04 base.
- `git rev-list --left-right --count origin/codex/gap-verify...origin/claude2/gap-verify`
  returns `21 left / 15 right`; these refs are not interchangeable resume
  surfaces anymore.

### 2. Local worktree reuse makes branch-name routing unsafe

- `git branch -vv | grep 'gap-verify'` shows:
  - `claude2/gap-verify` tracks `origin/claude2/gap-verify`
  - `codex/gap-verify` tracks `origin/codex/gap-verify`, but the local branch
    is additionally `ahead 2`
  - `claude/gap-verify` exists as a local worktree on unrelated `I18N-DOCS`
    work
  - `gemini2/gap-verify` exists as a local worktree with its own in-flight diff
- Because several lanes now own a local `gap-verify` worktree, "resume from the
  `gap-verify` branch" is ambiguous unless the lane and exact ref are named.

### 3. The old Codex parent branch is stale and partially unpublished

- `origin/codex/gap-verify @ 00a1121c` is still reachable on origin and still
  contains the earlier Codex audit anchors.
- The local `codex/gap-verify` worktree is ahead of that remote by two commits:
  `b92f1955` and `f77badde`.
- Those local-only commits make the stale Codex branch even less reliable as a
  canonical resume target, because "codex/gap-verify" can mean different SHAs
  locally and remotely.

### 4. Helper branches remain helper-only

- `origin/codex/gap-verify-unblock-history-repair @ f07b1834`
- `origin/codex/gap-verify-unblock-planning-decision @ 35c475cc`
- `origin/codex/gap-verify-unblock-manual-unblock @ 401c21af`
- `origin/claude/gap-verify-sidecar-acceptance @ da1d2049`
- `origin/claude/gap-verify-unblock-history-repair-sidecar-acceptance @ 9c1ec0e6`
- `origin/codex/gap-verify-unblock-history-repair-sidecar-acceptance @ 06f0c23f`
- `origin/claude2/gap-verify-unblock-manual-unblock-sidecar-acceptance @ 4dc595ff`

These refs are audit, sidecar, or unblock-helper surfaces only. None should be
used to resume the parent execution branch.

## Evidence

### Parent task and live owner branch

- `AI_NAME=Codex scripts/ai-status.sh show GAP-VERIFY` reports:
  - owner: `Claude2`
  - reviewer: `Codex`
  - status: `blocked`
  - next: merge/deploy `claude2/gap-verify`, then rerun the 39-route audit
- `git rev-parse origin/claude2/gap-verify`:
  `9bc0a53ab1670dd30c4f62241d04e9fcabfa4b79`
- `git rev-parse origin/dev`:
  `aee8a9659a958ec63e85440cf6a9b34824b668dd`
- `git log --oneline --max-count=4 origin/claude2/gap-verify` shows the current
  parent branch carries:
  - `9bc0a53a GAP-VERIFY: refresh dev re-audit (06-06T06:48Z) + bring branch current with dev`
  - `7fc45d97 Merge remote-tracking branch 'origin/dev' into claude2/gap-verify`
  - `6927ad26 GAP-VERIFY: fix /pricing ?tab= sync + harden /vehicles date render (500)`
  - `c40b13e6 GAP-VERIFY: refresh dev gap scoreboard (08:30Z) + isolate 2 real defects`

### Stale Codex branch

- `git rev-parse origin/codex/gap-verify`:
  `00a1121c34aaabc5a7a620bc94f07abcf0eb3a43`
- `git reflog show refs/heads/codex/gap-verify --date=iso` shows only the
  older Codex audit-anchor lineage from 2026-06-04 plus two unpublished local
  commits on 2026-06-05.
- `git branch -vv | grep 'codex/gap-verify'` shows local `codex/gap-verify`
  `[origin/codex/gap-verify: ahead 2]`.

### Helper/artifact branch divergence

- `git rev-list --left-right --count origin/claude2/gap-verify...origin/codex/gap-verify-unblock-history-repair`
  returns `15 left / 5 right`.
- The right side is only the five documentation commits on this task branch:
  - `f07b1834 docs(GAP-VERIFY-UNBLOCK-HISTORY-REPAIR): finalize owner closeout evidence`
  - `4d57ab1f docs(GAP-VERIFY-UNBLOCK-HISTORY-REPAIR): record review correction commit`
  - `a75a7a9d docs(GAP-VERIFY-UNBLOCK-HISTORY-REPAIR): refresh live helper ref evidence`
  - `88e9bbf0 docs(GAP-VERIFY-UNBLOCK-HISTORY-REPAIR): add branch and PR evidence`
  - `2de2eb39 docs(GAP-VERIFY-UNBLOCK-HISTORY-REPAIR): document canonical replay branch`

### PR state

- `gh pr list --state all --search 'gap-verify in:title'` shows:
  - open draft PR `#513` for `codex/gap-verify-unblock-history-repair -> dev`
  - open draft PR `#512` for `codex/gap-verify-unblock-planning-decision -> dev`
  - open draft PR `#542` for `codex/gap-verify-unblock-manual-unblock -> dev`
- There is no separate task PR for `claude2/gap-verify` yet; the parent's own
  machine-truth next step explicitly says merge that branch to `dev`, deploy
  dev, then rerun the live audit.

## Non-Destructive Repair Path

Do not force-push, rename, delete, or rewrite any existing `gap-verify*` refs.

1. Canonicalize the parent replay branch to exactly
   `origin/claude2/gap-verify @ 9bc0a53ab1670dd30c4f62241d04e9fcabfa4b79`.
2. Downgrade `origin/codex/gap-verify @ 00a1121c` to historical audit evidence
   only. It remains useful for provenance, but it is no longer the parent's
   active replay branch.
3. Downgrade every `gap-verify-unblock-*` and `*-sidecar-acceptance` ref to
   helper-only status. Keep them pushed; do not rewrite or collapse them.
4. Require all future resume instructions to name both lane and SHA, not just
   branch stem. For this task family, "resume from `gap-verify`" is now unsafe;
   the safe phrasing is "resume from `origin/claude2/gap-verify @ 9bc0a53a`."
5. Leave the stale refs in place as audit evidence. The repair is control-plane
   and documentary: clarify the single live parent branch and stop routing work
   through the stale branches.

## Concrete Parent Next Step

`GAP-VERIFY` should resume only from:

`origin/claude2/gap-verify @ 9bc0a53ab1670dd30c4f62241d04e9fcabfa4b79`

Everything else in the `gap-verify*` family should be treated as stale parent
history, helper-only evidence, or sidecar review material.

The next concrete unblock step for the parent is:

1. Open or land the integration path from `claude2/gap-verify` into `dev`.
2. Trigger the normal dev deploy for the resulting `dev` head.
3. Re-run the 39-route GAP-VERIFY browser audit against dev.
4. Expect the remaining `/vehicles/veh-demo-001` HTTP 500 and `/pricing` tab
   failure to clear only after that deploy, because the fixes are present on
   `claude2/gap-verify` but are not yet reachable from `origin/dev`.

## Why This Is Safe

- No shared branch is rewritten
- No force-push is required
- Existing helper branches remain available as evidence
- The repair removes routing ambiguity without moving commits across refs
- The parent's next step now matches live machine truth instead of the stale
  2026-06-04 replay branch

## Delivery Evidence

- Task branch:
  `origin/codex/gap-verify-unblock-history-repair`
- Existing task PR:
  `#513 https://github.com/ajoe734/drts-fleet-platform/pull/513`
- Canonical parent branch after this repair:
  `origin/claude2/gap-verify @ 9bc0a53ab1670dd30c4f62241d04e9fcabfa4b79`

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Queried machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show GAP-VERIFY`
  - `AI_NAME=Codex scripts/ai-status.sh show GAP-VERIFY-UNBLOCK-HISTORY-REPAIR`
- Compared live branch/worktree state:
  - `git branch -vv | grep 'gap-verify'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'codex/gap-verify*' 'claude2/gap-verify*' 'claude/gap-verify*'`
  - `git merge-base origin/dev origin/codex/gap-verify`
  - `git merge-base origin/dev origin/claude2/gap-verify`
  - `git rev-list --left-right --count origin/codex/gap-verify...origin/claude2/gap-verify`
  - `git rev-list --left-right --count origin/claude2/gap-verify...origin/codex/gap-verify-unblock-history-repair`
  - `git reflog show refs/heads/codex/gap-verify --date=iso`
  - `git reflog show refs/heads/claude2/gap-verify --date=iso`
  - `git reflog show refs/heads/claude/gap-verify --date=iso`
- Checked PR state:
  - `gh pr list --state all --search 'gap-verify in:title' --json number,title,headRefName,baseRefName,state,isDraft,url`
