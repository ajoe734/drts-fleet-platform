# Map / Geofence Production Execution Packet

Last updated: 2026-06-30
Task ref: `MAP-PROD-000`
Architecture ref:
`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

## Decision summary

| Area | Decision |
| --- | --- |
| Production provider family | Google Maps Platform |
| Web map | Google Maps JavaScript API behind shared adapter |
| Native map | `react-native-maps` with Google provider configuration behind shared adapter |
| Geocode authority | Backend proxy to Google Geocoding API |
| ETA / route authority | Backend proxy to Google Routes API |
| CI / local provider | Deterministic mock provider |
| Coordinate-less booking | Not allowed for formal bookings; call center may recover only with `manual_geocode` pinned coordinates |

## Rollout feature flags

All map/geofence rollout flags start `disabled` by default and must be enabled
in sequence.

| Flag | Default | Purpose | Enable only when |
| --- | --- | --- | --- |
| `geoProviderEnabled` | `false` | Allows backend to call the production geocode/route provider | keys, quotas, mock parity, and audit logging are ready |
| `addressMapPickerEnabled` | `false` | Exposes interactive address pinning/picker on tenant or call-center surfaces | provider-backed search and degraded fallback UX are verified |
| `serviceAreaGateEnforced` | `false` | Converts service-area checks from advisory to blocking gate | polygons are seeded, reviewed, and on-call support is ready |
| `opsRealMapEnabled` | `false` | Enables live ops map rendering | internal pilot confirms acceptable latency and cost |
| `platformGeometryEditorEnabled` | `false` | Enables platform-admin/service-area geometry editing tools | polygon versioning, audit, and rollback are implemented |
| `driverTripMapEnabled` | `false` | Enables embedded driver trip map UI | native SDK integration, battery impact, and offline fallback are verified |

## Key and secret policy

- Keep server geocode and route credentials server-side only.
- If a browser map key is needed, restrict it by HTTP referrer and scope it to
  map rendering only.
- If native keys are needed, restrict Android keys by package name + SHA
  fingerprint and iOS keys by bundle identifier.
- Do not ship unrestricted geocode keys in browser or mobile bundles.
- Rotate keys on a scheduled cadence and immediately on suspected exposure.

## Quota and cost policy

- Track provider usage by environment separately.
- Set budget alerts at 50%, 80%, and 95% of the approved monthly budget.
- Enforce backend rate limiting so user typing does not translate into
  unbounded provider requests.
- Debounce autocomplete and require a minimum query length before live search.
- CI, automated tests, and preview environments must default to the mock
  provider and spend zero live-provider quota.

## Licensing and retention policy

- Treat Google terms as the strict boundary for production implementation.
- Do not combine Google-derived route or geocode content with a non-Google map.
- Cache Google-derived lat/lng or route content outside the core booking record
  for no more than 30 consecutive calendar days.
- Store only the normalized business record, not full raw provider payloads.
- Ensure required attribution is present on embedded map surfaces and on any
  geocode-only surface that uses provider content without an embedded map.

## Mock provider requirement

The mock provider is mandatory, not optional.

It must provide deterministic fixtures for:

- exact-match address geocode
- reverse geocode
- out-of-service-area rejection
- manual pin recovery path
- route ETA and degraded ETA path
- request-id / trace-id propagation

The mock provider is the default in:

- unit tests
- integration tests
- Playwright
- CI smoke paths
- local development unless a developer explicitly opts into live credentials

## Rollout order

1. Enable `geoProviderEnabled` in dev and staging only.
2. Validate request logging, quota dashboards, and mock/live parity.
3. Turn on `serviceAreaGateEnforced` for internal operator flows after polygon
   verification.
4. Enable `addressMapPickerEnabled` for internal call-center use before any
   tenant/self-service rollout.
5. Enable `opsRealMapEnabled` for dispatch/ops pilot users.
6. Enable `platformGeometryEditorEnabled` only after audit/versioning exists.
7. Enable `driverTripMapEnabled` last, after native battery/offline checks.

## Operational safety rules

- Provider degradation must fail closed for self-service booking creation.
- Provider degradation may fail soft for call-center only when manual pinning is
  available and the booking is marked `manual_geocode`.
- No live rollout is allowed until CI proves the same flows with the mock
  provider.
- No page or mobile screen may import a vendor SDK directly before the shared
  provider boundary exists.

## Verification checklist

1. `GET /admin/flags` returns the six map/geofence rollout flags.
2. No app manifest adds a production map SDK outside the chosen shared adapter
   implementation path.
3. Mock provider test coverage exists for geocode success, failure, degraded
   fallback, and service-area rejection.
4. Live provider calls are disabled in CI.
5. Formal booking creation still blocks when coordinates are absent.

## External references

- Google Geocoding usage and billing:
  `https://developers.google.com/maps/documentation/geocoding/usage-and-billing`
- Google Maps pricing:
  `https://developers.google.com/maps/billing-and-pricing/pricing`
- Google Maps Platform service specific terms:
  `https://cloud.google.com/maps-platform/terms/maps-service-terms`
