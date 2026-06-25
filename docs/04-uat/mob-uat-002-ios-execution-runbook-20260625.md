# MOB-UAT-002 — iOS Real-Device UAT Execution Runbook — 2026-06-25

Companion to [`mob-uat-002-ios-physical-device-evidence-pack-20260620.md`](./mob-uat-002-ios-physical-device-evidence-pack-20260620.md).
That pack records *why* the on-device run is externally gated; this runbook makes it
**immediately executable** the moment Apple hardware is available — exact commands,
per-scenario steps, and a fillable PASS/FAIL checklist. No step here can be performed in
the current fleet (no macOS/Xcode/iPhone); it is the hand-off package for a Mac operator.

## 0. Prerequisites (operator-supplied — the sole external dependency)

| Need | Why |
|---|---|
| macOS + Xcode 15+ + CocoaPods | build the iOS native project / signed archive |
| Apple Developer account (TestFlight) **or** a wired iPhone for local install | distribute to the device |
| A physical iPhone (iOS 16+) | exercise real GPS / background daemon / Low-Power Mode |
| A reachable API base URL | the app posts heartbeats to `/api/driver/location-heartbeats/batch` |

## 1. Build & install

```bash
# from repo root, on macOS
cd apps/driver-app
pnpm install
# Option A — EAS (TestFlight):
eas build --platform ios --profile preview
#   then distribute the build via TestFlight and install on the iPhone.
# Option B — local device build (wired iPhone, signing set in Xcode):
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npx expo run:ios --device
```

Set the driver identity + API endpoint the build points at (matching the Android pack):
`EXPO_PUBLIC_DRIVER_ID=drv-demo-001`, `EXPO_PUBLIC_API_BASE_URL=https://<api-host>`.
Seed that API instance with E2E-006/021 supply so the driver has tasks (the read model is
in-memory per API instance — see the on-device-emulator memory note for Android).

## 2. Scenario matrix — run each on the physical iPhone, fill the result

Maps 1:1 to the iOS-specific behaviours in §3 of the evidence pack. Mark `PASS` / `FAIL`
with an artifact reference (screenshot/recording/log) for each.

| ID | Scenario | Steps | Expected | Result | Artifact |
|----|----------|-------|----------|--------|----------|
| IOS-01 | Install + boot identity | install build, open app, sign in as `drv-demo-001` | app boots, identity bootstraps, no crash | ☐ | |
| IOS-02 | Permission gate | go online; respond to the foreground + "Always" location prompts | online blocked until "Always" granted; gate copy matches `driver-online-gate` | ☐ | |
| IOS-03 | Foreground tracking | stay online-available, move ~500m | heartbeats post on the interval; Ops `tracking-status` shows `fresh` | ☐ | |
| IOS-04 | Background blue indicator | background the app while on a trip | iOS background-use indicator shows; heartbeats continue | ☐ | |
| IOS-05 | Low Power Mode | enable Low Power Mode, keep moving | heartbeats continue (possibly throttled by OS); no crash, no duplicate storm | ☐ | |
| IOS-06 | 5-min offline + replay | enable Airplane Mode 5 min while moving, then restore network | queued events replay in order, deduped by `eventId`; server acks; no gaps beyond the offline window | ☐ | |
| IOS-07 | OS termination + relaunch | force memory pressure / let iOS terminate, relaunch | `driver-tracking-recovery` detects the gap, resumes tracking, identity+queue rehydrate | ☐ | |
| IOS-08 | User force-quit limitation | swipe-kill the app | document iOS's expected suspension of background updates after force-quit (degraded-by-design) | ☐ | |
| IOS-09 | Full task lifecycle | accept → enroute → arrived → on_trip → complete | states post; pending-completion replays if offline at completion; Ops sees the trip | ☐ | |

## 3. Server-side verification (run alongside, from any machine)

```bash
# freshness + sequence/dedup, against the same API the device posts to
curl -s "$API/api/driver/tracking-status?driverId=drv-demo-001" | jq '.data | {locationFreshness,lastSequenceNo,lastHeartbeatRecordedAt}'
# confirm batch idempotency / ordering with the automated companion:
tests/e2e/E2E-021-driver-heartbeat-replay.sh
```

## 4. Sign-off (fill on completion → upgrade pack `provisional → device-confirmed`)

- Device model / iOS version: ____
- Build (EAS id / local archive): ____
- All scenarios PASS: ☐  (attach artifacts into §6 of the evidence pack)
- Operator + date: ____

Until §4 is signed, `UAT-MOB-IOS-002` stays `provisional`: the implementation, contracts,
unit coverage, and this executable plan are complete; only the physical-device execution
remains, and it requires the §0 hardware this environment does not have.
