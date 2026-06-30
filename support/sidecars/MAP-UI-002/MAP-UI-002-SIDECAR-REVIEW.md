# MAP-UI-002 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `MAP-UI-002` - `GeometryEditor` primitive  
**Parent Branch / Head:** `codex2/map-ui-002` @ `58cb496ef01f4e76e7ebe24b1e539596da38d06f`  
**Parent Owner / Reviewer:** `Codex2` / `Claude2`  
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`  
**Status:** Support-only reviewer packet. This artifact does not modify canonical truth, parent runtime code, contracts, or machine truth by hand.

## 1. Scope Boundary

In scope:

- freeze the current parent review surface for `MAP-UI-002`
- map the runbook acceptance/work items to concrete file anchors
- record design-authority alignment against the Platform Admin sandbox canvas and realm-token rules
- capture an independent verification pass against the parent branch head
- hand off reviewer hotspots to `Codex2`

Out of scope:

- editing `packages/ui-web/`, `apps/platform-admin-web/`, or any parent canonical artifact
- changing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl` directly
- re-scoping the parent from primitive work into full governance publish/review workflow UI

## 2. Machine-Truth Snapshot

### Parent task: `MAP-UI-002`

- status: `review`
- owner / reviewer: `Codex2` / `Claude2`
- dependency: `MAP-BE-006`
- artifact roots: `packages/ui-web/`, `apps/platform-admin-web/`
- last machine-truth `next` note:
  - shared `GeometryEditor` / preview primitives built in `packages/ui-web`
  - sandbox map preview wired to the shared renderer
  - verification recorded with:
    - `pnpm --filter @drts/ui-web typecheck`
    - `pnpm --filter @drts/ui-web lint`
    - `pnpm --filter @drts/platform-admin-web typecheck`
    - `pnpm --filter @drts/platform-admin-web lint`
    - `pnpm exec vitest run tests/unit/ui-web-geometry-editor.test.ts`

### Upstream dependency: `MAP-BE-006`

- status: `done`
- integration status: `merged_to_dev`
- branch closeout commit: `55dad2ca4c79fc7370cf069996efb2ddf2cf704a`
- merged-to-dev commit: `1c06a5cfb56ac94e117d2ed773f5938750be67c0`
- practical meaning for this packet: backend lifecycle / geometry authority prerequisite is satisfied; this sidecar can review the UI primitive against a completed dependency rather than a placeholder API story

### This sidecar task: `MAP-UI-002-SIDECAR-REVIEW`

- owner / reviewer: `Codex` / `Codex2`
- mutates canonical: `false`
- artifact: `support/sidecars/MAP-UI-002/MAP-UI-002-SIDECAR-REVIEW.md`
- acceptance:
  - create support artifacts only
  - do not edit canonical truth
  - hand off the packet to the assigned reviewer

## 3. Parent Review Surface At `58cb496ef`

`git diff --name-only origin/dev..58cb496ef` resolves to exactly five paths:

1. `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx`
2. `packages/ui-web/src/geometry-editor.stories.tsx`
3. `packages/ui-web/src/geometry-editor.tsx`
4. `packages/ui-web/src/index.tsx`
5. `tests/unit/ui-web-geometry-editor.test.ts`

`git show --stat --summary 58cb496ef` reports:

- subject: `feat(MAP-UI-002): add geometry editor primitive`
- files changed: `5`
- insertions / deletions: `1744` / `80`

This is a bounded primitive-oriented review surface, not a broad admin workflow rewrite.

## 4. Acceptance Mapping To File Evidence

### A. Primitive data model, validation, snapshot, and export surface

Primary anchor: `packages/ui-web/src/geometry-editor.tsx`

- `11-97`: typed geometry draft / payload / review-diff model
- `191-201`: empty draft factories for polygon, circle, and route corridor
- `203-252`: validation rules
  - polygon requires `>= 3` vertices and non-zero area
  - circle requires center + positive radius
  - route corridor requires `>= 2` points + positive radius
