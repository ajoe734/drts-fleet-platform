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
2. **`apps/ops-console-web/components/google-map-base-layer.tsx`**: extracted the existing ring-grouping logic inside the `useEffect` that builds `google.maps.Polygon` paths into an exported pure function `buildFeaturePolygonPaths`, and exported the existing `polygonStyle` helper. No behavior change — the effect calls the same logic it did before, just via a named function.
   - **Correction (R2, see §7.3)**: the claim below that this repo has no jsdom/testing-library was wrong — `jsdom`, `@testing-library/react`, and `@testing-library/dom` are root devDependencies already used elsewhere (e.g. `tests/unit/service-area-preview-optional-destination-20261015`). R2 mounts the real component and executes this exact `useEffect`; see §7.3.
3. **Five existing test files gained hole coverage** (counts are *this file's* test count, before → after):
   - `apps/api/tests/unit/service-area.service.test.ts` (20 → 30): contract/ring-semantics validation (containment, pairwise disjointness, degenerate/self-intersecting rejection, winding permissiveness, backward-compatible omission) plus the full `KHH_DONUT_CORE` `create → submitForReview → publish` lifecycle and `HOLE-EVAL-1`..`7` point-in-polygon/enclave/stop-policy-donut matrix from the accepted report §8.1.3.
   - `packages/ui-web/tests/unit/geometry-editor.test.ts` (8 → 20, further 20 → 26 in R2 §7.3): fixed the stale winding assertion (see §3 below); added hole-preserving validation, backend payload, GeoJSON round-trip, and `GeometryPreviewSurface` evenodd-cutout-rendering tests.
   - **Correction (R2, see §7.3)**: `handleStageClick`/`updateVertex`/`removeVertex` were originally only verified by source inspection "for the same jsdom-absence reason as item 2" — that reason was wrong (see above); R2 replaced the source-inspection claim with a mounted `<GeometryEditor>` test suite that drives these handlers through real `fireEvent` clicks/changes.
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

## 6. Scope & Boundary Declaration (R1; see §7 for R2 updates)

- **Modified files** (R1; see §7.4 for R2's additional files): `apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx`, `apps/ops-console-web/components/google-map-base-layer.tsx`, `apps/api/tests/unit/service-area.service.test.ts`, `packages/ui-web/tests/unit/geometry-editor.test.ts`, `apps/ops-console-web/tests/unit/callcenter-interactive-map.test.ts`, `packages/shared-test-fixtures/src/map-geofence-fixtures.ts`, `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts`, `tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts`.
- **New files** (R1): `tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts`, `tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts`, this document.
- **Not modified** (R1; `packages/ui-web/src/geometry-editor.tsx` gains a test-only attribute in R2, see §7.3): `packages/contracts/src/index.ts`, `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/src/modules/service-area/service-area.repository.ts`, `packages/ui-web/src/geometry-editor.tsx`, `apps/platform-admin-web/lib/service-area-governance.ts` — all already carried the hole implementation from the prior session's anchor commit `2b95f3926`; this session verified and tested that implementation rather than re-authoring it.
- **Superseded in R2 (see §7)**: the paragraph below, from the R1 session, claimed this repository has no jsdom/testing-library and that `GeometryEditor`'s interactive handlers and `GoogleMapBaseLayer`'s effect could only be verified by source inspection. That claim was false — `jsdom`/`@testing-library/react`/`@testing-library/dom` are root devDependencies already in use elsewhere in this repo — and is corrected and superseded by §7.3 below, which mounts both real components and drives them through real DOM events.
- **No VM product/dev/preview/HTTP/browser/E2E/PG/Docker servers** were started; all verification above is socket-free `pnpm exec vitest run` against specific files, plus `tsc --noEmit`.
- Hosted CI, protected-branch merge, and independent `Codex` review happen after this candidate is handed off; this document does not itself constitute `done`.

---

## 7. R2 Reopen (Codex, candidate `73d52832b`, generation `2afd55daefc344d6a29aa891a309700f`): SAH-R1..R4 findings and repairs

Codex's R2 review reopened the R1 candidate with four findings (`SAH-R1`..`SAH-R4`). Each is addressed below with its root cause, exact fix location, and before/after evidence. All commands below were run from this worktree; no VM product/dev/preview/HTTP/browser/E2E/PG/Docker servers were started.

### 7.1 SAH-R1 (P1, `area-holes_contract-normalization-and-ring-semantics`): outer-ring validation diverged from the canonical payload

**Root cause**: `validateGeometryDraft`'s polygon case (`packages/ui-web/src/geometry-editor.tsx`) called `dedupeSequentialPoints(draft.points)`, which silently strips **every** consecutive duplicate (not just a closing duplicate) before validating — so a draft like `[A, B, B, C, D]` validated as the 4-vertex ring `[A, B, C, D]` (`canSubmit: true`), while `buildBackendPayloads` sent the original, unstripped 5-point `draft.points` (including the zero-length `B, B` edge) as the canonical `serviceAreaGeometry.coordinates`. The real `ServiceAreaService.createServiceArea` then rejected that exact payload with `INVALID_GEOMETRY` ("zero-length edge"), so the editor's "valid" verdict was a lie about what would actually be submitted. Separately, a closed input ring (`[A, B, C, D, A]`) was never canonicalized at all — the closing duplicate stayed in the canonical payload.

**Fix** (`packages/ui-web/src/geometry-editor.tsx`):
- `validateGeometryDraft`'s polygon case now calls `stripClosingDuplicatePoint(draft.points)` (the same helper already used for holes) instead of `dedupeSequentialPoints`, and explicitly flags any *remaining* consecutive duplicate as an error ("Polygon cannot contain duplicate consecutive vertices or zero-length edges.") rather than silently absorbing it — mirroring the pre-existing, already-correct hole-validation pattern a few lines below.
- `buildBackendPayloads`'s polygon case now canonicalizes `draft.points` and every hole in `draft.holes` through `stripClosingDuplicatePoint` *before* building both `serviceAreaGeometry` (open canonical ring/holes) and `sandboxAreaGeometry` (closed, oriented GeoJSON), so what's validated is byte-identical to what's sent.

**Before/after** (exact reproduction from the finding, via the mounted `<GeometryEditor>`):

```ts
// points=[A,B,B,C,D] where A={lat:22.58,lng:120.25}, B={lat:22.58,lng:120.35}, C={lat:22.68,lng:120.35}, D={lat:22.68,lng:120.25}
// Before: canSubmit=true, errors=[], payload.coordinates has the zero-length B,B edge
//   -> real ServiceAreaService.createServiceArea on this exact payload: HTTP 400 INVALID_GEOMETRY, field geometry.coordinates
// After: canSubmit=false, errors=["Polygon cannot contain duplicate consecutive vertices or zero-length edges."]
```
See `packages/ui-web/tests/unit/geometry-editor.test.ts` → `"mounted <GeometryEditor> (real DOM events, holes)"` → `"edits an outer vertex through the real Latitude field, keeping the hole intact and the polygon valid"` and the closing-duplicate round-trip test below, both mounted and driven through real `fireEvent` calls, not helper copies.

### 7.2 SAH-R2 (P1, `area-holes_contract-normalization-and-ring-semantics` + `area-holes_actual-editor-and-published-map-consumers`): GeoJSON import always dropped the last vertex

**Root cause**: `parsePolygonRingCoordinates` (`packages/ui-web/src/geometry-editor.tsx`) unconditionally did `ring.slice(0, -1)` regardless of whether the ring was actually closed (`first === last`). A legitimately **open** 4-point ring — `parseGeometryDraftGeoJson('{"type":"Polygon","coordinates":[[[120.25,22.58],[120.35,22.58],[120.35,22.68],[120.25,22.68]]]}')` — silently lost its 4th vertex and imported as a 3-point triangle with `canSubmit: true`, and the same happened to a closed 5-point hole (imported as 3 points instead of 4). Both corrupted the shape being imported without any error.

**Fix**: `parsePolygonRingCoordinates` now accepts any ring with `>= 3` coordinates and only strips a vertex when `stripClosingDuplicatePoint` finds an actual `first === last` closing duplicate, for both the outer ring and every hole, in both the `Polygon` and `MultiPolygon` import branches. The now-inaccurate `"at least 4 coordinates"` error messages were corrected to `"at least 3 coordinates"`.

**Before/after**:

```ts
// Before: parseGeometryDraftGeoJson of an OPEN 4-point outer ring -> 3 points (4th vertex silently dropped)
// After:  the same input -> 4 points, unchanged
//
// Before: a CLOSED 5-point hole ring -> 3-point hole (one real vertex lost, not just the closing duplicate)
// After:  the same input -> 4-point hole (only the true closing duplicate stripped)
```
See `packages/ui-web/tests/unit/geometry-editor.test.ts` → `"Apply import of a hole-bearing GeoJSON Polygon through the real import textarea renders a true evenodd cutout path"` (open-vs-closed ring import through the real `GeometryEditor` import textarea and `Apply import` button) and `"Export then Apply import round-trips the current hole-bearing draft losslessly..."` (closed-ring hole import).

### 7.3 SAH-R3 (P1, `area-holes_actual-editor-and-published-map-consumers`): mandated mounted-component coverage was replaced with helper/implementation copies

**Root cause / correction**: both the R1 `geometry-editor.test.ts` "preserves holes across outer-vertex add/edit/remove draft mutations" test and `google-map-base-layer-polygon-paths.test.ts` claimed jsdom/testing-library were unavailable in this repo and tested hand-copied draft-mutation shapes / a pure ring-grouping function instead of the real components. That claim was false: `jsdom`, `@testing-library/react`, and `@testing-library/dom` are root `devDependencies` already exercised by `tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx`, which mounts the real `GeometryEditor` via `@drts/ui-web` today.

**Fix**:
- `packages/ui-web/tests/unit/geometry-editor.test.ts` gained a `// @vitest-environment jsdom` pragma and a new `describe("mounted <GeometryEditor> (real DOM events, holes)")` block (replacing the removed helper-copy test) that renders the real `<GeometryEditor>` with `@testing-library/react`, and drives it with real `fireEvent.click`/`fireEvent.change` through: a real stage click (`handleStageClick`) adding an outer vertex; selecting a vertex handle and editing it via the real Latitude `<input>` (`updateVertex`); selecting and removing a vertex via the real "Remove vertex" button (`removeVertex`); a real boundary-shrinking edit that leaves the hole invalid-but-intact; `Undo`/`Discard`; a real GeoJSON `Apply import` producing a true DOM `<path fill-rule="evenodd" data-geometry-polygon-cutout="true">`; and an `Export` → `Apply import` round-trip. The only thing mocked is the stage `<svg>`'s `getBoundingClientRect` (a jsdom layout stub, not editor logic — jsdom does not compute real layout). `packages/ui-web/src/geometry-editor.tsx` gained one test-only `data-vertex-index={index}` attribute on each vertex handle `<rect>` (mirrors the pre-existing `data-geometry-polygon-cutout` pattern) so tests can target a specific vertex without relying on fragile DOM ordering; no behavior change.
- A new test file, `apps/ops-console-web/tests/unit/google-map-base-layer.test.ts`, mounts the real `<GoogleMapBaseLayer>` with `@testing-library/react`, mocking only the external `@googlemaps/js-api-loader` module (`importLibrary`/`setOptions`) and the global `google.maps.Polygon`/`Circle` constructors the Maps JS API would otherwise install as a script-load side effect. It asserts the real ready-config `useEffect` constructs exactly one `google.maps.Polygon` per feature with `paths` equal to `buildFeaturePolygonPaths(feature)` (outer + hole rings grouped into one instance), and a second test confirms no `Polygon`/`importLibrary` call when the map provider config is disabled (honest fallback).
  - **Why this file lives under `apps/ops-console-web/tests/unit/` and not the pre-listed `tests/unit/service-area-polygon-holes-flow-20261015/`**: `@googlemaps/js-api-loader` is a declared dependency of `apps/ops-console-web` only (not a root dependency), so it only resolves for an importer under `apps/ops-console-web`'s own `node_modules` tree (confirmed empirically: the identical mounted test, placed at the repo-root-scoped path, fails with `Failed to resolve import "@googlemaps/js-api-loader"` under the root `vitest.config.ts`, which runs with `cwd` = the invoking package directory). `apps/ops-console-web/components/google-map-base-layer.tsx` (the file under test) is already in this task's `write_scopes`, and `apps/ops-console-web/tests/unit/callcenter-interactive-map.test.ts` already establishes that `apps/ops-console-web/tests/unit/` is this task's authorized test surface for that component tree; this is a sibling test file for the sibling component in the same production file's own test directory, not a new unrelated scope.
- `google-map-base-layer-polygon-paths.test.ts` (repo root) keeps only the pure-function `buildFeaturePolygonPaths`/`polygonStyle` regression tests and its header comment now points to the mounted test above instead of claiming jsdom is unavailable.

**Verification**:
```
pnpm exec vitest run tests/unit/geometry-editor.test.ts          (packages/ui-web)     -> 1 file, 26 tests, exit 0
pnpm exec vitest run tests/unit/google-map-base-layer.test.ts \
  tests/unit/callcenter-interactive-map.test.ts                  (apps/ops-console-web) -> 2 files, 5 tests, exit 0
pnpm exec vitest run                                             (apps/ops-console-web) -> 10 files, 61 tests, exit 0
```

### 7.4 SAH-R4 (P2, `area-holes_canonical-lifecycle-ACK-GeoJSON-and-fresh-active-readback` + `area-holes_seed-isolated-evaluation-denials-and-original-regressions`): incomplete matrix despite green test names

**Fixes, all additive (no production logic changed in this section)**:
- `apps/api/tests/unit/service-area.service.test.ts`: the `HOLE-EVAL-4` hole-edge/vertex case previously sampled one edge and one vertex; it now loops over all four edge midpoints and all four vertices of `KHH_DONUT_HOLE`, asserting `serviceable`/`KHH_DONUT_CORE` for every one. Added individually-targeted degenerate/validity cases, each with its own geometry and the exact contract error code, none of which were previously exercised on their own: duplicate-consecutive outer vertex (`INVALID_GEOMETRY`); a pinch — two **non-adjacent** vertices coinciding (`INVALID_GEOMETRY_SELF_INTERSECTION`); an adjacent 180° foldback/spike (`INVALID_GEOMETRY_SELF_INTERSECTION`); two non-adjacent edges that touch without crossing (`INVALID_GEOMETRY_SELF_INTERSECTION`); two holes that merely touch at a shared boundary point (`INVALID_GEOMETRY_HOLE_OVERLAP`, distinct from the pre-existing crossing-holes case); one hole nested entirely inside another (`INVALID_GEOMETRY_HOLE_OVERLAP`); and a positive case — two holes that are genuinely disjoint (accepted, not rejected). Added an observability test asserting `MapGeofenceObservabilityService`'s `outOfAreaCount` increments for a hole-inside (geometric) denial while `policyDenialCount` stays flat, and vice versa for a policy-denied (non-hole) pickup — demonstrating the two denial paths are distinguishable in operational telemetry, not just in the HTTP reason code.
- `tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts`: added the missing `HOLE-EVAL-3` (outer-boundary point, on the edge rather than the interior) and `HOLE-EVAL-6` (a real, non-null dropoff landing inside the hole gets the exact `DROPOFF_AREA_NOT_SERVICEABLE` reason and empty `serviceAreaCodes`/`geometryVersionRefs` for that leg, while the pickup leg keeps its own legitimate refs — asserted via the real per-stop `evaluate(...).stops` breakdown, not just the aggregate decision) after the fresh `onModuleInit()` readback. Added exact-value assertions that were previously only approximated by length/status checks: the real SQL text is asserted to wrap the service-area geometry bind (`$5`) in `ST_Multi(...)` and the stop-policy geometry bind (`$7`) in a plain `ST_SetSRID(...)` with **no** `ST_Multi` (confirming the area/policy column-type distinction actually reaches the query, not just the repository's in-memory intent); the exact closed, correctly-wound (outer CCW, hole CW) GeoJSON ring coordinates bound at `$5`/`$7` are asserted value-for-value (not just ring count); and the full `record` JSONB bound at `$11`/`$16` is asserted to match the real `ServiceAreaBoundaryRecord`/`StopPolicyRecord` (id, status, version, geometry/holes, `serviceAreaCodes`, `reasonCode`), not just presence.

**Verification**:
```
pnpm exec vitest run tests/unit/service-area.service.test.ts                              (apps/api)   -> 1 file, 38 tests, exit 0
pnpm exec vitest run tests/unit/service-area-repository-lifecycle.test.ts \
  tests/unit/google-map-base-layer-polygon-paths.test.ts \
  tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts  (repo root)  -> 3 files, 10 tests, exit 0
```

### 7.5 Full non-regression re-run (this candidate, after all R2 fixes)

| Suite | Result | Command (run from the directory shown) |
| --- | --- | --- |
| `apps/api` full unit suite | `164 files / 1514 tests` passed, `27 skipped`; the same `12` pre-existing `DATABASE_URL`-dependent `tests/integration/*` files fail, unrelated to this change (confirmed via `git status` — none of those files are touched) | `pnpm exec vitest run` (`apps/api`) |
| `packages/ui-web` full suite | `4 files / 70 tests` passed | `pnpm exec vitest run` (`packages/ui-web`) |
| `apps/ops-console-web` full suite | `10 files / 61 tests` passed | `pnpm exec vitest run` (`apps/ops-console-web`) |
| `apps/platform-admin-web` full suite | `9 files / 73 tests` passed | `pnpm exec vitest run` (`apps/platform-admin-web`) |
| `packages/shared-test-fixtures` full suite | `1 file / 10 tests` passed | `pnpm exec vitest run` (`packages/shared-test-fixtures`) |
| `apps/api` typecheck | `0` `service-area`/`holes`-related errors (same pre-existing, unrelated errors elsewhere as §3.3) | `pnpm run build` (`packages/contracts`), then `pnpm exec tsc -p tsconfig.json --noEmit` (`apps/api`) |
| `packages/ui-web` typecheck | clean | `pnpm exec tsc -p tsconfig.json --noEmit` (`packages/ui-web`) |
| `apps/ops-console-web` typecheck | clean | `pnpm exec tsc -p tsconfig.json --noEmit` (`apps/ops-console-web`) |
| `apps/platform-admin-web` typecheck | clean | `pnpm exec tsc -p tsconfig.json --noEmit` (`apps/platform-admin-web`) |
| Scoped `eslint --max-warnings=0` on every file touched in R1+R2 (production + tests) | clean | `pnpm exec eslint <files> --max-warnings=0` (repo root) |

**R2 scope summary**: modified `packages/ui-web/src/geometry-editor.tsx` (behavioral fixes: §7.1, §7.2; test-only attribute: §7.3), `packages/ui-web/tests/unit/geometry-editor.test.ts`, `apps/api/tests/unit/service-area.service.test.ts`, `tests/unit/service-area-polygon-holes-flow-20261015/service-area-repository-lifecycle.test.ts`, `tests/unit/service-area-polygon-holes-flow-20261015/google-map-base-layer-polygon-paths.test.ts`, this document. New file: `apps/ops-console-web/tests/unit/google-map-base-layer.test.ts` (§7.3 explains the path choice). No other files were touched in R2; `packages/contracts/dist` was rebuilt locally again to unblock `apps/api` typecheck (gitignored, not part of this diff, same as R1 §1/§3.3).
