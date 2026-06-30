# Map, Geofence, and Address-Pinning Gap Inventory

**Date:** 2026-06-30
**Status:** code-backed gap inventory and remediation plan
**Scope:** Driver App, Ops Console, Callcenter, Platform Admin / Phase 2 sandbox governance, Tenant Console, Tenant Portal, Concierge Portal, partner / passenger booking entry points, API contracts, PostGIS authority.

## Executive Summary

The platform currently has coordinate-carrying contracts and driver location heartbeat, but it does not have a complete map stack. The most important gap is not visual polish; it is operational correctness. Callcenter agents, tenant admins, passengers, dispatchers, and platform admins cannot consistently choose, verify, view, or govern pickup/dropoff points on a real map.

Current code supports these partial capabilities:

| Capability                                            | Current state                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver GPS heartbeat                                  | Exists through `expo-location`; used for location updates, not map rendering.                                                                                                                      | `apps/driver-app/package.json:36`, `apps/driver-app/lib/driver-location-heartbeat.ts:5`                                                                                                                                                |
| Address contracts can carry coordinates               | `AddressPayload` has optional `lat` / `lng`.                                                                                                                                                       | `packages/contracts/src/index.ts:2122`                                                                                                                                                                                                 |
| Phone booking backend can persist coordinates if sent | `createCallCenterOrder` copies `pickup` / `dropoff` payloads as-is.                                                                                                                                | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:444`                                                                                                                                                                    |
| Callcenter phone booking UI                           | `MAP-FE-CALL-001` is in review: pickup/dropoff now use a shared map pair picker with provider search, manual coordinate fallback, serviceability preview, and coordinate/provenance submit gating. | `apps/ops-console-web/app/callcenter/page.tsx:2650`, `apps/ops-console-web/app/callcenter/map-booking.ts:1`, `tests/e2e/ops-console-parity.spec.ts:333`                                                                                |
| Ops dispatch spatial board                            | CSS/SVG coordinate projection only; not a real map provider.                                                                                                                                       | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:727`, `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:2161`                                                                                                          |
| Driver trip UI                                        | Has decorative map-like surface and route summary; no native map SDK or navigation surface.                                                                                                        | `apps/driver-app/app/trip.tsx:1829`, `apps/driver-app/components/route-display.tsx:10`                                                                                                                                                 |
| Tenant address master                                 | Allows manual lat/lng entry; no map picker.                                                                                                                                                        | `apps/tenant-portal-web/app/addresses/page.tsx:83`                                                                                                                                                                                     |
| Tenant Console booking                                | Can load saved address lat/lng and has manual address fields; no map pinning.                                                                                                                      | `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:956`, `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1518`                                                                          |
| Concierge booking                                     | Sends text pickup/dropoff only.                                                                                                                                                                    | `apps/concierge-portal-web/app/bookings/new/page.tsx:348`                                                                                                                                                                              |
| Service-area / stop-policy authority                  | Backend contract, evaluator, booking gate, audit snapshots, PostGIS persistence, and admin lifecycle APIs are in review; frontend map entry and admin editor remain open.                          | `packages/contracts/src/index.ts:73`, `apps/api/src/modules/service-area/service-area.controller.ts:8`, `infra/migrations/V0036__service_area_geofence_authority.sql:5`, `infra/migrations/V0037__service_area_review_lifecycle.sql:1` |
| Phase 2 sandbox map editor                            | Explicitly called out as missing design / implementation work.                                                                                                                                     | `docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md:68`                                                                                                                                                   |

Recommendation: treat this as a P0 cross-surface "spatial authority" gap. The first production slice should not be a fancy map board. It should make phone booking and address creation produce governed coordinates, then evaluate those coordinates against service area / stop policies before dispatch.

Implementation progress as of 2026-06-30:

- `MAP-BE-001` added geo/provenance contracts and service-area authority types.
- `MAP-INFRA-001` added the map-provider operational foundation: `GET /api/geo/health`,
  fail-closed runtime checks for stage/prod provider misconfiguration, map
  provider env documentation, quota/key restriction fields, preflight deploy
  verification, and initial alert rules.
- `MAP-UI-001` added the shared provider-neutral `AddressMapPicker` /
  `AddressMapPairPicker` primitive foundation in `@drts/ui-web/client`, including
  candidate payload helpers, manual coordinate fallback helpers, service-area
  preview command construction, and mock-provider-friendly component tests. A
  design-canvas requirements note was added because the current canvas still
  only shows text pickup/dropoff fields.
- `MAP-FE-CALL-001` is in review: Callcenter phone booking uses
  `AddressMapPairPicker`, blocks coordinate-less/provenance-less submit, shows
  serviceable/manual-review/not-serviceable preview state, and submits full
  pickup/dropoff address payloads through `CreateCallCenterOrderCommand`.
