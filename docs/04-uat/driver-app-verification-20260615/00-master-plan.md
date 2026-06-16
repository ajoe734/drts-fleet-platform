# Driver App — Comprehensive On-Device Verification (2026-06-15)

10-round, non-overlapping, deep verification of `apps/driver-app` (Expo Router +
RN 0.81, new-arch/Fabric) running on a **real Android emulator** (KVM-accelerated)
against a **live local API** (Nest, Postgres-backed, seeded S0001+S0002).

This complements the prior real-device report
(`driver-mobile-real-device-test-report-20260519.md`) with a fresh, emulator-based,
API-backed sweep that exercises **page display** AND **functional operation
results** (state changes proven via API + logcat), and archives every round.

## Environment Under Test

- VM: `drts-android-dev-vm` (project `drts-dev-ray-20260527`, us-central1-a,
  n2-standard-8 + nested-virt). Emulator AVD `drts-driver-api35`
  (Android 15 / google_apis / x86_64).
- App: debug build of `apps/driver-app` (package `com.cctechsupport.drts.driver`),
  JS served by Metro; driver identity `EXPO_PUBLIC_DRIVER_ID=drv-demo-001`
  (the S0002 demo driver with seeded multi-platform data); API base
  `http://10.0.2.2:3001` (emulator host-loopback).
- Backend: `apps/api` (built dist) on :3001, DB `drts_fleet_platform`
  (migrated + seeded), Redis :6379. Driver realm uses bootstrap headers
  `x-actor-type:driver_user / x-actor-id / x-realm:driver` (ApiClient prepends `/api`).
- Branch under test: `dev` @ 66ee70f5b (includes DRV-APP-BUILD-EARNINGS-20260615).

## Verification Method (per round)

1. **Plan** — enumerate the screen(s)/flows, the display elements to check, and
   the functional operations + expected results.
2. **Execute** — drive the app via adb (`am start` deep links, `input` taps),
   capture screenshots, and assert functional outcomes via API responses, DB,
   and `logcat ReactNativeJS`.
3. **Record** — plan + evidence + PASS/FAIL + defects in `round-NN-*.md`.
4. **Test cases** — where a flow is not covered by an existing automated test,
   add/extend an integration test (e.g. `tests/e2e/*`), pushed to GitHub.

## 10-Round Coverage Map (no repetition)

| Round | Surface                                                      | Focus                                                                                                                  |
| ----: | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
|     1 | Workspace Cockpit (`工作台` / `app/index.tsx`)               | readiness summary, next-best-action engine, identity badge, platform-binding empty state, refresh                      |
|     2 | Jobs Inbox (`任務` / `app/jobs.tsx`)                         | list render, 5 filter tabs, counts (總計/需動作/外部平台), owned vs forwarded cards, badges, empty states              |
|     3 | Trip Lifecycle (`行程` / `app/trip.tsx`)                     | owned task accept→depart→arrive_pickup→start→complete state machine, route display, status labels                      |
|     4 | Forwarded Order Flow                                         | broadcasted forwarded task accept/reject, routeLocked + sourcePlatform preservation, no owned dispatch_assignment      |
|     5 | Earnings (`收入` / `app/earnings.tsx`)                       | summary (net/gross/fee/subsidy), by-platform breakdown, period toggles 今日/本週/本月, statements graceful degradation |
|     6 | Platform Presence (`平台` / `app/platform-presence.tsx`)     | platform list, go online/offline, availability state, bindings                                                         |
|     7 | Completion Proof + Offline Replay                            | proof photo requirement, weak-network cached completion, idempotent (same request-id) replay, terminal errors          |
|     8 | Identity / Onboarding / Provisioning (`app/onboarding.tsx`)  | degraded "裝置尚未配置" state, dev override, token refresh, revocation→return to onboarding                            |
|     9 | Settings (`設定` / `app/settings.tsx`)                       | settings form fields, locale toggle, persistence                                                                       |
|    10 | Incident Reporting (`app/incident.tsx`) + Location Heartbeat | incident submission flow, active-trip heartbeat sync, background location                                              |

## Status

- [ ] R1 [ ] R2 [ ] R3 [ ] R4 [ ] R5 [ ] R6 [ ] R7 [ ] R8 [ ] R9 [ ] R10
