# MAP-MOB-DRV-001 Gate D Driver Navigation UAT Packet

**Sidecar task:** `MAP-MOB-DRV-001-SIDECAR-UAT`  
**Parent task:** `MAP-MOB-DRV-001` - Driver trip map and navigation  
**Parent owner/reviewer:** `Codex2` / `Claude2`  
**Sidecar owner/reviewer:** `Codex` / `Codex2`  
**Scope boundary:** support artifact only. This packet defines implementation and evidence expectations; it does not implement the native map itself.

## 1. Gate D Verdict

Do **not** claim Gate D or driver map production-readiness until mobile evidence proves the actual driver trip screen can render governed coordinates and launch navigation with those coordinates.

Current state is a useful foundation, but not a production driver map:

- `apps/driver-app/package.json:36` includes `expo-location`, but no native map SDK dependency is declared.
- `apps/driver-app/lib/driver-location-heartbeat.ts:5` uses `expo-location` and background tasks for heartbeat.
- `apps/driver-app/app/trip.tsx:1829` renders a styled map-like card with decorative pickup/dropoff markers.
- `apps/driver-app/components/route-display.tsx:10` documents route intent/waypoints as a route summary, not a navigation surface.

Gate D requires a real trip-map/navigation surface, plus proof that it does not degrade heartbeat or route-authority safety.

## 2. Production Acceptance

`MAP-MOB-DRV-001` should not close unless all rows below have evidence.

| Capability              | Required behavior                                                                                                                               | Must not happen                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Native map surface      | Trip screen renders a real map adapter or provider-backed native map view with pickup/dropoff pins from assigned trip coordinates.              | Decorative/static map card is counted as production map evidence.                                          |
| Driver current location | Current driver location marker appears when permission and heartbeat state allow it; stale/no-fix state is visible.                             | Last known location is displayed as fresh without timestamp/state copy.                                    |
| Pickup/dropoff pins     | Pins use backend-provided coordinates, not only display addresses; missing coordinates create explicit degraded state.                          | Navigation falls back to address text when coordinates are available or required.                          |
| External navigation     | Driver can launch Apple Maps, Google Maps, or installed navigation using exact pickup/dropoff coordinates; URL builder is unit-tested.          | Deep link uses formatted address only, swaps pickup/dropoff, or silently drops lat/lng precision.          |
| Heartbeat coexistence   | Existing foreground/background heartbeat cadence continues while map screen is mounted and after navigation is opened.                          | Map SDK screen stops heartbeat, blocks offline queue flush, or changes permission semantics without tests. |
| Route authority         | DRTS-owned vs forwarded route copy remains visible; forwarded orders remain route-locked when required.                                         | Driver app implies local route edit authority for forwarded/platform-owned orders.                         |
| Offline/degraded        | If map provider, native map, GPS, or navigation app is unavailable, driver sees coordinates/address, call-ops fallback, and safe degraded copy. | Map failure hides pickup/dropoff, leaves blank screen, or allows unsafe route assumptions.                 |

## 3. Implementation Contract For The Driver Fleet

Recommended slices:

| Slice                   | Expected artifacts                                                                                                                   | Evidence requirement                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `DriverTripMap` adapter | `apps/driver-app/components/driver-trip-map.tsx` or equivalent provider-neutral component.                                           | Unit/snapshot tests for serviceable coordinates, missing coordinates, stale driver fix, and provider unavailable.        |
| Navigation URL builder  | `apps/driver-app/lib/driver-navigation.ts` or equivalent pure helper.                                                                | Unit tests for iOS/Android URL generation, pickup vs dropoff target, coordinate precision, and unavailable app fallback. |
| Trip screen integration | `apps/driver-app/app/trip.tsx` renders real map component instead of decorative card when enabled.                                   | Simulator/UAT screenshot or video with pickup/dropoff pins and visible route-authority copy.                             |
| Heartbeat guard         | Existing `driver-location-heartbeat` tests or new integration tests prove map mount/navigation launch does not stop heartbeat state. | Test output plus UAT note showing active trip heartbeat remains active after map screen and navigation launch.           |
| Degraded fallback       | Explicit UI for missing coords, map SDK unavailable, permission denied, offline queue, and no navigation app.                        | Unit tests and screenshots for at least missing coordinates and provider/native map unavailable.                         |

Implementation rules:

