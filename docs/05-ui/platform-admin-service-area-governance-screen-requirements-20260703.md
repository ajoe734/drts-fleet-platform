# Platform Admin Service-Area Governance - Screen Requirements

**Date:** 2026-07-03  
**Feature:** platform-admin service-area boundary and stop-policy governance  
**Recipient team:** Visual design / UX  
**Status:** Hand-off input. **No visual decisions in this document.**  
**Author lane:** Codex  
**Authority for behavior/data/API:** `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` · `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` · `packages/contracts/src/index.ts` · `apps/api/src/modules/service-area/service-area.controller.ts`

> This packet exists because the canonical Platform Admin canvas does not yet
> contain `/service-area-governance` screens. Engineering must not invent that
> UI. This note defines the required route set, behavior, and scope cuts so the
> visual team can publish canonical screens and `MAP-FE-ADM-001` can resume
> against an explicit planning artifact.

---

## 1. Why this packet exists

- `MAP-FE-ADM-001` was blocked under a vague "missing product / contract
  decision" label while the actual backend authority stack already existed.
- The current service-area admin contract already supports:
  - list definitions
  - export admin GeoJSON
  - create / update / submit-review / publish / retire for service-area
    boundaries
  - create / update / submit-review / publish / retire for stop policies
- The shared `GeometryEditor` primitive is already available from
  `@drts/ui-web`, but the Platform Admin canvas does not yet publish the screen
  composition for the taxi-governance route family.
- `platformGeometryEditorEnabled` remains the rollout flag that gates the
  eventual UI surface.

## 2. Binding route family and scope boundary

This packet defines the non-visual route family that the visual team should add
to the canonical Platform Admin canvas.

| Screen | Route | Purpose |
| --- | --- | --- |
| Governance overview | `/service-area-governance` | List service-area and stop-policy versions, show lifecycle posture, and open create/edit flows. |
| Service-area detail | `/service-area-governance/service-areas/[serviceAreaId]` | Edit one service-area draft/review version, inspect publish metadata, and retire/create-next-version from existing records. |
| Stop-policy detail | `/service-area-governance/stop-policies/[stopPolicyId]` | Edit one stop-policy draft/review version, inspect publish metadata, and retire/create-next-version from existing records. |

Important scope rule:

- This route family governs **normal taxi service areas and stop policies only**.
- Geometry types here are limited to **polygon** and **circle** because the
  accepted service-area contract is `GeoPolygon | GeoCircle`.
- `GeometryEditor` support for route corridors belongs to the separate Phase 2
  sandbox governance surfaces and must not be surfaced here.

## 3. Backend-authoritative behavior

- Treat the backend service-area contract as the authority for lifecycle state.
  The published status set is:
  - `draft`
  - `review`
  - `active`
  - `retired`
- Published or retired records are not inline-editable. The current service
  logic rejects edits to `active` and `retired` rows; the UI must steer the
  operator toward creating a new version instead of implying direct mutation.
- Publish is allowed from `draft` or `review`.
- Retire moves the record to `retired` and stamps `effectiveUntil`.
- Service-area and stop-policy versions with the same code may not have
  overlapping active effective windows.
- Geometry validation is contract-backed:
  - invalid coordinates are rejected
  - self-intersecting polygons are rejected
  - `effectiveUntil` must be after `effectiveFrom`

The frontend must not reopen these rules as design questions.

## 4. API and data mapping

### 4.1 Read models

| Purpose | Contract / endpoint | Notes |
| --- | --- | --- |
| Load record tables | `ServiceAreaDefinitionsResponse` via `GET /service-area/definitions` | Supplies service-area and stop-policy records plus `generatedAt`. |
| Render governed layer preview | `ServiceAreaGeoJsonResponse` via `GET /service-area/admin/geojson` | Shared visual overlay for overview and detail screens. |
| Run sample evaluator preview | `ServiceAreaEvaluationResult` via `POST /service-area/evaluate` | Preview is for operator-entered sample stops, not batch impact analysis. |

### 4.2 Service-area mutations

| Action | Endpoint | Contract |
| --- | --- | --- |
| Create draft | `POST /service-area/admin/service-areas` | `CreateServiceAreaBoundaryCommand` |
| Update draft/review | `POST /service-area/admin/service-areas/:serviceAreaId/update` | `UpdateServiceAreaBoundaryCommand` |
| Submit for review | `POST /service-area/admin/service-areas/:serviceAreaId/submit-review` | no body |
| Publish | `POST /service-area/admin/service-areas/:serviceAreaId/publish` | `PublishServiceAreaBoundaryCommand` |
| Retire | `POST /service-area/admin/service-areas/:serviceAreaId/retire` | `RetireServiceAreaBoundaryCommand` |

### 4.3 Stop-policy mutations