- `MAP-BE-002` added the API geo gateway with deterministic mock-provider behavior.
- `MAP-BE-003` added typed API-client coverage and endpoint delta docs for geo and service-area flows.
- `MAP-BE-004` is in review: passenger, callcenter, and tenant owned-mobility booking creation now evaluate service-area decisions when coordinates are present; no-pickup/not-serviceable decisions hard-block creation, manual-review decisions route away from normal dispatch, and text-only legacy orders become explicit coordinate-missing manual-review cases.
- `MAP-BE-005` is in review: created orders now carry immutable spatial audit snapshots with coordinate provenance, actor/surface, service-area decision, area/policy/version refs, and audit event evidence.
- `MAP-BE-006` is in review: service-area boundary and stop-policy management APIs now support draft/review/publish/retire lifecycle, effective dating, version refs, geometry validation, GeoJSON persistence payloads, mutation audit, and immediate evaluator refresh for published records. The re-review fix also adds Phase 2 sandbox-governance lifecycle APIs, GeoJSON exports for ODD operating areas, approved routes, and pickup/dropoff-zone stop-policy aliases, plus lifecycle audit coverage for sandbox experiments, jurisdictions, approval documents, and experiment authorization suspend/resume paths.
- Still open: final visual design sign-off for map picker surfaces, geometry
  editor UI, tenant/concierge/partner map entry, ops/admin/driver map surfaces,
  full metrics/dashboard wiring, release gates, and cross-surface E2E proof
  for serviceable/manual-review/blocked/provider-degraded paths.

## Product Impact

| Surface                            | What users need                                                                                                   | Current failure mode                                                                                                                       | Severity |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Callcenter                         | Search an address, confirm exact pickup/dropoff pin, tell caller whether service is available.                    | `MAP-FE-CALL-001` now gates coordinate-less submit in review; remaining risk is full backend/provider E2E and production rollout evidence. | P0       |
| Ops dispatch                       | See orders, drivers, candidate supply, stale supply, and exceptions on a real geography view.                     | Existing board is relative projection; it cannot verify roads, landmarks, service zones, or no-pickup areas.                               | P0       |
| Platform Admin / Phase 2           | Draw and publish service areas, no-pickup/no-dropoff zones, sandbox operating areas, approved routes, schedules.  | No map editor; Phase 2 explicitly requires polygon/route/stop editing but lacks UI.                                                        | P0       |
| Tenant / Enterprise booking        | Choose saved addresses or pin exact pickup/dropoff, especially campuses, hospitals, airports, and business parks. | Some flows accept address text or manual lat/lng; no map-assisted confirmation.                                                            | P1       |
| Concierge / passenger-facing entry | Help non-technical users select exact pickup point.                                                               | Text-only pickup/dropoff; no serviceability feedback before submission.                                                                    | P1       |
| Driver app                         | Understand pickup/dropoff location and open navigation safely.                                                    | GPS heartbeat exists, but trip surface is route summary/decorative map, not map/navigation.                                                | P1       |
| Reporting / compliance             | Prove why a booking was allowed, blocked, or manually reviewed.                                                   | Backend spatial audit snapshots are in review, but cross-surface UI capture and E2E evidence are still open.                               | P1       |

## Current Technical Findings

### 1. There is no map SDK foundation

Repo-wide dependency search shows only `expo-location` for the driver app. There is no `react-native-maps`, Mapbox / MapLibre, Google Maps React package, Leaflet, OpenLayers, or Turf dependency currently installed in app/package manifests.

Evidence:

- `apps/driver-app/package.json:36` includes `expo-location`.
- No app package currently declares a web or native map rendering SDK.

Implication: every surface that looks map-like today is either text, manual coordinate fields, or custom CSS/SVG projection.

### 2. Address contracts are ahead of the UI

`AddressPayload` already has optional `lat` and `lng`, and booking commands reuse that payload. This is useful because adding map pinning does not require replacing the order model.

Evidence:

- `AddressPayload.lat` / `AddressPayload.lng`: `packages/contracts/src/index.ts:2129`.
- `CreateCallCenterOrderCommand.pickup/dropoff`: `packages/contracts/src/index.ts:2258`.
- `CreateTenantBookingCommand.pickup/dropoff`: `packages/contracts/src/index.ts:2268`.

Gap: `AddressPayload` lacks explicit geocode metadata such as `placeId`, `geocodeProvider`, `geocodeConfidence`, `coordinateSource`, `pinnedBy`, and `pinnedAt`.

### 3. Callcenter is the highest-risk missing map surface

The phone booking form constructs:

```ts
pickup: { address: orderForm.pickupAddress },
dropoff: { address: orderForm.dropoffAddress },
```

Evidence: `apps/ops-console-web/app/callcenter/page.tsx:2136`.

