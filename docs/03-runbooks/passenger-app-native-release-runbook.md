# Passenger native hosted packaging and release

The passenger native app follows the existing manual Driver EAS convention:
Expo config/plugins in the repository, hosted native generation/compilation,
remote signing and separately recorded installation or Store delivery. This
proposal is an unapplied repository candidate. Existing release ownership and
deployment authorization continue to apply; no new approval step is introduced.

`apps/passenger-app/package.json` uses `build` for TypeScript checking and
`ios`/`android` to start Expo. Those scripts stay unchanged. They do not produce
installable native artifacts and must not be used for product hosting on this
VM. The passenger app does not require checked-in native projects for this
managed Expo path: the remote builder generates them from the actual app config
and plugins. Native generation/compilation has not been executed for this
candidate; the existing iOS/Android JS graph receipts have JS-only scope.

## Profiles and intended outputs

| Platform      | Profile              | Mode / EAS environment  | Intended result                                        |
| ------------- | -------------------- | ----------------------- | ------------------------------------------------------ |
| Android       | `preview`            | Demo / preview          | Internal signed standalone APK                         |
| iOS           | `preview-simulator`  | Demo / preview          | Standalone Simulator app archive                       |
| iOS           | `preview`            | Demo / preview          | Internally provisioned standalone device app           |
| Android / iOS | `configured-preview` | Configured / preview    | Real service UAT APK or internally provisioned iOS app |
| Android / iOS | `production`         | Configured / production | Signed Android AAB or iOS Store-distribution archive   |

`preview-simulator` inherits `preview`; on Android its iOS-only Simulator flag
has no effect and it produces the same APK settings. Preview builds are
standalone, without a development client or Metro server. No development-client
dependency, permission flow or new policy is introduced.

Demo profiles explicitly embed `EXPO_PUBLIC_PASSENGER_MODE=demo`. The existing
runtime uses synthetic transport/scenarios, with the visible simulation banner;
it does not perform real booking/payment/provider work. The configured profiles
explicitly select the real existing bootstrap instead. Production is a real
build path, not a demo renamed as production. It does not submit to any Store.

The app name/version, `drtspassenger` scheme and existing temporary
`com.cctechsupport.drts.passenger` identifiers are preserved. Their original
Store decision remains with the release owner. `cli.appVersionSource=remote`
and production `autoIncrement` use EAS native build numbering. For an identifier
already distributed, the owner initializes the EAS counters from its actual
latest accepted build before the next production build; no counter is invented
in source. Marketing version `0.1.0` remains the existing app config value.

## Inputs supplied by the existing owner

The release owner supplies the passenger Expo project/access and native signing
through the existing external account/credential systems:

- GitHub Actions secret `EXPO_TOKEN` and variable `PASSENGER_APP_EAS_PROJECT_ID`
  for the existing passenger Expo project. This audit did not query their live
  values or availability. The optional public ID populates `extra.eas.projectId`
  in the real dynamic config; no project ID or account is fabricated.
- EAS managed Android signing credentials/package ownership for APK/AAB builds.
- Apple Developer team, App ID and signing/provisioning for physical iOS. Internal
  iOS distribution needs the applicable tester-device provisioning. A Simulator
  build does not target physical-device distribution.
- App Store Connect / Google Play app access and the original Apple-login/Store
  decisions for later submission. There is no automatic submission here.

The actual EAS project `preview` environment supplies the configured-preview
service values; its `production` environment supplies production values. Do not
reuse an old Driver hostname or an example value as a passenger target:

