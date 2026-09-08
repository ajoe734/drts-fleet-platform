# SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致

## 2026-09-08 resumed dispatch：history helper 完成不等於後端前置完成

- 本次 `git fetch origin` exit 0；核實 base `origin/dev` =
  `a44ea852eabe0c88e54d8124802eccf86ebc1dc6`，既有 task head / remote head =
  `4eecfd0065d982cc5d03ddc7ea19d8eaf965ca07`。
- `git rebase origin/dev` exit 1：重播 `f20c35e97` 時本證據檔 add/add
  conflict；`git rebase --abort` exit 0，還原乾淨既有 task branch。
  本次沒有 rebase 完成或新 candidate；不強推既有歷史。
- 以 `git show origin/dev:support/unblock/SR-ENTERPRISE-SEARCH-001/SR-ENTERPRISE-SEARCH-001-UNBLOCK-HISTORY-REPAIR.md`
  與同目錄 `SR-ENTERPRISE-SEARCH-001-UNBLOCK-PLANNING-DECISION.md`（各 exit 0）
  讀取已合併交接。History helper PR #1792 / merge
  `e2df37f821ce76d8a3639ceaac6d253299c0a31c` 的文件明確寫明：
  parent remains blocked on backend capability planning；應於 producer 完成後由
  supervisor 指定乾淨 replacement branch/worktree，保留舊分支與 PR。
- 目前 base 的 controller `listTenantBookings` 仍只接 tenant/request headers；
  service `listTenantBookings(tenantId: string)` 仍只篩 tenant，固定 page 1、
  pageSize/totalItems = items.length；client `listTenantBookings()` 無 query
  參數且回傳 BookingRecord[]。上述三個 `git show origin/dev:<path>` 搭配
  `rg` 的 source checks 均 exit 0（路徑見下方歷史核實）。
- current-release `AI_NAME=Codex2 .../ai-status.sh show SR-BOOKING-VERIFY`
  exit 1：`Task not found: SR-BOOKING-VERIFY`。Parent show exit 0，depends_on
  仍為 []，write_scopes 仍不含 API、shared client 或 enterprise lib wrapper。
- 權威端點為 `GET /api/tenant/bookings`；既有 enterprise tenant resource ID
  `10000000-0000-0000-0000-000000000201` 僅為程式追溯，非本次 live 查詢證據。
  本次未執行 live query、總數驗收、瀏覽器或真機檢查；未修改 UI、未重跑舊
  fixture 測試來冒充後端能力。這是阻擋證據提交，不是 acceptance candidate。

下一步：supervisor 登錄真正 backend producer 並補 parent depends_on，協調
contract/client/wrapper scopes；producer merge/acceptance 後指定 history helper
所述乾淨 replacement branch/worktree，再接續前端與實際 query/total 驗證。
僅因 helper done 自動重新派工，無法消除以上未解前置。

## 2026-09-08 17:44 dispatch 再核實：後端前置仍缺

- `git fetch origin` exit 0；目前 base `origin/dev` =
  `2a093872d05a7d0344adf9bb58f9e5c4c99861d1`。
- 本次開始的 local / remote task branch 均為
  `7e82f650020cbc49ff41b77ea9851c85284bd8de`。
- `git rebase origin/dev` exit 1：重播 `f20c35e97` 時本證據檔 add/add
  conflict。`git rebase --abort` exit 0，恢復乾淨既有分支；未強推、未回退 dev。
  本次僅追加阻擋證據，未聲稱已完成與新 base 整合。
- 以 `git show origin/dev:<path>` 直接核對目前 base（各 exit 0）：
  `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` 的
  `listTenantBookings` 仍沒有 query 參數；同目錄 service 的
  `listTenantBookings(tenantId: string)` 仍僅依 tenant 過濾、固定 page 1，
  pageSize / totalItems 均為全量 items.length；
  `packages/api-client/src/index.ts` 的 `listTenantBookings()` 仍無參數。
- 目前 base 的 `apps/enterprise-dispatch-web/app/bookings/page.tsx`
  仍只渲染 `EnterpriseBookingHistory`。此次沒有 UI 改動。
- `ai-status.sh show SR-BOOKING-VERIFY` 與
  `ai-status.sh show SR-BOOKING-VERIFY-001` 各 exit 1，均 Task not found。

依 execution prompt 的明示前置，仍需 supervisor 登錄正確後端 producer、
補 depends_on，協調 API / contract / client write scopes，提供日期、乘客、
狀態及分頁的權威 query / total 契約後再續作。不能用現有前端全量篩選結案。
資源端點為 GET `/api/tenant/bookings`；本次僅靜態核實，未發 live request，
沒有新增 booking ID、真實 filtered total、瀏覽器或真機驗證。
未重跑既有副本邏輯測試／typecheck，歷史結果不算本次驗收；沒有合格 candidate，
不 handoff。本次證據 commit SHA 由 task board blocker 記錄。

## 2026-09-08 本次 dispatch 核實：blocked，尚未達到 handoff 條件

本節取代下方歷史紀錄中的完成判定。fresh `origin/dev` base 為
`3b60a3757238663572f16f010c94f446f2c71eaa`；本次先 rebase，恢復實作 SHA 為
`641af0c6d`，恢復證據 SHA 為 `9b2528e24`。為保留已發布 branch ancestry 並允許
普通 non-force push，再 merge `origin/codex2/sr-enterprise-search-001`
（原 head `c40fd8a5d09e4082976e8ddda8cc2d642d480467`），無檔案衝突。
本次沒有合格 candidate，沒有 handoff；最終 blocker/commit SHA 由 task board 記錄。

重新讀取 R24、C013、C069 及 task execution prompt 後確認：

