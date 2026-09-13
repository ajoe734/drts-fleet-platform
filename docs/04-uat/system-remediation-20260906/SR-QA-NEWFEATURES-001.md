# SR-QA-NEWFEATURES-001 — 請假／學院／Host端到端驗收

- Task ID: `SR-QA-NEWFEATURES-001`
- Title: 請假／學院／Host端到端驗收
- Status: `in_progress` -> Ready for review handoff
- Owner: `Gemini` (Availability-first reassignment while Claude2 was unavailable/occupied)
- Reviewer: `Gemini2`
- Base SHA: `283a065e03a3a2f25c00d2a65949d7fa4c257ec3` (`origin/dev` tip, containing merged `SR-WIRE-001` #1974)
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)`
- Branch: `gemini/sr-qa-newfeatures-001`
- Worker cwd: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-qa-newfeatures-001`
- Capabilities: `C012, C052, C059, C071`
- Dependencies: `SR-UAT-HARNESS-001` (`done`), `SR-WIRE-001` (`done` via PR #1974)
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Execution Ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
- Task Spec Ref: `docs/03-runbooks/system-remediation-20260906/SR-QA-NEWFEATURES-001.md`
- Gaps Ref: `N01` (Leave), `N02` (Academy), `N03` (Host)

---

## 0. 任務背景與改派接手說明

本任務原隸屬於 `system-remediation-20260906` 補網波次之核心端到端驗收工作卡（`verification` 類型），涵蓋系統 134 項能力中最新落地之四大核心能力：

1. **C052 (N01)**: 司機請假申請、審核與班表／可派狀態連動
2. **C059 (N02)**: 司機教學影片、SOP、測驗作答、成績完訓、到期重訓與服務資格連動
3. **C071 (N02)**: 車行訓練管理員看真完訓率、逾期名單與單一人員證據下鑽
4. **C012 (N03)**: 車主 Host 登入入口、所有權授權、受限唯讀模型、資料隔離與變更所有權

前置相依任務 `SR-WIRE-001`（PR #1974，commit `283a065e0`）已將 `DriverLeaveModule`、`DriverAcademyModule`、`HostViewModule` 正式註冊於 `AppModule`，補齊 `partner_user` (Host) IAM Actor Policy，並貫通導航入口。本任務以當前 `origin/dev`（`283a065e0`）為 base SHA，建立獨立任務分支 `gemini/sr-qa-newfeatures-001`，進行嚴謹可重跑之跨端契約驗收與回歸測試。

---

## 1. 任務工作範圍與準則

本任務為端到端品質驗收（`verification`），嚴格遵守下列工程紀律：

1. **僅修改指定 write_scopes**：
   - `tests/unit/system-remediation/sr-qa-newfeatures-001/`
   - `docs/04-uat/system-remediation-20260906/SR-QA-NEWFEATURES-001.md`
   - `tests/e2e/system-remediation/sr-qa-newfeatures-001/`
     不越界修改業務核心代碼或共用配置。
2. **真邏輯／資料模型驗證，不以假常數充數**：
   - 沿用權威 API 與領域資料模型，驗收包含正規建立、審核、撤回、評分、成績計算、逾期判定、資料隔離與所有權轉移。
   - 徹底杜絕固定百分比（如舊有 `FX_FLEET_TRAINING`）、假簽章或假送達。
3. **正常案例與關鍵負向案例兼備**：
   - 每個能力皆具備清晰之正向業務路徑與關鍵負向攔截防護（非法時間、重疊請假、跨司機假冒、過期版本作答、跨車行越權、跨車主探測等）。
4. **誠實揭露 VM 環境限制**：
   - 遵照派工規範（禁止於本地啟動 dev server、browser 或 Docker Compose），E2E 規範以 `UatEvidenceRecorder` 記錄端到端契約與資源關聯，並調用 `recordLiveLimitation` 明確揭露環境邊界，由後續 CI runner 與遠端環境執行實機。

---

## 2. 測試架構與檔案劃分

### 2.1 Layer B — 單元與服務整合測試（`tests/unit/system-remediation/sr-qa-newfeatures-001/`）

共 4 個測試套件檔案、44 項測試案例，全部於本環境執行通過（**44/44 passed, 100%**）：

1. `c052-driver-leave-lifecycle.test.ts`（C052, 13 項測試）：
   - **正向業務鏈路**：司機正式入口提交病假申請（產生 `lv_` 唯一 ID、狀態 `pending`、冪等鍵保護）；管理端跨端回讀假單明細與列表；主管審核核准（狀態 `approved`、留存審核人與備註）；核准期間與班表／派單狀態連動（`isDriverOnLeave` 為 true，禁止出勤打卡與上線，回傳 409 `DRIVER_ON_LEAVE`，可派狀態標記為 `ineligible`）；司機生效前撤回（狀態 `withdrawn`，立即恢復出勤與上線資格）；主管審核駁回（狀態 `rejected`，不產生抑制）。
   - **關鍵負向案例**：重疊請假區間嚴格阻擋（409 `LEAVE_OVERLAPPING_REQUEST`，驗證完全重疊、前段重疊、後段重疊與跨司機無衝突）；結束時間早於或等於開始時間（400 `LEAVE_INVALID_TIME_RANGE`）；開始時間倒退超過 15 分鐘寬限期（400 `LEAVE_INVALID_TIME_RANGE`）；缺少必填欄位或假別無效（400 `LEAVE_MISSING_REQUIRED_FIELDS`）；跨司機代請假攔截（403 `LEAVE_FORBIDDEN_ACCESS`）；已撤回假單之重複撤回或審核攔截（409 `LEAVE_INVALID_STATE_TRANSITION`）；查詢不存在假單回傳 404（`LEAVE_NOT_FOUND`）。

2. `c059-driver-academy-training.test.ts`（C059, 14 項測試）：
   - **正向業務鏈路**：司機查詢發布之培訓課程清單與詳情（包含影片與 SOP 模組，嚴格排除答案金鑰 `answerKey`）；提交全對作答獲得 100 分及格，寫入完訓證據與有效期限（`expiresAt = attemptedAt + validityDays * 86400000`）；成績回讀與狀態一致性（`status: "passed"`, `highestScore: 100`）；重考機制驗證（初考 50 分不及格狀態為 `failed`，重考 100 分狀態成功轉為 `passed`，`highestScore` 躍升為 100，`attemptsCount: 2`）；服務資格連動判定（必修全數及格時 `trainingSatisfied: true`, `regulatoryStatus: "passed"`）；到期重訓連動（時間超過 30 天效期，完訓紀錄自動判定為 `status: "expired"`, `isOverdue: true`，服務資格判定轉為 `trainingIncomplete: true`, `regulatoryStatus: "expired"`）；特殊豁免保護（`waived` 檔案保留 `regulatoryStatus: "waived"`, `trainingSatisfied: true`）。
   - **關鍵負向案例**：過期課程版本提交攔截（409 `COURSE_VERSION_STALE`）；漏答或未答完整題目攔截（400 `QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION`）；同一題號重複提交攔截（400 `QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION`）；不存在之選項 ID 攔截（400 `QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION`）；不存在之司機 ID 攔截（404 `DRIVER_NOT_FOUND`）；不存在之課程 ID 攔截（404 `COURSE_NOT_FOUND`）；不存在之測驗紀錄查詢回傳 404（`ATTEMPT_NOT_FOUND`）。

3. `c071-fleet-academy-reporting.test.ts`（C071, 7 項測試）：
   - **正向業務鏈路**：車行培訓摘要（`fleetTrainingSummary`）以真實學員數據動態計算完訓率（`completionPct: "50%"`）、待訓人數（`pendingHeadcount: "1"`）、逾期人數（`overdueIncomplete: 1`），標記 `source: "authoritative"`，徹底取代舊有 `FX_FLEET_TRAINING` 靜態常數；車行花名冊（`fleetRoster`）列出所屬司機之完訓狀態、成績、逾期旗標與最新測驗 ID；單一人員作答證據下鑽（`fleetAttemptDrilldown`），車行訓練管理員可調閱單一學員之各題作答詳情、選取選項與得分。
   - **關鍵負向案例**：跨車行學員作答下鑽嚴格阻擋（403 `ACADEMY_FORBIDDEN_FLEET_ACCESS`）；Controller 租戶邊界防護（Tenant Alpha 身份嘗試調閱 Tenant Beta 之車行培訓數據一律回傳 403）；下鑽測驗 ID 存在但不屬於該司機回傳 404（`ATTEMPT_NOT_FOUND`）；查詢不存在之 attemptId 回傳 404。

4. `c012-host-restricted-view-and-ownership.test.ts`（C012, 10 項測試）：
   - **正向業務鏈路**：車主 Host 角色認證與授權落點（`partner` realm 解析）；自有車輛清單查詢（`listVehicles`，車輛資料齊全且 VIN 脫敏隱私遮罩 `vinMasked`）；受限唯讀端點查詢（收益摘要 `getVehicleEarnings`、維保紀錄 `listVehicleMaintenance`、脫敏行程 `listVehicleTrips`、案件紀錄 `listVehicleCases`）；兩位車主（Host A 與 Host B）資料嚴格隔離（名下車輛互不可見）；車輛所有權動態變更（Ownership Transfer：車輛由 Host A 移轉至 Host B，移轉後原車主 Host A 查詢該車輛立即回傳 404，而新車主 Host B 立即擁有該車輛並能查詢收益、維保、行程、案件）；車輛停用／合約終止（`activeFlag: false`，停用後名義車主存取亦回傳 404）。
   - **關鍵負向案例**：防枚舉安全不變量（Anti-enumeration Invariant：Host B 嘗試以 ID 存取 Host A 車輛資料，一律回傳 404 `HOST_VEHICLE_NOT_FOUND`，決不洩露 403 或車輛存在性）；嚴格唯讀端點防變更（AC-HOST-NEG-2：Host 端點發起 POST / PUT / PATCH / DELETE 請求一律回傳 405 `MUTATION_NOT_SUPPORTED`）；未認證存取回傳 401（`HOST_UNAUTHORIZED`）；跨 Realm 存取攔截（司機 realm 存取 Host 入口回傳 403 `HOST_FORBIDDEN`）；缺少必要 scope 回傳 403。

### 2.2 Layer C — Playwright E2E 證據層（`tests/e2e/system-remediation/sr-qa-newfeatures-001/sr-qa-newfeatures-001.spec.ts`）

使用標準 `UatNamespaceManager` 與 `UatEvidenceRecorder` 記錄端到端契約與資源關聯，並依 VM 限制規範調用 `recordLiveLimitation` 誠實揭露環境邊界：

- `E2E-1 (C052)`: 司機請假申請生命週期、重疊阻擋、主管核准、打卡抑制、撤回與可派資格恢復。
- `E2E-2 (C059)`: 司機學院課程目錄、測驗作答不及格、重考滿分及格、完訓紀錄與服務資格判定。
- `E2E-3 (C071)`: 車行訓練管理員權威彙總動態計算、花名冊檢視、單一人員作答下鑽與跨車行隔離防護。
- `E2E-4 (C012)`: 車主 Host 自有車輛清單、收益／維保／行程／案件受限唯讀、防枚舉隔離、車輛所有權移轉驗證與 405 唯讀防變更保護。

---

## 3. 各能力驗收判定對照表

| 能力 ID  | 領域       | 角色           | 能力／應完成工作                   | 驗收判定與證據                                                                                                                                                                                                                                                                     | 測試檔案與涵蓋項目                                           |
| :------- | :--------- | :------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| **C052** | 司機       | 司機／排班主管 | 請假申請、審核與班表聯動           | **驗收通過**。司機透過正式入口建立病假、事假、特休，回讀狀態一致；主管審核核准後，司機標記休假中，打卡與上線被阻擋（409 `DRIVER_ON_LEAVE`）；撤回後恢復出勤；重疊請假區間嚴格阻擋（409 `LEAVE_OVERLAPPING_REQUEST`）；代人請假嚴格阻擋（403 `LEAVE_FORBIDDEN_ACCESS`）。           | `c052-driver-leave-lifecycle.test.ts` (13 tests)             |
| **C059** | 司機       | 司機           | 教學影片、SOP、測驗與完訓紀錄      | **驗收通過**。發布課程詳情排除答案金鑰；測驗評分精準，分數達門檻合格；重考機制正確更新最高分；完訓計算 30 天有效期限；超過效期自動轉為 `expired` 並連動服務資格失效；全數必修合格連動服務資格 `passed`；特殊豁免司機維持 `waived`。版本不符（409）與漏答（400）嚴格攔截。          | `c059-driver-academy-training.test.ts` (14 tests)            |
| **C071** | 車行與供給 | 車行訓練管理員 | 看真完訓率與逾期名單               | **驗收通過**。培訓摘要動態統計完訓率、待訓人數與逾期人數，標記 `source: "authoritative"`，徹底告別 `FX_FLEET_TRAINING` 靜態常數；花名冊列出所屬司機完訓細節；下鑽功能可檢視單一學員完整答題明細；跨車行下鑽與跨租戶查詢嚴格阻擋（403 `ACADEMY_FORBIDDEN_FLEET_ACCESS`）。          | `c071-fleet-academy-reporting.test.ts` (7 tests)             |
| **C012** | 入口與身份 | 車主 Host      | 只看自有車輛收益／維保／任務／案件 | **驗收通過**。Host 角色解析落點確認；自有車輛清單提供 VIN 隱私遮罩；受限唯讀端點查詢收益、維保、脫敏行程與投訴案件；兩位 Host 彼此資料隔離；車輛所有權移轉（Host A -> Host B）後，原車主立即 404，新車主立即 200 回讀；他人車輛查詢嚴格回傳 404 防探測枚舉；變更請求一律回傳 405。 | `c012-host-restricted-view-and-ownership.test.ts` (10 tests) |

---

## 4. 驗證指令與執行結果

本任務於獨立工作區（`gemini-sr-qa-newfeatures-001`）實際執行以下各項檢查指令：

| 檢查項目           | 執行指令                                                                                                                                   | Exit Code    | 結果摘要                                                                                                            |
| :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :----------- | :------------------------------------------------------------------------------------------------------------------ |
| **單元測試**       | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-newfeatures-001/`                                                                | `0`          | **4 test files, 44 passed** (100% 通過，耗時 2.26s)                                                                 |
| **ESLint 檢查**    | `pnpm exec eslint tests/unit/system-remediation/sr-qa-newfeatures-001 tests/e2e/system-remediation/sr-qa-newfeatures-001 --max-warnings=0` | `0`          | **0 errors, 0 warnings**                                                                                            |
| **Prettier 檢查**  | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-newfeatures-001/ tests/e2e/system-remediation/sr-qa-newfeatures-001/`      | `0`          | **All matched files use Prettier code style**                                                                       |
| **Git Diff 格式**  | `git diff --check`                                                                                                                         | `0`          | 無多餘空白、換行或格式錯誤                                                                                          |
| **Playwright E2E** | `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-newfeatures-001`                                               | 未在 VM 執行 | 遵照派工限制（禁止本機啟動 dev server/browser），E2E spec 以 `UatEvidenceRecorder` 記錄，待 CI/遠端 runner 執行實機 |

---

## 5. 涉及之真實資源 ID 與狀態流轉

- **請假申請生命週期（C052）**：
  - 司機：`drv_test_leave_001`、`drv_test_leave_002`。
  - 假單 ID：`lv_*`（如 `lv-leave-001`），假別涵蓋 `sick`、`annual`、`personal`。
  - 狀態轉變流：`pending` -> `approved`（審核人 `usr_supervisor_ops_001`），核准期間打卡回傳 409 `DRIVER_ON_LEAVE`；或 `pending` -> `withdrawn`，撤回後打卡恢復成功。
- **學院與測驗作答（C059）**：
  - 課程：`crs_qa_safety_001`（DRTS 平台行車安全與應急處理，效期 30 天，及格門檻 80 分）。
  - 測驗作答：`att_qa_001`、`att_fail_001`（得分 50，狀態 `failed`）-> `att_pass_002`（重考得分 100，狀態 `passed`）。
  - 資格狀態：所有必修合格轉為 `regulatoryStatus: "passed"`，效期屆滿轉為 `regulatoryStatus: "expired"`，豁免檔案保留 `regulatoryStatus: "waived"`。
- **車行培訓彙總與下鑽（C071）**：
  - 車行：`fleet_alpha_001`、`fleet_beta_002`。
  - 司機群組：`drv_alpha_001`（王大明，及格）、`drv_alpha_002`（李小華，逾期）。
  - 統計指標：動態計算 `completionPct: "50%"`, `pendingHeadcount: "1"`, `overdueIncomplete: 1`，標記 `source: "authoritative"`。
  - 下鑽作答：`att_drill_001`（回讀具體題目作答與對錯），跨車行下鑽回傳 403。
- **車主 Host 受限讀取與所有權變更（C012）**：
  - 車主：`partner_host_alpha`、`partner_host_beta`。
  - 車輛：`veh_host_a_001`（TDC-1001，VIN 遮罩 `1HGCR******00101`）、`veh_host_a_002`（TDC-1002）、`veh_host_b_001`（TDC-2001）。
  - 所有權轉移：`veh_host_a_001` 自 `partner_host_alpha` 移轉給 `partner_host_beta`；移轉前 Host A 200 / Host B 404，移轉後 Host A 404 / Host B 200，所有收益、維保、行程、案件資料完全連動。

---

## 6. 未做的部分與環境限制揭露（誠實記錄，不冒充完成）

1. **未啟動本機開發伺服器或瀏覽器（VM 限制）**：遵照 Supervisor 派工規範，本 VM 禁止執行 `pnpm dev`、`docker compose` 或直接運行 `playwright` 啟動前端／後端服務。端到端契約與資源關聯已透過 `UatEvidenceRecorder` 完整定義於 `tests/e2e/system-remediation/sr-qa-newfeatures-001/sr-qa-newfeatures-001.spec.ts`，真實瀏覽器操作留待遠端 GitHub Actions runner 或驗收環境執行。
2. **未在實體手機執行 Native 測試（真機邊界）**：例如實體行動裝置之原生推播通知接收、離線本地快取、硬體 GPS 背景追蹤等，屬於外部 live 驗收邊界，本驗收任務不冒充實機成功。
3. **未越界修改業務產品程式**：本任務為 `verification` 驗收任務，所有驗收均針對既有實作邏輯與 `SR-WIRE-001` 整合成果進行真邏輯檢驗，嚴格限制修改範圍在三項 write_scopes 內。

---

## 7. 結案與交接程序

- 本任務已完成全部 write_scopes 成果：
  - `tests/unit/system-remediation/sr-qa-newfeatures-001/`（4 個測試套件，44 項測試全數通過）
  - `docs/04-uat/system-remediation-20260906/SR-QA-NEWFEATURES-001.md`（完整驗收與回歸報告）
  - `tests/e2e/system-remediation/sr-qa-newfeatures-001/sr-qa-newfeatures-001.spec.ts`（E2E 證據層規格）
- 格式與代碼質量經 `vitest run`、`eslint`、`prettier`、`git diff --check` 100% 驗證通過。
- 提交具備規範 trailers 之 commit（`LLM-Agent: Gemini`、`Task-ID: SR-QA-NEWFEATURES-001`、`Reviewer: Gemini2`）。
- 以普通（non-force）push 推送至遠端任務分支 `gemini/sr-qa-newfeatures-001`。
- 呼叫 `ai-status.sh handoff` 將任務交接予 Reviewer `Gemini2` 進入 `review` 階段，由 candidate lifecycle 負責後續 review、CI 與自動 merge 結案。
