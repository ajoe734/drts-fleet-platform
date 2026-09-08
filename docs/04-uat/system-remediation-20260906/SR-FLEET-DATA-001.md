# Remediation Evidence: SR-FLEET-DATA-001

## 1. 任務資訊 (Task Metadata)

- **Task ID**: `SR-FLEET-DATA-001`
- **Task Title**: 車行資料來源、篩選與無效按鈕 (Fleet Partner Portal Data Sources, Filtering, and Action Buttons)
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Base SHA**: `7dccddaba7d51dca8d56da01d5320d9f22f8b68f`
- **Candidate SHA**: 於 `handoff` 時以 `git rev-parse HEAD` 寫入（見 task board 與 machine truth）
- **Reconstruction Head SHA**: `fd9ec34ee9b075dd8e05451f1f22f7f34abe1d68`
- **Audit Observation SHA**: `08b7a32f6fdaa00d8d1894f91569a7d72860cec2`
- **Branch**: `gemini/sr-fleet-data-001`
- **Planning Ref**: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (C013, C063, C064, C069; R10, R11, R24)

---

## 2. 根因分析與現狀調查 (Root Cause Analysis & Audit Findings)

1. **資料來源不一致與假統計 (R10, C063)**:
   - 原始 `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` 在後端 API 未回傳或發生錯誤時，退回靜態常數 `DASHBOARD_FALLBACK`，顯示假數字（128 位司機、96 台啟用車輛、14,280 趟趟次、NT$ 642K 營收等），與實際列表（如司機列表 0 筆或真實數目）嚴重矛盾。
   - 儀表板與各列表未區分「成功查詢但為 0 筆（正常空狀態）」與「讀取失敗／API 錯誤」，導致後端斷線時誤顯假資料或無錯誤反饋。
   - 儀表板缺乏權威時間維度與資料更新時間戳記。
2. **無效按鈕與動作未串接 (R11, C064)**:
   - 「招募司機」無超連結或為無效按鈕，未導向 `/supply/drivers/new`。
   - 「新增車輛」無超連結或為無效按鈕，未導向 `/supply/vehicles/new`。
   - 營運總覽與車行行程頁的「匯出 CSV」無端點串接，為無效按鈕。
3. **篩選與分頁僅為外觀無實際連動 (R24, C069)**:
   - 行程頁頁籤（全服務、長照專車、偏鄉預約、花東專線）未與 query string（`svc`）及過濾邏輯連動。
   - 司機頁與車輛頁頁籤（全部、已指派／審核中／保險有效等）未與 URL query string 及過濾邏輯連動。
   - 搜尋關鍵字 `q` 欄位送出後未進行過濾。
4. **未接線端點塞假資料 (R10, C063)**:
   - 教育訓練與客服／案件系統後端尚未對接，但原始程式塞入假資料偽裝已連線。

---

## 3. 修復方案與變更內容 (Remediation Details)

### 3.1 資料層整合與錯誤區分 (`apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts`)

- 徹底移除 `DASHBOARD_FALLBACK` 靜態假常數（128/96/14,280 等）。
- `loadDashboard()` 整合權威資料來源：
  - 司機指標同步自 `loadDrivers()` 真實資料統計（總人數、上線狀態、服務分類分佈）。
  - 行程營運指標同步自 `loadTrips()` 真實資料統計（總趟次、營收加總、準點率、取消率等）。
  - 增加 `periodMonth` 與 `dataTimestamp`，提供權威營運月份與更新時間戳記。
- 引入明確錯誤識別：
  - `DriversView`, `VehiclesView`, `TripsView`, `DashboardView` 擴充 `error?: string | null` 屬性。
  - 當後端服務呼叫失敗時，記錄明確錯誤訊息（如 `無法連線至車行資料服務`），供前端 UI 渲染警告橫幅；當 API 呼叫成功但回傳 0 筆時，正確標註為正常空狀態（`error: null`，`rows: []`）。
