# MAP-OBS-001 Final Observability Evidence Template

**Sidecar task:** `MAP-OBS-001-SIDECAR-FINAL-EVIDENCE`

**Parent task:** `MAP-OBS-001` - Spatial observability and audit

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This template is not final observability evidence and must not be renamed to `MAP-OBS-001-FINAL-EVIDENCE.md` until every row contains real query output, command output, branch/SHA, artifact paths, and reviewer-acceptable assertions.

## 1. How To Use This Template

Copy this file to:

```text
support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md
```

Only replace `<PASS|FAIL|EXTERNAL-GATED>` with `PASS` when the exact metric, audit event, alert, or runbook topic has complete evidence. The production readiness verifier requires the identifier and a real `PASS` verdict on the same line. Placeholder text such as `<PASS|FAIL|EXTERNAL-GATED>` is intentionally not accepted.

Verifier-compatible final mark shape:

```text
<metric-or-topic-id>: <PASS|FAIL|EXTERNAL-GATED> - <short evidence summary>
```

If any required row remains `FAIL`, `EXTERNAL-GATED`, missing, or unsupported by backend evidence, `MAP-REL-001` must not claim production readiness.

## 2. Tested Branches And Environment

| Item | Value |
| --- | --- |
| OBS branch/SHA | `<branch>@<sha>` |
| API branch/SHA | `<branch>@<sha>` |
| Surface branch/SHA | `<branch>@<sha>` |
| Test environment | `<local/dev/stage>` |
| Metrics backend | `<prometheus/otel/log-derived/other>` |
| Audit backend | `<table/topic/log sink>` |
| Alert config path | `<infra/alerts/...>` |
| Runbook path | `<docs/03-runbooks/...>` |
| Mock provider mode | `<enabled/disabled>` |

## 3. Metrics Evidence Matrix

| Metric | Final mark | Required labels | Scenarios / gates | Required evidence |
| --- | --- | --- | --- | --- |
| `map_geocode_requests_total` | `map_geocode_requests_total: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `provider`, `surface`, `operation`, `result` | Gate A, Gate E; `E2E-MAP-001`, `E2E-MAP-005` | Query output proving success, no-match, provider error, timeout, and manual fallback are distinguishable. |
| `map_geocode_latency_ms` | `map_geocode_latency_ms: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `provider`, `surface`, `operation`, `result` | Gate E | Histogram/query output proving latency can be separated by provider/surface/operation/result. |
| `map_provider_errors_total` | `map_provider_errors_total: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `provider`, `error_code`, `retryable`, `surface` | Gate E; provider outage | Query output proving provider outage is distinct from address ambiguity and policy denial. |
| `map_provider_quota_usage_percent` | `map_provider_quota_usage_percent: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `provider`, `environment` | Gate E rollout safety | Gauge/query output or controlled stub proving warning/critical quota thresholds can be observed. |
| `coordinate_less_booking_attempts_total` | `coordinate_less_booking_attempts_total: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `actor_role`, `policy_result` | Gate A, Gate E | Query output proving coordinate-less normal-dispatch attempts increment and identify surface/role/policy result. |
| `service_area_evaluations_total` | `service_area_evaluations_total: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `product_code`, `decision`, `reason_code` | Gate A, Gate C, Gate E | Query output proving serviceable, manual-review, not-serviceable, provider-unavailable decisions are distinguishable. |
| `service_area_policy_blocks_total` | `service_area_policy_blocks_total: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `direction`, `policy_type`, `reason_code`, `area_code` | Gate B, Gate C | Query output proving no-pickup/no-dropoff/manual-review blocks are observable by policy/area. |
| `service_area_geometry_mutations_total` | `service_area_geometry_mutations_total: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `actor_role`, `action`, `geometry_type`, `status` | Gate B | Query output proving publish/retire/failed geometry mutations are counted with actor/action/type/status labels. |

## 4. Audit Event Evidence Matrix