Backend persistence would preserve coordinates if they were provided:

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:444`.

Gap: the UI never collects coordinates. A phone booking can reach dispatch as text-only even when the caller has described an exact corner, gate, entrance, airport terminal, hospital door, or restricted zone.

### 4. Ops Console spatial board is a projection, not a map

`dispatch-workflow.tsx` normalizes lat/lng bounds and projects points into percentages:

- `normalizeSpatialBounds`: `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:714`.
- `projectSpatialPoint`: `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:727`.
- Spatial board render shell: `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:2161`.

This is useful as an MVP visualization, but it cannot show base maps, roads, geofences, landmarks, jurisdiction boundaries, or official no-stop areas.

### 5. Driver app has tracking, not map navigation

Driver app location heartbeat is real:

- `apps/driver-app/lib/driver-location-heartbeat.ts:5`.

Trip UI map is decorative / schematic:

- `apps/driver-app/app/trip.tsx:1829`.

Route display is textual and explicitly says route info is a summary:

- `apps/driver-app/components/route-display.tsx:10`.

Gap: no native map view, no route polyline, no driver location marker, no pickup/dropoff pin confirmation, no external navigation launch contract.

### 6. Tenant / Concierge / passenger flows are inconsistent

Tenant Portal address book allows manual coordinates:

- `apps/tenant-portal-web/app/addresses/page.tsx:83`.

Tenant Console booking can inherit saved address coordinates:

- `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:956`.

Concierge booking sends text-only addresses:

- `apps/concierge-portal-web/app/bookings/new/page.tsx:348`.

Gap: there is no shared map picker or geocode normalization path, so coordinate quality depends on which entry surface created the address/order.

### 7. Service-area authority now has backend lifecycle coverage, but no admin UI yet

Backend coverage in review:

- Contract types: `packages/contracts/src/index.ts:73`.
- API controller: `apps/api/src/modules/service-area/service-area.controller.ts:8`.
- Evaluation service: `apps/api/src/modules/service-area/service-area.service.ts:167`.
- PostGIS migration: `infra/migrations/V0036__service_area_geofence_authority.sql:5`.
- Review lifecycle migration: `infra/migrations/V0037__service_area_review_lifecycle.sql:1`.

Closed or in-review backend deltas:

- API client methods for service-area definitions/evaluation were added in `MAP-BE-003`.
- OpenAPI delta documentation was added in `MAP-BE-003`.
- Booking creation now calls service-area evaluation in `MAP-BE-004`.
- Order-level spatial audit snapshots were added in `MAP-BE-005`.
- Admin lifecycle APIs for boundaries and stop policies were added in `MAP-BE-006`.
- Phase 2 sandbox-governance lifecycle APIs and GeoJSON exports for ODD
  boundaries, approved routes, and pickup/dropoff-zone stop-policy layers were
  added in the `MAP-BE-006` re-review fix.
- Sandbox-governance experiment, jurisdiction, approval-document, and experiment
  authorization lifecycle mutations now emit audit records with request identity
  and request-id propagation.

Remaining lifecycle gaps:

- Tenant, concierge, and partner booking forms do not show serviceability feedback.
- Callcenter serviceability feedback is implemented in review, but still needs
  full serviceable/manual-review/blocked/provider-degraded E2E with the backend
  authority stack enabled.
- Platform Admin does not yet have a map editor or review/publish UI for these APIs.
- Ops cannot see which policy caused `not_serviceable` or `manual_review`.

## Gap Inventory

| Gap ID      | Title                                                     | Current evidence                                                                                                                                          | Required end state                                                                                                    | Severity |
| ----------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| MAP-GAP-001 | No shared map provider abstraction                        | Only `expo-location` appears in app deps.                                                                                                                 | Web and native map provider adapters behind stable app-level interfaces.                                              | P0       |
| MAP-GAP-002 | No geocoding / reverse-geocoding authority                | Address text accepted directly in multiple flows.                                                                                                         | API-backed geocode search/resolve with audit, cache, confidence, and normalized address.                              | P0       |
| MAP-GAP-003 | Callcenter map pinning rollout                            | `MAP-FE-CALL-001` adds map pair picking, manual coordinate fallback, provenance gating, and an initial E2E gate smoke; full backend/provider E2E remains. | Agent can search, pin, drag, and confirm pickup/dropoff; command includes lat/lng and metadata with release evidence. | P0       |
| MAP-GAP-004 | Service-area evaluator not integrated into order creation | Backend booking creation integration is in review; coordinate-less UIs still enter the legacy manual-review path.                                         | Booking creation blocks, warns, or routes to manual review based on evaluator decision across all entry surfaces.     | P0       |
| MAP-GAP-005 | Platform Admin has no geofence editor                     | Phase 2 handoff says map editor is needed.                                                                                                                | Versioned polygon/circle/route editor with publish workflow and audit.                                                | P0       |
| MAP-GAP-006 | Ops map is not geographic                                 | Current board uses percent projection.                                                                                                                    | Real map board with orders, supply, stale/no-location states, service areas, stop policies.                           | P0       |
| MAP-GAP-007 | Driver app has no map/navigation surface                  | Decorative map + route summary only.                                                                                                                      | Native trip map and external navigation launch, with route authority disclaimers.                                     | P1       |
| MAP-GAP-008 | Tenant and concierge flows are not coordinate-consistent  | Tenant address master can hand-enter lat/lng; concierge is text-only.                                                                                     | All address/order entry surfaces use the same picker and validation model.                                            | P1       |
| MAP-GAP-009 | No coordinate provenance metadata                         | `AddressPayload` only has optional lat/lng.                                                                                                               | Store source, provider, place id, confidence, pinned actor/time, manual override reason.                              | P1       |
| MAP-GAP-010 | No map/provider degradation policy                        | Existing flows cannot distinguish provider outage from missing coordinates.                                                                               | Deterministic fallbacks: manual coordinate entry, text-only manual review, and provider outage alerts.                | P1       |
| MAP-GAP-011 | No geometry publication workflow                          | Backend lifecycle APIs are in review; no Platform Admin geometry editor/review UI yet.                                                                    | Draft -> review -> active -> retired geometry lifecycle with effective dating is usable without SQL.                  | P0       |
| MAP-GAP-012 | No spatial audit trail on orders                          | Backend order snapshots are in review; end-to-end reporting proof is still open.                                                                          | Every order stores serviceability decision and policy/version IDs used at creation.                                   | P1       |
| MAP-GAP-013 | No UAT evidence for map-based flows                       | Current tests cover heartbeat and projection, not true map entry.                                                                                         | Playwright/mobile evidence with mocked provider and real provider smoke path.                                         | P1       |

## Target Architecture

### Authority principles

| Principle                                     | Decision                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Map tiles are not authority                   | Map providers render context and help select points; internal `AddressPayload` + geocode metadata + PostGIS geometries are authority. |
| Service-area enforcement is backend authority | Frontends may preview, but order creation must call backend evaluation or rely on backend gate.                                       |
| Geometry is governance data                   | Service areas, stop policies, operating areas, approved routes, and sandbox ODD polygons require versioning and audit.                |
| Coordinates need provenance                   | A lat/lng without source and confidence is not enough for audit, complaint handling, or compliance.                                   |
| Provider outage must fail predictably         | Text-only booking can continue only when explicitly marked manual-review or dispatch-operator accepted.                               |

### Logical components

| Component              | Location                                                | Responsibility                                                                       |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GeoProvider` adapter  | `apps/api/src/modules/geo` or shared provider package   | Search, resolve, reverse geocode, normalize, and expose provider-neutral results.    |
| `GeoGatewayController` | API                                                     | `GET /api/geo/search`, `POST /api/geo/resolve`, `POST /api/geo/reverse`.             |
| `AddressMapPicker`     | `packages/ui-web` or `apps/*/components` promoted later | Shared web address search + map pin + coordinate preview component.                  |
| `ServiceAreaService`   | API                                                     | Governed serviceability and stop-policy evaluation.                                  |
| `GeometryEditor`       | Platform Admin                                          | Draw/edit polygons, circles, route corridors, pickup/dropoff policy zones.           |
| `OpsMapBoard`          | Ops Console                                             | Real-time order/supply/service-area layer visualization.                             |
| `DriverTripMap`        | Driver App                                              | Native trip map, current location, pickup/dropoff pins, external navigation handoff. |

