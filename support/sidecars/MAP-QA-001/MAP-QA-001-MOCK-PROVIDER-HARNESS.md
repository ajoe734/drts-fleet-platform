# MAP-QA-001 Mock Provider Harness

Updated: `2026-07-03T16:29:41Z`

## Purpose

Provide a deterministic offline harness for map/geofence flows so CI and targeted
Playwright tests never call a live map provider.

Primary implementation files:

- `packages/shared-test-fixtures/src/map-geofence-fixtures.ts`
- `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts`
- `tests/e2e/map-geofence-harness.ts`
- `tests/e2e/map-geofence-harness.spec.ts`
- `playwright.map-geofence-harness.config.ts`

## Supported routes

The harness fulfills these routes without a dev server:

- `GET /api/geo/health`
- `GET /api/geo/search`
- `POST /api/geo/resolve`
- `POST /api/geo/reverse`
- `POST /api/service-area/evaluate`
- `GET /api/service-area/definitions`
- `GET /api/service-area/admin/geojson`
- `GET|POST /control-plane-proxy/api/*` equivalents for the same geo/service-area paths
- `GET /mock-map-tiles/{z}/{x}/{y}.svg`

## Fixture matrix

| Fixture key                  | Search query                  | Candidate ID                  | State                | Expected result |
| ---------------------------- | ----------------------------- | ----------------------------- | -------------------- | --------------- |
| `taipei-core`                | `台北市政府`                  | `mock-taipei-city-hall`       | serviceable          | `taxi_realtime` pickup stays inside `TAIPEI_CORE` |
| `taoyuan-airport`            | `桃園機場第一航廈`            | `mock-taoyuan-airport-t1`     | product-scoped       | `credit_card_airport_transfer` serviceable; `taxi_realtime` not serviceable |
| `taipei-station-no-pickup`   | `台北車站`                    | `mock-taipei-station`         | no-pickup hard block | `PICKUP_NOT_ALLOWED` |
| `manual-review-zone`         | `吳興街252號`                 | `mock-xinyi-hospital`         | manual review        | `STOP_REQUIRES_MANUAL_REVIEW` |
| `provider-unavailable`       | `__provider_unavailable__`    | n/a                           | provider outage      | `503 GEO_PROVIDER_UNAVAILABLE` |
| `no-geocode`                 | `火星基地`                    | n/a                           | empty search         | zero candidates; unknown resolve returns `404 GEO_CANDIDATE_NOT_FOUND` |

## Shared fixture helpers

`packages/shared-test-fixtures/src/map-geofence-fixtures.ts` exports:

- stable fixture keys and metadata
- deterministic geo health/search/resolve/reverse builders
- deterministic service-area seeds, evaluation builders, definitions, and admin GeoJSON builders
- `MapGeofenceFixtureError` for `503 GEO_PROVIDER_UNAVAILABLE`,
  `404 GEO_CANDIDATE_NOT_FOUND`, and common validation failures

## Playwright usage

```ts
import { installMockMapGeofenceHarness } from "./map-geofence-harness";

await installMockMapGeofenceHarness(page, {
  defaultFixtureKey: "taipei-core",
});
```

Route selection options:

- Use the canonical search query from the fixture matrix.
- Or add `fixture=<fixture-key>` to the request URL.
- Or send `fixtureKey` in JSON POST bodies for resolve/reverse/evaluate.
- Or set header `x-drts-map-fixture: <fixture-key>`.

`playwright.map-geofence-harness.config.ts` runs the harness spec without
starting a web server, so the suite remains offline end-to-end.