- `263-280`: snapshot builder emits validation state, backend payloads, GeoJSON, review diff, and `canSubmit`
- `816-901`: backend-ready payload mapping + review diff summary
- `904-980`: GeoJSON export/import normalization for `Feature`, `FeatureCollection`, `Polygon`, `MultiPolygon`, `Point`, `LineString`, and `MultiLineString`

Acceptance alignment:

- runbook asks for polygon / circle / route corridor authoring plus GeoJSON import/export
- the parent branch implements all three draft kinds and serializes them into backend-facing payload shapes without introducing provider-specific map SDK truth into the export path

### B. Interactive editor behavior

Primary anchor: `packages/ui-web/src/geometry-editor.tsx`

- `371-544`: editor state, history stack, vertex selection, import state, stage click handling
- `551-689`: left-side map/editor rail
  - shape switchers for polygon / circle / route corridor
  - undo and discard controls
  - click-to-add geometry on the stage
  - baseline overlay support for review/diff context
- `692-810`: right-side reviewer/operator panels
  - validation state
  - vertex editor or circle radius editor
  - backend-ready payload preview
  - review-diff summary
  - GeoJSON export/import panel

Acceptance alignment:

- runbook asks for vertex edit, radius edit, undo/discard, preview, and validation states
- the primitive supplies all of those in a single canvas-style editor surface

### C. Reusable preview adapter boundary

Primary anchors:

- `packages/ui-web/src/geometry-editor.tsx:283-359`
- `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx:29-114`

Evidence:

- `GeometryPreviewSurface` is exported as a reusable preview renderer rather than being buried inside the admin sandbox page
- the Platform Admin sandbox adapter converts approved `MultiPolygon` and `MultiLineString` records into `GeometryPreviewItem[]`
- the admin sandbox file contains only record-to-preview mapping + canvas-like toolbar styling; geometry rendering stays inside `@drts/ui-web`

Acceptance alignment:

- runbook asks to keep rendering provider-specific code behind a small adapter boundary
- the current parent surface does that: admin sandbox remains a thin adapter over shared preview primitives

### D. Package export and sandbox story coverage

Primary anchors:

- `packages/ui-web/src/index.tsx:158-182`
- `packages/ui-web/src/geometry-editor.stories.tsx:11-61`

Evidence:

- `@drts/ui-web` re-exports `GeometryEditor`, `GeometryPreviewSurface`, snapshot helpers, import/export helpers, and the public types required by downstream governance screens
- Storybook story frames the editor inside a Platform-surface canvas card using the same title/subtitle posture as the sandbox canvas

Acceptance alignment:

- the primitive is packaged for reuse rather than trapped in a single app-local file
- the story provides a reviewer-visible sandbox for the shared component

### E. Targeted test coverage

Primary anchor: `tests/unit/ui-web-geometry-editor.test.ts:15-105`

Covered behaviors:

- backend-ready polygon payload generation
- invalid route corridor gating
- GeoJSON import/export round-trip for route corridors
- review-diff output for edited geometry
- degraded preview rendering when no geometry exists

## 5. Design Authority Alignment

### A. Runbook / gap-inventory alignment

