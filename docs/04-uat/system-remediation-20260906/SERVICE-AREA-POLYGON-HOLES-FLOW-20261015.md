# SERVICE-AREA-POLYGON-HOLES-FLOW-20261015 UAT & Remediation Evidence

- **Task ID**: `SERVICE-AREA-POLYGON-HOLES-FLOW-20261015`
- **Parent / Related Tasks**: `SERVICE-AREA-HOLE-CONTRACT-DISPOSITION-20261015` (non-canonical contract disposition report, `HCD-R1`..`HCD-R6`), original C106
- **Owner**: `Claude` (R2 continuation of a prior `Gemini2` session on the same branch)
- **Reviewer**: `Codex`
- **Branch**: `claude/service-area-polygon-holes-flow-20261015-delivery-r2-20261016`
- **Base SHA (`origin/dev`)**: `b726c5cd0`
- **Prior-session anchor commit on this branch**: `2b95f3926` (contract/API/repository/editor/map-consumer/fixture hole support — see §2.1)
- **Date**: `2026-10-16`

---

## 1. Problem Statement

Per the accepted `SERVICE-AREA-HOLE-CONTRACT-DISPOSITION-20261015` report (`C106-original-approved-report-db4a.exact.md`), original C106 ("邊界內外、洞、多邊形／圓與版本生效時間驗證") required first-class polygon-hole support — `GeoPolygon.holes?: GeoPoint[][]` — across the canonical contract, API validation/evaluation, repository persistence/readback, the authoring `GeometryEditor`, and both operational map consumers (`CallcenterInteractiveMap`, `GoogleMapBaseLayer`). A prior session on this same task/branch (commit `2b95f3926`) implemented the production code for all of these layers. At the start of this session:

