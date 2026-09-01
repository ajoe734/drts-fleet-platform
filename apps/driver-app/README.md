# Driver App

Expo Router + React Native driver surface for onboarding, jobs, trip
lifecycle, incident handling, earnings, and settings.

Implemented / materially wired screens include:

- `/onboarding`
- `/jobs`
- `/trip`
- `/earnings`
- `/settings`

This app is the active Phase 1 driver surface, not a placeholder shell.

## Driver Identity Requirement

Driver identity comes from **device registration**. The driver enters a
registration code on the onboarding screen, the backend issues a device-bound
session, and the app stores it in SecureStore under `drts.driver.session`. That
session — refreshed automatically on launch and on foreground — is the only
identity source in production builds. There is no silent demo fallback.

Logging out revokes the binding and deletes `drts.driver.session` **only**. The
device registration id (`drts.driver.deviceId`) and every pending queue
(task-completion proof, safety requests, tracking marker, offline location
events) are deliberately preserved so a logout never
destroys un-submitted work.

| Variable                | Purpose                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`   | Explicit direct API origin for the selected environment tier (required)              |
| `EXPO_PUBLIC_DRIVER_ID` | **Local development override only.** Ignored in release builds (`__DEV__ === false`) |

`EXPO_PUBLIC_DRIVER_ID` bypasses device registration and is a convenience for
running against a local API. It is gated on `__DEV__`, so a production build
never reads it and never asks anyone to set it. Do not use it as the identity
source for internal test builds — register the device instead.

Example local dev invocation:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001 \
pnpm --filter @drts/driver-app dev:client
```

Production path: device-bound auth token from the backend identity handoff
flow. See the runbook §Production Identity Handoff.

## Native Dev Flow

The app ships as a native Android / iOS app. It includes:

- Expo native app config in [app.json](./app.json)
- EAS build profiles in [eas.json](./eas.json)
- `expo-dev-client` for installable development builds

Useful commands:

- `pnpm --filter @drts/driver-app dev`
- `pnpm --filter @drts/driver-app dev:client`
- `pnpm --filter @drts/driver-app android`
- `pnpm --filter @drts/driver-app ios`
- `pnpm --filter @drts/driver-app build:android:development`
- `cd apps/driver-app && npx eas-cli@21.4.0 build --platform android --profile preview`
- `.github/workflows/build-driver-ios.yml` for guarded hosted iOS builds

Hosted EAS builds use `npx eas-cli@21.4.0`; the repo does not vendor `eas-cli`
as a workspace dependency.

### iOS quickstart on a Mac

The native `ios/` project is committed, so a fresh clone does not need
`expo prebuild`. The Simulator path requires Xcode but does not require an
Apple Developer membership:

```bash
pnpm install
EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
pnpm --filter @drts/driver-app ios
```

Complete device registration in the app itself; the dev-only
`EXPO_PUBLIC_DRIVER_ID` override is not required and has no effect outside a
development bundle.

Always select an explicit direct API origin. The current dev operator target is
`https://drts-dev-api-4t7rg6fmeq-uc.a.run.app`; do not point the app at an
IAP-protected control-plane host.

For a hosted iOS build, manually run
`.github/workflows/build-driver-ios.yml`. It requires the `EXPO_TOKEN` Actions
secret and `DRIVER_APP_EAS_PROJECT_ID` Actions variable before it can queue
paid EAS capacity. Physical-device signing and TestFlight also require the
Apple team and App Store Connect setup described in the runbook.

For step-by-step setup, build instructions, and environment separation, see
[Driver App Native Dev Runbook](../../docs/03-runbooks/driver-app-native-dev-runbook.md).
