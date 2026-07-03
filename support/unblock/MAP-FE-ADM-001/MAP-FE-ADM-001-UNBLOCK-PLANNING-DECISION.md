# MAP-FE-ADM-001 Unblock Planning Decision

## Scope

- Task: `MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION`
- Parent: `MAP-FE-ADM-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-07-03`

## Diagnosis

`MAP-FE-ADM-001` was blocked as though Platform Admin geofence governance still
needed a product or contract decision. The actual repo state was narrower:

1. The backend lifecycle contract already existed for service-area boundaries
   and stop policies.
2. The shared `GeometryEditor` primitive already existed.
3. The canonical Platform Admin canvas still had no `/service-area-governance`
   screen source, so implementation could not safely invent UI.
4. The parent task metadata also pointed to nonexistent `20260701` planning
   files, which made the blocker look less resolved than it really was.

This unblock task therefore needed to do two things:

1. Record the concrete non-visual route and scope decision.
2. Reclassify the remaining gap from "product/contract blocker" to
   "missing canonical visual publication."

## Canonical sources consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md`:

1. `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
2. `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
3. `packages/contracts/src/index.ts`
4. `apps/api/src/modules/service-area/service-area.controller.ts`
5. `apps/api/src/modules/service-area/service-area.service.ts`
6. `apps/api/tests/unit/service-area.service.test.ts`
7. `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`
8. `docs/05-ui/drts-design-canvas/Platform Admin.html`
9. `docs/05-ui/drts-design-canvas/platform-screens-*.jsx`

## Decision

`MAP-FE-ADM-001` is unblocked on the product/contract interpretation.

The binding decisions are:

1. The correct Platform Admin route family is:
   - `/service-area-governance`
   - `/service-area-governance/service-areas/[serviceAreaId]`
   - `/service-area-governance/stop-policies/[stopPolicyId]`
2. Taxi service-area governance is restricted to the accepted service-area
   contract geometry types:
   - polygon
   - circle
3. Route-corridor authoring is explicitly not part of this parent task. It
   remains with Phase 2 sandbox route governance even though the shared
   `GeometryEditor` primitive can support it elsewhere.
4. The preview behavior that exists today is operator-entered
   `POST /service-area/evaluate`. There is no accepted batch impact-preview API
   for "affected sample stops/orders before publish."
5. The missing planning artifact was a canonical non-visual screen packet, not a
   missing domain rule. That packet now exists at:
   `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`
6. The missing `20260701` planning references are now backfilled by:
   - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
   - `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`

## Scope cut and routing

This unblock does **not** claim that the parent can immediately implement the
full UI today.

Out of scope for `MAP-FE-ADM-001` unless separately assigned:

1. Batch affected-order or saved-stop impact preview before publish.
2. Phase 2 sandbox route / approved-operating-area authoring.
3. Inventing Platform Admin visuals before the canonical canvas publishes the
   route family.

Remaining routed blocker:

- Canonical visual publication is still required in:
  - `docs/05-ui/drts-design-canvas/Platform Admin.html`
  - `docs/05-ui/drts-design-canvas/platform-screens-*.jsx`

## Parent unblocked next step

The parent task should replace "missing product / contract decision" with this
more concrete next step:

1. Treat the service-area governance route family and contract scope as
   resolved.
2. Wait specifically for canonical Platform Admin canvas publication for the
   `/service-area-governance` screens.
3. Once those screens land, resume `MAP-FE-ADM-001` and implement strictly
   against:
   - `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`
   - existing `/service-area/admin/*` contracts
   - existing `GET /service-area/definitions`
   - existing `GET /service-area/admin/geojson`
   - existing `POST /service-area/evaluate`
4. Keep batch impact-preview and Phase 2 sandbox geometry work as explicit
   follow-up scope, not as hidden blockers inside the parent task.

## Verification basis

- `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/service-area/service-area.controller.ts`
- `apps/api/src/modules/service-area/service-area.service.ts`
- `apps/api/tests/unit/service-area.service.test.ts`
- `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`
