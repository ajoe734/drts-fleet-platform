# MAP-UI-002 Review Packet & Evidence Summary (Sidecar)

**Sidecar task:** `MAP-UI-002-SIDECAR-REVIEW`
**Owner / reviewer:** `Claude` / `Codex2`
**Helper kind:** `review_packet` (support-only — no canonical truth edited)
**Parent task:** `MAP-UI-002` — "GeometryEditor primitive"
**Prepared:** 2026-07-01

> This packet is a review aid for the parent reviewer (`MAP-UI-002` reviewer =
> `Claude2`) and for the sidecar reviewer (`Codex2`). It maps the parent's five
> acceptance bullets to concrete, verified code/test anchors and records exactly
> what this sidecar independently confirmed versus what remains owner-reported.
> It creates **no** canonical changes and does not approve or absorb the parent.

---

## 0. Parent Task Snapshot (machine truth)

| Field | Value |
| --- | --- |
| id | `MAP-UI-002` |
| title | GeometryEditor primitive |
| owner / reviewer | `Codex2` / `Claude2` |
| status | `review` |
| depends_on | `MAP-BE-006` — **done** (merged to `dev@1c06a5cfb`, #1020) |
| mutates_canonical | `true` |
| phase | `map-geofence-production-20260630` |
| declared artifacts | `packages/ui-web/`, `apps/platform-admin-web/` |
| production gate context | Gate B — "Governance safe to publish" |

Acceptance (from parent brief):

1. editor emits backend-ready geometry
2. invalid geometry blocked
3. import/export covered
4. review diff hooks available
5. component checks pass

---

## 1. Where the implementation actually lives (READ THIS FIRST)

The GeometryEditor primitive is **not on `dev`** and not in this sidecar's base
worktree. Verified machine truth:

- `git ls-tree -r origin/dev --name-only | grep geometry-editor` → **0 files**.
- The primitive lives on branch **`origin/codex/map-ui-002-integrate-001`** at
  commit **`4c08c6a28a0d0795992aa97006ea8f59d2969f02`**
  (`MAP-UI-002-INTEGRATE-001: close geometry editor integration`).

Diff of that branch vs `origin/dev` (the parent's real review surface):

```
 packages/ui-web/src/geometry-editor.stories.tsx    |   56 +
 packages/ui-web/src/geometry-editor.tsx            | 1666 ++++++++++++++++++++
 packages/ui-web/src/index.tsx                      |   31 +
 packages/ui-web/tests/unit/geometry-editor.test.ts |  163 ++
 support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md | 58 +
 5 files changed, 1974 insertions(+)
```

Branch lineage (`git log origin/dev..origin/codex/map-ui-002-integrate-001`):

```
4c08c6a28 MAP-UI-002-INTEGRATE-001: close geometry editor integration
414f27484 wip(MAP-UI-002-HARDEN-001): anchor geometry editor hardening
```

The integrate branch (per its own `MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`)
consolidates the primitive commit `58cb496ef` (`feat(MAP-UI-002): add geometry
editor primitive`) with hardening `414f27484` onto one branch.

**Reviewer note (trap avoidance):** do not review `dev` and conclude "no
implementation." Review `origin/codex/map-ui-002-integrate-001@4c08c6a28`.

### Related branches (do not confuse)

Several parallel branches carry the `MAP-UI-002` slug; only one carries the
primitive blob:

| Branch | Carries `geometry-editor.*`? |
| --- | --- |
| `codex/map-ui-002-integrate-001` @ `4c08c6a28` | **yes (3 files)** ← canonical review target |
| `codex2/map-ui-002-integrate-001-sidecar-review` | no |
| `codex/map-ui-002-harden-001-sidecar-review` | no |
| this sidecar `claude/map-ui-002-sidecar-review` | no (support packet only) |

This packet is a **distinct Claude-owned review-packet run**; it is independent
of the `codex/*` and `codex2/*` sidecar-review branches and does not supersede
them.

---

## 2. Verified code anchors

All anchors below were read from
`origin/codex/map-ui-002-integrate-001:packages/ui-web/src/geometry-editor.tsx`
(1666 lines) and `.../index.tsx`. Line numbers are 1-indexed into that file.

### Public API (exported from `@drts/ui-web` via `index.tsx`)

| Symbol | Kind | Anchor |
| --- | --- | --- |
| `GeometryEditor` | React component | `geometry-editor.tsx:385` |
| `GeometryPreviewSurface` | React component | `geometry-editor.tsx:312` |
| `buildGeometryEditorSnapshot` | fn | `geometry-editor.tsx:277` |
| `createEmptyGeometryDraft` | fn | `geometry-editor.tsx:197` |
| `validateGeometryDraft` | fn | `geometry-editor.tsx:209` |
| `geometryDraftToGeoJson` | fn | `geometry-editor.tsx:268` |
| `parseGeometryDraftGeoJson` | fn | `geometry-editor.tsx:272` |

Exported types include `GeometryDraft`/`GeometryDraftKind`
(`polygon`\|`circle`\|`routeCorridor`), `GeometryEditorBackendPayloads`,
`GeometryEditorSnapshot`, `GeometryValidationResult`, `GeometryReviewDiff`,
`ServiceAreaGeometry` (`GeoPolygon`\|`GeoCircle`), `GeoJsonMultiPolygon`,
`GeoJsonMultiLineString`. Barrel export block at `index.tsx` re-exports all of
the above from `./geometry-editor`.

### Internal logic anchors

| Concern | Fn | Anchor |
| --- | --- | --- |
| Backend payload builder | `buildBackendPayloads` | `geometry-editor.tsx:830` |
| Review diff builder | `buildReviewDiff` | `geometry-editor.tsx:876` |
| GeoJSON serialize | `geometryDraftToGeoJsonObject` | `geometry-editor.tsx:918` |
| GeoJSON parse → draft | `geometryDraftFromGeoJsonObject` | `geometry-editor.tsx:956` |
| Point range validation | `validatePoint` | `geometry-editor.tsx:1332` |
| Latitude range guard | `isLatitudeInRange` | `geometry-editor.tsx:1350` |
| Longitude range guard | `isLongitudeInRange` | `geometry-editor.tsx:1354` |
| Polygon area (degeneracy) | `signedPolygonArea` | `geometry-editor.tsx:1358` |
| Self-intersection check | `polygonHasSelfIntersection` | `geometry-editor.tsx:1371` |
| Platform-admin adapter | `SandboxGeometryMap` | `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx:28` |

---

## 3. Acceptance → Evidence matrix

| # | Acceptance | Primary evidence (anchors) | Test proof | Sidecar verdict |
| --- | --- | --- | --- | --- |
| 1 | editor emits backend-ready geometry | `buildBackendPayloads@830` returns `GeometryEditorBackendPayloads` = `{ serviceAreaGeometry, sandboxAreaGeometry, sandboxRouteGeometry, routeCorridor }`; surfaced by `buildGeometryEditorSnapshot@277` as `snapshot.backendPayloads`. Polygon→`GeoPolygon`+MultiPolygon; circle→`GeoCircle`; routeCorridor→MultiLineString+`routeCorridor{centerline,radiusMeters}`. | `it("creates backend-ready polygon payloads")` (test:17) | **Code-verified.** Payload shape matches backend geometry contract families (service-area polygon/circle, sandbox Multi\*, route corridor). |
| 2 | invalid geometry blocked | `validateGeometryDraft@209`: polygon ≥3 verts + non-zero area (`signedPolygonArea@1358`) + no self-intersection (`polygonHasSelfIntersection@1371`); circle center required + radius>0; route ≥2 pts + radius>0. Coordinate range via `validatePoint@1332`/`isLatitudeInRange@1350`/`isLongitudeInRange@1354`. `buildGeometryEditorSnapshot` sets `canSubmit = validation.valid` (line ~296). | `it("blocks invalid geometry from submit-ready state")` (test:49); `it("rejects out-of-range coordinates …")` (test:63); `it("rejects self-intersecting polygons …")` (test:79) | **Code-verified.** `canSubmit=false` is the single submit gate; all four invalid classes route through it. |
| 3 | import/export covered | `geometryDraftToGeoJson@268` (export) / `parseGeometryDraftGeoJson@272` (import) over `geometryDraftToGeoJsonObject@918` / `geometryDraftFromGeoJsonObject@956`. | `it("round-trips GeoJSON import/export for route corridors")` (test:96); `it("rejects GeoJSON imports with invalid coordinates")` (test:111) | **Code-verified.** Round-trip + malformed-import rejection both covered. |
| 4 | review diff hooks available | `buildReviewDiff@876` → `GeometryReviewDiff { changed, summary[], beforeGeoJson, afterGeoJson }`, exposed as `snapshot.review`; diff computed against optional `baselineDraft`. | `it("exposes review diff hooks for edited geometry")` (test:133) | **Code-verified.** Before/after GeoJSON + human summary present for reviewer/PM diff. |
| 5 | component checks pass | Owner (`MAP-UI-002-INTEGRATE-001` closeout) reports `pnpm --filter @drts/ui-web typecheck` PASS, `test` PASS (2 files / 10 tests), `lint` PASS; `platform-admin-web` typecheck/lint PASS. Plus `it("renders degraded preview state …")` (test:152) covers empty-geometry render. | closeout table + degraded-preview test | **Owner-reported, NOT re-run by this sidecar** — impl is on another branch, not this worktree. See §5. |

---

## 4. UI Design Contract compliance (canonical checklist)

The parent touches a UI surface, so the realm-token / canvas contract applies.

- **Raw-hex scan** of `geometry-editor.tsx` → **0 hardcoded hex color literals**
  (`grep -nE '#[0-9a-fA-F]{3,6}'` returns nothing).
- **Raw-hex scan** of `geometry-editor.stories.tsx` → **0**.
- Colors/typography derive from the canvas token system via
  `DEFAULT_THEME = buildCanvasTheme({ surface: "platform", density: "compact" })`
  (`geometry-editor.tsx:158`); all styling helpers take a `CanvasTheme`.

**Verdict: COMPLIANT.** No `套皮` / raw-palette defect detected in the primitive
or its story. The editor is realm-token driven, not a hardcoded palette. (Full
visual parity vs a specific design-canvas screen is the parent reviewer's call;
this sidecar confirms only the token-source discipline.)

---

## 5. Scope & confidence boundary (what this sidecar did NOT do)

- Did **not** run `pnpm` typecheck/test/lint — the primitive is on
  `codex/map-ui-002-integrate-001`, not in this sidecar worktree; §3 row 5 is
  therefore owner-reported evidence, cited from the integrate closeout, **not**
  independently reproduced here.
- Did **not** edit canonical truth, the parent branch, or `ai-status.json`
  task fields beyond this sidecar's own lifecycle.
- Did **not** approve, absorb, or merge the parent. Absorption into the mainline
  and the parent `review` decision remain with the parent owner (`Codex2`) /
  parent reviewer (`Claude2`).

### Gate B is NOT closed by this primitive

Per the integrate closeout and gate model, `MAP-UI-002` supplies the reusable UI
primitive + preview adapter only. Gate B ("Governance safe to publish") still
requires: `MAP-FE-ADM-001` (publish/retire governance flow + backend
evaluator/audit proof), `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001` final
evidence. Do not count this primitive as Gate B E2E evidence.

---

## 6. Reviewer handoff (→ `Codex2`)

**Recommended acceptance stance for the parent primitive:** acceptance bullets
1–4 are **code-and-test verified** on
`origin/codex/map-ui-002-integrate-001@4c08c6a28`; bullet 5 is owner-reported
green and should be spot-reproduced by whoever formally closes the parent.

Suggested reviewer checklist:

1. Review at `origin/codex/map-ui-002-integrate-001@4c08c6a28` (NOT `dev`).
2. Re-run `pnpm --filter @drts/ui-web typecheck && pnpm --filter @drts/ui-web test && pnpm --filter @drts/ui-web lint`
   to convert §3 row 5 from owner-reported to independently-verified.
3. Confirm design-canvas visual parity for the polygon/circle/route-corridor
   editor screens (token discipline already confirmed clean in §4).
4. Keep the parent `review` decision and mainline absorption with `Codex2` /
   `Claude2`; this packet does not perform it.

**Open items carried forward:** Gate B remains open pending `MAP-FE-ADM-001` /
`MAP-QA-002` / `MAP-OBS-001` / `MAP-REL-001` final evidence (§5).
