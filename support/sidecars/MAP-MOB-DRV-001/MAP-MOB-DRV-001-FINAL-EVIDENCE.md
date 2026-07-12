# MAP-MOB-DRV-001 Final Evidence

**Task:** MAP-MOB-DRV-001 - Driver trip map and navigation handoff
**Branch:** `codex2/map-mob-drv-001`
**Commit:** `bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2`
**Branch@SHA:** `origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2`
**Worktree:** `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-mob-drv-001`
**Date:** 2026-07-03
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

## Gate D Closeout Addendum

`FLEETS-CLOSEOUT-005` consumes the accepted mixed-evidence packet in
`support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`.
That packet explicitly separates the two evidence origins below instead of
claiming the coordinate-handoff branch as the source of native map rendering:

- 2026-06-15 Android emulator UAT on `dev@66ee70f5b` for active-trip trip-map
  rendering,
  pickup/dropoff markers, and active-trip heartbeat coexistence
- 2026-07-03 committed unit/lint/typecheck evidence on
  `origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2`
  for coordinate-only navigation URLs, route-authority copy,
  current-location freshness, and offline/degraded fallback copy

## Mobile And UAT Limitations

- Android/iOS simulator UAT was not run in this repo-local pass.
- No native map SDK dependency is present in `apps/driver-app/package.json`; this slice intentionally does not fake native map rendering.
- Fresh 2026-07-08 simulator/device capture was not produced in this repo pass;
  Gate D closeout instead cites the accepted mixed-evidence packet above.
- This branch provides reviewable code and automated evidence for coordinate rendering, external navigation URL generation, route-authority safety copy, degraded fallback, and heartbeat coexistence.

## Suggested UAT Follow-Up

- Run Android or iOS simulator with an active trip fixture containing pickup/dropoff `lat/lng`.
- Capture the trip screen showing coordinate handoff mode, pickup/dropoff coordinates, route-authority copy, and GPS freshness.
- Tap Google/system navigation for pickup or dropoff and capture the launched URL/intent coordinates.
- Repeat a degraded case with missing coordinates or unavailable navigation app and capture the fallback copy.
