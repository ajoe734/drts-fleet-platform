# MAP-MOB-DRV-001-SIDECAR-REVIEW

**Support-only review packet + evidence summary for `MAP-MOB-DRV-001`**

- Sidecar task: `MAP-MOB-DRV-001-SIDECAR-REVIEW`
- Sidecar owner / reviewer: `Claude` / `Codex2`
- Sidecar branch / head: `claude/map-mob-drv-001-sidecar-review` @ `7c5d4d64f76266b2173f3ba6725e102a80d743ec` (base `origin/dev`)
- Parent task: `MAP-MOB-DRV-001` - Driver trip map and navigation
- Parent owner / reviewer: `Codex2` / `Claude2`
- Parent status at packet time: `review` (`last_update: 2026-07-01T07:56:16Z`)
- Parent branch / head: `codex/map-mob-drv-001-driver-navigation` @ `e5b4e925078f37b1e4d178d7bd820e10b8634657`
- Canonical trunk at packet time: `origin/dev` @ `f452f019f9d887850c907a28a60ce627b930049b` (parent slice **not** merged)
- Phase: `map-geofence-production-20260630`
- Scope guardrail: support-only artifact; **no** edits to canonical truth, parent implementation, tests, or governance state (`mutates_canonical: false`).

## 0. Why this packet exists

This is a `review_packet` sidecar (`helper_kind: review_packet`,
`auto_created_by: supervisor-underutilization`) created to give the assigned
reviewer a branch-visible, machine-truth-anchored review surface for the parent
driver navigation slice. It is a **distinct Claude-owned run**; a prior
`Codex`-owned run exists on `origin/codex/map-mob-drv-001-sidecar-review`
(sidecar owner/reviewer `Codex`/`Codex2`). This packet re-verifies every claim
against the current parent branch head and machine truth rather than trusting the
prior run. Parent absorption is decided by the parent owner (`Codex2`), not by
this sidecar.

## 1. Machine-Truth Snapshot

- `AI_NAME=Claude scripts/ai-status.sh show MAP-MOB-DRV-001` records the parent
  as `status: review`, owner `Codex2`, reviewer `Claude2`,
  `mutates_canonical: true`, `depends_on: [MAP-BE-003, MAP-BE-005]`. The parent
  is **not** `done`.
- The parent's recorded `next` describes a repo-local Gate D driver navigation
  slice: helper `apps/driver-app/lib/driver-navigation.ts`, trip screen
  integration in `apps/driver-app/app/trip.tsx`, new unit tests, and an evidence
  packet. It explicitly states this is **partial Gate D evidence only**: native
  map rendering, current-location marker, simulator/device navigation launch
  artifact, and heartbeat coexistence UAT remain required before
  `MAP-MOB-DRV-001` or `E2E-MAP-007` can be final PASS.
