# PH1GC-PARTNER-002 Unblock History Repair

## Scope

- Task: `PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR`
- Dispatch parent: `PH1GC-PARTNER-002`
- Canonical parent lineage: `PARTNER-ELIG-LIVE-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-23`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Live parent branch named by canonical machine truth:
  `origin/codex2/ph1gc-partner-002 @ 2ec2868c`
- Older Codex audit branch still present on origin:
  `origin/codex/ph1gc-partner-002 @ c0452396`
- Current history-repair packet branch:
  `origin/codex/ph1gc-partner-002-unblock-history-repair @ 72efe505`
  (draft PR `#253`, `mergeStateStatus=BEHIND`)

## Diagnosis

`PH1GC-PARTNER-002` is still blocked on real issuer sandbox evidence, not on a
missing planning or contract decision.

The exact contamination is no longer "missing sidecar restore." That part was
already repaired by Codex2 as commit `2ec2868c` on
`origin/codex2/ph1gc-partner-002`.

What remains is branch-lineage drift between three PH1GC branch families:

- the live parent branch is now a clean single-commit replay on top of current
  `origin/dev`
- the older Codex PH1GC branch family still carries the same reserved sidecar
  path on a stale pre-`0150cbe4` base
- the task-scoped history packet now cites the correct live Codex2 restore by
  content, but its branch/PR still live on the older Codex lineage and therefore
  still show `mergeStateStatus=BEHIND`

This is branch/base contamination, not a semantic blocker.

## Evidence

### 1. Canonical machine truth names the Codex2 restoration branch

Current canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
records:

- `PH1GC-PARTNER-002 owner=Codex2 reviewer=Codex status=blocked`
- parent `next` says the missing sidecar path
  `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md` was
  restored on branch `codex2/ph1gc-partner-002` at commit `2ec2868c`
- the parent stays blocked on `EXT-001-BLK-001` through `EXT-001-BLK-006`
  because the repo still has no real issuer sandbox credentials, allowed test
  cards, or real sandbox execution logs

So canonical truth already moved the live parent away from the older Codex
branch family.

### 2. The live parent branch is a current-dev replay with one added file

Current live parent branch:

- `origin/codex2/ph1gc-partner-002 @ 2ec2868c253f23a8e7b722049f1deb23328bf9f0`
- `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-partner-002`
  = `0 1`
- `git merge-base --is-ancestor origin/dev origin/codex2/ph1gc-partner-002`
  succeeds
- `gh pr list --state all --head codex2/ph1gc-partner-002` returns no PR

Diff against `origin/dev` for the relevant paths shows only:

- `A support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`

So the live parent branch is already the minimal replay path from current trunk.

### 3. The older Codex PH1GC branch family still exists on a stale base

Older PH1GC branch family still present on origin:

- `origin/codex/ph1gc-partner-002 @ c0452396`
- `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002`
  = `11 2`
- `git merge-base --is-ancestor origin/dev origin/codex/ph1gc-partner-002`
  fails
- its diff still adds:
  - `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
  - `support/sidecars/PARTNER-ELIG-LIVE-001/PH1GC-PARTNER-002-CLOSEOUT-20260522.md`

That older family also still contains the earlier restore commit:

- `a8b2b3ad` (`wip(PH1GC-PARTNER-002): restore hold-state sidecar`)

So the older family remains valid audit history, but it is no longer the live
branch named by canonical machine truth.

### 4. The packet branch is content-aligned but still belongs to the older lineage

Current history-repair packet branch and PR:

- `origin/codex/ph1gc-partner-002-unblock-history-repair @ 72efe505`
- draft PR `#253`
  <https://github.com/ajoe734/drts-fleet-platform/pull/253>
- `gh pr view 253 --json mergeStateStatus` reports `BEHIND`
- `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-history-repair`
  = `11 4`
- `git diff --name-status origin/codex2/ph1gc-partner-002...origin/codex/ph1gc-partner-002-unblock-history-repair`
  shows only:
  - `A support/unblock/PH1GC-PARTNER-002/PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR.md`

So the packet content now correctly points at the live Codex2 restore, but the
packet branch ancestry still belongs to the older Codex PH1GC family. Commit
`8d3de3a8` first realigned the packet to the live restore, and current head
`72efe505` refreshes the lineage evidence against the latest canonical truth.

### 5. `origin/dev` still lacks the reserved sidecar path

For the current live parent branch:

- `git diff --name-status origin/dev...origin/codex2/ph1gc-partner-002 -- support/sidecars/PARTNER-ELIG-LIVE-001`
  shows the sidecar file as added on the branch only

So trunk still does not contain the reserved hold-state sidecar path referenced
by the parent row.

## Exact Contamination

The exact contamination is a four-part lineage mismatch:

1. Canonical machine truth points the live blocked parent at
   `origin/codex2/ph1gc-partner-002 @ 2ec2868c`, which is current
   `origin/dev` plus one replay commit.
2. The older Codex PH1GC branch family still exists on a stale base and carries
   the same reserved sidecar path plus an older closeout note.
3. The task-scoped history packet now narrates the right live commit, but its
   branch and PR still belong to the older Codex lineage and therefore remain
   `BEHIND`.
4. `origin/dev` still lacks the shared sidecar path, so future reviewers could
   still cite the wrong PH1GC family unless the packet explicitly separates
   "live parent branch" from "older audit branch."

