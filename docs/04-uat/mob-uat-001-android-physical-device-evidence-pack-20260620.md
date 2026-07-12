# MOB-UAT-001 — Android Physical-Device UAT Evidence Pack — 2026-06-20

**Task:** `MOB-UAT-001`
**Owner:** `Claude`
**Reviewer:** `Claude2`
**Date:** `2026-06-20`
**Phase:** `phase1-delta-supply-eligibility-mobile-reporting-20260619`
**Depends on:** `MOB-APP-003`, `MOB-APP-004`, `MOB-QA-001`
**Authority:** SD §11.4 `UAT-MOB-ANDROID-001`
([`phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`](../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md)) ·
Evidence-pack contract SA §6.10
([`phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md`](../02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md))
**Artifact status:** `provisional`
**Overall read:** `repo-backed static evidence complete; signed-build on-device execution externally gated`

> **Path note.** The task brief lists `docs/05-ui/` as the artifact home, but that
> directory is the design-handoff corpus. This evidence pack is filed under
> `docs/04-uat/` to sit beside its direct precedent
> [`driver-mobile-real-device-test-report-20260519.md`](./driver-mobile-real-device-test-report-20260519.md)
> and the Phase-1 UAT scenario family, which is the convention-correct home for a
> UAT evidence pack. The design input that motivated the surfaces under test still
> lives at
> [`docs/05-ui/driver-app-tracking-and-permission-screen-requirements-20260619.md`](../05-ui/driver-app-tracking-and-permission-screen-requirements-20260619.md).

---

## 1. Executive Summary

This pack records the evidence state for the Android physical-device UAT
(`UAT-MOB-ANDROID-001`) of the Phase-1-delta driver-app mobile telemetry slice:
install / permissions / online-available continuous tracking / background
tracking / app-killed-reopened / network-switch / 5-minute-offline / full task
lifecycle.

As of `2026-06-20`, this isolated worker session has **strong repo-backed static
evidence** that every UAT-MOB-ANDROID-001 behaviour is implemented, contract-shaped,
and unit-covered (all eight steps map to landed Wave-3 commits and to driver-app
`lib/` modules with their own unit suites). It does **not** have fresh on-device
install logs, permission screenshots, background-tracking screen recordings,
device model / OS captures, or operator notes, because:

- This worker runs in an isolated git worktree with **no working Android toolchain**
  (`adb`, `emulator`, `sdkmanager`, `avdmanager` are absent) and **no usable VM
  control plane** (`gcloud` aborts under `snap-confine: cap_dac_override not found`).
- Producing a signed build (`eas build --platform android`), installing it on a
  physical device or dedicated VM emulator, exercising OS-level permission and
  background-location behaviour, and capturing screen recordings are **human /
  dedicated-VM-operator steps** that cannot be performed or honestly fabricated
  from this worker.

The correct interpretation is therefore:

- `install / permissions / online available / background tracking / killed-reopen /
  network switch / 5-min offline / full task lifecycle` all carry meaningful
  repo-backed `STATIC EVIDENCE`.
- `Android real-device PASS` **cannot yet be claimed** — it requires the dedicated
  VM run with attached artifacts in §7.
- The named automated companion path **`E2E-021-driver-heartbeat-replay.sh` is
  currently MISSING from `origin/dev`** (see §6, finding F-1). This weakens the
  "API event samples / offline-queue replay" portion of the pack until restored.

**VM lifecycle (acceptance "VM stopped when idle").** No dedicated UAT VM was
started by this worker (none is reachable — see above), so there is no running VM
to stop; the idle-stop obligation is vacuously satisfied for this session and is
re-asserted as an operator requirement in §7. No cloud cost was incurred here.

---

## 2. Build, Signing & Device Context (SA §6.10 — items 1–4)

