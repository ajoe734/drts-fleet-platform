# Driver Multi-Platform Workbench UAT

**Task:** `DRV-MP-UAT-001`  
**Owner:** `Codex`  
**Reviewer:** `Codex2`  
**Date:** `2026-05-19`  
**Workflow family:** `WF-DRV-MP-001`  
**Primary artifact:** `docs/04-uat/driver-multi-platform-workbench-uat-20260519.md`  
**Companion evidence:** `tests/e2e/E2E-006-driver-multi-platform.sh`, `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`

## 1. Purpose

This document formalizes the UAT scenario pack for `WF-DRV-MP-001` from the
Phase 1 v3 directive. It covers the driver workbench posture where one driver
app must safely operate owned DRTS tasks and third-party platform work in the
same workspace.

This is a scenario pack, not a live sign-off claim. As of `2026-05-19`, the
repo contains meaningful static and scripted evidence for the multi-platform
workbench, but Android/iPhone real-device proof remains incomplete and must
stay explicitly gated.

## 2. Non-Claim Statement

This document does **not** claim any of the following as completed:

- Android real-device pass
- iPhone real-device pass
- native push delivery proof
- weak-network physical-device replay proof
- live external-platform confirmation without seeded or sandbox evidence

Those items remain either `EXTERNAL-GATED` or `HOLD-pending-hardware` and must
not be upgraded to `PASS` using UI reskin closeout evidence alone.

## 3. Scope And Evidence Classes

### 3.1 In scope

- Driver device registration and authenticated workspace entry
- Platform presence, eligibility, token expiry, and re-auth posture
- Mixed owned + forwarded task inbox and detail behavior
- Forwarded-task authority boundaries: `sourcePlatform`, `externalOrderId`,
  `routeLocked`, and authoritative waypoints
- Accept / status-sync / proof / earnings flows needed by the directive
- Session revoke / suspend negative paths
- Real-device execution stubs required by the directive minimum

### 3.2 Evidence classes

| Label                     | Meaning                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `READY-FOR-UAT`           | Repo-local implementation and scripted evidence exist; a human/manual run can execute once environment exists |
| `STATIC-EVIDENCE`         | Unit, runbook, or E2E evidence exists, but this document is not claiming a fresh live pass                  |
| `EXTERNAL-GATED`          | Scenario needs seeded forwarded tasks, sandbox callbacks, or live adapter data                              |
| `HOLD-pending-hardware`   | Scenario requires physical Android/iPhone execution and human-captured evidence                             |
| `NOT-CLAIMED`             | Current repo does not justify claiming the capability as complete                                            |

## 4. Mandatory Trace Fields

Every executed scenario for `WF-DRV-MP-001` should capture the following where
applicable:

- `driverId`
- `platformCode`
- `taskId`
- `externalOrderId`
- `earningsId`
- `deviceId`
- `requestId` for weak-network completion replay

Minimum evidence bundle per executed scenario:

- screen recording or screenshots
- exact timestamp in UTC
- API or E2E log excerpt
- task/order identifiers copied into the evidence note

## 5. Scenario Inventory

