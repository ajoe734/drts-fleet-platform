# UAT & Acceptance Evidence: DRIVER-ACADEMY-ACTUAL-MATERIAL-READER-20261015

## 1. Task Metadata & Scope Boundaries

- **Task ID**: `DRIVER-ACADEMY-ACTUAL-MATERIAL-READER-20261015`
- **Capability ID**: `C059` (`司機學院與培訓系統` — Driver Academy & Training System)
- **Finding Remediated**: `C059-F1` (`P1` / `functional` — Mounted `ModuleReader` did not play video or load selected SOP/article material; only rendered a static `▶` glyph + URL string for `video` modules and hardcoded canned generic paragraphs for every `sop` and `article` module)
- **Owner**: `Gemini2`
- **Reviewer**: `Gemini`
- **Branch**: `gemini2/driver-academy-actual-material-reader-20261015`
- **Worktree Base (`source_commit`)**: `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`
- **Immutable Audit Base (`fixed_accepted_dev_sha`)**: `431966bdf2728a76f7b03907974a124ab4a48ae7`
- **Authorized `write_scopes`**:
  1. `apps/driver-app/components/academy/module-reader.tsx`
  2. `apps/driver-app/components/academy/material-resource.ts`
  3. `tests/unit/driver-academy-actual-material-reader-20261015/`
  4. `docs/04-uat/driver-academy-actual-material-reader-20261015.md`

### Explicit Honesty & Boundary Statement

- Socket-free boundary doubles (`Linking.canOpenURL` / `Linking.openURL` and driver API client doubles) prove **Source behavior only** on the mounted `ModuleReader` (`apps/driver-app/components/academy/module-reader.tsx`) and `DriverAcademyScreen` (`apps/driver-app/app/academy.tsx:219-232`).
- In compliance with `AGENTS.md` VM restrictions, no product development servers, preview servers, browser/Playwright servers, HTTP listeners, PostgreSQL instances, or Docker Compose services were started on this VM.
- This task remedies the confirmed Source gap `C059-F1` while preserving all previously accepted `C059` course list/detail, question sanitizing, quiz scoring/retake, training record progress, expiry, qualification projection, and `C062` Web/native import separation guarantees. It does not claim hosted/native device runtime execution or full-Goal completion.

---

## 2. Requirement-to-Evidence Mapping (`AI_COLLABORATION_GUIDE.md` §0.7)