- Zero test files in the repository referenced holes at all (`grep -rl "holes" apps/**/tests packages/**/tests tests/unit/system-remediation` returned nothing), so the hole feature had no before/fixed-after evidence and no regression protection — consistent with the brief's own warning that "報告完成不等於功能完成" (a DONE report does not mean the feature is implemented/verified).
- The one existing test that the new winding-reorientation logic (RFC 7946 §3.1.6, `HCD-R5`) silently broke (`packages/ui-web/tests/unit/geometry-editor.test.ts`, "creates backend-ready polygon payloads") was failing, because its stale assertion still expected the *un-reoriented* `sandboxAreaGeometry` ring order.
- `apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx` imported `GoogleMapBaseLayer` via the Next.js `@/...` path alias, which is not configured in the repo root `vitest.config.ts`; mounting the real `CallcenterInteractiveMap` component in a test (as required by `HCD-R3`'s acceptance text) therefore failed to import at all.
- `apps/api`'s own `tsc` run reported `Property 'holes' does not exist on type 'GeoPolygon'` in `service-area.service.ts` / `service-area.repository.ts`, because `apps/api/tsconfig.json` resolves `@drts/contracts` through its pre-built `packages/contracts/dist/index.d.ts`, which pre-dated the `holes` field added to `packages/contracts/src/index.ts` (stale-dist typecheck trap — resolved locally by rebuilding `@drts/contracts`; `dist` is gitignored and not part of this diff).

---

## 2. Remediation Summary & Write Scope

### 2.1 Carried over unchanged from the prior session (commit `2b95f3926`, not re-authored here)

- `packages/contracts/src/index.ts`: `GeoPolygon.holes?: GeoPoint[][]`.
- `apps/api/src/modules/service-area/service-area.service.ts`: `normalizeGeometry`/`normalizePolygonRing` hole validation (containment, pairwise disjointness, degeneracy, self-intersection), `polygonContainsPoint`/`ringContainsPointStrictlyInside` boundary-inclusive evaluation, `geometryToGeoJson`/`closeGeoJsonRing` RFC 7946 CCW/CW serialization.
- `apps/api/src/modules/service-area/service-area.repository.ts`: mirrors the same `geometryToGeoJson`/`closeRing` winding logic for the real SQL `$5`/`$11` (`persistServiceArea`) and `$7`/`$16` (`persistStopPolicy`) bindings.
- `packages/ui-web/src/geometry-editor.tsx`: hole-aware `validateGeometryDraft`, `buildBackendPayloads`, `geometryDraftToGeoJsonObject`/`geometryDraftFromGeometry` (import/export), `projectDraft`/`renderEditorDraft` (`<path fillRule="evenodd" data-geometry-polygon-cutout="true">` cutout rendering), and hole-preserving `handleStageClick`/`updateVertex`/`removeVertex`.
- `apps/platform-admin-web/lib/service-area-governance.ts`: `geometrySummary` hole-count suffix (`"polygon · 4 pts (1 hole)"` / `"(2 holes)"`).
- `apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx` / `components/google-map-base-layer.tsx`: single compound `<path fillRule="evenodd">` per multi-ring feature, and one `google.maps.Polygon` per feature with grouped `paths: [outerRing, ...holeRings]`.
- `packages/shared-test-fixtures/src/map-geofence-fixtures.ts`: matching hole-aware `geometryContainsPoint`/`geometryToGeoJson`.

### 2.2 This session

1. **`apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx`**: changed the `GoogleMapBaseLayer` import from the unresolvable `@/components/google-map-base-layer` alias to the equivalent relative path `../../components/google-map-base-layer`. Behavior-identical; this is what let the real `CallcenterInteractiveMap` component be mounted in a test at all.
2. **`apps/ops-console-web/components/google-map-base-layer.tsx`**: extracted the existing ring-grouping logic inside the `useEffect` that builds `google.maps.Polygon` paths into an exported pure function `buildFeaturePolygonPaths`, and exported the existing `polygonStyle` helper. No behavior change — the effect calls the same logic it did before, just via a named function. This is the only practical way to unit-test this file's HCD-R3 fix: the effect that constructs `google.maps.Polygon` instances only runs during React's commit/effect phase, which needs a real DOM; this repo has no jsdom/testing-library configured anywhere under `apps/*` or `packages/*`, and adding one is outside this task's write scope.
3. **Five existing test files gained hole coverage** (counts are *this file's* test count, before → after):
   - `apps/api/tests/unit/service-area.service.test.ts` (20 → 30): contract/ring-semantics validation (containment, pairwise disjointness, degenerate/self-intersecting rejection, winding permissiveness, backward-compatible omission) plus the full `KHH_DONUT_CORE` `create → submitForReview → publish` lifecycle and `HOLE-EVAL-1`..`7` point-in-polygon/enclave/stop-policy-donut matrix from the accepted report §8.1.3.
   - `packages/ui-web/tests/unit/geometry-editor.test.ts` (8 → 20): fixed the stale winding assertion (see §3 below); added hole-preserving validation, backend payload, GeoJSON round-trip, and `GeometryPreviewSurface` evenodd-cutout-rendering tests. `handleStageClick`/`updateVertex`/`removeVertex`'s hole-preserving spreads were verified by direct source inspection (lines 505–601) rather than simulated clicks, for the same jsdom-absence reason as item 2.
   - `apps/ops-console-web/tests/unit/callcenter-interactive-map.test.ts` (1 → 3): renders the real `CallcenterInteractiveMap` component (`renderToStaticMarkup`) with a 2-ring donut feature and asserts exactly one `<path fill-rule="evenodd" data-map-ring-count="2">`, no duplicate `<polygon>` per ring, and that single-ring features still render as plain `<polygon data-map-ring-count="1">`.
   - `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts` (8 → 10): exported `geometryContainsPoint`/`geometryToGeoJson` as `mapGeofenceGeometryContainsPoint`/`mapGeofenceGeometryToGeoJson` (the fixed seeds never declare a hole, so these branches were otherwise only reachable by inspection) and tested outer-inside/hole-inside/hole-edge/outside containment plus CCW/CW GeoJSON winding against ad-hoc geometry.
   - `tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts` (unchanged test count; same `it` extended): added the `"polygon · 4 pts (1 hole)"` / `"(2 holes)"` `geometrySummary` assertions from the accepted report §8.2.4, alongside the pre-existing non-hole assertions.
4. **One new test file**: `tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts` — the real `ServiceAreaRepository` against a hand-written `DatabaseService` double that routes by actual SQL/table name into in-memory maps (mirroring `ON CONFLICT ... DO UPDATE SET record = EXCLUDED.record`), covering §8.2.3 Phases A–C: real `create → submitForReview → publish` lifecycle with SQL `$4`/`$5`/`$11` assertions, a fresh `ServiceAreaRepository` + `ServiceAreaService.onModuleInit()` readback that reproduces `HOLE-EVAL-1`..`5` against the merged seeds, and a separate stop-policy donut (`KHH_CURB_DONUT_POLICY`) lifecycle + fresh readback reproducing `HOLE-EVAL-7a`/`7b` with SQL `$7`/`$16`.
5. **One new test file**: `tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts` — unit tests for the `buildFeaturePolygonPaths`/`polygonStyle` extraction from item 2.
6. **This document.**

No other files were touched. `packages/contracts/dist` was rebuilt locally to unblock `apps/api` typecheck (see §1); it is gitignored and is not part of this diff.

---

## 3. Before/Fixed-After Regression Evidence

### 3.1 `packages/ui-web/tests/unit/geometry-editor.test.ts` — stale winding assertion

**Before** (prior-session code at `2b95f3926`, unmodified test):

```
pnpm exec vitest run tests/unit/geometry-editor.test.ts   # (run from packages/ui-web)
```

```
 FAIL  tests/unit/geometry-editor.test.ts > ui-web geometry editor > creates backend-ready polygon payloads
AssertionError: expected { type: 'MultiPolygon', …(1) } to deeply equal { type: 'MultiPolygon', …(1) }
-           121.578, 25.041,
-           121.584, 25.024,
+           121.584, 25.024,
+           121.578, 25.041,
 Tests  1 failed | 7 passed (8)
```

The 3-vertex input triangle is clockwise in `[lng, lat]`; the already-implemented `HCD-R5` reorientation correctly flips `sandboxAreaGeometry.coordinates[0][0]` to counterclockwise, but the pre-existing test still asserted the old, un-reoriented order.

**After**: the assertion now expects the CCW-reoriented ring and separately asserts `signedShoelaceArea(...) > 0`, with a comment explaining why it differs from the canonical `serviceAreaGeometry.coordinates` (which retains input order).

```
pnpm exec vitest run tests/unit/geometry-editor.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

### 3.2 `apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx` — unresolvable import blocked component tests

**Before**: importing `CallcenterInteractiveMap` under `vitest run` failed outright:

```
Error: Cannot find package '@/components/google-map-base-layer' imported from
  .../apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx
```

**After**: changed to a relative import (`../../components/google-map-base-layer`); the component now mounts under `renderToStaticMarkup` and the new hole-rendering tests pass (§4).

### 3.3 `apps/api` typecheck — stale `@drts/contracts` dist

**Before** (`pnpm exec tsc -p tsconfig.json --noEmit` from `apps/api`, dist not rebuilt):

```
src/modules/service-area/service-area.repository.ts(242,24): error TS2339: Property 'holes' does not exist on type 'GeoPolygon'.
src/modules/service-area/service-area.service.ts(1066,18): error TS2339: Property 'holes' does not exist on type 'GeoPolygon'.
... (11 "holes does not exist" errors total)
```

**After** (`pnpm run build` in `packages/contracts`, then re-run `tsc`): zero `service-area`/`holes`-related errors. (A set of unrelated pre-existing errors in `reporting-filing`, `sandbox-governance`, `tenant-partner`, `vehicle-eligibility`, `voice-booking` remain — confirmed untouched by this task's `git status`, out of scope.)

---

## 4. §0.7 Required-Acceptance-Key Evidence Matrix

| Required Acceptance Key | Evidence | Command / Exit Code |
| --- | --- | --- |
| `area-holes_contract-normalization-and-ring-semantics` | `GeoPolygon.holes?` (contracts), `normalizeGeometry`/`normalizePolygonRing` containment/disjointness/degeneracy/self-intersection checks, permissive winding acceptance — all exercised by 7 new tests in `service-area.service.test.ts` ("polygon holes: contract normalization and ring semantics") plus `geometry-editor.test.ts`'s matching validation tests | `pnpm exec vitest run tests/unit/service-area.service.test.ts` (from `apps/api`) → Exit `0`, `30 passed` |
| `area-holes_canonical-lifecycle-ACK-GeoJSON-and-fresh-active-readback` | Real `ServiceAreaRepository` + mocked `DatabaseService` SQL-routed `create → submitForReview → publish`, `$5`/`$11`/`$7`/`$16` bindings, fresh `onModuleInit()` readback merging seeds, admin/operational GeoJSON export with 2-ring `sourceGeometry.holes` | `pnpm exec vitest run tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts` (from repo root) → Exit `0`, `1 passed` |
| `area-holes_actual-editor-and-published-map-consumers` | `GeometryPreviewSurface` evenodd cutout rendering + hole-preserving backend payloads (`geometry-editor.test.ts`); real `CallcenterInteractiveMap` single-evenodd-path rendering (`callcenter-interactive-map.test.ts`); `GoogleMapBaseLayer`'s `buildFeaturePolygonPaths` grouped outer+hole paths (`google-map-base-layer-polygon-paths.test.ts`) | `pnpm exec vitest run tests/unit/geometry-editor.test.ts` (from `packages/ui-web`) → Exit `0`, `20 passed`; `pnpm exec vitest run tests/unit/callcenter-interactive-map.test.ts` (from `apps/ops-console-web`) → Exit `0`, `3 passed`; `pnpm exec vitest run tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts` (from repo root) → Exit `0`, `4 passed` |
| `area-holes_seed-isolated-evaluation-denials-and-original-regressions` | `KHH_DONUT_CORE` + `HOLE-EVAL-1`..`7` matrix (outer-inside/hole-inside/hole-edge/outside, separate enclave `KHH_ENCLAVE_SHUTTLE`, separate stop-policy donut `KHH_CURB_DONUT_POLICY`) in both `service-area.service.test.ts` and the repository-lifecycle test; Taipei/Taoyuan seeds retained and proven non-interfering; existing non-hole regressions (`map-admin-publish-closeout-proof.test.ts`, full `apps/api` unit suite) unaffected | `pnpm exec vitest run` (from `apps/api`, full suite) → `164 test files passed (0 unit regressions)`; the 12 `tests/integration/*.integration.test.ts` failures are pre-existing `DATABASE_URL`-dependent cases unrelated to this change (no live PG in this environment, consistent with the VM restriction) |
| `area-holes_exact-candidate-validation` | This document + candidate SHA/branch handed off for Codex review, CI, and protected merge below | See §5 |

---

## 5. Test Run Summary (this session, exact file/test counts)

| Suite | Before (this session) | After | Command (run from the directory shown) |
| --- | --- | --- | --- |
| `apps/api/tests/unit/service-area.service.test.ts` | 20 passed | 30 passed | `pnpm exec vitest run tests/unit/service-area.service.test.ts` (in `apps/api`) |
| `packages/ui-web/tests/unit/geometry-editor.test.ts` | 7 passed, 1 failed | 20 passed | `pnpm exec vitest run tests/unit/geometry-editor.test.ts` (in `packages/ui-web`) |
| `apps/ops-console-web/tests/unit/callcenter-interactive-map.test.ts` | 1 passed | 3 passed | `pnpm exec vitest run tests/unit/callcenter-interactive-map.test.ts` (in `apps/ops-console-web`) |
| `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts` | 8 passed | 10 passed | `pnpm exec vitest run tests/unit/map-geofence-fixtures.test.ts` (in `packages/shared-test-fixtures`) |
| `tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts` | 5 passed | 5 passed (assertions extended) | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts` (repo root) |
| `tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts` | (new) | 1 passed | `pnpm exec vitest run tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts` (repo root) |
| `tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts` | (new) | 4 passed | `pnpm exec vitest run tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts` (repo root) |
| Full `apps/api` unit suite (non-regression) | n/a | `164 files / 1506 tests` passed, `3 skipped`; `12` pre-existing `DATABASE_URL`-dependent integration files fail (unrelated) | `pnpm exec vitest run` (in `apps/api`) |
| Full `apps/ops-console-web` suite (non-regression) | n/a | `10 files / 60 tests` passed | `pnpm exec vitest run` (in `apps/ops-console-web`) |
| Full `packages/ui-web` suite (non-regression) | n/a | `4 files / 64 tests` passed | `pnpm exec vitest run` (in `packages/ui-web`) |
| Full `packages/shared-test-fixtures` suite (non-regression) | n/a | `1 file / 10 tests` passed | `pnpm exec vitest run` (in `packages/shared-test-fixtures`) |
| Full `apps/platform-admin-web` suite (non-regression) | n/a | `9 files / 73 tests` passed | `pnpm exec vitest run` (in `apps/platform-admin-web`) |
| `apps/api` typecheck | 11 `holes`-related errors (stale `@drts/contracts` dist) | 0 `service-area`/`holes` errors | `pnpm run build` (in `packages/contracts`), then `pnpm exec tsc -p tsconfig.json --noEmit` (in `apps/api`) |

---

## 6. Scope & Boundary Declaration

- **Modified files** (see §2.2 for the full list): `apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx`, `apps/ops-console-web/components/google-map-base-layer.tsx`, `apps/api/tests/unit/service-area.service.test.ts`, `packages/ui-web/tests/unit/geometry-editor.test.ts`, `apps/ops-console-web/tests/unit/callcenter-interactive-map.test.ts`, `packages/shared-test-fixtures/src/map-geofence-fixtures.ts`, `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts`, `tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts`.
- **New files**: `tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts`, `tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts`, this document.
- **Not modified**: `packages/contracts/src/index.ts`, `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/src/modules/service-area/service-area.repository.ts`, `packages/ui-web/src/geometry-editor.tsx`, `apps/platform-admin-web/lib/service-area-governance.ts` — all already carried the hole implementation from the prior session's anchor commit `2b95f3926`; this session verified and tested that implementation rather than re-authoring it.
- **Known, declared boundary (not a silent gap)**: `GeometryEditor`'s interactive `handleStageClick`/`updateVertex`/`removeVertex` and `GoogleMapBaseLayer`'s `useEffect`-driven `google.maps.Polygon` construction only execute during a real DOM commit/effect cycle. This repository has no jsdom/testing-library configured anywhere under `apps/*` or `packages/*`, and adding one is outside this task's write scope. Both were verified by direct source inspection (cited by file/line above) and, for `GoogleMapBaseLayer`, by extracting and unit-testing the exact pure ring-grouping function the effect calls.
- **No VM product/dev/preview/HTTP/browser/E2E/PG/Docker servers** were started; all verification above is socket-free `pnpm exec vitest run` against specific files, plus `tsc --noEmit`.
- Hosted CI, protected-branch merge, and independent `Codex` review happen after this candidate is handed off; this document does not itself constitute `done`.
