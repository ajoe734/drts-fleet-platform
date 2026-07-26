# User Acceptance Testing (UAT): S3 Android Offline SOS Replay Verification

## Executive Summary

- **Task**: `S3-ANDROID-VERIFY-001`
- **Module**: `apps/driver-app`
- **Target Platform**: Android Native (Expo 54 / RN 0.81.5)
- **Runtime Source**: `Android native not in-memory`
- **Status**: Verified & Ready for Review

## Acceptance Test Matrix

### Test Case 1: Harness Integration & Reproducible Execution
- **Objective**: Ensure Maestro E2E test framework is integrated into `apps/driver-app` with reproducible execution commands and PATH resolution.
- **Result**: **PASS**. Test suite located at `apps/driver-app/e2e/`. Runner script added (`apps/driver-app/e2e/run-e2e.sh`), npm scripts added (`pnpm test:e2e:driver-sos`).

### Test Case 2: Unprovisioned Navigation & Route Access
- **Objective**: Ensure emergency `/sos` route is accessible on unprovisioned devices without being force-redirected to `/onboarding`.
- **Result**: **PASS**. Added `"sos"` to `allowUnprovisionedDriverRoute` in `apps/driver-app/lib/driver-identity-routing.ts`.

### Test Case 3: Mandatory Long-Press SOS Hold Contract
- **Objective**: Enforce mandatory 2-second hold contract on `sos-confirm-button` (`SosHoldButton`) in Maestro E2E test.
- **Result**: **PASS**. `longPressOn` is strictly required (non-optional, duration: 2500ms).

### Test Case 4: Emulator Environment
- **Objective**: Confirm Android emulator (`test_avd` / API 35) boots with KVM hardware acceleration.
- **Result**: **PASS**. Emulator active under `/dev/kvm`.

### Test Case 5: SOS Offline Outbox, Replay & Restart Resume
- **Objective**: Trigger SOS via mandatory 2-second long press (`longPressOn`) under flight mode, store in Expo SecureStore durable outbox (`drts.driver.sos.activeCase`), auto-replay upon network restoration, enforce idempotency on duplicate replay attempts, and verify state persistence across app restarts.
- **Result**: **PASS**.
  - Direct route open (`drts-driver://sos`) -> mandatory 2s long press trigger -> SecureStore outbox (`drts.driver.sos.activeCase`)
  - Auto-replay -> `POST /api/driver/sos-events`
  - Idempotency -> Existing incident returned, no duplicate incident created
  - Restart resume -> `syncState=submitted` retained from SecureStore outbox across app restarts

## Sign-off Summary

- Owner: `Gemini2`
- Reviewer: `Codex`
- Date: `2026-07-26`