| Audit event | Final mark | Required fields | Scenarios / gates | Required evidence |
| --- | --- | --- | --- | --- |
| `geo.address.resolved` | `geo.address.resolved: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `actorId`, `actorRole`, `provider`, `candidateId`, `lat`, `lng`, `confidence`, `provenance`, `accuracyMeters` | Gate A, Gate E | Audit row/export for provider candidate and manual/reverse cases. |
| `geo.pin.confirmed` | `geo.pin.confirmed: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `actorId`, `stopRole`, `lat`, `lng`, `provenance`, `manualOverrideReason`, `serviceAreaPreviewDecision` | Gate A, Gate D, Gate E | Audit row/export proving confirmed pickup/dropoff pins or explicit manual override. |
| `service_area.evaluated` | `service_area.evaluated: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `orderId`, `productCode`, `decision`, `reasonCode`, `areaCode`, `geometryVersion`, `evaluatedAt` | Gate A, Gate B, Gate E | Audit row/export proving backend evaluator authority and immutable geometry/version reference. |
| `service_area.policy.published` | `service_area.policy.published: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `actorId`, `actorRole`, `policyId`, `version`, `geometryType`, `direction`, `effect`, `effectiveFrom`, `reason` | Gate B | Audit row/export proving Platform Admin publish actor/version/effective date. |
| `service_area.policy.retired` | `service_area.policy.retired: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `actorId`, `actorRole`, `policyId`, `version`, `retiredAt`, `reason` | Gate B rollback | Audit row/export proving retire/rollback traceability. |
| `geo.manual_override.created` | `geo.manual_override.created: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `surface`, `actorId`, `actorRole`, `reasonCode`, `providerState`, `lat`, `lng`, `manualReviewRequired` | Gate E | Audit row/export proving manual fallback is explicit and cannot silently become normal dispatch. |

## 5. Alert Evidence Matrix

| Alert | Final mark | Required proof | First-response runbook link |
| --- | --- | --- | --- |
| `MapProviderErrorRateHigh` | `MapProviderErrorRateHigh: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; threshold references `map_provider_errors_total`; controlled trigger or query example exists. | `<path#section>` |
| `MapProviderLatencyHigh` | `MapProviderLatencyHigh: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; p95 latency threshold references `map_geocode_latency_ms`. | `<path#section>` |
| `MapProviderQuotaUsageHigh` | `MapProviderQuotaUsageHigh: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; warning threshold references `map_provider_quota_usage_percent >= 80`. | `<path#section>` |
| `MapProviderQuotaUsageCritical` | `MapProviderQuotaUsageCritical: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; critical threshold references `map_provider_quota_usage_percent >= 95`. | `<path#section>` |
| `CoordinateLessDispatchAttemptHigh` | `CoordinateLessDispatchAttemptHigh: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; source metric is `coordinate_less_booking_attempts_total`. | `<path#section>` |
| `ServiceAreaPolicyBlockSpike` | `ServiceAreaPolicyBlockSpike: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; distinguishes policy blocks by reason/area. | `<path#section>` |
| `ServiceAreaEvaluationUnavailable` | `ServiceAreaEvaluationUnavailable: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert rule parses; evaluator unavailable/provider unavailable is fail-closed or manually reviewed. | `<path#section>` |

## 6. Runbook Distinction Matrix

