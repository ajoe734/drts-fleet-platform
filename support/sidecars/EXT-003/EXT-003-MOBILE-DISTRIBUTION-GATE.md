# EXT-003 — Driver App Mobile Distribution Gate

**Task:** `EXT-003`  
**Owner:** Gemini2  
**Reviewer:** Codex  
**Status:** reviewer-corrected gate packet  
**Created:** 2026-05-01

## Purpose

This packet turns driver app mobile distribution into an explicit external gate. The repo has the
Expo app, EAS profile definitions, native identity handoff, and internal build runbook. It does not
have the external account, signing, tester, and store inputs required to claim installable mobile
distribution beyond repo-local/internal evidence.

## Current Repo Baseline

| Evidence family          | Current anchor                                              | Gate read      |
| ------------------------ | ----------------------------------------------------------- | -------------- |
| Native runbook           | `docs/03-runbooks/driver-app-native-dev-runbook.md`         | repo/static    |
| EAS profiles             | `apps/driver-app/eas.json`                                  | repo-complete  |
| Driver app package       | `apps/driver-app`                                           | repo-complete  |
| Productization checklist | `docs/03-runbooks/master-system-closeout-checklist.md` D-4a | external-gated |

`development`, `development-simulator`, `preview`, and `production` profiles are present in
`apps/driver-app/eas.json`. This does not prove account access, signing credentials, tester access,
or app-store distribution.

## External Blocker Records

| Blocker ID        | Missing input                 | Required evidence                                                                  | Owner to confirm          | Release effect                        |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| `EXT-003-BLK-001` | Expo project/account access   | `eas whoami` or CI `EXPO_TOKEN` proof, project slug/owner, and secret owner.       | Expo project owner        | No hosted EAS build claim.            |
| `EXT-003-BLK-002` | Android signing configuration | Keystore source, alias policy, credential owner, recovery/rotation plan.           | Android release owner     | No installable Android release claim. |
| `EXT-003-BLK-003` | Apple Developer team access   | Team ID, bundle ID authority, signing certificate/profile, device policy.          | Apple team owner          | No physical-device iOS release claim. |
| `EXT-003-BLK-004` | Internal tester groups        | Android/iOS tester list, opt-in process, device UDID policy where needed.          | QA / ops release owner    | No pilot distribution claim.          |
| `EXT-003-BLK-005` | EAS environment/secret policy | Staging/prod API URL, driver identity provisioning, secret scope, rotation owner.  | Release engineering       | Builds cannot be promoted safely.     |
| `EXT-003-BLK-006` | Release channel ownership     | Owner and rollback policy for `development`, `preview`, and `production` channels. | Release manager           | Channel promotion remains blocked.    |
| `EXT-003-BLK-007` | Install evidence              | Build URL/artifact hash, install log, first-launch identity/provisioning proof.    | QA / mobile release owner | Cannot claim mobile UAT pass.         |

## Required Build Profiles

| Profile                 | Current repo state             | Required external evidence                                                 |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `development`           | defined, Android APK profile   | Expo login/token and Android signing if hosted build is used.              |
| `development-simulator` | defined, iOS simulator profile | Can run without Apple physical-device signing; still needs Expo if hosted. |
| `preview`               | defined, Android APK profile   | Expo login/token, Android signing, tester distribution proof.              |
| `production`            | defined, production channel    | Expo project, Apple/Android signing, release owner, rollback policy.       |

## No-Overclaim Rules

Allowed:

- "The repo defines EAS profiles and a native driver identity handoff."
- "EAS evidence is external-gated on Expo, Apple, Android signing, tester, and channel inputs."
- "Simulator evidence is useful but does not prove physical-device or app-store distribution."

Not allowed:

- "Driver app mobile distribution is complete" without installable artifacts and tester evidence.
- "Internal build evidence equals production release readiness."
- "Production channel is ready" without signing and rollback-owner evidence.

## Acceptance Mapping

| Acceptance item                        | Evidence                                                           |
| -------------------------------------- | ------------------------------------------------------------------ |
| Expo Apple Android credentials named   | `EXT-003-BLK-001` to `EXT-003-BLK-003`.                            |
| tester groups and build profiles named | `EXT-003-BLK-004`, profile matrix, and `apps/driver-app/eas.json`. |
| existing EAS evidence linked           | Native runbook evidence snapshot and current baseline above.       |
| missing credentials become blockers    | `EXT-003-BLK-001` to `EXT-003-BLK-007`.                            |
| no repo-local overclaim                | No-overclaim rules above.                                          |
