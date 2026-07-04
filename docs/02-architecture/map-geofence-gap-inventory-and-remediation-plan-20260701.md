# Map Geofence Gap Inventory And Remediation Plan - 2026-07-01 Delta

This file is a focused continuation of
`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`.
It records the planning resolution that unblocks `MAP-FE-ADM-001` at the
product/contract layer without pretending the visual-design gap is already
closed.

## Baseline

- Canonical baseline gap inventory:
  `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- Backend lifecycle authority:
  `apps/api/src/modules/service-area/service-area.controller.ts`
- Shared geometry primitive baseline:
  `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`

## Planning resolution for `MAP-FE-ADM-001`

The blocker is no longer "missing product / contract semantics." The accepted
repo state is now:

1. The Platform Admin taxi-governance route family is
   `/service-area-governance`, with:
   - overview
   - service-area detail
   - stop-policy detail
2. Taxi service-area governance uses only the accepted service-area geometry
   contract:
   - polygon
   - circle
3. Route-corridor authoring remains explicitly outside `MAP-FE-ADM-001` and
   stays with Phase 2 sandbox route governance.
4. The preview contract available today is operator-entered
   `POST /service-area/evaluate`. A bulk "affected sample stops/orders before
   publish" preview has no accepted backend contract yet and is therefore a
   follow-up, not a reason to keep the parent in a vague planning block.
5. The missing artifact was a canonical non-visual UI packet. That artifact now
   exists at:
   `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`

## Remaining blocker classification

`MAP-FE-ADM-001` still cannot claim implementation-ready visual authority until
the canonical Platform Admin canvas publishes `/service-area-governance`
screens. That is a **visual-publication blocker**, not a product/contract
blocker.

Required follow-up outside this delta:

1. Publish the new route family into:
   - `docs/05-ui/drts-design-canvas/Platform Admin.html`
   - `docs/05-ui/drts-design-canvas/platform-screens-*.jsx`
2. Resume `MAP-FE-ADM-001` against the new screen-requirements packet plus the
   existing backend contracts and integrated `GeometryEditor`.

## Parent-task next step

The parent task should replace "missing product / contract decision" with this
explicit next step:

1. Treat service-area governance semantics as resolved by accepted docs and
   contracts.
2. Wait specifically for canonical Platform Admin canvas publication for the
   `/service-area-governance` route family.
3. Once the canvas lands, implement the parent task using:
   - polygon/circle-only geometry editing
   - service-area/stop-policy lifecycle actions
   - operator-entered sample evaluator preview
   - audit receipt surfacing from mutation responses

## Scope cut recorded here

The following are not part of `MAP-FE-ADM-001` unless separately assigned:

1. Batch impact preview across existing orders or saved stop samples.
2. Phase 2 sandbox route or approved operating-area authoring.
3. Any new backend contract beyond the existing `/service-area/admin/*`,
   `/service-area/definitions`, `/service-area/admin/geojson`, and
   `/service-area/evaluate` surfaces.

## Release Closeout Status For `MAP-REL-001`

The release closeout snapshot for `MAP-REL-001` records every `MAP-GAP-*` item
against an owning slice plus a concrete evidence path. No gap row remains
unassigned in this release closeout view.

| Gap ID | Release closeout owner slice | Closeout status | Evidence |
| --- | --- | --- | --- |
| `MAP-GAP-001` | provider abstraction / infra baseline | PASS | `apps/api/src/modules/geo/geo.module.ts`, `apps/api/src/modules/geo/external-geo.provider.ts`, `apps/api/src/modules/geo/geo-provider-config.service.ts`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` |
| `MAP-GAP-002` | geo gateway and typed client | PASS | `docs/04-api/map-geofence-openapi-delta-20260630.md`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |
| `MAP-GAP-003` | callcenter rollout | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json` |
| `MAP-GAP-004` | booking gate authority | PASS | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `MAP-GAP-005` | platform admin geometry governance | PASS | `apps/platform-admin-web/app/service-area-governance/page.tsx`, `apps/platform-admin-web/app/service-area-governance/service-areas/[serviceAreaId]/page.tsx`, `apps/platform-admin-web/app/service-area-governance/stop-policies/[stopPolicyId]/page.tsx`, `support/sidecars/MAP-REL-001/artifacts/platform-admin-service-area-governance-checks-20260704T055525Z.json` |
| `MAP-GAP-006` | ops geographic map | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-ops-ui-20260704T0414Z.json` |
| `MAP-GAP-007` | driver trip map and navigation | PASS | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/artifacts/mobile-simulator-fallback-20260704.json` |
| `MAP-GAP-008` | tenant and concierge coordinate consistency | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260704T0414Z.json` |
| `MAP-GAP-009` | coordinate provenance metadata | PASS | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `MAP-GAP-010` | provider degradation policy | PASS | `scripts/check-map-provider-config.sh`, `apps/api/src/modules/geo/geo-provider-config.service.ts`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` |
| `MAP-GAP-011` | geometry publication workflow | PASS | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `MAP-GAP-012` | spatial audit trail | PASS | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `MAP-GAP-013` | map-based UAT and release evidence | PASS | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/artifacts/mobile-simulator-fallback-20260704.json`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` |