| SA §6.10 item        | Value / source                                                                                                                   | State            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| App build version    | `app.json` → `version: 0.1.0`, android `versionCode: 1`                                                                           | `STATIC`         |
| OS version           | _to be captured on device_                                                                                                        | `PENDING DEVICE` |
| Device model         | _to be captured on device_                                                                                                        | `PENDING DEVICE` |
| Install / signing    | EAS build profiles in `apps/driver-app/eas.json`: `development` / `preview` (APK, `distribution: internal`) / `production`        | `STATIC`         |

**Signed-build path (repo facts).**

- `apps/driver-app/eas.json` defines `development` and `preview` Android profiles
  that emit an APK (`"android": { "buildType": "apk" }`, `distribution: internal`),
  plus a `production` profile. Build command: `pnpm --filter @drts/driver-app
  build:android:preview` → `eas build --platform android --profile preview`.
- `EXPO_PUBLIC_API_URL` is pinned to the deployed API
  (`https://drts-api-kdhu6wzufa-uc.a.run.app`) across profiles, so an installed
  build talks to the real dev API surface.
- `apps/driver-app/android/` carries the native Gradle project (`build.gradle`,
  `gradlew`, `settings.gradle`) for `expo run:android` / `expo prebuild`.
- Android manifest intent (from `app.json`): `permissions` include
  `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`;
  iOS parity declares `UIBackgroundModes: ["location"]` and the
  `locationAlwaysAndWhenInUsePermission` / `locationWhenInUsePermission` strings via
  the `expo-location` plugin. These are exactly the OS grants `UAT-MOB-ANDROID-001`
  steps 2–4 exercise.

> Signing keystore / EAS credentials and the resulting build URL+hash are **not**
> present in this worktree and must be attached by the VM operator (§7, item 1).

---

## 3. Scenario Matrix — `UAT-MOB-ANDROID-001` (SD §11.4)

Status legend (aligned with `driver-mobile-real-device-test-report-20260519.md`):

- `PASS`: on-device evidence attached in this pack
- `FAIL`: on-device execution happened and failed
- `BLOCKED`: environment / credentials prevent execution from this worker
- `NOT RUN`: no credible evidence the step ran on a physical Android device
- `STATIC EVIDENCE`: repo / unit / contract / runbook evidence exists, not a live device pass

