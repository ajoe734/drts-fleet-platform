# Map/Geofence Observability Runbook

Task: `MAP-OBS-001`

Surfaces:

- `GET /api/geo/health`
- `GET /api/operational-observability`
- `POST /api/geo/resolve`
- `POST /api/geo/reverse`
- `POST /api/service-area/evaluate`
- Service-area admin publish/retire endpoints

## Purpose

This runbook keeps map provider failures, quota pressure, address ambiguity, service-area policy denials, PostGIS/evaluator failures, coordinate-less attempts, manual overrides, and geometry mutations separate during production triage. Do not treat these as one generic "map failed" class.

## Snapshot Fields

`GET /api/operational-observability` exposes `mapGeofence`:

- `providerHealth`: provider, mode, fail-closed state, and last health check.
- `providerHealth.quota`: configured limits, current usage percent, and warning/critical state when quota telemetry is available.
- `geo.providerOutageCount`: retryable provider failures and fail-closed configuration failures.
- `geo.addressAmbiguityCount`: no-match or multiple-candidate address handling.
- `geo.coordinateLessAttemptCount`: resolve/evaluate attempts without usable coordinates or candidate references.
- `geo.manualOverrideCount`: manual pin fallback usage.
- `geo.requests.successRatePercent`: aggregate geocode success rate across search/resolve/reverse attempts.
- `geo.requests.providerErrorCount`: provider error request count, separate from address ambiguity and coordinate-less handling.
- `geo.latencyMs.average` and `geo.latencyMs.p95`: in-process request latency summary for recent triage snapshots.
- `serviceArea.policyDenialCount`: no-pickup/no-dropoff policy blocks, separate from out-of-area results.
- `serviceArea.outOfAreaCount`: not-serviceable results without a stop-policy denial.
- `serviceArea.serviceableCount`, `manualReviewCount`, and `coordinateLessAttemptCount`: decision mix for service-area evaluation.
- `governance.geometryMutationCount`: service-area or stop-policy create/update/publish/retire activity.

## Provider Outage

Signals:

- `GET /api/geo/health` has `failClosed=true` or `status=unhealthy`.
- `mapGeofence.geo.providerOutageCount` increases.
- `map_provider_errors_total{retryable="true"}` or `map_provider_fail_closed` alerts fire.

Actions:

1. Confirm provider mode, missing secrets, quota, and runtime environment from `/api/geo/health`.
2. Check whether failures are retryable provider errors before routing to address-correction teams.
3. Keep coordinate-less booking blocked. Manual pin fallback requires actor and reason audit evidence.

## Provider Quota

Signals:

- `providerHealth.quota.usagePercent` is in warning/critical state.
- `MapProviderQuotaUsageHigh` or `MapProviderQuotaUsageCritical` alerts fire.
- Provider health shows a configured live provider with finite quota limits.

Actions:

1. Distinguish quota pressure from provider outage. Quota pressure can still present as healthy before hard exhaustion.
2. Review current usage percent against warning/critical thresholds before changing routing or releasing broader map traffic.
3. Escalate to platform/infrastructure owners before operators start relying on manual override as the primary path.

## Address Ambiguity

Signals:

- `mapGeofence.geo.addressAmbiguityCount` increases.
- Search returns zero or multiple candidates, or resolve cannot find the selected candidate.
- Audit trail may still show later `geo.pin.confirmed` if an operator manually confirms a pin.

Actions:

1. Ask the surface owner to present candidate selection or manual pin confirmation.
2. Do not classify this as provider outage unless provider health is unhealthy or retryable errors are present.
3. Confirm `geo.address.resolved` exists before the address is allowed into dispatchable order state.

## Policy Denial

Signals:

- `mapGeofence.serviceArea.policyDenialCount` increases.
- `service_area.evaluated` audit includes `decision=not_serviceable` and non-empty `policyCodes`.
- `service_area_policy_blocks_total` or `map_geofence_denial_burst` alerts fire.

Actions:

1. Inspect `reasonCodes`, `policyCodes`, `serviceAreaCodes`, and `geometryVersionRefs`.
2. Distinguish stop-policy denial from provider outage and from plain out-of-area results.
3. If policy looks wrong, route to Platform Admin geometry governance and verify publish/retire audit entries before changing live rules.

## PostGIS / Evaluator Unavailable

Signals:

- `ServiceAreaEvaluationUnavailable` alert fires.
- Service-area evaluation errors spike with evaluator/PostGIS-unavailable reason labels.
- Provider health may remain healthy while service-area decisions still fail closed.

Actions:

1. Do not classify evaluator/PostGIS failure as address ambiguity or provider outage.
2. Treat the evaluator as fail-closed until service-area geometry reads recover or a reviewed manual fallback is approved.
3. Check recent geometry publish/retire activity before blaming live policy data for evaluator failures.

## Coordinate-Less Attempt

Signals:

- `mapGeofence.geo.coordinateLessAttemptCount` or `mapGeofence.serviceArea.coordinateLessAttemptCount` increases.
- `service_area.evaluated` audit includes `decision=coordinate_less_attempt`.
- `CoordinateLessDispatchAttemptHigh` alert fires.

Actions:

1. Treat this as a fail-closed booking safety issue, not a normal validation annoyance.
2. Identify the surface and actor role from metrics/audit where available.
3. Require either a provider candidate or a confirmed manual pin before dispatch.

## Manual Override

Signals:

- `mapGeofence.geo.manualOverrideCount` and `mapGeofence.governance.manualOverrideCount` increase.
- Audit contains both `geo.address.resolved` and `geo.pin.confirmed`.
- `geo.pin.confirmed` includes `manualOverrideReason`, actor, surface, and coordinate source `manual_pin`.

Actions:

1. Confirm the actor and reason are present before accepting the fallback.
2. Pair with service-area evaluation evidence when dispatchability is affected.
3. Review spikes for provider outage or UI candidate-selection regressions.

## Geometry Mutation

Signals:

- `mapGeofence.governance.geometryMutationCount` increases.
- Audit contains service-area boundary or stop-policy create/update/publish/retire events.
- Alert `ServiceAreaGeometryMutationUnexpected` fires for non-approved mutations once external metrics export is wired.

Actions:

1. Inspect actor, action, version, effective dates, reason, and geometry version references.
2. For policy publish/retire, verify `service_area.stop_policy.published` or `service_area.stop_policy.retired`.
3. For boundary publish/retire, verify `service_area.boundary.published` or `service_area.boundary.retired`.

## External Gaps

This repo now emits in-process snapshot counters and audit hooks for MAP-OBS-001. Production readiness still requires external metrics export/dashboard wiring, alert parser validation in the deployment stack, staged traffic/UAT, and final MAP-REL readiness verification.
