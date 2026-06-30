# MAP-UI-002 Sidecar Review Packet

**Sidecar task:** `MAP-UI-002-SIDECAR-REVIEW`  
**Parent task:** `MAP-UI-002` - shared/admin `GeometryEditor` primitive  
**Parent branch/head reviewed:** `codex2/map-ui-002` @ `58cb496ef01f4e76e7ebe24b1e539596da38d06f`  
**Parent owner/reviewer:** `Codex2` / `Claude2`  
**Sidecar owner/reviewer:** `Codex` / `Codex2`  
**Scope boundary:** support artifact only. This packet does not modify canonical truth, parent runtime code, contracts, or machine truth by hand.

## 1. Review Verdict

Do **not** approve the parent `MAP-UI-002` branch yet.

The branch does provide a useful `GeometryEditor` / `GeometryPreviewSurface` primitive and the package/app typecheck + lint gates pass, but the current evidence and validation rules are not production-level for map/geofence governance:

1. The parent handoff claims a root vitest command that fails in a clean review worktree.
2. Draft coordinates are considered submit-ready without latitude/longitude domain validation.
3. Polygon validation lacks a general simple-polygon/self-intersection check.

These are fixable inside the primitive slice and should be corrected before the reviewer treats `canSubmit` / backend-ready payloads as safe for downstream publish workflows.

## 2. Parent Review Surface

`git show --stat --summary 58cb496ef`:

- subject: `feat(MAP-UI-002): add geometry editor primitive`
- files changed: `5`
- insertions/deletions: `1744` / `80`

Changed files:

1. `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx`
2. `packages/ui-web/src/geometry-editor.stories.tsx`
3. `packages/ui-web/src/geometry-editor.tsx`
4. `packages/ui-web/src/index.tsx`
5. `tests/unit/ui-web-geometry-editor.test.ts`

Acceptance source:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:556-579`
- Required: polygon/circle/route-corridor authoring, vertex/radius edit, undo/discard, preview, validation states, backend-ready payloads, review/diff hooks.
- Critical acceptance: "Invalid geometry cannot be submitted as publish-ready."

## 3. Verification Evidence

Review worktree:

- path: `/tmp/codex-map-ui-002-review`
- branch/head: `codex2/map-ui-002` @ `58cb496ef01f4e76e7ebe24b1e539596da38d06f`
- setup: `CI=true pnpm install --frozen-lockfile --ignore-scripts` was run for dependency availability; no parent source files were edited.

Passing checks rerun from the review worktree:

| Command                                            | Result                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm --filter @drts/ui-web typecheck`             | PASS                                                                    |
| `pnpm --filter @drts/ui-web lint`                  | PASS                                                                    |
| `pnpm --filter @drts/platform-admin-web typecheck` | PASS                                                                    |
| `pnpm --filter @drts/platform-admin-web lint`      | PASS                                                                    |
| `pnpm --filter @drts/ui-web test`                  | PASS, but only package-local tests were discovered: `1` file, `2` tests |

Failing command from the parent handoff:

```text
pnpm exec vitest run tests/unit/ui-web-geometry-editor.test.ts
```

Observed result:

```text
FAIL tests/unit/ui-web-geometry-editor.test.ts
Error: Cannot find package 'react' imported from /tmp/codex-map-ui-002-review/tests/unit/ui-web-geometry-editor.test.ts
```

This directly contradicts the parent task's recorded verification claim for `pnpm exec vitest run tests/unit/ui-web-geometry-editor.test.ts`.

## 4. Blocking Findings

### B1. The recorded test command is not reproducible

Evidence:

- `tests/unit/ui-web-geometry-editor.test.ts:1-2` imports `react` and `react-dom/server`.
- root `package.json:69-86` lists `@types/react` / `@types/react-dom`, but not direct runtime `react` / `react-dom` dependencies.
- `packages/ui-web/package.json:13-17` declares `react` / `react-dom` as package peers.
- Running `pnpm exec vitest run tests/unit/ui-web-geometry-editor.test.ts` from the repo root fails before executing any tests.

Impact:

- The parent review evidence is unreliable because one of the claimed commands does not run in the review worktree.
- The new test is root-level even though it exercises `@drts/ui-web` React primitives whose runtime peers live with the package/app boundary.

Recommended fix:

- Move the test into `packages/ui-web/tests/unit/geometry-editor.test.ts` or another package-local test path covered by `pnpm --filter @drts/ui-web test`.
- If the team intentionally wants root-level React component tests, add explicit root `react` / `react-dom` dependencies and make that dependency ownership decision visible in `package.json`.
- Update the parent handoff evidence to the command that actually executes in CI.

Acceptance after fix:

- `pnpm --filter @drts/ui-web test` must execute the geometry-editor tests, not just existing package-local tests.
- The previously claimed root command should either pass or no longer be listed as verification evidence.

### B2. Out-of-range coordinates can become `canSubmit: true`

Evidence:

- `packages/ui-web/src/geometry-editor.tsx:203-252` validates point count, radius, circle center presence, and non-zero polygon area.
- `packages/ui-web/src/geometry-editor.tsx:263-280` sets `canSubmit` directly from `validation.valid`.
- `packages/ui-web/src/geometry-editor.tsx:466-489` accepts edited vertex numbers when they are finite, but does not check latitude/longitude ranges.
- `packages/ui-web/src/geometry-editor.tsx:508-524` accepts edited circle center numbers when they are finite, but does not check latitude/longitude ranges.
- `packages/ui-web/src/geometry-editor.tsx:1279-1287` validates imported GeoJSON coordinates as finite, but does not check latitude/longitude ranges.
- `packages/ui-web/src/geometry-editor.tsx:816-858` emits backend payloads from the draft coordinates without additional domain validation.

