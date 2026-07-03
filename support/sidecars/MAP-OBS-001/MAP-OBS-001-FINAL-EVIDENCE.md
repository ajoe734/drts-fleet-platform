# MAP-OBS-001 Final Observability Evidence

Task: `MAP-OBS-001`
Owner: `Claude2` (reassigned from Gemini2 after a 2/2 terminal owner-slot failure loop)
Reviewer: `Claude`
Branch: `claude2/map-obs-001`
Base before this work: `origin/dev@cc6c076705e8ede294f558a981fdfd3d7a2d5842` (dev tip carrying MAP-BE-002 geo provider gateway hardening).
Reproduction note: this branch reproduces the reviewer-approved observability implementation from the retired `codex2/map-obs-001` lane (last reviewed tip `codex2/map-obs-001@b26215932`) replayed onto the current `dev` tip. The only merge conflict was an adjacent test insertion in `apps/api/tests/unit/geo.service.test.ts`, resolved by keeping both the MAP-BE-002 not-found test and the MAP-OBS-001 audit test.
Reviewed-source tip reproduced here: `codex2/map-obs-001@b26215932` (owner closeout after review approval). The current branch tip on `claude2/map-obs-001` carries the single reproduction commit `MAP-OBS-001: reproduce spatial observability and audit on dev`; its concrete SHA is recorded in the machine-truth handoff note and `PUSH_BRANCH`/`COMMIT_HASH` closeout fields rather than embedded self-referentially in this file.

## Verdict

MAP-OBS-001 repo-backed implementation evidence is `PASS` for API snapshot counters, rolling (recent-window) alert signals, audit hooks, alert/runbook artifacts, and unit/typecheck/lint coverage. Production readiness remains `EXTERNAL-GATED` pending external metrics exporter/dashboard wiring, live alert-parser validation in the deployment stack, staging/UAT traffic, and MAP-REL readiness verification. This task is not production-ready by itself.

## Verifier Topic Marker Matrix

| Topic                            | Final mark                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OBS-MAP-PROVIDER-OUTAGE`        | `OBS-MAP-PROVIDER-OUTAGE / provider outage / map_provider_errors_total: PASS` - `mapGeofence.geo.providerOutageCount` stays cumulative evidence while `map_provider_outage` alert state uses a trailing 15-minute recent signal, distinguishing provider outage / fail-closed from ambiguity and policy denial; external Prometheus export remains `EXTERNAL-GATED`.                                 | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`                                          |
| `OBS-MAP-ADDRESS-AMBIGUITY`      | `OBS-MAP-ADDRESS-AMBIGUITY / address ambiguity / map_geocode_requests_total: PASS` - address ambiguity is counted separately for zero/multiple search candidates and candidate-not-found resolution; external Prometheus export remains `EXTERNAL-GATED`.                                                                                                                                            | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`                                          |
| `OBS-MAP-POLICY-DENIAL`          | `OBS-MAP-POLICY-DENIAL / policy denial / service_area_policy_blocks_total: PASS` - service-area policy denial is counted only when `not_serviceable` includes `policyCodes`, separate from out-of-area and provider outage; `map_geofence_denial_burst` alert state uses a trailing 15-minute recent signal so historical denials do not latch; external Prometheus export remains `EXTERNAL-GATED`. | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`                                          |
| `OBS-MAP-COORDINATELESS-ATTEMPT` | `OBS-MAP-COORDINATELESS-ATTEMPT / coordinate_less_booking_attempts_total: PASS` - geo resolve and service-area evaluate coordinate-less attempts have distinct counters/audit; downstream booking-surface UAT remains `EXTERNAL-GATED`.                                                                                                                                                              | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`                                          |
| `OBS-MAP-MANUAL-OVERRIDE`        | `OBS-MAP-MANUAL-OVERRIDE / manual override / geo.manual_override.created: PASS` - manual pin fallback records manual-override counters plus `geo.manual_override.created`, `geo.pin.confirmed`, and `geo.address.resolved` audit with actor/reason; external dashboard remains `EXTERNAL-GATED`.                                                                                                     | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`                                          |
| `OBS-MAP-GEOMETRY-MUTATION`      | `OBS-MAP-GEOMETRY-MUTATION / service_area_geometry_mutations_total / service_area.policy.published: PASS` - service-area/stop-policy create/update/publish/retire feed geometry mutation counters and publish/retire emit `service_area.policy.*` compatibility audit aliases while preserving boundary/stop_policy actions; external Prometheus export remains `EXTERNAL-GATED`.                    | `docs/03-runbooks/map-geofence-observability-runbook.md`, `infra/alerts/map-geofence-alerts.yaml`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json` |

## Recent-Window Alert Semantics

`GET /api/operational-observability` includes `mapGeofence.recentAlertSignals` with trailing-window `providerOutageCount`, `policyDenialCount`, and `windowMinutes=15`. The `map_provider_outage` and `map_geofence_denial_burst` alert keys read this recent signal instead of the lifetime counters, so an all-time counter cannot latch an alert once the recent window clears. This is asserted by `apps/api/tests/unit/operational-observability.service.test.ts` and the alert-rule contract test `tests/unit/map-geofence-alerts.test.ts`.

- `map_provider_outage`: PASS - derived from `mapGeofence.recentAlertSignals.providerOutageCount` (trailing 15-minute window plus only recent fail-closed provider health). Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`.
- `map_geofence_denial_burst`: PASS - derived from `mapGeofence.recentAlertSignals.policyDenialCount`; lifetime `serviceArea.policyDenialCount` stays cumulative but does not keep the alert active after the recent signal clears. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`.

## Row-Level Artifact-Linked Verifier Markers

Every marker below is a self-contained PASS row that includes a concrete artifact path so automated readiness verification can key on a single line.

### Metrics

- `map_geocode_requests_total`: PASS - provider search/resolve/reverse outcomes (success, address ambiguity, coordinate-less, provider outage) are counted in-process for exporter follow-up. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `map_geocode_latency_ms`: PASS - `MapProviderLatencyHigh` reads p95 `map_geocode_latency_ms_bucket`; in-process latency is captured per provider operation, exporter wiring stays EXTERNAL-GATED. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `map_provider_errors_total`: PASS - retryable provider errors and fail-closed checks are counted separately from address ambiguity and policy denial. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `map_provider_quota_usage_percent`: PASS - `MapProviderQuotaUsageHigh` (>= 80) and `MapProviderQuotaUsageCritical` (>= 95) reference the provider quota gauge. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `coordinate_less_booking_attempts_total`: PASS - geo resolve and service-area evaluate coordinate-less attempts increment distinct counters plus audit. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `service_area_evaluations_total`: PASS - service-area evaluations record serviceable, manual-review, policy-denial, out-of-area, and coordinate-less outcomes. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `service_area_policy_blocks_total`: PASS - policy blocks are counted only when `not_serviceable` carries non-empty `policyCodes`; the recent-window signal prevents historical latch. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `service_area_geometry_mutations_total`: PASS - boundary and stop-policy create/update/publish/retire actions feed governance mutation counters. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.

### Audit events

- `geo.address.resolved`: PASS - recorded on provider/manual/reverse resolution in `GeoService`; unit test asserts manual-pin audit payload. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `geo.pin.confirmed`: PASS - recorded for manual pin fallback with `manualOverrideReason`, actor, surface, and coordinate source. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `service_area.evaluated`: PASS - recorded for successful evaluations and coordinate-less failure attempts; unit test asserts policy-denial and coordinate-less audit payloads. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `service_area.policy.published`: PASS - compatibility alias emitted for boundary and stop-policy publish with actor, policyId, version, geometryType, effective dates, and reason. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `service_area.policy.retired`: PASS - compatibility alias emitted for boundary and stop-policy retire with actor, policyId, version, retired/effectiveUntil data, and reason while preserving domain audit. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `geo.manual_override.created`: PASS - manual pin fallback emits explicit manual-override audit with actorId, actorRole, reasonCode, providerState, lat/lng, and `manualReviewRequired=true`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md`.

