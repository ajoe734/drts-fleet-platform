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

Every required row in sections 3-7 is self-contained on purpose. Do not leave row-level `Query / command`, `Owner task(s)`, `Result`, or `Artifact` cells blank and expect sections 8 or 10 to carry the evidence indirectly. Shared logs are supplemental only.

## 2. Tested Branches And Environment

| Item               | Value                                 |
| ------------------ | ------------------------------------- |
| OBS branch/SHA     | `<branch>@<sha>`                      |
| API branch/SHA     | `<branch>@<sha>`                      |
| Surface branch/SHA | `<branch>@<sha>`                      |
| Test environment   | `<local/dev/stage>`                   |
| Metrics backend    | `<prometheus/otel/log-derived/other>` |
| Audit backend      | `<table/topic/log sink>`              |
| Alert config path  | `<infra/alerts/...>`                  |
| Runbook path       | `<docs/03-runbooks/...>`              |
| Mock provider mode | `<enabled/disabled>`                  |

## 3. Verifier Topic Marker Matrix

These rows provide exact MAP-REL-001 verifier topic markers. Keep the `OBS-MAP-*`
identifier and the matching metric/topic phrase on the same final-mark line so
both current and future readiness verifiers can detect the evidence.

Use `<VERDICT>` in table cells while this is a template. In the final evidence
copy, replace it with exactly `PASS`, `FAIL`, or `EXTERNAL-GATED`.

