# UI-FE-DRV-UMBRELLA Unblock History Repair

## Scope

- Task: `UI-FE-DRV-UMBRELLA-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-DRV-UMBRELLA`
- Owner: `Codex`
- Reviewer: `Claude2`
- Audit timestamp: `2026-05-28`

## Diagnosis

The parent is blocked by mixed branch ownership and parent-branch scope
contamination, not by missing child-task delivery.

1. All nine child tasks are already marked `done` in canonical machine truth,
   each with a recorded pushed branch and closeout commit.
2. Before this repair, the only pushed parent branch was
   `origin/codex/ui-fe-drv-umbrella @ ef870b1828562b7e5f2df5e1d8ca05739fbd7cbc`.
   It was the nominal owner-lane branch, but it was not safe to reuse for
   review because of the mixed-scope history described below.
3. That umbrella branch is only two commits ahead of `origin/dev`, but the
   first commit `36d235ff2c8d420ba52ea60fd97a5b10329a157c`
   (`wip(UI-FE-DRV-UMBRELLA): anchor sos-2s-contract`) directly edits
   `apps/driver-app/app/incident.tsx` and
   `apps/driver-app/tests/unit/incident-screen.test.ts`.
4. Those SOS file trees do not match either recorded SOS rail:
   `origin/codex/ui-fe-drv-sos @ cee0171b1844c5970ac9b68a5d3ebc129760336b`
   or `origin/codex2/ui-fe-drv-sos @ e23c6f0ed2e05f155ca656fd2c0a7738c46f5de2`.
   The umbrella branch therefore carries a third, parent-only SOS variant.
5. The second umbrella commit `ef870b18` is clean closeout material: it adds
   only `docs/05-ui/driver-app-rebuild-closeout-20260528.md` plus the two
   runtime-blocked screenshots under `support/sidecars/UI-FE-DRV-UMBRELLA/`.

## Evidence

### Branch and ownership state

- Parent task owner/reviewer in canonical `ai-status.json`:
  - owner `Codex`
  - reviewer `Claude2`
- Pushed umbrella branch:
  - `origin/codex/ui-fe-drv-umbrella @ ef870b1828562b7e5f2df5e1d8ca05739fbd7cbc`
- Clean replay branch created by this repair:
  - `origin/codex/ui-fe-drv-umbrella-replay @ 2c5ad811d99d7782ee471a3052219400272300ab`
- PR seed for the replay branch:
  - `https://github.com/ajoe734/drts-fleet-platform/pull/new/codex/ui-fe-drv-umbrella-replay`
- Pushed SOS rails still exist separately:
  - `origin/codex/ui-fe-drv-sos @ cee0171b1844c5970ac9b68a5d3ebc129760336b`
  - `origin/codex2/ui-fe-drv-sos @ e23c6f0ed2e05f155ca656fd2c0a7738c46f5de2`

### Exact parent contamination

- `origin/dev...origin/codex/ui-fe-drv-umbrella = 0 left / 2 right`
- `36d235ff` changes only:
  - `apps/driver-app/app/incident.tsx`
  - `apps/driver-app/tests/unit/incident-screen.test.ts`
- `ef870b18` changes only:
  - `docs/05-ui/driver-app-rebuild-closeout-20260528.md`
  - `support/sidecars/UI-FE-DRV-UMBRELLA/incident-360x780-runtime-blocked.png`
  - `support/sidecars/UI-FE-DRV-UMBRELLA/incident-412x892-runtime-blocked.png`
- Blob comparison confirms the umbrella SOS tree is neither existing SOS rail:
  - `codex/ui-fe-drv-sos`
    - `incident.tsx` blob `985961f2...`
    - `incident-screen.test.ts` blob `d20edc0d...`
  - `codex2/ui-fe-drv-sos`
    - `incident.tsx` blob `5c17d5f9...`
    - `incident-screen.test.ts` blob `5c20b7bb...`
  - `codex/ui-fe-drv-umbrella`
    - `incident.tsx` blob `4b1b2bb3...`
    - `incident-screen.test.ts` blob `61daa28a...`

### Child-task completion anchors

Canonical machine truth already records `done` plus pushed branch evidence for:

- `UI-FE-DRV-ONB` -> `origin/codex/ui-fe-drv-onb @ 1b5e5857`
- `UI-FE-DRV-IDX` -> `origin/codex/ui-fe-drv-idx @ e687d13d`
- `UI-FE-DRV-JOB` -> `origin/codex2/ui-fe-drv-job @ 2fccea77`
- `UI-FE-DRV-TRP` -> `origin/codex2/ui-fe-drv-trp @ c3f68db6`
- `UI-FE-DRV-PP` -> `origin/codex2/ui-fe-drv-pp @ 9b940f78`
- `UI-FE-DRV-EAR` -> `origin/codex2/ui-fe-drv-ear @ 45bc2178`
- `UI-FE-DRV-SHF` -> `origin/codex2/ui-fe-drv-shf @ ac16c075`
- `UI-FE-DRV-SOS` -> `origin/codex/ui-fe-drv-sos @ cee0171b`
- `UI-FE-DRV-SET` -> machine truth says
  `origin/codex/ui-fe-drv-set @ cfaa5361` is the owner closeout rail

This means the umbrella parent no longer needs to carry any implementation diff
for child scope. It needs a clean closeout branch that references those child
rails and adds only umbrella-scoped evidence.

