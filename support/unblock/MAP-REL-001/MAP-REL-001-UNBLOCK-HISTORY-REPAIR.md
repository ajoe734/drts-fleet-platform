# MAP-REL-001 Unblock History Repair

## Scope

- Task: `MAP-REL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `MAP-REL-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-07-04T06:00:00Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-rel-001-unblock-history-repair`
- Assigned helper branch:
  `codex2/map-rel-001-unblock-history-repair`

## Diagnosis

`MAP-REL-001` is blocked by real Gate B and Gate D evidence gaps, but the parent
also has branch/worktree contamination that would make the next owner resume
ambiguous unless it is documented explicitly.

1. The current canonical parent rail is `origin/codex2/map-rel-001 @
   50b77973f0cc570b2911e22e06fd1947f8751f0c`. That branch was recreated after
   review rejection and contains the truthful blocker refresh that keeps
   `FLEETS-MAP-002` and `FLEETS-MAP-004` non-PASS on purpose.
2. A second pushed branch with the exact same task stem still exists at
   `origin/codex/map-rel-001 @ 8e7323e7d7998ca2637507940fc6530dc7a63480`.
   It was created during the temporary owner reassignment to `Codex` at
   `2026-07-04T04:41:02Z`, then left behind when the task returned to `Codex2`
   after review reopened.
3. The two pushed parent rails diverge from the same `origin/dev @
   9a9817c13934075da4f49053cc868bce64f564a8` base and do not share any parent
   commits above that base. `git rev-list --left-right --count
   origin/codex/map-rel-001...origin/codex2/map-rel-001` returns `5 4`.
4. The stale `codex/...` rail carries a materially different diff from the
   canonical `codex2/...` rail. It still includes geo-provider runtime code and
   old artifact names such as `MAP-READINESS-BLOCKER-REPORT.md`, while the
   canonical `codex2/...` rail renamed those artifacts and dropped the runtime
   branch-only experiment. Continuing from the stale rail would silently undo
   the truthful blocker framing on the canonical branch.
5. No PR exists for either pushed parent branch. `gh pr list --state all --head
   codex/map-rel-001` and `gh pr list --state all --head codex2/map-rel-001`
   both return `[]`, even though an earlier worker failure recorded a prefilled
   PR URL for `codex/map-rel-001`. That makes branch-name-only reasoning even
   less safe.
6. `git worktree list --porcelain` shows no active worktree attached to either
   local parent branch `codex/map-rel-001` or `codex2/map-rel-001`. The only
   live same-family worktrees in this clone are helper and sidecar rails, so a
   future owner could easily attach the wrong branch unless the resume rail is
   stated explicitly.

## Evidence

### Canonical parent rail

- `origin/dev @ 9a9817c13934075da4f49053cc868bce64f564a8`
- `origin/codex2/map-rel-001 @ 50b77973f0cc570b2911e22e06fd1947f8751f0c`
- `git rev-list --left-right --count origin/dev...origin/codex2/map-rel-001`
  returns `0 4`
- `git log --oneline origin/dev..origin/codex2/map-rel-001` shows exactly four
  parent commits:
  - `f718ceb3a wip(MAP-REL-001): anchor release evidence scaffolding`
  - `5833b0aaf MAP-REL-001: finalize release gate evidence and verifiers`
  - `7d997b1bd wip(MAP-REL-001): anchor truthful readiness blockers`
  - `50b77973f wip(MAP-REL-001): anchor blocker artifact refresh`
- `git diff --name-only origin/dev...origin/codex2/map-rel-001` shows the
  canonical rail is limited to release evidence/reporting files:
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
  - `scripts/note-map-geofence-blocker-handoffs.mjs`
  - `scripts/report-map-geofence-readiness-blockers.mjs`
  - `scripts/verify-map-geofence-dispatch-integrity.mjs`
  - `support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json`
  - `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md`
  - `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`
  - `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`
  - `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json`
  - `support/sidecars/MAP-REL-001/artifacts/dispatch-integrity.json`
  - `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json`

### Contaminated stale owner rail

- `origin/codex/map-rel-001 @ 8e7323e7d7998ca2637507940fc6530dc7a63480`
- `git reflog show --date=iso codex/map-rel-001` records:
  - `2026-07-04 04:41:02 +0000 branch: Created from origin/dev`
  - five local owner commits ending at `8e7323e7d`
- `git rev-list --left-right --count origin/dev...origin/codex/map-rel-001`
  returns `0 5`
- `git diff --name-only origin/dev...origin/codex/map-rel-001` shows 21 files,
  including branch-only runtime/config surfaces that are absent from the
  canonical rail:
  - `.env.example`
  - `apps/api/src/modules/geo/geo-provider-config.service.ts`
  - `apps/api/src/modules/geo/geo.module.ts`
  - `apps/api/src/modules/geo/google-geo.provider.ts`
  - `apps/api/tests/unit/geo.service.test.ts`
  - `docs/03-runbooks/map-provider-operational-runbook-20260630.md`
  - `scripts/check-map-provider-config.sh`
  - legacy report names under `support/sidecars/MAP-REL-001/`
- `git diff --name-status origin/codex/map-rel-001..origin/codex2/map-rel-001`
  shows the canonical rail deletes those stale-only files and replaces them
  with the newer blocker report / handoff artifact naming.

### PR and worktree state

- `gh pr list --state all --head codex/map-rel-001 --json number,title,state`
  returns `[]`
- `gh pr list --state all --head codex2/map-rel-001 --json number,title,state`
  returns `[]`
- `git ls-remote --heads origin 'refs/heads/codex/map-rel-001'
  'refs/heads/codex2/map-rel-001'` returns both pushed refs
- `git worktree list --porcelain` shows no worktree attached to either parent
  branch; only helper/sidecar worktrees remain active for the `map-rel-001`
  family

### Machine-truth routing evidence

- `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl` records:
  - `2026-07-04T00:25:55Z` owner reassignment `Codex2 -> Codex`
  - `2026-07-04T04:41:26Z` `Codex` start on `MAP-REL-001`
  - `2026-07-04T04:53:28Z` `Codex` progress with
    `PUSH_BRANCH=codex/map-rel-001`
  - `2026-07-04T05:25:55Z` reviewer reopen with concrete Gate B / Gate D
    blockers
  - `2026-07-04T05:26:23Z` `Codex2` progress resuming owner work
  - `2026-07-04T05:32:17Z` `Codex2` blocker with
    `origin/codex2/map-rel-001@50b77973f0cc570b2911e22e06fd1947f8751f0c`

## Exact Contamination

The exact contamination is a dual-owner-rail split caused by a temporary owner
reassignment mid-task:

1. `codex/map-rel-001` is a pushed but now stale owner rail created when the
   task was temporarily reassigned to `Codex`.
2. `codex2/map-rel-001` is the later pushed canonical owner rail created after
   review reopened the parent to its original owner `Codex2`.
3. Both branches look like legitimate parent branches by task stem alone, but
   they diverge immediately from `origin/dev` and carry different artifact names
   and different code/report surfaces.
4. Neither branch has PR state to disambiguate it, and neither branch currently
   has an attached worktree in this clone.

The parent is therefore blocked not because history must be rewritten, but
because the safe resume rail was left implicit after ownership moved across
lanes.

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any shared branch.

1. Treat `origin/codex2/map-rel-001 @
   50b77973f0cc570b2911e22e06fd1947f8751f0c` as the only canonical parent rail.
2. Treat `origin/codex/map-rel-001 @
   8e7323e7d7998ca2637507940fc6530dc7a63480` as audit-only contamination
   evidence. Do not resume, review, or open a PR from that branch.
3. If parent work must continue, reattach a fresh worktree to the canonical
   branch before editing:

```bash
git fetch origin --prune
git worktree add .artifacts/worktrees/auto/codex2-map-rel-001-resume codex2/map-rel-001
```

4. Continue only the truthful blocker/evidence flow on `codex2/map-rel-001`.
   Do not replay the stale geo-provider runtime diff from `codex/map-rel-001`.
5. Keep the parent blocked on the real dependency gaps rather than on history:
   - Gate B: canonical `/service-area-governance` publication is still missing
     under `apps/platform-admin-web/app`
   - Gate D: release-grade simulator/device UAT evidence is still missing from
     `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