| Verifier topic                   | Final mark                                                                                                                 | Required proof                                                                                                              | Query / command                                                          | Owner task(s)                                                                                    | Result      | Artifact              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------- | --------------------- |
| `OBS-MAP-PROVIDER-OUTAGE`        | `OBS-MAP-PROVIDER-OUTAGE / provider outage / map_provider_errors_total: <VERDICT> - <summary>`                             | Provider outage is distinguishable from address ambiguity and policy denial in metrics, audit, alert, and runbook evidence. | `<provider outage metrics query plus alert/runbook command>`             | `MAP-BE-002`, `MAP-INFRA-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`                        | `<VERDICT>` | `<query/output path>` |
| `OBS-MAP-ADDRESS-AMBIGUITY`      | `OBS-MAP-ADDRESS-AMBIGUITY / address ambiguity / map_geocode_requests_total: <VERDICT> - <summary>`                        | No-match, low-confidence, and ambiguous-address cases are counted and routed to explicit user/operator handling.            | `<address ambiguity metrics query plus runbook command>`                 | `MAP-BE-002`, `MAP-UI-001`, `MAP-QA-002`, `MAP-OBS-001`                                          | `<VERDICT>` | `<query/output path>` |
| `OBS-MAP-POLICY-DENIAL`          | `OBS-MAP-POLICY-DENIAL / policy denial / service_area_policy_blocks_total: <VERDICT> - <summary>`                          | No-pickup, no-dropoff, and not-serviceable decisions are distinguishable from provider errors and address ambiguity.        | `<policy denial metrics query plus audit query plus runbook command>`    | `MAP-BE-004`, `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`                        | `<VERDICT>` | `<query/output path>` |
| `OBS-MAP-COORDINATELESS-ATTEMPT` | `OBS-MAP-COORDINATELESS-ATTEMPT / coordinate_less_booking_attempts_total: <VERDICT> - <summary>`                           | Coordinate-less booking attempts are counted by surface and cannot silently become normal dispatch.                         | `<coordinate-less attempt metrics query plus backend assertion command>` | `MAP-BE-005`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-QA-002`, `MAP-OBS-001` | `<VERDICT>` | `<query/output path>` |
| `OBS-MAP-MANUAL-OVERRIDE`        | `OBS-MAP-MANUAL-OVERRIDE / manual override / geo.manual_override.created: <VERDICT> - <summary>`                           | Manual coordinate fallback has actor, reason, provider state, and manual-review-required evidence.                          | `<manual override audit query plus runbook command>`                     | `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-005`, `MAP-OBS-001`               | `<VERDICT>` | `<query/output path>` |
| `OBS-MAP-GEOMETRY-MUTATION`      | `OBS-MAP-GEOMETRY-MUTATION / service_area_geometry_mutations_total / service_area.policy.published: <VERDICT> - <summary>` | Geometry publish, retire, and change attempts are metered and audited with actor/version/effective-date evidence.           | `<geometry mutation metrics query plus audit query>`                     | `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-OBS-001`, `MAP-REL-001`                                     | `<VERDICT>` | `<query/output path>` |

## 4. Metrics Evidence Matrix

| Metric                                   | Final mark                                                                                       | Required labels                                                   | Scenarios / gates                            | Query / command                                                                                    | Owner task(s)                                                                      | Result      | Artifact                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- | ------------------------------- |
| `map_geocode_requests_total`             | `map_geocode_requests_total: <VERDICT> - <summary>`                                              | `provider`, `surface`, `operation`, `result`                      | Gate A, Gate E; `E2E-MAP-001`, `E2E-MAP-005` | `<metrics query proving success/no-match/provider-error/timeout/manual-fallback buckets>`          | `MAP-BE-002`, `MAP-QA-002`, `MAP-OBS-001`                                          | `<VERDICT>` | `<query output path>`           |
| `map_geocode_latency_ms`                 | `map_geocode_latency_ms: <VERDICT> - <summary>`                                                  | `provider`, `surface`, `operation`, `result`                      | Gate E                                       | `<histogram query by provider/surface/operation/result>`                                           | `MAP-BE-002`, `MAP-OBS-001`                                                        | `<VERDICT>` | `<query output path>`           |
| `map_provider_errors_total`              | `map_provider_errors_total / OBS-MAP-PROVIDER-OUTAGE: <VERDICT> - <summary>`                     | `provider`, `error_code`, `retryable`, `surface`                  | Gate E; provider outage                      | `<metrics query distinguishing provider outage/address ambiguity/policy denial>`                   | `MAP-BE-002`, `MAP-QA-002`, `MAP-OBS-001`                                          | `<VERDICT>` | `<query output path>`           |
| `map_provider_quota_usage_percent`       | `map_provider_quota_usage_percent: <VERDICT> - <summary>`                                        | `provider`, `environment`                                         | Gate E rollout safety                        | `<quota gauge query or controlled stub output>`                                                    | `MAP-INFRA-001`, `MAP-OBS-001`, `MAP-REL-001`                                      | `<VERDICT>` | `<query or config output path>` |
| `coordinate_less_booking_attempts_total` | `coordinate_less_booking_attempts_total / OBS-MAP-COORDINATELESS-ATTEMPT: <VERDICT> - <summary>` | `surface`, `actor_role`, `policy_result`                          | Gate A, Gate E                               | `<metrics query showing coordinate-less attempts by surface/role/policy result>`                   | `MAP-BE-005`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-OBS-001` | `<VERDICT>` | `<query output path>`           |
| `service_area_evaluations_total`         | `service_area_evaluations_total: <VERDICT> - <summary>`                                          | `surface`, `product_code`, `decision`, `reason_code`              | Gate A, Gate C, Gate E                       | `<metrics query showing serviceable/manual-review/not-serviceable/provider-unavailable decisions>` | `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`, `MAP-OBS-001`                            | `<VERDICT>` | `<query output path>`           |
| `service_area_policy_blocks_total`       | `service_area_policy_blocks_total / OBS-MAP-POLICY-DENIAL: <VERDICT> - <summary>`                | `surface`, `direction`, `policy_type`, `reason_code`, `area_code` | Gate B, Gate C                               | `<metrics query grouped by direction/policy/reason/area>`                                          | `MAP-BE-004`, `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-OBS-001`                        | `<VERDICT>` | `<query output path>`           |
| `service_area_geometry_mutations_total`  | `service_area_geometry_mutations_total / OBS-MAP-GEOMETRY-MUTATION: <VERDICT> - <summary>`       | `actor_role`, `action`, `geometry_type`, `status`                 | Gate B                                       | `<metrics query proving publish/retire/failed geometry mutations by actor/action/type/status>`     | `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-OBS-001`                                      | `<VERDICT>` | `<query output path>`           |

## 5. Audit Event Evidence Matrix