## Exact Contamination

The blockage is a two-part mismatch:

1. The pushed umbrella branch mixes two different scopes:
   - parent-closeout evidence in `ef870b18`
   - direct SOS implementation edits in `36d235ff`
2. The SOS implementation edits are not the same tree as either existing SOS
   delivery branch, so the parent branch is not a trustworthy replay target for
   closeout or review.

This keeps the parent blocked because the control plane cannot safely say
"review the umbrella closeout branch" while that branch also carries a
parent-only SOS code path.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite `origin/codex/ui-fe-drv-umbrella`. Leave
it intact as audit evidence. Repair by using a fresh owner replay branch from
`origin/dev` that carries only the closeout-evidence commit.

1. Create `codex/ui-fe-drv-umbrella-replay` from `origin/dev`.
2. Cherry-pick only `ef870b18` onto that replay branch.
   Do **not** cherry-pick `36d235ff`.
3. Push the replay branch normally and use it as the canonical parent review rail.

```bash
git fetch origin
git switch -c codex/ui-fe-drv-umbrella-replay origin/dev
git cherry-pick ef870b1828562b7e5f2df5e1d8ca05739fbd7cbc
git push -u origin codex/ui-fe-drv-umbrella-replay
```

4. If `36d235ff` contains a real SOS fix that is still desired, reopen
   `UI-FE-DRV-SOS` and replay that diff there after explicit review. Do not
   smuggle it through the umbrella closeout branch.
5. This repair already created and pushed the replay branch:

- `origin/codex/ui-fe-drv-umbrella-replay @ 2c5ad811d99d7782ee471a3052219400272300ab`

6. After the clean replay branch is pushed, the parent should be updated to
   resume closeout on that branch:

```bash
AI_NAME=Codex scripts/ai-status.sh progress UI-FE-DRV-UMBRELLA \
  "Canonical replay branch pushed: origin/codex/ui-fe-drv-umbrella-replay @ 2c5ad811d99d7782ee471a3052219400272300ab. Use this branch for umbrella closeout review instead of contaminated origin/codex/ui-fe-drv-umbrella, which mixes ef870b18 closeout evidence with 36d235ff parent-only SOS code edits. Next: validate docs/05-ui/driver-app-rebuild-closeout-20260528.md + sidecars on the replay branch and hand off to Claude2. PR seed: https://github.com/ajoe734/drts-fleet-platform/pull/new/codex/ui-fe-drv-umbrella-replay"
```

7. Once the replay branch is accepted as the review rail, `Codex` can hand off
   the parent to `Claude2` in the normal way without any force-push.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The contaminated `origin/codex/ui-fe-drv-umbrella` branch stays available for
  audit.
- The parent now has a clean linear replay rail from `origin/dev` at
  `origin/codex/ui-fe-drv-umbrella-replay`.
- Any real SOS follow-up is kept on the SOS task instead of being hidden inside
  parent closeout history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Inspected canonical task state with:
  - `python3 scripts/ai_status.py show UI-FE-DRV-UMBRELLA`
  - `python3 scripts/ai_status.py show UI-FE-DRV-ONB`
  - `python3 scripts/ai_status.py show UI-FE-DRV-IDX`
  - `python3 scripts/ai_status.py show UI-FE-DRV-JOB`
  - `python3 scripts/ai_status.py show UI-FE-DRV-TRP`
  - `python3 scripts/ai_status.py show UI-FE-DRV-PP`
  - `python3 scripts/ai_status.py show UI-FE-DRV-EAR`
  - `python3 scripts/ai_status.py show UI-FE-DRV-SHF`
  - `python3 scripts/ai_status.py show UI-FE-DRV-SOS`
  - `python3 scripts/ai_status.py show UI-FE-DRV-SET`
- Compared related branches and worktrees:
  - `git branch -vv | grep 'ui-fe-drv-'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex/ui-fe-drv-umbrella' 'refs/heads/claude2/ui-fe-drv-umbrella' 'refs/heads/codex/ui-fe-drv-sos' 'refs/heads/codex2/ui-fe-drv-sos'`
- Compared ancestry and file scope:
  - `git rev-list --left-right --count origin/dev...codex/ui-fe-drv-umbrella`
  - `git show --stat --summary --name-only 36d235ff`
  - `git show --stat --summary --name-only ef870b18`
  - `git diff --name-only 0e3de49b..36d235ff`
  - `git diff --name-only 36d235ff..ef870b18`
  - `git diff --stat codex/ui-fe-drv-sos..codex/ui-fe-drv-umbrella -- apps/driver-app/app/incident.tsx apps/driver-app/tests/unit/incident-screen.test.ts`
  - `git diff --stat codex2/ui-fe-drv-sos..codex/ui-fe-drv-umbrella -- apps/driver-app/app/incident.tsx apps/driver-app/tests/unit/incident-screen.test.ts`
  - `git ls-tree codex/ui-fe-drv-sos apps/driver-app/app/incident.tsx apps/driver-app/tests/unit/incident-screen.test.ts`
  - `git ls-tree codex2/ui-fe-drv-sos apps/driver-app/app/incident.tsx apps/driver-app/tests/unit/incident-screen.test.ts`
  - `git ls-tree codex/ui-fe-drv-umbrella apps/driver-app/app/incident.tsx apps/driver-app/tests/unit/incident-screen.test.ts`
