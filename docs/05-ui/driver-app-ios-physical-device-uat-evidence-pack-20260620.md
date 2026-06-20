# Driver App — iOS Physical-Device UAT Evidence Pack — 2026-06-20

**Task:** `MOB-UAT-002`
**Owner:** `Claude`
**Reviewer:** `Claude2`
**Spec:** `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md` §11.4 `UAT-MOB-IOS-001`
**Depends on:** `MOB-APP-003` (`643257bcd`), `MOB-APP-004` (`7f7e97d0e`) — also relies on `MOB-APP-001` (`3380b2644`) and `MOB-APP-002` (`#834`, `f12630b4d`)
**Artifact status:** `scaffold — awaiting real-device evidence`
**Overall read:** `external_blocked — requires a physical iPhone / TestFlight build / human operator`

> ⚠️ **Acceptance is not auto-completable.** Per the task brief and SD §11.4, the only
> thing that satisfies `MOB-UAT-002` is an iOS evidence pack captured on a *real device*
> by a human (or TestFlight tester). An autoworker cannot install a signed build on an
> iPhone, toggle Low Power Mode, force-quit the app, or film OS-level behavior. This
> document is the **operator-fillable scaffold**: it states exactly which scenarios must
> be exercised, what the in-repo implementation already guarantees (so the operator knows
> the expected result), and where to attach captures. Converting this pack from
> `scaffold` to `PASS` is a human/TestFlight step and is mirrored as the
> `PH1GC-DRV-MP-002` external exception.

---

## 1. Scope

`UAT-MOB-IOS-001` runs the **same** end-to-end flow as `UAT-MOB-ANDROID-001`
(install signed build → permissions → online available → background tracking →
app killed/reopened → network switch → 5-minute offline → full task lifecycle)
**plus** the iOS-specific verifications called out in SD §11.4:

- Low Power Mode
- iOS background indicator (blue location bar / status-bar pill)
- OS termination (system reclaims a backgrounded app)
- user force-quit limitation (iOS does **not** relaunch a user-swiped-away app for background location)
- reopen recovery

This pack therefore has two scenario blocks: **§4 Base parity scenarios** and
**§5 iOS-specific scenarios**.

---

## 2. Distribution Prerequisites (must be satisfied before §4/§5)

| Item | Required value / source | Operator fills in |
| --- | --- | --- |
| Bundle identifier | `com.cctechsupport.drts.driver` (`apps/driver-app/app.json` `ios.bundleIdentifier`) | _build's actual bundle id_ |
| Build number | `1` (`app.json` `ios.buildNumber`) — bump per release | _build/version installed_ |
| Background mode entitlement | `UIBackgroundModes: ["location"]` (`app.json` `ios.infoPlist`) | _confirm present in installed build_ |
| Background location plugin | `isIosBackgroundLocationEnabled: true` + `locationAlwaysAndWhenInUsePermission` copy (`app.json` `expo-location`) | _confirm prompt copy shown_ |
| API base URL | `extra.apiBaseUrl` in `app.json` (dev: `https://drts-api-kdhu6wzufa-uc.a.run.app`) | _backend the build points at_ |
| Distribution channel | TestFlight **or** Expo dev-client on a registered UDID | _channel + install proof_ |
| Signed-build artifact | IPA / TestFlight build link + SHA / build id | _link / hash_ |
| Test driver identity | A backend-issued, device-bindable driver account | _driver id used_ |

> If any prerequisite cannot be met, stop here and record it in §7 — do not
> mark base/iOS scenarios `NOT RUN` when the real blocker is distribution.

---

## 3. Repo-Backed Implementation Baseline (expected behavior the operator is verifying)

These are **static-evidence anchors**: the in-repo implementation that defines
the expected result for each device scenario. They are *not* a substitute for a
real-device pass — they tell the operator what "correct" looks like.

