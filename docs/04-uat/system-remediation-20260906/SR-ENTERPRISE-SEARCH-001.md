# SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致

| 欄位          | 內容                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md`                        |
| Owner         | Gemini                                                                                            |
| Reviewer      | Gemini2                                                                                           |
| Depends on    | 無 (`[]`)                                                                                         |
| Gap ID        | `R24`                                                                                             |
| Capability ID | `C013`, `C069`                                                                                    |
| Base SHA      | `7dccddaba7d51dca8d56da01d5320d9f22f8b68f` (`origin/dev` at task start)                           |
| Candidate SHA | 於 `handoff` 時以 `git rev-parse HEAD` 記錄（見 task board）                                       |
| Branch        | `gemini/sr-enterprise-search-001`                                                                  |

## 1. 稽核來源與基準重現

### 1.1 來源問題與能力缺口

1. `docs/04-uat/system-remediation-20260906/source/findings.json` (R24, 角色: 車行／企業查詢者):
   > 不足: 查詢工具不足、頁籤不會篩選
   > 重現步驟與實際結果: 趟次機場接送點後仍6列；司機可接單點後仍2位；企業歷史缺日期/乘客/狀態搜尋
   > 建議修正及驗收: 實作篩選與搜尋並保留條件；純統計不要偽裝互動頁籤

2. `docs/04-uat/system-remediation-20260906/source/capabilities.json`:
   - `C013`: 查看歷史與既有預約詳情 — 補查詢條件與大量資料分頁；未等同建立到結算完成。
   - `C069`: 有效狀態／趟次篩選與匯出 — 篩選 query、總數、分頁同條件。

### 1.2 Base SHA 重現與後端 API 核實

在 Base SHA (`7dccddaba7d51dca8d56da01d5320d9f22f8b68f`) 檢查現狀：

1. **前端現況**：`apps/enterprise-dispatch-web/app/bookings/page.tsx` 原先僅 6 行，直接渲染 `<EnterpriseBookingHistory />`。該元件無任何乘客關鍵字搜尋、無起訖日期篩選、無狀態過濾、無本人/代訂範圍頁籤，亦無翻頁分頁與篩選空狀態。
2. **後端 API 核實**：
   - 檢查 `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459` 之 `@Get("tenant/bookings")`：僅接收 `x-tenant-id` 與 `x-request-id` 標頭，呼叫 `this.ownedMobilityService.listTenantBookings(tenantId)`。
   - 檢查 `owned-mobility.service.ts:2048`：回傳該租戶之全量預約清單，分頁資訊為 `{ page: 1, pageSize: items.length, totalItems: items.length, totalPages: items.length > 0 ? 1 : 0 }`。
   - 目前後端該端點尚未定義伺服器端 Query DTO（如 `q`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize`）。
3. **避免「只篩目前頁假裝全域」**：
   - 由於後端回傳的是當前租戶的全量預約清單，前端若先做分頁切片（例如切出前 10 筆）再進行關鍵字或狀態過濾，將導致第 2 頁以後的符合資料無法被搜尋到（即「只篩目前頁假裝全域」之反模式）。
   - 本任務嚴格遵守驗收要求：在前端取得租戶全量清單後，**先執行全域組合篩選與排序（依時間倒序），再對篩選後的總集執行分頁切片**。這確保搜尋與篩選條件是套用在全域資料集上，計算出的總數與總頁數完全反映全域篩選結果。

---

## 2. 實作變更（嚴格限制在 write_scopes）

### 2.1 `apps/enterprise-dispatch-web/app/bookings/page.tsx`

1. **組合篩選 (Combined Filters)**：
   - **預約範圍 (Scope)**：提供「全部 (`all`)」、「我預約的 (`mine`)」、「我代訂的 (`byme`)」三個分頁按鈕，依據當前登入者身分（`enterpriseUser.name = "林宜君"`）過濾乘客與代訂者。
   - **文字搜尋 (`q`)**：支援不分大小寫模糊比對，涵蓋預約編號 (`bookingId`)、訂單編號 (`orderId`)、乘客姓名 (`passenger.name`)、乘客電話 (`passenger.phone`)、代訂人姓名/信箱、上下車地點 (`pickup.address`, `dropoff.address`)、成本中心 (`costCenter`)、航班編號 (`flightNo`) 與備註 (`notes`)。
   - **日期區間 (`dateFrom`, `dateTo`)**：可篩選預約起迄日期，支援當天邊界包含（`00:00:00` 至 `23:59:59.999`）。
   - **狀態分類 (`status`)**：精準對應 Design Canvas 之 `ENT_STATE_META`，包含全部狀態、已預約 (`reserved`)、待審批 (`approval`)、已派車 (`assigned`)、行程中/前往上車 (`enroute`)、已完成 (`completed`)、已取消 (`cancelled`)、無法派車 (`nosupply`)。
2. **清除條件 (Clear Filters)**：
   - 當有任一有效篩選條件時，顯示「清除篩選」按鈕與關鍵字清除按鈕，點擊後重設至預設條件並回到第 1 頁。
3. **分頁控制 (Pagination)**：
   - 支援每頁筆數選擇（5 筆、10 筆、20 筆）。
   - 清楚顯示當前頁數、總頁數、當前顯示筆數區間與篩選後總筆數。
   - 支援上一頁、下一頁導覽按鈕，於邊界時正確 disabled。
