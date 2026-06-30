# MAP Production Readiness Verifier

**Task:** `MAP-REL-001-SIDECAR-READINESS-VERIFY`
**Parent release task:** `MAP-REL-001`
**Scope boundary:** this document explains the verifier command and its fail-closed checks. The verifier is **not production evidence by itself**.

## Purpose

`scripts/verify-map-geofence-production-readiness.mjs` is a fail-closed release checklist for the map/geofence production wave.

It exists to stop false claims such as:

- "production ready"
- "all gates pass"
- "E2E complete"
- "provider outage safe"

when `MAP-QA-002`, `MAP-OBS-001`, gate-owned tasks, or final evidence packets are still incomplete.

A passing verifier run is necessary but not sufficient. The real production evidence still lives in the human-reviewed `MAP-QA-002`, `MAP-OBS-001`, and `MAP-REL-001` final evidence packets plus machine-truth task status.

## Command

Run from the repo root:

```bash
node scripts/verify-map-geofence-production-readiness.mjs
```

Machine-readable output:

```bash
node scripts/verify-map-geofence-production-readiness.mjs --json
```

Override default paths when the final evidence packet lives elsewhere:

```bash
node scripts/verify-map-geofence-production-readiness.mjs \
  --qa-evidence support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md \
  --obs-evidence support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md \
  --rel-evidence support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md
```

The script exits `0` only when every configured check passes. Any missing task, missing final evidence file, or missing required marker returns exit `1`.

## Default Inputs

By default the verifier reads:

- `ai-status.json`
- `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-REL-001/MAP-PRODUCTION-READINESS-VERIFIER.md`

The QA final evidence path is taken from the `MAP-QA-002` sidecar plan. The OBS and REL final evidence file names are conventions for this verifier; if the release owner stores the packet elsewhere, pass the alternate path explicitly.

## What It Checks

The verifier reads machine truth from `ai-status.json` and fails closed when required release work is not `done`.

It checks:

- helper sidecar dependencies are `done`: `MAP-QA-002-SIDECAR-PLAN`, `MAP-REL-001-SIDECAR-GATE-AUDIT`, `MAP-GAP-COVERAGE-SIDECAR`
- foundation tasks are `done`: `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-BE-004`, `MAP-BE-006`, `MAP-FE-OPS-001`
- Gate A task set is `done`
- Gate B task set is `done`
- Gate C task set is `done`
- Gate D task set is `done`
- Gate E task set is `done`
- QA final evidence marks `E2E-MAP-001` through `E2E-MAP-007` as explicit `PASS`
  and includes required command families plus API/audit assertion `PASS` rows
- OBS final evidence marks required metrics, audit events, alerts, and runbook topics as explicit `PASS`
- REL final evidence marks Gate A-E as explicit `PASS` and references rollout, rollback, PostGIS/provider prerequisites, smoke outcome, `MAP-QA-002`, `MAP-OBS-001`, and `MAP-GAP-001` through `MAP-GAP-013`
- this support doc keeps the non-claim explicit: the verifier is not production evidence by itself

Placeholder rows such as `<PASS|FAIL|EXTERNAL-GATED>` do not satisfy the verifier. The identifier and a real `PASS` verdict must appear on the same line.

## Gate Mapping

The task-to-gate mapping is seeded from the MAP release sidecars and runbook snapshot for `2026-06-30`.

Current gate bundles checked by the script:

- Gate A: `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`, `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001`
- Gate B: `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`
- Gate C: `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-002`
- Gate D: `MAP-MOB-DRV-001`, `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-002`
- Gate E: `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-FE-CALL-001`

If the release sidecars change their canonical gate mapping, update this script together with the support doc.

## QA Evidence Commands And Assertions

The verifier expects final `MAP-QA-002` evidence to include the command families
below. A scenario `PASS` without command evidence is not enough:

- `pnpm --filter @drts/shared-test-fixtures typecheck`
- `pnpm --filter @drts/shared-test-fixtures test`
- `pnpm --filter @drts/shared-test-fixtures lint`
- `pnpm --filter @drts/api test`
- `pnpm --filter @drts/ui-web test`
- `pnpm --filter @drts/ops-console-web typecheck`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/driver-app test`
- `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts`
- `pnpm test:e2e`

Most command rows must carry `PASS` on the same line. The only command-level
exceptions are `pnpm --filter @drts/driver-app test`, which may be
`EXTERNAL-GATED` when backed by a mobile UAT packet, and `pnpm test:e2e`, which
may be `SUBSTITUTED` when the evidence names equivalent or stronger targeted
configs.

The final QA evidence must also include explicit `PASS` rows for these
assertion markers:

- pickup/dropoff coordinates
- coordinate provenance
- service-area decision snapshot
- policy/version IDs
- backend no-pickup/not-serviceable blocking
- policy publish/retire audit
- provider outage
- coordinate-less attempt
- manual override
- geometry mutation

## Observability Topics

The verifier expects the final `MAP-OBS-001` evidence to cover at least:

- metrics: `map_geocode_requests_total`, `map_geocode_latency_ms`, `map_provider_errors_total`, `map_provider_quota_usage_percent`, `coordinate_less_booking_attempts_total`, `service_area_evaluations_total`, `service_area_policy_blocks_total`, `service_area_geometry_mutations_total`
- audit events: `geo.address.resolved`, `geo.pin.confirmed`, `service_area.evaluated`, `service_area.policy.published`, `service_area.policy.retired`, `geo.manual_override.created`
- alerts: `MapProviderErrorRateHigh`, `MapProviderLatencyHigh`, `MapProviderQuotaUsageHigh`, `MapProviderQuotaUsageCritical`, `CoordinateLessDispatchAttemptHigh`, `ServiceAreaPolicyBlockSpike`, `ServiceAreaEvaluationUnavailable`
- runbook distinctions: provider outage, address ambiguity, policy denial, PostGIS/evaluator failure, manual override

If these markers are absent, the verifier blocks any production-ready claim even if the implementation tasks look complete.

## Non-Claim

Do not use this script alone as proof that the feature is ready for dev, stage, or production.

The script only proves that a configured checklist passed against the current worktree and `ai-status.json` snapshot. Production evidence still requires:

- reviewed `MAP-QA-002` final evidence
- reviewed `MAP-OBS-001` final evidence
- reviewed `MAP-REL-001` final evidence
- correct machine-truth task state
- any required environment or mobile UAT evidence outside the repo