### Data model additions

Add optional fields to `AddressPayload` or introduce an `AddressCoordinatePayload` nested object to avoid breaking existing commands:

| Field                   | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `lat`, `lng`            | Existing coordinate fields; keep for compatibility.                                          |
| `placeId`               | Provider-neutral or provider-specific place reference when available.                        |
| `geocodeProvider`       | Provider used for the candidate.                                                             |
| `geocodeConfidence`     | Numeric or enum confidence (`exact`, `interpolated`, `approximate`, `manual`).               |
| `coordinateSource`      | `provider_candidate`, `manual_pin`, `saved_address`, `reverse_geocode`, `external_platform`. |
| `pinnedByActorId`       | Actor who confirmed/overrode the pin.                                                        |
| `pinnedAt`              | Timestamp of coordinate confirmation.                                                        |
| `coordinateAccuracyM`   | Approximate confidence radius.                                                               |
| `serviceAreaEvaluation` | Snapshot on order/booking, not necessarily embedded in `AddressPayload`.                     |

### Service-area evaluation snapshot

Every booking/order creation path should persist:

| Field                            | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `decision`                       | `serviceable`, `manual_review`, `not_serviceable`.  |
| `serviceProductType`             | Product evaluated.                                  |
| `evaluatedAt`                    | Time of decision.                                   |
| `serviceAreaCodes`               | Matched service areas.                              |
| `policyCodes`                    | Matched stop policies.                              |
| `reasonCodes` / `reasonMessages` | User/operator-facing reason.                        |
| `geometryVersionRefs`            | Version IDs or area/policy versions used for audit. |