| Existing variable                                    | Meaning                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_PASSENGER_API_BASE_URL`                 | Intended direct passenger API base URL                                             |
| `EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI`           | Actual registered callback for the existing app scheme                             |
| `EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION` | Actual existing consent version when enabling notifications                        |
| `PASSENGER_GOOGLE_SERVICES_ANDROID_FILE`             | EAS file-variable path to the real Android Firebase services file, when configured |
| `PASSENGER_GOOGLE_SERVICES_IOS_FILE`                 | EAS file-variable path to the real iOS Firebase services file, when configured     |
| `GOOGLE_MAPS_ANDROID_KEY`                            | Real provisioned Android Maps key, when configured                                 |

Public Expo values are embedded client configuration. They are not provider
secrets. API/callback values must be available to EAS config resolution and the
remote JS bundler; use the selected actual EAS project environment, not merely
an unrelated GitHub runner shell prefix. Optional service-file variables must
resolve to actual files on the selected platform's builder; the existing app
config only checks file metadata and registers that platform's Firebase mods.
Do not commit or print credential contents. The configured distribution profiles
set the existing `PASSENGER_IOS_APS_ENVIRONMENT=production` for release signing;
this is not an APNs credential or a promise of delivery.

Absent API/callback configuration still produces the existing unavailable
bootstrap, without a fake default target or demo fallback. Absent service files
leave the existing corresponding notification metadata unavailable. Missing
optional providers do not become successful providers. The owner supplies real
Firebase/APNs setup, Maps provisioning, backend/provider configuration and OAuth
registrations for the functions being demonstrated. This proposal adds no new
backend activation flag or security gate.

## Manual hosted caller and evidence

Use **Actions → Build Passenger App (Native, EAS)** on the selected immutable
release ref, choose the platform/profile and record the resolved source SHA.
The existing deployment owner performs the remote dispatch; this task only
prepared candidate files and did not dispatch, publish or modify Source1/Source2.

The workflow follows `.github/workflows/build-driver-ios.yml`: Node 22,
pnpm 10.33.0, frozen workspace install and pinned `npx eas-cli@21.4.0`. It passes
`PASSENGER_APP_EAS_PROJECT_ID` into the selected profile in the ephemeral checkout
so the real dynamic config receives the same linkage on the hosted builder.
It runs EAS `config`, then `build --non-interactive --wait --json` for the chosen
platform/profile. The job waits up to its 90-minute Actions limit for remote
native generation, linking, compilation and signing. The final build JSON,
separate stderr log and exact CLI exit code are saved even when the CLI fails;
the workflow returns that same nonzero CLI code. If the CLI returns zero, its
final result must contain exactly one `FINISHED` build, a build ID and a nonempty
build/archive artifact URL. Cancellation, an empty/null result or a missing
artifact therefore cannot produce a successful CI result.

This final-result check is necessary with the pinned implementation: the
[v21.4.0 completion path](https://github.com/expo/eas-cli/blob/v21.4.0/packages/eas-cli/src/build/runBuildAndSubmit.ts#L298-L325)
prints the final build array and invokes an exit helper, but that helper at
[L555–L561](https://github.com/expo/eas-cli/blob/v21.4.0/packages/eas-cli/src/build/runBuildAndSubmit.ts#L555-L561)
only changes the process status for errored builds. The
[v21.4.0 JSON utility](https://github.com/expo/eas-cli/blob/v21.4.0/packages/eas-cli/src/utils/json.ts#L6-L20)
redirects ordinary CLI output to stderr and emits the final JSON separately to
stdout. Explicit `--wait` and the JSON flag are supported by the
[pinned build command](https://github.com/expo/eas-cli/blob/v21.4.0/packages/eas-cli/src/commands/build/index.ts#L72-L129).
No latest-version behavior is assumed. No extra approval, network-health,
permission or security gate is added. The profiles pin remote Node 22.23.2 and
pnpm 10.33.0 to the already used toolchain.

A successful build step now establishes a completed remote native build with an
artifact URL. It does not establish artifact download integrity, installation,
cold launch, provider delivery or Store publication. Record the source SHA,
profile/environment, resolved public mode, build ID/status, artifact URL,
subsequent artifact size/hash and signing identity. Preserve failed receipts;
do not substitute JS bundle success. If Actions times out or is interrupted,
there is no completed-build success claim; follow the recorded EAS job because
cancelling the waiting runner does not by itself prove that remote work stopped.

For Android internal UAT, download the finished APK and install/cold-launch on a
compatible physical device outside this VM. For iOS Simulator, download the
finished app archive and install/cold-launch with a supported Mac/Xcode
Simulator outside this VM. Physical internal iOS requires its actual signed
provisioning/distribution route. Record a launch without Metro and the selected
mode. Demo acceptance shows the simulation banner and synthetic journey;
configured acceptance must exercise the actual selected backend and native
capabilities. Production AAB/iOS archives require subsequent owner-run Play or
App Store Connect delivery before device installation; no Store-submit command,
Store listing, provider call or device success is claimed by this workflow.

No API/server/browser/DB/Compose, prebuild, native compile, dependency install,
Git operation, deployment, provider call, external-account query or project
network request was run to prepare this candidate. Only public pinned Expo CLI
source was read for the completion/JSON contract. Existing tests, private179 proof,
Source2 JS-only support and all failed attempts remain unchanged. Root performs
repository verification in sequence; canonical release/adoption and deployment
remain with Main under the existing authorization.
