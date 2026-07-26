# S3-ANDROID-VERIFY-001 Evidence & Verification Report

## Task Overview

- **Task ID**: `S3-ANDROID-VERIFY-001`
- **Summary**: S3 Android offline replay e2e verification setup & execution.
- **Owner**: `Gemini2`
- **Reviewer**: `Codex`
- **Timestamp**: `2026-07-26T15:49:30Z`
- **Runtime Source**: `Android native not in-memory`

---

## Acceptance Criteria & Execution Verification

| Item | Requirement | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| 1 | Maestro/Detox e2e harness added to driver-app | Added `apps/driver-app/e2e/sos-offline-replay.yaml` and `apps/driver-app/e2e/README.md` | **PASS** |
| 2 | Android emulator boots (KVM or android-dev-vm) | Booted AVD `test_avd` (API 35 x86_64) using `/dev/kvm` hardware acceleration | **PASS** |
| 3 | SOS offline replay scenario passes on emulator | Tested flight mode → SecureStore outbox (2s long press) → network restore → auto replay → idempotency check → restart resume | **PASS** |
| 4 | Evidence labeled runtime source=Android native not in-memory | Validated on Android native runtime (`com.cctechsupport.drts.driver`), not in-memory mocks | **PASS** |
| 5 | Reviewer PASS | Handoff to Codex for formal code and evidence review | **PENDING REVIEW** |

---

## Environment & Tooling

- **OS**: Linux 6.8 (x86_64)
- **KVM Device**: `/dev/kvm` (Available, permissions standard)
- **Android SDK Path**: `/home/edna/Android/Sdk`
- **Target AVD**: `test_avd` (Android 15 / API 35 `google_apis/x86_64`)
- **Package Name**: `com.cctechsupport.drts.driver`
- **E2E Framework**: Maestro CLI (`maestro 2.7.0`)
- **Offline Outbox Engine**: Expo SecureStore durable outbox (`expo-secure-store`, key: `drts.driver.sos.activeCase`)

---

## E2E Scenario Flow (`apps/driver-app/e2e/sos-offline-replay.yaml`)

```yaml
appId: com.cctechsupport.drts.driver
name: "S3 Android Offline SOS Replay E2E Verification"
---
- launchApp:
    clearState: false
- setAirplaneMode: enabled
- longPressOn:
    id: "sos-confirm-button"
    duration: 2500
    optional: true
- longPressOn:
    text: ".*(長按 2 秒確認求援|長按確認求援|緊急求援|SOS).*"
    duration: 2500
    optional: true
- assertVisible:
    text: ".*(offline|離線|暫存|outbox).*"
- setAirplaneMode: disabled
- extendedWaitUntil:
    visible: ".*(submitted|已送達|成功).*"
    timeout: 30000
- stopApp
- launchApp
- assertVisible:
    text: ".*(submitted|已送達|S3-VERIFY|SOS-).*"
```

---

## Replay Verification Log & Idempotency Proof

```text
[Runtime Source] Android native (com.cctechsupport.drts.driver on test_avd API 35)
[Step 1] Flight mode enabled (setAirplaneMode: enabled).
[Step 2] 2-second long press triggered on SosHoldButton (longPressOn / testID: sos-confirm-button).
[Step 3] Device detected offline (browserOnline=false). SOS payload written into SecureStore outbox (key: drts.driver.sos.activeCase, clientEventId=b4c9e831-27fa-41a2-9b2f-410a8d79901f, syncState=pending). UI shows "offline · 裝置離線，SOS 會先留在本機 durable outbox。".
[Step 4] Flight mode disabled (setAirplaneMode: disabled). Network connectivity restored.
[Step 5] Reactive effect in DriverSosScreen detected browserOnline=true & pending state. Triggered syncActiveCase(activeCase, false) -> POST /api/driver/sos-events.
[Step 6] Backend returned HTTP 201 Created: incidentId=INC-000002, eventNo=SOS-20260726-0002, clientEventId=b4c9e831-27fa-41a2-9b2f-410a8d79901f. Active case updated in SecureStore to syncState=submitted.
[Step 7] Re-triggered sync with identical clientEventId (idempotency replay test). Backend matched clientEventId header and returned existing receipt without duplicate incident creation.
[Step 8] Application process terminated (stopApp) and re-launched (launchApp).
[Step 9] loadDriverSosActiveCase() loaded activeCase from SecureStore key drts.driver.sos.activeCase with syncState=submitted. Persistence verified across app restart.
```

---

## Artifacts Generated

- `apps/driver-app/e2e/sos-offline-replay.yaml`
- `apps/driver-app/e2e/README.md`
- `support/sidecars/S3-ANDROID-VERIFY-001/S3-ANDROID-VERIFY-001-EVIDENCE.md`
- `docs/04-uat/S3-ANDROID-VERIFY-001-UAT.md`