- 未串接模組明確標記：
  - `loadCases()` 與 `loadTraining()` 回傳 `connected: false` 與空陣列，不再塞入假資料，並註明「尚未接線（待後端系統開放）」。

### 3.2 匯出功能實作 (`apps/fleet-partner-portal-web/app/trips/export/route.ts`)

- 新增 Route Handler 處理 `/trips/export`：
  - `?type=summary`: 匯出營運總覽月報 CSV（包含營運月份、資料時間、總趟次、總營收、司機數、車輛數、上線/離線/可接單統計）。
  - `?type=trips`: 匯出車行行程清單 CSV，支援 `svc`, `status`, `period`, `q` 篩選參數，匯出筆數與內容嚴格與前端篩選後的資料一致。
  - 實作通用 `escapeCsvCell()` 函式，對包含逗號之分組格式化數值（如 `"1,250"`, `"14,280"`, `"NT$ 642,000"`）與特殊字元（引號、換行）進行標準 CSV 跳脫引號封裝，確保每列欄位數量一致不破壞 CSV 結構。
  - 設定標準 HTTP header：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="..."`。

### 3.3 頁面篩選、按鈕與 UI 狀態修正

1. **車行營運總覽 (`apps/fleet-partner-portal-web/app/page.tsx`)**:
   - 提供完整權威總覽介面。
   - 顯示權威數據月份（`periodMonth`）與資料更新時間戳記（`dataTimestamp`）。
   - 「匯出月報 CSV」按鈕綁定至 `/trips/export?type=summary`。
   - 「招募新司機」按鈕綁定至 `/supply/drivers/new`。
   - 教育訓練與客服案件區塊明確標註「尚未接線」，不偽造假數據。
   - 區分後端讀取錯誤（Danger Banner）與合法 0 筆空狀態。
2. **行程清單 (`apps/fleet-partner-portal-web/app/trips/page.tsx`)**:
   - 解析 `searchParams`（`svc`, `period`, `q`, `status`）。
   - 實作互動式頁籤（全部、長照、偏鄉、花東），點擊自動切換 URL 參數並顯示動態筆數徽章。
   - 「匯出行程 CSV」按鈕帶入當前 `svc`, `period`, `q`, `status` 篩選參數，確保下載之 CSV 與畫面筆數完全一致。
   - 支援搜尋關鍵字（`q`）過濾（行程編號、司機、乘客、路線）。
   - 區分讀取錯誤橫幅與無資料空狀態。
3. **司機清單 (`apps/fleet-partner-portal-web/app/drivers/page.tsx`)**:
   - 解析 `searchParams`（`tab`, `q`）。
   - 將「可接單」頁籤（`available`）過濾邏輯與後端 API 權威 `dispatchEligible` 欄位對齊（當 `dispatchEligible` 為 false 時即使 `workState` 為 available 亦排除於可接單列表之外），確保業務資格精確性。
   - 實作互動式頁籤（全部、可接單、文件待補、培訓未完成），點擊切換 URL 並篩選列表。
   - 「招募司機」按鈕綁定導向 `/supply/drivers/new`。
   - 區分讀取失敗橫幅與空資料狀態。
4. **車輛清單 (`apps/fleet-partner-portal-web/app/vehicles/page.tsx`)**:
   - 解析 `searchParams`（`tab`, `q`）。
   - 實作互動式頁籤（全部、運作中、維修中、保險有效），點擊切換 URL 並篩選列表。
   - 「新增車輛」按鈕綁定導向 `/supply/vehicles/new`。
   - 區分讀取失敗橫幅與空資料狀態。

---

## 4. 驗收標準對照與驗證證據 (Acceptance Criteria Mapping & Evidence)

### 3.4 審查回饋修復 (Codex2 Review Feedback Remediation)

針對 Codex2 審查候選版本 `9c7608251` 所提出的兩項 P1 缺失進行專項補強：

1. **獨立保留個別資料來源失敗 (Per-source failure tracking) 與區分正常空資料與無法取得**:
   - 原邏輯於 live source 判斷使用 OR 條件，導致若行程 API 成功但司機 API 失敗時，錯誤遭掩蓋（`error: null`）且司機數誤記為 0。
   - 修復方案：
     - 在 `DashboardView` 顯式保留 `driversError`, `tripsError`, `aggregateError`。
     - 若司機 API 失敗且無 aggregate 數據，司機指標標註為無法取得（`driverCount: "—"`, `online: "—"`, `offline: "—"`, `dispatchable: "—"`, `supply: []`），嚴格與合法 0 筆（`"0"`）區分。
     - 匯出端點 `/trips/export?type=summary` 檢查 `dashboard.error` 及無法取得標記，於司機或行程失敗時回傳 HTTP 500 拒絕匯出假 0 筆，避免破壞報表真實性。
2. **儀表板營收聚合錯誤防護與權威推導 (Authoritative Revenue Derivation)**:
   - 原邏輯在 `listFleetPortalDashboard` 拋出錯誤時以靜態常數回退至 `"NT$ 0"`，即使同期間行程清單有真實金額仍回報 0 元。
   - 修復方案：
     - 捕捉 `aggregateError`。當 aggregate 端點不可用但行程 API（`tripsView`）成功時，自真實已完成行程紀錄（`completedTrips`）即時加總 `grossAmountMinor` 與 `shareAmountMinor`，計算權威營收與車行分潤，不再填塞 `"NT$ 0"`。
     - 若行程與 aggregate 均失敗，營收指標明確標註為無法取得（`share: "—"`, `grossRevenue: "—"`），由匯出端點拒絕匯出並回報 500。

### 3.5 審查回饋修復二 (Codex2 Candidate 271c0af87 Remediation)

針對 Codex2 審查候選版本 `271c0af87` 所提出的 P1 預設月份 scope 不一致進行專項修正：

1. **預設月份統一與避免觸發後端回溯 (Default Period Month Unification)**:
   - 原邏輯中 `loadDashboard()` 預設 `getCurrentPeriodMonth()`（當月 UTC 月份，如 `2026-09`），但 `loadTrips()` 與 `loadQuality()` 若未傳入參數時為 `undefined`，直接呼叫 `client.listFleetPortalTrips(undefined)`。後端 API `resolvePeriodMonth(undefined)` 在當月無結算趟次時會回溯最近 12 個月內有資料的月份（如 `2026-08` 1 筆 `ord-previous-month`），導致本月無資料時首頁顯示 0 筆，行程清單卻顯示上月 1 筆。
   - 修復方案：
     - 匯出 `getCurrentPeriodMonth()`，並在 `loadTrips(periodMonth?: string)` 與 `loadQuality(periodMonth?: string)` 統一預設為 `periodMonth ?? getCurrentPeriodMonth()`，保證呼叫後端 API 時一律帶入明確月份，絕不傳遞 `undefined` 觸發後端未預期的回溯。
     - 在當月合法空資料時，首頁、行程列表、總覽 CSV 與行程 CSV 均一致回傳 0 筆。
2. **導航保留明確營運月份 (Preserve Navigation Period)**:
   - 修復方案：
     - `app/page.tsx`：總覽「查看行程」連結更新為 `href={`/trips?period=${encodeURIComponent(dashboard.periodMonth)}`}`，確保從總覽跳轉至行程頁時完整保留月份上下文；總覽匯出按鈕同樣帶入 `period=${encodeURIComponent(dashboard.periodMonth)}`。
     - `app/trips/page.tsx`：預設 `currentPeriod = params.period ?? getCurrentPeriodMonth()`，在所有服務頁籤（tabs）、搜尋表單 hidden input 與 CSV 匯出按鈕均保留 `period`，防止操作篩選時遺失期間。

---

## 4. 驗收標準對照與驗證證據 (Acceptance Criteria Mapping & Evidence)

| 驗收條件 | 實作現況與驗證結果 | 相關資源 ID / 檔案 |
| :--- | :--- | :--- |
| **首頁/list/detail/CSV數量與scope相同** | `loadDashboard()` 與 `loadTrips()` 統一預設月份為 `getCurrentPeriodMonth()`，完全杜絕跨月回溯差異；首頁/列表/總覽 CSV/行程 CSV 預設與指定月份 scope 均精確對齊（當月無資料時一致為 0 筆）；導航連結與篩選保留明確 `period`；Canvas 規範未定義獨立 trip detail screen，清單與匯出筆數嚴格對齊，未自創非規範畫面 | `apps/fleet-partner-portal-web/app/trips/export/route.ts`, `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` (測試資源: `fp-test-001`, `ord-001`, `ord-002`, `ord-003`, `ord-previous-month`) |
| **filter改變query與結果，空資料與讀取失敗分開** | 司機/車輛/行程頁籤與搜尋均寫入 URL query string，並過濾列表 rows；司機可接單頁籤對齊 `dispatchEligible` 資格；行程頁籤支援 `svc`, `status`, `q`, `period`；正常 0 筆空資料渲染中性提示卡與數字 "0"，API 錯誤渲染 Danger 警告橫幅與 "—" 無法取得標記，保留各來源錯誤原因 | `apps/fleet-partner-portal-web/app/drivers/page.tsx`, `apps/fleet-partner-portal-web/app/vehicles/page.tsx`, `apps/fleet-partner-portal-web/app/trips/page.tsx` |
| **無效按鈕接線與未串接標記** | 首頁與車輛頁「新增車輛」導向 `/supply/vehicles/new`；首頁與司機頁「招募司機」導向 `/supply/drivers/new`；首頁「查看行程」導向 `/trips?period=...`；匯出按鈕導向 `/trips/export`；未串接之教育訓練與案件回傳 `connected: false` 並顯式註明未接線 | `apps/fleet-partner-portal-web/app/page.tsx`, `apps/fleet-partner-portal-web/app/vehicles/page.tsx`, `apps/fleet-partner-portal-web/app/drivers/page.tsx` |
| **證據包含 SHA、測試結果、界線說明** | 記錄完整 Base SHA、Candidate SHA、測試 Exit Code 與邊界說明 | `docs/04-uat/system-remediation-20260906/SR-FLEET-DATA-001.md` |

### 4.1 驗證界線與未進行之 Live / 真機項目說明

- **已完成驗證範圍**:
  - 本地 Vitest 單元/整合測試（24/24 通過），驗證資料層權威來源整合、假數據移除、空資料與異常讀取分離、未串接端點防呆、CSV 匯出筆數與篩選連動（含 q 關鍵字搜尋與 compound 複合過濾）、千分位分組數值引號包裹防護（防止欄位數錯置）、司機 `dispatchEligible` 資格與狀態分離、個別來源異常獨立追蹤、部分失敗防護及 aggregate 異常時即時推導營收，以及最新候選版本修復之預設月份 scope 統一與跨月空資料回歸。
  - Next.js 靜態型別檢查（`next typegen && tsc --noEmit`），驗證所有頁面與 Route Handlers 型別安全。
  - 解耦 `fleet-portal-data.server.ts` 與 `fleet-portal-fixtures.ts`，直接宣告純資料結構與回退常數，避免根目錄 `tsconfig.json`（無 `--jsx`）在編譯 `tests/**/*.ts` 時傳遞解析 `@drts/ui-web` TSX 模組而產生 `TS6142` 錯誤。
  - Git diff 格式檢查與 write_scopes 邊界檢查。
- **Detail Surface 設計界限說明**:
  - 查驗 `docs/05-ui/drts-design-canvas/fleet-screens.jsx`，當前官方 UI Canvas 僅定義 `/trips` 清單介面（含 ORDER, SERVICE, DRIVER, TENANT, PICKUP, FARE, 車行分潤, STATUS, DATE 等欄位），未定義獨立之單趟 trip detail 畫面。
  - 依據 UI Design Contract，禁止自行發明未經 Canvas 審核之 UI 畫面。目前清單表格即承載所有關鍵細節，且與 CSV 匯出數量與範圍精確一致。若後續產品決策需拆分 `/trips/[tripId]` 專屬詳情畫面，應待 Canvas 補齊後另案擴充。
- **未進行之 Live / 真機驗證界線（明列不冒充成功）**:
  - **事故/申訴與學院培訓後端**: 後端微服務尚未提供車行專屬 API，前台目前以 `connected: false` 與顯式警語展示，未進行線上即時資料連線。
  - **生產/預發環境端對端連線**: 本變更目前在獨立 task worktree 驗證，需於 PR 經由 CI 合併至 `origin/dev`，並由 CD 自動部署至 Cloud Run dev 環境後，方可透過獨立測試車行租戶進行線上端對端真機驗收。

---

## 5. 驗證與測試結果 (Verification & Test Results)

### 5.1 自動化單元測試

新建 Vitest 測試套件 `tests/unit/system-remediation/sr-fleet-data-001/sr-fleet-data-001.test.ts`，涵蓋 24 個核心場景：

- **Requirement 1 & Capability C063**:
  1. `dashboard reflects live driver list counts rather than 128/96 fake stats`: 驗證總覽指標與列表真實筆數一致，完全無 128/96 假數字。
  2. `separates legitimate zero data from read failure on dashboard and loaders`: 驗證 0 筆合法空狀態（回傳數字 0）與 API 讀取錯誤（標註為 "—" 無法取得）能精確區分。
- **Requirement 2**:
  3. `loadCases returns empty rows and connected: false`: 驗證案件未對接回傳 `connected: false` 與空陣列。
  4. `loadTraining returns empty rows, neutral summary and connected: false`: 驗證教育訓練未對接回傳 `connected: false` 與空陣列。
  5. `dashboard supplemental indicators explicitly mark unintegrated status`: 驗證總覽標記未串接狀態。
- **Requirement 3 & Capabilities C013, C069**:
  6. `trips export with svc=airport returns exactly the airport transfer rows`: 驗證帶篩選參數匯出筆數與內容完全對齊。
  7. `trips export without svc filter exports all trips matching total list count`: 驗證無篩選時匯出全部真實筆數。
  8. `overview export (type=summary) exports authoritative operational metrics`: 驗證營運總覽匯出包含權威統計。
  9. `trips export with status=completed filter returns only completed trips`: 驗證狀態篩選精確對齊。
  10. `trips export with no matching rows returns only CSV header without failing`: 驗證空過濾安全產出表頭。
  11. `export handles loader errors gracefully with 500 status`: 驗證行程匯出異常回傳 500 錯誤與訊息。
  12. `trips export with q filter returns only matching trips by id, driver, or pickup`: 驗證行程匯出關鍵字（ID、司機、上車地點）過濾。
  13. `trips export combining svc and q filters matches compound criteria`: 驗證行程匯出複合條件過濾。
  14. `overview export handles loader errors with 500 status`: 驗證營運總覽匯出異常回傳 500 錯誤與訊息。
  15. `overview export properly quotes grouped numbers containing commas to preserve column count`: 驗證千分位分組數字引號包裹，確保欄位數量固定為 4 欄。
  16. `drivers loader maps dispatchEligible and separates available status from eligibility`: 驗證司機資料載入器正確對應 `dispatchEligible` 資格，並與儀表板 dispatchable 聯動。
- **Review Remediation (Codex2 Feedback Coverage - Round 1)**:
  17. `partial failure: drivers API failure preserves driversError, marks driver counts unavailable, and rejects summary export`: 驗證司機 API 異常時獨立保留 `driversError`，司機數標註為 `"—"`，且總覽匯出拒絕假 0 筆並回傳 500。
  18. `partial failure: trips API failure preserves tripsError, marks trips and revenue unavailable, and rejects summary export`: 驗證行程 API 異常時獨立保留 `tripsError`，行程數與營收標註為 `"—"`，總覽匯出回傳 500。
  19. `aggregate-only failure with nonzero trips derives revenue from authoritative trip records and exports successfully`: 驗證 aggregate 異常時自同期間有效行程權威推導營收與分潤（如 NT$ 1,700 / NT$ 340），不填塞 NT$ 0，且匯出成功產出推導金額。
  20. `aggregate-only failure with legitimate zero trips returns zero revenue`: 驗證 aggregate 異常且真實行程為 0 筆時，正常顯示 NT$ 0 與 0 筆。
  21. `aggregate and trips failure marks revenue as unavailable and rejects summary export`: 驗證 aggregate 與行程皆失敗時標註 `"—"` 並拒絕匯出。
- **Review Remediation (Codex2 Feedback Coverage - Round 2 Candidate 271c0af87)**:
  22. `loadTrips(undefined) defaults to current UTC month and never calls API with undefined`: 驗證 `loadTrips()` 與 `loadTrips(undefined)` 預設使用當前 UTC 月份，不傳遞 undefined 避免後端回溯。
  23. `cross-month empty data: dashboard and trips list both return 0 trips when current month has no data but previous month has trips`: 驗證當月無行程而上月有資料時，dashboard 與 trips list 同步回傳 0 筆，summary CSV 與 trips CSV 數量與 scope 完全一致。
  24. `explicit previous period returns previous month data consistently across dashboard, trips, and export`: 驗證明確指定上月時，dashboard、trips list 與 CSV 匯出一致回傳上月真實行程。

執行結果：

```
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-fleet-data-001

 Test Files  1 passed (1)
      Tests  24 passed (24)
   Start at  16:56:22
   Duration  693ms (transform 274ms, setup 0ms, import 392ms, tests 68ms, environment 0ms)