| Audit event                     | Final mark                                                                         | Required fields                                                                                                          | Scenarios / gates      | Query / command                                                                             | Owner task(s)                                                                      | Result      | Artifact              |
| ------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- | --------------------- |
| `geo.address.resolved`          | `geo.address.resolved: <VERDICT> - <summary>`                                      | `surface`, `actorId`, `actorRole`, `provider`, `candidateId`, `lat`, `lng`, `confidence`, `provenance`, `accuracyMeters` | Gate A, Gate E         | `<audit query/export for provider/manual/reverse cases>`                                    | `MAP-BE-001`, `MAP-BE-002`, `MAP-UI-001`, `MAP-OBS-001`                            | `<VERDICT>` | `<audit export path>` |
| `geo.pin.confirmed`             | `geo.pin.confirmed: <VERDICT> - <summary>`                                         | `surface`, `actorId`, `stopRole`, `lat`, `lng`, `provenance`, `manualOverrideReason`, `serviceAreaPreviewDecision`       | Gate A, Gate D, Gate E | `<audit query/export for confirmed pickup/dropoff pins and manual override>`                | `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-MOB-DRV-001`, `MAP-OBS-001`                  | `<VERDICT>` | `<audit export path>` |
| `service_area.evaluated`        | `service_area.evaluated: <VERDICT> - <summary>`                                    | `surface`, `orderId`, `productCode`, `decision`, `reasonCode`, `areaCode`, `geometryVersion`, `evaluatedAt`              | Gate A, Gate B, Gate E | `<audit query/export proving evaluator authority and immutable geometry/version reference>` | `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`, `MAP-OBS-001`                            | `<VERDICT>` | `<audit export path>` |
| `service_area.policy.published` | `service_area.policy.published / OBS-MAP-GEOMETRY-MUTATION: <VERDICT> - <summary>` | `actorId`, `actorRole`, `policyId`, `version`, `geometryType`, `direction`, `effect`, `effectiveFrom`, `reason`          | Gate B                 | `<audit query/export for Platform Admin publish actor/version/effective date>`              | `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-OBS-001`                                      | `<VERDICT>` | `<audit export path>` |
| `service_area.policy.retired`   | `service_area.policy.retired: <VERDICT> - <summary>`                               | `actorId`, `actorRole`, `policyId`, `version`, `retiredAt`, `reason`                                                     | Gate B rollback        | `<audit query/export for retire/rollback traceability>`                                     | `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-OBS-001`, `MAP-REL-001`                       | `<VERDICT>` | `<audit export path>` |
| `geo.manual_override.created`   | `geo.manual_override.created / OBS-MAP-MANUAL-OVERRIDE: <VERDICT> - <summary>`     | `surface`, `actorId`, `actorRole`, `reasonCode`, `providerState`, `lat`, `lng`, `manualReviewRequired`                   | Gate E                 | `<audit query/export proving manual fallback cannot silently become normal dispatch>`       | `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-005`, `MAP-OBS-001` | `<VERDICT>` | `<audit export path>` |

## 6. Alert Evidence Matrix

| Alert                               | Final mark                                                 | Required proof                                                                                                   | Query / command                                                 | Owner task(s)                                            | Result      | Artifact                               |
| ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- | ----------- | -------------------------------------- |
| `MapProviderErrorRateHigh`          | `MapProviderErrorRateHigh: <VERDICT> - <summary>`          | Alert rule parses; threshold references `map_provider_errors_total`; controlled trigger or query example exists. | `<alert lint/parse command plus trigger query>`                 | `MAP-OBS-001`, `MAP-REL-001`                             | `<VERDICT>` | `<alert config plus lint output path>` |
| `MapProviderLatencyHigh`            | `MapProviderLatencyHigh: <VERDICT> - <summary>`            | Alert rule parses; p95 latency threshold references `map_geocode_latency_ms`.                                    | `<alert lint/parse command plus p95 query>`                     | `MAP-OBS-001`, `MAP-REL-001`                             | `<VERDICT>` | `<alert config plus lint output path>` |
| `MapProviderQuotaUsageHigh`         | `MapProviderQuotaUsageHigh: <VERDICT> - <summary>`         | Alert rule parses; warning threshold references `map_provider_quota_usage_percent >= 80`.                        | `<alert lint/parse command plus quota query>`                   | `MAP-OBS-001`, `MAP-REL-001`                             | `<VERDICT>` | `<alert config plus lint output path>` |
| `MapProviderQuotaUsageCritical`     | `MapProviderQuotaUsageCritical: <VERDICT> - <summary>`     | Alert rule parses; critical threshold references `map_provider_quota_usage_percent >= 95`.                       | `<alert lint/parse command plus critical quota query>`          | `MAP-OBS-001`, `MAP-REL-001`                             | `<VERDICT>` | `<alert config plus lint output path>` |
| `CoordinateLessDispatchAttemptHigh` | `CoordinateLessDispatchAttemptHigh: <VERDICT> - <summary>` | Alert rule parses; source metric is `coordinate_less_booking_attempts_total`.                                    | `<alert lint/parse command plus coordinate-less attempt query>` | `MAP-BE-005`, `MAP-OBS-001`, `MAP-REL-001`               | `<VERDICT>` | `<alert config plus lint output path>` |
| `ServiceAreaPolicyBlockSpike`       | `ServiceAreaPolicyBlockSpike: <VERDICT> - <summary>`       | Alert rule parses; distinguishes policy blocks by reason/area.                                                   | `<alert lint/parse command plus policy block query>`            | `MAP-BE-004`, `MAP-BE-006`, `MAP-OBS-001`, `MAP-REL-001` | `<VERDICT>` | `<alert config plus lint output path>` |
| `ServiceAreaEvaluationUnavailable`  | `ServiceAreaEvaluationUnavailable: <VERDICT> - <summary>`  | Alert rule parses; evaluator unavailable/provider unavailable is fail-closed or manually reviewed.               | `<alert lint/parse command plus evaluator unavailable query>`   | `MAP-BE-004`, `MAP-OBS-001`, `MAP-REL-001`               | `<VERDICT>` | `<alert config plus lint output path>` |