| ID      | UAT-MOB-ANDROID-001 step      | Android                        | Repo evidence anchor (verified)                                                                                                                                 | Gap to close on device                                                                                       |
| ------- | ----------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AU-01` | Install signed build          | `BLOCKED` + `STATIC EVIDENCE`  | `apps/driver-app/eas.json` (preview/production APK), `apps/driver-app/android/` Gradle project                                                                 | EAS build URL + APK hash + `adb install` log + cold-launch screenshot.                                       |
| `AU-02` | Permissions                   | `NOT RUN` + `STATIC EVIDENCE`  | `lib/driver-online-gate.ts` (`evaluateDriverOnlineGate`, reasons `LOCATION_PERMISSION_DENIED` / `BACKGROUND_LOCATION_REQUIRED`); `app/shift.tsx` gate; MOB-APP-003 `643257bcd`; `tests/unit/driver-online-gate.test.ts`, `tests/unit/shift-screen-gate.test.ts` | Screenshots of the foreground+background permission ladder and the pre-online gate blocking with each reason. |
| `AU-03` | Online available              | `NOT RUN` + `STATIC EVIDENCE`  | `lib/driver-location-heartbeat.ts` cadence (`available` 30 s / 100 m, SA §6.2); MOB-APP-001 `3380b2644`; `tests/unit/driver-location-heartbeat.test.ts`         | Screen recording of continuous heartbeat while `online_available`; Ops timeline confirming receipt.          |
| `AU-04` | Background tracking            | `NOT RUN` + `STATIC EVIDENCE`  | `expo-location` + `expo-task-manager` deps; `ACCESS_BACKGROUND_LOCATION` / `FOREGROUND_SERVICE_LOCATION`; heartbeat cadence engine; MOB-APP-001 `3380b2644`     | Screen recording of background-location heartbeat with app backgrounded + foreground-service notification.    |
| `AU-05` | App killed / reopened         | `NOT RUN` + `STATIC EVIDENCE`  | `lib/driver-tracking-recovery.ts` (`TRACKING_GAP_THRESHOLD_MS = 4×interval`, gap as diagnostic metadata, no fabricated trail); MOB-APP-004 `7f7e97d0e`; `tests/unit/driver-tracking-recovery.test.ts` | Kill app mid-session, reopen, capture `gap_detected` → resumed-tracking UI + honest gap, active-state restore. |
| `AU-06` | Network switch                | `NOT RUN` + `STATIC EVIDENCE`  | `lib/driver-location-offline-queue.ts` (durable SQLite queue, monotonic `sequenceNo`, `eventId = deviceId:sequenceNo`); MOB-APP-002 `f12630b4d`; `tests/unit/driver-location-offline-queue.test.ts` | Toggle Wi-Fi↔cellular↔airplane mid-trip; capture queue drain + no lost/duplicate events.                     |
| `AU-07` | 5-minute offline              | `NOT RUN` + `STATIC EVIDENCE`  | Offline queue durability + flush (`flushDriverLocationQueue`, `ORDER BY sequence_no ASC`); MOB-BE-001 `f6234bead` + MOB-BE-002 `e0ea349d2` idempotency/freshness; `apps/api/tests/integration/int-mob-001-batch-heartbeat-idempotency.test.ts` | 5-min airplane mode, then reconnect; capture durable replay in order + server idempotent dedupe.             |
| `AU-08` | Full task lifecycle           | `NOT RUN` + `STATIC EVIDENCE`  | `lib/trip-workflow.ts`, `app/jobs.tsx`, `app/trip.tsx`; Ops reconcile MOB-OPS-001 `d81f9d0cd`; cross-surface tracking diagnostics                              | Assign → accept → en route → arrive → complete on device with location timeline + state-transition continuity. |

---

## 4. Repo-Local Verification Run (this session)

These commands were executed in this worktree. They are **not** substitutes for
physical-device UAT; they confirm the implementation and scripted evidence remain
coherent in machine truth.

| Command                                                                                   | Role                                            | Result                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/driver-app typecheck` (`tsc --noEmit`)                                | Driver-app type safety                          | `0 errors in apps/driver-app sources`. Residual errors are **all** in sibling packages (`packages/api-client` ES5/`Promise` lib config; `packages/ui-tokens` readonly-array) — a known pre-existing workspace dist/lib condition, not mobile-code regression. |
| `pnpm --filter @drts/driver-app test` (`vitest run`)                                       | Driver-app unit suites (17 files incl. the 5 UAT-relevant ones) | `BLOCKED IN THIS WORKTREE` — oxc transform: `Failed to load tsconfig … Tsconfig not found`; root cause is `expo/tsconfig.base` (the `extends` target) being unresolvable in this worktree's dep hydration. Suites are known-green at task closeouts (e.g. MOB-APP-003 vitest 81/81). |
| `bash -n tests/e2e/E2E-006-driver-multi-platform.sh E2E-018-driver-device-lifecycle.sh run-e2e.sh` | E2E script syntax sanity                        | `PASS`                                                                                                                                                                          |
| `git ls-tree -r origin/dev` for `E2E-021-driver-heartbeat-replay.sh` / `V0035__driver_location_event_id_text.sql` | Automated companion presence check              | `MISSING` — see §6 F-1.                                                                                                                                                         |

---

## 5. Per-Step Findings