Exit Code:  0
```

### 5.2 靜態型別檢查 (Typecheck)

執行 `pnpm --filter @drts/fleet-partner-portal-web typecheck`：

```
> @drts/fleet-partner-portal-web@0.1.0 typecheck /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-fleet-data-001/apps/fleet-partner-portal-web
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
Exit Code:  0
```

### 5.3 檔案規範與 Git 檢查

執行 `git diff --check`：

- 無 trailing whitespace，無衝突標記，無格式錯誤。
- 變更範圍完全符合 `write_scopes`。

---

## 6. 變更檔案清單 (Modified Files Summary)

- `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` (移除假資料、整合權威來源、錯誤/空資料分離、未接線標記、對齊 `dispatchEligible` 資格欄位、各來源錯誤獨立追蹤、營收權威推導、預設月份統一)
- `apps/fleet-partner-portal-web/app/trips/export/route.ts` (新增 CSV 匯出 API Route，實作 `escapeCsvCell` 防護分組數字與特殊字元，阻擋 partial failure 與無法取得狀態之偽造匯出)
- `apps/fleet-partner-portal-web/app/page.tsx` (權威總覽頁、按鈕串接、時間維度、未串接提示、錯誤橫幅)
- `apps/fleet-partner-portal-web/app/trips/page.tsx` (頁籤/關鍵字/狀態篩選、CSV 匯出按鈕串接、錯誤處理)
- `apps/fleet-partner-portal-web/app/drivers/page.tsx` (頁籤/關鍵字篩選、可接單對齊 `dispatchEligible`、招募按鈕導向、錯誤處理)
- `apps/fleet-partner-portal-web/app/vehicles/page.tsx` (頁籤/關鍵字篩選、新增車輛按鈕導向、錯誤處理)
- `tests/unit/system-remediation/sr-fleet-data-001/sr-fleet-data-001.test.ts` (21 個完整驗證測試，含 5 個 Codex2 審查修復回歸場景)
- `docs/04-uat/system-remediation-20260906/SR-FLEET-DATA-001.md` (驗證報告)
