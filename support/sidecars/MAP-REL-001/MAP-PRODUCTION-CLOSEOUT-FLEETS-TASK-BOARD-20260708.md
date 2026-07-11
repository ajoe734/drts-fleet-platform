# Map Production Closeout Fleets Task Board

**Board date:** `2026-07-08`
**Closeout family:** `map-geofence-production-closeout-20260708`

## Gate Summary

| Gate   | Release question        | Status                           | Build / branch@sha                                                                                                                                                 | Artifact links                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate D | Driver safe to navigate | PASS (`ACCEPTED-EXTERNAL-GATED`) | `mixed: dev@66ee70f5b (2026-06-15 emulator UAT) + origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2 (2026-07-03 coordinate handoff evidence)` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`, `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |

## Task Closeout Rows

| Task                  | Scope                                     | Status                  | Acceptance closeout                                                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEETS-CLOSEOUT-001` | Callcenter persisted spatial proof        | PASS                    | `E2E-MAP-001` and `E2E-MAP-003` link the same browser submit, persisted API/DB snapshot, service-area decision, audit event, manual-review no-dispatch proof, and Ops visibility chain.                                                                                     |
| `FLEETS-CLOSEOUT-002` | Cross-surface persisted anti-bypass proof | PASS                    | `E2E-MAP-004` links tenant/concierge/partner persisted API and audit proof; `E2E-MAP-005` proves provider-outage and coordinate-less paths fail closed across every booking surface.                                                                                        |
| `FLEETS-CLOSEOUT-003` | Admin publish and policy versions         | PASS                    | Draft/review/publish/retire, effective-window, invalid-geometry, audit and downstream Callcenter-block proof is consolidated in `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md`.                                                           |
| `FLEETS-CLOSEOUT-004` | Ops map backend-linked visibility proof   | PASS                    | `E2E-MAP-006` links browser DOM/screenshot, Ops model, backend service, controller/API-envelope, persisted snapshot and observability evidence for the same order IDs.                                                                                                      |
| `FLEETS-CLOSEOUT-005` | Driver native map/navigation UAT          | PASS                    | `E2E-MAP-007` proves trip map, pins, location freshness, coordinate-only navigation, route-authority and degraded/offline copy, plus heartbeat coexistence.                                                                                                                 |
| `FLEETS-CLOSEOUT-006` | Observability final evidence              | PASS                    | Required metrics, audit events, alerts and runbooks distinguish outage, ambiguity, policy denial and coordinate-less attempts, with geometry rollback and manual-override coverage.                                                                                         |
| `FLEETS-CLOSEOUT-009` | Callcenter production map integration     | PASS (`INTEGRATION-PR`) | Tile maps, active/effective service-area and stop-policy overlays, click-to-pin reverse geocoding, fail-closed reevaluation, deployment tile preflight and browser E2E are integrated into the final release branch; `dev` merge remains the only outstanding lineage step. |

## FLEETS-CLOSEOUT-003 Governance Proof

- Reviewed proof branch: `codex2/fleets-closeout-003@59a56c86a`.
- Active boundary/version proof: `KHH_CORE@1` and `CYI_CORE@1`.
- Active policy/version proof: `CITY_HALL_PICKUP_BLOCK@1`.
- Review/publish/retire exports include status, version, geometry reference and
  effective window.
- Audit assertions include actor, actor type, request ID and mutation summary.
- Invalid self-intersecting geometry is rejected before persistence.
- Published deny policy refreshes the evaluator and matches the Callcenter
  blocked-order browser artifact.

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
Branch: `codex/fleets-closeout-002-ci`
Verified code ref: `codex/fleets-closeout-002-ci@f11c14237`

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

This packet now promotes the final `E2E-MAP-006` PASS row by composing its
repo-local Ops artifacts with `FLEETS-CLOSEOUT-001` persisted order snapshot
authority and `MAP-OBS-001` final evidence. It still does not claim broader
`MAP-REL-001` production readiness or `dev` deployment.

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

| Acceptance item                                                                                                                       | Result | Order ID                              | Row-level evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-006` final PASS row has browser DOM screenshot plus persisted API/DB snapshot and backend/API readback for the same order ID | PASS   | `ORD-SMOKE-001`                       | Browser DOM proof and screenshot in `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.json` / `.png`; persisted API/DB snapshot authority from `FLEETS-CLOSEOUT-001` in `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` under `serviceableOrder.apiOrder`, `serviceableOrder.persistedWrite`, and `serviceableOrder.auditEvent`; backend-linked proof in `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json`; API-envelope proof in `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json`; final promoted QA row in `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`. |
| Ops visibility row uses the same order IDs as Callcenter proof                                                                        | PASS   | `ORD-SMOKE-001`, `ORD-MAP-MANUAL-001` | Ops model proof `sameOrderIdsAsCallcenterProof=["ORD-SMOKE-001","ORD-MAP-MANUAL-001"]`; backend/API proofs keep `sameOrderIdsAsCallcenterProof=["ORD-SMOKE-001"]`; `FLEETS-CLOSEOUT-001` already closes the same IDs in `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Overlay rows prove service and stop-policy versions                                                                                   | PASS   | `ORD-SMOKE-001`, `ORD-MAP-MANUAL-001` | Ops model proof exports `serviceAreaCodes=["TAIPEI_CORE"]`, `policyCodes=["PICKUP_ZONE_A","DROPOFF_ZONE_B","XINYI_HOSPITAL_MANUAL_REVIEW"]`, `geometryVersionRefs=["service_area:TAIPEI_CORE@1","stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1"]`, and `reasonCodes=["STOP_REQUIRES_MANUAL_REVIEW"]`; browser DOM proof exports `boardAttributes.serviceAreas` / `boardAttributes.policyCodes`; backend/API proofs export `opsBoard.overlays`.                                                                                                                                                                                                                                                                                                                                                   |
| Stale / no-location driver supply rows prove freshness states                                                                         | PASS   | `ORD-SMOKE-001`                       | Ops model proof exports `candidateSupplyPoints=2`, `staleCandidatePoints=1`, and `noLocationCandidateCount=1`; backend-linked proof exports candidate `locationState` values `fresh`, `low_accuracy`, `missing`; API-envelope proof exports the same candidate states and counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Fallback state row has artifact evidence                                                                                              | PASS   | `ORD-SMOKE-001`                       | Browser DOM proof records `boardAttributes.fallbackReason="missing_coordinates"`; Ops model proof records `opsBoard.fallbackReason="missing_coordinates"` and `noVisibleFallback.fallbackReason="no_visible_points"`; backend/API proofs record `providerStatus="degraded_projection"` with `fallbackReason="missing_coordinates"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Final QA/OBS/REL row links stay explicit                                                                                              | PASS   | n/a                                   | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` now cites the same-order browser/model/backend/API chain; `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md` records the composed `E2E-MAP-006` PASS promotion; `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` closes degraded/freshness observability authority.                                                                                                                                                                                                                                                                                                                                                                                                                  |

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
