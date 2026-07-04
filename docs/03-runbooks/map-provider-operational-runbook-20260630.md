# Map Provider Operational Runbook

Date: 2026-06-30

Status: release-prerequisite companion for `MAP-INFRA-001` and `MAP-REL-001`

## Purpose

This runbook is the canonical operator-facing source for map/geocode provider
prerequisites. It supersedes older wording that referred only to
`MAP_PROVIDER_BACKEND=google`.

Current runtime authority is:

- `apps/api/src/modules/geo/geo-provider-config.service.ts`
- `scripts/check-map-provider-config.sh`
- `docs/04-api/map-geofence-openapi-delta-20260630.md`

## Runtime Model

`MAP_PROVIDER_MODE` controls the backend provider state:

| Mode       | Meaning                                    | Release expectation                                                                                                  |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `mock`     | Deterministic local/CI provider            | Allowed only outside staging/production unless `MAP_PROVIDER_ALLOW_MOCK_IN_PROD=true` break-glass is explicitly set. |
| `external` | Live provider-backed runtime               | Required for production release.                                                                                     |
| `disabled` | Provider-backed geo operations fail closed | Not production-ready for the map/geofence release gates.                                                             |

For this release wave, `MAP_PROVIDER_NAME=google` is the expected live-provider
family.

## Required Prerequisites For `external`

| Input                                 | Why it is required                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `MAP_PROVIDER_SERVER_KEY`             | Backend search/resolve/reverse calls cannot leave fail-closed mode without a server-side credential. |
| `MAP_PROVIDER_BROWSER_KEY`            | Web picker and map-rendering surfaces require a separate browser-scoped key.                         |
| `MAP_PROVIDER_ALLOWED_ORIGINS`        | Browser key restrictions must match the deployed web origins.                                        |
| `MAP_PROVIDER_MOBILE_BUNDLE_IDS`      | iOS/mobile restriction evidence for driver-app map and navigation surfaces.                          |
| `MAP_PROVIDER_MOBILE_PACKAGE_NAMES`   | Android/mobile restriction evidence for driver-app map and navigation surfaces.                      |
| `MAP_PROVIDER_DAILY_QUOTA`            | Release gate needs quota budgeting evidence.                                                         |
| `MAP_PROVIDER_MINUTE_QUOTA`           | Release gate needs burst-throttle evidence.                                                          |
| `MAP_PROVIDER_QUOTA_WARNING_PERCENT`  | Alert thresholds must be explicit before enablement.                                                 |
| `MAP_PROVIDER_QUOTA_CRITICAL_PERCENT` | Alert thresholds must be explicit before enablement.                                                 |

## Verification Commands

Run these from the repo root:

```bash
scripts/check-map-provider-config.sh
```

```bash
pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/operational-observability.service.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-geofence-alerts.test.ts
```

Health endpoints to inspect during staged enablement:

- `GET /api/geo/health`
- `GET /api/health`

## Rollout Order

Keep all map/geofence flags disabled by default, then enable in order:

1. `geoProviderEnabled`
2. `addressMapPickerEnabled`
3. `serviceAreaGateEnforced`
4. `opsRealMapEnabled`
5. `platformGeometryEditorEnabled`
6. `driverTripMapEnabled`

The disabled-by-default source of truth is
`apps/api/src/modules/feature-flags/feature-flags.service.ts`.

## Current Release Limitation

As of `2026-07-04`, the backend runtime still reports external mode as
fail-closed because the live provider adapter is not implemented:

- `apps/api/src/modules/geo/geo-provider-config.service.ts`

`MAP-REL-001` therefore must not claim production readiness even when repo-local
QA and observability evidence pass.

## Rollback

If staged or production enablement regresses:

1. Disable map/geofence feature flags in reverse order.
2. Re-dispatch the last known-good production tag if a deploy rollback is needed.
3. Keep coordinate-less booking flows fail-closed until provider health is green
   again.

Rollback references:

- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `docs/03-runbooks/production-rollback-drill-20260519.md`
- `docs/03-runbooks/map-geofence-observability-runbook.md`
