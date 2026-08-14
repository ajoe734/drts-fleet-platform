# Google Maps Live Provider Validation

Date: 2026-07-12

## Runtime Policy

Map testing is intentionally dual-track:

- Local CI and deterministic browser E2E use `MAP_PROVIDER_MODE=mock`.
- Shared dev, staging, and production smoke paths use
  `MAP_PROVIDER_MODE=external`, `MAP_PROVIDER_NAME=google`, and
  `MAP_PROVIDER_BACKEND=google`.
- A mock-only result is valid for business-flow regression, but is not accepted
  as live-provider evidence.

The Google provider implements address search, place-ID resolution, reverse
geocoding, and Compute Routes. Callcenter and Ops use the Maps JavaScript API
behind a same-origin runtime config endpoint. Driver native builds use
`react-native-maps` with platform-restricted Android and iOS keys.

## Credential Separation

Each environment must provision separate keys and Secret Manager entries:

| Workload         | API restriction                      | Secret suffix                   |
| ---------------- | ------------------------------------ | ------------------------------- |
| Server geocoding | Geocoding API                        | `google-maps-geocoding-api-key` |
| Server routing   | Routes API                           | `google-maps-routes-api-key`    |
| Ops browser      | Maps JavaScript API + HTTP referrer  | `google-maps-browser-key`       |
| Driver Android   | Maps SDK for Android + package/SHA-1 | `google-maps-android-key`       |
| Driver iOS       | Maps SDK for iOS + bundle ID         | `google-maps-ios-key`           |

Never reuse browser or mobile keys on the API server. Never put server keys in
`NEXT_PUBLIC_*`, Expo public configuration, logs, test artifacts, or source
control.

## Dev Provisioning Receipt

Project: `drts-dev-ray-tw-20260530`

Secret prefix: `drts-dev`

The five secrets above have enabled version `1`. API keys are restricted to
their individual Google service. The browser key allows only the deployed dev
Ops Console origin. The Android dev key is restricted to
`com.cctechsupport.drts.driver` plus the local debug signing SHA-1; the iOS key
is restricted to bundle ID `com.cctechsupport.drts.driver`.

Android preview and production builds must add their EAS-managed signing SHA-1
before distribution. The debug signing restriction must not be treated as a
production mobile credential.

## Automated Verification

Run the live provider verifier with credentials sourced from Secret Manager:

```bash
GOOGLE_MAPS_GEOCODING_API_KEY=... \
GOOGLE_MAPS_ROUTES_API_KEY=... \
GOOGLE_MAPS_BROWSER_KEY=... \
MAP_PROVIDER_SMOKE_ORIGIN=https://ops.example.com \
node operations/verification/verify-google-map-provider-live.mjs
```

Expected result:

```text
LIVE_GEOCODING_SMOKE=PASS
LIVE_ROUTES_SMOKE=PASS
LIVE_BROWSER_MAPS_SMOKE=PASS
```

The dev, staging, and production deployment workflows run this verifier before
deploy whenever Google is enabled. A partial secret set fails the deployment.

After deployment, verify:

1. `GET /api/geo/health` reports `provider=google`, `mode=external`, and
   `failClosed=false`.
2. `GET /api/geo/search` returns a Google place ID and Taiwan coordinates.
3. `POST /api/geo/reverse` returns `geocodeProvider=google`.
4. `POST /api/geo/route` returns positive distance, duration, and encoded
   polyline.
5. `/api/map-provider-config` returns `enabled=true` only from an allowed Ops
   Console origin.
6. Callcenter and Ops browser maps report `data-google-map-status=ready`.
7. Driver native builds render the Google map and retain external-navigation
   fallback when the SDK or provider is unavailable.

## Failure Behavior

- Missing credentials or unsupported provider names fail closed.
- `429` and Google `5xx` responses map to retryable provider-unavailable errors.
- Invalid or denied requests map to non-retryable upstream rejection errors.
- Browser origin mismatch returns fallback config without disclosing the key.
- Existing pinned coordinates remain usable during provider outage; new
  coordinate-less formal bookings remain blocked.
