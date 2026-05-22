# WF-DRV-MP-001 Device Evidence Packet

**Task lineage:** `WF-DRV-MP-001-DEVICE-EVIDENCE` -> `PH1GC-DRV-MP-002`  
**Packet status:** `blocked_external`  
**Last reviewed:** `2026-05-22`  
**Required output path:** `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/`

## Purpose

This directory is the canonical landing zone for directive `§C DRV-MP-002`.
It now exists on disk, but it does **not** contain a real-device pass. It
records the 11 required evidence items, the current repo-visible anchors, and
the external prerequisites that still block collection from this workspace.

The current truthful read is:

- `WF-DRV-MP-001` is still limited to sandbox/static evidence.
- Native Android+iPhone evidence is still missing.
- No item in this directory may be read as a completed proof artifact until the
  external prerequisites are available and fresh masked captures/logs are
  attached.

## External prerequisites

All 11 items remain blocked on some combination of:

- physical Android device
- physical iPhone device
- Expo/EAS build access
- Android signing access
- Apple team / TestFlight access
- weak-network test environment
- human-in-loop operator authorized to collect masked artifacts

See also:

- `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
- `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`
- `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`
- `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-PLANNING-DECISION.md`

## PII masking rule

Every future screenshot, screen recording, install log, notification capture,
or backend trace added here must mask driver name and phone number before the
task can move beyond `blocked_external`.

## Evidence index

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

## Resume rule

When the external bundle lands, replace the placeholder state in each file with
real artifacts, keep the filenames stable, and then uplift the matrix gate read
for `WF-DRV-MP-001` from `PASS (sandbox only)` to
`PASS (sandbox + device evidence)`.
