# SR-QA-DRIVER-001 — 司機開通／設備／班次／行程／收益驗收

- Task ID: `SR-QA-DRIVER-001`
- Title: 司機開通／設備／班次／行程／收益驗收
- Status: `in_progress` -> Ready for review handoff
- Owner: `Gemini2`（由 Chairman 自 Claude2 改派；保留 Claude 為 Reviewer）
- Reviewer: `Claude`
- Base SHA: `5aaf95218d5272d6e19555d67e03e0f7a4e36e4e`（`origin/dev` tip）
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)`
- Branch: `gemini2/sr-qa-driver-001`
- Worker cwd: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-qa-driver-001`
- Capabilities: `C049, C050, C051, C053, C054, C055, C056, C057, C058, C060, C061, C062`
- Dependencies: `SR-UAT-HARNESS-001`, `SR-DRIVER-WEB-001`, `SR-INVOICE-001`, `SR-MAIL-002`（經 `ai-status.sh show` 確認全數為 `done`）
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Execution Ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
- Task Spec Ref: `docs/03-runbooks/system-remediation-20260906/SR-QA-DRIVER-001.md`
- Sourced Follow-up Gap Task: `SR-DRIVER-GAPS-20260911`（owner `Codex`, reviewer `Claude`, `backlog`）

---

## 0. 改派接手與歷史延續說明

前任 owner `Claude2` 完成驗收核心測試並交付候選（PR #1985）；該候選之 commit trailers 格式不符及一處未使用的變數 lint 錯誤，已由獨立修復任務 `SR-QA-DRIVER-001-UNBLOCK-HISTORY-REPAIR` 乾淨驗證並合併。隨後 Chairman 因 `Claude2` 配額終止（quota streak 2/1）將本任務改派至健康、具 dispatch 能力的 `Gemini2`，任務狀態重設為 `todo`。

新任 owner `Gemini2` 接手後：

1. 從當前 `origin/dev`（`5aaf95218`）建立並同步任務分支 `gemini2/sr-qa-driver-001`。
2. 重跑並驗證 `tests/unit/system-remediation/sr-qa-driver-001/` 下的全部 7 個單元測試檔（**30/30 passed**），確認無業務回歸與型別錯誤。
3. 補齊 `write_scopes` 與 brief 所列之 E2E 證據層 `tests/e2e/system-remediation/sr-qa-driver-001/sr-qa-driver-001.spec.ts`（採用 `UatEvidenceRecorder` 與 `UatNamespaceManager` 標準 harness，涵蓋 4 大端到端場景）。
4. 格式與程式碼風格經 `prettier --check` 與 `eslint --max-warnings=0` 100% 通過。
5. 確認由前階段直測所確立的 4 項產品缺口子任務 `SR-DRIVER-GAPS-20260911` 已在任務板上（狀態 `backlog`），承接非本驗收任務 write_scopes 的產品程式修復。

---

## 1. 任務工作範圍

本任務為驗收工作（`verification`），不跨 scope 修改業務核心程式碼：

- 針對已實作之功能（C049, C050, C051, C053, C054, C055, C056, C057），透過真實服務實例、DB/API 回讀與狀態轉移進行驗證，不以 mock fixture 或靜態常數檢查取代真實邏輯。
- 針對存在產品缺口之能力（C051 司機停權未查、C057/C058 司機端 statement 存取權限與可下載實體 artifact 缺口、C060 通知偏好未影響通知發送、C061 司機執照缺日期模型與自動禁派），撰寫驗證當前真實行為之回歸測試，並建立來源追溯之修復子任務 `SR-DRIVER-GAPS-20260911`，不在驗收範圍內私自偷改業務碼或假裝通過。
- 針對 Web 預覽分流（C062），由已結案之相依任務 `SR-DRIVER-WEB-001` 及 `SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911`（run 34570415756, 3/3 routes passed）提供完整回歸證據，不重複造輪。

---

## 2. 測試架構與檔案劃分

### 2.1 Layer B — 單元與服務整合測試（`tests/unit/system-remediation/sr-qa-driver-001/`）

共 7 個測試檔案、30 項測試案例，全部可於本 VM 立即執行並通過：

