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
- current dev GCP project: `nodal-alloy-503700-s3`
- current dev direct API origin:
  `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app`
- operator rule: always set the direct API origin explicitly; do not rely on a
  packaged fallback or use an IAP-protected control-plane origin
- driver identity: **must be explicitly provisioned** — no silent demo fallback
- hosted build CLI: `npx eas-cli@21.4.0`

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
- Xcode, its command-line tools, and CocoaPods for iOS local builds
- Android Studio + SDK for Android local builds
- Expo login if using hosted EAS build flow

Bootstrap once from repo root:

```bash
pnpm install
```

## Environment Tiers

### Local Development

Set identity and the direct API origin explicitly.

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
EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
pnpm --filter @drts/driver-app android

EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
pnpm --filter @drts/driver-app ios
```

### Internal Test Build (EAS)

Pass the intended API origin explicitly for every build. The manual GitHub
Actions workflow rewrites the selected build profile ephemerally from its
`api_url` input, so the submitted EAS job receives that exact
`EXPO_PUBLIC_API_URL`. Setting an environment variable only on a GitHub runner
does not, by itself, make it available on the remote EAS builder.

Production identity is **not** baked into the build artifact. Internal testers
receive their identity assignment through one of:

- An EAS environment variable set per-build in the EAS dashboard.
- A tester-specific `.env` file added to the device before the Metro server
  starts (development client only).
- The app onboarding registration form backed by
  `/api/auth/driver/device/register`.

The raw CLI examples below are valid only after the selected profile's
`env.EXPO_PUBLIC_API_URL` has been updated to the intended direct origin.
Merely prefixing `eas build` with a GitHub or local shell variable does not
send that variable to the EAS builder. Run `eas config` and inspect the
resolved profile before queuing a build. For iOS, prefer the guarded GitHub
Actions workflow documented under §iOS on a Local Mac.

Android internal development APK:

```bash
cd apps/driver-app
npx eas-cli@21.4.0 build --platform android --profile development
```

iOS internal development build:

```bash
cd apps/driver-app
npx eas-cli@21.4.0 build --platform ios --profile development
```

iOS simulator build:

```bash
cd apps/driver-app
npx eas-cli@21.4.0 build --platform ios --profile development-simulator
```

Internal preview APK:

```bash
cd apps/driver-app
npx eas-cli@21.4.0 build --platform android --profile preview
```

### Hosted Build Credentials

The repo intentionally does not commit Expo or store-signing credentials.
Operators need these external inputs before the hosted build commands can
produce artifacts:

| Input                                             | Why It Is Required                                          | Expected Source                                |
| ------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Expo account access (`eas login` or `EXPO_TOKEN`) | Required before any hosted EAS build can start              | Expo project owner / CI secret manager         |
| EAS project ID                                    | Links non-interactive CI to the existing driver-app project | Expo project owner / EAS project settings      |
| Android signing configuration                     | Required to produce installable Android artifacts on EAS    | Expo credentials store or team keystore policy |
| Apple team access                                 | Required for non-simulator iOS internal builds              | Apple Developer team owner                     |
| App Store Connect integration                     | Required for non-interactive TestFlight submission          | EAS credentials / App Store Connect owner      |

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

### Automation Readiness Snapshot (2026-07-31 UTC)

The GCP side is ready: project `nodal-alloy-503700-s3` is active and
`https://drts-dev-api-4t7rg6fmeq-uc.a.run.app/health` returns HTTP 200.

The GitHub/EAS side is not yet credentialed:

- the repository has no `EXPO_TOKEN` Actions secret;
- the repository has no `DRIVER_APP_EAS_PROJECT_ID` Actions variable; and
- `apps/driver-app/app.json` does not contain an EAS project ID.

`.github/workflows/build-driver-ios.yml` therefore stops in its free guard
step today. It will not start a paid EAS build until both GitHub settings are
configured. Obtain the existing driver-app project ID from the Expo owner; do
not create a duplicate EAS project merely to satisfy the workflow.

