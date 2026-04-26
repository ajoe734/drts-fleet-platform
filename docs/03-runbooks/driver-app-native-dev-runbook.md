# Driver App Native Dev Runbook

## Purpose

This runbook documents how to run, build, and install the native
`apps/driver-app` surface for internal Android / iOS testing.

The driver app remains `app-auth-first` and must use the direct API host rather
than the Cloud IAP control-plane host.

## Current Baseline

- app package: `apps/driver-app`
- runtime: Expo Router + React Native
- native config: `apps/driver-app/app.json`
- EAS profiles: `apps/driver-app/eas.json`
- default packaged API host: `https://drts-api-kdhu6wzufa-uc.a.run.app`
- default driver actor id: `driver-demo-001`

## Local Prerequisites

- Node `22.x`
- `pnpm >= 10.33.0`
- Xcode for iOS local builds
- Android Studio + SDK for Android local builds
- Expo login if using hosted EAS build flow

Bootstrap once from repo root:

```bash
pnpm install
```

## Local Developer Flows

Metro dev server:

```bash
pnpm --filter @drts/driver-app dev
```

Expo web preview:

```bash
pnpm --filter @drts/driver-app web
```

Native dev client server:

```bash
pnpm --filter @drts/driver-app dev:client
```

Local Android native run:

```bash
pnpm --filter @drts/driver-app android
```

Local iOS native run:

```bash
pnpm --filter @drts/driver-app ios
```

## Environment Overrides

The driver app reads:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_DRIVER_ID`

Example:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001 \
EXPO_PUBLIC_DRIVER_ID=driver-demo-001 \
pnpm --filter @drts/driver-app dev:client
```

Use a direct non-IAP API origin for device testing.

## Hosted Dev Builds With EAS

Android internal development build:

```bash
cd apps/driver-app
eas build --platform android --profile development
```

iOS internal development build:

```bash
cd apps/driver-app
eas build --platform ios --profile development
```

iOS simulator build:

```bash
cd apps/driver-app
eas build --platform ios --profile development-simulator
```

Internal preview APK:

```bash
cd apps/driver-app
eas build --platform android --profile preview
```

## Verification Checklist

After installing the build, confirm:

1. onboarding screen opens
2. jobs inbox loads task data
3. trip screen can fetch active task state
4. earnings screen loads summary data
5. app can reach the configured API base without using an IAP login wall

## Current Non-Goals

This runbook does not yet cover:

- App Store / Play Store submission credentials
- push notification certificates
- MDM distribution
- production mobile release sign-off
