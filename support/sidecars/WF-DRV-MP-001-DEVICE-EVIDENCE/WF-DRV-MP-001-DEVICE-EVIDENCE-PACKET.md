# WF-DRV-MP-001 — Driver Mobile Device Evidence Packet

**Task:** `PH1GC-DRV-MP-002`  
**Workflow family:** `WF-DRV-MP-001`  
**Owner:** `Codex`  
**Reviewer:** `Claude`<br>
**Collected:** `2026-05-23 (UTC)`  
**Brief status:** `blocked_external`  
**Current machine-truth task status at drafting:** `in_progress`

---

## 1. Executive Summary

This sidecar directory now closes the missing path gap on this task branch and
carries a `README`, 11 directive `§C` placeholder files, and blocked-state
closeout reports. It still does not claim that Android or iOS real-device
evidence has been collected.

Current read on `2026-05-23`:

- `origin/dev` still does not contain
  `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/`; this task branch carries
  the sidecar directory only on this branch.
- This branch now carries:
  - `README.md`
  - `01-android-install-proof.md` through `11-earnings-display-proof.md`
  - `PH1GC-DRV-MP-002-CLOSEOUT-20260522.md`
  - `PH1GC-DRV-MP-002-CLOSEOUT-20260523.md`
  - this consolidated packet
- This worker has no Android bridge, no Apple device tooling, and no active
  Expo login:
  - `adb`: command not found
  - `xcrun`: command not found
  - `eas`: command not found
  - `npx eas-cli whoami`: `Not logged in`
- This branch already carried a prior blocked-external anchor commit, but the
  packet still named the pre-reassignment reviewer lane. This refresh only
  realigns the packet to current machine truth; it does not change the blocker.
- The canonical blocker packet `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`
  still keeps `EXT-003-BLK-001` through `EXT-003-BLK-007` open.
- The existing real-device report
  `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` already says
  Android and iPhone install, live push, forwarded-task live capture, and
  weak-network live capture remain unproven.

Conclusion:

- The correct status for this packet remains `blocked_external`.
- This task must not be marked `done` from this session.
- The packet below records the missing dependencies and the exact evidence still
  required to convert the workflow family to a true device-evidence pass.

---

## 2. First-Hand Environment Probe

Probe window: `2026-05-23`

### 2.1 Device and platform tooling

```bash
command -v adb || true
adb devices 2>&1 || true
command -v xcrun || true
xcrun simctl list devices 2>&1 || true
command -v eas || true
eas whoami 2>&1 || true
```

Observed result:

```text
/bin/bash: line 2: adb: command not found
/bin/bash: line 4: xcrun: command not found
/bin/bash: line 6: eas: command not found
```

Interpretation:

- No Android Debug Bridge is available in this worker.
- No Apple `xcrun` / simulator or device tooling is available in this worker.
- No globally installed `eas` binary is available in this worker.

### 2.2 Expo account posture

```bash
cd apps/driver-app && npx eas-cli --version
cd apps/driver-app && npx eas-cli whoami
```

Observed result:

```text
eas-cli/19.0.8 linux-x64 node-v22.22.2
Not logged in
```

Interpretation:

- Hosted EAS commands are reproducible via `npx eas-cli`.
- This worker still lacks the Expo account session or `EXPO_TOKEN` needed to
  produce Android/iOS device artifacts.

---

## 3. Canonical Baseline

### 3.1 Existing driver real-device report

`docs/04-uat/driver-mobile-real-device-test-report-20260519.md` already records
the current repo truth:

- `RD-01` install and cold launch: `BLOCKED`
- `RD-08` task-assigned notify: `NOT VERIFIED`
- `RD-10` forwarded task route intent: `BLOCKED` + static evidence
- `RD-12` earnings by platform: static evidence only
- `RD-13` weak-network replay: static evidence only

The same report also states that native push delivery is not proven and that
the current repo session did not attach fresh screenshots, recordings, or
operator notes from physical devices.

### 3.2 Mobile distribution gate

`support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md` remains the
binding external gate for:

- Expo project/account access
- Android signing configuration
- Apple Developer team access
- Internal tester groups
- EAS environment/secret policy
- Release channel ownership
- Install evidence

### 3.3 Repo-local profile and feature anchors

- `apps/driver-app/eas.json` defines `development`,
  `development-simulator`, `preview`, and `production` EAS profiles.
- `apps/driver-app/package.json` and `apps/driver-app/app.json` include
  `expo-dev-client` and `expo-location`.
- No `expo-notifications` dependency is present in `apps/driver-app/package.json`
  or `apps/driver-app/app.json`.
- Location-permission and heartbeat flows are implemented under
  `apps/driver-app/lib/driver-location-heartbeat.ts` and consumed by
  `apps/driver-app/app/trip.tsx`.
- Forwarded-task display anchors exist in
  `apps/driver-app/components/route-display.tsx`,
  `apps/driver-app/app/jobs.tsx`, and `apps/driver-app/app/trip.tsx`.
- Earnings display anchors exist in `apps/driver-app/app/earnings.tsx`.
- Weak-network completion replay anchors exist in
  `apps/driver-app/lib/use-pending-completion-replay.ts`.

These anchors prove implementation posture only. They do not replace Android or
iOS real-device evidence.

---

## 4. Directive Section C Evidence Matrix

