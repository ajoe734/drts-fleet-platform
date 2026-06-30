# MAP-UI-002-HARDEN-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `MAP-UI-002-HARDEN-001` - GeometryEditor validation and verification hardening
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-06-30T20:54:00Z`
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent task verdict.

This packet exists only to support review handoff for `MAP-UI-002-HARDEN-001-SIDECAR-REVIEW`. The parent task is still in `review`; this document does not approve, reopen, or close the parent task. It pins the current machine-truth snapshot, the load-bearing commit, the relevant source anchors, and the exact verification boundary for the assigned reviewer.

---

## 1. Scope Boundary

In scope:

- summarize stable machine-truth anchors for parent `MAP-UI-002-HARDEN-001` and this sidecar task
- pin the parent review handoff commit `414f27484`
- map each parent acceptance criterion to concrete source or test evidence
- distinguish independently confirmed evidence from recorded parent-task pass claims
- provide reviewer-facing rerun commands and branch reachability notes

Out of scope:

- editing runtime or canonical files under `packages/ui-web/**`, `apps/**`, `tests/**`, `docs/**`, or status/dashboard truth outside the normal lifecycle commands
- changing the parent task implementation, review verdict, or closeout metadata
- treating this packet as a substitute for the parent owner commit, push, or final `done` closeout

---

## 2. Machine-Truth Anchors

### 2.1 Sidecar task - `MAP-UI-002-HARDEN-001-SIDECAR-REVIEW`

Stable fields from machine truth:

- owner=`Codex`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`MAP-UI-002-HARDEN-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`MAP-BE-006`
- artifact=`support/sidecars/MAP-UI-002-HARDEN-001/MAP-UI-002-HARDEN-001-SIDECAR-REVIEW.md`

Live sidecar lifecycle state at packet creation:

- status=`in_progress`
- next=`整理 review packet、evidence summary 與 reviewer handoff`
- last_update=`2026-06-30T20:52:12Z`

### 2.2 Parent task - `MAP-UI-002-HARDEN-001`

Stable parent fields from machine truth:

- owner=`Codex2`
- reviewer=`Claude2`
- status=`review`
- depends_on=`MAP-BE-006`
- mutates_canonical=`true`
- artifacts:
  - `packages/ui-web/src/geometry-editor.tsx`
  - `packages/ui-web/tests/unit/`
  - `tests/unit/ui-web-geometry-editor.test.ts`
  - `support/sidecars/MAP-UI-002/MAP-UI-002-SIDECAR-REVIEW.md`

Current recorded parent handoff claim:

- restored `GeometryEditor` into `@drts/ui-web`
- package-local `ui-web` verification now covers geometry-editor tests
- out-of-range lat/lng fails `canSubmit`
- self-intersecting polygons fail `canSubmit`
- GeoJSON import rejects invalid coordinates
- recorded verification pass set:
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/ui-web test`
  - `pnpm --filter @drts/ui-web lint`
  - `pnpm --filter @drts/platform-admin-web typecheck`
  - `pnpm --filter @drts/platform-admin-web test`
  - `pnpm --filter @drts/platform-admin-web lint`

### 2.3 Load-bearing parent commit

Machine truth names the active parent review commit as:

- commit=`414f27484`
- subject=`wip(MAP-UI-002-HARDEN-001): anchor geometry editor hardening`

Reachability check at packet creation:

- local branches containing `414f27484`:
  - `codex/map-ui-002-integrate-001`
  - `codex2/map-ui-002-harden-001`
- remote branch containing `414f27484`:
  - `origin/codex/map-ui-002-integrate-001`

`git show --stat --summary 414f27484` confirms the commit adds exactly three load-bearing files:

- `packages/ui-web/src/geometry-editor.tsx`
- `packages/ui-web/src/index.tsx`
- `packages/ui-web/tests/unit/geometry-editor.test.ts`

Artifact-path drift note:

- parent machine truth still lists `tests/unit/ui-web-geometry-editor.test.ts`
- the recorded handoff text says the verification is package-local to `@drts/ui-web`
- the load-bearing commit itself adds `packages/ui-web/tests/unit/geometry-editor.test.ts`
- reviewer should treat the package-local path in the commit as the operative evidence path

This matters because the sidecar branch itself stays on `origin/dev`; parent code review evidence must therefore be anchored to the commit object and machine-truth record, not to the current worktree contents.

---

## 3. Source and Evidence Anchors

### 3.1 Package verification command anchor

- `packages/ui-web/package.json`
  - `test` script is `vitest run --passWithNoTests`
- independent check on this sidecar branch at `2026-06-30`:
  - `pnpm --filter @drts/ui-web test`
  - result: `Test Files 1 passed (1)`, `Tests 2 passed (2)`

Why this matters:

- the successful run came from package-local test discovery inside `packages/ui-web`
- parent commit `414f27484` adds `packages/ui-web/tests/unit/geometry-editor.test.ts` into the same package-local test tree
- therefore the parent claim that `pnpm --filter @drts/ui-web test` covers the geometry-editor suite is supported by current package behavior

This is an inference from current package verification behavior plus the parent commit contents. It is not a full rerun of the parent branch from this sidecar worktree.

### 3.2 Runtime and export anchors in `414f27484`

- `packages/ui-web/src/geometry-editor.tsx:209-266`
  - `validateGeometryDraft()` is the single validation gate
- `packages/ui-web/src/geometry-editor.tsx:277-295`
  - `buildGeometryEditorSnapshot()` sets `canSubmit` directly from `validation.valid`
- `packages/ui-web/src/geometry-editor.tsx:956-1047`
  - `geometryDraftFromGeoJsonObject()` and `geometryDraftFromGeometry()` parse Feature, FeatureCollection, Polygon, MultiPolygon, Point, LineString, and MultiLineString payloads
- `packages/ui-web/src/geometry-editor.tsx:1293-1309`
  - `positionToPoint()` rejects non-finite and out-of-range GeoJSON coordinates
- `packages/ui-web/src/geometry-editor.tsx:1326-1355`
  - `validatePointCollection()` and `validatePoint()` enforce world coordinate ranges on draft points
- `packages/ui-web/src/geometry-editor.tsx:1371-1412`
  - `polygonHasSelfIntersection()` rejects self-crossing polygon rings
- `packages/ui-web/src/index.tsx:74-104`
  - re-exports `GeometryEditor`, `GeometryPreviewSurface`, `buildGeometryEditorSnapshot`, `parseGeometryDraftGeoJson`, and `validateGeometryDraft`

### 3.3 Test anchors in `414f27484`

- `packages/ui-web/tests/unit/geometry-editor.test.ts:16-47`
  - backend-ready polygon payload test
- `packages/ui-web/tests/unit/geometry-editor.test.ts:49-61`
  - invalid route corridor blocks submit-ready state
- `packages/ui-web/tests/unit/geometry-editor.test.ts:63-77`
  - out-of-range latitude keeps `canSubmit=false`
- `packages/ui-web/tests/unit/geometry-editor.test.ts:79-94`
  - self-intersecting polygon keeps `canSubmit=false`
- `packages/ui-web/tests/unit/geometry-editor.test.ts:96-109`
  - route corridor GeoJSON round-trip
- `packages/ui-web/tests/unit/geometry-editor.test.ts:111-130`
  - invalid GeoJSON coordinates throw a latitude range error
- `packages/ui-web/tests/unit/geometry-editor.test.ts:133-150`
  - review diff hooks remain available for edited geometry
- `packages/ui-web/tests/unit/geometry-editor.test.ts:152-162`
  - empty preview degrades cleanly

---

## 4. Acceptance Criteria Evaluation

| # | Parent acceptance criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `geometry-editor tests run under the package verification command` | **SUPPORTED** | `packages/ui-web/package.json` uses `vitest run --passWithNoTests`; an independent `pnpm --filter @drts/ui-web test` on this sidecar branch executed package-local tests successfully; parent commit `414f27484` adds `packages/ui-web/tests/unit/geometry-editor.test.ts` under the same test tree |
| 2 | `out-of-range lat/lng cannot be canSubmit true` | **PASS** | `buildGeometryEditorSnapshot()` binds `canSubmit` to `validation.valid` in `packages/ui-web/src/geometry-editor.tsx:277-295`; `validatePoint()` rejects world-range violations in `1326-1355`; the regression test at `packages/ui-web/tests/unit/geometry-editor.test.ts:63-77` asserts `snapshot.canSubmit === false` |
| 3 | `self-intersecting polygons cannot be canSubmit true` | **PASS** | polygon validation adds `Polygon cannot self-intersect.` from `packages/ui-web/src/geometry-editor.tsx:225-226` and `1371-1412`; the regression test at `packages/ui-web/tests/unit/geometry-editor.test.ts:79-94` asserts `snapshot.canSubmit === false` |
| 4 | `GeoJSON import rejects invalid coordinates` | **PASS** | `positionToPoint()` throws latitude/longitude range errors in `packages/ui-web/src/geometry-editor.tsx:1293-1309`; GeoJSON parse flow reaches that guard through `956-1047`; the regression test at `packages/ui-web/tests/unit/geometry-editor.test.ts:111-130` expects `GeoJSON latitude must be between -90 and 90.` |
| 5 | `ui-web and platform-admin checks pass` | **RECORDED PASS** | parent machine truth records successful runs of the six commands listed in section 2.2; this sidecar branch did not rerun the full parent verification set because the parent implementation commit is not checked out here |
| 6 | `reviewer evidence links the sidecar blockers` | **PASS** | this packet ties the prior blocker claims directly to the validating functions, exported surface, regression tests, parent commit, and recorded verification commands |

---

## 5. Reviewer Handoff Notes

Recommended review path for `Codex2`:

1. Inspect commit `414f27484` directly, or switch to a branch that contains it:
   - local: `codex2/map-ui-002-harden-001`
   - remote: `origin/codex/map-ui-002-integrate-001`
2. Re-run the parent verification commands on a branch that contains the commit:
   - `pnpm --filter @drts/ui-web typecheck`
   - `pnpm --filter @drts/ui-web test`
   - `pnpm --filter @drts/ui-web lint`
   - `pnpm --filter @drts/platform-admin-web typecheck`
   - `pnpm --filter @drts/platform-admin-web test`
   - `pnpm --filter @drts/platform-admin-web lint`
3. Focus on the three blocker closures:
   - world-range validation propagates into `canSubmit=false`
   - self-intersection propagates into `canSubmit=false`
   - GeoJSON import rejects invalid coordinate payloads before draft adoption

Review boundary:

- this packet independently confirms the support artifact structure, commit reachability, code anchors, test anchors, and current package test-discovery behavior
- it does not independently certify the parent's full six-command verification pass from this sidecar branch

---

## 6. Reviewer Command

Suggested reviewer approval command after packet review:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-UI-002-HARDEN-001-SIDECAR-REVIEW \
  "Review packet added at support/sidecars/MAP-UI-002-HARDEN-001/MAP-UI-002-HARDEN-001-SIDECAR-REVIEW.md; anchored to parent review state and commit 414f27484 with code/test evidence for coordinate-range, self-intersection, and GeoJSON import hardening"
```

---

## 7. Owner Closeout Addendum

Closeout refresh prepared on `2026-06-30` after reviewer approval:

- sidecar machine-truth state is now `review_approved` as of `2026-06-30T20:57:12Z`
- parent task `MAP-UI-002-HARDEN-001` remains in `review`; this sidecar still does not approve, reopen, or close the parent task
- reviewer approval message confirms the packet from commit `a68f91dab` stayed support-only, mapped acceptance to code/test anchors, captured the parent artifact-path drift, and included rerun commands
- reviewer independently reran `pnpm --filter @drts/ui-web test` in the assigned review worktree on `2026-06-30`

Formal closeout boundary:

- this owner closeout only finalizes the sidecar support artifact branch
- no runtime, canonical product truth, or parent-task implementation files are modified by this addendum
- expected integration status for sidecar finalization is `not_applicable` because this packet has no deploy target

---

This document is a sidecar support artifact only. It does not alter `ai-status.json`, canonical product truth, or the parent task lifecycle beyond the normal sidecar handoff commands.