### Alert rules (recent-window)

- `MapProviderErrorRateHigh`: PASS - alert fires on `rate(map_provider_errors_total{retryable="true"}[5m])`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `MapProviderLatencyHigh`: PASS - alert reads p95 `map_geocode_latency_ms_bucket` over a 5-minute window. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `MapProviderQuotaUsageHigh`: PASS - alert references `map_provider_quota_usage_percent >= 80`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `MapProviderQuotaUsageCritical`: PASS - alert references `map_provider_quota_usage_percent >= 95`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `CoordinateLessDispatchAttemptHigh`: PASS - alert fires on `rate(coordinate_less_booking_attempts_total[5m])`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `ServiceAreaPolicyBlockSpike`: PASS - alert fires on `rate(service_area_policy_blocks_total[15m])`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `ServiceAreaEvaluationUnavailable`: PASS - alert fires on `rate(service_area_evaluations_total{result="error"}[5m])`. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.

### Runbook distinctions

- `provider outage`: PASS - outage / fail-closed / latency / quota triage is separate from ambiguity and policy denial. Evidence: `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `address ambiguity`: PASS - ambiguity / no-match is distinct from outage and can lead to an audited manual pin confirmation. Evidence: `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `policy denial`: PASS - policy-denial audits require policyCodes / reasonCodes / geometryVersionRefs and are separate from out-of-area. Evidence: `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `postgis`: PASS - geometry-mutation guidance covers service-area and stop-policy publish/retire evidence for later PostGIS-backed exporter/storage validation. Evidence: `docs/03-runbooks/map-geofence-observability-runbook.md`.
- `manual override`: PASS - manual override requires actor, reason, provider state, lat/lng, and an explicit `geo.manual_override.created` audit. Evidence: `docs/03-runbooks/map-geofence-observability-runbook.md`.

### Gate C / Gate D driver-state markers

- `stale`: PASS - operational-observability driver-state metrics expose stale-location counts and lag for Gate C triage. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `no-location`: PASS - operational-observability driver-state metrics expose missing-location driver counts for Gate C triage. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `driver`: PASS - driverState snapshot separates total, available, eligible, offline, stale, and missing-location drivers. Evidence: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`, `docs/03-runbooks/operational-observability-alert-runbook.md`.
- `heartbeat`: PASS - driver-state lag runbook guidance covers stale heartbeat/location recovery before dispatch trust. Evidence: `docs/03-runbooks/operational-observability-alert-runbook.md`.