Canonical planning asks for a shared geometry primitive:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` `MAP-UI-002`
  - polygon / circle / route corridor
  - vertex edit / radius edit / undo / discard / preview / validation
  - backend-ready payloads
  - review / diff hooks
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
  - `Platform Admin geometry editor` minimum states include Draft / Preview / Review / Publish / Retire
  - the recommended remaining slice explicitly separates `GeometryEditor` primitive work from the later governance UI built on top of lifecycle APIs

Interpretation for review:

- `MAP-UI-002` is the primitive foundation
- the full publish/review/retire workflow shell belongs to downstream governance work, not this parent primitive alone

### B. Canvas alignment

Canvas authority exists for the surrounding Platform Admin surface:

- `docs/05-ui/drts-design-canvas/platform-sandbox.jsx` -> `PSB_AreasEditor`
- `docs/05-ui/platform-admin-sandbox-governance-v9-parity-20260628.md`

Observed alignment:

- canvas layout uses a `1.6fr / 1fr` split with tool rail, map body, and stacked side cards
- `GeometryEditor` uses the same structural split at `geometry-editor.tsx:551-813`
- the Storybook example uses the same `營運區域 / 路線編輯` framing and `buildCanvasTheme({ surface: "platform", density: "compact" })`
- the sandbox adapter keeps the canvas-like tool rail and caption posture while rendering real approved geometry records

### C. Realm token / palette discipline

The new parent files use theme-driven styling rather than ad hoc hex colors:

- `geometry-editor.tsx` derives all surface, border, text, success, and danger styling from `theme.*`
- `sandbox-geometry-map.tsx` derives toolbar and map styling from `theme.*`
- `geometry-editor.stories.tsx` builds the story theme with `buildCanvasTheme({ surface: "platform", density: "compact" })`

Reviewer conclusion:

- no raw standalone palette was introduced in the new geometry-editor surface
- the primitive follows the repo rule that visual authority stays inside the existing canvas/theme system

## 6. Independent Verification Performed For This Packet

Independent review worktree:

- path: `/tmp/codex-map-ui-002-review`
- branch/head: `codex2/map-ui-002` @ `58cb496ef01f4e76e7ebe24b1e539596da38d06f`

Environment note:

- a fresh worktree did not contain local `node_modules`, so `tsc`, `eslint`, `next`, and `vitest` were initially unavailable
- for verification only, the existing workspace `node_modules` directories from the canonical repo were linked into the temporary review worktree
- no parent source files were edited during this setup

Commands rerun successfully after the dependency link:

1. `pnpm --filter @drts/ui-web typecheck`
2. `pnpm --filter @drts/ui-web lint`
3. `pnpm --filter @drts/platform-admin-web typecheck`
4. `pnpm --filter @drts/platform-admin-web lint`
5. `pnpm exec vitest run tests/unit/ui-web-geometry-editor.test.ts`

Recorded test result:

- `vitest`: `1` test file passed, `5` tests passed

This independent rerun matches the parent task's machine-truth verification claim.

## 7. Reviewer Hotspots For `Codex2`

- **Test breadth vs acceptance wording:** the unit suite covers payload generation, invalid gating, import/export round-trip, review diff, and degraded preview, but it does not perform DOM-level interaction tests for vertex editing, radius editing, or undo/discard. Decide whether that is sufficient for this primitive slice or whether one interaction test should be requested before parent approval.
- **Primitive vs workflow boundary:** do not fail `MAP-UI-002` for not shipping effective-date, actor-confirmation, audit-event, publish, or retire controls. Those appear in the gap-inventory's downstream governance workflow model and are not all required to be implemented inside the shared primitive itself.
- **Circle support is intentional:** the current `PSB_AreasEditor` canvas mock visually emphasizes polygon/route editing, but the runbook explicitly requires circle authoring for the shared primitive. Treat circle support as a required extension from planning truth, not a design drift defect.
- **Route corridor rendering stays schematic:** the preview renders a centerline plus width signal, while the backend-ready payload keeps authority in `centerline + radiusMeters`. That is acceptable if the reviewer agrees the client should not invent buffered corridor geometry as canonical truth.
- **Sandbox integration remains read-only by design:** `sandbox-geometry-map.tsx` reuses the preview renderer for approved geometry records and does not invent save/publish APIs. That matches the v9 parity note that mutable area/route editing remains an API-follow-up surface.

## 8. Reviewer Handoff

Review target:

- artifact: `support/sidecars/MAP-UI-002/MAP-UI-002-SIDECAR-REVIEW.md`
- parent branch head reviewed here: `58cb496ef01f4e76e7ebe24b1e539596da38d06f`
- reviewer ask: confirm the packet accurately captures the five-file parent review surface, the design-authority boundary, the independent verification rerun, and the reviewer hotspots above

Suggested approval wording:

> `MAP-UI-002 sidecar review packet approved: the packet accurately freezes parent review state at 58cb496ef, maps the GeometryEditor primitive acceptance to concrete ui-web/admin/test anchors, confirms theme/canvas alignment plus the thin sandbox preview adapter, and records an independent verification rerun without changing canonical truth.`

If approved, the parent owner still decides whether to absorb any optional follow-up on interaction-test breadth before finalizing the canonical task.