4. **空狀態區分 (Empty States)**：
   - **全域無預約**：當租戶完全無預約時，顯示「尚無預約紀錄」，並提供建立預約之導向按鈕。
   - **篩選無結果**：當有預約但無符合目前篩選條件者，顯示「找不到符合條件的預約」，並提供「清除所有篩選條件」之快捷重設按鈕。
5. **UI 設計規範對齊 (Design Canvas & Realm Tokens)**：
   - 完全採用 `docs/05-ui/drts-design-canvas/ent-screens-2.jsx` (ENT_History) 表格欄位（編號、乘客/下單、行程、時間、成本中心、狀態）。
   - 狀態膠囊採用 `EPill` 與對應 realm/theme 色調，無任何未核准之 hex 色碼。
   - 每筆預約列以 Next.js `Link` 連結至 `/bookings/{bookingId}` 詳情頁。
   - 遵循無障礙規範：具備 `role="tablist"`、`role="tab"`、`aria-selected`、`aria-label`、`data-testid`。

### 2.2 `tests/unit/system-remediation/sr-enterprise-search-001/`

新增單元測試與邏輯模組：
- `enterprise-search-logic.ts`：匯出獨立純函式（`filterEnterpriseBookings`, `paginateEnterpriseBookings`, `getBookingStateMeta`, `matchesBookingSearch`, `matchesBookingDateRange`, `gatewayHref`, `formatBookingTime`）。
- `sr-enterprise-search-001.test.ts`：41 個單元測試，涵蓋關鍵字搜尋、日期區間、狀態對映、本人/代訂範圍、多條件組合、分頁與全域篩選防護、空狀態、網關錯誤處理與前端頁面程式碼規範檢核。

---

## 3. 驗收條件對應表

| 驗收條件 | 對應實作與證據 |
| -------- | -------------- |
| 組合篩選與清除一致 | 實作乘客姓名/電話/編號/地址搜尋、起訖日期、狀態分類、範圍頁籤；提供清除條件按鈕與關鍵字即時清除。41 個單元測試中第 1、2、3、4 節全數通過。 |
| 翻頁與全域資料集一致（避免只篩目前頁假裝全域） | 實作全域資料篩選後再分頁之機制。單元測試第 5 節特設「CRITICAL REQUIREMENT: avoids 只篩目前頁假裝全域」驗證案例，在 15 筆資料中第 13 筆為取消預約，即使每頁 5 筆，過濾取消狀態時仍能正確命中並呈現在第 1 頁，證實篩選作用於全域資料。 |
| 空狀態一致 | 區分「租戶完全無預約」與「篩選條件無符合」兩種空狀態。單元測試第 6 節驗證兩種情境之狀態判定與按鈕行為。 |
| 實際 query / 總數有證據 | 頁面呈現「符合條件：共 X 筆（全域總數 Y 筆）」與「顯示第 A–B 筆，共 C 頁」，單元測試驗證 count 與 pagination 正確性。 |
| 沿用權威 API，不以 fixture 冒充 | 頁面呼叫 `getEnterpriseDispatchTenantClient(enterpriseTenant.id).listBookings()` 讀取真實租戶 API，不以靜態 `ENT_BOOKINGS` fixture 取代真實呼叫；單元測試第 9 節檢驗 source code contract。 |
| 檢查指令全部通過 | `git diff --check`（exit 0）、`pnpm --filter @drts/enterprise-dispatch-web typecheck`（exit 0）、`pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/`（41 passed, exit 0）、`pnpm --filter @drts/enterprise-dispatch-web test`（24 passed, exit 0）。 |

---

## 4. 實際驗證指令與執行結果

所有指令均在本 isolated worktree (`/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-search-001`) 執行：

```bash
$ git diff --check
# 無任何輸出，exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> @drts/enterprise-dispatch-web@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-search-001/apps/enterprise-dispatch-web
> tsc --noEmit
# 無任何錯誤，exit code 0

$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-search-001

 Test Files  1 passed (1)
      Tests  41 passed (41)
   Start at  15:24:10
   Duration  650ms (transform 273ms, setup 0ms, import 327ms, tests 23ms, environment 0ms)
# exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web test
> @drts/enterprise-dispatch-web@0.1.0 test /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-search-001/apps/enterprise-dispatch-web
> vitest run --config vitest.config.ts

 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  15:24:14
   Duration  853ms
# exit code 0
```

---

## 5. 邊界與未執行的 Live/真機部分

依規範明確陳述本任務驗證範圍與邊界，不冒充完成未執行的 live 環節：
1. **本任務已完成與驗證的部分**：
   - Enterprise Dispatch Web 歷史預約頁面之組合搜尋（關鍵字、狀態、日期起訖、預約範圍）、篩選清除、分頁切片與兩類空狀態 UI 實作。
   - 全域篩選優先於分頁切片之演算法防護與 41 項單元回歸測試。
   - Enterprise Web 前端之 TypeScript 型別檢查與原有 8 個測試檔案（24 個測試）之回歸確認。
2. **本任務未執行的 Live/真機部分（交由後續 QA/E2E 驗收任務驗證）**：
   - 尚未對已部署之 GCP Cloud Run Dev 環境進行真實瀏覽器實機手動驗證。
   - 尚未在真機 iOS / Android Webview 進行觸控與手勢操作測試。
   - 後端若未來在 `SR-BOOKING-VERIFY` / `SR-QA-BOOKING-001` 新增伺服器端 Query DTO 支援，前端可進一步升級為 server-side query，但在目前後端僅支援全量清單回傳時，前端全域先篩後切之行為已滿足本任務之規範。
