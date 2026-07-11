# MAP-QA-002 Final Evidence Promotion Matrix

Task bridge: `FLEETS-CLOSEOUT-001`, `FLEETS-CLOSEOUT-002`,
`FLEETS-CLOSEOUT-003`, `FLEETS-CLOSEOUT-004`, `FLEETS-CLOSEOUT-005`
Source QA packet: `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`
Promoted closeout sources: `origin/dev@c75c7fc164f5`,
`origin/dev@0644366a3cd7`, `origin/codex/fleets-closeout-002@b1682c234fcd`,
`origin/codex/fleets-closeout-004@399707364566`, and
`dev@66ee70f5b + origin/codex2/map-mob-drv-001@bcc3ea1cfd73`

## Purpose

`MAP-QA-002` already proves the high-level browser and harness scenarios. This
matrix promotes the QA rows that later closeout tasks had to harden with
persisted API, audit, ops-map, and mobile/UAT artifacts so the release closeout
can cite exact evidence instead of only broad PASS summaries.

## Promotion Matrix

| Scenario / row                               | QA result                                            | Promoted result | Order ID             | QA artifact                                                                                                                                                                                                                                                                          | Closeout artifact                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------- | --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-001` Callcenter pinned booking      | PASS                                                 | PASS            | `ORD-SMOKE-001`      | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`                                                                                                                                                                                    | Browser request/response proof: `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json`; persisted backend/API/audit proof: `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` |
| Callcenter request-body provenance           | implied by `E2E-MAP-001` PASS                        | PASS            | `ORD-SMOKE-001`      | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`                                                                                                                                                                                    | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json` (`bookingGateBeforeSubmit`, `requestBody.pickup.coordinateProvenance`, `requestBody.dropoff.coordinateProvenance`)                                                   |
| Service-area decision snapshot               | implied by `E2E-MAP-001` and service-area assertions | PASS            | `ORD-SMOKE-001`      | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`                                                                                                                                                                                              | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` (`serviceableOrder.apiOrder.spatialAudit`, `serviceableOrder.apiOrder.serviceAreaGate`, `serviceableOrder.immutableSnapshotCheck`)                                   |
| `E2E-MAP-003` Manual-review zone             | PASS                                                 | PASS            | `ORD-MAP-MANUAL-001` | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-harness-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` (`manualReviewOrder.apiOrder`, `manualReviewOrder.dispatchAttempt.errorResponse`, `manualReviewOrder.dispatchAttempt.dispatchJobsForOrder`)                          |
| Ops visibility for the same callcenter order | implied by `E2E-MAP-006` PASS                        | PASS            | `ORD-SMOKE-001`      | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-ops-ui-20260704T0414Z.json`                                                                                                                                                                                           | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json` (`serviceableOrder.opsVisibility.routeSegments`, `serviceableOrder.opsVisibility.points`)                                                                            |

## Promotion Summary

- `MAP-QA-002` remains the QA PASS authority for `E2E-MAP-001` and
  `E2E-MAP-003`.
- `FLEETS-CLOSEOUT-001` adds the persisted row-level artifacts that QA did not
  need to capture:
  - browser request body with order response
  - immutable backend spatial snapshot
  - audit receipt bound to the same order ID
  - explicit proof that manual-review does not create a normal dispatch job
  - Ops map model visibility for the same order ID

## FLEETS-CLOSEOUT-003 Admin Publish Promotion

| Acceptance target                                | Result | Row-level artifact                                                                                                                     |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-002` admin publish and downstream block | PASS   | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md`, plus the Callcenter Playwright artifact linked above |
| Evaluator refresh and effective window           | PASS   | Admin proof sections `Acceptance Proof` and `Version And Audit Values`                                                                 |
| Active policy/version IDs                        | PASS   | `KHH_CORE@1`, `CYI_CORE@1`, and `CITY_HALL_PICKUP_BLOCK@1` in the admin proof                                                          |
| Publish/retire audit                             | PASS   | Review, publish and retire assertions in `apps/api/tests/unit/service-area.service.test.ts`                                            |
| Invalid geometry rejection                       | PASS   | `rejects self-intersecting service-area geometry before persistence`                                                                   |

## FLEETS-CLOSEOUT-002 Cross-Surface Anti-Bypass Promotion

| Acceptance target                                                               | Result | Row-level artifact                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-004` tenant, concierge, and partner persisted outcome                  | PASS   | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json` (`tenantServiceableBooking`, `conciergeServiceableOrder`, `partnerServiceableBooking`) |
| `E2E-MAP-005` provider-outage anti-bypass                                       | PASS   | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json` (`providerOutageManualReview.callcenter`, `providerOutageManualReview.concierge`)      |
| `E2E-MAP-005` coordinate-less anti-bypass                                       | PASS   | `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json` (`coordinateLessAntiBypass.tenant`, `partner`, `callcenter`, `concierge`)              |
| Anti-bypass rows prove no normal dispatch job                                   | PASS   | The same cross-surface proof records `dispatchAttempt.dispatchJobsForOrder=[]` on every promoted provider-outage and coordinate-less surface                                                  |
| OBS split rows distinguish outage, ambiguity, denial, and coordinate-less flows | PASS   | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` (`OBS-MAP-PROVIDER-OUTAGE`, `OBS-MAP-ADDRESS-AMBIGUITY`, `OBS-MAP-POLICY-DENIAL`, `OBS-MAP-COORDINATELESS-ATTEMPT`)              |

## FLEETS-CLOSEOUT-004 Ops Visibility Promotion

| Acceptance target                             | Result | Row-level artifact                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-006` backend/API/browser composition | PASS   | `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.json`, `.png`, `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json`, `...-backend-linked-ops-proof.json`, `...-api-envelope-ops-proof.json` |
| Same order IDs as Callcenter closeout         | PASS   | `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json` (`sameOrderIdsAsCallcenterProof`)                                                                                                                                                         |
| Service and stop-policy overlays              | PASS   | `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json` (`opsBoard.overlays.serviceAreaCodes`, `policyCodes`, `geometryVersionRefs`, `reasonCodes`, `decisions`)                                                                                  |
| Stale/no-location supply plus fallback        | PASS   | `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json` (`opsBoard.counts.staleCandidatePoints`, `opsBoard.counts.noLocationCandidateCount`, `fallbackReason`, `noVisibleFallback`)                                                               |

## FLEETS-CLOSEOUT-005 Gate D Promotion

| Acceptance target                            | Result                  | Row-level artifact                                                                                                                                                                                                  |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-MAP-007` driver Gate D packet           | ACCEPTED-EXTERNAL-GATED | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`                                                              |
| Mixed build provenance is explicit           | PASS                    | Gate D packet header records `dev@66ee70f5b` for emulator trip-map/pin/heartbeat UAT and `origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2` for committed coordinate-navigation/copy evidence |
| Navigation URL, degraded copy, and heartbeat | PASS                    | Gate D coverage matrix plus `apps/driver-app/tests/unit/driver-navigation.test.ts`, `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts`, and the accepted UAT docs/screenshot linked from the packet     |