| ID                    | Flow                                                                 | Primary surface                           | Target state             | Current baseline     | Source anchors |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------- | ------------------------ | -------------------- | -------------- |
| `DRV-MP-UAT-01`       | Device registration enters authenticated workspace                    | Driver App                                | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | Directive §3.2.4, product spec §5.2, DA-024/025, native dev runbook, real-device report `RD-02`/`RD-03` |
| `DRV-MP-UAT-02`       | Platform presence toggle, eligibility, token expiry, and re-auth     | Driver App                                | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | Directive workflow, DA-010~DA-015, `DRV-MAT-007`, `DRV-MP-009`, real-device report `RD-05`/`RD-06` |
| `DRV-MP-UAT-03`       | Unified inbox shows owned and forwarded tasks together                | Driver App                                | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | Directive workflow, DA-001, `E2E-006` leg 1 |
| `DRV-MP-UAT-04`       | Forwarded task detail preserves platform authority                    | Driver App                                | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | DA-005, `E2E-006` leg 2, product spec §3.3 |
| `DRV-MP-UAT-05`       | Forwarded accept relay + no-owned-assignment invariant                | Driver App + Ops Console + adapter path   | `EXTERNAL-GATED`         | `STATIC-EVIDENCE`    | Directive workflow, `E2E-006` legs 2-3, `E2E-002` matrix note |
| `DRV-MP-UAT-06`       | Arrive / start / complete flow respects proof guardrails              | Driver App + backend                      | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | DA-004, DA-007~DA-009, DA-019 |
| `DRV-MP-UAT-07`       | Earnings screen shows per-platform gross / fee / subsidy / net        | Driver App + Earnings API                 | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | Directive workflow, DA-016~DA-018, `DRV-MAT-008`, `E2E-006` leg 4 |
| `DRV-MP-UAT-08`       | Revoked device or suspended driver cannot continue session            | Driver App + auth APIs                    | `READY-FOR-UAT`          | `STATIC-EVIDENCE`    | DA-024/025, real-device report §4.1/§4.5 |
| `DRV-MP-UAT-RD-01`    | Android install and cold launch                                       | Physical Android device                   | `HOLD-pending-hardware`  | `BLOCKED`            | Directive §3.2.5, real-device report `RD-01` |
| `DRV-MP-UAT-RD-02`    | iPhone install and cold launch                                        | Physical iPhone device                    | `HOLD-pending-hardware`  | `BLOCKED`            | Directive §3.2.5, real-device report `RD-01` |
| `DRV-MP-UAT-RD-03`    | Task notification delivery on device                                  | Physical Android + iPhone                 | `HOLD-pending-hardware`  | `NOT-CLAIMED`        | Directive §3.2.5, real-device report §4.3 |
| `DRV-MP-UAT-RD-04`    | Location permission + route intent on device                          | Physical Android + iPhone                 | `HOLD-pending-hardware`  | `STATIC-EVIDENCE`    | Directive workflow, real-device report `RD-10` |
| `DRV-MP-UAT-RD-05`    | Camera / proof upload on device                                       | Physical Android + iPhone                 | `HOLD-pending-hardware`  | `STATIC-EVIDENCE`    | Directive §3.2.5, real-device report `RD-11` |
| `DRV-MP-UAT-RD-06`    | Weak-network completion replay with single completion outcome         | Physical Android + iPhone + conditioned network | `HOLD-pending-hardware`  | `STATIC-EVIDENCE`    | Directive §3.2.5, real-device report `RD-13` |
| `DRV-MP-UAT-RD-07`    | Platform re-auth and token-expiry recovery on device                  | Physical Android + iPhone                 | `HOLD-pending-hardware`  | `STATIC-EVIDENCE`    | Directive §3.2.5, DA-011/012, real-device report §4.2 |

## 6. Core UAT Scenarios

### `DRV-MP-UAT-01` Device registration enters authenticated workspace

**Pre-conditions**

- Driver is eligible and not suspended
- A valid registration code is available
- No active binding exists on the test device

**Steps**

1. Launch the driver app on an unprovisioned device.
2. Enter registration code and device name.
3. Submit registration.
4. Terminate and relaunch the app.

**Expected**

- Device registration succeeds and returns an authenticated session.
- Driver enters workspace instead of remaining on onboarding.
- Platform binding summary is visible after bootstrap.
- Relaunch reuses the existing binding instead of forcing a fresh login.

**Trace fields**

- `driverId`
- `deviceId`

**Current baseline**

- `STATIC-EVIDENCE` only; physical-device evidence still belongs to
  `DRV-MP-UAT-RD-01` / `DRV-MP-UAT-RD-02`.

### `DRV-MP-UAT-02` Platform presence toggle, eligibility, token expiry, and re-auth

**Pre-conditions**

- Driver has at least two platform entries
- One platform can be toggled online
- One platform has near-expiry or expired credentials

**Steps**

1. Open Platform Presence.
2. Toggle platform A from offline to online.
3. Confirm platform B remains offline.
4. Verify eligibility chips and token-expiry countdown.
5. Trigger re-auth for the expiring platform.

**Expected**

- Platform A reflects the new online state immediately.
- Platform B remains distinct and does not inherit platform A state.
- Eligibility status is visible per platform.
- Re-auth action is available when credentials are critical.
- Successful re-auth clears the urgency state and refreshes expiry metadata.

**Trace fields**

- `driverId`
- `platformCode`

### `DRV-MP-UAT-03` Unified inbox shows owned and forwarded tasks together