1. `device-session-binding.test.ts`（C050, 7 tests）：
   - 裝置綁定、解綁、邀請碼開通與 session 狀態更新。
   - 驗證 `DriverDeviceSessionService.revoke` 之本人限定存取（無 identity 或不同司機 identity 呼叫一律回傳 403 `DRIVER_DEVICE_BINDING_FORBIDDEN`，且綁定保持 active 回讀）。
2. `dispatch-trip-lifecycle.test.ts`（C053, C054, C055, 10 tests）：
   - 派車接受／拒絕（含理由碼必填檢核）、行程出發（`enroute_pickup`）→ 到達接送點（`arrived_pickup`）→ 開始行程（`on_trip`）→ 完成行程（`completed`）。
   - 完工證明防護：缺少必要照片證明時拒絕完工（400 `MIN_PHOTO_COUNT_NOT_MET`）；格式錯誤之證明回絕；重複按鍵冪等性保證。
3. `supply-onboarding-revision.test.ts`（C049, 2 tests）：
   - 送審退件補件流程：`requestRevision` 成功將審查狀態改為 `needs_revision`，版本號遞增為 rev 2，且透過 `getSubmission` 確實讀回。
   - 過期／衝突修訂重送之負向防護。
4. `shift-clockin-suspension-gap.test.ts`（C051, 2 tests）：
   - 上下線出勤計時與重複上線衝突（409 `SHIFT_ALREADY_ACTIVE`）。
   - 帶入未核准／維保車輛時回絕（400 `VEHICLE_NOT_DISPATCHABLE`）。
   - 證實現況缺口：`ShiftAttendanceService.clockIn()` 僅檢核車輛可派性，未查司機本身停權狀態（已納入 `SR-DRIVER-GAPS-20260911`）。
5. `driver-earnings-statement-access.test.ts`（C057, C058, 5 tests）：
   - `PlatformEarningsController.resolveDriverId` 之本人限定存取驗證（讀取自己收益成功，跨司機查詢回傳 403 `DRIVER_IDENTITY_MISMATCH`，未驗證回傳 401 `AUTH_REQUIRED`）。
   - 證實現況缺口：`BillingSettlementController` 的 `driver-statements*` 路由缺乏 `@RequireRealms(driver)`，且 service 層無司機權限過濾；`DriverStatementRecord` 無可下載之 PDF/bytes 欄位（已納入 `SR-DRIVER-GAPS-20260911`）。
6. `driver-settings-notification-effect.test.ts`（C060, 1 test）：
   - 司機設定與通知開關儲存與回讀。
   - 證實現況缺口：`notificationsEnabled` 偏好未在 `AuditNotificationService` 形成實質抑制（已納入 `SR-DRIVER-GAPS-20260911`）。
7. `driver-license-expiry-gap.test.ts`（C061, 3 tests）：
   - 車輛端正確實作之對照驗證：`listExpiringPolicies(windowDays=30)` 視窗查詢，保單過期自動使車輛轉為 `insuranceStatus=expired` 且 `dispatchableFlag=false`。
   - 證實現況缺口：司機端 `DriverRegistryRecord` 缺乏執照到期日欄位（僅有手動 boolean `licensesValid`），無從執行 T-30/T-7 到期自動提醒與禁派（已納入 `SR-DRIVER-GAPS-20260911`）。

### 2.2 Layer C — Playwright E2E 證據層（`tests/e2e/system-remediation/sr-qa-driver-001/sr-qa-driver-001.spec.ts`）

使用 `UatEvidenceRecorder` 與 `UatNamespaceManager` 記錄端到端契約與資源關聯，並依 VM 限制規範調用 `recordLiveLimitation` 誠實揭露環境邊界：

- `E2E-1 (C049/C050)`: 司機開通送審退件補件與裝置 session 綁定／本人撤銷權限守衛。
- `E2E-2 (C051)`: 班次出勤 clock-in、車輛禁派檢核、重複上線攔截與 clock-out 結算工時。
- `E2E-3 (C053/C054/C055)`: 司機行程狀態機閉環（accept -> depart -> arrived -> start -> complete）與照片證明強校驗。
- `E2E-4 (C056/C057/C058/C060/C061/C062)`: 位置心跳批量上報去重、收益本人限定存取、對帳單缺口與保單到期查詢。

---

## 3. 各能力驗收判定對照表

