# Map Production Closeout Fleets Task Board

**Board date:** `2026-07-08`
**Closeout family:** `map-geofence-production-closeout-20260708`

## Gate Summary

| Gate   | Release question        | Status                           | Build / branch@sha                                                                                                                                                 | Artifact links                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate D | Driver safe to navigate | PASS (`ACCEPTED-EXTERNAL-GATED`) | `mixed: dev@66ee70f5b (2026-06-15 emulator UAT) + origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2 (2026-07-03 coordinate handoff evidence)` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`, `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |

## Task Closeout Rows

| Task                  | Scope                              | Status | Acceptance closeout                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEETS-CLOSEOUT-001` | Callcenter persisted spatial proof | PASS   | `E2E-MAP-001` and `E2E-MAP-003` now link the same `ORD-SMOKE-001` / `ORD-MAP-MANUAL-001` proof chain across browser submit, persisted API/DB snapshot, service-area decision, audit event, manual-review no-dispatch proof, and Ops visibility; row-level artifacts live in the packet below and `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`.                                                                      |
| `FLEETS-CLOSEOUT-005` | Driver native map/navigation UAT   | PASS   | `E2E-MAP-007` now points to the accepted Gate D packet above; packet proves trip-map rendering, pickup/dropoff pins, current-location freshness copy, coordinate-only navigation URLs, route-authority copy, offline/degraded copy, and heartbeat coexistence while map/navigation is active.                                                                                                                                                               |
| `FLEETS-CLOSEOUT-006` | Observability final evidence       | PASS   | `MAP-OBS-001-FINAL-EVIDENCE.md` carries no template placeholders and every metric/audit/alert/runbook row is a PASS with a row-level artifact path; the closeout proof test proves provider-outage, address-ambiguity, coordinate-less, manual-override, and policy-denial signals stay distinguishable at runtime and that every required alert fires from a bounded recent window (not a lifetime counter). Row-level artifacts live in the packet below. |

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

## FLEETS-CLOSEOUT-006 Observability Proof Packet

Task: `FLEETS-CLOSEOUT-006`  
Owner: `Claude`  
Reviewer: `Codex`  
Branch: `claude/fleets-closeout-006`

### Scope

This closeout packet locks the `MAP-OBS-001` final observability evidence. It
ties the existing `MAP-OBS-001-FINAL-EVIDENCE.md` matrices to a durable runtime
proof that the map/geofence failure signals stay distinguishable, that alerting
uses recent-window (not lifetime-counter) signals, and that the final evidence
document carries no template placeholders.

### Artifact Index

- Final evidence document:
  `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- Closeout proof test:
  `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts`
- Closeout row-level proof artifact:
  `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json`
- Closeout test report:
  `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/vitest-fleets-closeout-006-observability-proof-20260708.json`
- Alert rules:
  `infra/alerts/map-geofence-alerts.yaml`
- Runbook distinctions:
  `docs/03-runbooks/map-geofence-observability-runbook.md`

### Acceptance Matrix

| Acceptance item                                                                                | Result | Row-level evidence                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP-OBS-001-FINAL-EVIDENCE.md` exists with no template placeholders                           | PASS   | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` under `finalEvidenceIntegrity.placeholderHits` (`[]`); asserted by `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts` (`carries no template placeholders`).                                                              |
| every required metric/audit/alert/runbook distinction is a PASS with a row-level artifact path | PASS   | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` under `finalEvidenceIntegrity.passRowCount` (>=30, every PASS row asserted to carry a `support/sidecars`/`docs/03-runbooks`/`infra/alerts`/`apps/api` path); source matrices in `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`. |
| outage, ambiguity, and policy-denial signals are distinguishable                               | PASS   | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` under `runtimeDistinguishability` (isolated `providerOutageCount`/`addressAmbiguityCount`/`serviceArea.policyDenialCount`) and `recentWindowAlerts.distinctSignalMetrics` (three distinct source metrics).                                    |
| alert evidence uses recent-window signals, not lifetime counters                               | PASS   | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` under `recentWindowAlerts.rows` (each alert wraps its metric in `rate()`/`max_over_time()`/`histogram_quantile()` over a bounded `[Nm]` window); source rules in `infra/alerts/map-geofence-alerts.yaml`.                                     |

### Signal Distinguishability Proof

| Signal                    | Runtime counter (isolated)            | Recent-window alert                          | Source metric                              |
| ------------------------- | ------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| Provider outage           | `geo.providerOutageCount`             | `MapProviderErrorRateHigh` (`[5m]`)          | `map_provider_errors_total`                |
| Address ambiguity         | `geo.addressAmbiguityCount`           | `AddressAmbiguitySpike` (`[15m]`)            | `map_geocode_requests_total{result="..."}` |
| Coordinate-less attempt   | `geo.coordinateLessAttemptCount`      | `CoordinateLessDispatchAttemptHigh` (`[5m]`) | `coordinate_less_booking_attempts_total`   |
| Policy denial             | `serviceArea.policyDenialCount`       | `ServiceAreaPolicyBlockSpike` (`[15m]`)      | `service_area_policy_blocks_total`         |
| PostGIS/evaluator failure | `serviceArea` evaluation reason codes | `ServiceAreaEvaluationUnavailable` (`[10m]`) | `service_area_evaluations_total`           |
| Manual override           | `geo.manualOverrideCount`             | `ManualMapOverrideSpike` (`[30m]`)           | `geo_manual_overrides_total`               |

### Command Log

| Command                                                                                                                                                                                                                                                     | Result | Artifact                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir apps/api exec vitest run tests/unit/map-geofence-observability-closeout-proof.test.ts --reporter=json --outputFile ../../support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/vitest-fleets-closeout-006-observability-proof-20260708.json` | `PASS` | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/vitest-fleets-closeout-006-observability-proof-20260708.json` |
| `pnpm --dir apps/api exec eslint tests/unit/map-geofence-observability-closeout-proof.test.ts --max-warnings=0`                                                                                                                                             | `PASS` | (no findings)                                                                                                           |
| `pnpm --dir apps/api run typecheck`                                                                                                                                                                                                                         | `PASS` | (no findings)                                                                                                           |

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

- This board closes the `FLEETS-CLOSEOUT-001` persisted spatial proof row, the
  `FLEETS-CLOSEOUT-005` Gate D driver evidence row, and the
  `FLEETS-CLOSEOUT-006` `MAP-OBS-001` observability evidence row only. It does
  not claim full `MAP-REL-001` production readiness or `dev` deployment.
- The `FLEETS-CLOSEOUT-006` observability closeout remains repo-backed: the
  Prometheus/OpenTelemetry exporter wiring, Grafana panels, and staged traffic
  called out in `MAP-OBS-001-FINAL-EVIDENCE.md` under `External Gates Still
Open` stay `EXTERNAL-GATED`.
- Separate parent blockers around provider runtime wiring and deploy-rail
  alignment on `MAP_PROVIDER_MODE` remain outside this task board's acceptance
  slice.
- Integration status for the broader release family remains controlled by the
  parent release task and its verifier/deploy evidence.