## Remediation Plan

### Phase 0: Spatial foundation decisions

**Goal:** choose the provider and boundary contracts before UI work fans out.

Tasks:

| Task ID | Task                                     | Output                                                                                                                         |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| MAP-000 | Select web/native map provider strategy. | Decision packet covering Taiwan coverage, cost, licensing, mobile SDK support, offline/navigation handoff, and data retention. |
| MAP-001 | Define environment/config model.         | `MAP_PROVIDER`, browser key, server key, allowed origins, quota and alert thresholds.                                          |
| MAP-002 | Define provider outage policy.           | When to allow text-only order, when to force manual review, and what operators see.                                            |
| MAP-003 | Define coordinate provenance schema.     | Contract update for source/confidence/place/pin actor.                                                                         |

Acceptance criteria:

- One provider strategy is selected, or an adapter interface is accepted with one default provider.
- Secrets and public keys are separated.
- Provider outage behavior is documented before UI work ships.

### Phase 1: API and contract foundation

**Goal:** make coordinates, geocode, and service-area decisions backend-governed.

Tasks:

| Task ID | Task                                                  | Output                                                                                                            |
| ------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| MAP-010 | Add `GeoModule`.                                      | Provider-neutral search/resolve/reverse APIs.                                                                     |
| MAP-011 | Extend contracts.                                     | `GeocodeCandidate`, `ResolveAddressCommand`, coordinate provenance fields, service-area client response envelope. |
| MAP-012 | Add API client methods.                               | `searchGeo`, `resolveGeo`, `reverseGeo`, `getServiceAreaDefinitions`, `evaluateServiceArea`.                      |
| MAP-013 | Add OpenAPI coverage.                                 | Document geo and service-area endpoints.                                                                          |
| MAP-014 | Integrate `ServiceAreaService` into booking creation. | Owned, callcenter, tenant, concierge/partner flows get serviceability decision before dispatch.                   |
| MAP-015 | Persist evaluation snapshots.                         | Orders and bookings store decision/policy/version refs.                                                           |

Acceptance criteria:

- Backend rejects invalid coordinates.
- Backend can evaluate pickup and dropoff for every service product.
- Booking creation returns clear `NOT_SERVICEABLE`, `STOP_REQUIRES_MANUAL_REVIEW`, or `PICKUP_NOT_ALLOWED` style errors.
- Existing text-only tests keep passing through explicit compatibility path.

### Phase 2: Shared web map picker

**Goal:** prevent each web surface from inventing a different address/pin UX.

Tasks:

| Task ID | Task                      | Output                                                                                        |
| ------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| MAP-020 | Build `AddressMapPicker`. | Search box, candidate list, map pin, draggable marker, lat/lng display, service-area preview. |
| MAP-021 | Add degraded/manual mode. | Manual lat/lng fields behind warning banner when provider unavailable.                        |
| MAP-022 | Add i18n strings.         | zh-TW/en labels for serviceable/manual review/out of area/no geocode.                         |
| MAP-023 | Add test harness.         | Mocked provider for Playwright and component tests.                                           |

Acceptance criteria:

- Picker can emit `AddressPayload` with address, lat, lng, and provenance.
- Picker can call service-area evaluate after both pickup/dropoff are available.
- Picker has keyboard-accessible fallback and visible provider outage state.

### Phase 3: Callcenter P0 implementation

**Goal:** phone bookings must be pinnable and serviceability-aware.

Tasks:

| Task ID | Task                                                        | Output                                                                                                          |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| MAP-030 | Replace pickup/dropoff text fields with `AddressMapPicker`. | Agents search and pin both points.                                                                              |
| MAP-031 | Show service-area decision before submit.                   | Serviceable/manual-review/not-serviceable banner in callcenter resolution desk.                                 |
| MAP-032 | Submit lat/lng and provenance.                              | `CreateCallCenterOrderCommand` carries full pickup/dropoff payload.                                             |
| MAP-033 | Add manual-review fallback.                                 | If no reliable coordinate, order is created only with explicit manual-review reason or blocked based on policy. |
| MAP-034 | Add callcenter tests.                                       | Unit + Playwright flow for create phone booking with coordinates and blocked out-of-area booking.               |

Implementation status:

- `MAP-FE-CALL-001` implements MAP-030 through the frontend portion of MAP-034
  and is ready for review.
