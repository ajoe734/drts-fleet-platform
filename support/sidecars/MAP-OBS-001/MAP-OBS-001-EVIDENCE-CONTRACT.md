# MAP-OBS-001 Observability Evidence Contract

**Sidecar task:** `MAP-OBS-001-SIDECAR-EVIDENCE`  
**Parent task:** `MAP-OBS-001` - Spatial observability and audit  
**Parent owner/reviewer:** `Codex2` / `Codex`  
**Sidecar owner/reviewer:** `Codex` / `Codex2`  
**Scope boundary:** support artifact only. This contract defines the observability/audit evidence needed for production readiness; it does not implement metrics by itself.

## 1. Production Observability Verdict

`MAP-OBS-001` is required before the map/geofence stack can be called production level.

Without this evidence, the platform cannot reliably distinguish:

- map/geocode provider outage
- address ambiguity or no-geocode result
- service-area policy denial
- coordinate-less/manual fallback attempts
- geometry policy publish/retire mutations
- normal serviceable decisions versus manual-review decisions

This is especially important for Gate E: degraded mode is safe only when outage and manual fallback are observable, auditable, and alertable.

## 2. Metrics Contract

| Metric                                   | Type      | Required labels                                                   | Source event/path                      | Why it matters                                                                            |
| ---------------------------------------- | --------- | ----------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `map_geocode_requests_total`             | counter   | `provider`, `surface`, `operation`, `result`                      | Geo search/resolve/reverse API gateway | Separates successful geocode from no-match, provider error, timeout, and manual fallback. |
| `map_geocode_latency_ms`                 | histogram | `provider`, `surface`, `operation`, `result`                      | Geo provider wrapper                   | Detects provider degradation before hard outage.                                          |
| `map_provider_errors_total`              | counter   | `provider`, `error_code`, `retryable`, `surface`                  | Geo provider error normalization       | Proves UI degraded state is caused by provider outage, not policy denial.                 |
| `map_provider_quota_usage_percent`       | gauge     | `provider`, `environment`                                         | Provider health/quota probe            | Supports warning/critical alert thresholds and rollout throttle decisions.                |
| `coordinate_less_booking_attempts_total` | counter   | `surface`, `actor_role`, `policy_result`                          | Booking creation paths                 | Detects attempts to bypass map pinning or create normal dispatchable text-only orders.    |
| `service_area_evaluations_total`         | counter   | `surface`, `product_code`, `decision`, `reason_code`              | Service-area evaluator                 | Tracks serviceable/manual-review/not-serviceable/provider-unavailable mix.                |
| `service_area_policy_blocks_total`       | counter   | `surface`, `direction`, `policy_type`, `reason_code`, `area_code` | Booking gate and evaluator             | Measures no-pickup/no-dropoff/manual-review policy impact.                                |
| `service_area_geometry_mutations_total`  | counter   | `actor_role`, `action`, `geometry_type`, `status`                 | Admin service-area lifecycle API       | Supports governance publish/retire audit and rollback decisions.                          |

Minimum acceptance:

- Metrics distinguish provider outage from address ambiguity and policy denial.
- Metrics include enough labels to identify surface and decision source without leaking provider-specific payloads.
- Tests or evidence show metric increments on serviceable, no-pickup/not-serviceable, manual-review, provider-unavailable, and coordinate-less attempts.

## 3. Audit Event Contract

| Audit event                     | Trigger                                                                  | Required fields                                                                                                          | Gate usage                                                                             |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `geo.address.resolved`          | User/operator selects provider candidate or reverse-geocoded coordinate. | `surface`, `actorId`, `actorRole`, `provider`, `candidateId`, `lat`, `lng`, `confidence`, `provenance`, `accuracyMeters` | Gate A/E: prove booking coordinate provenance and degraded/manual fallback boundaries. |
| `geo.pin.confirmed`             | User/operator confirms, drags, or manually enters pickup/dropoff pin.    | `surface`, `actorId`, `stopRole`, `lat`, `lng`, `provenance`, `manualOverrideReason`, `serviceAreaPreviewDecision`       | Gate A/D/E: prove dispatchable orders were pinned or explicitly manual-review.         |
| `service_area.evaluated`        | Backend evaluates pickup/dropoff/service-area decision.                  | `surface`, `orderId`, `productCode`, `decision`, `reasonCode`, `areaCode`, `geometryVersion`, `evaluatedAt`              | Gate A/B/E: prove backend authority, not frontend-only validation.                     |
| `service_area.policy.published` | Admin publishes service-area boundary or stop policy.                    | `actorId`, `actorRole`, `policyId`, `version`, `geometryType`, `direction`, `effect`, `effectiveFrom`, `reason`          | Gate B: prove governance mutation and effective dating.                                |
| `service_area.policy.retired`   | Admin retires service-area boundary or stop policy.                      | `actorId`, `actorRole`, `policyId`, `version`, `retiredAt`, `reason`                                                     | Gate B/rollback: prove safe retire/rollback traceability.                              |
| `geo.manual_override.created`   | Operator uses manual coordinates or text-only degraded fallback.         | `surface`, `actorId`, `actorRole`, `reasonCode`, `providerState`, `lat`, `lng`, `manualReviewRequired`                   | Gate E: prove outage fallback is explicit and auditable.                               |

Minimum acceptance:

- Audit rows exist for both booking decisions and geometry mutations.
- Audit payloads include immutable geometry/version references where applicable.
- Manual override events cannot be recorded as normal dispatch approval unless policy allows it and the actor reason is explicit.