This is branch ancestry drift, not a repo-local product blocker.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any published branch.

Repair by keeping the live parent on the Codex2 replay commit, preserving the
older Codex branches as audit history, and using additive replay branches if a
clean current-dev lineage is needed later.

1. Keep machine truth aligned to the current live parent row:
   - `PH1GC-PARTNER-002` stays `blocked`
   - the live branch remains `origin/codex2/ph1gc-partner-002 @ 2ec2868c`
   - the external gate remains `EXT-001-BLK-001` through `EXT-001-BLK-006`
2. Keep the older Codex family intact as audit history; do not rewrite:
   - `origin/codex/ph1gc-partner-002`
   - `origin/codex/ph1gc-partner-002-unblock-history-repair`
3. Treat commits `8d3de3a8` and `72efe505` on PR `#253` as the additive
   packet-alignment chain that now points the packet at the live Codex2
   restoration commit and current machine truth.
4. If maintainers need a mergeable current-dev packet branch, cut a fresh
   dev-based replay branch and cherry-pick only the packet commit instead of
   rebasing or force-pushing the existing published PR branch:

```bash
git fetch origin
git switch -c codex/ph1gc-partner-002-unblock-history-repair-replay origin/dev
git cherry-pick 72efe5058058c90db335ef6c4bbd7a4b2e78b467
git push -u origin codex/ph1gc-partner-002-unblock-history-repair-replay
gh pr create --base dev \
  --head codex/ph1gc-partner-002-unblock-history-repair-replay \
  --title "PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR: replay packet on current dev" \
  --body "Replays the latest history-repair packet commit 72efe505 onto current dev without rewriting PR #253 or any older PH1GC audit branches."
```

5. If trunk needs the reserved hold-state sidecar path before the external
   issuer inputs arrive, replay only the live restoration commit onto a fresh
   dev-based branch:

```bash
git fetch origin
git switch -c codex2/ph1gc-partner-002-replay origin/dev
git cherry-pick 2ec2868c253f23a8e7b722049f1deb23328bf9f0
git push -u origin codex2/ph1gc-partner-002-replay
gh pr create --base dev --head codex2/ph1gc-partner-002-replay \
  --title "PH1GC-PARTNER-002: replay hold-state sidecar restore" \
  --body "Replays the live Codex2 hold-state sidecar restore (2ec2868c) onto current dev without rewriting older PH1GC audit branches."
```

6. Keep future redacted issuer evidence under the canonical shared path:
   - `support/sidecars/PARTNER-ELIG-LIVE-001/`

## Parent Next Step

The concrete next step for `PH1GC-PARTNER-002` is:

1. If trunk needs the reserved hold-state sidecar path, replay
   `2ec2868c253f23a8e7b722049f1deb23328bf9f0` from
   `origin/codex2/ph1gc-partner-002` onto a fresh `origin/dev` branch and open
   a normal PR.
2. Otherwise keep `PH1GC-PARTNER-002` blocked on
   `EXT-001-BLK-001` through `EXT-001-BLK-006`, attach redacted real issuer
   sandbox evidence under `support/sidecars/PARTNER-ELIG-LIVE-001/`, and rerun
   the live issuer proof from that shared sidecar path.
3. Do not reopen repo-local planning or contract scope unless canonical machine
   truth stops pointing at `PARTNER-ELIG-LIVE-001`.

That resolves the history question without rewriting shared history and without
pretending the live parent branch is still the older Codex lineage.

## Why This Is Safe

- no shared branch is force-pushed
- no published PH1GC branch is renamed or rewritten
- the live parent branch and the older audit/history branches stay
  distinguishable
- the packet now points at the same live branch/commit that canonical machine
  truth points at
- any future packet cleanup or trunk replay can happen on a fresh additive
  branch
- the external issuer gate remains unchanged and explicit

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked canonical machine truth in
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- checked recent lifecycle events in
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- refreshed remote refs with `git fetch origin`
- inspected live and older branch content:
  - `git show --stat --oneline origin/codex2/ph1gc-partner-002`
  - `git show --stat --oneline origin/codex/ph1gc-partner-002`
  - `git show --stat --oneline origin/codex/ph1gc-partner-002-unblock-history-repair`
- inspected ancestry and reachability:
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-partner-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-history-repair`
  - `git merge-base --is-ancestor origin/dev origin/codex2/ph1gc-partner-002`
  - `git merge-base --is-ancestor origin/dev origin/codex/ph1gc-partner-002`
  - `git rev-list --left-right --count origin/codex2/ph1gc-partner-002...origin/codex/ph1gc-partner-002-unblock-history-repair`
- inspected path-level diffs:
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-partner-002 -- support/sidecars/PARTNER-ELIG-LIVE-001`
  - `git diff --name-status origin/dev...origin/codex/ph1gc-partner-002 -- support/sidecars/PARTNER-ELIG-LIVE-001 support/unblock/PH1GC-PARTNER-002`
  - `git diff --name-status origin/codex2/ph1gc-partner-002...origin/codex/ph1gc-partner-002-unblock-history-repair`
- inspected PR state:
  - `gh pr list --state all --head codex2/ph1gc-partner-002 --json number,title,state,isDraft,headRefName,baseRefName,url`
  - `gh pr view 253 --json number,title,state,isDraft,mergeStateStatus,headRefName,baseRefName,commits,url`

No runtime or sandbox tests were run. This task is a docs/status/history repair
only.
