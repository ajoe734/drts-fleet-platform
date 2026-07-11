# Map Production Closeout Fleets Task Board

**Board date:** `2026-07-08`
**Closeout family:** `map-geofence-production-closeout-20260708`

## Gate Summary

| Gate   | Release question        | Status                           | Build / branch@sha                                                                                                                                                 | Artifact links                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate D | Driver safe to navigate | PASS (`ACCEPTED-EXTERNAL-GATED`) | `mixed: dev@66ee70f5b (2026-06-15 emulator UAT) + origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2 (2026-07-03 coordinate handoff evidence)` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`, `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |

## Task Closeout Rows

| Task                  | Scope                                     | Status | Acceptance closeout                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEETS-CLOSEOUT-001` | Callcenter persisted spatial proof        | PASS   | `E2E-MAP-001` and `E2E-MAP-003` now link the same `ORD-SMOKE-001` / `ORD-MAP-MANUAL-001` proof chain across browser submit, persisted API/DB snapshot, service-area decision, audit event, manual-review no-dispatch proof, and Ops visibility; row-level artifacts live in the packet below and `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`.                                 |
| `FLEETS-CLOSEOUT-002` | Cross-surface persisted anti-bypass proof | PASS   | `E2E-MAP-004` now links tenant / concierge / partner browser proof to persisted API + audit artifacts, while `E2E-MAP-005` links provider-outage and coordinate-less flows across tenant / concierge / partner / callcenter to explicit manual-review or fail-closed backend proof; OBS rows also cross-link outage vs ambiguity vs policy denial so no degraded path can be mistaken for a normal dispatchable order. |
| `FLEETS-CLOSEOUT-005` | Driver native map/navigation UAT          | PASS   | `E2E-MAP-007` now points to the accepted Gate D packet above; packet proves trip-map rendering, pickup/dropoff pins, current-location freshness copy, coordinate-only navigation URLs, route-authority copy, offline/degraded copy, and heartbeat coexistence while map/navigation is active.                                                                                                                          |

## FLEETS-CLOSEOUT-001 Spatial Proof Packet

Task: `FLEETS-CLOSEOUT-001`  
Owner: `Codex`  
Reviewer: `Codex2`  
Branch: `codex/fleets-closeout-001`

### Scope

This closeout packet backfills the missing persisted spatial proof for the
callcenter map booking slice. The evidence below ties one browser-submitted
phone order to the backend spatial snapshot, service-area decision, audit
receipt, manual-review blocking proof, and Ops-visible map model.

### Artifact Index

- Browser proof report:
  `support/sidecars/MAP-REL-001/artifacts/playwright-map-fleets-closeout-proof-20260708T050000Z.json`
- Browser row-level artifact:
  `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json`
- Browser screenshot:
  `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.png`
- Backend proof report:
  `support/sidecars/MAP-REL-001/artifacts/vitest-map-fleets-closeout-proof-20260708T050500Z.json`
- Backend row-level artifact:
  `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json`
- QA promotion matrix:
  `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`

### Acceptance Matrix

| Acceptance item                                                                                              | Result | Order ID             | Row-level evidence                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-001` final PASS row has browser artifact plus persisted API/DB/audit artifact for the same order ID | PASS   | `ORD-SMOKE-001`      | Browser request+response proof in `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json`; persisted order/API snapshot, audit event, and stored write in `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` under `serviceableOrder.apiOrder`, `serviceableOrder.persistedWrite`, and `serviceableOrder.auditEvent` |
| `E2E-MAP-003` manual-review row proves no normal dispatch job                                                | PASS   | `ORD-MAP-MANUAL-001` | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` under `manualReviewOrder.apiOrder`, `manualReviewOrder.dispatchAttempt.errorResponse`, and `manualReviewOrder.dispatchAttempt.dispatchJobsForOrder` (`[]`)                                                                                                                                                 |
| Callcenter request-body provenance row has row-level artifact link                                           | PASS   | `ORD-SMOKE-001`      | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json` records `bookingGateBeforeSubmit="serviceable"` plus full `requestBody.pickup/dropoff.coordinateProvenance`                                                                                                                                                                                                |
| service-area decision snapshot row has immutable backend snapshot artifact                                   | PASS   | `ORD-SMOKE-001`      | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` under `serviceableOrder.apiOrder.spatialAudit`, `serviceableOrder.apiOrder.serviceAreaGate`, and `serviceableOrder.immutableSnapshotCheck`                                                                                                                                                                 |
| Ops visibility row links the same order ID                                                                   | PASS   | `ORD-SMOKE-001`      | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` under `serviceableOrder.opsVisibility.routeSegments` and `serviceableOrder.opsVisibility.points`                                                                                                                                                                                                           |
| no template placeholders remain                                                                              | PASS   | n/a                  | `support/sidecars/MAP-REL-001/artifacts/grep-map-fleets-closeout-placeholders-20260708T0415Z.txt`                                                                                                                                                                                                                                                                                                           |

### Same-Order Proof Chain

