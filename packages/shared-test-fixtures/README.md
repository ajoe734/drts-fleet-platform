# @drts/shared-test-fixtures

Shared acceptance and scenario fixtures for the repo.

This package is meant to hold:

- stable fixture IDs
- acceptance scenario helpers
- contract test payload builders
- deterministic map/geofence provider fixtures for offline CI harnesses

Fixture names should stay aligned with the accepted Phase 1 scenarios and should not invent new business categories on their own.

## Map / Geofence Harness

`src/map-geofence-fixtures.ts` publishes:

- stable fixture keys for Taipei core, Taoyuan airport, Taipei Station no-pickup,
  manual-review, provider-unavailable, and no-geocode scenarios
- deterministic `/api/geo/*` response builders
- deterministic `/api/service-area/*` seed, evaluation, and GeoJSON builders

The companion Playwright harness lives under `tests/e2e/map-geofence-harness.ts`.
