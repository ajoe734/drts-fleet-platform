# MOB-UAT-002 — iOS Physical-Device UAT Evidence Pack — 2026-06-20

**Task:** `MOB-UAT-002`
**Owner:** `Claude`
**Reviewer:** `Claude2`
**Date:** `2026-06-20`
**Phase:** `phase1-delta-supply-eligibility-mobile-reporting-20260619`
**Depends on:** `MOB-APP-001`, `MOB-APP-002`, `MOB-APP-003`, `MOB-APP-004`, `MOB-QA-001`
**Authority:** SD `UAT-MOB-IOS-001` / SA `FR-MOB-011` / `MOB-UAT-002`
([`phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`](../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md) §`UAT-MOB-IOS-001`)
**Artifact status:** `provisional`
**Overall read:** `repo-backed static evidence complete; signed-build on-device (iOS) execution EXTERNALLY GATED — no PASS claimed`

> **Companion to MOB-UAT-001.** This pack is the iOS twin of
> [`mob-uat-001-android-physical-device-evidence-pack-20260620.md`](./mob-uat-001-android-physical-device-evidence-pack-20260620.md)
> and follows the same evidence convention. `UAT-MOB-IOS-001` is defined in the SD as
> "相同流程，另驗" (the Android flow, additionally verifying the iOS-specific behaviours
> in §3 below). The driver-app is a React Native (Expo prebuild) app whose telemetry
> logic lives in shared `apps/driver-app/lib/*.ts` modules exercised identically on both
> platforms; the iOS native project is `apps/driver-app/ios/DRTSDriverApp.xcodeproj`.

---

## 1. Executive Summary

This pack records the evidence state for the **iOS physical-device UAT**
(`UAT-MOB-IOS-001`) of the Phase-1-delta driver-app mobile-telemetry slice.

As of `2026-06-20`, there is **strong repo-backed static evidence** that every
behaviour under test is implemented, contract-shaped, and unit-covered — the iOS UAT
exercises the **same shared `lib/` modules** already validated for Android in
MOB-UAT-001, plus the iOS-specific surfaces in §3.

It does **NOT** contain a real iOS device run: no signed-build install logs, no
permission/Low-Power-Mode screenshots, no background-indicator screen recordings, no
device-model/iOS-version captures, and no human operator notes. **An iOS real-device
PASS is therefore NOT claimed and CANNOT be claimed from this environment**, because:

- This worker/environment has **no macOS, no Xcode, no CocoaPods, no iOS Simulator,
  and no physical iPhone**. A signed iOS build (`eas build --platform ios` / Xcode
  archive), TestFlight distribution, on-device permission + background-location +
  Low-Power-Mode exercise, and screen capture are **human / Mac-operator steps that
  cannot be performed or honestly fabricated here.**
- Unlike Android (which has a dedicated emulator VM, `drts-android-dev-vm`), there is
  **no iOS simulator path available** in this fleet.

**Honest disposition:** this canonical task is closed as a **`provisional` evidence
pack**. The repo/CI/contract readiness below is real and verifiable; the physical iOS
on-device sign-off is an **external dependency deferred to a human operator with Apple
hardware**, to be attached in §6 when performed. This is the same provisional bar that
MOB-UAT-001 was accepted under — it does not assert a device PASS.

## 2. Shared-behaviour static evidence (same as UAT-MOB-ANDROID-001)

All eight Android-flow behaviours map to landed Wave-3 commits and to shared driver-app
`lib/` modules with their own unit suites (run identically on the iOS runtime):

| Behaviour | Module(s) | Unit suite |
|---|---|---|
| install / boot identity | `lib/driver-identity-bootstrap.ts` | `tests/unit/driver-identity-bootstrap.test.ts` |
| permissions gate | `lib/driver-online-gate.ts`, `app/shift.tsx` | `tests/unit/driver-online-gate.test.ts` |
| online-available continuous tracking | `lib/driver-location-heartbeat.ts` | `tests/unit/driver-location-heartbeat.test.ts` |
| offline queue (5-min offline / replay) | `lib/driver-location-offline-queue.ts` | `tests/unit/driver-location-offline-queue.test.ts` |
| restart / killed-reopen recovery | `lib/driver-tracking-recovery.ts` | `tests/unit/driver-tracking-recovery.test.ts` |
| full task lifecycle | `app/trip.tsx`, `lib/pending-completion-replay.ts` | `tests/unit/pending-completion-replay.test.ts` |

Automated companion **`tests/e2e/E2E-021-driver-heartbeat-replay.sh` is present on
`origin/dev`** (restored by P1D-VERIFY) — this strengthens the API event-samples /
offline-queue-replay portion of the pack relative to MOB-UAT-001's original state.

## 3. iOS-specific behaviours under test (the "另驗" delta)

`UAT-MOB-IOS-001` additionally requires verifying, on a real iPhone:

| iOS-specific behaviour | Static-evidence note | Device-run status |
|---|---|---|
| Low Power Mode (timer/heartbeat throttling) | heartbeat scheduling is interval-driven in `lib/driver-location-heartbeat.ts`; OS-level Low-Power throttling is a runtime behaviour | **NOT executed — needs device** |
| iOS background-location blue indicator | background tracking driven by the same heartbeat module; iOS presents its own background-use indicator | **NOT executed — needs device** |
| OS termination (memory pressure) | recovery on relaunch in `lib/driver-tracking-recovery.ts` | **NOT executed — needs device** |
| user force-quit limitation | iOS suspends background updates after user force-quit (Apple platform limitation) — documents expected degraded behaviour | **NOT executed — needs device** |
| reopen recovery | identity + queue rehydrate on reopen (`driver-identity-bootstrap.ts`, `driver-location-offline-queue.ts`) | **NOT executed — needs device** |

Every row in the right column is honestly **unverified on hardware**. No iOS-specific
runtime behaviour can be asserted PASS from this environment.

## 4. Build / CI readiness (real, verifiable)

- Driver-app shared logic is unit-covered on `origin/dev` (suites in §2 + §3); the wave's
  `P1D-VERIFY` gate (typecheck/build/i18n-guard/E2E) is **green on dev**.
- iOS native project (`apps/driver-app/ios/DRTSDriverApp.xcodeproj`, `Podfile`) is present;
  no signed iOS build was produced here (no Mac/Xcode).

## 5. Findings

- **F-1 (open, external):** No iOS real-device execution evidence. Requires a macOS +
  Xcode operator to produce a signed/TestFlight build, run `UAT-MOB-IOS-001` on a
  physical iPhone, and attach §6 artifacts. **This is the sole residual gap.**

## 6. Device-run artifacts (TO BE ATTACHED by human operator)

_Empty — to be filled when the physical iOS UAT is performed:_
install log · permission prompts · Low-Power-Mode capture · background-indicator
recording · OS-termination + reopen recovery clip · force-quit behaviour note ·
device model / iOS version · operator sign-off.

## 7. Disposition

Closed as **`provisional`** under the orchestrator's external-held convention (same bar
as MOB-UAT-001). `UAT-MOB-IOS-001` device PASS is **explicitly NOT asserted**; it is
deferred to an out-of-band human operator with Apple hardware. Reopen `MOB-UAT-002` to
attach real §6 evidence and upgrade `provisional → device-confirmed`. Not part of the
`P1D-VERIFY` DoD; the Phase-1-delta wave verification is independently complete and green
on `origin/dev`.