| Step                      | Order ID        | Proof                                                                                                                                       |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Callcenter browser submit | `ORD-SMOKE-001` | Browser proof captures the POST payload and mocked API response with the same order ID.                                                     |
| Persisted order snapshot  | `ORD-SMOKE-001` | Backend proof captures the stored `orders[0]` write and the retrieved API order detail.                                                     |
| Service-area snapshot     | `ORD-SMOKE-001` | Backend proof shows `decision="serviceable"`, `serviceAreaCodes=["TAIPEI_CORE"]`, and `geometryVersionRefs=["service_area:TAIPEI_CORE@1"]`. |
| Audit receipt             | `ORD-SMOKE-001` | Backend proof shows `order.spatial_audit.snapshot_created` on `resourceId="ORD-SMOKE-001"`.                                                 |
| Ops map visibility        | `ORD-SMOKE-001` | Backend proof builds the Ops map model and preserves `orderId="ORD-SMOKE-001"` on route segments and points.                                |

### Manual Review Proof Chain

| Step                         | Order ID             | Proof                                                                                                            |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Manual-review order creation | `ORD-MAP-MANUAL-001` | Backend proof stores the order with `queueFamily="manual_review_queue"` and a review-required service-area gate. |
| Dispatch refusal             | `ORD-MAP-MANUAL-001` | Backend proof returns `DISPATCH_REQUIRES_MANUAL_REVIEW`.                                                         |
| No normal dispatch job       | `ORD-MAP-MANUAL-001` | Backend proof records `dispatchJobsForOrder=[]`, proving no regular dispatch job was created.                    |

## FLEETS-CLOSEOUT-002 Cross-Surface Anti-Bypass Proof Packet

Task: `FLEETS-CLOSEOUT-002`
Owner: `Codex`
Reviewer: `Codex2`
Branch: `codex/fleets-closeout-002`

### Scope

This packet promotes the remaining local map-entry evidence into persisted API,
audit, and anti-bypass proof. The new artifact chain ties tenant, concierge,
and partner serviceability outcomes to stored order snapshots and audit events,
then proves that provider-outage or coordinate-less flows across every entry
surface never become a normal dispatchable order.

### Artifact Index

- Cross-surface backend proof report:
  `support/sidecars/MAP-REL-001/artifacts/vitest-map-fleets-cross-surface-proof-20260711T023829Z.json`
- Cross-surface backend row-level artifact:
  `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json`
- Tenant outage / fail-closed proxy artifact:
  `support/sidecars/MAP-REL-001/artifacts/vitest-tenant-geo-provider-closeout-20260711T023829Z.json`
- Concierge outage / manual-review seam artifact:
  `support/sidecars/MAP-REL-001/artifacts/vitest-concierge-map-booking-closeout-20260711T023829Z.json`
- Partner outage / manual-review seam artifact:
  `support/sidecars/MAP-REL-001/artifacts/vitest-partner-program-form-utils-closeout-20260711T023829Z.json`
- QA promotion matrix:
  `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`
- OBS final evidence:
  `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`

### Acceptance Matrix