| 能力 ID  | 角色               | 能力／應完成工作                    | 驗收判定與證據                                                                                                                                                             | 測試檔案                                               |
| :------- | :----------------- | :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **C049** | 新司機             | 文件建檔、送審與核准後開通          | 已驗證退件補件（`requestRevision`）寫入與 `getSubmission` 回讀（status `needs_revision`, rev 2），以及過期修訂防護。核准開通由既有 `int-sup-001` 與 `supply-review` 覆蓋。 | `supply-onboarding-revision.test.ts` (2 tests)         |
| **C050** | 換機／遺失裝置司機 | 裝置綁定、解綁、復原與 session 更新 | 已驗證本人綁定、重新整理、本人撤銷有效性，以及跨司機非法撤銷攔截（403 `DRIVER_DEVICE_BINDING_FORBIDDEN`）。                                                                | `device-session-binding.test.ts` (7 tests)             |
| **C051** | 值勤司機           | 上／下線、班次歷史與出勤計時        | 已驗證正常打卡、工時累計、重複上線攔截與非可派車輛回絕（400 `VEHICLE_NOT_DISPATCHABLE`）。**確認產品缺口**：未檢核司機自身停權，已立案 `SR-DRIVER-GAPS-20260911`。         | `shift-clockin-suspension-gap.test.ts` (2 tests)       |
| **C053** | 接單司機           | 收新任務、接受／拒絕與逾時          | 已驗證接受任務、拒單理由碼檢核（400 `REJECT_REASON_REQUIRED`）、狀態同步與冪等保護。                                                                                       | `dispatch-trip-lifecycle.test.ts` (涵蓋於 10 tests)    |
| **C054** | 執行行程司機       | 出發→到達→開始→完成／取消           | 已驗證嚴格狀態機鏈路（`accepted` → `enroute_pickup` → `arrived_pickup` → `on_trip` → `completed`），非法跳步一律攔截。                                                     | `dispatch-trip-lifecycle.test.ts` (涵蓋於 10 tests)    |
| **C055** | 司機／乘客簽收者   | 照片／簽收證明與完成條件            | 已驗證必要完工照片缺漏時禁止完工（400 `MIN_PHOTO_COUNT_NOT_MET`），證明完整時正常結案。                                                                                    | `dispatch-trip-lifecycle.test.ts` (涵蓋於 10 tests)    |
| **C056** | 司機               | 背景定位、導航、離線排隊與重連      | 由既有 `int-mob-001-batch-heartbeat-idempotency.test.ts`、`driver-heartbeat.http.test.ts` 與 `regulatory-registry.service.ts` 批次位置去重邏輯覆蓋，已有功能先驗不重寫。   | 引用既有整合測試                                       |
| **C057** | 司機               | 收益日週月、服務費與補助追溯        | 已驗證 `PlatformEarningsController.resolveDriverId` 之本人限定存取門禁（本人 200，跨司機 403 `DRIVER_IDENTITY_MISMATCH`，未認證 401 `AUTH_REQUIRED`）。                    | `driver-earnings-statement-access.test.ts` (3 tests)   |
| **C058** | 司機               | 下載自己的 statement／收據          | **確認產品缺口**：司機 realm 無權存取 `driver-statements` 路由，且後端無司機隔離過濾與 PDF bytes 下載。已立案 `SR-DRIVER-GAPS-20260911`。                                  | `driver-earnings-statement-access.test.ts` (2 tests)   |
| **C060** | 司機               | 個資、通知偏好與裝置自檢            | 已有 profile/settings 儲存與回讀覆蓋。**確認產品缺口**：`notificationsEnabled` 未實質抑制通知寄送。已立案 `SR-DRIVER-GAPS-20260911`。                                      | `driver-settings-notification-effect.test.ts` (1 test) |
| **C061** | 證照到期司機／主管 | 到期提醒與禁止接單                  | 車輛保單到期查詢與自動禁派驗證通過。**確認產品缺口**：司機執照缺日期模型，無自動到期提醒與禁派。已立案 `SR-DRIVER-GAPS-20260911`。                                         | `driver-license-expiry-gap.test.ts` (3 tests)          |
| **C062** | 開發驗證人員       | Web 預覽作為基本巡檢入口            | 已由 `SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911` 與 `SR-DRIVER-WEB-001`（PR #1978, GitHub Actions run 34570415756）完整驗證通過（3/3 路由通過），不重複測試。               | 引用前置驗收報告                                       |

---

## 4. 驗證指令與執行結果

本任務於此工作區（`gemini2-sr-qa-driver-001`）實際執行以下命令：