| Acceptance Key / Finding                                     | Requirement Summary                                                                                                                                                                                                                                                                                                                                                                                                      | Code Implementation (`file:line`)                                                                                                                                                                                                                                                                                                                                                                                                                        | Mounted Verification & Regression Evidence                                                                                                                                                                                                                                                                                                                              | Status   |
| :----------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------- |
| **`C059-F1`** (Original-Before Counterexample)               | Reproduce mounted `ModuleReader` at immutable base `431966bdf2728a76f7b03907974a124ab4a48ae7` showing dead `▶` glyph for video and identical canned SOP (`【標準作業指引 SOP】...`) / article (`【專業知識講義】...`) text across distinct module resources.                                                                                                                                                             | Historical `apps/driver-app/components/academy/module-reader.tsx` at `431966bdf2728a76f7b03907974a124ab4a48ae7` (`lines 103-138`) loaded via `git show` and mounted in `react-test-renderer`.                                                                                                                                                                                                                                                            | `tests/unit/driver-academy-actual-material-reader-20261015/driver-academy-actual-material-reader.test.ts` — Suite 1 (`reproduces the mounted ModuleReader dead video glyph and identical canned SOP/article body across distinct module resources`).                                                                                                                    | **PASS** |
| **`c059_actual_selected_material_read_or_play`**             | Provide a real accessible read/play/open action wired to the selected `contentUrl` and course/module identity (`courseId`, `courseCode`, `courseTitle`, `courseVersion`, `moduleId`, `moduleTitle`, `moduleType`). Remove static dead glyph and canned generic SOP/article text.                                                                                                                                         | `apps/driver-app/components/academy/material-resource.ts:99-227` (`resolveAcademyMaterialResource`, `openAcademyMaterialResource`, `buildAcademyMaterialIdentity`) and `apps/driver-app/components/academy/module-reader.tsx:68-259` (`handleOpenMaterial`, accessible `Pressable` with `testID="academy-material-open-${moduleId}"`, `academy-material-active-session` panel).                                                                          | `tests/unit/driver-academy-actual-material-reader-20261015/driver-academy-actual-material-reader.test.ts` — Suite 2 (`opens/plays the selected video, SOP, and article resources with preserved course/module identity and never renders canned generic text`).                                                                                                         | **PASS** |
| **`c059_material_unavailable_error_and_resource_switch`**    | Preserve module/resource switching, course version/title, and navigation/start-quiz. Missing/invalid URL, `canOpenURL=false`, or rejected opener/load must show honest recoverable state (`academy-material-unavailable` / `academy-material-error` + `academy-material-retry`), never silently claim material loaded, and guard against duplicate in-flight requests or stale responses across module/version switches. | `apps/driver-app/components/academy/material-resource.ts:99-144` (URL & scheme validation `http:` / `https:`), `161-227` (`canOpenURL` & `openURL` error handling), and `apps/driver-app/components/academy/module-reader.tsx:48-137` (`requestSeqRef` stale-response cancellation, `inFlightRef` duplicate guard, reset on `courseId`/`version`/`moduleId` change, `academy-material-unavailable`, `academy-material-error`, `academy-material-retry`). | `tests/unit/driver-academy-actual-material-reader-20261015/driver-academy-actual-material-reader.test.ts` — Suite 3 (4 mounted tests covering missing/invalid URL, opener rejection + retry recovery, in-flight race cancellation on module switch, `canOpenURL=false`, and course version prop update).                                                                | **PASS** |
| **`c059_existing_quiz_progress_and_web_native_regressions`** | Preserve course API, questions without answer keys, quiz scoring, retake, progress, expiry, qualification projection, and `C062` Web/native import split. Opening material must not auto-complete a course or trigger quiz submission. Zero unconditional native-only player/map imports.                                                                                                                                | `apps/driver-app/components/academy/module-reader.tsx` (imports only React, `react-native`, `@drts/ui-tokens`, `./types`, `./material-resource`; `onStartQuiz` only invoked by explicit quiz button) and `apps/driver-app/components/academy/material-resource.ts` (uses `Linking` from `react-native`).                                                                                                                                                 | `tests/unit/driver-academy-actual-material-reader-20261015/driver-academy-actual-material-reader.test.ts` — Suite 4 (mounted `DriverAcademyScreen` -> `ModuleReader` -> `QuizModal` fail/retake/pass flow + `C062` static import check) plus existing suites `sr-academy-fe-001`, `sr-academy-be-001`, `c059-driver-academy-training.test.ts`, and `sr-driver-web-001`. | **PASS** |
| **`c059_material_exact_candidate_validation`**               | Run repository typecheck, driver-app typecheck, lint, and unit/regression test suites on the exact candidate with clean scope hygiene.                                                                                                                                                                                                                                                                                   | All 4 authorized paths within `write_scopes`.                                                                                                                                                                                                                                                                                                                                                                                                            | See Section 4 below for exact commands and exit codes.                                                                                                                                                                                                                                                                                                                  | **PASS** |

---

## 3. Root Cause & Implementation Summary

### 3.1 Original-Before Defect (`C059-F1`)

At immutable base `431966bdf2728a76f7b03907974a124ab4a48ae7`, `apps/driver-app/components/academy/module-reader.tsx:103-138` rendered:

1. **Video modules (`activeModule.type === 'video'`)**: A non-interactive `<View>` with a static `<Text>▶</Text>` glyph and `<Text>影片資源位址：{activeModule.contentUrl}</Text>`, with no `onPress` handler or `Linking.openURL` call.
2. **SOP modules (`activeModule.type === 'sop'`)**: A hardcoded generic paragraph (`【標準作業指引 SOP】 1. 接單前請確認車輛安全自檢與整潔完成...`) that completely ignored `activeModule.contentUrl` and showed identical text across distinct SOP modules.
3. **Article modules (`activeModule.type === 'article'`)**: A hardcoded generic paragraph (`【專業知識講義】 本單元涵蓋平台服務法規、責任分工原則與合約條款注意事項...`) that completely ignored `activeModule.contentUrl` and showed identical text across distinct article modules.