6. Once those dependency artifacts land, rerun the release verifiers from the
   canonical `codex2/map-rel-001` rail and hand the parent forward normally.

## Concrete Parent Next Step

`MAP-REL-001` should stay blocked only on the real Gate B and Gate D evidence
gaps, but its next actionable step must use the correct branch rail:

1. Resume from `origin/codex2/map-rel-001 @
   50b77973f0cc570b2911e22e06fd1947f8751f0c`, not from
   `origin/codex/map-rel-001`.
2. Wait for `MAP-FE-ADM-001` to supply canonical governance publication
   evidence and for `MAP-MOB-DRV-001` to supply release-grade simulator/device
   UAT evidence.
3. After those artifacts land, rerun:
   - `node scripts/report-map-geofence-readiness-blockers.mjs`
   - `node scripts/verify-map-geofence-dispatch-integrity.mjs`
4. Only if those checks clear should the parent move back toward review. No
   history rewrite is required.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The stale `codex/...` branch stays available for audit.
- The canonical `codex2/...` branch remains unchanged and already matches the
  parent's last blocker evidence.
- The parent unblock path becomes a normal resume-on-canonical-branch workflow
  instead of ambiguous branch-name guesswork.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-REL-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-REL-001`
- Inspected related refs and worktrees:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git branch -vv | grep 'map-rel-001'`
  - `git reflog show --date=iso codex/map-rel-001`
  - `git reflog show --date=iso codex2/map-rel-001`
  - `git merge-base origin/dev origin/codex/map-rel-001`
  - `git merge-base origin/dev origin/codex2/map-rel-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/map-rel-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/map-rel-001`
  - `git rev-list --left-right --count origin/codex/map-rel-001...origin/codex2/map-rel-001`
  - `git log --left-right --graph --oneline --decorate origin/codex/map-rel-001...origin/codex2/map-rel-001`
  - `git diff --name-only origin/dev...origin/codex/map-rel-001`
  - `git diff --name-only origin/dev...origin/codex2/map-rel-001`
  - `git diff --name-status origin/codex/map-rel-001..origin/codex2/map-rel-001`
  - `git ls-remote --heads origin 'refs/heads/codex/map-rel-001' 'refs/heads/codex2/map-rel-001'`
- Inspected PR / routing evidence:
  - `gh pr list --state all --search 'MAP-REL-001 in:title' --json number,title,state,isDraft,headRefName,baseRefName,url`
  - `gh pr list --state all --head codex/map-rel-001 --json number,title,state,isDraft,headRefName,baseRefName,url`
  - `gh pr list --state all --head codex2/map-rel-001 --json number,title,state,isDraft,headRefName,baseRefName,url`
  - `grep '"task_id": "MAP-REL-001"' /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl | tail -n 60`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
