# Map Production Closeout Fleets Task Board

**Board date:** `2026-07-08`  
**Closeout family:** `map-geofence-production-closeout-20260708`

## Gate Summary

| Gate   | Release question        | Status                           | Build / branch@sha                                                       | Artifact links                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------- | -------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate D | Driver safe to navigate | PASS (`ACCEPTED-EXTERNAL-GATED`) | `origin/codex2/map-mob-drv-001@bcc3ea1cfd73ac9a69b3bf2e62743fb1448117a2` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT-PACKET-20260708.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`, `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |

## Task Closeout Rows

| Task                  | Scope                            | Status | Acceptance closeout                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEETS-CLOSEOUT-005` | Driver native map/navigation UAT | PASS   | `E2E-MAP-007` now points to the accepted Gate D packet above; packet proves trip-map rendering, pickup/dropoff pins, current-location freshness copy, coordinate-only navigation URLs, route-authority copy, offline/degraded copy, and heartbeat coexistence while map/navigation is active. |

## Gate D Evidence Notes

- `navigation URL assertion uses coordinates not address text`:
  `apps/driver-app/tests/unit/driver-navigation.test.ts` verifies Apple Maps,
  Google Maps, and Android navigation URLs are built from pickup/dropoff
  coordinates only.
- `heartbeat evidence is captured while map/navigation is active`:
  `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`
  records the active-trip permission/heartbeat path, and
  `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts` verifies
  `openDriverNavigation(...)` does not stop the `on_trip` heartbeat.
- `trip map rendering and pins`:
  `docs/04-uat/driver-app-verification-20260615/round-03-trip-lifecycle.md`
  plus `docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png`
  capture the active trip map with pickup/dropoff markers.

## Remaining Parent-Level Limits

- This board closes the Gate D driver evidence row only. It does not resolve the
  separate `MAP-REL-001` parent blockers around provider runtime wiring or
  deploy-rail alignment on `MAP_PROVIDER_MODE`.
- Integration status for this evidence family remains branch-level until the
  parent release task performs its own verifier and publication closeout.
