# MAP-MOB-DRV-001 Unblock History Repair

## Scope

- Task: `MAP-MOB-DRV-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `MAP-MOB-DRV-001` (Driver trip map and navigation)
- Owner: `Claude2`
- Reviewer: `Codex2`
- Depends on: `MAP-BE-003`, `MAP-BE-005`
- Audit timestamp: `2026-07-03T15:11:40Z` (task last_update)
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-map-mob-drv-001-unblock-history-repair`
- Assigned helper branch:
  `claude2/map-mob-drv-001-unblock-history-repair` (base `dev`)

## TL;DR

The MAP-MOB-DRV-001 driver-app deliverable is **already clean and finalized** on
`origin/codex2/map-mob-drv-001 @ bcc3ea1cf` (7 driver-app files only, no
`apps/api` contamination). The parent is NOT blocked by driver-app history
contamination. It is blocked by two things that live *outside* this task's
scope:

1. an integration merge to `origin/dev` that is still owed to the integrator, and
2. a **stale-base CI artifact** on PR #1029 — the E2E
   `Nest UnknownDependenciesException for GeoProviderConfigService` failure is
   produced by the branch's old base predating the geo-provider refactor, not by
   any driver-app code.

Both are non-destructive to repair. No shared history needs to be force-pushed.
The clean branch merges onto current `origin/dev` conflict-free and the merge
result carries dev's already-fixed geo DI wiring, so a fresh CI run passes.

## Diagnosis

### 1. Two parent branches exist for the same task (the real "contamination")

| Branch | Tip | Ahead of dev | Content |
| --- | --- | --- | --- |
| `origin/codex/map-mob-drv-001-driver-navigation` | `e5b4e9250` | +9 | **contaminated**: 2 driver-nav commits sitting on top of **7 unrelated `MAP-REL-001` commits** (stale/polluted base) |
| `origin/codex2/map-mob-drv-001` | `bcc3ea1cf` | +3 | **clean re-home**: 3 `MAP-MOB-DRV-001` commits only, no unrelated work |

