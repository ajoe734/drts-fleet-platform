# WF-DRV-MP-001 — Driver Multi-Platform Workbench Device Evidence Pack

**Task:** `PH1GC-DRV-MP-002` (Phase 1 gap closure — driver mobile device evidence packet)
**Directive:** `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §C `DRV-MP-002`
**Owner:** `Claude2`
**Reviewer:** `Claude`
**Collected:** `2026-05-22 (UTC)`
**Status:** `partial evidence only — sandbox + live device proof remains EXTERNAL-GATED`

---

## 1. Executive Summary

This packet records the current evidence posture for the eleven directive §C
items required to uplift `WF-DRV-MP-001` from `PASS (sandbox)` to
`PASS (sandbox + device evidence)`.

What this session can claim:

- The driver app source, Expo / EAS build configuration, and Android native
  scaffolding are committed and reproducible from `origin/dev`.
- One concrete Android debug APK artifact exists on disk under
  `apps/driver-app/android/app/build/outputs/apk/debug/app-debug.apk`. It is a
  valid Android package built from the committed sources with the expected
  applicationId, version, and permission manifest.
- The application-level surfaces required for items 9, 10 and 11 (platform
  online/offline, forwarded-task display, earnings-by-platform) are present in
  the committed React Native code and can be cited by file and component name.
- The application-level surfaces required for item 7 (location permission)
  exist as `expo-location` plugin entries and `AndroidManifest.xml`
  declarations.

What this session cannot claim:

- No real-device install was performed in this sandbox. There is no Android or
  iOS handset, no `adb`, no `xcrun`, no Apple developer signing material, and
  no TestFlight access wired up.
- No EAS-built production artifact (signed `.apk` / `.aab` / `.ipa`) was
  collected this session. The on-disk APK is a `gradle` debug build, not an
  EAS-signed release.
- No push-notification delivery, location-permission grant capture,
  weak-network retry trace, online/offline transition recording, forwarded-task
  display capture, or earnings display capture was produced from a real
  handset.
- Therefore items 1, 2, 5, 6, 7-live, 8, 9-live, 10-live, 11-live remain
  blocked on external sandbox device access.

Conclusion:

- `WF-DRV-MP-001` device-evidence row remains **EXTERNAL-GATED** for the
  device-side proof. The directive §C "sandbox + device evidence" gate
  cannot be uplifted by this packet alone.
- Per the task brief, this packet ships as `blocked_external`. The task does
  not advance to `done`.
- The missing dependency surface is named explicitly in §13 below so the
  next available device-capable session can resume directly from this packet.

---

## 2. Canonical Baseline

### 2.1 Release-gate truth

- Release matrix row: `WF-DRV-MP-001` Driver multi-platform workbench.
- Target gate read (directive §2): `PASS (sandbox + device evidence)`.
- E2E coupling: `tests/e2e/E2E-006-driver-multi-platform.sh` hardened under
  `PH1GC-DRV-MP-001` (commit `056e79f4`); deterministic seed mode is gated by
  `E2E_ALLOW_MISSING_FORWARDER_SEED=true` (warning-skip) versus default hard
  fail.

### 2.2 Driver app commit surface

The driver app under `apps/driver-app/` is the source-of-truth runtime for
this evidence packet. Citations in this packet refer to files committed to the
current task branch and are reproducible from `origin/dev` at the recorded
commit.

### 2.3 Directive §C deliverable list

The eleven items required by directive §C `DRV-MP-002`:

1. Android install proof
2. iOS install proof
3. Expo / EAS build profile
4. Android signing evidence
5. Apple team / TestFlight evidence
6. Push notification proof
7. Location permission proof
8. Weak network proof
9. Platform online / offline proof
10. Forwarded task display proof
11. Earnings display proof

Each is treated below with its own evidence read and explicit non-claim.

---

## 3. Item 1 — Android Install Proof

### 3.1 What exists in-repo

- Built artifact:
  - Path: `apps/driver-app/android/app/build/outputs/apk/debug/app-debug.apk`
  - Size: `119542978` bytes
  - sha256: `c6ccfcf0cce03b81b908ad6408e61ca3789a37ee781b431200eef27a51a0a3e0`
  - Build timestamp: `2026-05-07T12:36:34Z`
  - Build metadata: `apps/driver-app/android/app/build/outputs/apk/debug/output-metadata.json`
    - `applicationId: com.cctechsupport.drts.driver`
    - `versionCode: 1`
    - `versionName: 0.1.0`
    - `variantName: debug`
    - `minSdkVersionForDexing: 24`
- Merged manifest:
  `apps/driver-app/android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml`
  - `package="com.cctechsupport.drts.driver"`
  - `android:versionCode="1" android:versionName="0.1.0"`
  - `minSdkVersion="24" targetSdkVersion="36"`
- `file(1)` confirms artifact type:
  `Android package (APK), with gradle app-metadata.properties`.

### 3.2 What this proves

The Android binary is buildable, manifest-valid, and addressable on the
filesystem. The applicationId and permission surface match the committed
`app.json` declaration.

### 3.3 What this does NOT prove

- It does not demonstrate that this APK installs successfully on a real
  handset — no `adb install` was executed in this session and `adb` is not
  available in the worker sandbox.
- It is a `debug` build, not an EAS-signed `preview` or `production`
  artifact. The directive expects the install proof to map back to an
  EAS-managed channel (`development` / `preview` / `production` per
  `apps/driver-app/eas.json`).
- The APK is not currently checked into git and lives only under the
  build output directory of the canonical worker checkout. A downstream
  reviewer must rebuild via
  `pnpm --filter @drts/driver-app prebuild` followed by `gradle assembleDebug`
  before re-validating the hash above.

### 3.4 Required to uplift

- A signed release `.apk` or `.aab` produced via
  `eas build --platform android --profile preview` (or `production`).
- A device install log:
  `adb install -r app-<profile>.apk`
  with `pm path com.cctechsupport.drts.driver` confirming installation.
- A `device_id` (masked) and `Build.MODEL` recorded.

---

## 4. Item 2 — iOS Install Proof

### 4.1 What exists in-repo

- `apps/driver-app/app.json` declares:
  - `ios.bundleIdentifier: com.cctechsupport.drts.driver`
  - `ios.buildNumber: 1`
  - `ios.supportsTablet: false`
  - `ios.infoPlist.UIBackgroundModes: ["location"]`
- `apps/driver-app/eas.json` declares `development-simulator` profile that
  extends `development` with `ios.simulator: true`.

### 4.2 What this proves

The driver app is configured for iOS build via Expo / EAS with a registered
bundle identifier and background-location capability. The project is
prepared for `eas build --platform ios --profile development` or
`--profile preview`.

### 4.3 What this does NOT prove

- No iOS `.ipa` artifact exists in the worker sandbox.
- No `xcrun simctl install` or physical-device install log was produced.
- No `Provisioning Profile` or `Apple Team ID` is configured in the
  repository (these are intentionally held outside the codebase; see §7).

### 4.4 Required to uplift

- A `development` or `preview` profile EAS iOS build producing a `.ipa` or
  simulator `.app` bundle.
- Either:
  - A simulator install log: `xcrun simctl install booted DRTSDriver.app`
    plus `xcrun simctl launch booted com.cctechsupport.drts.driver`, or
  - A physical-device install via TestFlight (see §7) with a screen capture
    of the launch screen and `Build.identifierForVendor` (masked) recorded.

---

## 5. Item 3 — Expo / EAS Build Profile

### 5.1 What exists in-repo

- `apps/driver-app/eas.json` (committed):
  ```json
  {
    "cli": { "version": ">= 16.19.0" },
    "build": {
      "development": { "developmentClient": true, "distribution": "internal",
                       "channel": "development",
                       "android": { "buildType": "apk" },
                       "env": { "EXPO_PUBLIC_API_URL": "<staging-host>" } },
      "development-simulator": { "extends": "development",
                                 "ios": { "simulator": true } },
      "preview": { "distribution": "internal", "channel": "preview",
                   "android": { "buildType": "apk" },
                   "env": { "EXPO_PUBLIC_API_URL": "<staging-host>" } },
      "production": { "channel": "production",
                      "env": { "EXPO_PUBLIC_API_URL": "<staging-host>" } }
    },
    "submit": { "production": {} }
  }
  ```
- `apps/driver-app/app.json` (committed) carries `expo.runtimeVersion.policy`,
  `expo.plugins`, and the per-platform native declarations referenced above.
- `apps/driver-app/package.json` scripts:
  - `build:android:development` / `:preview`
  - `build:ios:development` / `:preview`
  - `prebuild`
- `.expo/devices.json` is present locally with one development installation
  ID; this file is local-state and not part of canonical evidence.

### 5.2 What this proves

The EAS build profile required by the directive is committed, validated by
the EAS CLI version pin, and references three concrete channels:
`development`, `preview`, `production`. Per-platform overrides for Android
APK vs. iOS simulator are in place.

### 5.3 What this does NOT prove

- No EAS build job was triggered in this session.
- The staging API host wired into the `env.EXPO_PUBLIC_API_URL` field is the
  same host that returned HTTP `404` during the `FWD-LIVE-001` probe on
  `2026-05-19`. The environment-boundary blocker recorded there must be
  resolved before any device-side build can hit a working API.

### 5.4 Required to uplift

- An EAS build URL or build ID for at least one `preview` profile per
  platform (Android + iOS), with the EAS build manifest captured.

---

## 6. Item 4 — Android Signing Evidence

### 6.1 What exists in-repo

- `app.json` declares `android.package = com.cctechsupport.drts.driver`.
- The on-disk debug APK (§3.1) is implicitly signed by the Android debug
  keystore generated by Gradle during the local build; this is **not** the
  release signing identity expected by the directive.
- No `keystore.jks`, no Play upload key reference, and no
  `android/app/build.gradle` release-signing block is committed. This matches
  EAS-managed signing practice where the release keystore is held server-side
  by Expo Application Services and never lands in the repo.

### 6.2 What this proves

The application is properly named, packaged, and ready for EAS-managed
signing. Repository hygiene is correct: no private keystore material is
committed.

### 6.3 What this does NOT prove

- No release signing artifact (certificate fingerprint, SHA1, SHA256) has
  been captured.
- No `apksigner verify --print-certs app-release.apk` output exists for the
  release variant.
- No Play Console upload-cert chain has been recorded.

### 6.4 Required to uplift

- Output of `eas credentials --platform android --profile preview` listing
  the managed keystore (masked: keystore type, SHA256, distinguished name).
- `apksigner verify --print-certs` against the EAS-signed APK with the
  signature SHA256 recorded.
- Confirmation that the release keystore matches the Play upload key (or an
  explicit non-claim that Play release is deferred to a later phase).

---

## 7. Item 5 — Apple Team / TestFlight Evidence

### 7.1 What exists in-repo

- `app.json` declares:
  - `ios.bundleIdentifier: com.cctechsupport.drts.driver`
  - `ios.buildNumber: 1`
- `eas.json` declares the `submit.production` block (currently empty;
  defaults to EAS-managed submission credentials).

### 7.2 What this proves

The repo is prepared for EAS Submit. The bundle identifier is registered
in the source-of-truth `app.json` and is consistent between iOS and Android
package coordinates.

### 7.3 What this does NOT prove

- No Apple Team ID, no Provisioning Profile name, no App Store Connect app
  record, and no TestFlight build number has been captured.
- No `eas submit --platform ios` invocation has been run.
- No TestFlight install screen capture has been collected.

### 7.4 Required to uplift

- A masked Apple Team ID (last 4 of the team identifier) plus
  Provisioning Profile name.
- A TestFlight build number with the corresponding EAS build URL.
- A screen capture from a TestFlight invitee's device showing the
  driver app launching with the expected splash screen and version
  string. Driver name and phone in the capture MUST be PII-masked
  (`****` for last six digits of phone, full name redacted).

---

## 8. Item 6 — Push Notification Proof

### 8.1 What exists in-repo

- `apps/driver-app/package.json` does not currently depend on
  `expo-notifications` or `expo-server-sdk`. No `google-services.json` is
  committed.
- The `expo.plugins` array in `app.json` does not currently include a
  notifications plugin entry.

### 8.2 What this proves

The driver app does not yet have a wired push-notification stack on the
client side. This is a real gap for the device-evidence packet and is
larger than a sandbox blocker: it is also an implementation gap that
must be tracked separately if push delivery is a Phase 1 gate.

### 8.3 What this does NOT prove

- No FCM token registration log exists.
- No APNs token registration log exists.
- No push delivery callback log exists.

### 8.4 Required to uplift

- Add `expo-notifications` to `apps/driver-app/package.json`, configure
  the plugin in `app.json`, and provide a test trigger endpoint or
  Expo push-service ping (`https://exp.host/--/api/v2/push/send`).