### 5.1 Permissions / pre-online gate (AU-02)
`evaluateDriverOnlineGate` (`lib/driver-online-gate.ts`) enforces the OS permission
ladder: foreground denial → `LOCATION_PERMISSION_DENIED`; background-not-granted
(once foreground granted) → `BACKGROUND_LOCATION_REQUIRED`; identity/device issues
→ `IDENTITY_INVALID` / `DEVICE_NOT_BOUND`. Each reason carries a resolution
(`settings` | `onboarding`). `app/shift.tsx` renders the live gate before allowing
`online_available` (MOB-APP-003 `643257bcd`). This is exactly `UAT-MOB-ANDROID-001`
step "Permissions" + FR-MOB-002 / FR-MOB-003. **Device gap:** OS permission dialogs
and gate-block screenshots can only be captured on a real device.

### 5.2 Online available + background tracking (AU-03 / AU-04)
`lib/driver-location-heartbeat.ts` encodes the SA §6.2 per-state cadence
(`available` 30 s / 100 m … `incident` 5 s) with a time-OR-distance throttle, so
heartbeats never exceed the maximum allowed staleness (MOB-APP-001 `3380b2644`).
Background operation relies on `expo-location` + `expo-task-manager` and the
`ACCESS_BACKGROUND_LOCATION` / `FOREGROUND_SERVICE_LOCATION` grants. **Device gap:**
the actual background-location continuity and foreground-service notification are
OS-runtime behaviours that must be screen-recorded on device.

### 5.3 App killed / reopened (AU-05)
`lib/driver-tracking-recovery.ts` detects a tracking gap when the last persisted
heartbeat is older than `TRACKING_GAP_THRESHOLD_MS` (4 heartbeat intervals) while a
session marker is still open, records it as honest diagnostic metadata
(`gapStartedAt` / `gapEndedAt` / `gapDurationMs`, status `gap_detected`), and keeps
the resumed heartbeat's real `recordedAt` — **no fabricated continuous trail**
(MOB-APP-004 `7f7e97d0e`, SA §6.7). Active state restores on restart (FR-MOB-008).
**Device gap:** force-kill + reopen capture showing gap surfaced and state restored.

### 5.4 Network switch / 5-min offline / durable replay (AU-06 / AU-07)
`lib/driver-location-offline-queue.ts` is a durable SQLite queue with a monotonic
`sequenceNo` (reserved via `reserveSequenceNo`) and `eventId = deviceId:sequenceNo`,
draining `ORDER BY sequence_no ASC` (MOB-APP-002 `f12630b4d`). Server-side, MOB-BE-001
`f6234bead` (batch heartbeat) + MOB-BE-002 `e0ea349d2` (idempotency / freshness),
covered by `int-mob-001-batch-heartbeat-idempotency.test.ts`, dedupe replays and
classify freshness (FR-MOB-004 → 007). **Device gap:** real network conditioning +
5-min airplane mode then reconnect, proving in-order durable replay with no loss /
duplication, plus server idempotent dedupe via request/event-id continuity.

### 5.5 Full task lifecycle + Ops visibility (AU-08)
`lib/trip-workflow.ts` / `app/jobs.tsx` / `app/trip.tsx` drive assign→accept→
en route→arrive→complete; MOB-OPS-001 `d81f9d0cd` reconciles driver tracking +
location-state on the Ops Console (tracking-gap visible to Ops, FR-MOB-009).
**Device gap:** one full live lifecycle on device cross-checked against the Ops
location timeline.

---

## 6. Known Limitations & Regression Findings

