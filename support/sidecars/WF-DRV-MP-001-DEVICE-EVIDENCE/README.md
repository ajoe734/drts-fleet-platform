# WF-DRV-MP-001 Device Evidence Packet

**Directive output:** `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/`
**Current owner task:** `PH1GC-DRV-MP-002`
**Task lineage:** `WF-DRV-MP-001-DEVICE-EVIDENCE` -> `PH1GC-DRV-MP-002`
**Packet status:** `blocked_external`
**Last reviewed:** `2026-05-26`

## 1. Executive summary

This directory is the canonical landing zone for directive `§C DRV-MP-002`.
The directory now exists on the `codex2/ph1gc-drv-mp-002` task branch with all
11 required evidence-item placeholders, but it still does **not** prove a
real-device pass.

For directive `§7` closeout wording of the current blocked state, see
`PH1GC-DRV-MP-002-CLOSEOUT-20260526.md`.
The current truthful read is:

- `WF-DRV-MP-001` still has only sandbox/static proof on `origin/dev`.
- `PH1GC-DRV-MP-002` cannot move to `done` until fresh masked Android+iPhone
  captures are attached here.
- The correct machine-truth posture is `blocked` / `blocked_external`, not
  `done`.
- `PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR` removed branch-history ambiguity
  only; it did not supply any new device or distribution evidence.

## 2. Current repo state

At review time (`origin/dev@aec9e8d7a6254123749f8b075a78bb5c60655131`):

- this directory exists on the task branch as the required canonical path
- `origin/dev` does not yet contain this sidecar directory
- each file in this packet truthfully remains `blocked_external`
- `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` remains the
  main repo-visible hold report for the earlier `WF-DRV-MP-001-DEVICE-EVIDENCE`
  task lineage

This means the path gap is closed on the branch, but the evidence gap is not.

## 3. External prerequisites

All 11 items remain blocked on some combination of:

- physical Android device
- physical iPhone device
- Expo/EAS build access
- Android signing access
- Apple team / TestFlight access
- weak-network test environment
- human-in-loop operator authorized to collect masked artifacts

Related blockers and planning records:

- `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
- `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`
- `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`
- `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-PLANNING-DECISION.md`

## 4. PII masking rule

Every future screenshot, screen recording, install log, notification capture,
or backend trace added here must mask driver name and phone number before
`PH1GC-DRV-MP-002` can move beyond `blocked_external`.

## 5. Evidence index

| # | Required item | Current state | File |
| --- | --- | --- | --- |
| 1 | Android install proof | `blocked_external` | `01-android-install-proof.md` |
| 2 | iOS install proof | `blocked_external` | `02-ios-install-proof.md` |
| 3 | Expo/EAS build profile | `blocked_external` | `03-expo-eas-build-profile.md` |
| 4 | Android signing evidence | `blocked_external` | `04-android-signing-evidence.md` |
| 5 | Apple team / TestFlight evidence | `blocked_external` | `05-apple-team-testflight-evidence.md` |
| 6 | Push notification proof | `blocked_external` | `06-push-notification-proof.md` |
| 7 | Location permission proof | `blocked_external` | `07-location-permission-proof.md` |
| 8 | Weak network proof | `blocked_external` | `08-weak-network-proof.md` |
| 9 | Platform online/offline proof | `blocked_external` | `09-platform-online-offline-proof.md` |
| 10 | Forwarded task display proof | `blocked_external` | `10-forwarded-task-display-proof.md` |
| 11 | Earnings display proof | `blocked_external` | `11-earnings-display-proof.md` |

Closeout report:

- `PH1GC-DRV-MP-002-CLOSEOUT-20260522.md` — historical blocked-external closeout
- `PH1GC-DRV-MP-002-CLOSEOUT-20260523.md` — post-unblock revalidation closeout
- `PH1GC-DRV-MP-002-CLOSEOUT-20260524.md` — post-history-repair revalidation closeout
- `PH1GC-DRV-MP-002-CLOSEOUT-20260525.md` — post-machine-truth revalidation closeout
- `PH1GC-DRV-MP-002-CLOSEOUT-20260526.md` — latest blocked-external revalidation closeout
## 6. Resume sequence

Once the external bundle lands:

1. Confirm `PH1GC-DRV-MP-001` remains the active baseline for seeded
   forwarded-task and earnings behavior.
2. Replace the placeholder state in each file with real masked artifacts while
   keeping filenames stable.
3. Verify Android install + signing, iOS install + TestFlight, push
   notification delivery, location permission grant, weak-network retry,
   platform online/offline, forwarded task display, and earnings display.
4. Uplift `WF-DRV-MP-001` from `PASS (sandbox only)` to
   `PASS (sandbox + device evidence)`.

## 7. Closeout gate for `PH1GC-DRV-MP-002`

This packet does **not** authorize `done`.

Allowed closeout wording while external inputs are still absent:

- "`PH1GC-DRV-MP-002` created the required sidecar path and 11 directive `§C`
  evidence-item placeholders."
- "The task remains `blocked_external` on device/distribution prerequisites."
- "Do not claim Android/iPhone real-device PASS, native push proof, or location
  permission proof without fresh masked captures."