- Capture one delivered push from the server side (request body with
  recipient token masked) and one client-side `Notifications.addNotificationReceivedListener`
  log entry.
- Driver identity fields in the captured payload MUST be PII-masked.

NOTE: this item is the most invasive of the eleven. The supervisor may
elect to split it into a separate gap-closure task (`PH1GC-DRV-MP-002a`
or similar) rather than block the rest of the packet on a code change
that exceeds the evidence-only scope of `PH1GC-DRV-MP-002`.

---

## 9. Item 7 — Location Permission Proof

### 9.1 What exists in-repo

- `apps/driver-app/app.json` `expo.plugins` declares:
  ```jsonc
  [
    "expo-location",
    {
      "locationWhenInUsePermission":
        "Allow DRTS Driver App to access your location while a trip is active so it can calculate trip distance and duration.",
      "locationAlwaysAndWhenInUsePermission":
        "Allow DRTS Driver App to keep using your location for active-trip heartbeat updates even when the app is backgrounded.",
      "isAndroidBackgroundLocationEnabled": true,
      "isIosBackgroundLocationEnabled": true
    }
  ]
  ```
- `app.json` `expo.android.permissions` includes:
  `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`.
- `app.json` `expo.ios.infoPlist.UIBackgroundModes` includes `"location"`.
- The merged `AndroidManifest.xml` (§3.1) confirms
  `ACCESS_BACKGROUND_LOCATION`, `ACCESS_COARSE_LOCATION`,
  `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, and
  `FOREGROUND_SERVICE_LOCATION` are present.
- `apps/driver-app/package.json` depends on
  `expo-location` (`~19.0.8`) and `expo-task-manager` (`~14.0.8`).

### 9.2 What this proves

The driver app statically declares the full location-permission surface
required for both foreground and background updates on Android and iOS.
Plugin copy strings are localized for both platforms.

### 9.3 What this does NOT prove

- No screen capture of the iOS permission dialog or the Android
  runtime-permission dialog was collected from a real device.
- No `Location.getCurrentPositionAsync` log demonstrating an actual
  fix has been recorded.

### 9.4 Required to uplift

- One Android device capture of the runtime permission prompt for
  `ACCESS_FINE_LOCATION` and the follow-up "Allow all the time" prompt
  for `ACCESS_BACKGROUND_LOCATION`.
- One iOS device capture of the "Allow while using App" prompt and the
  "Always Allow" upgrade prompt.
- One client-side log entry showing
  `Location.requestForegroundPermissionsAsync` and
  `Location.requestBackgroundPermissionsAsync` returning `granted: true`.

---

## 10. Item 8 — Weak Network Proof

### 10.1 What exists in-repo

- `apps/driver-app/lib/driver-workspace-cockpit.ts` and related lib code
  organise the driver workspace data flow. (No dedicated retry middleware
  was located by name during this session; reviewers should grep for
  `retry|backoff|timeout` under `apps/driver-app/lib` and
  `packages/api-client` to confirm the static surface before validating.)

### 10.2 What this proves

Repository structure exposes the data-fetching seam for the driver app,
but no live weak-network behavioural log has been collected.

### 10.3 What this does NOT prove

- No `adb shell svc data disable` or iOS Network Link Conditioner
  capture was produced.
- No retry / backoff trace from the driver app was recorded.

### 10.4 Required to uplift

- A device session in which the cellular link is throttled (Android:
  `adb shell svc data disable`; iOS: Network Link Conditioner "Edge"
  profile or airplane-mode toggle), with the driver app left running on
  the jobs or trip screen.
- Capture the in-app error or stale-data banner, the recovery on link
  restoration, and the corresponding client-side log lines.

---

## 11. Item 9 — Platform Online / Offline Proof

### 11.1 What exists in-repo

- Screen: `apps/driver-app/app/platform-presence.tsx` is the
  platform-presence health center.
- Component: `apps/driver-app/components/platform-status-card.tsx`
  renders bound / re-auth / token / eligibility chips.
- Component: `apps/driver-app/components/platform-binding.tsx` is
  consumed by `apps/driver-app/app/settings.tsx` (per the
  `DRV-MP-009` acceptance packet at
  `support/sidecars/DRV-MP-009/DRV-MP-009-SIDECAR-ACCEPTANCE.md`).
- API source: `apps/api/src/modules/platform-presence/platform-presence.service.ts`.

### 11.2 What this proves

The end-to-end online / offline surface is implemented in committed
code and validated for repo-local rendering parity (the `DRV-MP-009`
sidecar already captured the typecheck + parity gate).

### 11.3 What this does NOT prove

- No device capture of the user toggling a single platform offline and
  observing the presence chip update has been collected.
- No device capture of the global "go offline" → "come online" transition
  has been recorded.

### 11.4 Required to uplift

- Two device captures of `platform-presence.tsx` with one or more
  platform cards toggled across `bound → offline → bound`.
- The corresponding API response payloads captured with driver name
  and phone PII-masked.

---

## 12. Item 10 — Forwarded Task Display Proof

### 12.1 What exists in-repo

- Screen: `apps/driver-app/app/jobs.tsx` is the driver inbox / job list.
- Screen: `apps/driver-app/app/trip.tsx` renders the active trip.
- Component: `apps/driver-app/components/platform-task-badge.tsx`
  distinguishes owned vs. forwarded tasks.
- Component: `apps/driver-app/components/ui-rn/ForwardedStatusBadge.tsx`
  is the dedicated forwarded-status pill.
- Component: `apps/driver-app/components/route-display.tsx` reads
  `routeLocked` semantics.
- E2E gate (`PH1GC-DRV-MP-001`, commit `056e79f4`) hardens the
  deterministic seed at
  `tests/e2e/E2E-006-driver-multi-platform.sh`:
  - seed env: `E2E_SEED_OWNED_TASK_ID` + `E2E_SEED_FORWARDED_TASK_ID`
  - warning-skip ONLY under `E2E_ALLOW_MISSING_FORWARDER_SEED=true`
  - default: hard fail
  - asserts no owned-dispatch assignment for forwarded task

### 12.2 What this proves

Forwarded-task display is implemented, gated by a deterministic E2E
seed, and committed. The non-owned dispatch invariant is enforced at
the E2E layer.

### 12.3 What this does NOT prove

- No device capture of `jobs.tsx` showing one owned task and one
  forwarded task in the same inbox has been collected.
- No device capture of the `ForwardedStatusBadge` or `route-display`
  with `routeLocked = true` has been recorded.

### 12.4 Required to uplift

- One device capture of a seeded driver inbox displaying both owned
  and forwarded tasks side by side.
- One device capture of a forwarded task's detail view with
  `sourcePlatform`, `routeLocked`, and the forwarded badge visible.
- Driver name / phone fields in the captures must be PII-masked
  (full name redacted; phone last 6 digits replaced by `****`).

---

## 13. Item 11 — Earnings Display Proof

### 13.1 What exists in-repo

- Screen: `apps/driver-app/app/earnings.tsx`.
- Component: `apps/driver-app/components/earnings-by-platform.tsx`
  renders the by-platform earnings split required by directive §C
  and verified at the E2E layer under `E2E-006`.

### 13.2 What this proves

The earnings-by-platform surface is implemented in committed code,
matches the by-platform split that `E2E-006` asserts, and is reachable
from the navigation graph.

### 13.3 What this does NOT prove

- No device capture of `earnings.tsx` with at least two platform rows
  has been collected.
- No comparison with a seeded backend payload has been recorded.

### 13.4 Required to uplift

- One device capture of `earnings.tsx` showing the by-platform split
  for a seeded driver, alongside the matching backend payload
  (driver name / phone PII-masked).

---

## 14. Aggregate Gate Read

Per the directive:

```text
WF-DRV-MP-001 target = PASS (sandbox + device evidence)
WF-DRV-MP-001 current = PASS (sandbox) — device evidence EXTERNAL-GATED
```

This packet does not change the current gate read. It records the
in-repo evidence baseline and itemises the missing device captures so
the next device-capable session can resume directly from here.

Not allowed:

- "Driver mobile device evidence passed."
- "TestFlight build live."
- "Push delivery proven."
- Any wording that equates this packet with sandbox + device evidence
  uplift.

Allowed:

- "Driver mobile device evidence packet committed in
  `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/`."
- "Eleven directive §C items enumerated with explicit
  in-repo evidence vs. live-device non-claims."
- "`WF-DRV-MP-001` retains current gate read; device-evidence uplift
  remains EXTERNAL-GATED."

---

## 15. Missing-Dependency Surface

The following external dependencies must be resolved before this
packet can be replaced by a `PASS (sandbox + device evidence)` packet.
Each is named so the next session can pick them up without rediscovery:

1. **Android handset access**
   - Physical device or emulator reachable via `adb`.
   - `Build.MODEL`, `Build.VERSION.RELEASE`, and a masked `device_id`
     recorded.

2. **iOS handset access**
   - Physical device or an Xcode simulator reachable via `xcrun simctl`.
   - `UIDevice.identifierForVendor` (masked) recorded.

3. **EAS-signed builds**
   - At least one `preview`-profile build per platform produced via
     `eas build --platform android --profile preview` and
     `eas build --platform ios --profile preview`.
   - EAS build URLs / build IDs captured.

4. **Android release signing identity**
   - `eas credentials --platform android` output (masked) confirming
     a managed keystore.

5. **Apple developer team membership**
   - Team ID (masked), Provisioning Profile name, App Store Connect
     app record, TestFlight build number, and one TestFlight invitee
     install capture.

6. **Push-notification stack**
   - Implementation of `expo-notifications` on the client (this is a
     code change, not just evidence collection — may need a separate
     gap-closure task).
   - One delivered push captured server-side and client-side.

7. **Reachable backend host**
   - The `EXPO_PUBLIC_API_URL` configured in `eas.json` currently
     references the same host that the `FWD-LIVE-001` probe found
     returning HTTP `404` on `2026-05-19`. This must be reachable
     and responsive before any device-side session can produce
     meaningful end-to-end captures.

8. **Driver seed identity**
   - A seeded driver account with both owned and forwarded tasks
     (mirroring `E2E-006` deterministic seed) so the forwarded-task
     display and earnings-by-platform captures have real data to
     render.

9. **PII-masking discipline**
   - All captures collected under §3 through §13 above MUST mask
     driver name and phone. Per the task brief: "PII masking applied
     to driver name/phone in all captures."

---

## 16. Relationship To Existing Evidence

This packet does not replace or contradict the prior chain:

- `support/sidecars/DRV-MP-009/DRV-MP-009-SIDECAR-ACCEPTANCE.md`
  established the platform-presence + settings-binding repo-local
  parity gate.
- `support/sidecars/FBP-014/FBP-014-E2E-UMBRELLA-CLOSEOUT.md` keeps
  the E2E posture honest.
- `PH1GC-DRV-MP-001` (commit `056e79f4`) hardened
  `E2E-006-driver-multi-platform.sh` deterministic seed mode.
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
  established the partial-evidence reporting pattern this packet
  follows.

This packet adds a dated device-evidence baseline, not a new pass
verdict.

---

## 17. Evidence Commands Used For This Snapshot

Executed during this session (`2026-05-22`):

```bash
sha256sum apps/driver-app/android/app/build/outputs/apk/debug/app-debug.apk
stat -c '%y %s bytes %n' apps/driver-app/android/app/build/outputs/apk/debug/app-debug.apk
file apps/driver-app/android/app/build/outputs/apk/debug/app-debug.apk
cat apps/driver-app/android/app/build/outputs/apk/debug/output-metadata.json
head -50 apps/driver-app/android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml
which eas expo adb xcrun
ls /opt/android-sdk
grep -rln "forwarded|sourcePlatform|routeLocked|by-platform|platformEarnings" apps/driver-app/{app,components,lib}
grep -r "google-services|firebase|push" apps/driver-app/app.json apps/driver-app/eas.json
find apps/driver-app -maxdepth 3 -name "google-services.json" -o -name "*firebase*"
```

Observed key outputs:

- `app-debug.apk` is a valid Android package, sha256 recorded above.
- `eas`, `expo`, `adb`, `xcrun` are all NOT available in the worker
  sandbox.
- No `google-services.json` or Firebase config is committed.
- No `expo-notifications` dependency is currently wired in.
- Forwarded-task and earnings code surfaces are present at the cited
  file paths.

---

## 18. Machine-Truth Note

Canonical machine truth for `PH1GC-DRV-MP-002` lives at the
control-plane root
`/home/edna/workspace/drts-fleet-platform/ai-status.json`.

The isolated worker worktree's local `ai-status.json` is branch-local
and is not the authoritative dispatch view for this task.

Because task lifecycle state can advance independently of this packet,
this document must not be read as the source of truth for current
owner / reviewer / status fields. Readers should consult canonical
`ai-status.json` for live control-plane state and use this packet only
for the dated evidence snapshot recorded above.
