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
3. persisted device-bound provisioning session refreshed from
   `/api/auth/driver/device/refresh`
4. `expo.extra.driverActorId` in `app.json` (dev-only override, not in
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
- The app onboarding registration form backed by
  `/api/auth/driver/device/register`.

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

The full mobile distribution gate is tracked in
`support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`. Until blocker records
`EXT-003-BLK-001` through `EXT-003-BLK-007` have evidence attached, do not summarize the driver app
as production-distributed or mobile-release complete.

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

## iOS on a Local Mac

This is the fastest path now that a physical Mac workstation is available.
Both `ios/` and `android/` native projects are committed to the repo, and
`Pods/` is regenerated locally, so a fresh clone builds without a prior
`expo prebuild`.

### Mac One-Time Setup

```bash
# Xcode + command line tools (App Store, then:)
xcode-select --install
sudo xcodebuild -license accept

# Toolchain
brew install node@22 watchman cocoapods
corepack enable                  # provides pnpm
```

Open the iOS Simulator at least once (Xcode → Open Developer Tool →
Simulator) so a runtime is downloaded.

### Tier 1 — iOS Simulator (no Apple Developer account required)

Simulator builds are **not code-signed**, so they need no Apple Developer
membership. This unblocks functional testing immediately.

```bash
# from repo root
pnpm install

# build + boot the app in the iOS Simulator
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
EXPO_PUBLIC_API_URL=https://drts-api-kdhu6wzufa-uc.a.run.app \
pnpm --filter @drts/driver-app ios
```

`pnpm --filter @drts/driver-app ios` runs `expo run:ios`, which performs
`pod install`, compiles the native app, boots a Simulator, and attaches
Metro. To target a specific device:

```bash
cd apps/driver-app && npx expo run:ios --device "iPhone 16 Pro"
```

Hosted alternative (still no local signing, useful for sharing a build with
another Mac): the simulator profile produces a downloadable `.app`:

```bash
cd apps/driver-app
npx eas-cli build --platform ios --profile development-simulator
```

Run the §Verification Checklist against the Simulator. Note: background
location and camera/photo permissions behave differently in Simulator than
on a device — confirm those on a physical device before sign-off.

### Tier 2 — Physical iPhone (requires Apple Developer account)

Device builds must be code-signed against an Apple Developer team. With the
Mac plugged into the iPhone:

```bash
cd apps/driver-app && npx expo run:ios --device   # pick the connected iPhone
```

Xcode will prompt to select a Development Team the first time (Signing &
Capabilities → Team). The bundle identifier is already set to
`com.cctechsupport.drts.driver` in `app.json`; the Apple account owner must
register an App ID matching it (or let Xcode auto-create it).

### Tier 3 — TestFlight (internal tester distribution)

For testers without a wired Mac, distribute through TestFlight:

```bash
cd apps/driver-app
npx eas-cli build   --platform ios --profile production   # cloud-signed .ipa
npx eas-cli submit  --platform ios --profile production   # upload to App Store Connect
```

`eas submit` needs three Apple inputs the repo does not store — supply them
interactively or extend `eas.json`'s `submit.production.ios`:

| Field         | What it is                                              |
| ------------- | ------------------------------------------------------- |
| `appleId`     | Apple ID email of an App Store Connect user             |
| `ascAppId`    | App Store Connect app's numeric Apple ID                |
| `appleTeamId` | 10-char Apple Developer Team ID                         |

After the build appears in App Store Connect → TestFlight, add the build to
an internal testing group; testers install via the TestFlight app.

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

## Production Identity Handoff

The current Phase 1 implementation for production-grade driver identity:

1. **Device registration**: On first launch without a dev override, the
   driver app shows the provisioning form and calls
   `/api/auth/driver/device/register` with a registration code, generated
   device ID, and optional device label.

2. **Identity binding**: The backend resolves the registration code to a
   provisionable driver profile and returns a driver-bound Bearer access token
   plus refresh token.

3. **Secure persistence**: The app stores the device ID and provisioning
   session in `expo-secure-store`.

4. **Token refresh**: On later launches, on periodic foreground revalidation,
   and whenever the app returns to the foreground,
   `initializeDriverIdentity()` calls
   `/api/auth/driver/device/refresh` before hydrating the API client again.
   Auth failures clear the stored binding and send the user back to the
   provisioning form; transient refresh failures keep the cached session until
   the next successful refresh.

5. **Revocation enforcement**: Driver Bearer tokens carry a backend binding
   reference, and driver routes reject revoked or stale bindings even if the
   JWT is otherwise well-formed.

6. **Rebind semantics**: Registering the same physical device again revokes
   the previous active binding first, records an audit trail, and issues a
   replacement session for the newly provisioned driver.

The driver app does **not** go through Cloud IAP. It uses direct app-auth
against the API host.

## Verification Checklist

After installing the build, confirm:

1. Without `EXPO_PUBLIC_DRIVER_ID` set and without an existing session:
   onboarding shows the registration form — not a demo-bound workspace.
2. With a valid registration code: onboarding stores a backend-issued session
   and smoke tests run.
3. With `EXPO_PUBLIC_DRIVER_ID` set: onboarding bypasses registration as an
   explicit dev override.
4. Jobs inbox loads task data.
5. Trip screen can fetch active task state.
6. Earnings screen loads summary data.
7. Platform presence screen loads and shows connected platforms.
8. Revoked or suspended bindings fail refresh, surface a driver-facing
   explanation, and return the app to the provisioning form.
9. Platform admin can revoke a driver device binding from the Fleet surface,
   after which the device may be rebound through the onboarding registration
   flow.
10. A completion attempt that is submitted during weak-network conditions is
    cached locally, retried with the same request id, and does not create a
    duplicate completion trace when the backend already accepted it.
11. If a cached completion replay hits an expired or revoked driver session,
    the app clears the stale binding and returns the driver to onboarding for
    explicit re-auth before replay is attempted again.
12. App can reach the configured API base without using an IAP login wall.

## Current Non-Goals

This runbook does not yet cover:

- Public App Store / Play Store **public release** sign-off (TestFlight
  internal distribution is covered above; public release review is not)
- Push notification certificates
- MDM distribution
- Admin UI / operational runbook for issuing or revoking driver registration
  codes
