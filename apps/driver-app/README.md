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

## Native Dev Flow

The app is intended to ship as a native Android / iOS app. It now includes:

- Expo native app config in [app.json](./app.json)
- EAS build profiles in [eas.json](./eas.json)
- `expo-dev-client` for installable development builds

Useful commands:

- `pnpm --filter @drts/driver-app dev`
- `pnpm --filter @drts/driver-app dev:client`
- `pnpm --filter @drts/driver-app android`
- `pnpm --filter @drts/driver-app ios`
- `pnpm --filter @drts/driver-app build:android:development`
- `pnpm --filter @drts/driver-app build:ios:development`

The default packaged API target is the direct staging API host
`https://drts-api-kdhu6wzufa-uc.a.run.app`, not the IAP-protected control-plane
host. Override with `EXPO_PUBLIC_API_URL` when needed.

For step-by-step setup and installation instructions, see
[Driver App Native Dev Runbook](../../docs/03-runbooks/driver-app-native-dev-runbook.md).
