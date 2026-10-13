# Driver 設定頁明示姓氏與 Profile PATCH

Task: `DRIVER-EXPLICIT-SURNAME-PROFILE-SETTINGS-20261013`。Owner Codex，reviewer Codex2。
Frozen spec SHA-256: `5f454c5bebfe530d0766e1623b6286a18c7d686f50ba12bf49738a052c97e376`。

## 來源 gate 與修正依據

開始來源／測試修改前，兩個原任務均為 genuine source `done`，各自的候選、review、CI、正常 merge 及三項 acceptance 已齊備：

| 來源             | Candidate／reviewed SHA                    | CI                                           | PR／merge SHA                                                                                                 |
| ---------------- | ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Profile 姓氏來源 | `96f6099ebd24f557689c7baf84bb0391cbd93b98` | success、同 candidate SHA；run `38407049114` | [#2615](https://github.com/ajoe734/drts-fleet-platform/pull/2615)、`4671ccda0bee867942bf278b240d896d287e488c` |
| 完單車資輸入     | `df757486f840e769df2e8e74aaaa641a25534fd1` | success、同 candidate SHA；run `38404585367` | [#2614](https://github.com/ajoe734/drts-fleet-platform/pull/2614)、`cf20c1339a06e77618d7739d7874e5fa3ac5c9b3` |

本任務 base 為 `4671ccda0bee867942bf278b240d896d287e488c`，包含上述兩個 merge。完整 gate snapshot 保留於 task `.local` evidence，與原 task acceptance artifact 相互核對；本任務沒有採用 held Receipt 工作樹或變更原 owner/reviewer。

實際依據：

- `SettingsScreen` 現有 `getDriverProfile` → `profileValuesFromRecord` → draft → `buildProfileCommand` → `getDriverClient().updateDriverProfile`。
- `FormField` 接受 `TextInputProps`、`error`、`helpText`，真正的 `TextInput` 能編輯並繼承 accessibility props；以 `profileLoaded && !saving` 控制。
- `UpdateDriverProfileCommand.driverSurname?: string` 與 `DriverProfileRecord.driverSurname?: string` 已由來源任務接受。SDK `updateDriverProfile` 使用原 `/api/driver/profile` PATCH 與 `body: command`；GET 讀取相同目前司機資料。身份仍由既有 provisioned session／Bearer client 決定。
- `DriverProfileService.normalizeExplicitSurname` 僅接受提供的非空文字、以 `trim()` 去掉首尾空白；省略時保留原值。沒有單字／單字元限制，沒有 null／清空政策。

## 產品行為

姓名旁新增「姓氏（自行提供）」，預設與缺省 GET 都顯示空欄／尚未提供。姓名與 avatar 首字不作為姓氏來源。未觸碰的 legacy 空欄不 dirty、不阻擋原聯絡資料儲存；command 與 serialized JSON 完全省略 `driverSurname`，沒有 own empty/null/undefined property。

明示文字以首尾 trim 後的值傳送；複姓、外文與內部空格保留。已保存值從 GET hydration 並在其他資料編輯時繼續傳遞。清空已保存值、或明示只含空白的文字，顯示對應欄位錯誤，UI 儲存禁用且 handler bypass 仍拒絕。helper 建構 command 前也檢查同一 surname error。沒有聲稱成功刪除或自行創設刪除政策。

維持原 Profile／preferences 的 `Promise.allSettled`、dirty/error/saved 邏輯。Profile PATCH 失敗時保留草稿與錯誤；preferences 成功不能清除失敗的 Profile draft；重試只傳送仍 dirty 的 Profile。未配置身分、GET 404、session 失效、cache clear、saving 與原 email 驗證都有實際 caller 回歸。GET 404 不建立新 Profile。

唯一產品修改為 `settings.tsx`、`settings-form.ts`、`driverStrings.settings.surname`。原字串 namespace／值，特別是 `driverStrings.trip`，維持來源 merge 內容；API、SDK、DB、原 fare tests 與原 Receipt 均未修改。

## 回歸與逐項證據

測試使用 `settings-caller-probe.cjs` 的隔離 Node loader，載入真正的 SettingsScreen、FormField、ActionButton、helper、身份/cache/session函式、Driver client、SDK，以及已接受的 `DriverProfileService`。只控制 RN host primitives、router、Expo constants、SecureStore 字串邊界與 fetch。fetch 收集 SDK 的 serialized JSON／headers，再呼叫正式 service `updateProfile/getProfile`；沒有替換姓氏處理邏輯。identity fixture 為合成 provisioned session，實際 SDK 必須傳送其 Bearer token；不呼叫真 provider。

Native `onChangeText`／`onPress` 與實際 editable／disabled props 是可操作元件證據；react-test-renderer 是 repository unit renderer，不是實機／browser。Profile service 使用 in-memory fixture，沒有真 PG 或 HTTP auth guard／網路證明。

| Finding／驗收項                                                                         | 原始碼依據與修改位置                                                                                                 | 舊版重現 → 修正版結果                                                                                                                                                             | 命令、退出碼、版本與證據位置                                                                                                                                                                                            | 未驗項／限制                                                                                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Settings 沒有明示 surname producer／`driver_explicit_surname_settings_truthful_capture` | SettingsScreen 姓名旁的 FormField；helper default/hydrate/equal/validate/build；settings surname strings             | base `4671ccda` 真 caller `capture` 因 input 數為 0 而 fail；相同舊版 `legacy-control` 真 PATCH/GET pass。修正版支持缺省、複姓、外文、首尾 trim、已保存值保留、清空／空白拒絕     | 舊版 Node probe capture exit 1、control exit 0；fixture 檔案由 base `git show` 擷取，SHA/blob/hash 保留於 manifest。新版 helper 7 cases + caller 16 cases；命令與結果見下列 checks／task evidence                       | 自行提供姓氏不是身分或法律／發行者權威驗證                                                             |
| `driver_explicit_surname_actual_settings_patch_readback_regressions`                    | 真 caller → typed helper → current identity client → SDK JSON PATCH → production service → SDK GET → remount hydrate | 明示／compound capture、unrelated edit preserve、legacy omit、拒絕 clear/blank、profile failure/retry、preferences-only partial success、saving/load/session/cache/原 email guard | 受影響 7 suites／147 cases pass，exit 0，零 skip；包含本任務 23 cases、既有 settings/profile 與來源 surname/fare 回歸。版本 Node 22.23.2、pnpm 10.33.0、Vitest 4.1.4。完整 logs 和檔案 hash 在原 task `.local` evidence | 模擬 fetch/native/router/storage；無 HTTP guard、真 PG／重啟持久性、Android/iOS 或 provider acceptance |
| `driver_explicit_surname_settings_same_candidate_review_ci_merge`                       | 原 Codex2、same candidate lifecycle 與 task branch                                                                   | owner source checks 已完成；候選以 handoff 的 full SHA 鎖定，後續不可改写                                                                                                         | handoff 的 `CANDIDATE_SHA`／branch／PR head 必須一致，candidate manifest 記錄 full SHA、source hashes、checks 與 generation。review、hosted CI、protected merge 由正常 lifecycle 後續記錄                               | handoff 時 review／CI／merge／三項正式 acceptance pending，owner 不 self-approve、不呼叫 done          |

可重跑 checks（在 assigned worktree，無 product server）：

```bash
pnpm exec vitest run tests/unit/driver-explicit-surname-profile-settings-20261013/ tests/unit/driver-app-settings-form.test.ts tests/unit/driver-settings.test.ts tests/unit/driver-profile.test.ts tests/unit/driver-explicit-surname-profile-capture-20261013/ tests/unit/driver-completion-actual-fare-input-20261013/
pnpm --filter @drts/driver-app typecheck
pnpm exec tsc -p tests/unit/driver-explicit-surname-profile-settings-20261013/tsconfig.json --noEmit
pnpm exec eslint apps/driver-app/app/settings.tsx apps/driver-app/lib/settings-form.ts apps/driver-app/lib/strings.ts tests/unit/driver-explicit-surname-profile-settings-20261013/ --max-warnings=0
pnpm exec prettier --check apps/driver-app/app/settings.tsx apps/driver-app/lib/settings-form.ts apps/driver-app/lib/strings.ts tests/unit/driver-explicit-surname-profile-settings-20261013/ docs/04-uat/driver-explicit-surname-profile-settings-20261013.md
git diff --check
```

Driver app／scoped typecheck、scoped lint、format、diff 均 exit 0。沒有宣稱 full workspace typecheck、full unit suite、API 全套、native、E2E 或 dev deploy 通過。

初輪 fixture 結果另保留：3 caller fixture fail／38 pass（spinner 無按鈕文字、refresh 路徑錯誤、cache-clear 立即 redirect）。修正僅限本任務測試邊界，未 mock 被驗證邏輯。初輪 scoped typecheck exit 2（新測試 own undefined 違反 exactOptionalPropertyTypes、helper 引入字串的 Driver alias）；已改為真省略欄位與 helper surname error codes／頁面文案映射，重新 typecheck pass。首輪格式檢查發現 settings.tsx 格式，已由 Prettier 修正；這些初輪結果不列為驗收通過。

原 task artifact：`/home/lupin/workspace/drts-fleet-platform/.local/driver-explicit-surname-profile-settings-20261013-root/evidence/candidate-evidence.json`。保留 baseline、各輪 logs、版本、完整 commands、source/report SHA-256、候選／generation 與來源 gate snapshot。後續 review／CI／merge evidence 沿用此 artifact，不以新摘要掩蓋 pending。

本單元不完成原 Receipt、真人／法律、PSP/payment、native、全系統或公開／共享 dev acceptance；不啟動本 VM 產品服務、不 dispatch cloud/workflow、不解除原 parent HOLD。
