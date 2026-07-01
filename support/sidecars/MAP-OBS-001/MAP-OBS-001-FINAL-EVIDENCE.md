# MAP-OBS-001 Final Observability Evidence

Task: `MAP-OBS-001`
Branch: `codex/map-obs-001-production-observability`
Base SHA before this work: `9e91b90e8` (`origin/codex/map-rel-001-dev-guardrails`)
Final implementation commits: `b4adc0863` and `e6ad810c3`.

## Verdict

MAP-OBS-001 repo-backed implementation evidence is `PASS` for API snapshot counters, audit hooks, alert/runbook artifacts, and unit/typecheck coverage. Production readiness remains `EXTERNAL-GATED` pending external metrics exporter/dashboard wiring, alert parser validation in the deployment stack, staging/UAT traffic, and MAP-REL readiness verification.

## Verifier Topic Marker Matrix

| Topic                            | Final mark                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OBS-MAP-PROVIDER-OUTAGE`        | `OBS-MAP-PROVIDER-OUTAGE / provider outage / map_provider_errors_total: PASS - mapGeofence.geo.providerOutageCount and map_provider_outage alert distinguish provider outage/fail-closed from ambiguity and policy denial; external Prometheus export remains EXTERNAL-GATED.`                  | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/src/modules/operational-observability/map-geofence-observability.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `apps/api/tests/unit/operational-observability.service.test.ts` |
| `OBS-MAP-ADDRESS-AMBIGUITY`      | `OBS-MAP-ADDRESS-AMBIGUITY / address ambiguity / map_geocode_requests_total: PASS - address ambiguity is counted separately for zero/multiple search candidates and candidate-not-found resolution; external Prometheus export remains EXTERNAL-GATED.`                                         | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `docs/03-runbooks/map-geofence-observability-runbook.md`                                                                                                |
| `OBS-MAP-POLICY-DENIAL`          | `OBS-MAP-POLICY-DENIAL / policy denial / service_area_policy_blocks_total: PASS - service-area policy denial is counted only when not_serviceable includes policyCodes, separate from out_of_area and provider outage; external Prometheus export remains EXTERNAL-GATED.`                      | `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/tests/unit/service-area.service.test.ts`, `apps/api/src/modules/operational-observability/operational-observability.service.ts`                                        |
| `OBS-MAP-COORDINATELESS-ATTEMPT` | `OBS-MAP-COORDINATELESS-ATTEMPT / coordinate_less_booking_attempts_total: PASS - geo resolve and service-area evaluate coordinate-less attempts have distinct counters/audit; downstream booking-surface UAT remains EXTERNAL-GATED.`                                                           | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `apps/api/tests/unit/service-area.service.test.ts`                                         |
| `OBS-MAP-MANUAL-OVERRIDE`        | `OBS-MAP-MANUAL-OVERRIDE / manual override / geo.manual_override.created: PASS - manual pin fallback records manualOverride counters and geo.pin.confirmed/geo.address.resolved audit with actor/reason; external dashboard remains EXTERNAL-GATED.`                                            | `apps/api/src/modules/geo/geo.service.ts`, `apps/api/tests/unit/geo.service.test.ts`, `docs/03-runbooks/map-geofence-observability-runbook.md`                                                                                                |
| `OBS-MAP-GEOMETRY-MUTATION`      | `OBS-MAP-GEOMETRY-MUTATION / service_area_geometry_mutations_total / service_area.policy.published: PASS - service-area/stop-policy create/update/publish/retire feed geometry mutation counters and existing publish/retire audit actions; external Prometheus export remains EXTERNAL-GATED.` | `apps/api/src/modules/service-area/service-area.service.ts`, `infra/alerts/map-geofence-alerts.yaml`, `docs/03-runbooks/map-geofence-observability-runbook.md`                                                                                |

## Audit Coverage

| Audit event              | Result | Evidence                                                                                                                                                                                                          |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geo.address.resolved`   | `PASS` | Recorded on provider/manual/reverse resolution in `GeoService`; unit test asserts manual pin audit payload.                                                                                                       |
| `geo.pin.confirmed`      | `PASS` | Recorded for manual pin fallback with `manualOverrideReason`, actor, surface, and coordinate source.                                                                                                              |
| `service_area.evaluated` | `PASS` | Recorded for successful evaluations and coordinate-less failure attempts; unit test asserts policy denial and coordinate-less audit payloads.                                                                     |
| Policy published/retired | `PASS` | Existing `service_area.boundary.published`, `service_area.boundary.retired`, `service_area.stop_policy.published`, and `service_area.stop_policy.retired` audit hooks preserved and now feed governance counters. |
| Manual override          | `PASS` | Manual pin fallback increments `geo.manualOverrideCount` and `governance.manualOverrideCount`; audit event `geo.pin.confirmed` includes reason.                                                                   |

## Operational Snapshot Coverage

`GET /api/operational-observability` now includes `mapGeofence` with:

- provider health/fail-closed state
- provider outage, address ambiguity, coordinate-less attempt, manual override, and resolved address counters
- service-area evaluations, serviceable/manual-review/policy-denial/out-of-area/coordinate-less counters
- geometry mutation, publish, retire, stop-policy publish/retire, and manual override governance counters

Alert keys added to contracts and snapshot:

- `map_provider_outage`
- `map_geofence_denial_burst`

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

| Command                                                                                                                                                           | Result                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                  | `PASS` - installed dependencies in isolated worktree only.        |
| `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/operational-observability.service.test.ts` | `PASS` - 3 files, 34 tests.                                       |
| `pnpm --filter @drts/api test`                                                                                                                                    | `PASS` - 111 files, 798 tests.                                    |
| `pnpm --filter @drts/api typecheck`                                                                                                                               | `PASS` - includes `@drts/contracts build` and API `tsc --noEmit`. |
| `git diff --check`                                                                                                                                                | `PASS` - no whitespace errors.                                    |

Earlier attempted command:

- `pnpm --filter @drts/api test -- geo.service service-area.service operational-observability.service` initially failed before install because `node_modules` was missing; after install, direct file-targeted Vitest command was used to avoid the workspace script expanding to the full suite.

## External Gates Still Open

- `EXTERNAL-GATED`: Prometheus/OpenTelemetry exporter mapping from in-process `mapGeofence` counters to metric names such as `map_provider_errors_total`, `map_geocode_requests_total`, `coordinate_less_booking_attempts_total`, `service_area_policy_blocks_total`, and `service_area_geometry_mutations_total`.
- `EXTERNAL-GATED`: Grafana/dashboard panels and live alert parser validation for `infra/alerts/map-geofence-alerts.yaml`.
- `EXTERNAL-GATED`: staging/UAT evidence across callcenter, tenant, concierge, partner, ops, admin, and driver surfaces.
- `EXTERNAL-GATED`: MAP-REL production-readiness verifier and release approval. This task should not be treated as production ready by itself.
