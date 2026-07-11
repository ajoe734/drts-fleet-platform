# MAP-QA-002 Final Evidence Promotion Matrix

Task bridge: `FLEETS-CLOSEOUT-001`  
Source QA packet: `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`  
Promoted closeout branch: `codex/fleets-closeout-001`

## Purpose

`MAP-QA-002` already proves the high-level browser and harness scenarios. This
matrix promotes the QA PASS rows that `FLEETS-CLOSEOUT-001` must close with
row-level persisted artifacts, so the release closeout can cite exact evidence
instead of only broad PASS summaries.

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
