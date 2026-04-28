# Driver App Native Dev Runbook

## Purpose

This runbook documents how to run, build, and install the native
`apps/driver-app` surface for internal Android / iOS testing, and how driver
identity is provisioned across each environment tier.

The driver app is `app-auth-first` and must use the direct API host rather
than the Cloud IAP control-plane host.

## Current Baseline

- app package: `apps/driver-app`
- runtime: Expo Router + React Native
- native config: `apps/driver-app/app.json`
- EAS profiles: `apps/driver-app/eas.json`
- default packaged API host: `https://drts-api-kdhu6wzufa-uc.a.run.app`
- driver identity: **must be explicitly provisioned** — no silent demo fallback
- hosted build CLI: use `npx eas-cli` unless the workstation already has a
  global `eas` binary installed

## Driver Identity Provisioning

A build without a provisioned driver identity will show the degraded
"裝置尚未配置" (Device Not Provisioned) screen instead of binding a demo actor.
This is the correct safe failure mode.

Identity is resolved in priority order:

1. `EXPO_PUBLIC_DRIVER_ID` env var (preferred)
2. `EXPO_PUBLIC_DRIVER_ACTOR_ID` env var (legacy alias)
3. `expo.extra.driverActorId` in `app.json` (dev-only override, not in
   production build)

If none of these resolve, the app enters the degraded provisioning state.

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

## Environment Tiers

### Local Development

Set identity explicitly via env var. Use a local or staging API origin.

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001 \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
pnpm --filter @drts/driver-app dev:client
```

Metro dev server (no identity required for Metro start, but identity is
required for API calls):

```bash
pnpm --filter @drts/driver-app dev
```

Expo web preview:

```bash
pnpm --filter @drts/driver-app web
```

Local Android or iOS native run (requires identity env var):

```bash
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 pnpm --filter @drts/driver-app android
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 pnpm --filter @drts/driver-app ios
```

### Internal Test Build (EAS)

EAS build profiles (`development`, `preview`) bake in the staging API URL.
Driver identity is **not** baked into the build artifact. Testers must
receive their identity assignment through one of:

- An EAS environment variable set per-build in the EAS dashboard.
- A tester-specific `.env` file added to the device before the Metro server
  starts (development client only).
- A future backend provisioning flow (see §Production Identity Handoff below).

Android internal development APK:

```bash
cd apps/driver-app
npx eas-cli build --platform android --profile development
```

iOS internal development build:

```bash
cd apps/driver-app
npx eas-cli build --platform ios --profile development
```

iOS simulator build:

```bash
cd apps/driver-app
npx eas-cli build --platform ios --profile development-simulator
```

Internal preview APK:

```bash
cd apps/driver-app
npx eas-cli build --platform android --profile preview
```

### Hosted Build Credentials

The repo intentionally does not commit Expo or store-signing credentials.
Operators need these external inputs before the hosted build commands can
produce artifacts:

| Input                                             | Why It Is Required                                       | Expected Source                                |
| ------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Expo account access (`eas login` or `EXPO_TOKEN`) | Required before any hosted EAS build can start           | Expo project owner / CI secret manager         |
| Android signing configuration                     | Required to produce installable Android artifacts on EAS | Expo credentials store or team keystore policy |
| Apple team access                                 | Required for non-simulator iOS internal builds           | Apple Developer team owner                     |

`development-simulator` is still useful before Apple signing access exists,
because the simulator profile does not target physical-device distribution.

### Evidence Snapshot (2026-04-28 UTC)

Current repo-side evidence for `P1PX-DRV-002`:

- `pnpm --filter @drts/driver-app exec eas --version` fails because the repo
  does not vendor a local `eas` binary.
- `cd apps/driver-app && npx eas-cli --version` succeeds and resolves
  `eas-cli/18.8.1`.
- `cd apps/driver-app && npx eas-cli whoami` returns `Not logged in`.
- Both required verification commands fail at the same first external gate:

```text
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable if you're using EAS CLI on CI
```

As of `2026-04-28`, this task is therefore still evidence-gated by missing
Expo account credentials. Android signing and Apple team inputs remain
downstream external prerequisites once Expo authentication is available.

### Staging

Use the staging API host (already baked into `development` and `preview`
profiles). Provide a staging-tier driver ID as an EAS secret or env override.

```bash
EXPO_PUBLIC_API_URL=https://drts-api-kdhu6wzufa-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=<staging-driver-id> \
pnpm --filter @drts/driver-app dev:client
```

### Production

Production builds use the `production` EAS profile. Driver identity must
come from the backend identity handoff flow (see §Production Identity
Handoff). The `EXPO_PUBLIC_DRIVER_ID` env var is **not** set in the
production profile.

## Production Identity Handoff (Design)

The current Phase 1 plan for production-grade driver identity:

1. **Device registration**: On first launch, the driver app calls a
   `/driver/device/register` endpoint with a device fingerprint (Expo
   `Constants.installationId` or a generated UUID persisted in
   `SecureStore`).

2. **Identity binding**: The backend assigns a `driverId` to the device and
   returns a short-lived token. The app stores this in `SecureStore`.

3. **Token refresh**: The app refreshes the identity token on each launch or
   when the stored token approaches expiry.

4. **API client hydration**: `api-client.ts` reads the token from
   `SecureStore` at startup instead of relying on an env var.

This handoff is not yet implemented. The backend endpoint and auth contract
are gated on the backend mobile auth task. Until that lands, internal builds
use `EXPO_PUBLIC_DRIVER_ID`.

The driver app does **not** go through Cloud IAP. It uses direct app-auth
against the API host.

## Verification Checklist

After installing the build, confirm:

1. Without `EXPO_PUBLIC_DRIVER_ID` set: onboarding shows "裝置尚未配置"
   screen — not a demo-bound workspace.
2. With `EXPO_PUBLIC_DRIVER_ID` set: onboarding screen loads and smoke tests
   run.
3. Jobs inbox loads task data.
4. Trip screen can fetch active task state.
5. Earnings screen loads summary data.
6. Platform presence screen loads and shows connected platforms.
7. App can reach the configured API base without using an IAP login wall.

## Current Non-Goals

This runbook does not yet cover:

- App Store / Play Store submission credentials
- Push notification certificates
- MDM distribution
- Production mobile release sign-off
- Real backend device registration / token handoff (design above, not yet
  implemented)
