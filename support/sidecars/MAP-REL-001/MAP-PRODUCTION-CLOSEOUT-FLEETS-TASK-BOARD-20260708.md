# Map Production Closeout Fleets Task Board

**Board date:** `2026-07-08`
**Closeout family:** `map-geofence-production-closeout-20260708`

## Gate Summary

| Gate   | Release question        | Status                           | Build / branch@sha                                                                                                                                                 | Artifact links                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate D | Driver safe to navigate | PASS (`ACCEPTED-EXTERNAL-GATED`) | `mixed: dev@66ee70f5b (2026-06-15 emulator UAT) + origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2 (2026-07-03 coordinate handoff evidence)` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`, `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |

## Task Closeout Rows

| Task                  | Scope                                 | Status | Acceptance closeout                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEETS-CLOSEOUT-001` | Callcenter persisted spatial proof    | PASS   | `E2E-MAP-001` and `E2E-MAP-003` now link the same `ORD-SMOKE-001` / `ORD-MAP-MANUAL-001` proof chain across browser submit, persisted API/DB snapshot, service-area decision, audit event, manual-review no-dispatch proof, and Ops visibility; row-level artifacts live in the packet below and `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`.                                                                   |
| `FLEETS-CLOSEOUT-006` | Observability final evidence          | PASS   | `MAP-OBS-001-FINAL-EVIDENCE.md` on `codex2/fleets-closeout-006@fdcb09d0b86d` remains placeholder-free and keeps every required metric, audit event, recent-window alert, and runbook distinction row at `PASS` with row-level evidence. `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` and `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts` add closeout-specific proof. |
| `FLEETS-CLOSEOUT-005` | Driver native map/navigation UAT      | PASS   | `E2E-MAP-007` now points to the accepted Gate D packet above; packet proves trip-map rendering, pickup/dropoff pins, current-location freshness copy, coordinate-only navigation URLs, route-authority copy, offline/degraded copy, and heartbeat coexistence while map/navigation is active.                                                                                                                                                            |
| `FLEETS-CLOSEOUT-009` | Callcenter production map integration | REVIEW | `origin/dev`-based implementation adds tile-backed pickup/dropoff maps, active/effective service-area and stop-policy overlays, click-to-pin reverse geocoding, fail-closed booking reevaluation, deployment tile preflight, and browser E2E. Independent reviewer approval is still required; see `support/sidecars/MAP-REL-001/FLEETS-CLOSEOUT-009-CALLCENTER-MAP-EVIDENCE.md`.                                                                        |

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
