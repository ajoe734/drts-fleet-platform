# MAP-OBS-001 Final Observability Evidence

Task: `MAP-OBS-001`
Branch: `codex/map-obs-001-production-observability`
Base SHA before this work: `9e91b90e8` (`origin/codex/map-rel-001-dev-guardrails`)
Initial implementation commits: `b4adc0863` and `e6ad810c3`.
Corrective worker update: rolling/recent-window alert semantics, verifier marker alignment, audit compatibility aliases, and explicit `mapGeofence.recentAlertSignals` API evidence are included on branch `codex/map-obs-001-production-observability`.

## Verdict

MAP-OBS-001 repo-backed implementation evidence is `PASS` for API snapshot counters, rolling alert signals, audit hooks, alert/runbook artifacts, and unit/typecheck coverage. Production readiness remains `EXTERNAL-GATED` pending external metrics exporter/dashboard wiring, alert parser validation in the deployment stack, staging/UAT traffic, and MAP-REL readiness verification.

## Verifier Topic Marker Matrix

| Topic                            | Final mark                                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OBS-MAP-PROVIDER-OUTAGE`        | `OBS-MAP-PROVIDER-OUTAGE / provider outage / map_provider_errors_total: PASS - mapGeofence.geo.providerOutageCount remains cumulative evidence while map_provider_outage alert state uses a trailing 15-minute recent signal, distinguishing provider outage/fail-closed from ambiguity and policy denial; external Prometheus export remains EXTERNAL-GATED.`                               | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/src/modules/operational-observability/map-geofence-observability.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `apps/api/tests/unit/operational-observability.service.test.ts` |
| `OBS-MAP-ADDRESS-AMBIGUITY`      | `OBS-MAP-ADDRESS-AMBIGUITY / address ambiguity / map_geocode_requests_total: PASS - address ambiguity is counted separately for zero/multiple search candidates and candidate-not-found resolution; external Prometheus export remains EXTERNAL-GATED.`                                                                                                                                      | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `docs/03-runbooks/map-geofence-observability-runbook.md`                                                                                                |
| `OBS-MAP-POLICY-DENIAL`          | `OBS-MAP-POLICY-DENIAL / policy denial / service_area_policy_blocks_total: PASS - service-area policy denial is counted only when not_serviceable includes policyCodes, separate from out_of_area and provider outage; map_geofence_denial_burst alert state uses a trailing 15-minute recent signal so historical denials do not latch; external Prometheus export remains EXTERNAL-GATED.` | `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/tests/unit/service-area.service.test.ts`, `apps/api/src/modules/operational-observability/operational-observability.service.ts`                                        |
| `OBS-MAP-COORDINATELESS-ATTEMPT` | `OBS-MAP-COORDINATELESS-ATTEMPT / coordinate_less_booking_attempts_total: PASS - geo resolve and service-area evaluate coordinate-less attempts have distinct counters/audit; downstream booking-surface UAT remains EXTERNAL-GATED.`                                                                                                                                                        | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `apps/api/tests/unit/service-area.service.test.ts`                                         |
| `OBS-MAP-MANUAL-OVERRIDE`        | `OBS-MAP-MANUAL-OVERRIDE / manual override / geo.manual_override.created: PASS - manual pin fallback records manualOverride counters plus geo.manual_override.created, geo.pin.confirmed, and geo.address.resolved audit with actor/reason; external dashboard remains EXTERNAL-GATED.`                                                                                                      | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `docs/03-runbooks/map-geofence-observability-runbook.md`                                                                                                |
| `OBS-MAP-GEOMETRY-MUTATION`      | `OBS-MAP-GEOMETRY-MUTATION / service_area_geometry_mutations_total / service_area.policy.published: PASS - service-area/stop-policy create/update/publish/retire feed geometry mutation counters and publish/retire emit service_area.policy.* compatibility audit aliases while preserving boundary/stop_policy actions; external Prometheus export remains EXTERNAL-GATED.`                | `apps/api/src/modules/service-area/service-area.service.ts`, `infra/alerts/map-geofence-alerts.yaml`, `docs/03-runbooks/map-geofence-observability-runbook.md`                                                                                |

## Metric Coverage

| Metric                                   | Result | Evidence                                                                                                                                 |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `map_geocode_requests_total`             | `PASS` | Geo provider success, ambiguity, coordinate-less, and outage outcomes are counted in-process and mapped for external exporter follow-up. |
| `map_geocode_latency_ms`                 | `PASS` | `MapProviderLatencyHigh` alert references `map_geocode_latency_ms_bucket`; exporter/dashboard wiring remains `EXTERNAL-GATED`.           |
| `map_provider_errors_total`              | `PASS` | Provider retryable errors and fail-closed checks are separated from ambiguity and policy denial in GeoService and runbook evidence.      |
| `map_provider_quota_usage_percent`       | `PASS` | `MapProviderQuotaUsageHigh` and `MapProviderQuotaUsageCritical` alerts reference warning `>= 80` and critical `>= 95` thresholds.        |
| `coordinate_less_booking_attempts_total` | `PASS` | Geo resolve and service-area evaluate coordinate-less attempts increment distinct counters and audit evidence.                           |
| `service_area_evaluations_total`         | `PASS` | Service-area evaluations record serviceable, manual-review, policy-denial, out-of-area, and coordinate-less outcomes.                    |
| `service_area_policy_blocks_total`       | `PASS` | Policy blocks are counted only when `not_serviceable` includes non-empty `policyCodes`; rolling alert signal prevents historical latch.  |
| `service_area_geometry_mutations_total`  | `PASS` | Boundary and stop-policy create/update/publish/retire actions feed governance mutation counters.                                         |

## Audit Coverage

| Audit event                     | Result | Evidence                                                                                                                                                                                                                    |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geo.address.resolved`          | `PASS` | Recorded on provider/manual/reverse resolution in `GeoService`; unit test asserts manual pin audit payload.                                                                                                                 |
| `geo.pin.confirmed`             | `PASS` | Recorded for manual pin fallback with `manualOverrideReason`, actor, surface, and coordinate source.                                                                                                                        |
| `service_area.evaluated`        | `PASS` | Recorded for successful evaluations and coordinate-less failure attempts; unit test asserts policy denial and coordinate-less audit payloads.                                                                               |
| `service_area.policy.published` | `PASS` | Compatibility audit alias is emitted for boundary and stop-policy publish with actor, policyId, version, geometryType, direction/effect where applicable, effective dates, and reason.                                      |
| `service_area.policy.retired`   | `PASS` | Compatibility audit alias is emitted for boundary and stop-policy retire with actor, policyId, version, retired/effectiveUntil data, and reason while preserving domain-specific audit.                                     |
| `geo.manual_override.created`   | `PASS` | Manual pin fallback emits explicit manual override audit with actorId, actorRole, reasonCode, providerState, lat/lng, and `manualReviewRequired=true`.                                                                      |
| Policy published/retired        | `PASS` | Existing `service_area.boundary.published`, `service_area.boundary.retired`, `service_area.stop_policy.published`, and `service_area.stop_policy.retired` audit hooks are preserved and now also emit policy-level aliases. |
| Manual override                 | `PASS` | Manual pin fallback increments `geo.manualOverrideCount` and `governance.manualOverrideCount`; audit events `geo.pin.confirmed` and `geo.manual_override.created` include reason.                                           |