## Operational Snapshot Coverage

`GET /api/operational-observability` now includes `mapGeofence` with:

- provider health / fail-closed state
- provider outage, address ambiguity, coordinate-less attempt, manual override, and resolved-address counters
- service-area evaluations, serviceable / manual-review / policy-denial / out-of-area / coordinate-less counters
- geometry mutation, publish, retire, stop-policy publish/retire, and manual override governance counters
- `recentAlertSignals` with trailing-window `providerOutageCount`, `policyDenialCount`, and `windowMinutes=15`

Alert keys added to contracts and snapshot: `map_provider_outage`, `map_geofence_denial_burst`.

## Files Changed

- `apps/api/src/modules/geo/geo.controller.ts`
- `apps/api/src/modules/geo/geo.module.ts`
- `apps/api/src/modules/geo/geo.service.ts`
- `apps/api/src/modules/operational-observability/map-geofence-observability.module.ts`
- `apps/api/src/modules/operational-observability/map-geofence-observability.service.ts`
- `apps/api/src/modules/operational-observability/operational-observability.module.ts`
- `apps/api/src/modules/operational-observability/operational-observability.service.ts`
- `apps/api/src/modules/service-area/service-area.controller.ts`
- `apps/api/src/modules/service-area/service-area.module.ts`
- `apps/api/src/modules/service-area/service-area.service.ts`
- `apps/api/tests/unit/geo.service.test.ts`
- `apps/api/tests/unit/operational-observability.service.test.ts`
- `apps/api/tests/unit/service-area.service.test.ts`
- `tests/unit/map-geofence-alerts.test.ts`
- `docs/03-runbooks/map-geofence-observability-runbook.md`
- `docs/03-runbooks/operational-observability-alert-runbook.md`
- `infra/alerts/map-geofence-alerts.yaml`
- `packages/contracts/src/index.ts`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`
- `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`

## Commands Run

| Command                                                                                                                                                           | Result                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/contracts build`                                                                                                                             | `PASS` - validates the `OperationalMapGeofenceMetrics.recentAlertSignals` contract.                                                                                                                                                                                                                            |
| `pnpm --filter @drts/api typecheck`                                                                                                                               | `PASS` - `@drts/contracts build` + API `tsc --noEmit`, no errors.                                                                                                                                                                                                                                              |
| `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/operational-observability.service.test.ts` | `PASS` - 3 files, 38 tests. Artifact: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-observability-runtime-20260703T1425Z.json`.                                                                                                                                                                  |
| `pnpm exec vitest run tests/unit/map-geofence-alerts.test.ts`                                                                                                     | `PASS` - 1 file, 4 tests. Artifact: `support/sidecars/MAP-OBS-001/artifacts/vitest-map-geofence-alerts-20260703T1425Z.json`.                                                                                                                                                                                   |
| `pnpm --filter @drts/api test`                                                                                                                                    | `PASS` - 111 files, 802 tests.                                                                                                                                                                                                                                                                                 |
| `pnpm --filter @drts/api lint`                                                                                                                                    | `PASS` - `eslint src --max-warnings=0`.                                                                                                                                                                                                                                                                        |
| `pnpm exec eslint tests/unit/map-geofence-alerts.test.ts --max-warnings=0`                                                                                        | `PASS` - root alert-rule test lints clean.                                                                                                                                                                                                                                                                     |
| `node scripts/verify-map-geofence-production-readiness.mjs --root .artifacts/worktrees/auto/claude2-map-obs-001`                                                  | `EXTERNAL-GATED` - Observability Coverage section reports all OBS metrics/audits/alerts/runbook markers and Gate A-E observability markers as `PASS` with artifact evidence; overall verdict remains `FAIL` only on non-OBS items (MAP-QA-002 / MAP-REL-001 evidence and upstream task-status not yet `done`). |

## External Gates Still Open

- `EXTERNAL-GATED`: Prometheus/OpenTelemetry exporter mapping from in-process `mapGeofence` counters to metric names such as `map_provider_errors_total`, `map_geocode_requests_total`, `coordinate_less_booking_attempts_total`, `service_area_policy_blocks_total`, and `service_area_geometry_mutations_total`.
- `EXTERNAL-GATED`: Grafana/dashboard panels and live alert-parser validation for `infra/alerts/map-geofence-alerts.yaml` in the deployment stack.
- `EXTERNAL-GATED`: staging/UAT evidence across callcenter, tenant, concierge, partner, ops, admin, and driver surfaces.
- `EXTERNAL-GATED`: MAP-REL production-readiness verifier and release approval. This task must not be treated as production ready by itself.