| Acceptance item                                                                                                           | Result | Order / booking IDs                                                                                                                                                                   | Row-level evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-004` final PASS row includes tenant, concierge, and partner persisted API/audit artifacts                        | PASS   | `tenant=booking-000001` / `ffaa6c68-add9-44f8-ade1-b5e4d42fdcdb`, `concierge=6dd39bf3-8284-40dd-9376-00a160ad4afd`, `partner=booking-000002` / `f7e048ab-6420-4179-a8dd-d6cb67ba3b73` | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json` under `tenantServiceableBooking`, `conciergeServiceableOrder`, and `partnerServiceableBooking`; each slice includes the persisted order write plus the matching `order.spatial_audit.snapshot_created`, and tenant / partner also include the booking-level `create_tenant_booking` audit receipt                                                                                                                                                                                                                          |
| `E2E-MAP-005` final PASS row includes provider-outage and coordinate-less anti-bypass artifacts across all entry surfaces | PASS   | `callcenter=f652d063-7354-4892-bbbf-7bcf600d2044`, `concierge=145bf5dd-f775-4c6f-ba85-cf4a3a9e04e5`, `tenant=booking-000003`, `partner=booking-000004`                                | Tenant outage proxy evidence in `support/sidecars/MAP-REL-001/artifacts/vitest-tenant-geo-provider-closeout-20260711T023829Z.json`; concierge manual-review fallback seam in `support/sidecars/MAP-REL-001/artifacts/vitest-concierge-map-booking-closeout-20260711T023829Z.json`; partner degraded submit gate in `support/sidecars/MAP-REL-001/artifacts/vitest-partner-program-form-utils-closeout-20260711T023829Z.json`; persisted backend proof in `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json` under `providerOutageManualReview` and `coordinateLessAntiBypass` |
| Backend anti-bypass row proves no normal dispatchable order                                                               | PASS   | `tenant=booking-000003`, `partner=booking-000004`, `callcenter=17da88e0-8e10-4af7-8eec-fd33286e4fbc`, `concierge=460a7328-02b1-495c-a623-8c1ca9be3cac`                                | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json` shows every degraded slice returning `DISPATCH_REQUIRES_MANUAL_REVIEW`, with provider-outage rows under `providerOutageManualReview.*.dispatchAttempt` and coordinate-less rows under `coordinateLessAntiBypass.*.dispatchAttempt`; every row records `dispatchJobsForOrder=[]`                                                                                                                                                                                                                                            |
| OBS rows distinguish outage, ambiguity, and policy denial                                                                 | PASS   | n/a                                                                                                                                                                                   | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` rows `OBS-MAP-PROVIDER-OUTAGE`, `OBS-MAP-ADDRESS-AMBIGUITY`, `OBS-MAP-POLICY-DENIAL`, and `OBS-MAP-COORDINATELESS-ATTEMPT` plus the matching metrics rows `map_provider_errors_total`, `map_geocode_requests_total`, `service_area_policy_blocks_total`, and `coordinate_less_booking_attempts_total`                                                                                                                                                                                                                                                                |
| Every PASS row has artifact path/link evidence                                                                            | PASS   | n/a                                                                                                                                                                                   | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`, this packet, and the artifact index above all point to concrete JSON/Markdown evidence paths for each PASS slice                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Cross-Surface Serviceable Proof Chain

| Surface                 | Resource ID                                               | Proof                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant console booking  | `booking-000001` / `ffaa6c68-add9-44f8-ade1-b5e4d42fdcdb` | `tenantServiceableBooking` stores the booking result, the persisted order snapshot, the `tenant_console` spatial audit, and both booking/order audit rows for the same resource pair.                                     |
| Concierge portal submit | `6dd39bf3-8284-40dd-9376-00a160ad4afd`                    | `conciergeServiceableOrder` stores the call-center order snapshot and audit rows while preserving `pickup/dropoff.coordinateProvenance.surface="concierge_portal"` on the persisted order payload.                        |
| Partner booking submit  | `booking-000002` / `f7e048ab-6420-4179-a8dd-d6cb67ba3b73` | `partnerServiceableBooking` stores the partner-scoped booking result, eligibility verification reference `elig_d5705b4a-1a96-45a2-a8ca-1c769f6c14f0`, the `partner_booking` spatial audit, and the persisted order write. |

### Anti-Bypass Refusal Matrix

| Surface          | Failure mode    | Proof                                                                                                                                                                                                                              |
| ---------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Callcenter       | provider outage | `providerOutageManualReview.callcenter` records `mapFallbackReview.reasonCode="map_provider_unavailable"`, queue family `manual_review_queue`, `DISPATCH_REQUIRES_MANUAL_REVIEW`, and `dispatchJobsForOrder=[]`.                   |
| Concierge portal | provider outage | `providerOutageManualReview.concierge` records the same manual-review-only outcome while preserving concierge stop provenance on the stored order.                                                                                 |
| Tenant console   | coordinate-less | `coordinateLessAntiBypass.tenant` stores `service_area_legacy_text_manual_review`, `missingItems=["pickup_coordinates","dropoff_coordinates"]`, a `tenant_console` spatial audit, and no dispatch jobs after the dispatch attempt. |
| Partner booking  | coordinate-less | `coordinateLessAntiBypass.partner` stores the same fail-closed evidence for `partner_booking`, bound to the partner entry and eligibility verification.                                                                            |
| Callcenter       | coordinate-less | `coordinateLessAntiBypass.callcenter` stores a manual-review queue entry plus zero dispatch jobs for a landmark-only phone order.                                                                                                  |
| Concierge portal | coordinate-less | `coordinateLessAntiBypass.concierge` stores the same landmark-only refusal with `surface="concierge_portal"` in stop provenance.                                                                                                   |

## Gate D Evidence Notes

- `navigation URL assertion uses coordinates not address text`:
  `apps/driver-app/tests/unit/driver-navigation.test.ts` verifies Apple Maps,
  Google Maps, and Android navigation URLs are built from pickup/dropoff
  coordinates only.
- `heartbeat evidence is captured while map/navigation is active`:
  `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`
  records the active-trip permission/heartbeat path, and
  `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts` verifies
  `openDriverNavigation(...)` does not stop the `on_trip` heartbeat.
- `trip map rendering and pins`:
  `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`
  plus `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`
  capture the active trip map with pickup/dropoff markers.
- `build provenance is mixed on purpose`:
  `dev@66ee70f5b` is the explicit 2026-06-15 emulator UAT branch for trip-map
  rendering/pins/heartbeat, while
  `origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2`
  only covers the later coordinate-navigation/copy/test assertions.

## Remaining Parent-Level Limits

- This board closes the `FLEETS-CLOSEOUT-001` persisted spatial proof row and
  the `FLEETS-CLOSEOUT-005` Gate D driver evidence row only. It does not claim
  full `MAP-REL-001` production readiness or `dev` deployment.
- Separate parent blockers around provider runtime wiring and deploy-rail
  alignment on `MAP_PROVIDER_MODE` remain outside this task board's acceptance
  slice.
- Integration status for the broader release family remains controlled by the
  parent release task and its verifier/deploy evidence.
