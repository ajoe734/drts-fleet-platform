# P1PX-DRV-002 EAS Internal Build Evidence

**Task:** `P1PX-DRV-002`  
**Owner:** `Codex2`  
**Reviewer:** `Codex`  
**Last Revised:** `2026-04-28T15:18Z (UTC)`  
**Status Snapshot At Drafting:** `in_progress`

---

## 1) Scope

本 evidence packet 只整理 `P1PX-DRV-002` 的 hosted EAS internal build
baseline、exact commands、repo-observed blockers 與 reviewer handoff wording。
它不聲稱 build 已成功，也不提交任何 Expo / Apple / Android secrets。

---

## 2) Required Commands

Execution packet 指定的 verification commands 為：

```bash
cd apps/driver-app
eas build --platform android --profile preview
eas build --platform ios --profile development-simulator
```

目前 workstation 上 repo 未 vendor `eas` binary，因此本次 evidence pass
實際用可重放的 `npx eas-cli` 形式驗證相同 profile：

```bash
cd apps/driver-app && npx eas-cli build --platform android --profile preview --non-interactive
cd apps/driver-app && npx eas-cli build --platform ios --profile development-simulator --non-interactive
```

---

## 3) Repo Baseline

- `apps/driver-app/eas.json`
  - `preview` profile: Android internal distribution, `channel=preview`
  - `development-simulator` profile: extends `development`, iOS simulator=true
- `apps/driver-app/app.json`
  - bundle/package IDs are present for iOS and Android
  - native plugins include `expo-dev-client`, `expo-router`,
    `expo-image-picker`, `expo-location`
- `apps/driver-app/README.md`
  - documents native-capable baseline and now lists the exact hosted EAS
    commands
- `docs/03-runbooks/driver-app-native-dev-runbook.md`
  - now separates exact EAS commands, credential requirements, and current
    evidence snapshot

---

## 4) Observed Evidence

### E-1 Local `eas` binary is not vendored in the workspace

Command:

```bash
pnpm --filter @drts/driver-app exec eas --version
```

Observed result:

```text
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "eas" not found
```

Implication:

- workers cannot rely on `pnpm exec eas` unless they first install a global
  binary or use `npx eas-cli`

### E-2 `npx eas-cli` is available on demand

Command:

```bash
cd apps/driver-app && npx eas-cli --version
```

Observed result:

```text
eas-cli/18.8.1 linux-x64 node-v22.22.2
```

Implication:

- hosted build verification is reproducible from repo state without committing
  `eas-cli` into workspace dependencies

### E-3 Expo account authentication is missing

Command:

```bash
cd apps/driver-app && npx eas-cli whoami
```

Observed result:

```text
Not logged in
```

Additional local check:

- `~/.expo/state.json` exists, but there is no evidence of an active logged-in
  Expo session or configured `EXPO_TOKEN`
- no `EAS_`, `EXPO_`, `APPLE_`, or `ANDROID_` credential environment variables
  were present in the shell snapshot used for this task

### E-4 Android preview build is blocked at Expo auth

Command:

```bash
cd apps/driver-app && npx eas-cli build --platform android --profile preview --non-interactive
```

Observed result:

```text
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable if you're using EAS CLI on CI
Error: build command failed.
```

### E-5 iOS simulator build is blocked at Expo auth

Command:

```bash
cd apps/driver-app && npx eas-cli build --platform ios --profile development-simulator --non-interactive
```

Observed result:

```text
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable if you're using EAS CLI on CI
Error: build command failed.
```

---

## 5) Blocker Classification

Current first blocking external dependency:

1. Expo account access
   - missing `eas login` session and missing `EXPO_TOKEN`
   - blocks both Android and iOS hosted builds before platform-specific
     credential checks begin

Known downstream external prerequisites after Expo auth is restored:

1. Android signing configuration for internal artifact generation
2. Apple team access for non-simulator iOS internal builds

`development-simulator` reduces the Apple-signing requirement relative to
physical-device iOS distribution, but Expo authentication is still mandatory.

---

## 6) Reviewer Focus

Reviewer should confirm:

1. the packet does not over-claim build success
2. the exact reproducible commands are present for Android preview and iOS
   simulator profiles
3. the first blocker is explicitly recorded as missing Expo account access, not
   disguised as a code/config failure
4. repo docs now point operators to `npx eas-cli` and a credential matrix

---

## 7) Recommended Handoff

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff P1PX-DRV-002 Codex "P1PX-DRV-002 evidence is ready for review. README and the native dev runbook now document the exact hosted EAS commands (`npx eas-cli build --platform android --profile preview` and `npx eas-cli build --platform ios --profile development-simulator`), the external credential matrix, and the current blocker state. Support evidence is captured in support/sidecars/P1PX-DRV-002/P1PX-DRV-002-EAS-EVIDENCE.md: repo-local `eas` is not vendored, `npx eas-cli` resolves to 18.8.1, `whoami` returns Not logged in, and both non-interactive build commands fail at the same first gate because Expo account access (`eas login` or `EXPO_TOKEN`) is missing. Android signing and Apple-team inputs remain downstream external prerequisites once Expo auth is available."
```