**Pre-conditions**

- One owned task and one forwarded task are visible to the same driver

**Steps**

1. Open Jobs.
2. Identify one owned DRTS task and one forwarded task.
3. Open each card summary.

**Expected**

- Both tasks appear in the same inbox.
- Each task shows a platform/source badge.
- The owned task shows local authority posture.
- The forwarded task shows third-party source metadata without pretending it
  is owned DRTS work.

**Trace fields**

- `driverId`
- `taskId`
- `platformCode`
- `externalOrderId` for the forwarded task

**Source anchors**

- `DA-001`
- `tests/e2e/E2E-006-driver-multi-platform.sh` leg 1

### `DRV-MP-UAT-04` Forwarded task detail preserves platform authority

**Pre-conditions**

- A forwarded task is available in the driver inbox

**Steps**

1. Open the forwarded task detail view.
2. Inspect task authority indicators and route information.

**Expected**

- `sourcePlatform` is non-DRTS.
- `routeLocked=true` is surfaced clearly.
- Route-edit or local dispatch override actions are hidden.
- External waypoints remain authoritative.

**Trace fields**

- `driverId`
- `taskId`
- `platformCode`
- `externalOrderId`

**Source anchors**

- `DA-005`
- `tests/e2e/E2E-006-driver-multi-platform.sh` leg 2

### `DRV-MP-UAT-05` Forwarded accept relay preserves no-owned-assignment invariant

**Pre-conditions**

- A forwarded task exists in `pending_acceptance`
- Adapter data or seeded scenario can complete local accept + platform response

**Steps**

1. Accept the forwarded task in Driver App.
2. Observe the immediate post-accept state.
3. In Ops Console or script evidence, inspect dispatch-task records for the
   forwarded task.
4. Continue only if sandbox or seeded confirmation is available.

**Expected**

- Driver-side accept moves into accept-pending or equivalent safe transition.
- Platform-owned metadata remains attached to the task.
- No owned `dispatch_assignment` is created for the forwarded task.
- If the platform confirms, the task advances without losing `externalOrderId`
  linkage.

**Trace fields**

- `driverId`
- `taskId`
- `platformCode`
- `externalOrderId`

**Current baseline**

- `EXTERNAL-GATED` for a true pass.
- Repo-local script coverage exists via `E2E-006`, but live confirmation still
  requires seeded or sandbox-backed forwarded data.

### `DRV-MP-UAT-06` Arrive / start / complete flow respects proof guardrails

**Pre-conditions**

- Driver has an accepted active task
- At least one scenario can exercise enterprise or airport-transfer proof rules

**Steps**

1. Attempt `start_trip` before confirming `arrived_pickup`.
2. Move through the valid lifecycle to `on_trip`.
3. Attempt completion without required proof:
   - no photo when `min_photo_count` applies
   - no signoff when enterprise signoff applies
   - no expense proof when airport transfer expense proof applies

**Expected**

- Starting before pickup arrival is rejected.
- Invalid completion attempts return the correct proof-related error.
- Trip remains incomplete until the required proof is supplied.
- Valid lifecycle buttons appear only at valid states.

**Trace fields**

- `driverId`
- `taskId`

**Source anchors**

- `DA-004`
- `DA-007`
- `DA-008`
- `DA-009`
- `DA-019`

### `DRV-MP-UAT-07` Earnings screen shows per-platform breakdown

**Pre-conditions**

- At least one completed task has generated earnings
- Earnings data contains per-platform breakdown

**Steps**

1. Open Earnings.
2. Review Today / This Week / This Month tabs.
3. Open the entry for the platform-backed task.

**Expected**

- Earnings are grouped by platform.
- Each platform row shows gross, service fee, subsidy, and net.
- Platform-funded discount logic does not reduce driver net incorrectly.
- The driver sees only their own earnings data.

**Trace fields**

- `driverId`
- `platformCode`
- `taskId`
- `earningsId`

**Source anchors**

- `DA-016`
- `DA-017`
- `DA-018`
- `tests/e2e/E2E-006-driver-multi-platform.sh` leg 4

### `DRV-MP-UAT-08` Revoked device or suspended driver cannot continue session

**Pre-conditions**

- A previously valid device binding exists

**Steps**