| Required evidence item | Current anchor | Status on `2026-05-23` | Missing dependency / unblock condition |
| --- | --- | --- | --- |
| Android install proof | `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` RD-01; `apps/driver-app/eas.json` | `blocked_external` | Physical Android device, signed build artifact, install log, first-launch capture |
| iOS install proof | same as above | `blocked_external` | Physical iPhone or TestFlight-capable tester, install proof, first-launch capture |
| Expo / EAS build profile | `apps/driver-app/eas.json`; `support/sidecars/P1PX-DRV-002/P1PX-DRV-002-EAS-EVIDENCE.md` | `repo_static_only` | Expo login or `EXPO_TOKEN`, plus operator-owned build execution |
| Android signing evidence | `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md` `EXT-003-BLK-002` | `blocked_external` | Keystore/signing owner and signed artifact proof |
| Apple team / TestFlight evidence | `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md` `EXT-003-BLK-003` and `EXT-003-BLK-004` | `blocked_external` | Apple team access, TestFlight or device distribution proof |
| Push notification proof | `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` RD-08 | `blocked_external` | Product decision on native push requirement plus actual delivery capture; current repo does not show `expo-notifications` |
| Location permission proof | `apps/driver-app/lib/driver-location-heartbeat.ts`; `apps/driver-app/app/trip.tsx` | `repo_static_only` | Real-device permission prompt capture with granted state |
| Weak-network proof | `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` RD-13; pending replay hooks | `repo_static_only` | Real-device network-conditioning run with request-id continuity proof |
| Platform online/offline proof | `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` RD-05; platform presence anchors cited there | `repo_static_only` | Real-device toggle capture showing before/after state |
| Forwarded task display proof | `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` RD-10; forwarded-task UI anchors in app sources | `blocked_external` | Seeded or live forwarded task plus device capture |
| Earnings display proof | `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` RD-12; `apps/driver-app/app/earnings.tsx` | `repo_static_only` | Real-device earnings screenshot after task activity |

---

## 5. PII Handling

No screenshots, videos, or chat captures are attached in this session, so there
are no newly filed images that contain driver name or phone PII.

When this packet is resumed, every capture added under this directory must:

- mask driver name
- mask driver phone number
- mask any token, build URL secret, or personal account identifier

Until those captures exist, this packet must remain `blocked_external`.

---

## 6. Resume Gate

This packet can only move from `blocked_external` to a true device-evidence pass
after all of the following are available in one operator-backed session:

1. Physical Android hardware with install permission.
2. Physical iPhone hardware or TestFlight-enabled tester access.
3. Expo account access or CI `EXPO_TOKEN`.
4. Android signing owner and signed artifact provenance.
5. Apple team ownership and TestFlight or equivalent distribution proof.
6. Human-in-the-loop operator to perform install, login, and capture steps.
7. Seeded or live forwarded task data for the driver inbox.
8. Explicit release decision on whether `task_assigned` requires native push
   delivery or whether in-app badge/polling is sufficient.
9. A weak-network test path that can capture retry behavior without exposing
   PII.

Once those dependencies exist, resume the `RD-01` through `RD-13` sequence from
`docs/04-uat/driver-mobile-real-device-test-report-20260519.md` and replace the
matrix rows above with captured evidence.

---

## 7. Directive Section 7 Progress Snapshot

```text
Task ID: PH1GC-DRV-MP-002
Owner: Codex
Reviewer: Claude
Branch: codex/ph1gc-drv-mp-002
PR: not opened in this session
Commit: branch already carried blocked-external anchor e55ed0c8; this refresh keeps the packet aligned to current machine truth, replays the 11 directive §C placeholder files plus README/closeout structure onto the assigned branch, and preserves the blocked_external conclusion
Files changed: support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/{README.md,01-android-install-proof.md,02-ios-install-proof.md,03-expo-eas-build-profile.md,04-android-signing-evidence.md,05-apple-team-testflight-evidence.md,06-push-notification-proof.md,07-location-permission-proof.md,08-weak-network-proof.md,09-platform-online-offline-proof.md,10-forwarded-task-display-proof.md,11-earnings-display-proof.md,PH1GC-DRV-MP-002-CLOSEOUT-20260522.md,PH1GC-DRV-MP-002-CLOSEOUT-20260523.md,WF-DRV-MP-001-DEVICE-EVIDENCE-PACKET.md}
Verification commands: command -v adb || true; adb devices 2>&1 || true; command -v xcrun || true; xcrun simctl list devices 2>&1 || true; command -v eas || true; eas whoami 2>&1 || true; cd apps/driver-app && npx eas-cli --version && npx eas-cli whoami; find support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE -maxdepth 1 -type f | sort; git diff --check -- support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE
Evidence artifact: support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/
Workflow family affected: WF-DRV-MP-001
Gate read before: support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/ was missing on origin/dev; existing driver real-device report remained provisional and external-gated
Gate read after: this task branch now carries the missing sidecar path plus README, all 11 directive §C placeholder files, and blocked-state closeout reports, but the packet remains blocked_external and does not uplift WF-DRV-MP-001 to PASS
Remaining non-claim: no Android install proof, iOS/TestFlight proof, native push delivery proof, location-grant capture, weak-network replay capture, online/offline capture, forwarded-task live capture, or earnings live capture was collected in this session
External dependencies, if any: Android hardware, iPhone/TestFlight access, Expo login or EXPO_TOKEN, Android signing, Apple team access, tester group ownership, forwarded-task seed/live data, human operator, weak-network test setup
```

---

## 8. Machine-Truth Note

Canonical machine truth for `PH1GC-DRV-MP-002` lives at:

`/home/edna/workspace/drts-fleet-platform/ai-status.json`

As of this packet draft on `2026-05-23`, that file records `owner=Codex`,
`reviewer=Claude`, and `status=in_progress`. `current-work.md` still lags and
must not be treated as machine truth.

This packet is a dated evidence snapshot. It is not the authoritative source for
owner, reviewer, or task lifecycle state, and it must not be read as a `done`
claim while the external dependencies above remain unresolved.
