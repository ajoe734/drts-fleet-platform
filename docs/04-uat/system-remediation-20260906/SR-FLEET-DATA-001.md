# Remediation Evidence: SR-FLEET-DATA-001

## 1. 任務資訊 (Task Metadata)

- **Task ID**: `SR-FLEET-DATA-001`
- **Task Title**: 車行資料來源、篩選與無效按鈕 (Fleet Partner Portal Data Sources, Filtering, and Action Buttons)
- **Owner**: `Gemini2`
- **Reviewer**: `Gemini`
- **Base SHA**: `3e1904b1318a3252d3f7b5673173608fd6d12f71`
- **Audit Observation SHA**: `08b7a32f6fdaa00d8d1894f91569a7d72860cec2`
- **Branch**: `gemini2/sr-fleet-data-001`
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
  - `?type=summary`: 匯出營運總覽月報 CSV（包含營運月份、資料時間、總趟次、總營收、司機數、車輛數、準點率、完成率）。
  - `?type=trips`: 匯出車行行程清單 CSV，支援 `svc`, `status`, `period` 篩選參數，匯出筆數與內容嚴格與前端篩選後的資料一致。
  - 設定標準 HTTP header：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="..."`。

### 3.3 頁面篩選、按鈕與 UI 狀態修正

1. **車行營運總覽 (`apps/fleet-partner-portal-web/app/page.tsx`)**:
   - 替換重定向，提供完整權威總覽介面。
   - 顯示權威數據月份（`periodMonth`）與資料更新時間戳記（`dataTimestamp`）。
   - 「匯出月報 CSV」按鈕綁定至 `/trips/export?type=summary`。
   - 「招募新司機」按鈕綁定至 `/supply/drivers/new`。
   - 教育訓練與客服案件區塊明確標註「尚未接線」，不偽造假數據。
   - 區分後端讀取錯誤（Danger Banner）與合法 0 筆空狀態。
2. **行程清單 (`apps/fleet-partner-portal-web/app/trips/page.tsx`)**:
   - 解析 `searchParams`（`svc`, `period`, `q`）。
   - 實作互動式頁籤（全部、長照、偏鄉、花東），點擊自動切換 URL 參數並顯示動態筆數徽章。
   - 「匯出行程 CSV」按鈕帶入當前 `svc` 篩選參數，確保下載之 CSV 與畫面筆數一致。
   - 支援搜尋關鍵字（`q`）過濾（行程編號、司機、乘客、路線）。
   - 區分讀取錯誤橫幅與無資料空狀態。
3. **司機清單 (`apps/fleet-partner-portal-web/app/drivers/page.tsx`)**:
   - 解析 `searchParams`（`tab`, `q`）。
   - 實作互動式頁籤（全部、執勤中、文件待補、培訓未完成），點擊切換 URL 並篩選列表。
   - 「招募司機」按鈕綁定導向 `/supply/drivers/new`。
   - 區分讀取失敗橫幅與空資料狀態。
4. **車輛清單 (`apps/fleet-partner-portal-web/app/vehicles/page.tsx`)**:
   - 解析 `searchParams`（`tab`, `q`）。
   - 實作互動式頁籤（全部、運作中、維修中、保險有效），點擊切換 URL 並篩選列表。
   - 「新增車輛」按鈕綁定導向 `/supply/vehicles/new`。
   - 區分讀取失敗橫幅與空資料狀態。

---

## 5. 驗證與測試結果 (Verification & Test Results)

### 5.1 自動化單元測試

新建 Vitest 測試套件 `tests/unit/system-remediation/sr-fleet-data-001/sr-fleet-data-001.test.ts`，涵蓋 8 個核心場景：

- **Requirement 1 & Capability C063**:
  1. `dashboard reflects live driver list counts rather than 128/96 fake stats`: 驗證總覽指標與列表真實筆數一致，完全無 128/96 假數字。
  2. `separates legitimate zero data from read failure on dashboard and loaders`: 驗證 0 筆合法空狀態與 API 讀取錯誤能精確區分。
- **Requirement 2**:
  3. `loadCases returns empty rows and connected: false`: 驗證案件未對接回傳 `connected: false` 與空陣列。
  4. `loadTraining returns empty rows, neutral summary and connected: false`: 驗證教育訓練未對接回傳 `connected: false` 與空陣列。
  5. `dashboard supplemental indicators explicitly mark unintegrated status`: 驗證總覽標記未串接狀態。
- **Requirement 3 & Capabilities C013, C069**:
  6. `trips export with svc=airport returns exactly the airport transfer rows`: 驗證帶篩選參數匯出筆數與內容完全對齊。
  7. `trips export without svc filter exports all trips matching total list count`: 驗證無篩選時匯出全部真實筆數。
  8. `overview export (type=summary) exports authoritative operational metrics`: 驗證營運總覽匯出包含權威統計。

執行結果：

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-fleet-data-001/
```
```
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-fleet-data-001

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  614ms
Exit Code:   0
```