- The driver app is **not** the service-area authority. It consumes coordinates and policy/snapshot results from backend/API-client data.
- Navigation handoff must prefer coordinates over address text. Address text may be displayed as supporting copy, not the routing authority.
- CI/mobile tests must not require live map provider quota. Use mocked native map adapter, mocked `Linking.openURL`, and deterministic trip fixtures.
- Any provider-specific SDK should be isolated behind a small adapter so Android/iOS differences and fallback rendering can be tested without the live SDK.

## 4. Gate D Evidence Matrix

`MAP-QA-002` should map `E2E-MAP-007` to this evidence.

| Evidence item                    | Required proof                                                                                                                  | Owner                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Unit: navigation URL builder     | `pickup` target and `dropoff` target open URL with exact lat/lng; rejects missing/invalid coordinates; mocks `Linking.openURL`. | `MAP-MOB-DRV-001`                |
| Unit: map degraded states        | Component shows missing-coordinate, permission-denied, no-current-location, and map-unavailable states.                         | `MAP-MOB-DRV-001`                |
| Unit: heartbeat coexistence      | Existing or new heartbeat tests show mounted trip map does not change active task heartbeat transport/cadence.                  | `MAP-MOB-DRV-001`                |
| Simulator: trip map render       | Android or iOS simulator screenshot/video shows real map area, pickup pin, dropoff pin, and route-authority banner.             | `MAP-MOB-DRV-001`                |
| Simulator/UAT: navigation launch | Evidence shows external navigation launched for pickup and/or dropoff with correct coordinates.                                 | `MAP-MOB-DRV-001` / `MAP-QA-002` |
| UAT: offline/degraded            | Evidence shows usable fallback when map/provider/navigation is unavailable.                                                     | `MAP-MOB-DRV-001` / `MAP-QA-002` |
| Release: Gate D mapping          | `MAP-REL-001` references this evidence and marks any missing physical-device coverage as external-gated, not pass.              | `MAP-REL-001`                    |

## 5. Minimum Commands

Parent task handoff should include the exact branch/SHA and at least:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test
pnpm --filter @drts/driver-app lint
```

If native map dependencies require prebuild validation, include the appropriate checked command for the target platform:

```bash
pnpm --filter @drts/driver-app prebuild
pnpm --filter @drts/driver-app android
pnpm --filter @drts/driver-app ios
```

Do not claim Android/iOS readiness unless the command or UAT evidence actually covers that platform. If only one platform is tested, mark the other as `external-gated`.

## 6. Mobile UAT Packet Template

`MAP-MOB-DRV-001` should attach a UAT note under `support/sidecars/MAP-MOB-DRV-001/` or link equivalent artifacts with:

| Field             | Required content                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Build             | Branch, SHA, Expo/EAS profile, platform, simulator/device model, OS version.                  |
| Fixture           | Driver ID/task ID/order ID or mocked fixture key with pickup/dropoff coordinates.             |
| Map render        | Screenshot/video path showing map, pickup pin, dropoff pin, and current/stale location state. |
| Navigation launch | Screenshot/video or log showing external navigation URL/intent with exact coordinates.        |
| Heartbeat         | Test output or log showing heartbeat remains active after map mount and navigation launch.    |
| Degraded fallback | Screenshot/video for missing coordinates or map unavailable fallback.                         |
| Known gaps        | Any platform not tested must be marked `external-gated`, not silently passed.                 |

## 7. Do-Not-Claim Rules

`MAP-MOB-DRV-001`, `MAP-QA-002`, and `MAP-REL-001` must not claim:

- "Gate D pass"
- "Driver navigation production-ready"
- "Android and iOS validated"
- "Heartbeat unaffected"
- "External navigation opens correct coordinates"

unless the evidence packet contains command output and simulator/device evidence proving those exact claims.

Safe interim wording:

- "Driver map/navigation work is scoped and assigned."
- "Navigation URL generation has unit evidence."
- "Gate D remains pending mobile simulator/device UAT."

## 8. Parent And QA Handoff

Recommended note for `MAP-MOB-DRV-001`:

```text
Use support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT.md as the Gate D implementation and evidence checklist. Production readiness requires real map rendering, coordinate-based navigation handoff, heartbeat coexistence, route-authority copy, degraded fallback, driver-app checks, and Android/iOS simulator or UAT evidence.
```

Recommended note for `MAP-QA-002`:

```text
Use MAP-MOB-DRV-001-SIDECAR-UAT for E2E-MAP-007. If repo-local automation cannot launch the native driver app, collect simulator/device UAT evidence and mark any missing platform as external-gated rather than pass.
```