- Covered now: shared `AddressMapPairPicker` integration, provider search/resolve
  wiring, manual coordinate fallback, provenance gating, serviceability preview,
  coordinate payload submit, unit tests, and initial Playwright gate smoke.
- Still required before Gate A can close: full E2E against the backend authority
  stack for serviceable order creation, no-pickup/not-serviceable block,
  manual-review routing, provider-degraded manual fallback, and persisted spatial
  audit snapshot verification.

Acceptance criteria:

- Agent cannot unknowingly create a coordinate-less dispatchable booking.
- Successful phone booking has pickup/dropoff coordinates.
- Out-of-service pickup/dropoff cannot silently enter normal dispatch.
- Dispatch trace includes service-area decision.

### Phase 4: Tenant, concierge, and partner address entry

**Goal:** every customer/tenant-originated order uses the same coordinate semantics.

Tasks:

| Task ID | Task                                  | Output                                                                             |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| MAP-040 | Upgrade Tenant Portal address book.   | Map picker replaces manual lat/lng fields, while retaining advanced manual entry.  |
| MAP-041 | Upgrade Tenant Console booking.       | Saved address selection shows pin; manual address uses picker.                     |
| MAP-042 | Upgrade Concierge booking.            | Same picker as callcenter, with desk default location as initial pin.              |
| MAP-043 | Audit partner/passenger entry points. | Partner booking, bank/concierge embeds, enterprise dispatch align to same payload. |
| MAP-044 | Add service-area preview.             | Frontend feedback before submit, backend gate remains authoritative.               |

Acceptance criteria:

- Saved addresses have coordinates or explicit missing-coordinate warning.
- Tenant/concierge/partner bookings all submit coordinates when dispatchable.
- All surfaces display the same reason codes for blocked/manual-review stops.

### Phase 5: Ops real map board

**Goal:** replace the current relative spatial projection with a real operational map.

Tasks:

| Task ID | Task                                       | Output                                                                                         |
| ------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| MAP-050 | Build `OpsMapBoard`.                       | Map layer with orders, pickup/dropoff pins, candidate supply, stale supply, no-location state. |
| MAP-051 | Add service-area and stop-policy overlays. | Dispatchers can see zones causing block/manual review.                                         |
| MAP-052 | Add queue-to-map linking.                  | Clicking queue item pans/zooms to order and candidates.                                        |
| MAP-053 | Add stale-location evidence.               | Visual freshness badges and diagnostic drawer.                                                 |
| MAP-054 | Keep projection fallback.                  | If provider unavailable, existing spatial board remains degraded fallback.                     |

Acceptance criteria:

- Dispatchers can inspect pickup/dropoff geography and candidate supply on actual map context.
- Stale/no-location candidates are visibly distinct.
- Service areas and restricted stops are visible and filterable.

### Phase 6: Platform Admin / Phase 2 geofence governance

**Goal:** platform admins can safely author, review, version, and publish spatial rules.

Tasks:

| Task ID | Task                                        | Output                                                                                                |
| ------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| MAP-060 | Add Service Area Governance route.          | Platform Admin page for service-area boundaries and stop policies.                                    |
| MAP-061 | Add geometry editor.                        | Draw polygon, circle, route corridor; edit vertices; import/export GeoJSON.                           |
| MAP-062 | Add lifecycle workflow.                     | Draft, review, publish active version, retire, effective dating.                                      |
| MAP-063 | Add policy editor.                          | Direction (`pickup`, `dropoff`, `both`), effect (`allow`, `deny`, `manual_review`), service products. |
| MAP-064 | Add Phase 2 sandbox operating area support. | Approved areas/routes/schedules share geometry primitives but remain separate regulatory domain.      |
| MAP-065 | Add audit and preview.                      | Preview affected sample stops/orders before publish; audit every geometry mutation.                   |

Acceptance criteria:

- Admin can create active service area and stop policy without SQL.
- Versioned publish updates evaluator state.
- A published no-pickup zone blocks callcenter/tenant booking creation through backend gate.
- Phase 2 sandbox routes/areas can be modeled without mixing them with normal taxi service areas.

Implementation note as of 2026-06-30: `MAP-BE-006` covers the backend lifecycle
APIs and evaluator refresh path for this phase. The re-review fix in
`codex/map-be-006` also covers Phase 2 sandbox ODD boundaries, routes, and
pickup/dropoff-zone stop-policy aliases with GeoJSON map-layer exports and
audited sandbox experiment/jurisdiction/approval-document lifecycle changes. The
Platform Admin map editor, review workflow UI, and publish/retire operator
experience remain open in `MAP-UI-002` and `MAP-FE-ADM-001`.

### Phase 7: Driver app map/navigation

**Goal:** help drivers safely find pickup/dropoff without turning the driver app into the geofence authority.