| 檢查項目           | 執行指令                                                                                                                                                                              | Exit Code    | 結果摘要                                                                                   |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------- | :----------------------------------------------------------------------------------------- |
| **單元測試**       | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-driver-001/`                                                                                                                | `0`          | **7 test files, 30 passed** (100% 通過)                                                    |
| **ESLint 檢查**    | `pnpm exec eslint tests/unit/system-remediation/sr-qa-driver-001 tests/e2e/system-remediation/sr-qa-driver-001 --max-warnings=0`                                                      | `0`          | **0 errors, 0 warnings**                                                                   |
| **Prettier 檢查**  | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-driver-001 tests/e2e/system-remediation/sr-qa-driver-001 docs/04-uat/system-remediation-20260906/SR-QA-DRIVER-001.md` | `0`          | **All matched files use Prettier code style**                                              |
| **Git Diff 格式**  | `git diff --check`                                                                                                                                                                    | `0`          | 無空白、換行或格式錯誤                                                                     |
| **Playwright E2E** | `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-driver-001`                                                                                               | 未在本機執行 | VM 限制禁止啟動 dev-server/browser，E2E spec 採 `UatEvidenceRecorder` 記錄並留待 CI 跑實機 |

---

## 5. 涉及之真實資源 ID 與狀態流轉

- 司機裝置綁定：`drv-demo-001` 配對 `qa-device-001`..`qa-device-006`，產生真實 `bindingId`，透過 `isBindingActive` 回讀狀態。
- 供給審查件：種子資料 `sub_u51`（`fleet-demo-003`，原 `in_review` rev 1），經 `requestRevision` 成功轉為 `needs_revision` rev 2。
- 班次出勤：種子司機 `drv-demo-003`、`drv-demo-004`，產生真實 `shiftId` 與 `attendanceId`，出勤時數精確計算至小數點兩位。
- 行程任務：`taskId` 關聯 `orderId`，依序流轉 `accepted` → `enroute_pickup` → `arrived_pickup` → `on_trip` → `completed`，寫入 `dispatchTraceLogs`。
- 收益查詢：`drv-demo-001` 讀取真實彙總與依平台明細；跨司機嘗試讀取 `drv-demo-002` 被拒絕。
- 車輛保單：種子車輛 `veh-demo-001` 與保單 `policy-demo-001`，啟動過期測試後讀回 `insuranceStatus: "expired"` 與 `dispatchableFlag: false`。

---

## 6. 未做的部分與環境限制揭露（誠實記錄，不冒充完成）

1. **未啟動本地瀏覽器或開發伺服器（VM 限制）**：依據派工守則，本 VM 禁止執行 `pnpm dev`、`docker compose`、`pnpm exec playwright test` 等會啟動本地伺服器之指令。E2E 規範以 `UatEvidenceRecorder` 記錄於 `tests/e2e/system-remediation/sr-qa-driver-001/sr-qa-driver-001.spec.ts`，真實執行留待 CI runner 或遠端驗收環境。
2. **未在實體手機執行 Native 測試（真機邊界）**：包含實體相機拍攝、iOS/Android GPS 權限、背景被殺程序恢復、真機推播等，屬於外部 live 驗收邊界，由 `SR-LIVE-DRIVER-001` 專門負責，本任務不冒充真機成功。
3. **未在驗收任務內修改產品程式**：前述 4 項確認之產品缺口（C051 班次未查司機停權、C057/C058 司機對帳單存取與下載缺口、C060 通知偏好無實質抑制、C061 司機執照缺到期模型），已依規範正式立案為 `SR-DRIVER-GAPS-20260911`（owner `Codex`, reviewer `Claude`, `backlog`），不在本驗收任務 write_scopes 內越界修改。

---

## 7. 結案與交接程序

- 本任務已完成全部 write_scopes 內成果（單元測試、E2E 測試、UAT 報告）。
- 提交符合規範格式之 commit（包含 `LLM-Agent: gemini2`、`Task-ID: SR-QA-DRIVER-001`、`Reviewer: Claude` 等 trailers）。
- 以普通（non-force）push 推送至 remote 分支 `gemini2/sr-qa-driver-001`。
- 透過 `ai-status.sh handoff` 交接給 Reviewer `Claude`，由 candidate lifecycle 負責後續 review、CI 與自動 merge 結案，owner 不直接標記 `done`。