### 3.2 Remediation Design

1. **`apps/driver-app/components/academy/material-resource.ts`**:
   - Added `resolveAcademyMaterialResource(course, module)` to validate `module.contentUrl` (rejecting empty/whitespace URLs and non-`http:`/`https:` schemes such as `javascript:`) and bind the full course/module identity (`courseId`, `courseCode`, `courseTitle`, `courseVersion`, `moduleId`, `moduleTitle`, `moduleType`, `durationMinutes`).
   - Added `openAcademyMaterialResource(course, module, options)` to open the validated `contentUrl` via the injected `openMaterial` callback or React Native `Linking.canOpenURL` + `Linking.openURL`, returning an `AcademyMaterialOpenResult` (`statusLabel`, `openedContent`, `resource` metadata) without introducing any native-only SDK (`expo-av`, `expo-video`, `react-native-video`, or `react-native-maps`).
   - Added `formatAcademyMaterialError` for consistent user-facing error messages on rejected opens.
2. **`apps/driver-app/components/academy/module-reader.tsx`**:
   - Removed the dead `▶` placeholder and removed all hardcoded canned SOP/article paragraphs.
   - Displays course identity (`代碼：{course.courseCode} · 版本：v{course.version}`), active module sequence (`第 X / N 單元 · {moduleId}`), type badge, duration, and `教材資源位址：{contentUrl}`.
   - Wired an accessible action button (`testID="academy-material-open-${activeModule.moduleId}"`, `accessibilityRole="button"`) to `handleOpenMaterial`, which invokes `openAcademyMaterialResource`.
   - Renders honest recoverable states:
     - Unavailable URL/scheme: `testID="academy-material-unavailable"` with explicit reason and disabled action button.
     - Rejected opener/player load: `testID="academy-material-error"` with failure reason and retry button (`testID="academy-material-retry"`).
     - Verified open session: `testID="academy-material-active-session"` showing the opened unit identity (`已開啟單元：{moduleTitle} ({moduleId}) · 課程版本 v{courseVersion}`) and any returned reader content (`testID="academy-material-loaded-body"`).
   - Resets active session/error state and invalidates in-flight opener promises (`requestSeqRef`, `inFlightRef`) whenever the selected module or course/version changes.

---

## 4. Verification Commands & Results

All verification commands were executed in `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-driver-academy-actual-material-reader-20261015` without starting any forbidden VM server:

1. **Driver App Typecheck**:

   ```bash
   pnpm --filter @drts/driver-app typecheck
   ```

   - Exit code: `0`

2. **Root TypeScript Verification on Task Test & Academy Files**:

   ```bash
   (pnpm exec tsc -p tsconfig.json --noEmit || true) | grep -E "tests/unit/driver-academy-actual-material-reader-20261015|apps/driver-app/components/academy"
   ```

   - Result: `0` TypeScript errors on all task-owned files (note: full `pnpm typecheck:root` inside `.artifacts/worktrees/auto/*` traverses parent `/home/lupin/workspace/drts-fleet-platform/node_modules/@drts/*` symlinks for unrelated web packages; CI runs `pnpm typecheck` on a clean checkout).

3. **Driver App & Root Lint**:

   ```bash
   pnpm --filter @drts/driver-app lint && pnpm lint:root
   ```

   - Exit code: `0`

4. **Mounted Component & Regression Unit Tests (Vitest)**:

   ```bash
   pnpm exec vitest run \
     tests/unit/driver-academy-actual-material-reader-20261015/ \
     tests/unit/system-remediation/sr-academy-fe-001/ \
     tests/unit/system-remediation/sr-academy-be-001/ \
     tests/unit/system-remediation/sr-qa-newfeatures-001/c059-driver-academy-training.test.ts \
     tests/unit/system-remediation/sr-driver-web-001/
   ```

   - Result: `8 passed (8)` test files, `76 passed (76)` tests, exit code `0`.

5. **Git Diff & Scope Hygiene Check**:

   ```bash
   git diff --check
   git status --short
   ```

   - Result: Exit code `0`, modified/added files strictly within `write_scopes`.