Tasks:

| Task ID | Task                             | Output                                                                                           |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| MAP-070 | Add native map SDK.              | Driver trip map with current location, pickup/dropoff pins, basic route preview.                 |
| MAP-071 | Add external navigation handoff. | Open Apple Maps / Google Maps / installed navigation with pickup/dropoff coordinates.            |
| MAP-072 | Add route authority copy.        | Forwarded orders show source-platform route authority; DRTS orders show DRTS route authority.    |
| MAP-073 | Add offline/degraded behavior.   | If map unavailable, show coordinates, address, call ops, and external navigation fallback.       |
| MAP-074 | Add mobile UAT.                  | Android/iOS device evidence for map load, location permission, background heartbeat coexistence. |

Acceptance criteria:

- Driver can see actual pickup/dropoff points on trip screen.
- Driver can launch navigation with correct coordinates.
- Location heartbeat continues to work with map SDK installed.

### Phase 8: Observability, tests, and release gates

**Goal:** make spatial behavior testable and supportable.

Tasks:

| Task ID | Task                        | Output                                                                                                              |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| MAP-080 | Add metrics.                | Geocode success rate, provider latency, provider errors, coordinate-less booking attempts, service-area block rate. |
| MAP-081 | Add audit events.           | `geo.address.resolved`, `geo.pin.confirmed`, `service_area.evaluated`, `service_area.policy.published`.             |
| MAP-082 | Add Playwright map mocks.   | Deterministic UI tests independent of external provider.                                                            |
| MAP-083 | Add contract tests.         | Geometry validation, service-area decisions, error-code compatibility.                                              |
| MAP-084 | Add UAT evidence checklist. | Callcenter, tenant, ops, platform-admin, driver map paths.                                                          |

Acceptance criteria:

- CI can run without calling real map provider.
- Stage smoke can call real provider behind guarded credentials.
- Every serviceability block/manual-review path has a visible operator/user reason.

## Proposed Execution Order

| Order | Work package                                      | Why first                                                         |
| ----- | ------------------------------------------------- | ----------------------------------------------------------------- |
| 1     | MAP-000 to MAP-003 provider/contract decisions    | Prevents rework across all apps.                                  |
| 2     | MAP-010 to MAP-015 API + service-area gate        | Backend authority must exist before UI previews become trusted.   |
| 3     | MAP-020 to MAP-034 shared picker + callcenter     | Highest operational risk and fastest value.                       |
| 4     | MAP-040 to MAP-044 tenant/concierge/partner entry | Eliminates inconsistent coordinate quality.                       |
| 5     | MAP-050 to MAP-054 ops real map                   | Dispatchers need real-time spatial situational awareness.         |
| 6     | MAP-060 to MAP-065 platform admin geofence editor | Required for long-term governance and Phase 2 sandbox operations. |
| 7     | MAP-070 to MAP-074 driver map/navigation          | Driver UX improves after coordinate authority is reliable.        |
| 8     | MAP-080 to MAP-084 observability/evidence         | Runs throughout; closes release evidence.                         |

## API Draft

Provider-neutral endpoints:

```http
GET /api/geo/search?q={query}&nearLat={lat}&nearLng={lng}&locale=zh-TW
POST /api/geo/resolve
POST /api/geo/reverse
GET /api/service-area/definitions
POST /api/service-area/evaluate
```

Example `POST /api/geo/resolve` command:

```json
{
  "providerCandidateId": "candidate-123",
  "addressText": "台北市中正區北平西路3號",
  "selectedByActorId": "ops-agent-001",
  "surface": "callcenter"
}
```

Example resolved address payload:

```json
{
  "address": "台北市中正區北平西路3號",
  "normalizedAddress": "臺北市中正區北平西路3號",
  "lat": 25.0478,
  "lng": 121.5171,
  "placeId": "provider-place-id",
  "geocodeProvider": "configured-provider",
  "geocodeConfidence": "exact",
  "coordinateSource": "provider_candidate",
  "pinnedByActorId": "ops-agent-001",
  "pinnedAt": "2026-06-30T00:00:00.000Z",
  "coordinateAccuracyM": 15
}
```

Example `POST /api/service-area/evaluate` command:

```json
{
  "serviceProductType": "taxi_realtime",
  "pickup": { "lat": 25.0478, "lng": 121.5171 },
  "dropoff": { "lat": 25.033, "lng": 121.5654 },
  "requestedAt": "2026-06-30T00:00:00.000Z"
}
```

## UI Drafts

### `AddressMapPicker`

Minimum UI states:

