# Driver App

Expo Router + React Native driver surface for onboarding, jobs, trip
lifecycle, incident handling, earnings, and settings.

Implemented / materially wired screens include:

- `/onboarding`
- `/jobs`
- `/trip`
- `/incident`
- `/earnings`
- `/settings`

This app is the active Phase 1 driver surface, not a placeholder shell.

## Driver Identity Requirement

Driver identity **must** be explicitly provisioned. There is no silent demo
fallback. A build without a provisioned identity will display a degraded
provisioning screen instead of binding a demo actor.

Set one of the following before running or building:

| Variable                | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `EXPO_PUBLIC_DRIVER_ID` | Explicit driver actor ID for local dev and internal builds   |
| `EXPO_PUBLIC_API_URL`   | Explicit direct API origin for the selected environment tier |

Example local dev invocation:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001 \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
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
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
pnpm --filter @drts/driver-app ios
```

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
