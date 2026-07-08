# MAP-MOB-DRV-001 Gate D UAT Packet

**Task:** `FLEETS-CLOSEOUT-005` - Driver native map/navigation UAT  
**Driver build:** `origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2`  
**Source closeout:** `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`  
**Packet date:** `2026-07-08`  
**Evidence mode:** `ACCEPTED-EXTERNAL-GATED`

## Verdict

Gate D closeout evidence is accepted as a mixed packet:

- Android emulator UAT captured on `2026-06-15` proves the trip screen renders
  in an active trip with a live route map, pickup/dropoff pins, and active-trip
  heartbeat permission coexistence.
- The committed `2026-07-03` driver build proves coordinate-only navigation
  URLs, route-authority copy, current-location freshness copy, and
  offline/degraded fallback copy through focused driver-app tests.

This packet does not claim a fresh `2026-07-08` simulator rerun or physical
device video. It is the accepted external-gated Gate D packet for release
closeout on this branch.

## Coverage Matrix

| Acceptance item                                                 | Result | Evidence                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trip map rendering                                              | PASS   | `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md` records `drts-driver://trip` on an active task and `screens/r3-trip-on-trip.png` with a rendered route map.                                                                                                                                                                               |
| pickup/dropoff pins                                             | PASS   | Round 3 explicitly records `green pickup + red dropoff on map` and `待確認上車點 / 待確認下車點`.                                                                                                                                                                                                                                                                   |
| current location / GPS freshness                                | PASS   | `apps/driver-app/components/driver-trip-map.tsx` adds driver GPS freshness UI; `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md` records this surface as part of the shipped trip map and fallback coverage.                                                                                                                                     |
| coordinate navigation launch uses coordinates, not address text | PASS   | `apps/driver-app/tests/unit/driver-navigation.test.ts` covers Apple Maps, Google Maps, and Android navigation URLs built from coordinates only with no address fallback; this is summarized in `MAP-MOB-DRV-001-FINAL-EVIDENCE.md`.                                                                                                                                 |
| route authority copy                                            | PASS   | `apps/driver-app/lib/driver-navigation.ts` and `apps/driver-app/tests/unit/driver-navigation.test.ts` cover DRTS-owned versus forwarded/source-platform-owned route authority copy; summarized in `MAP-MOB-DRV-001-FINAL-EVIDENCE.md`.                                                                                                                              |
| offline/degraded copy                                           | PASS   | `apps/driver-app/tests/unit/driver-navigation.test.ts` covers missing coordinates, no external app, native-map-unavailable copy, and source-platform-offline fallback; summarized in `MAP-MOB-DRV-001-FINAL-EVIDENCE.md`.                                                                                                                                           |
| heartbeat coexistence while map/navigation is active            | PASS   | `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md` records active-trip location permission flow observed from Round 3 and passing heartbeat tests; `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts` verifies `on_trip` heartbeat remains active after `openDriverNavigation(...)` and still queues a background heartbeat. |

## Evidence Anchors

| Evidence family             | Artifact                                                                                                                                                                     | Notes                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Emulator trip UAT           | `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`                                                                                                    | Active task advanced to `on_trip`; trip screen opened via deep link.                                       |
| Emulator trip screenshot    | `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`                                                                                                   | Visual capture referenced by Round 3.                                                                      |
| Emulator heartbeat UAT      | `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`                                                                                                | Records active-trip location permission and heartbeat coverage.                                            |
| Driver build closeout       | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`                                                                                                         | Frozen build branch@sha plus command results.                                                              |
| Driver map/navigation tests | `apps/driver-app/tests/unit/driver-navigation.test.ts`, `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts`, `apps/driver-app/tests/unit/driver-trip-map.test.ts` | Repo-backed assertions for coordinate URLs, heartbeat after navigation handoff, and trip-map surface copy. |

## Explicit Limits

- No new 2026-07-08 mobile screenshot, intent log, or screen recording was
  produced in this closeout task.
- The driver trip surface remains a coordinate handoff surface; this repo does
  not add a native map SDK and does not claim turn-by-turn rendering inside the
  app itself.
- This packet is sufficient for Gate D closeout on branch, not for claiming
  `dev_deployed` mobile distribution or physical-device publication.