## 7. Runbook Distinction Matrix

| Topic             | Final mark                                                             | Required distinction                                                                 | Query / command                                                    | Owner task(s)                                                        | Result      | Artifact                      |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------- | ----------------------------- |
| provider outage   | `provider outage / OBS-MAP-PROVIDER-OUTAGE: <VERDICT> - <summary>`     | Runbook distinguishes provider outage from policy denial and address ambiguity.      | `<runbook lint command plus section link check>`                   | `MAP-INFRA-001`, `MAP-OBS-001`, `MAP-REL-001`                        | `<VERDICT>` | `<runbook path plus section>` |
| address ambiguity | `address ambiguity / OBS-MAP-ADDRESS-AMBIGUITY: <VERDICT> - <summary>` | Runbook explains no-match/low-confidence handling and manual review fallback.        | `<runbook lint command plus section link check>`                   | `MAP-BE-002`, `MAP-OBS-001`, `MAP-REL-001`                           | `<VERDICT>` | `<runbook path plus section>` |
| policy denial     | `policy denial / OBS-MAP-POLICY-DENIAL: <VERDICT> - <summary>`         | Runbook explains no-pickup/no-dropoff/not-serviceable/manual-review reason handling. | `<runbook lint command plus section link check>`                   | `MAP-BE-004`, `MAP-BE-006`, `MAP-OBS-001`, `MAP-REL-001`             | `<VERDICT>` | `<runbook path plus section>` |
| postgis           | `postgis: <VERDICT> - <summary>`                                       | Runbook explains PostGIS/evaluator failure and safe fail-closed behavior.            | `<runbook lint command plus PostGIS/evaluator section link check>` | `MAP-BE-006`, `MAP-OBS-001`, `MAP-REL-001`                           | `<VERDICT>` | `<runbook path plus section>` |
| manual override   | `manual override / OBS-MAP-MANUAL-OVERRIDE: <VERDICT> - <summary>`     | Runbook explains actor/reason/manual-review-required policy for manual fallback.     | `<runbook lint command plus manual override section link check>`   | `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-OBS-001` | `<VERDICT>` | `<runbook path plus section>` |

## 8. Command Log

Supplemental shared log only. Every required row above still needs its own `Query / command`, `Result`, and `Artifact` entry even when the same command appears here.