| State                | UI behavior                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| Empty                | Search input, optional "use current/default location" when allowed.      |
| Searching            | Candidate list loading skeleton.                                         |
| Candidates           | Candidate list with address, district, provider confidence.              |
| Pinned               | Map pin, draggable marker, lat/lng, confidence, service-area badge.      |
| Manual override      | Explicit warning, reason field, lat/lng inputs.                          |
| Provider unavailable | Degraded banner; can save text-only only if policy allows manual review. |
| Out of service       | Red block banner with reason and allowed next action.                    |
| Manual review        | Amber banner with reason and routing target.                             |

### Platform Admin geometry editor

Minimum UI states:

| State   | UI behavior                                                   |
| ------- | ------------------------------------------------------------- |
| Draft   | Edit vertices/circle radius; not enforced.                    |
| Preview | Run sample addresses/orders against draft.                    |
| Review  | Show diff from active version and expected affected surfaces. |
| Publish | Effective date, actor confirmation, audit event.              |
| Retire  | Effective-until date and replacement suggestion.              |

### Ops map board

Minimum map layers:

| Layer                   | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| Orders                  | Pickup/dropoff pins and route line.                   |
| Driver/candidate supply | Current location, freshness, assignment eligibility.  |
| Service areas           | Active service boundaries for current product filter. |
| Stop policies           | No-pickup/no-dropoff/manual-review zones.             |
| Incidents / holds       | Safety or operational blocks.                         |
| Provider health         | Map/geocode/provider degraded state.                  |

## Testing Plan

| Test class        | Coverage                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Geometry containment, geocode response normalization, coordinate validation, service-area decision priority.                                                   |
| API contract      | Geo search/resolve/reverse envelopes, service-area definitions/evaluate, booking error codes.                                                                  |
| Component         | `AddressMapPicker` state machine, manual fallback, serviceability banners.                                                                                     |
| Playwright        | Initial Callcenter map-gate smoke is present; full pinned pickup/dropoff, out-of-area block, provider-degraded fallback, and ops map fallback remain required. |
| Mobile unit       | Driver map component degraded states and external navigation URL generation.                                                                                   |
| Mobile device UAT | Location permission + map rendering + heartbeat coexistence on Android/iOS.                                                                                    |
| Stage smoke       | Real provider key works under quota; provider outage alert fires when mocked unavailable.                                                                      |

## Release Gates

| Gate                                | Required evidence                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Gate A: Callcenter safe to dispatch | Phone booking with coordinates, serviceable path, out-of-area block, manual-review path.            |
| Gate B: Governance safe to publish  | Platform Admin can publish a no-pickup zone; callcenter blocks it; audit log records actor/version. |
| Gate C: Ops safe to operate         | Ops map shows order, candidate, stale candidate, no-location candidate, and service area overlay.   |
| Gate D: Driver safe to navigate     | Driver app map loads; external navigation opens correct pickup/dropoff; heartbeat remains active.   |
| Gate E: Degraded safe               | Provider outage does not silently create normal dispatchable coordinate-less orders.                |

## Open Decisions

| Decision                          | Why it matters                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Map/geocode provider              | Affects cost, Taiwan address quality, web/native SDKs, legal terms, quota, and runtime reliability.                    |
| Coordinate-less booking policy    | Determines whether text-only phone bookings are blocked, allowed only as manual review, or temporarily allowed.        |
| Address provenance shape          | Must be stable enough for audit/reporting without overfitting to one provider.                                         |
| Geometry ownership split          | Normal taxi service areas and Phase 2 sandbox ODD/approved routes should share primitives but not authority lifecycle. |
| External platform route authority | Forwarded orders may be route-locked by source platform; DRTS map must not imply local edit authority.                 |
| Offline/mobile fallback           | Driver app needs clear behavior when maps fail but GPS heartbeat continues.                                            |

## Recommended Immediate Remaining Slice

The backend authority foundation is now in review through `MAP-BE-001` to
`MAP-BE-006`. The smallest remaining high-value implementation slice is:

1. Land/review the backend map authority stack (`MAP-BE-001` to `MAP-BE-006`).
2. Review and merge `MAP-UI-001` / `MAP-FE-CALL-001`.
3. Add full Callcenter Playwright evidence for serviceable, manual-review,
   blocked, provider-degraded, and persisted spatial snapshot flows.
4. Integrate the same picker into tenant, concierge, and partner entry surfaces.
5. Build Platform Admin `GeometryEditor` and service-area governance UI on top
   of the new lifecycle APIs.

This slice directly closes the user's observed operational problem: phone agents cannot mark exact pickup/dropoff locations and cannot know whether a stop is inside service scope before creating the booking.

## Notes

- This document intentionally treats map providers as rendering/geocoding dependencies, not business authority.
- The service-area PostGIS migration requires PostGIS availability in target PostgreSQL environments.
- The existing Ops spatial projection should be retained as a degraded fallback until the real map board is stable.
- The driver app should not be first in sequence; it benefits from better coordinates, but the operational risk starts when orders are created without reliable pins.
