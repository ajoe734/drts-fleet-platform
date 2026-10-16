# UAT & Acceptance Evidence: DRIVER-ACADEMY-ACTUAL-MATERIAL-READER-20261015

## 1. Task Metadata & Scope Boundaries

- **Task ID**: `DRIVER-ACADEMY-ACTUAL-MATERIAL-READER-20261015`
- **Capability ID**: `C059` (`司機學院與培訓系統` — Driver Academy & Training System)
- **Finding Remediated**: `C059-F1` (`P1` / `functional` — Mounted `ModuleReader` did not play video or load selected SOP/article material; only rendered a static `▶` glyph + URL string for `video` modules and hardcoded canned generic paragraphs for every `sop` and `article` module)
- **Owner**: `Gemini2`
- **Reviewer**: `Gemini`
- **Original Branch (Preserved Without Force-Push)**: `gemini2/driver-academy-actual-material-reader-20261015` (Candidate `6c4bb6a04b680ff27604f6a868770aa83b596746`, PR #2695)
- **Clean Candidate Branch**: `gemini2/driver-academy-actual-material-reader-20261015-clean`
- **Immutable Audit Base (`fixed_accepted_dev_sha`)**: `431966bdf2728a76f7b03907974a124ab4a48ae7`
- **Authorized `write_scopes`**:
  1. `apps/driver-app/components/academy/module-reader.tsx`
  2. `apps/driver-app/components/academy/material-resource.ts`
  3. `tests/unit/driver-academy-actual-material-reader-20261015/`
  4. `docs/04-uat/driver-academy-actual-material-reader-20261015.md`

### Candidate Lineage & CI Trailer Remediation

- **Prior Candidate (`6c4bb6a04b680ff27604f6a868770aa83b596746`, PR #2695)**:
  - Reviewed and **approved** by independent reviewer `Gemini` at `2026-10-15T18:18:49Z`.
  - Hosted CI on PR #2695 passed `Change scope`, `Canonical consistency`, `Runtime mirror guard`, `BFF-only imports`, `Repo classification`, `Dependency security`, `i18n guard`, `lint`, `typecheck`, `integration`, `iam-negative-matrix`, and `cross-surface-e2e`, but failed `CI/Commit trailers` (`job 116593979706`) because commit `6c4bb6a04b68` used subject `feat(driver-app): wire Academy ModuleReader to selected material resources (C059-F1)` instead of `<TASK-ID>: <summary>`.
  - Per `docs/ops/branch-strategy.md` §11.4, published branch `gemini2/driver-academy-actual-material-reader-20261015` (`6c4bb6a04b680ff27604f6a868770aa83b596746`) is preserved intact without rebase, amend, or force-push. Because `tools/ci/git/check_commit_trailers.py` validates every non-merge commit in `origin/dev..HEAD`, the clean branch `gemini2/driver-academy-actual-material-reader-20261015-clean` is branched directly from `origin/dev` with the identical verified Source implementation, unit tests, and compliant commit subject `DRIVER-ACADEMY-ACTUAL-MATERIAL-READER-20261015: wire Academy ModuleReader to selected material resources (C059-F1)`.

### Explicit Honesty & Boundary Statement

- Socket-free boundary doubles (`Linking.canOpenURL` / `Linking.openURL` and driver API client doubles) prove **Source behavior only** on the mounted `ModuleReader` (`apps/driver-app/components/academy/module-reader.tsx`) and `DriverAcademyScreen` (`apps/driver-app/app/academy.tsx:219-232`).
- In compliance with `AGENTS.md` VM restrictions, no product development servers, preview servers, browser/Playwright servers, HTTP listeners, PostgreSQL instances, or Docker Compose services were started on this VM.
- This task remedies the confirmed Source gap `C059-F1` while preserving all previously accepted `C059` course list/detail, question sanitizing, quiz scoring/retake, training record progress, expiry, qualification projection, and `C062` Web/native import separation guarantees. It does not claim hosted/native device runtime execution or full-Goal completion.

---

## 2. Requirement-to-Evidence Mapping (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding／驗收項                                              | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                                                      | 舊版重現 → 修正版結果                                                                                                                                                                                                                                                                                                               | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                             | 未驗項與具體限制                                                                                                                                  |
| :----------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`C059-F1`** (Original-Before Counterexample)               | Historical `apps/driver-app/components/academy/module-reader.tsx` at immutable base `431966bdf2728a76f7b03907974a124ab4a48ae7` (`lines 103-138`) loaded via `git show` and mounted in `react-test-renderer`.                                                                                                                                              | **舊版 (`431966bdf272`)**：`video` 僅顯示無 `onPress` 的靜態 `▶` 與網址文字；兩個不同 `sop` 單元顯示完全相同的罐頭文字 `【標準作業指引 SOP】...`；兩個不同 `article` 單元顯示完全相同的罐頭文字 `【專業知識講義】...`，`Linking.openURL` 呼叫次數為 `0`。**修正版**：移除死圖示與罐頭段落，改由真實資源開啟動作驅動。 | `pnpm exec vitest run tests/unit/driver-academy-actual-material-reader-20261015/` (exit `0`, Suite 1 PASS).                                                                                                                  | Socket-free boundary doubles prove Source behavior only; no native device/hosted media server started on VM.                                      |
| **`c059_actual_selected_material_read_or_play`**             | `apps/driver-app/components/academy/material-resource.ts:115-194,225-270` (`buildAcademyMaterialIdentity`, `resolveAcademyMaterialResource`, `openAcademyMaterialResource`) & `apps/driver-app/components/academy/module-reader.tsx:102-148,233-376` (`handleOpenMaterial`, accessible `Pressable` `testID="academy-material-open-${moduleId}"`).           | **舊版 (`431966bdf272`)**：無法播放或開啟所選 `contentUrl`。**修正版**：點擊 `video` / `sop` / `article` 單元動作按鈕實際呼叫 `Linking.canOpenURL` + `Linking.openURL(contentUrl)`（或注入之 `onOpenMaterial`），並於 `academy-material-active-session` 呈現單元／課程／版本身分與載入內容，絕不顯示罐頭文字。               | `pnpm exec vitest run tests/unit/driver-academy-actual-material-reader-20261015/` (exit `0`, Suite 2 PASS).                                                                                                                  | Socket-free boundary doubles (`Linking` / `onOpenMaterial`) verify Source wiring; real external OS browser/video player requires device/hosted.   |
| **`c059_material_unavailable_error_and_resource_switch`**    | `apps/driver-app/components/academy/material-resource.ts:134-194,225-270` (空白或非 `http:`/`https:` 協定驗證、`canOpenURL` 檢查與錯誤格式化) & `apps/driver-app/components/academy/module-reader.tsx:47-148,260-365` (`generation` 序號防競態、`inFlight` 防重入、切換單元或課程版本重置狀態、`academy-material-unavailable` / `academy-material-error` / `retry`). | **舊版 (`431966bdf272`)**：缺失或壞網址仍靜默顯示罐頭 SOP／講義文字，假裝教材已載入。**修正版**：缺失／無效網址顯示 `academy-material-unavailable` 並停用開啟按鈕；`canOpenURL=false` 或 `openURL` 失敗顯示 `academy-material-error` 與 `academy-material-retry`，重試成功後恢復正常，切換單元或版本時取消過期回應。   | `pnpm exec vitest run tests/unit/driver-academy-actual-material-reader-20261015/` (exit `0`, Suite 3: 4 mounted tests PASS).                                                                                                 | Socket-free boundary doubles prove Source error/recovery & race safety only.                                                                      |
| **`c059_existing_quiz_progress_and_web_native_regressions`** | `apps/driver-app/components/academy/module-reader.tsx` (僅引用 `react`, `react-native`, `@/components/ui/*`, `./types`, `./material-resource`；開啟教材不觸發完訓或送出測驗) & `apps/driver-app/components/academy/material-resource.ts` (僅使用 `react-native` `Linking`).                                                                                     | **舊版 → 修正版**：完整保留課程列表／詳情 API、無答案題目、測驗計分（不及格重考／及格完訓）、進度／效期與 `C062` Web/native import 分離；無新增 `expo-av` / `expo-video` / `react-native-video` / `react-native-maps` 等無條件 native import。                                                                                     | `pnpm exec vitest run tests/unit/driver-academy-actual-material-reader-20261015/ tests/unit/system-remediation/sr-academy-fe-001/ tests/unit/system-remediation/sr-academy-be-001/ tests/unit/system-remediation/sr-qa-newfeatures-001/c059-driver-academy-training.test.ts tests/unit/system-remediation/sr-driver-web-001/` (exit `0`, 8 files / 76 tests PASS). | Hosted PG/browser E2E not started on this VM per `AGENTS.md`.                                                                                     |
| **`c059_material_exact_candidate_validation`**               | All 4 authorized paths within `write_scopes`; clean commit message `<TASK-ID>: <summary>` with `LLM-Agent`, `Task-ID`, `Reviewer` trailers on `gemini2/driver-academy-actual-material-reader-20261015-clean`.                                                                                                                                                    | **舊版 (`6c4bb6a04b68`)**：`CI/Commit trailers` 因 subject 前綴為 `feat(driver-app):` 失敗。**修正版**：於 clean 分支改用 `<TASK-ID>: <summary>` 通過 `check_commit_trailers.py`、typecheck、lint、8 組共 76 個單元與回歸測試及所有本機 CI 閘門。                                                                                    | `pnpm --filter @drts/driver-app typecheck` (exit `0`), `pnpm --filter @drts/driver-app lint && pnpm lint:root` (exit `0`), `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` (exit `0`).         | Hosted exact-candidate CI (`Commit trailers`, `Runtime mirror guard`, `Smoke acceptance`, `ci-integ`), `Gemini` review, and protected merge pending on new PR. |

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
   - Added `openAcademyMaterialResource(course, module, options)` to open the validated `contentUrl` via the injected `openMaterial` callback or React Native `Linking.canOpenURL` + `Linking.openURL`, returning an `AcademyMaterialOpenedSession` (`statusLabel`, `contentBody`, identity & URL metadata) without introducing any native-only SDK (`expo-av`, `expo-video`, `react-native-video`, or `react-native-maps`).
   - Added `formatAcademyMaterialError` for consistent user-facing error messages on rejected opens.
2. **`apps/driver-app/components/academy/module-reader.tsx`**:
   - Removed the dead `▶` placeholder and removed all hardcoded canned SOP/article paragraphs.
   - Displays course identity (`代碼：{course.courseCode} · 版本：v{course.version}`), active module identity (`單元代碼：{selectedModule.moduleId}`), type badge, duration, and `教材資源位址：{resolution.url}`.
   - Wired an accessible action button (`testID="academy-material-open-${selectedModule.moduleId}"`, `accessibilityRole="button"`) to `handleOpenMaterial`, which invokes `openAcademyMaterialResource`.
   - Renders honest recoverable states:
     - Unavailable URL/scheme: `testID="academy-material-unavailable"` with explicit reason and disabled action button.
     - Rejected opener/player load: `testID="academy-material-error"` with failure reason and retry button (`testID="academy-material-retry"`).
     - Verified open session: `testID="academy-material-active-session"` showing the opened unit identity (`已開啟單元：{moduleTitle} ({moduleId})`) and any returned reader content (`testID="academy-material-loaded-content"`).
   - Resets active session/error state and invalidates in-flight opener promises (`generation`, `inFlight`) whenever the selected module or course/version changes.

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

   - Result: `0` TypeScript errors on all task-owned files (and hosted `CI (integration trunk)/typecheck` passed in `2m57s` on PR #2695).

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

5. **CI Gate Scripts (Trailers, Test Coverage, Classification, Canonical Consistency, Runtime Mirror Guard)**:

   ```bash
   python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD
   python3 tools/ci/check_test_coverage.py
   node tools/ci/check-repo-classification.mjs
   python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD
   python3 tools/ci/git/check_staged_generated_files.py --range origin/dev HEAD
   ```

   - Result: All exit code `0` (`check_commit_trailers: 1 commit(s) OK`).

## 5. R2 Codex continuation (2026-10-16; current delivery evidence)

The sections above remain the original Gemini2/Gemini dated evidence for
`6c4bb6a04b680ff27604f6a868770aa83b596746` and
`4d3b9672628ff26e1318be5beea01ef2e0567e2f`; they are not review or CI of R2.
The assigned R2 branch starts at accepted `dev`
`2aed20cee7c80fca77aeb326ab6c8b8377fee0dd`, with Codex owner and Claude2
independent reviewer. Initial tracked tree was clean; canonical task scopes and
active tasks were checked before editing and showed no overlapping active writer.

### Lineage and repair boundary

- The accepted-base `module-reader.tsx` is byte-identical to the genuine
  `431966bdf2728a76f7b03907974a124ab4a48ae7` original. Its caller still passes
  `course`, `onStartQuiz`, and `onBack`; the Academy module contract is unchanged.
- Reviewed and adopted the useful old `4d3` local helper, material reader,
  mounted tests and this UAT artifact individually. The helper retains the
  existing React Native Linking transport; the reader retains all resource,
  error/retry, duplicate-press and stale-switch protections; all original
  positive, negative, quiz/retake/progress and Web assertions are retained.
  No old branch/history or unrelated accepted files are rewritten.
- The hosted integration unit job `116602746800` failed at historical loader
  line 242 (called at 464). The genuine original path exists upstream and
  locally with replacement disabled, blob
  `4fb3b2461bec5f154c5f53f4b4d15267ff5a4a6e`, SHA256
  `4214e442333f0d4a4f0d164d254a9240ab5d6453be2526ee4126e236d32ea370`.
  This proves a hosted lookup failure, not an absent original source path.
  The bounded repair is a byte-exact fixture in the owned test directory,
  compiled and mounted by the existing harness without querying runtime Git.

R2 verification and candidate identity are pending at this checkpoint. No R2
review, CI, merge, acceptance key or hosted/native media result is claimed.

### R2 finding and acceptance matrix

Commands below ran in the assigned isolated Codex worktree, Node `v22.23.2`,
pnpm `10.33.0`, Vitest `4.1.4`. The verified source checkpoint is
`e7beb2973b9e2fb188b28d0eb0c03c6f4b714112`; subsequent closeout changes only
format the test and add this evidence. The actual final candidate SHA/branch/PR
is bound by the ordinary handoff receipt, not by the historical sections above.
Local machine logs are under `.local/academy-r2/` in that worktree.

| Finding / acceptance | Source and boundary | Original before → R2 result | Command, exit and evidence | Remaining verification |
| --- | --- | --- | --- | --- |
| `C059-F1`, genuine original material counterexample | `fixtures/module-reader.431966.original.tsx.txt` is the complete original production component. `loadHistoricalModuleReader` checks bytes, SHA256 and Git blob digest, compiles it at its original import location, and mounts it with real React hooks. | Original has no actionable video glyph and never calls opener; two SOP resources and two article resources display the same canned text. R2 keeps all original assertions and additionally checks noninteractive glyph and equal canned paragraphs. The fixed reader opens the selected resources instead. | `pnpm exec vitest run tests/unit/driver-academy-actual-material-reader-20261015/` originally passed 8/8 with full Git history (`old-harness-local.log`, exit 0). R2 mounted results: `final-empty-history.log`, exit 0, 8/8. Digest checks establish provenance; mounted interactions establish behavior. | Source-only evidence; real media playback is outside these doubles. |
| R2 hosted lookup failure | Old `loadHistoricalModuleReader` called `git show` at runtime; now it reads tracked exact original bytes and checks commit/path/blob/hash provenance before the same compile/mount operation. Node loader/extension hooks are restored after the suite. | Controlled empty Git history reproduces the exact old fatal path message: 1 failed / 7 passed, exit 1. Same environment with R2: 8/8 pass, exit 0. No lookup catch, skip, fabricated before, weakened assertion or workflow change. | `git init --bare .local/academy-r2/empty-history.git`; `GIT_DIR="$PWD/.local/academy-r2/empty-history.git" pnpm exec vitest run tests/unit/driver-academy-actual-material-reader-20261015/`. Logs: `old-harness-empty-history.log` → `final-empty-history.log`. This controlled environment demonstrates the harness dependency; it does not identify the original hosted checkout root cause. | New exact-candidate hosted CI still required. |
| `c059_actual_selected_material_read_or_play` | Adopted old `4d3` `ModuleReader.handleOpenMaterial` / `openAcademyMaterialResource` without changing product bytes. Actual accessible Pressable → selected URL through doubled RN Linking, with full selected course/module identity. | All original video/SOP/article open actions and distinct SOP/article resource switches pass; no generic content is rendered. Course title/code/version retained. | Affected regression command below: 8 files / 76 tests, exit 0 (`regressions.log`). | `Linking` is a socket-free boundary double. Strings returned by its test double exercise optional loaded-content rendering; real RN Linking opens an external reader/player and does not fetch inline document text. |
| `c059_material_unavailable_error_and_resource_switch` | Same adopted URL validation, `generation` / `inFlight`, missing/unavailable, error/retry and session identity checks. | Missing/invalid URL never opens or shows canned material; rejected open and unsupported transport show error and retry succeeds; duplicate presses and stale response after selection switch are guarded; course/version switch clears session. | Same 76-test regression, exit 0; all original negative/positive assertions retained. | No real network, provider, native player or OS application availability is claimed. |
| `c059_existing_quiz_progress_and_web_native_regressions` | Real mounted `academy.tsx` → reader → quiz/result/retake; unchanged BE domain/service/controller and C059/C062 regressions. | Material open does not submit quiz or complete course. Fail → retake → pass and record refresh pass, alongside scoring/expiry/qualification regressions. C062 imports unchanged; no new SDK/native import. | Same 76-test regression, driver-app typecheck exit 0, driver-app and root lint exit 0. | Hosted/native export/browser are not executed on this VM. Existing accepted policy and credit remain unchanged. |
| `c059_material_exact_candidate_validation` | All changes remain in the original four scopes, including two fixture/provenance leaves in the owned unit directory. Old `6c4` / `4d3`, PR2699 and Gemini old-SHA reviews remain historical truth. | Ordinary anchor commits and non-force pushes preserve history. Full-range trailer/coverage/classification/consistency/generated-file checks pass locally. No owner approval/merge/acceptance claim. | Commands below. New same-SHA Claude2 review, required hosted CI and protected merge are pending; handoff creates a new ordinary candidate/generation. | All four own acceptance records remain pending until actual lifecycle evidence. Root-wide optional test typecheck fails as detailed below; it is not reported as passed. |

### R2 checks and original CI evidence

- **Affected unit/regression PASS (exit 0, 8 files / 76 tests):**

  ```bash
  pnpm exec vitest run \
    tests/unit/driver-academy-actual-material-reader-20261015/ \
    tests/unit/system-remediation/sr-academy-fe-001/ \
    tests/unit/system-remediation/sr-academy-be-001/ \
    tests/unit/system-remediation/sr-qa-newfeatures-001/c059-driver-academy-training.test.ts \
    tests/unit/system-remediation/sr-driver-web-001/
  ```

- **Affected typecheck PASS:** `pnpm --filter @drts/driver-app typecheck`,
  exit 0 (`typecheck.log`).
- **Lint PASS:** `pnpm --filter @drts/driver-app lint` and `pnpm lint:root`,
  each exit 0 (`lint-driver.log`, `lint-root.log`).
- **Optional full root test typecheck FAIL:**
  `pnpm exec tsc -p tsconfig.json --noEmit`, exit 2
  (`typecheck-root.log`). Diagnostics concern other paths (e.g.
  `apps/bank-console-web/lib/bank-user-identity.ts` unresolved
  `@drts/tenant-auth/*`, passenger-client resolution and cross-worktree private
  `ApiClient` identities). There is no diagnostic whose file is the owned
  Academy test/helper/reader. This is a real failing check, not a full root pass
  or proof that every baseline diagnostic is preexisting. No broader files are
  modified to conceal it; required hosted typecheck remains authoritative.
- **Local full-range gates PASS (each exit 0):**

  ```bash
  python3 tools/ci/git/check_commit_trailers.py --base 2aed20cee7c80fca77aeb326ab6c8b8377fee0dd --head HEAD
  python3 tools/ci/check_test_coverage.py
  node tools/ci/check-repo-classification.mjs
  python3 tools/ci/git/check_canonical_consistency.py --ci --base 2aed20cee7c80fca77aeb326ab6c8b8377fee0dd --head HEAD
  python3 tools/ci/git/check_staged_generated_files.py --range 2aed20cee7c80fca77aeb326ab6c8b8377fee0dd HEAD
  git diff --check 2aed20cee7c80fca77aeb326ab6c8b8377fee0dd HEAD
  ```

The old Product smoke failure was investigated beyond its nonspecific annotation:
[run 38786702131 / job 116601502221](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38786702131/job/116601502221).
`gh api --allow-escape-sequences repos/ajoe734/drts-fleet-platform/actions/jobs/116601502221/logs`
retrieved the actual log. Its `Failed Tests 1` section identifies the same
historical `git show` lookup at lines 242/464 (1 failed, 9854 passed, 47 skipped;
Unit exited 1 and API Unit was skipped). The saved bounded excerpt is
`.local/academy-r2/original-product-smoke-failure-excerpt.log`, with the full log
in `original-product-smoke-unit.log`. This establishes the identified Unit
failure's repair boundary; it does not claim that R2's full Product smoke or API
Unit passed. The earlier summary link's job `116600445139` is skipped
`readonly-dev-metadata`, not the failing unit job.

All local checks are socket-free. No product/dev/preview/browser/HTTP/PG/Docker
server or cloud/IAM/provider/worker control/deployment was started. The separate
unit-budget/coverage task is not duplicated or made a new Academy gate.
