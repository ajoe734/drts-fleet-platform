# Platform Admin Service-Area Governance Screen Requirements

Date: 2026-07-01

Owner task: `MAP-FE-ADM-001`

Route: `/service-areas`

## Purpose

`/service-areas` is the Platform Admin governance surface for normal taxi service-area boundaries and pickup/dropoff stop policies. It is not the Phase 2 sandbox operating-domain editor. Sandbox ODD operating areas, approved routes, and AV pickup/dropoff zones remain owned by sandbox governance surfaces and must not mutate taxi service-area authority.

## Required Regions

1. Boundary lifecycle table: service-area code, status, effective window, service product types, and geometry version ref.
2. Stop-policy lifecycle table: policy code, direction, effect, status, effective window, service-area scope, and version ref.
3. Reason-gated lifecycle controls: submit review, publish, retire, effective date overrides, and mandatory audit reason.
4. GeometryEditor panel: polygon/circle editing, coordinate validation, self-intersection rejection, GeoJSON/native geometry import, export, and saved-draft guard before publish.
5. Affected sample preview: calls backend service-area evaluator before publish and displays sample decisions, policy reasons, service-area codes, and geometry version refs.
6. GeoJSON import/export: creates new drafts from exported authority features and never auto-publishes.
7. Mutation receipt: backend `auditId`, generated timestamp, record identity, status, and geometry version ref after review/publish/retire/geometry save/import.
8. Sandbox separation warning: stable copy and test hook proving Phase 2 sandbox records are separate authority.

## Gate B Acceptance Hooks

- `data-testid="service-area-governance-page"`
- `data-testid="service-area-boundary-table"`
- `data-testid="service-area-stop-policy-table"`
- `data-testid="service-area-lifecycle-controls"`
- `data-testid="service-area-geometry-editor"`
- `data-testid="service-area-affected-preview"`
- `data-testid="service-area-mutation-receipt"`
- `data-testid="service-area-geojson-panel"`
- `data-testid="service-area-audit-version-summary"`
- `data-testid="service-area-sandbox-boundary-warning"`

## Publish Safety Rules

- Publish requires a selected record, a non-empty audit reason, valid GeometryEditor state, no unsaved geometry draft, and a fresh affected sample preview for the selected record/version.
- Active and retired records are read-only in GeometryEditor; changes must be made through a draft/new version path.
- Affected sample preview must display at least one evaluator response and the geometry version refs returned by backend evaluation.
- Mutation receipts must display backend audit IDs when the backend returns them.

## Evidence Boundary

This screen can prove repo-local UI wiring, evaluator preview calls, lifecycle request/receipt handling, invalid geometry blocking, and sandbox/taxi authority separation. Full production readiness still requires MAP-QA-002 cross-surface evidence, callcenter blocked/manual-review behavior after a published policy, deployed observability, and MAP-REL release evidence.