### 5.2 靜態型別檢查 (Typecheck & Root Isolation)

1. Package Typecheck:
   執行 `pnpm --filter @drts/fleet-partner-portal-web typecheck`：
   ```
   > next typegen && tsc --noEmit
   Generating route types...
   ✓ Types generated successfully
   Exit Code:  0
   ```
2. Root Typecheck Isolation:
   解耦 `fleet-portal-data.server.ts` 與 `fleet-portal-fixtures.ts`，直接宣告純資料結構與回退常數，避免根目錄 `tsconfig.json`（無 `--jsx`）在編譯 `tests/**/*.ts` 時傳遞解析 `@drts/ui-web` TSX 模組而產生 `TS6142` 錯誤。

### 5.3 國際化檢查 (i18n Guard)

執行 `pnpm run i18n:guard`：
- 將所有頁面中 inline 的 `locale === "zh"` 條件運算子收斂為中央 `lib/translations.ts` 既有語系鍵值（`drivers.tabAll`, `vehicle.status.*`, `shell.api.down`, `supply.empty.none` 等）。
- 執行結果：
```
i18n-guard: OK (518 files scanned across 10 apps, 52 exemption(s) from i18n-guard-baseline.json)
Exit Code:  0
```

### 5.4 測試覆蓋路徑檢查 (Test Coverage Gate)

執行 `python3 tools/ci/check_test_coverage.py`：
```
check_test_coverage: all 61 test files yield tests CI runs.
Exit Code:  0
```

### 5.5 檔案規範與 Git 檢查

執行 `git diff --check`：
- 無 trailing whitespace，無衝突標記，無格式錯誤。
- 變更範圍完全符合 `write_scopes`。

### 5.6 未接線系統邊界說明 (Live Environment Boundaries)

- 教育訓練（Training）與客服案件（Cases）後端端點在 Phase 1 尚未由後端開出，`loadCases` 與 `loadTraining` 明確回傳 `connected: false` 與空陣列，前端呈現待處理/未檢查標記，絕不以靜態假資料冒充已連線完成。

---

## 6. 變更檔案清單 (Modified Files Summary)

- `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` (移除假資料、整合權威來源、錯誤/空資料分離、未接線標記、解耦 fixtures)
- `apps/fleet-partner-portal-web/app/trips/export/route.ts` (新增 CSV 匯出 API Route，支援 summary 與 trips 篩選匯出)
- `apps/fleet-partner-portal-web/app/page.tsx` (權威總覽頁、按鈕串接、時間維度、未串接提示、i18n 收斂)
- `apps/fleet-partner-portal-web/app/trips/page.tsx` (頁籤/關鍵字篩選、CSV 匯出按鈕串接、錯誤處理、i18n 收斂)
- `apps/fleet-partner-portal-web/app/drivers/page.tsx` (頁籤/關鍵字篩選、招募按鈕導向、錯誤處理、i18n 收斂)
- `apps/fleet-partner-portal-web/app/vehicles/page.tsx` (頁籤/關鍵字篩選、新增車輛按鈕導向、錯誤處理、i18n 收斂)
- `tests/unit/system-remediation/sr-fleet-data-001/sr-fleet-data-001.test.ts` (完整驗證測試)
- `docs/04-uat/system-remediation-20260906/SR-FLEET-DATA-001.md` (完整修復與驗證報告)