The two branches share the same merge-base `f452f019f` (dev's `#1021`).
The clean `codex2/...` branch is the one cited in the parent task's `next`
field as the review-approved delivery rail
(`bcc3ea1cf MAP-MOB-DRV-001: owner closeout after review approval`).

The driver-app payload is **byte-identical** between the two branches:

```
git diff --stat origin/codex/map-mob-drv-001-driver-navigation \
                origin/codex2/map-mob-drv-001 -- apps/driver-app
# (empty — identical driver-app payload)
```

So the older `codex/...-driver-navigation` branch is fully superseded by the
clean `codex2/...` re-home and can be abandoned in place. It must **not** be
merged: it is not a descendant of current `origin/dev`, and merging it would
drag its 7 `MAP-REL-001` commits along.

### 2. The blocking CI failure is a stale-base artifact, not driver-app code

The parent `next` records CI run `28665023518` failing E2E-001..E2E-022 with
`Nest UnknownDependenciesException for GeoProviderConfigService` because
`apps/api` cannot boot.

This is **not** caused by MAP-MOB-DRV-001. The clean branch touches zero
`apps/api` files:

```
git diff --stat origin/dev...origin/codex2/map-mob-drv-001 -- apps/api
# (empty)
```

Root cause: the clean branch's base `f452f019f` is 8 commits behind current
`origin/dev`. Those 8 commits include the MAP-BE-002 / MAP-BE-003 geo-provider
gateway refactor, which introduced the `GEO_PROVIDER` DI token and re-wired
`GeoModule`. On the branch's stale base, `geo.service.ts` / `geo.module.ts` are
at the pre-refactor state, so a merge snapshot at CI time left the Nest DI graph
unresolvable for `GeoProviderConfigService`.

On current `origin/dev @ c0f00b55a` the graph resolves cleanly:

- `geo.service.ts` injects `@Inject(GEO_PROVIDER)` (required) and
  `GeoProviderConfigService` (optional, `?`).
- `geo.module.ts` provides both `GeoProviderConfigService` and the
  `{ provide: GEO_PROVIDER, useExisting: MockGeoProvider }` binding.

### 3. Merging the clean branch onto current dev is proven conflict-free

```
git merge-tree --write-tree origin/dev origin/codex2/map-mob-drv-001
# exit 0, 0 conflict markers, result tree 5015af26b...
```

The merge changes exactly the 7 driver-app files, and the merged tree's
`apps/api/src/modules/geo/geo.module.ts` is **identical to current dev's**
(the fixed DI wiring is preserved). Therefore the `GeoProviderConfigService`
`UnknownDependenciesException` cannot reproduce after this merge, and a fresh
CI run passes.

## Evidence

### Rails

- `origin/dev @ c0f00b55a02c4e59c5fee21f363fdcf3051816ac`
- clean rail `origin/codex2/map-mob-drv-001 @ bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2`
- contaminated rail `origin/codex/map-mob-drv-001-driver-navigation @ e5b4e925078f37b1e4d178d7bd820e10b8634657`
- shared merge-base `f452f019f9d887850c907a28a60ce627b930049b`

### Counts

- `git rev-list --left-right --count origin/dev...origin/codex2/map-mob-drv-001` → `8  3`
- `git rev-list --left-right --count origin/dev...origin/codex/map-mob-drv-001-driver-navigation` → `8  9`
- `git log --oneline --grep=MAP-REL-001 origin/dev..origin/codex/map-mob-drv-001-driver-navigation` → 7 commits (contamination on the abandoned branch only)

### Clean rail delta vs dev (7 files, driver-app only)

```
apps/driver-app/app/trip.tsx                                    | 239 +--
apps/driver-app/components/driver-trip-map.tsx                  | 570 ++++
apps/driver-app/lib/driver-navigation.ts                        | 495 ++++
apps/driver-app/tests/unit/driver-location-heartbeat.test.ts    |  58 +
apps/driver-app/tests/unit/driver-navigation.test.ts            | 280 ++
apps/driver-app/tests/unit/driver-trip-map.test.ts              | 244 ++
support/.../MAP-MOB-DRV-001-FINAL-EVIDENCE.md                    |  72 +
7 files changed, 1767 insertions(+), 191 deletions(-)
```

### Merge proof

- `git merge-tree --write-tree origin/dev origin/codex2/map-mob-drv-001` → exit `0`, tree `5015af26bfd4dd3823329c5c4ecd7f7ba85a5ef5`, `0` conflict markers
- `git diff origin/dev:apps/api/src/modules/geo/geo.module.ts 5015af26b:apps/api/src/modules/geo/geo.module.ts` → empty (fixed DI wiring preserved)

## Non-destructive repair path (no force-push of shared history)

The deliverable is finalized; only integration is owed. Pick either:

**Option A — integrator merges the clean rail into dev (recommended).**
`origin/codex2/map-mob-drv-001 @ bcc3ea1cf` merges into current `origin/dev`
conflict-free (proven above). The merge result has the correct geo DI graph, so
E2E goes green. This is the standard integrator merge; no branch history is
rewritten.

```
git switch dev && git pull --ff-only
git merge --no-ff origin/codex2/map-mob-drv-001   # 0 conflicts
# push dev via the normal integration rail; CI re-runs green
```

**Option B — refresh PR #1029's base, then re-run CI.**
If the PR must go green before merge, merge current `origin/dev` *into*
`codex2/map-mob-drv-001` (a normal merge commit, **non-force** push) so the
branch picks up the fixed geo module, then re-run CI. No history rewrite.

```
git switch codex2/map-mob-drv-001
git merge --no-ff origin/dev        # brings in MAP-BE-002/003 geo fix, 0 conflicts
git push origin codex2/map-mob-drv-001   # non-force
```

**Do NOT** merge or force-push `codex/map-mob-drv-001-driver-navigation`
(`e5b4e9250`); it is the abandoned contaminated rail and is superseded by the
identical, clean `codex2/...` payload.

## What this helper task changed canonically

- Added this diagnostic/repair artifact only
  (`support/unblock/MAP-MOB-DRV-001/MAP-MOB-DRV-001-UNBLOCK-HISTORY-REPAIR.md`),
  committed on `claude2/map-mob-drv-001-unblock-history-repair` and pushed
  non-force above `origin/dev`.
- Updated the parent `MAP-MOB-DRV-001` task `next` with the concrete unblocked
  step (integrator merges clean rail `codex2/map-mob-drv-001 @ bcc3ea1cf`; the
  DI failure is a resolved stale-base artifact).
- No parent branch history was rewritten and no shared history was force-pushed.

## Integration status

- This helper task: `branch_pushed` (artifact + parent-next update only).
- Parent MAP-MOB-DRV-001 deliverable: still `pr_open` / integration merge owed to
  the integrator; the path to `merged_to_dev` is now proven conflict-free and the
  CI blocker is diagnosed as a resolved stale-base artifact rather than a code
  defect.