- base 的 bookings/page.tsx 仍只渲染 `EnterpriseBookingHistory`；歷史分支的
  搜尋實作尚不能視為 dev 已修復。
- `owned-mobility.controller.ts:459–472` 的 GET tenant/bookings 僅接收
  `x-tenant-id` / `x-request-id`，沒有 query DTO，也未傳遞查詢條件。
- `owned-mobility.service.ts:2048–2063` 僅依 tenantId 篩 orders，再回傳
  `page: 1, pageSize: items.length, totalItems: items.length`；沒有條件式總數或分頁。
- 現有頁面 `.listBookings()` 無參數，日期、乘客、狀態全在前端處理。
  這不滿足明示的「若 API 缺 filter 必須在 SR-BOOKING-VERIFY 取得後端能力後才結案」。
- `enterpriseUser.name` 來自 fixture，不能稱為已驗證的登入者身分。
- 41 項測試匯入測試目錄內 `enterprise-search-logic.ts` 邏輯副本；它們通過
  不代表 production component、登入者 scope 或 API query 已通過整合驗證。

實際執行（rebase 後 SHA `9b2528e24`，2026-09-08 12:26 UTC）：

```text
pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/
Test Files 1 passed (1); Tests 41 passed (41); exit 0
pnpm --filter @drts/enterprise-dispatch-web typecheck
tsc --noEmit; exit 0
git diff --check
無輸出; exit 0
ai-status.sh show SR-BOOKING-VERIFY-001
Task not found: SR-BOOKING-VERIFY-001; exit 1
```

資源路徑仍為 GET `/api/tenant/bookings`，頁面指定 tenant ID
`10000000-0000-0000-0000-000000000201`。本次未送 live query，沒有實際
live booking ID、filtered total、瀏覽器或真機證據，不能把測試 fixture 的
`EB-7K2001` 等 ID 當成 live 資源。

請 supervisor 登錄／確認 SR-BOOKING-VERIFY 的實際 task ID，補上本 task 的
depends_on，協調 API／contract／client scopes 後提供日期、乘客、狀態及分頁
能力。本 owner 僅有頁面、專屬測試及本證據的 write scope，不能修改共用後端。
取得權威契約後才能替換前端全量篩選、補 production component 與 API 整合測試，
取得同條件 query/總數證據，再建立 candidate 供 Codex 獨立 review。

以下為歷史紀錄，成功宣稱不適用於本次 dispatch。

| 欄位          | 內容                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md`                        |
| Owner         | Codex2                                                                                           |
| Reviewer      | Codex                                                                                             |
| Depends on    | 無 (`[]`)                                                                                         |
| Gap ID        | `R24`                                                                                             |
| Capability ID | `C013`, `C069`                                                                                    |
| Historical source SHA | `ecf6f70e7bf4a3a57735f198f6bfa81762019f3b` (`origin/gemini/sr-enterprise-search-001`)       |
| Base SHA      | `70355aba97c23dd1cd592b71f1d3dfe6315d91ff` (`origin/dev` before recovery)                         |
| Candidate SHA | 由本次普通 push 後的 `handoff` 以 `CANDIDATE_SHA=$(git rev-parse HEAD)` 鎖定（task board 為權威） |
| Branch        | `codex2/sr-enterprise-search-001`                                                                  |

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

9/6 的 audit 是歷史觀察，並非本次程式真值。既有實作先前已存在於
`ecf6f70e7bf4a3a57735f198f6bfa81762019f3b`；本次從 fresh `origin/dev`
(`70355aba97c23dd1cd592b71f1d3dfe6315d91ff`) 恢復該 commit 並重新驗證。
下列為該實作相對其原始 Base SHA (`7dccddaba7d51dca8d56da01d5320d9f22f8b68f`) 的核實：

1. **前端現況**：`apps/enterprise-dispatch-web/app/bookings/page.tsx` 原先僅 6 行，直接渲染 `<EnterpriseBookingHistory />`。該元件無任何乘客關鍵字搜尋、無起訖日期篩選、無狀態過濾、無本人/代訂範圍頁籤，亦無翻頁分頁與篩選空狀態。
2. **後端 API 核實**：
   - 檢查 `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459` 之 `@Get("tenant/bookings")`：僅接收 `x-tenant-id` 與 `x-request-id` 標頭，呼叫 `this.ownedMobilityService.listTenantBookings(tenantId)`。
   - 檢查 `owned-mobility.service.ts:2048`：回傳該租戶之全量預約清單，分頁資訊為 `{ page: 1, pageSize: items.length, totalItems: items.length, totalPages: items.length > 0 ? 1 : 0 }`。
   - 目前後端該端點尚未定義伺服器端 Query DTO（如 `q`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize`）。
   - 本頁實際使用的權威資源是 `GET /api/tenant/bookings`，租戶資源 ID 為
     `10000000-0000-0000-0000-000000000201`（`enterpriseTenant.id`）；本次只做
     repository 驗證，未宣稱對任何 live 環境送出請求。
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

歷史指令結果保留在上方以維持追溯；以下為本次 recovery 在 isolated
worktree (`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-sr-enterprise-search-001`)
對恢復後 SHA `f20c35e970a57ac0c5c15f1fe50816d74dd0ea74` 的實際結果：

```bash
$ git diff --check
# 無任何輸出，exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> @drts/enterprise-dispatch-web@0.1.0 typecheck
> tsc --noEmit
# exit code 0

$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/
 Test Files  1 passed (1)
      Tests  41 passed (41)
# exit code 0
```

原始實作當時的指令如下：

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
   - 更正：後端缺 Query DTO 是本次明示的結案阻擋；前端全量先篩後切不能取代所需後端能力與實際 query／總數證據。