## 4. Alert / Runbook Contract

`MAP-OBS-001` should ship or update a runbook under `docs/03-runbooks/` and alert definitions under `infra/alerts/` or equivalent monitoring config.

Required alerts:

| Alert                               | Suggested trigger                                             | First response                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `MapProviderErrorRateHigh`          | Provider error/timeout rate above threshold for 5 minutes.    | Confirm provider outage, verify UI degraded banners, keep coordinate-less booking in manual-review/blocked policy. |
| `MapProviderLatencyHigh`            | p95 geocode/resolve latency above threshold for 10 minutes.   | Throttle non-critical search, monitor manual fallback, prepare degraded mode.                                      |
| `MapProviderQuotaUsageHigh`         | Provider quota usage >= 80%.                                  | Warn ops, reduce non-critical provider-backed traffic, confirm mock/provider-degraded fallback.                    |
| `MapProviderQuotaUsageCritical`     | Provider quota usage >= 95%.                                  | Disable non-critical provider-backed calls, route coordinate-less attempts to manual review or block.              |
| `CoordinateLessDispatchAttemptHigh` | Coordinate-less normal dispatch attempts exceed threshold.    | Investigate surface bypass, confirm backend gate, verify manual-review policy.                                     |
| `ServiceAreaPolicyBlockSpike`       | No-pickup/not-serviceable/manual-review decision rate spikes. | Check recent policy publish, geometry version, and affected area code.                                             |
| `ServiceAreaEvaluationUnavailable`  | Evaluator/provider unavailable decisions spike.               | Fail closed per policy, inspect evaluator health and PostGIS availability.                                         |

Runbook must distinguish:

- provider outage
- no geocode / address ambiguity
- policy denial
- PostGIS/evaluator failure
- manual override / operator fallback

## 5. Verification Expectations

`MAP-OBS-001` final handoff should include exact commands and evidence for:

```bash
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api lint
pnpm --filter @drts/api test
pnpm exec eslint infra/alerts docs/03-runbooks --max-warnings=0
```

Targeted tests should cover:

- geocode success metric increments
- geocode provider unavailable metric increments
- service-area serviceable/manual-review/not-serviceable decision metrics
- coordinate-less attempt metric and audit event
- policy publish/retire audit events
- manual override audit event
- alert config parses or lints

If the repo does not have a metric registry test harness yet, `MAP-OBS-001` must add one or document the exact substitute evidence.

## 6. Release Gate Mapping

| Release gate                        | Required observability evidence                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate A: Callcenter safe to dispatch | `geo.pin.confirmed`, `service_area.evaluated`, `coordinate_less_booking_attempts_total`, callcenter service-area decision metrics.                        |
| Gate B: Governance safe to publish  | `service_area.policy.published`, `service_area.policy.retired`, geometry mutation metrics, evaluator version/geometry reference in audit.                 |
| Gate C: Ops safe to operate         | Decision mix and policy block metrics visible to ops/support; stale/no-location operational signals remain distinct from policy denial.                   |
| Gate D: Driver safe to navigate     | Driver navigation mostly needs mobile/UAT evidence; observability should prove heartbeat/map failure remains distinguishable from dispatch policy denial. |
| Gate E: Degraded safe               | Provider error/latency/quota metrics, manual override audit, coordinate-less attempts, and provider outage runbook evidence.                              |

## 7. Worker Handoff Requirements

Implementation workers should leave these hooks/evidence for `MAP-OBS-001`:

| Worker task       | Required observability handoff                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `MAP-BE-002`      | Provider gateway should emit normalized provider result/error codes and timing boundaries.                               |
| `MAP-BE-005`      | Spatial audit snapshot should expose immutable order/evaluation fields for audit events.                                 |
| `MAP-BE-006`      | Service-area lifecycle API should emit publish/retire audit events and geometry mutation metrics.                        |
| `MAP-FE-CALL-001` | UI should expose provider outage/manual fallback/blocked reason states that map to backend audit reason codes.           |
| `MAP-FE-TEN-001`  | Tenant saved-address and booking flows should use the same reason codes as callcenter.                                   |
| `MAP-FE-CON-001`  | Concierge/partner copy should render customer-safe reason text without losing machine reason codes.                      |
| `MAP-QA-002`      | E2E should assert audit/metric side effects for at least serviceable, blocked, manual-review, and provider-outage flows. |
| `MAP-REL-001`     | Release evidence should reference this observability matrix before claiming Gate E pass.                                 |

## 8. Do-Not-Claim Rules

`MAP-OBS-001` must not claim production observability if:

- provider outage and address ambiguity are reported under the same metric/result code
- policy denial and provider failure are indistinguishable in UI/support evidence
- coordinate-less attempts are not counted
- geometry publish/retire lacks audit actor/version/effective date
- manual override lacks actor/reason/manual-review-required evidence
- final evidence relies only on screenshots without backend metric/audit assertions

## 9. Parent Handoff

Recommended note for `MAP-OBS-001` owner:

```text
Use support/sidecars/MAP-OBS-001/MAP-OBS-001-EVIDENCE-CONTRACT.md as the observability acceptance checklist. MAP-OBS-001 should not close until metrics, audit events, alerts/runbook, and tests prove provider outage, address ambiguity, policy denial, coordinate-less attempts, and geometry mutations are distinguishable and support release Gate E.
```
