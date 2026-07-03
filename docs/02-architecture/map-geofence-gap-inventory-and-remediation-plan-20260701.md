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