### Current Dev

Use the active dev direct API origin and a dev-tier driver identity:

```bash
EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=<dev-driver-id> \
pnpm --filter @drts/driver-app dev:client
```

## iOS on a Local Mac

The repository commits `apps/driver-app/ios`, while CocoaPods output remains
machine-generated. A fresh clone can build without running `expo prebuild`.

### Mac One-Time Setup

Install Xcode from the App Store, launch it once so it can install an iOS
Simulator runtime, then prepare the command-line toolchain:

```bash
xcode-select --install
sudo xcodebuild -license accept
brew install node@22 watchman cocoapods
corepack enable
```

From the repository root:

```bash
pnpm install
```

### Tier 1 — iOS Simulator

Simulator builds are not device-signed, so this path does not require an Apple
Developer membership:

```bash
EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
pnpm --filter @drts/driver-app ios
```

`pnpm --filter @drts/driver-app ios` runs `expo run:ios`, installs pods,
compiles the committed native project, boots a Simulator, and attaches Metro.
To select a particular Simulator:

```bash
cd apps/driver-app
EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
npx expo run:ios --device "iPhone 16 Pro"
```

Run the verification checklist below. Camera, background location, Low Power
Mode, OS termination, and force-quit behaviour still require a real device.

### Tier 2 — Physical iPhone

Physical-device builds require an Apple Developer team and a registered
device. Enable Developer Mode on the iPhone, connect and trust the Mac, then:

```bash
cd apps/driver-app
EXPO_PUBLIC_API_URL=https://drts-dev-api-4t7rg6fmeq-uc.a.run.app \
EXPO_PUBLIC_DRIVER_ID=driver-dev-001 \
npx expo run:ios --device
```

On the first build, select the authorized Development Team in Xcode under
Signing & Capabilities. The bundle identifier is
`com.cctechsupport.drts.driver`; the Apple team must own that App ID or be
authorized to create it.

Record the device model, iOS version, API target, build SHA, permission
screens, background-location behaviour, Low Power Mode behaviour, force-quit
limitation, and reopen/replay result in
`docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md`.

### Tier 3 — EAS and TestFlight

The supported non-interactive path is the manual GitHub Actions workflow
`.github/workflows/build-driver-ios.yml`. Before its first run:

1. Ask the Expo owner for the existing driver-app EAS project ID.
2. Configure that ID as the GitHub Actions variable
   `DRIVER_APP_EAS_PROJECT_ID`.
3. Configure an Expo access token as the GitHub Actions secret `EXPO_TOKEN`.
4. Configure the Apple signing credentials in EAS for
   `com.cctechsupport.drts.driver`.
5. Connect the EAS project to its App Store Connect app for non-interactive
   submission.
6. If this bundle identifier already has store builds, initialize the EAS
   remote iOS build number from the latest accepted build before enabling
   auto-increment.

To run it, open **Actions → Build Driver App (iOS, EAS) → Run workflow**:

- choose `development-simulator` for a downloadable Simulator `.app`;
- choose `development` for a signed development-client build;
- choose `preview` for internal device distribution;
- choose `production` and set `submit=true` for TestFlight;
- set `api_url` to the direct API origin intended for that artifact.

For current dev UAT, the `api_url` is
`https://drts-dev-api-4t7rg6fmeq-uc.a.run.app`. For production/TestFlight,
replace it deliberately with the approved production direct API origin; never
use an IAP-protected control-plane URL.

The workflow verifies `/health` before consuming EAS capacity, injects the
selected API origin and EAS project ID into an ephemeral checkout, validates
the resolved EAS config, and then queues the paid build. With `submit=true`,
EAS auto-submits only after the production build completes; the workflow does
not race a separate `submit --latest` command against an unfinished build.

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

- public App Store / Play Store review and release sign-off
- Push notification certificates
- MDM distribution
- Admin UI / operational runbook for issuing or revoking driver registration
  codes
