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

## Provider operational model

| Surface | Config / secret | Scope | Rule |
| --- | --- | --- | --- |
| Backend selector | `MAP_PROVIDER_BACKEND=mock|google` | API env / deploy var | Default to `mock`. Set `google` only when live server keys, quota budget, and audit logging are ready. |
| Server geocode key | `GOOGLE_MAPS_GEOCODING_API_KEY` via `${SECRET_PREFIX}-google-maps-geocoding-api-key` | API runtime only | Required whenever `MAP_PROVIDER_BACKEND=google` in staging / prod. Never expose to browser or mobile bundles. |
| Server routes key | `GOOGLE_MAPS_ROUTES_API_KEY` via `${SECRET_PREFIX}-google-maps-routes-api-key` | API runtime only | Required whenever `MAP_PROVIDER_BACKEND=google` in staging / prod. Never expose to browser or mobile bundles. |
| Public browser key | `GOOGLE_MAPS_BROWSER_KEY` | browser runtime only | Restrict by HTTP referrer. Scope it to map rendering / Places UI only; do not use it for backend geocode or routes. |
| Allowed origins | `MAP_PROVIDER_ALLOWED_ORIGINS` | deploy var / runtime metadata | Record the referrer allow-list for browser keys. Use `;` in deploy vars because Cloud Run `--set-env-vars` reserves `,` as a separator. |
| Web CSP readiness | `MAP_PROVIDER_WEB_CSP_READY=true` | deploy var / preflight check | Required before enabling browser surfaces. `script-src`, `connect-src`, and `img-src` must explicitly allow the Google Maps domains actually used by the chosen SDK path. |
| Android keying | `GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_ANDROID_PACKAGE`, `GOOGLE_MAPS_ANDROID_SHA1_CERTS` | mobile build/runtime config | Restrict Android keys by package name plus SHA fingerprint. Do not reuse browser or server keys. |
| iOS keying | `GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_IOS_BUNDLE_ID` | mobile build/runtime config | Restrict iOS keys by bundle identifier. Do not reuse browser or server keys. |
| Quota budget | `MAP_PROVIDER_MONTHLY_BUDGET_USD` | deploy var / runtime metadata | Record the environment budget in the API health payload so ops can compare spend against the approved monthly ceiling. |
| Quota alert thresholds | `MAP_PROVIDER_BUDGET_ALERT_PCT` | deploy var / runtime metadata | Defaults to `50;80;95`. Use `;` in deploy vars; runtime also accepts `,` for local convenience. |

### Environment mapping

- Local development: keep `MAP_PROVIDER_BACKEND=mock` unless a developer is
  explicitly validating live credentials.
- CI / smoke / Playwright: treat missing live keys as expected and stay on the
  deterministic mock provider.
- Staging: use `STAGING_MAP_PROVIDER_BACKEND=google` only after the two server
  secrets exist in Secret Manager and the rollout remains feature-flag gated.
- Production: use `PROD_MAP_PROVIDER_BACKEND=google` only after the same
  staging checks pass, quota alerts are provisioned, and the operator accepts
  the deploy.

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

### Mock-mode verification

Use the shared preflight before local or CI runs:

```bash
MAP_PROVIDER_BACKEND=mock scripts/check-map-provider-config.sh
CI=true MAP_PROVIDER_BACKEND=google scripts/check-map-provider-config.sh
```

The second command is expected to report that local/CI stays on the mock
provider unless both live server keys are injected.

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

## Fail-closed deployment and runtime policy

- `scripts/check-map-provider-config.sh` is the single preflight for local, CI,
  and deploy rails.
- In local / CI, `MAP_PROVIDER_BACKEND=google` without live server keys is not
  a hard failure; the script and `/health` payload both report mock fallback.
- In staging / prod, `MAP_PROVIDER_BACKEND=google` without
  `${SECRET_PREFIX}-google-maps-geocoding-api-key` and
  `${SECRET_PREFIX}-google-maps-routes-api-key` is a hard failure:
  `deploy-staging.yml` / `deploy-prod.yml` stop before rollout, and the API
  startup guard also throws if a miswired runtime somehow reaches Cloud Run.
- Browser and mobile public keys are not yet mounted by the current web/mobile
  deploy rails. Treat those surfaces as blocked until the corresponding adapter
  work lands and the keys are restricted plus documented.

## Observability and alerts

- `GET /health` and `GET /api/health` now expose a `mapProvider` block with:
  requested backend, effective backend, environment, fail-closed state, server
  key readiness, allowed origins, mobile-config presence, and quota thresholds.
- Alert specification:
  - `map_provider.quota.warning`: provider spend > 50% of
    `MAP_PROVIDER_MONTHLY_BUDGET_USD` for 15 minutes.
  - `map_provider.quota.high`: provider spend > 80% of budget for 10 minutes.
  - `map_provider.quota.exhaustion_risk`: provider spend > 95% of budget for 5
    minutes or sustained upstream `429` / billing errors.
  - `map_provider.health.down`: `/health` reports `mapProvider.status=down` or
    deploy preflight fails closed on missing live server keys.
- Expected response:
  - freeze any rollout flag that would increase live provider traffic
  - confirm whether traffic can remain on mock / manual-pin fallback
  - rotate or reprovision credentials before re-enabling `geoProviderEnabled`

## Verification checklist

1. `GET /admin/flags` returns the six map/geofence rollout flags.
2. No app manifest adds a production map SDK outside the chosen shared adapter
   implementation path.
3. Mock provider test coverage exists for geocode success, failure, degraded
   fallback, and service-area rejection.
4. Live provider calls are disabled in CI.
5. Formal booking creation still blocks when coordinates are absent.
6. `scripts/check-map-provider-config.sh` exits `0` for local/CI mock mode and
   exits non-zero when staging / prod request `google` without both server
   secrets.
7. `GET /health` exposes the `mapProvider` readiness block.

## External references

- Google Geocoding usage and billing:
  `https://developers.google.com/maps/documentation/geocoding/usage-and-billing`
- Google Maps pricing:
  `https://developers.google.com/maps/billing-and-pricing/pricing`
- Google Maps Platform service specific terms:
  `https://cloud.google.com/maps-platform/terms/maps-service-terms`