Impact:

- A polygon, route corridor, or circle with `lat=999` or `lng=999` can still satisfy the current validation rules if point count/radius/area requirements pass.
- That violates the runbook requirement that invalid geometry cannot be submitted as publish-ready.
- Downstream Platform Admin governance would either push invalid payloads into backend validation or display a submit-ready state for geometry that can never be accepted.

Recommended fix:

- Add a shared coordinate guard, for example:
  - latitude must be finite and within `[-90, 90]`
  - longitude must be finite and within `[-180, 180]`
- Apply it to every polygon vertex, route corridor point, and circle center inside `validateGeometryDraft`.
- Reuse the guard during GeoJSON import normalization so invalid imports fail early with a visible error.
- Add tests for invalid polygon vertex, invalid route-corridor point, invalid circle center, and invalid imported GeoJSON.

Acceptance after fix:

- `buildGeometryEditorSnapshot(invalidCoordinateDraft).canSubmit` must be `false`.
- Validation errors must identify the invalid point/center clearly enough for an admin to repair it.
- Backend payloads may still be constructed for preview/debug, but submit readiness must be false.

### B3. Self-intersecting polygons are not rejected

Evidence:

- `packages/ui-web/src/geometry-editor.tsx:211-217` checks only de-duplicated vertex count and absolute signed area.
- `packages/ui-web/src/geometry-editor.tsx:1305-1315` implements signed-area calculation.
- There is no segment-intersection or simple-polygon validation before `canSubmit` is set.

Impact:

- Some crossing polygons may be caught only if their signed area collapses to zero; there is no general non-self-intersection guarantee.
- Service-area boundaries and no-pickup/no-dropoff zones need simple, unambiguous rings before they are treated as publish-ready.
- Without this guard, the UI can present geometry as backend-ready even when backend/PostGIS validation should reject it.

Recommended fix:

- Add a simple-polygon validation pass for polygon drafts:
  - compare every non-adjacent segment pair
  - ignore shared endpoints for adjacent edges and the closing edge
  - reject crossings with a specific validation error
- Add unit tests for:
  - a valid simple polygon
  - a self-intersecting polygon
  - a repeated sequential point case
  - a closed-ring import case

Acceptance after fix:

- Self-intersecting polygons must produce `validation.valid === false`.
- `buildGeometryEditorSnapshot(selfIntersectingPolygon).canSubmit` must be `false`.

## 5. Major Downstream Caveat

`MAP-UI-002` is a primitive, not the full Platform Admin governance screen.

Evidence:

- `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx:29-114` adapts approved area/route records into `GeometryPreviewSurface`.
- It does not mount `GeometryEditor`, create a draft lifecycle, call publish/review APIs, or enforce role-based publish confirmation.

Interpretation:

- This should not be a parent rejection by itself if `MAP-UI-002` is intentionally limited to the shared primitive.
- It must remain visible for downstream `MAP-FE-ADM-001`, because Phase 2 still needs the Platform Admin service-area governance route that actually uses the primitive against lifecycle APIs.

## 6. Remediation Plan For Parent Owner

1. Repair test ownership.
   - Move the geometry editor test under `packages/ui-web` or add intentional root React runtime dependencies.
   - Ensure the package-level test command discovers and runs the geometry-editor tests.

2. Harden coordinate validation.
   - Add `isValidGeoPoint` / `validateGeoPoint` helper with lat/lng domain checks.
   - Apply it to polygon, circle, route corridor, and GeoJSON import paths.

3. Add simple-polygon validation.
   - Implement non-adjacent segment intersection detection for polygon drafts.
   - Keep the existing non-zero-area check as a cheap degenerate-ring guard.

4. Expand tests to lock production safety.
   - Positive: polygon payload, circle payload, route corridor payload, import/export, diff hooks, empty/degraded preview.
   - Negative: invalid lat/lng, zero/negative radius, insufficient vertices, self-intersection, invalid imported GeoJSON.

5. Rerun and update evidence.
   - `pnpm --filter @drts/ui-web typecheck`
   - `pnpm --filter @drts/ui-web lint`
   - `pnpm --filter @drts/ui-web test`
   - `pnpm --filter @drts/platform-admin-web typecheck`
   - `pnpm --filter @drts/platform-admin-web lint`

6. Only then send parent back to reviewer.
   - The reviewer should see reproducible command output and explicit tests for "invalid geometry cannot be submitted as publish-ready."

## 7. Reviewer Handoff

Review target:

- artifact: `support/sidecars/MAP-UI-002/MAP-UI-002-SIDECAR-REVIEW.md`
- parent branch reviewed: `codex2/map-ui-002`
- parent commit reviewed: `58cb496ef01f4e76e7ebe24b1e539596da38d06f`

Suggested review outcome:

```text
MAP-UI-002 sidecar packet reviewed. The parent primitive is useful, but the packet identifies production blockers: the claimed root vitest verification command fails, coordinate-range validation is missing before canSubmit, and polygon self-intersection validation is missing. Recommend reopening MAP-UI-002 until the parent branch fixes these blockers and reruns package/app verification.
```
