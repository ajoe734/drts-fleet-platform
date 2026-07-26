# Driver App E2E Test Suite (Maestro)

This directory contains End-to-End (E2E) test flows for `@drts/driver-app` running on Android native emulators and devices.

## Requirements

- Android SDK with emulator support (`$ANDROID_HOME`, e.g. `/home/edna/Android/Sdk`)
- KVM / Hardware acceleration (`/dev/kvm`)
- Maestro CLI (`maestro`, located at `~/.antigravity2-home/.maestro/bin/maestro` or `~/.maestro/bin/maestro`)

## Navigation & Unprovisioned Access Contract

- Emergency SOS screen (`/sos`) is registered under `allowUnprovisionedDriverRoute` in `apps/driver-app/lib/driver-identity-routing.ts`.
- Unprovisioned devices and non-onboarded drivers can navigate to `/sos` directly using deep link `drts-driver://sos` or tapping "安全求援" from the onboarding screen without getting redirected.

## Test Flows

- `sos-offline-replay.yaml`:
  1. Opens `/sos` via `drts-driver://sos` and asserts visibility of `sos-confirm-button`.
  2. Enables flight mode (`setAirplaneMode: enabled`).
  3. Triggers SOS emergency event via mandatory 2-second long press (`longPressOn`, duration: 2500ms) on `sos-confirm-button`.
  4. Verifies local SecureStore durable outbox state (`drts.driver.sos.activeCase`).
  5. Disables flight mode (`setAirplaneMode: disabled`).
  6. Waits for automatic outbox replay (`POST /api/driver/sos-events`) and backend receipt confirmation.
  7. Restarts application, re-navigates to `/sos`, and asserts state persistence & resume (`syncState=submitted`).

## Execution

```bash
# Option 1: Monorepo command (automatically sets PATH for maestro & Android SDK)
pnpm test:e2e:driver-sos

# Option 2: Package command inside apps/driver-app
pnpm --filter @drts/driver-app test:e2e:sos

# Option 3: Shell runner
bash apps/driver-app/e2e/run-e2e.sh

# Option 4: Direct Maestro command
maestro test apps/driver-app/e2e/sos-offline-replay.yaml
```