| Action | Endpoint | Contract |
| --- | --- | --- |
| Create draft | `POST /service-area/admin/stop-policies` | `CreateStopPolicyCommand` |
| Update draft/review | `POST /service-area/admin/stop-policies/:stopPolicyId/update` | `UpdateStopPolicyCommand` |
| Submit for review | `POST /service-area/admin/stop-policies/:stopPolicyId/submit-review` | no body |
| Publish | `POST /service-area/admin/stop-policies/:stopPolicyId/publish` | `PublishStopPolicyCommand` |
| Retire | `POST /service-area/admin/stop-policies/:stopPolicyId/retire` | `RetireStopPolicyCommand` |

### 4.4 Mutation response contract

All admin mutations return `ServiceAreaAdminMutationResponse`:

- mutated `serviceArea` or `stopPolicy`
- `auditId`
- `generatedAt`

The UI should surface `auditId` in success receipts because parent acceptance
requires actor/version/effect/effective-date traceability.

## 5. Per-screen functional briefs

### 5.1 Governance overview - `/service-area-governance`

- **Purpose:** single entry for service-area boundaries and stop policies.
- **Primary data:** two record collections, freshness timestamp, and governed
  GeoJSON overlay.
- **Required table signals:**
  - code (`areaCode` or `policyCode`)
  - display name
  - lifecycle status
  - version
  - service products
  - effective window
  - updated timestamp
- **Required actions:**
  - create service-area draft
  - create stop-policy draft
  - open selected version detail
  - retire active version
  - start next version from an active or retired baseline
- **Map requirement:** selected row highlights its geometry on a governed map
  preview using `GET /service-area/admin/geojson`.
- **States:** loading, empty, feature-flag-off, fetch-failed, stale-data
  warning, conflict receipt after mutation.

### 5.2 Service-area detail - `/service-area-governance/service-areas/[serviceAreaId]`

- **Purpose:** edit and publish one service-area version.
- **Required fields:**
  - `areaCode`
  - `displayName`
  - `geometry`
  - `serviceProductTypes`
  - `effectiveFrom`
  - `effectiveUntil`
  - metadata summary if present
- **Geometry authoring:** use `GeometryEditor` in **polygon/circle only** mode.
- **Lifecycle actions:**
  - save draft changes
  - submit for review
  - publish
  - retire
  - create next version from non-editable active/retired record
- **Preview panel:** operator-entered sample evaluation form using
  `POST /service-area/evaluate` with:
  - selected service product
  - pickup point
  - optional dropoff point
  - returned decision, reason codes/messages, service-area codes, and geometry
    version refs
- **States/errors:** lifecycle conflict, invalid geometry, invalid effective
  window, overlapping active window, invalid coordinate, mutation/audit receipt.

### 5.3 Stop-policy detail - `/service-area-governance/stop-policies/[stopPolicyId]`

- **Purpose:** edit and publish one stop-policy version.
- **Required fields:**
  - `policyCode`
  - `displayName`
  - `direction`
  - `effect`
  - `geometry`
  - `serviceAreaCodes`
  - `serviceProductTypes`
  - `reasonCode`
  - `reasonMessage`
  - `effectiveFrom`
  - `effectiveUntil`
- **Geometry authoring:** use `GeometryEditor` in **polygon/circle only** mode.
- **Lifecycle actions:**
  - save draft changes
  - submit for review
  - publish
  - retire
  - create next version from non-editable active/retired record
- **Preview panel:** same operator-entered evaluator path as service-area
  detail, with emphasis on pickup/dropoff direction and effect:
  - `allow`
  - `deny`
  - `manual_review`
- **States/errors:** lifecycle conflict, invalid geometry, invalid effective
  window, overlapping active window, invalid coordinate, mutation/audit receipt.

## 6. Scope cuts and explicit follow-up

The parent task should treat the following as resolved scope cuts, not open
product questions:

1. **No route-corridor authoring on this route family.** Corridor authoring
   stays with Phase 2 sandbox route governance.
2. **No batch affected-order preview in this task.** The accepted backend
   contract only exposes operator-entered `POST /service-area/evaluate`. A bulk
   impact-preview API would be a separate backend-plus-frontend follow-up.
3. **No client-invented authority matrix.** The route should honor backend
   contract errors and audit receipts instead of hard-coding new role semantics
   not present in the accepted sources.

## 7. Open visual questions for design

- Should the overview use tabs, side-by-side lists, or a queue-plus-detail
  split for service areas vs stop policies?
- What is the clearest way to show "active/retired records are read-only; start
  a new version instead" without making the lifecycle feel hidden?
- How should the sample evaluator preview sit beside the geometry editor:
  drawer, split panel, or secondary card stack?
- How should the Platform Admin IA distinguish taxi service-area governance from
  Phase 2 sandbox geometry governance so operators do not confuse the two
  authority domains?

## 8. Evidence and verification basis

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/service-area/service-area.controller.ts`
- `apps/api/src/modules/service-area/service-area.service.ts`
- `apps/api/tests/unit/service-area.service.test.ts`
- `apps/api/src/modules/feature-flags/feature-flags.service.ts`