| Command                                                                  | Branch/SHA       | Result     | Output artifact                   |
| ------------------------------------------------------------------------ | ---------------- | ---------- | --------------------------------- |
| `pnpm --filter @drts/api typecheck`                                      | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm --filter @drts/api lint`                                           | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm --filter @drts/api test`                                           | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm --filter @drts/ui-web test`                                        | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm --filter @drts/ops-console-web typecheck`                          | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm --filter @drts/platform-admin-web typecheck`                       | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm --filter @drts/driver-app test`                                    | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts` | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |
| `pnpm test:e2e`                                                          | `<branch>@<sha>` | `<RESULT>` | `<path and gating rationale>`     |
| `pnpm exec eslint infra/alerts docs/03-runbooks --max-warnings=0`        | `<branch>@<sha>` | `<RESULT>` | `<path and substitute rationale>` |
| `node scripts/verify-map-geofence-production-readiness.mjs --json`       | `<branch>@<sha>` | `<RESULT>` | `<path>`                          |

If alert or runbook linting requires a substitute command, include the exact substitute and why it proves the same parser/lint coverage.

## 9. Scenario Side Effects

| Scenario / trigger                                | Metrics evidence                                                                                | Audit evidence                                                        | Alert/runbook evidence          | Result     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- | ---------- |
| Serviceable provider candidate and pinned booking | `map_geocode_requests_total`, `map_geocode_latency_ms`, `service_area_evaluations_total`        | `geo.address.resolved`, `geo.pin.confirmed`, `service_area.evaluated` | Not alerting                    | `<RESULT>` |
| No-pickup / not-serviceable policy denial         | `service_area_policy_blocks_total`, `service_area_evaluations_total`                            | `service_area.evaluated`                                              | policy denial runbook           | `<RESULT>` |
| Manual-review zone                                | `service_area_evaluations_total`, `coordinate_less_booking_attempts_total` where applicable     | `geo.manual_override.created`, `service_area.evaluated`               | manual override runbook         | `<RESULT>` |
| Provider unavailable / timeout                    | `map_provider_errors_total`, `map_geocode_latency_ms`, `coordinate_less_booking_attempts_total` | `geo.manual_override.created` if fallback used                        | provider outage alerts/runbook  | `<RESULT>` |
| Platform Admin publish/retire                     | `service_area_geometry_mutations_total`, `service_area_policy_blocks_total`                     | `service_area.policy.published`, `service_area.policy.retired`        | policy denial / postgis runbook | `<RESULT>` |

## 10. Artifact Index

Supplemental shared index only. Do not replace row-level artifact paths with a blank cell plus a generic artifact listing here.

| Artifact type                   | Path / link |
| ------------------------------- | ----------- |
| Metrics query output            | `<path>`    |
| Audit export                    | `<path>`    |
| Alert config                    | `<path>`    |
| Alert parser/lint output        | `<path>`    |
| Runbook                         | `<path>`    |
| API test output                 | `<path>`    |
| Release readiness verifier JSON | `<path>`    |

## 11. Blocking Failure Checklist

Mark any `yes` item as release-blocking:

| Failure condition                                                                | Yes/No     | Notes     |
| -------------------------------------------------------------------------------- | ---------- | --------- |
| Any required `OBS-MAP-*` topic mark is missing, renamed, or left unresolved.     | `<yes/no>` | `<notes>` |
| Required verifier command families are absent or renamed in section 8.           | `<yes/no>` | `<notes>` |
| Provider outage and address ambiguity share the same metric/result code.         | `<yes/no>` | `<notes>` |
| Policy denial and provider failure are indistinguishable in UI/support evidence. | `<yes/no>` | `<notes>` |
| Coordinate-less attempts are not counted.                                        | `<yes/no>` | `<notes>` |
| Geometry publish/retire lacks audit actor/version/effective date.                | `<yes/no>` | `<notes>` |
| Manual override lacks actor/reason/manual-review-required evidence.              | `<yes/no>` | `<notes>` |
| Alert definitions are documented but not parseable/linted.                       | `<yes/no>` | `<notes>` |
| Final evidence relies only on screenshots without metric/audit assertions.       | `<yes/no>` | `<notes>` |

## 12. Handoff To MAP-REL-001

`MAP-REL-001` should consume this file only after it is copied to `MAP-OBS-001-FINAL-EVIDENCE.md` and every required observability row contains real final evidence.

Safe handoff wording when complete:

```text
MAP-OBS-001 final evidence is ready for MAP-REL-001. Required metrics, audit events, alerts, and runbook distinctions each include PASS marks, branch/SHA, query or command evidence, and artifact links. Production readiness still requires MAP-QA-002 and MAP-REL-001 final evidence plus release verifier pass.
```

Unsafe wording:

```text
Observability is complete because this template or the evidence contract exists.
```