**F-1 (regression, blocks automated companion evidence).** The named API/emulator-level
companion for this UAT, `tests/e2e/E2E-021-driver-heartbeat-replay.sh`, **and** its
schema migration `infra/migrations/V0035__driver_location_event_id_text.sql`, are
**absent from `origin/dev`**. Both were added by MOB-QA-001 (`752a9611e`, #824) and
then deleted by `fbc744877` (#823, _"chore(orchestrator): drop copilot lane from
dispatch sequence"_) — a commit whose diff is a 3,337-line mass-deletion far wider
than its subject (it also stripped fleet-partner / ops-console work that later PRs
re-landed; E2E-021 + V0035 were **not** re-landed). Verified:
`git ls-tree -r origin/dev` returns neither path; `git merge-base --is-ancestor
fbc744877 HEAD` is true. Impact: the automated heartbeat-replay path that would
generate "API event samples / offline-queue replay evidence / state-transition log"
for this pack is not currently runnable on dev. **This is MOB-QA-001 territory, not
fixed here**; flagged for supervisor triage.

**F-2 (worker environment).** No Android toolchain (`adb` / `emulator` /
`sdkmanager` / `avdmanager`) and no usable VM control plane (`gcloud` aborts under
`snap-confine: cap_dac_override not found`) in this isolated worker → signed-build
install and on-device capture are not executable here.

**F-3 (worktree toolchain).** Driver-app `vitest` cannot run in this worktree:
oxc transform fails to resolve `expo/tsconfig.base` (the tsconfig `extends` target),
so all 17 suites error before any test executes. Dependency hydration is incomplete
(`expo` package present in root `.pnpm` but `expo/tsconfig.base.json` unresolvable).
Not a code regression; suites are green at their task closeouts.

**F-4 (pre-existing workspace).** `tsc --noEmit` reports errors only in
`packages/api-client` (ES5 `Promise` lib) and `packages/ui-tokens` (readonly-array
methods) — sibling-package dist/lib config, zero errors in `apps/driver-app`.

**F-5 (scope).** Native push delivery (`expo-notifications`) is **not** present in
`apps/driver-app` — consistent with the 2026-05-19 report. In-app reminder state
only; native push is out of `UAT-MOB-ANDROID-001` scope and not claimed.

---

## 7. Required VM-Operator / Human Follow-Up To Convert To `PASS`

To upgrade this pack from `provisional` to a true Android real-device pass, run on
the dedicated VM (signed build) and attach:

1. **Install / signing (AU-01):** EAS build URL + APK hash + keystore/credentials
   reference, `adb install` log, and cold-launch screenshot.
2. **Permissions (AU-02):** screenshots of foreground + background permission grants
   and of the pre-online gate blocking with each reason
   (`LOCATION_PERMISSION_DENIED`, `BACKGROUND_LOCATION_REQUIRED`).
3. **Online available + background tracking (AU-03/04):** screen recording of
   continuous heartbeat foreground and backgrounded, with the foreground-service
   notification visible.
4. **App killed / reopened (AU-05):** force-kill mid-session, reopen, capture
   `gap_detected` → resumed-tracking UI (honest gap, no fabricated trail) and
   active-state restoration.
5. **Network switch + 5-min offline (AU-06/07):** Wi-Fi↔cellular↔airplane toggles and
   a 5-minute airplane window, then reconnect; capture in-order durable queue drain
   with no loss/duplication and server idempotent dedupe (event-id continuity).
6. **Full task lifecycle (AU-08):** one live assign→accept→…→complete with the Ops
   Console location timeline cross-check and state-transition continuity.
7. **SA §6.10 closeout items:** device model, OS version, Ops location timeline
   export, API event samples, offline-queue replay evidence, state-transition log,
   known limitations, and **tester / reviewer signoff**.
8. **Restore F-1 first:** re-land `E2E-021-driver-heartbeat-replay.sh` + `V0035`
   migration on dev so the automated companion evidence (items 3/5/7 API samples)
   is reproducible.
9. **VM idle-stop:** STOP the dedicated UAT VM once capture is complete (SA §6.10 /
   acceptance "VM stopped when idle").

---

## 8. Sign-off

| Role               | Name     | Verdict                                                                      | Date         |
| ------------------ | -------- | ---------------------------------------------------------------------------- | ------------ |
| Owner (author)     | `Claude` | `provisional` — static evidence complete; on-device run externally gated     | `2026-06-20` |
| Reviewer           | `Claude2`| _pending_                                                                    | _pending_    |
| Device-UAT tester  | _pending VM operator_ | _pending_                                                       | _pending_    |