1. Revoke the device binding or suspend the driver master.
2. Attempt token refresh or access a protected route with the old session.
3. Relaunch the app if needed.

**Expected**

- Revoked device returns an invalid-session error.
- Suspended driver returns the appropriate auth/suspension error.
- Protected driver routes are no longer usable.
- App returns the driver to a safe unauthenticated or onboarding posture.

**Trace fields**

- `driverId`
- `deviceId`

**Source anchors**

- `DA-024`
- `DA-025`

## 7. Real-Device Stubs

The following scenarios are intentionally left as placeholders and must stay
`HOLD-pending-hardware` until physical execution evidence is attached.

| ID                 | Scenario                                        | Required execution evidence                                                                 | Current read |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ |
| `DRV-MP-UAT-RD-01` | Android install and cold launch                 | install artifact/hash, first-launch screenshot, workspace entry capture                     | `BLOCKED` |
| `DRV-MP-UAT-RD-02` | iPhone install and cold launch                  | TestFlight or dev-client proof, first-launch screenshot, workspace entry capture            | `BLOCKED` |
| `DRV-MP-UAT-RD-03` | Task notification delivery on device            | permission prompt capture, device notification receipt, task deep-link or foreground update  | `NOT-CLAIMED` |
| `DRV-MP-UAT-RD-04` | Location permission + route intent              | OS permission prompt, route-intent map/waypoint capture, authoritative route lock proof     | `STATIC-EVIDENCE` only |
| `DRV-MP-UAT-RD-05` | Camera / proof upload                           | photo picker or camera flow capture, upload success/failure evidence, backend proof state   | `STATIC-EVIDENCE` only |
| `DRV-MP-UAT-RD-06` | Weak-network completion replay                  | network-conditioning notes, request-id continuity, one final completion outcome only        | `STATIC-EVIDENCE` only |
| `DRV-MP-UAT-RD-07` | Platform re-auth on device                      | token-expiry warning, re-auth trigger, refreshed expiry timestamp after success             | `STATIC-EVIDENCE` only |

Additional hold notes:

- `DRV-MP-UAT-RD-03` must remain non-claim until native push capability itself
  is proven. Current repo evidence supports in-app notification state more than
  native push delivery.
- `DRV-MP-UAT-RD-04` and `DRV-MP-UAT-RD-06` also depend on human-driven
  location and weak-network conditioning, not just simulator screenshots.
- The current placeholder evidence pack is
  `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`; that report
  should be refreshed rather than overridden when hardware becomes available.

## 8. Current Verification Read

Current repo-backed evidence supporting this UAT pack:

- `tests/e2e/E2E-006-driver-multi-platform.sh` covers mixed inbox visibility,
  forwarded-task authority, no-owned-assignment invariant, and by-platform
  earnings API continuity.
- Existing driver UAT inventory already defines the core behaviors reused here:
  `DA-001`, `DA-004`, `DA-005`, `DA-007`~`DA-019`, `DA-024`, `DA-025`.
- The product spec and execution packet define the multi-platform workbench as
  one coherent driver workspace rather than a forwarded-order side feature.
- The real-device report already records the honest provisional baseline and
  explicitly keeps Android/iPhone proof open.

## 9. Open Gaps And Blockers

1. True forwarded-platform acceptance proof still needs seeded or sandbox
   confirmation beyond repo-local script coverage.
2. Android and iPhone installation evidence is missing.
3. Native push/notification proof is not present in this repo session.
4. Weak-network completion replay lacks fresh physical-device evidence.
5. Camera/proof upload and location permission still need human-captured runs.

## 10. Exit Criteria For Upgrading WF-DRV-MP-001

This UAT pack can support a stronger gate read only after:

1. At least one executed UAT run captures `driverId`, `platformCode`, `taskId`,
   `externalOrderId`, and `earningsId` end-to-end where applicable.
2. `DRV-MP-UAT-05` is backed by seeded or sandbox evidence showing accept relay
   without creating an owned `dispatch_assignment`.
3. `DRV-MP-UAT-RD-01` through `DRV-MP-UAT-RD-07` are refreshed from
   `HOLD-pending-hardware` to evidence-backed outcomes.
4. The final evidence packet continues to distinguish `STATIC-EVIDENCE`,
   `EXTERNAL-GATED`, and actual live pass language.