| Behavior under test | Implementation anchor | Guaranteed contract |
| --- | --- | --- |
| Pre-online permission gate | `apps/driver-app/lib/driver-online-gate.ts` (MOB-APP-003) | Four pre-conditions — bound device, valid identity, foreground location, background location. Missing foreground → `LOCATION_PERMISSION_DENIED`; foreground-only → `BACKGROUND_LOCATION_REQUIRED` (driver may browse but cannot enter `online_available`). Each denial surfaces a reason + resolution deep-link. |
| Gate reason surfacing on shift screen | `apps/driver-app/app/shift.tsx` + `tests/unit/shift-screen-gate.test.ts` (MOB-APP-003) | Live gate device/identity reason + resolution action rendered (does not swallow `IDENTITY_INVALID` behind a generic empty state). |
| Online-available heartbeat cadence | `apps/driver-app/lib/driver-location-heartbeat.ts` (MOB-APP-001) | `available` = every **30 s or 100 m**; `incident` = **5 s** (freshness floor); default = 15 s / 25 m. Time-**or**-distance throttle. |
| Background heartbeat continuity | `app.json` `UIBackgroundModes:["location"]` + `isIosBackgroundLocationEnabled` | Heartbeats continue while backgrounded with `Always` permission; foreground-only or revoked background → `BACKGROUND_LOCATION_REQUIRED` block. |
| Durable offline queue | `apps/driver-app/lib/driver-location-offline-queue.ts` (MOB-APP-002) | `expo-sqlite`-backed durable queue, monotonic `sequenceNo` (`deviceId:sequenceNo` event id), exponential backoff (max 5 min), `MAX_QUEUE_DEPTH = 5000` compaction. Survives process death; replays in order on reconnect; ack-delete prevents duplicates. |
| Restart / OS-termination recovery | `apps/driver-app/lib/driver-tracking-recovery.ts` + wired in `app/_layout.tsx` (MOB-APP-004) | Durable session marker records the last persisted heartbeat. On next launch, if a session was still open and the marker is older than `TRACKING_GAP_THRESHOLD_MS` (= 4 × 15 s = **60 s**), the gap is reported **honestly** — never interpolated. Resumed heartbeat keeps its real `recordedAt`. |
| Identity bootstrap / rebind | `apps/driver-app/lib/driver-identity-bootstrap.ts` | Revoked/suspended identity routes back to onboarding; valid binding refreshes without re-registration. |

---

## 4. Base Parity Scenarios (mirror of `UAT-MOB-ANDROID-001`)

Status legend: `PASS` (real-device evidence attached) · `FAIL` (ran and failed) ·
`BLOCKED` (env/credentials prevent run) · `NOT RUN` (no run on iOS) ·
`STATIC EVIDENCE` (repo-backed expected result only).

| ID | Scenario | Expected result (anchor) | Operator steps | Evidence file | Verdict |
| --- | --- | --- | --- | --- | --- |
| `IOS-01` | Install signed build + cold launch | Build installs via TestFlight/dev-client; first launch reaches onboarding/shift | Install → open → screenshot first screen | _attach_ | `NOT RUN` |
| `IOS-02` | Grant permissions (When-in-Use → Always) | Gate clears only with `Always`; foreground-only shows `BACKGROUND_LOCATION_REQUIRED` (`driver-online-gate.ts`) | Grant When-in-Use only, observe block; upgrade to Always, observe clear | _attach_ | `NOT RUN` |
| `IOS-03` | Go `online_available` | Gate passes all 4 checks; presence flips online (`driver-online-gate.ts`, `shift.tsx`) | Toggle online; screenshot online state | _attach_ | `NOT RUN` |
| `IOS-04` | Foreground active-trip tracking | Heartbeats at 30 s/100 m while available; 5 s during incident (`driver-location-heartbeat.ts`) | Drive/walk a route; capture heartbeat timeline (App + Ops) | _attach_ | `NOT RUN` |
| `IOS-05` | Background tracking | Heartbeats continue backgrounded with Always (`UIBackgroundModes`) | Background the app mid-trip; confirm continued heartbeats server-side | _attach_ | `NOT RUN` |
| `IOS-06` | App killed / reopened | On relaunch, open session restored; gap >60 s reported honestly (`driver-tracking-recovery.ts`) | Kill app, wait, reopen; capture gap surfacing + resumed heartbeat | _attach_ | `NOT RUN` |
| `IOS-07` | Network switch (Wi-Fi ↔ cellular) | Queue buffers across switch; replays in order, no dupes (`driver-location-offline-queue.ts`) | Toggle Wi-Fi/cellular mid-trip; verify ordered replay, single events | _attach_ | `NOT RUN` |
| `IOS-08` | 5-minute offline | Events durably queued (SQLite, depth ≤5000) and replayed on reconnect (`driver-location-offline-queue.ts`) | Airplane mode 5 min during trip; restore; verify full ordered replay | _attach_ | `NOT RUN` |
| `IOS-09` | Full task lifecycle | Assign → accept → route intent → proof → complete; completion replay idempotent | Run one owned task end-to-end; capture each step + earnings | _attach_ | `NOT RUN` |