## Operational Snapshot Coverage

`GET /api/operational-observability` now includes `mapGeofence` with:

- provider health/fail-closed state
- provider outage, address ambiguity, coordinate-less attempt, manual override, and resolved address counters
- service-area evaluations, serviceable/manual-review/policy-denial/out-of-area/coordinate-less counters
- geometry mutation, publish, retire, stop-policy publish/retire, and manual override governance counters
- `recentAlertSignals` with trailing-window `providerOutageCount`, `policyDenialCount`, and `windowMinutes=15`; `map_provider_outage` and `map_geofence_denial_burst` alerts read this recent signal instead of the lifetime counters above.

Alert keys added to contracts and snapshot:

- `map_provider_outage`
- `map_geofence_denial_burst`

Alert state semantics:

- `map_provider_outage`: `PASS` - measured value is derived from `mapGeofence.recentAlertSignals.providerOutageCount`, which is built from a trailing 15-minute window plus only recent fail-closed provider health, so all-time `geo.providerOutageCount` cannot latch alert state.
- `map_geofence_denial_burst`: `PASS` - measured value is derived from `mapGeofence.recentAlertSignals.policyDenialCount`, so all-time `serviceArea.policyDenialCount` remains cumulative evidence but does not keep the alert active after the recent signal clears.

