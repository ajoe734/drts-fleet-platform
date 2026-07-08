# Map Production Closeout Fleets Task Board

**Board date:** `2026-07-08`
**Closeout family:** `map-geofence-production-closeout-20260708`

## Gate Summary

| Gate   | Release question        | Status                           | Build / branch@sha                                                                                                                                                 | Artifact links                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate D | Driver safe to navigate | PASS (`ACCEPTED-EXTERNAL-GATED`) | `mixed: dev@66ee70f5b (2026-06-15 emulator UAT) + origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2 (2026-07-03 coordinate handoff evidence)` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`, `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |

## Task Closeout Rows

| Task                  | Scope                                   | Status  | Acceptance closeout                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEETS-CLOSEOUT-001` | Callcenter persisted spatial proof      | PASS    | `E2E-MAP-001` and `E2E-MAP-003` now link the same `ORD-SMOKE-001` / `ORD-MAP-MANUAL-001` proof chain across browser submit, persisted API/DB snapshot, service-area decision, audit event, manual-review no-dispatch proof, and Ops visibility; row-level artifacts live in the packet below and `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`. |
| `FLEETS-CLOSEOUT-004` | Ops map backend-linked visibility proof | PARTIAL | Repo-local evidence now links the same `ORD-SMOKE-001` / `ORD-MAP-MANUAL-001` slice across browser DOM screenshot proof, Ops model proof, backend service readback proof, and controller/API-envelope readback proof. Final `E2E-MAP-006` PASS is still blocked on reviewer-accepted stage HTTP/API or DB snapshot artifacts, `MAP-OBS-001` final evidence, and final QA row links.    |
| `FLEETS-CLOSEOUT-005` | Driver native map/navigation UAT        | PASS    | `E2E-MAP-007` now points to the accepted Gate D packet above; packet proves trip-map rendering, pickup/dropoff pins, current-location freshness copy, coordinate-only navigation URLs, route-authority copy, offline/degraded copy, and heartbeat coexistence while map/navigation is active.                                                                                          |

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

## FLEETS-CLOSEOUT-004 Ops Map Repo-Local Proof Packet

Task: `FLEETS-CLOSEOUT-004`
Owner: `Codex`
Reviewer: `Codex2`
Branch: `codex/fleets-closeout-004`

### Scope

This packet backfills the missing repo-local Ops map proof for the same
Callcenter order IDs already closed by `FLEETS-CLOSEOUT-001`. The evidence
below ties Ops map pins, pickup/dropoff pairing, service and stop-policy
overlays, stale/no-location driver supply, and fallback state to the same
`ORD-SMOKE-001` / `ORD-MAP-MANUAL-001` slice.

This packet is intentionally not a final production `PASS`. It does not claim
reviewer-accepted stage HTTP/API or DB snapshot artifacts, `MAP-OBS-001` final
evidence, or `MAP-QA-002-FINAL-EVIDENCE.md`.

### Artifact Index

- Ops model proof:
  `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json`
- Ops browser DOM proof:
  `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.json`
- Ops browser screenshot:
  `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.png`
- Backend-linked proof:
  `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json`
- API-envelope proof:
  `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json`
- QA promotion matrix:
  `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`

### Acceptance Matrix

| Acceptance item                                                                                        | Result  | Order ID                              | Row-level evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-006` repo-local browser DOM screenshot plus backend/API readback exists for the same order ID | PARTIAL | `ORD-SMOKE-001`                       | Browser DOM proof and screenshot in `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.json` / `.png`; backend-linked proof in `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json`; API-envelope proof in `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json`. Final PASS still needs reviewer-accepted stage HTTP/API or DB snapshot plus OBS final evidence. |
| Ops visibility row uses the same order IDs as Callcenter proof                                         | PASS    | `ORD-SMOKE-001`, `ORD-MAP-MANUAL-001` | Ops model proof `sameOrderIdsAsCallcenterProof=["ORD-SMOKE-001","ORD-MAP-MANUAL-001"]`; backend/API proofs keep `sameOrderIdsAsCallcenterProof=["ORD-SMOKE-001"]`; `FLEETS-CLOSEOUT-001` already closes the same IDs in `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json`.                                                                                                                                                                                                    |
| Overlay rows prove service and stop-policy versions                                                    | PASS    | `ORD-SMOKE-001`, `ORD-MAP-MANUAL-001` | Ops model proof exports `serviceAreaCodes=["TAIPEI_CORE"]`, `policyCodes=["PICKUP_ZONE_A","DROPOFF_ZONE_B","XINYI_HOSPITAL_MANUAL_REVIEW"]`, `geometryVersionRefs=["service_area:TAIPEI_CORE@1","stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1"]`, and `reasonCodes=["STOP_REQUIRES_MANUAL_REVIEW"]`; browser DOM proof exports `boardAttributes.serviceAreas` / `boardAttributes.policyCodes`; backend/API proofs export `opsBoard.overlays`.                                                                                  |
| Stale / no-location driver supply rows prove freshness states                                          | PASS    | `ORD-SMOKE-001`                       | Ops model proof exports `candidateSupplyPoints=2`, `staleCandidatePoints=1`, and `noLocationCandidateCount=1`; backend-linked proof exports candidate `locationState` values `fresh`, `low_accuracy`, `missing`; API-envelope proof exports the same candidate states and counts.                                                                                                                                                                                                                                            |
| Fallback state row has artifact evidence                                                               | PASS    | `ORD-SMOKE-001`                       | Browser DOM proof records `boardAttributes.fallbackReason="missing_coordinates"`; Ops model proof records `opsBoard.fallbackReason="missing_coordinates"` and `noVisibleFallback.fallbackReason="no_visible_points"`; backend/API proofs record `providerStatus="degraded_projection"` with `fallbackReason="missing_coordinates"`.                                                                                                                                                                                          |
| Remaining blocker before final PASS stays explicit                                                     | BLOCKED | n/a                                   | Reviewer-accepted stage HTTP/API or DB snapshot artifact for the same order/dispatch/candidate readback, `MAP-OBS-001` final evidence for degraded/freshness signals, and final `MAP-QA-002` row links are still required.                                                                                                                                                                                                                                                                                                   |

