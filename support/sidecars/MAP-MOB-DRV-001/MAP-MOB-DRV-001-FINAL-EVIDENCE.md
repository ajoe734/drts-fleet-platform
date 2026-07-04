# MAP-MOB-DRV-001 Final Evidence

**Task:** MAP-MOB-DRV-001 - Driver trip map and navigation handoff
**Branch:** `codex2/map-mob-drv-001`
**Implementation Baseline Commit:** `a2c253d0fb0f55686946637504067b8cc5c5ddf0`
**Implementation Baseline Branch@SHA:** `origin/codex2/map-mob-drv-001@a2c253d0fb0f55686946637504067b8cc5c5ddf0`
**Worktree:** `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-mob-drv-001`
**Date:** 2026-07-04
**Reviewer:** Claude2

## Implementation Summary

- Replaced the decorative trip map block in `apps/driver-app/app/trip.tsx` with a production-safe coordinate handoff surface.
- Added `apps/driver-app/lib/driver-navigation.ts` for defensive pickup/dropoff coordinate extraction, coordinate formatting, route-authority copy, Apple/Google/system navigation URL builders, and navigation fallback results.
- Added `apps/driver-app/components/driver-trip-map.tsx` to show backend pickup/dropoff coordinates, address support copy, driver GPS freshness, route authority, source-platform offline state, missing-coordinate fallback, and external navigation buttons.
- Kept native map claims explicit: this repo slice does not add a native map SDK dependency, so the screen runs in coordinate handoff mode and does not claim native map rendering.
- Preserved heartbeat ownership: trip screen only subscribes to existing heartbeat updates for UI freshness and does not alter heartbeat cadence, permissions, background task setup, or offline queue behavior.

## Acceptance Coverage

| Acceptance item                                   | Evidence                                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver sees real pickup/dropoff points            | `DriverTripMap` renders `order.pickup.lat/lng` and `order.dropoff.lat/lng` with six-decimal coordinate labels; unit tests cover both stops.                                        |
| External navigation opens correct coordinates     | `openDriverNavigation` builds Apple Maps, Google Maps app/web, and Android navigation URLs from coordinates only; tests assert pickup/dropoff URL strings and no address fallback. |
| Heartbeat still works                             | `driver-location-heartbeat.test.ts` now verifies active trip heartbeat remains `on_trip` after navigation handoff and still queues a background heartbeat.                         |
| Route authority copy separates DRTS vs forwarded  | `getDriverRouteAuthorityCopy` and UI tests cover DRTS-owned copy vs forwarded/source-platform locked copy, including missing platform route polyline.                              |
| Degraded/offline fallback documented and testable | Unit tests cover missing coordinates, stale/missing driver GPS, no external navigation app, native map unavailable copy, and source-platform offline fallback.                     |
| Driver-app checks recorded                        | See command results below.                                                                                                                                                         |

## Commands And Results

```bash
pnpm --filter @drts/driver-app typecheck
```

Result: passed.

```bash
pnpm --filter @drts/driver-app lint
```

Result: passed.

```bash
pnpm --filter @drts/driver-app test -- --runInBand
```

Result: passed. `23` test files passed, `112` tests passed.

```bash
git diff --check
```

Result: passed.

## Mobile UAT Fallback Record

- Acceptance allows Android/iOS UAT evidence **or documented simulator fallback**. This pass records the fallback path because the assigned worker environment is `Linux x64`, not a macOS/Xcode or Android-emulator host.
- `which xcrun` returned no path, so iOS Simulator tooling is unavailable in this environment.
- `which adb` returned no path, so Android device/emulator tooling is unavailable in this environment.
- No native map SDK dependency is present in `apps/driver-app/package.json`; this slice intentionally ships coordinate handoff mode and does not claim repo-local native map rendering.
- Repo-local acceptance is therefore covered by automated verification plus this documented simulator fallback, not by a false claim of device/simulator execution.

## Remaining Release Closeout Gap

- Gate D production readiness still needs a later Android/iOS simulator or device capture proving actual app launch, trip-screen coordinate rendering, and platform navigation handoff on real mobile tooling.

## Recommended UAT Capture When Mobile Tooling Is Available

- Run Android or iOS simulator with an active trip fixture containing pickup/dropoff `lat/lng`.
- Capture the trip screen showing coordinate handoff mode, pickup/dropoff coordinates, route-authority copy, and GPS freshness.
- Tap Google/system navigation for pickup or dropoff and capture the launched URL/intent coordinates.
- Repeat a degraded case with missing coordinates or unavailable navigation app and capture the fallback copy.