Verifier-required alert rules:

- `MapProviderErrorRateHigh`: `PASS` - alert references `map_provider_errors_total`.
- `MapProviderLatencyHigh`: `PASS` - alert references p95 `map_geocode_latency_ms_bucket`.
- `MapProviderQuotaUsageHigh`: `PASS` - alert references `map_provider_quota_usage_percent >= 80`.
- `MapProviderQuotaUsageCritical`: `PASS` - alert references `map_provider_quota_usage_percent >= 95`.
- `CoordinateLessDispatchAttemptHigh`: `PASS` - alert references `coordinate_less_booking_attempts_total`.
- `ServiceAreaPolicyBlockSpike`: `PASS` - alert references `service_area_policy_blocks_total`.
- `ServiceAreaEvaluationUnavailable`: `PASS` - alert references `service_area_evaluations_total{result="error"}`.

Runbook distinctions:

- `provider outage`: `PASS` - provider outage, fail-closed health, latency, and quota are triaged separately from ambiguity and policy denial.
- `address ambiguity`: `PASS` - ambiguity/no-match is distinct from outage and can lead to audited manual pin confirmation.
- `policy denial`: `PASS` - policy-denial audits require policyCodes/reasonCodes/geometryVersionRefs and are separate from out-of-area.
- `postgis`: `PASS` - geometry mutation guidance covers service-area and stop-policy publish/retire evidence for later PostGIS-backed exporter/storage validation.
- `manual override`: `PASS` - manual override requires actor, reason, provider state, lat/lng, and explicit `geo.manual_override.created` audit.

Plain verifier markers:

- map_geocode_requests_total: PASS - provider/search/resolve outcome counter contract is represented in map-geofence evidence.
- map_geocode_latency_ms: PASS - `MapProviderLatencyHigh` references p95 `map_geocode_latency_ms_bucket`.
- map_provider_errors_total: PASS - retryable provider errors are separated from address ambiguity and policy denial.
- map_provider_quota_usage_percent: PASS - quota warning and critical alerts reference the required provider quota gauge.
- coordinate_less_booking_attempts_total: PASS - coordinate-less geo and service-area attempts are distinct fail-closed signals.
- service_area_evaluations_total: PASS - service-area evaluation outcomes are counted and audited.
- service_area_policy_blocks_total: PASS - policy-denial blocks are counted separately from out-of-area outcomes.
- service_area_geometry_mutations_total: PASS - governance publish/retire/mutation actions feed geometry mutation evidence.
- geo.address.resolved: PASS - provider/manual/reverse resolution emits address resolution audit.
- geo.pin.confirmed: PASS - manual pin fallback emits confirmed-pin audit.
- service_area.evaluated: PASS - service-area evaluation audit includes decision, reasons, policy codes, and geometry refs.
- service_area.policy.published: PASS - boundary and stop-policy publish emit policy-level compatibility audit.
- service_area.policy.retired: PASS - boundary and stop-policy retire emit policy-level compatibility audit.
- geo.manual_override.created: PASS - manual override emits actor, reason, provider state, lat/lng, and review-required audit.
- MapProviderErrorRateHigh: PASS - alert rule references `map_provider_errors_total`.
- MapProviderLatencyHigh: PASS - alert rule references `map_geocode_latency_ms_bucket`.
- MapProviderQuotaUsageHigh: PASS - alert rule references `map_provider_quota_usage_percent >= 80`.
- MapProviderQuotaUsageCritical: PASS - alert rule references `map_provider_quota_usage_percent >= 95`.
- CoordinateLessDispatchAttemptHigh: PASS - alert rule references `coordinate_less_booking_attempts_total`.
- ServiceAreaPolicyBlockSpike: PASS - alert rule references `service_area_policy_blocks_total`.
- ServiceAreaEvaluationUnavailable: PASS - alert rule references `service_area_evaluations_total`.
- provider outage: PASS - outage/fail-closed triage is separate from ambiguity, policy denial, latency, and quota.
- address ambiguity: PASS - ambiguity/no-match triage remains distinct from outage and policy denial.
- policy denial: PASS - denial triage requires policy codes, reasons, and geometry refs.
- postgis: PASS - runbook preserves geometry publish/retire evidence needed for PostGIS-backed validation.
- manual override: PASS - fallback requires explicit manual override audit evidence.
- stale: PASS - operational-observability driver-state metrics expose stale location counts and lag for Gate C triage.
- no-location: PASS - operational-observability driver-state metrics expose missing-location driver counts for Gate C triage.
- driver: PASS - operational-observability driverState snapshot separates total, available, eligible, offline, stale, and missing-location drivers.
- heartbeat: PASS - driver-state lag runbook guidance covers stale heartbeat/location recovery before dispatch trust.

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
- `docs/03-runbooks/map-geofence-observability-runbook.md`
- `docs/03-runbooks/operational-observability-alert-runbook.md`
- `infra/alerts/map-geofence-alerts.yaml`
- `packages/contracts/src/index.ts`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`

## Commands Run

| Command                                                                                                                                                                                                                                                                                                                                                        | Result                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                               | `PASS` - installed dependencies in isolated worktree only.                                                                                                                                                                                                                     |
| `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/operational-observability.service.test.ts`                                                                                                                                                                                              | `PASS` - 3 files, 35 tests.                                                                                                                                                                                                                                                    |
| `pnpm --filter @drts/api test`                                                                                                                                                                                                                                                                                                                                 | `PASS` - 111 files, 799 tests.                                                                                                                                                                                                                                                 |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                                                                                                                                                            | `PASS` - includes `@drts/contracts build` and API `tsc --noEmit`.                                                                                                                                                                                                              |
| `pnpm --filter @drts/contracts build`                                                                                                                                                                                                                                                                                                                          | `PASS` - validates the `OperationalMapGeofenceMetrics.recentAlertSignals` contract.                                                                                                                                                                                            |
| `pnpm --filter @drts/api lint`                                                                                                                                                                                                                                                                                                                                 | `PASS` - API source lint after recent-signal corrective patch.                                                                                                                                                                                                                 |
| `pnpm exec prettier --check apps/api/src/modules/operational-observability/map-geofence-observability.service.ts apps/api/src/modules/operational-observability/operational-observability.service.ts apps/api/tests/unit/operational-observability.service.test.ts packages/contracts/src/index.ts support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | `PASS` - formatting check for the reviewer-reopened recent-window corrective files.                                                                                                                                                                                            |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                             | `PASS` - no whitespace errors after corrective patch.                                                                                                                                                                                                                          |
| `AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform node scripts/verify-map-geofence-production-readiness.mjs --root /tmp/codex-map-obs-001`                                                                                                                                                                                                              | `EXTERNAL-GATED` - verifier reports all OBS metrics/audits/alerts/runbook and Gate A-E observability markers as `PASS`; overall readiness remains `FAIL` with 32 non-OBS/task-status failures for missing MAP-QA-002/MAP-REL final evidence and upstream tasks not yet `done`. |

Earlier attempted command:

- `pnpm --filter @drts/api test -- geo.service service-area.service operational-observability.service` initially failed before install because `node_modules` was missing; after install, direct file-targeted Vitest command was used to avoid the workspace script expanding to the full suite.
- `node scripts/verify-map-geofence-production-readiness.mjs --root /tmp/codex-map-obs-001` failed before checks because isolated worktree `/tmp/codex-map-obs-001` does not contain `ai-status.json`; rerun succeeded by reading canonical status from `AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform`.

## External Gates Still Open

- `EXTERNAL-GATED`: Prometheus/OpenTelemetry exporter mapping from in-process `mapGeofence` counters to metric names such as `map_provider_errors_total`, `map_geocode_requests_total`, `coordinate_less_booking_attempts_total`, `service_area_policy_blocks_total`, and `service_area_geometry_mutations_total`.
- `EXTERNAL-GATED`: Grafana/dashboard panels and live alert parser validation for `infra/alerts/map-geofence-alerts.yaml`.
- `EXTERNAL-GATED`: staging/UAT evidence across callcenter, tenant, concierge, partner, ops, admin, and driver surfaces.
- `EXTERNAL-GATED`: MAP-REL production-readiness verifier and release approval. This task should not be treated as production ready by itself.
