# MAP-FE-ADM-001 Unblock History Repair

## Scope

- Task: `MAP-FE-ADM-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `MAP-FE-ADM-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-07-03T16:10:00Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-map-fe-adm-001-unblock-history-repair`
- Assigned helper branch:
  `codex/map-fe-adm-001-unblock-history-repair`

## Diagnosis

`MAP-FE-ADM-001` is not blocked by a single missing branch. It is blocked by a
stem-collision history problem around four different `map-fe-adm-001` rails:

1. The clean current parent branch is
   `origin/codex2/map-fe-adm-001 @ 5b82f4190e5b39878be0f6a7968ae5390a23be57`.
   It was created from `origin/dev` on `2026-07-03 14:53:40 +0000` and contains
   one task-scoped blocker commit only.
2. A local branch with the canonical stem already exists as
   `codex/map-fe-adm-001 @ f452f019f9d887850c907a28a60ce627b930049b`, but it
   is not a parent delivery rail. It was created from `origin/dev` on
   `2026-07-01 01:15:51 +0000`, never received any `MAP-FE-ADM-001` commits,
   and still points at unrelated merged `MAP-OBS-001` trunk history.
3. The earlier implementation branch
   `origin/codex/map-fe-adm-001-governance-ui @ 9ff0d11130c28d097ce01292b1f6bd6a8135ed86`
   is attached to worktree `/tmp/codex-map-fe-adm-001`, but `git reflog` shows
   it was created from `origin/codex/map-rel-001-dev-guardrails`, not from
   `origin/dev`.
4. The follow-up branch
   `origin/codex/map-fe-adm-001-gateb-corrective @ 69b0980c6b699d165b8cd578658c5a88079eeb8b`
   was then branched from `origin/codex/map-fe-adm-001-governance-ui`, so it
   inherited the same unrelated ancestry and added more task payload on top of
   that contaminated stack.

The parent therefore has one clean blocker rail and two older payload rails,
but the payload rails are not safe to resume from because they are stacked on
unrelated `MAP-REL-001` commits and no longer match the accepted non-visual
screen packet flow recorded on `2026-07-03`.

## Evidence

### Clean parent branch

- `origin/codex2/map-fe-adm-001 @ 5b82f4190e5b39878be0f6a7968ae5390a23be57`
- `git reflog show --date=iso codex2/map-fe-adm-001`:
  - `2026-07-03 14:53:40 +0000 branch: Created from origin/dev`
  - `2026-07-03 14:58:41 +0000 commit: wip(MAP-FE-ADM-001): anchor service-area governance design blocker`
- `git rev-list --left-right --count origin/dev...codex2/map-fe-adm-001`:
  `7 1`
- `git diff --name-only origin/dev...codex2/map-fe-adm-001` confirms the clean
  parent delta is limited to the blocker route stub and requirements packet:
  - `apps/platform-admin-web/app/service-area-governance/page.tsx`
  - `apps/platform-admin-web/components/admin-shell.tsx`
  - `apps/platform-admin-web/components/assistant/assistant-types.ts`
  - `apps/platform-admin-web/components/assistant/route-context.ts`
  - `apps/platform-admin-web/components/design-pending-screen.tsx`
  - `apps/platform-admin-web/lib/translations.ts`
  - `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`

### Canonical-stem lookalike branch with unrelated content

- local `codex/map-fe-adm-001 @ f452f019f9d887850c907a28a60ce627b930049b`
- `git branch -vv` marks it `[origin/dev: behind 10]`
  `MAP-OBS-001-SIDECAR-FINAL-EVIDENCE-INTEGRATE-UNBLOCK: integrate final evidence template onto dev (#1021)`
- `git rev-list --left-right --count origin/dev...codex/map-fe-adm-001`:
  `10 0`
- `git ls-remote --heads origin` has no `refs/heads/codex/map-fe-adm-001`

This branch name looks like the canonical parent rail but has zero
`MAP-FE-ADM-001` payload and no remote counterpart.

### Contaminated implementation rail

- `origin/codex/map-fe-adm-001-governance-ui @ 9ff0d11130c28d097ce01292b1f6bd6a8135ed86`
- attached worktree:
  `/tmp/codex-map-fe-adm-001`
- `git reflog show --date=iso codex/map-fe-adm-001-governance-ui`:
  - `2026-07-01 00:58:43 +0000 branch: Created from origin/codex/map-rel-001-dev-guardrails`
  - `2026-07-01 01:08:53 +0000 rebase (finish): ... onto 9e91b90e8599fa8ee73acb99074a4691ac1791ad`
  - `2026-07-01 01:11:30 +0000 commit: MAP-FE-ADM-001: add service-area governance UI`
  - `2026-07-01 01:14:15 +0000 commit: MAP-FE-ADM-001: align evidence owner with task board`
  - `2026-07-01 01:22:45 +0000 commit: MAP-FE-ADM-001: unblock geo provider API boot`
- `git rev-list --left-right --count origin/dev...codex/map-fe-adm-001-governance-ui`:
  `10 10`
- `git log --oneline origin/dev..codex/map-fe-adm-001-governance-ui` shows the
  branch carries 7 unrelated `MAP-REL-001` commits before the 3
  `MAP-FE-ADM-001` commits:
  - `9ff0d1113` `MAP-FE-ADM-001: unblock geo provider API boot`
  - `914b01239` `MAP-FE-ADM-001: align evidence owner with task board`
  - `7c89355b7` `MAP-FE-ADM-001: add service-area governance UI`
  - `9e91b90e8` `MAP-REL-001: sync guardrail docs with live task owners`
  - `40f5c36f0` `MAP-REL-001: clean support packet whitespace`
  - `0610ea8c3` `MAP-REL-001: align dev guardrails with live task truth`
  - `01ab19537` `MAP-REL-001: record OBS template dev merge`
  - `4ce3c9d69` `MAP-REL-001: harden QA evidence verifier gates`
  - `df403b950` `MAP-REL-001: surface fleet gate work packets`
  - `f77e87525` `MAP-REL-001: add production gap closure guardrails`
- `git diff --name-only origin/dev...codex/map-fe-adm-001-governance-ui`
  confirms that the branch also carries unrelated API, readiness, and sidecar
  files outside the current clean parent delta.

### Contaminated corrective rail

- `origin/codex/map-fe-adm-001-gateb-corrective @ 69b0980c6b699d165b8cd578658c5a88079eeb8b`
- attached worktree:
  `/tmp/codex-map-fe-adm-001-gateb-corrective`
- `git reflog show --date=iso codex/map-fe-adm-001-gateb-corrective`:
  - `2026-07-01 01:39:24 +0000 branch: Created from origin/codex/map-fe-adm-001-governance-ui`
  - `2026-07-01 02:02:17 +0000 commit: MAP-FE-ADM-001: add Gate B governance proof`
- `git rev-list --left-right --count origin/dev...codex/map-fe-adm-001-gateb-corrective`:
  `10 11`
- `git diff --name-only origin/dev...codex/map-fe-adm-001-gateb-corrective`
  shows the same unrelated `MAP-REL-001` and readiness/evidence payload plus
  additional invented governance UI files:
  - `apps/platform-admin-web/components/service-area-geometry-editor.tsx`
  - `apps/platform-admin-web/lib/service-area-governance.ts`
  - `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`
  - `tests/unit/platform-admin-service-area-governance.test.ts`

## Exact Contamination

The exact contamination is three-part:

1. The canonical-stem local branch `codex/map-fe-adm-001` is a misleading
   lookalike. It points at unrelated merged `MAP-OBS-001` trunk history and has
   no remote ref, so it cannot be treated as the parent's delivery rail.
2. The older payload branches
   `origin/codex/map-fe-adm-001-governance-ui` and
   `origin/codex/map-fe-adm-001-gateb-corrective` were created from a
   `MAP-REL-001` branch/worktree stack rather than from `origin/dev`, so they
   include unrelated commits and evidence/readiness files that do not belong to
   `MAP-FE-ADM-001`.
3. Those older payload branches also embed a superseded
   `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`
   packet and invented UI work, while the accepted unblock path for the parent
   now depends on the later non-visual requirements packet
   `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`
   plus future canonical visual publication.

This is why the parent remains blocked even though `origin/codex2/map-fe-adm-001`
exists cleanly: the confusing older branches cannot be resumed safely, and the
clean branch intentionally carries only the blocker-safe route stub plus the
current non-visual packet.

## Non-Destructive Repair Path

Do not force-push, rewrite, rename, or delete any of the existing branches.

1. Treat `origin/codex2/map-fe-adm-001 @ 5b82f4190` as the only clean parent
   branch for future work.
2. Treat local `codex/map-fe-adm-001 @ f452f019f` as audit evidence of
   stem-collision contamination only. Do not resume work from it and do not
   create a remote ref for it.
3. Treat `origin/codex/map-fe-adm-001-governance-ui @ 9ff0d1113` and
   `origin/codex/map-fe-adm-001-gateb-corrective @ 69b0980c6` as audit-only
   historical attempts. Do not merge them, do not reopen their worktrees as the
   canonical parent rail, and do not cherry-pick them wholesale.
4. Keep the parent blocked on canonical visual publication exactly as recorded
   by `MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION`.
5. Once the canonical `/service-area-governance` visuals land, resume from the
   clean parent rail:

```bash
git fetch origin
git switch codex2/map-fe-adm-001
git rebase origin/dev
```

6. Re-implement or selectively replay only the still-valid parent-owned changes
   onto that clean rail, using the accepted 2026-07-03 packet as the source of
   truth. Specifically:
   - keep the current route stub and design-pending surface from `5b82f4190`
   - do not revive `MAP-REL-001` sidecar/readiness commits
   - do not reuse the superseded `20260701` screen-requirements file
   - only port old UI code after comparing it against the eventual canonical
     visual publication

If the parent owner prefers an even cleaner replay after visuals publish, the
safe fallback is a fresh branch from then-current `origin/dev`, followed by
manual replay of only still-valid `MAP-FE-ADM-001` files from
`origin/codex2/map-fe-adm-001` and any audited old branches.

## Concrete Parent Next Step

`MAP-FE-ADM-001` should stay blocked on visual publication, but not on branch
confusion anymore.

Concrete next step:

1. Ignore `codex/map-fe-adm-001`, `codex/map-fe-adm-001-governance-ui`, and
   `codex/map-fe-adm-001-gateb-corrective` as resume rails.
2. Keep `origin/codex2/map-fe-adm-001` as the clean parent branch.
3. Wait specifically for canonical `/service-area-governance` visual
   publication.
4. After that publication lands, rebase `codex2/map-fe-adm-001` onto current
   `origin/dev` and continue only from the clean blocker rail plus the accepted
   `20260703` screen-requirements packet.

## Why This Is Safe

- no shared ref is rewritten
- no force-push is required
- all contaminated branches remain reachable for audit
- the parent keeps a clean branch with only blocker-safe payload
- future implementation resumes from a linear `origin/dev`-based rail instead
  of from the contaminated `MAP-REL-001` stack

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-UNBLOCK-HISTORY-REPAIR`
- inspected parent and helper refs:
  - `git branch -vv --list 'codex/map-fe-adm-001' 'codex/map-fe-adm-001-governance-ui' 'codex/map-fe-adm-001-gateb-corrective' 'codex2/map-fe-adm-001'`
  - `git ls-remote --heads origin 'refs/heads/codex/map-fe-adm-001' 'refs/heads/codex/map-fe-adm-001-governance-ui' 'refs/heads/codex/map-fe-adm-001-gateb-corrective' 'refs/heads/codex2/map-fe-adm-001'`
  - `git worktree list --porcelain`
  - `git reflog show --date=iso 'codex/map-fe-adm-001' 'codex/map-fe-adm-001-governance-ui' 'codex/map-fe-adm-001-gateb-corrective' 'codex2/map-fe-adm-001'`
  - `git rev-list --left-right --count origin/dev...codex/map-fe-adm-001`
  - `git rev-list --left-right --count origin/dev...codex/map-fe-adm-001-governance-ui`
  - `git rev-list --left-right --count origin/dev...codex/map-fe-adm-001-gateb-corrective`
  - `git rev-list --left-right --count origin/dev...codex2/map-fe-adm-001`
  - `git diff --name-only origin/dev...codex2/map-fe-adm-001`
  - `git diff --name-only origin/dev...codex/map-fe-adm-001-governance-ui`
  - `git diff --name-only origin/dev...codex/map-fe-adm-001-gateb-corrective`
- inspected commit provenance:
  - `git show --no-patch --format=fuller f452f019f cc6c07670 abd6755a6`
  - `git show --stat --summary --format=fuller 5b82f4190 7c89355b7 914b01239 9ff0d1113 69b0980c6`
  - `git for-each-ref --format='%(refname:short)|%(objectname:short)|%(upstream:short)|%(committerdate:iso8601)|%(subject)' refs/heads refs/remotes/origin | grep 'map-fe-adm-001'`

No runtime tests were run in this helper task. This repair is branch-history
triage and parent-resume documentation only.