### Same-Order Proof Chain

| Step                       | Order ID                              | Proof                                                                                                                                                                       |
| -------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Callcenter persisted proof | `ORD-SMOKE-001`                       | `FLEETS-CLOSEOUT-001` already ties browser submit, backend snapshot, audit event, and Ops-visible points for the same order ID.                                             |
| Ops browser screenshot     | `ORD-SMOKE-001`                       | Browser DOM proof captures `.spatial-point` pickup/dropoff/candidate hooks and a board screenshot for the same order ID.                                                    |
| Ops model proof            | `ORD-SMOKE-001`, `ORD-MAP-MANUAL-001` | Ops model proof exports the same order IDs, overlay versions, stale/no-location counts, viewport projection, and fallback states.                                           |
| Backend service readback   | `ORD-SMOKE-001`                       | Backend-linked proof exports `createCallCenterOrder` readback, dispatch job, `listDispatchCandidates`, and Ops map points for the same order ID.                            |
| API-envelope readback      | `ORD-SMOKE-001`                       | API-envelope proof exports controller `createCallCenterOrder`, order detail, dispatch tasks, dispatch candidates, dispatch trace, and Ops map points for the same order ID. |

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

- This board now includes `FLEETS-CLOSEOUT-004` repo-local Ops evidence in
  addition to the closed `FLEETS-CLOSEOUT-001` and `FLEETS-CLOSEOUT-005`
  slices. It still does not claim full `MAP-REL-001` production readiness or
  `dev` deployment.
- Separate parent blockers around provider runtime wiring and deploy-rail
  alignment on `MAP_PROVIDER_MODE` remain outside this task board's acceptance
  slice.
- Integration status for the broader release family remains controlled by the
  parent release task and its verifier/deploy evidence.
