# Driver App E2E Test Suite (Maestro)

This directory contains End-to-End (E2E) test flows for `@drts/driver-app` running on Android native emulators and devices.

## Requirements

- Android SDK with emulator support (`$ANDROID_HOME`)
- KVM / Hardware acceleration (`/dev/kvm`)
- Maestro CLI (`maestro`)

## Test Flows

- `sos-offline-replay.yaml`: Verifies offline SOS event capture into Expo SecureStore durable outbox (`drts.driver.sos.activeCase`) via 2-second long press (`longPressOn`) during flight mode, automatic replay upon network restoration, idempotency check (no duplicate incident creation), and restart resume behavior.

## Execution

```bash
# Run against active Android emulator
maestro test apps/driver-app/e2e/sos-offline-replay.yaml
```
