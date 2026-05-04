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

| Variable                | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `EXPO_PUBLIC_DRIVER_ID` | Explicit driver actor ID for local dev and internal builds |
| `EXPO_PUBLIC_API_URL`   | Override the API base URL                                  |

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
- `cd apps/driver-app && npx eas-cli build --platform android --profile preview`
- `pnpm --filter @drts/driver-app build:ios:development`
- `cd apps/driver-app && npx eas-cli build --platform ios --profile development-simulator`

Hosted EAS builds currently assume `npx eas-cli` unless the operator has a
global `eas` binary installed. The repo does not vendor `eas-cli` as a
workspace dependency.

Local development defaults the API target from the Expo dev-server host on port
`3001`, so an Android emulator connected to `http://<host>:8081` will call
`http://<host>:3001`. Hosted EAS profiles still provide
`EXPO_PUBLIC_API_URL` for staging/preview targets. The driver app does not use
the IAP-protected control-plane host.

For step-by-step setup, build instructions, and environment separation, see
[Driver App Native Dev Runbook](../../docs/03-runbooks/driver-app-native-dev-runbook.md).