| Topic | Final mark | Required distinction | Evidence |
| --- | --- | --- | --- |
| provider outage | `provider outage: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Runbook distinguishes provider outage from policy denial and address ambiguity. | `<runbook path + section>` |
| address ambiguity | `address ambiguity: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Runbook explains no-match/low-confidence handling and manual review fallback. | `<runbook path + section>` |
| policy denial | `policy denial: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Runbook explains no-pickup/no-dropoff/not-serviceable/manual-review reason handling. | `<runbook path + section>` |
| postgis | `postgis: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Runbook explains PostGIS/evaluator failure and safe fail-closed behavior. | `<runbook path + section>` |
| manual override | `manual override: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Runbook explains actor/reason/manual-review-required policy for manual fallback. | `<runbook path + section>` |

## 7. Command Log

Record command output with branch/SHA and artifact paths.

| Command | Branch/SHA | Result | Output artifact |
| --- | --- | --- | --- |
| `pnpm --filter @drts/api typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api lint` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api test` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm exec eslint infra/alerts docs/03-runbooks --max-warnings=0` | `<branch>@<sha>` | `<PASS|FAIL|SUBSTITUTED>` | `<path and substitute rationale>` |
| `node scripts/verify-map-geofence-production-readiness.mjs --json` | `<branch>@<sha>` | `<PASS|FAIL expected until QA/REL complete>` | `<path>` |

If alert or runbook linting requires a substitute command, include the exact substitute and why it proves the same parser/lint coverage.

## 8. Scenario Side Effects

| Scenario / trigger | Metrics evidence | Audit evidence | Alert/runbook evidence | Result |
| --- | --- | --- | --- | --- |
| Serviceable provider candidate and pinned booking | `map_geocode_requests_total`, `map_geocode_latency_ms`, `service_area_evaluations_total` | `geo.address.resolved`, `geo.pin.confirmed`, `service_area.evaluated` | Not alerting | `<PASS|FAIL>` |
| No-pickup / not-serviceable policy denial | `service_area_policy_blocks_total`, `service_area_evaluations_total` | `service_area.evaluated` | policy denial runbook | `<PASS|FAIL>` |
| Manual-review zone | `service_area_evaluations_total`, `coordinate_less_booking_attempts_total` where applicable | `geo.manual_override.created`, `service_area.evaluated` | manual override runbook | `<PASS|FAIL>` |
| Provider unavailable / timeout | `map_provider_errors_total`, `map_geocode_latency_ms`, `coordinate_less_booking_attempts_total` | `geo.manual_override.created` if fallback used | provider outage alerts/runbook | `<PASS|FAIL>` |
| Platform Admin publish/retire | `service_area_geometry_mutations_total`, `service_area_policy_blocks_total` | `service_area.policy.published`, `service_area.policy.retired` | policy denial / postgis runbook | `<PASS|FAIL>` |

## 9. Artifact Index

| Artifact type | Path / link |
| --- | --- |
| Metrics query output | `<path>` |
| Audit export | `<path>` |
| Alert config | `<path>` |
| Alert parser/lint output | `<path>` |
| Runbook | `<path>` |
| API test output | `<path>` |
| Release readiness verifier JSON | `<path>` |

## 10. Blocking Failure Checklist

Mark any `yes` item as release-blocking:

| Failure condition | Yes/No | Notes |
| --- | --- | --- |
| Provider outage and address ambiguity share the same metric/result code. | `<yes/no>` | `<notes>` |
| Policy denial and provider failure are indistinguishable in UI/support evidence. | `<yes/no>` | `<notes>` |
| Coordinate-less attempts are not counted. | `<yes/no>` | `<notes>` |
| Geometry publish/retire lacks audit actor/version/effective date. | `<yes/no>` | `<notes>` |
| Manual override lacks actor/reason/manual-review-required evidence. | `<yes/no>` | `<notes>` |
| Alert definitions are documented but not parseable/linted. | `<yes/no>` | `<notes>` |
| Final evidence relies only on screenshots without metric/audit assertions. | `<yes/no>` | `<notes>` |

## 11. Handoff To MAP-REL-001

`MAP-REL-001` should consume this file only after it is copied to `MAP-OBS-001-FINAL-EVIDENCE.md` and every required observability row contains real final evidence.

Safe handoff wording when complete:

```text
MAP-OBS-001 final evidence is ready for MAP-REL-001. Required metrics, audit events, alerts, and runbook distinctions each include PASS marks, branch/SHA, query or command evidence, and artifact links. Production readiness still requires MAP-QA-002 and MAP-REL-001 final evidence plus release verifier pass.
```

Unsafe wording:

```text
Observability is complete because this template or the evidence contract exists.
```