- Parent evidence packets committed on the parent branch:
  - `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
  - `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT.md`
- Production gates for this task: Gate A (callcenter), Gate B (governance),
  Gate C (ops), **Gate D (driver safe to navigate)**, Gate E (degraded safe).
  This task carries Gate D.

Review implication: the reviewable claim is **coordinate-handoff driver
navigation + degraded/route-authority safety with automated evidence**, not a
production native map. Gate D physical-device coverage stays external-gated.

## 2. Verified Code Anchors (parent branch `e5b4e925`)

All line numbers below were read from `codex/map-mob-drv-001-driver-navigation`
@ `e5b4e925` via `git show`. Files are **not** yet on `origin/dev`.

### 2.1 Navigation helper — `apps/driver-app/lib/driver-navigation.ts` (+495)

Pure, testable helper. Verified exported symbols and line anchors:

| Symbol | Line | Role |
| --- | --- | --- |
| `isValidDriverCoordinate` | `102` | Rejects null / non-finite / out-of-range lat(-90..90)/lng(-180..180) before any navigation attempt. |
| `readDriverNavigationCoordinate` | `173` | Defensive coordinate extraction from order/task records (multiple key shapes). |
| `formatDriverCoordinate` | `179` | Six-decimal coordinate label formatting. |
| `buildAppleMapsNavigationUrl` | `201` | Apple Maps deep link from lat/lng only. |
| `buildGoogleMapsWebNavigationUrl` | `209` | Google Maps web URL from lat/lng only. |
| `buildGoogleMapsAppNavigationUrl` | `217` | Google Maps app URL from lat/lng only. |
| `buildAndroidGoogleNavigationUrl` | `225` | Android `google.navigation` intent from lat/lng only. |
| `buildDriverNavigationCandidates` | `231` | Ordered provider candidates (apple/google/system) with fallback flags. |
| `getDriverRouteAuthorityCopy` | `392` | DRTS-owned vs forwarded/platform route-authority copy, `locked` flag, degraded hint. |
| `buildDriverTripNavigationModel` | `432` | Assembles per-target stops + authority + `hasNavigableRoute`. |
| `getDriverLocationFixState` | `455` | `fresh` / `stale` / `missing` GPS fix state (default stale threshold `60_000` ms). |

`DriverNavigationOpenResult` (line `54`) is a discriminated union of `opened` /
`missing_coordinates` / `unavailable`, so callers must handle the degraded
branches explicitly. The open path takes an injectable `DriverNavigationLinking`
(line `73`) with optional `canOpenURL` + required `openURL`, which is what makes
`Linking.openURL` mockable in tests without live navigation apps.

### 2.2 Trip map surface — `apps/driver-app/components/driver-trip-map.tsx` (+570)

Provider-neutral coordinate-handoff surface: pickup/dropoff coordinates,
address support copy, driver GPS freshness, route-authority banner,
source-platform offline state, missing-coordinate degraded fallback, and
external-navigation buttons.

### 2.3 Trip screen integration — `apps/driver-app/app/trip.tsx` (rewritten)

- Imports `DriverTripMap` + `DriverTripMapLocation` at line `35`.
- Renders `<DriverTripMap ... nativeMapAvailable={false} />` at line `1805`,
  passing `task`, `order`, `driverLocation`, and `sourcePlatformOffline`.
- `nativeMapAvailable={false}` is the honest self-declaration that this slice
  runs in **coordinate-handoff mode** and does not claim native map rendering —
  consistent with `apps/driver-app/package.json` declaring `expo-location` but
  **no** native map SDK dependency.

### 2.4 Tests (parent branch)

- `apps/driver-app/tests/unit/driver-navigation.test.ts` (+280) — pickup vs
  dropoff URL strings, coordinate-only (no address fallback), missing/invalid
  coordinate rejection, mocked `Linking.openURL`.
- `apps/driver-app/tests/unit/driver-trip-map.test.ts` (+244) — serviceable
  coordinates, missing coordinates, stale/missing driver fix, provider/native
  map unavailable, DRTS vs forwarded route-authority copy.
- `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts` (+58) — active
  trip heartbeat remains `on_trip` after navigation handoff and still queues a
  background heartbeat (heartbeat coexistence).

## 3. Acceptance → Evidence Matrix

Parent acceptance (from `ai-status.json`) mapped to state on branch
`e5b4e925`:

| # | Parent acceptance | Evidence on branch | State |
| --- | --- | --- | --- |
| 1 | Driver sees real pickup/dropoff points | `DriverTripMap` renders `order.pickup.lat/lng` + `order.dropoff.lat/lng` as six-decimal labels; unit tests cover both stops | **Proven (code + unit)** |
| 2 | External navigation opens correct coordinates | `build*NavigationUrl` + `buildDriverNavigationCandidates` build Apple/Google-app/Google-web/Android URLs from coordinates only; tests assert URL strings and no address fallback | **Proven for URL generation (unit)**; device launch external-gated |
| 3 | Heartbeat still works | `driver-location-heartbeat.test.ts` asserts `on_trip` heartbeat + background queue survive navigation handoff | **Proven (unit)**; on-device coexistence UAT external-gated |
| 4 | Driver-app checks + mobile UAT evidence recorded | typecheck / lint / test PASS recorded in FINAL-EVIDENCE; mobile simulator/device UAT **not** run | **Partial** — automated checks proven, mobile UAT open |

Additional safety properties covered by tests but beyond the literal acceptance
list: DRTS-owned vs forwarded route-authority copy (route-lock), and
degraded/offline fallback (missing coords, stale/missing GPS, no navigation app,
native map unavailable, source-platform offline).

## 4. Verification Evidence (from parent FINAL-EVIDENCE, branch `e5b4e925`)

The parent owner recorded, run in the parent's isolated worktree:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed (lockfile up to date) |
| `pnpm --filter @drts/driver-app typecheck` | passed |
| `pnpm --filter @drts/driver-app lint` | passed |
| `pnpm --filter @drts/driver-app test` | passed — **23 files / 112 tests** |
| `git diff --check` | passed |

This sidecar did **not** re-run the parent test suite (support-only, no canonical
mutation, and the parent slice is on a separate branch/worktree). The numbers
above are the parent owner's recorded evidence, not an independent re-run by this
sidecar. Reviewer may re-run against `codex/map-mob-drv-001-driver-navigation`
@ `e5b4e925` to reconfirm.

## 5. Proven vs External-Gated (Gate D)

**Proven on-branch (reviewable now):**
- Coordinate-based pickup/dropoff rendering with explicit missing-coordinate
  degraded state.
- Coordinate-only external navigation URL/intent generation for Apple / Google
  (app + web) / Android, unit-tested with mocked linking.
- Route-authority separation (DRTS-owned vs forwarded, route-lock) copy.
- Degraded/offline fallback copy and states, unit-tested.
- Heartbeat coexistence at the unit level.
- Honest non-claim of native map rendering (`nativeMapAvailable={false}`,
  no native map SDK dependency).

**Still external-gated (must not be claimed as Gate D PASS):**
- Native map surface with real provider-backed pins.
- Driver current-location marker on a real device/simulator.
- Android/iOS simulator or device screenshot/video of trip-map render.
- Device navigation-launch artifact showing exact coordinates handed off.
- On-device heartbeat coexistence during a live trip.

These map to the open rows in
`support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT.md` §4 and should be
carried by `MAP-QA-002` / `E2E-MAP-007` and referenced (not marked PASS) by
`MAP-REL-001`.

## 6. Reviewer Handoff (`Codex2`)

Recommended reviewer focus:
1. Confirm branch verifiability: parent files resolve on
   `codex/map-mob-drv-001-driver-navigation` @ `e5b4e925` and are absent from
   `origin/dev` @ `f452f019f` (integration still open).
2. Spot-check that navigation URL builders never fall back to address text when
   coordinates are present, and reject missing/invalid coordinates
   (`isValidDriverCoordinate` @ `driver-navigation.ts:102`).
3. Confirm `nativeMapAvailable={false}` (trip.tsx:1805) and the absence of a
   native map SDK dependency, so no Gate-D native-map claim is implied.
4. Confirm this packet makes **no** canonical mutation and stays inside
   `support/sidecars/MAP-MOB-DRV-001/`.

Reviewer decision path (per `AI_COLLABORATION_GUIDE.md` §6):
- Pass → `AI_NAME=Codex2 scripts/ai-status.sh approve MAP-MOB-DRV-001-SIDECAR-REVIEW "<conclusion>"`.
- Issues → `reopen` or `blocker` with cited file/section.

## 7. Sidecar Closeout Note

- This is a support-only sidecar (`task_class: sidecar`, `mutates_canonical:
  false`). On owner closeout the correct integration level is
  `INTEGRATION_STATUS=not_applicable` (support artifact, not a canonical
  implementation slice) — branch closeout is not integration closeout.
- No L1 canonical truth, contract truth, or runtime/registry/governance
  implementation was modified. Sole artifact:
  `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-SIDECAR-REVIEW.md`.
- Parent `MAP-MOB-DRV-001` remains owned by `Codex2` (reviewer `Claude2`) and is
  the authority for parent status transitions and absorption of this packet.