---

## 5. iOS-Specific Scenarios (SD §11.4 deltas)

| ID | Scenario | Expected result (anchor) | Operator steps | Evidence file | Verdict |
| --- | --- | --- | --- | --- | --- |
| `IOS-LP-01` | **Low Power Mode** active during trip | Heartbeats may be throttled by iOS but the time-**or**-distance trigger still emits on movement; no crash; cadence degradation is visible/honest, not faked (`driver-location-heartbeat.ts`) | Enable Low Power Mode, run a trip; compare heartbeat density vs normal; note any iOS-imposed coalescing | _attach_ | `NOT RUN` |
| `IOS-BG-01` | **iOS background indicator** | While backgrounded with active location, iOS shows the blue location status-bar pill; tapping returns to the app | Background mid-trip; screenshot the status-bar indicator | _attach_ | `NOT RUN` |
| `IOS-OT-01` | **OS termination** (system reclaim) | After iOS reclaims the backgrounded app, on next user open the session is restored and the dark period is reported as a gap >60 s, not interpolated (`driver-tracking-recovery.ts`) | Background app, induce memory pressure / leave for an extended period, reopen; capture honest gap | _attach_ | `NOT RUN` |
| `IOS-FQ-01` | **User force-quit limitation** | After a user swipe-up force-quit, iOS does **not** relaunch the app for background location; tracking is expected to stop until the user reopens. The app must NOT claim continuous tracking across this window | Force-quit mid-trip; confirm tracking stops; confirm no fabricated heartbeats for the quit window | _attach_ | `NOT RUN` |
| `IOS-RR-01` | **Reopen recovery** | Reopening after force-quit/termination restores the open session, recomputes/reports the gap, and resumes heartbeats with real `recordedAt` (`driver-tracking-recovery.ts`, wired `app/_layout.tsx`) | Reopen after `IOS-FQ-01`/`IOS-OT-01`; capture recovery banner + resumed cadence + Ops-side gap | _attach_ | `NOT RUN` |
| `IOS-ID-01` | Identity revoke during session | Revoked/suspended identity routes back to onboarding even mid-trip (`driver-identity-bootstrap.ts`) | Admin-revoke the device session; observe redirect | _attach_ | `NOT RUN` |

---

## 6. Operator Capture Checklist (per scenario)

For each row above, attach to `docs/05-ui/` (or a linked `support/sidecars/` evidence folder):

1. Build identity (TestFlight build id / IPA SHA) used.
2. Device model + iOS version + whether Low Power Mode was on.
3. Screen recording or screenshot sequence of the steps.
4. Server-side / Ops-console confirmation (heartbeat timeline, gap record, task state) where the expected result is backend-observable.
5. A one-line verdict: `PASS` / `FAIL` / `BLOCKED` and, on `FAIL`, the divergence from the anchored expected result.

---

## 7. Blocking Items (why this stays `external_blocked`)

1. No physical iPhone / registered UDID / TestFlight tester available to an autoworker.
2. Signed iOS build distribution (Apple signing + TestFlight or dev-client) is an external, human-gated step.
3. Low Power Mode, the background location indicator, OS termination, and user force-quit are **device/OS behaviors** that cannot be exercised or filmed in this environment.
4. Real-device network conditioning (Wi-Fi/cellular switch, 5-minute airplane mode) requires a human operating the handset.

These mirror the `PH1GC-DRV-MP-002` external exception and the prior
`docs/04-uat/driver-mobile-real-device-test-report-20260519.md` posture.

---

## 8. Sign-Off (human/TestFlight operator completes)

| Field | Value |
| --- | --- |
| Operator name | _____ |
| Date executed | _____ |
| Device(s) | _____ |
| iOS version(s) | _____ |
| Build id / SHA | _____ |
| Base parity result (§4) | _____ |
| iOS-specific result (§5) | _____ |
| Overall verdict | _____ |
| Reviewer (`Claude2`) sign-off | _____ |

Until this table is filled with a real-device run, `MOB-UAT-002` acceptance
("iOS evidence pack produced on a real device") remains **unmet** and the task
stays `external_blocked`.
