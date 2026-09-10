# SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致

| 欄位          | 內容                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md`                        |
| Owner         | Gemini                                                                                            |
| Reviewer      | Codex2                                                                                            |
| Depends on    | 無 (`[]`) — 待 Supervisor 登記後端 producer 並納入相依                                              |
| Gap ID        | `R24`                                                                                             |
| Capability ID | `C013`, `C069`                                                                                    |
| Base SHA      | `3062ea363769cc393e59384251f5aedc7e570ac5` (current `origin/dev`), prior `7a946308b4764b88939c3e9a59cf6b485303df44`, `8c6e1fa9732ec8322de275084817683e6d67407c`, `3fb9b06461dc2bf92043144974eedbbc9f69d0f3`, `f372e4a6a0dd16204ccbd660f23013601357c224` (修正前版筆誤 `f372e4a6a575b66d4826ae934eb063c467a8b417`), `c4c4a35f88907df6bf68e781059dde397c06ba03`, `031cfc4c99320b79f6ad863996a43a5da8227edf`, initial `7dccddaba7d51dca8d56da01d5320d9f22f8b68f` |
| Candidate SHA | `d0009b20641b6c0e86b24d782cf74719e7cfabf0` (prior `624251b43b95226b88901bd7eb5d24f4d2135514`, `bdd3568c299c0490ad47620aeb5bd0719a405d4c`) |
| Task Status   | `blocked` (卡點於後端查詢 producer `SR-BOOKING-VERIFY` 與企業端 session 權威身分接線)                |
| Branch        | `gemini/sr-enterprise-search-001`                                                                  |

---

## 1. 稽核來源與基準重現

### 1.1 來源問題與能力缺口

1. `docs/04-uat/system-remediation-20260906/source/findings.json` (R24, 角色: 車行／企業查詢者):
   > 不足: 查詢工具不足、頁籤不會篩選
   > 重現步驟與實際結果: 趟次機場接送點後仍6列；司機可接單點後仍2位；企業歷史缺日期/乘客/狀態搜尋
   > 建議修正及驗收: 實作篩選與搜尋並保留條件；純統計不要偽裝互動頁籤

2. `docs/04-uat/system-remediation-20260906/source/capabilities.json`:
   - `C013`: 查看歷史與既有預約詳情 — 補查詢條件與大量資料分頁；未等同建立到結算完成。
   - `C069`: 有效狀態／趟次篩選與匯出 — 篩選 query、總數、分頁同條件。

### 1.2 Base SHA 重現與後端 API 現狀核實

在最新 Base SHA (`3062ea363769cc393e59384251f5aedc7e570ac5`, current `origin/dev`) 檢查現狀：

1. **前端現況**：`apps/enterprise-dispatch-web/app/bookings/page.tsx` 在 dev trunk 原先僅 6 行，直接渲染 `<EnterpriseBookingHistory />`。該元件無乘客關鍵字搜尋、起訖日期篩選、狀態過濾、本人/代訂頁籤，亦無翻頁與空狀態。目前在本分支已實作完整之組合搜尋、條件清除、全域篩選後分頁與空狀態處理。
2. **後端 API 核實（關鍵卡點）**：
   - 檢查 `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459` 之 `@Get("tenant/bookings")`：僅接收 `x-tenant-id` 與 `x-request-id` 標頭，呼叫 `this.ownedMobilityService.listTenantBookings(tenantId)`。
   - 檢查 `owned-mobility.service.ts:2118`：回傳該租戶之全量預約清單，分頁固定為 `{ page: 1, pageSize: items.length, totalItems: items.length, totalPages: items.length > 0 ? 1 : 0 }`。
   - 後端完全**未暴露**查詢參數（如 `q`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize`）。
   - Client 端點 `packages/api-client/src/index.ts:1193` 與 `apps/enterprise-dispatch-web/lib/api-client.ts:59` 之 `listBookings()` 均為無參數方法，回傳全量陣列。
   - 查詢目前任務系統：`ai-status.sh show SR-BOOKING-VERIFY` 回傳 `Task not found: SR-BOOKING-VERIFY`，`SR-ENTERPRISE-SEARCH-001` 之 `depends_on` 仍為空陣列 `[]`。
3. **任務規範之硬性限制**：
   - Task spec 明白規定：「先核實目前API已有filter能力；實作日期/乘客/狀態與分頁，避免只篩目前頁假裝全域。若API缺filter必須在SR-BOOKING-VERIFY取得後端能力後才結案。」
   - 且本任務 `write_scopes` 僅包含：
     - `apps/enterprise-dispatch-web/app/bookings/page.tsx`
     - `tests/unit/system-remediation/sr-enterprise-search-001/`
     - `docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md`
   - 未經 Supervisor 擴充 scope 與加入相依前，不得改寫 `apps/api/` 或 `packages/api-client/`。

---

## 2. 審查意見回覆與客觀定位（對齊 Codex Rejection）

前一候選版本（`14ececf2f27d747e8d2e398d772b95b48c6ca78b`）經 Codex 獨立審查後判定 **rejected**，審查意見如下：

### 2.1 P1 企業端身分接線（Session Identity Wiring）
- **Codex 審查意見**：`page.tsx:584` 預設 `currentUser` 為 fixture（林宜君）；Next route 無驗證身分接線，僅加 optional prop 與 Alice 測試並未解決真實 mine/byme 行為。需接上權威 session 身分，必要時向 Supervisor 要求擴充 scope/dependency。
- **現階段處置與卡點**：
  1. 在 `page.tsx` 實作 `resolveCurrentEnterpriseUser`：支援從顯式 prop、瀏覽器 Cookie (`drts_session` JWT payload 或 `enterprise_user` cookie) 解析身分，無 session 時安全 fallback。
  2. 但 `enterprise-dispatch-web` 整體尚未有認證登入 session 管道（如 `tenant-portal-web` 之 bootstrap-session）。完整接線屬於跨應用認證架構，需由 Supervisor 協調。

### 2.2 P1 後端 Filter 能力相依未解（Backend Filter Capability Dependency）
- **Codex 審查意見**：任務規範明確要求結案前需有後端 filter 能力，但 `controller.ts:459` 與 `service.ts:2048` 仍僅暴露無 filter 的租戶清單，`page.tsx:605` 呼叫無 query 的 `listBookings()`。應透過 Supervisor 解決後端相依，而非宣稱未來選配增強。
- **現階段處置與卡點**：
  - 完全確認此為架構 blocker。依 `PHASE1_OPEN_QUESTIONS.md` 之 `Q-SR-ENTERPRISE-SEARCH-001` 與 `support/unblock/SR-ENTERPRISE-SEARCH-001/SR-ENTERPRISE-SEARCH-001-UNBLOCK-PLANNING-DECISION.md`，本任務應保持 `blocked`，待 Supervisor 登記後端 producer（`SR-BOOKING-VERIFY`）並完成交付後，方可消費其查詢合約。

### 2.3 P1 證據定位更正（Distinction of Unit vs Live Evidence）
- **Codex 審查意見**：測試第 12 節以 `createMockBooking` 建立資料，`booking-authoritative-001..005` 是 fixture ID，並非實際 API query/資源 ID 證據。修正文件第 2.4/3/4 節，不將 mock 測試稱為整合/live 證據。
- **現階段處置與更正**：
  - 測試第 12 節重命名為「In-Memory Filter Contract Validation with BookingRecord Model (Unit-Level Only; Not Live/API Integration Evidence)」，明確標記為前端篩選演算法對合約型別的單元驗證。
  - 文件全面刪除「權威 API 查詢與資源 ID 驗收記錄」之不當措辭，誠實列出為單元測試，未執行的後端 query 與 live 驗收明列為未完成。

### 2.4 P2 Base SHA 修正
- **Codex 審查意見**：記錄之 Base SHA `f372e4a6a575b66d4826ae934eb063c467a8b417` 無法解析（git cat-file exit 128），實際 `origin/dev` 為 `f372e4a6a0dd16204ccbd660f23013601357c224`。
- **現階段處置與更正**：
  - 同步更新至最新 `origin/dev`：`3062ea363769cc393e59384251f5aedc7e570ac5`，並記錄歷史修復演進。

### 2.5 Unblock 輔助任務結論與最新基準合併
- Unblock 輔助任務 `SR-ENTERPRISE-SEARCH-001-UNBLOCK-PLANNING-DECISION`、`SR-ENTERPRISE-SEARCH-001-UNBLOCK-MANUAL-UNBLOCK`（PR #1787）與 `SR-ENTERPRISE-SEARCH-001-UNBLOCK-HISTORY-REPAIR`（PR #1792）已正式合併至 `origin/dev`。
- 該等審查結論明確確認：
  1. 母任務 `SR-ENTERPRISE-SEARCH-001` 因後端缺少 list filter/page 查詢參數且未指派/完成 producer，依然處於 `blocked` 狀態。
  2. 未由 Supervisor 授權 `apps/api`、`packages/api-client` 等 shared scope 且未完成後端端點前，前端不能以純 mock 或前端降級篩選冒充後端查詢驗收。
  3. 最新 `origin/dev`（`3062ea363769cc393e59384251f5aedc7e570ac5`，包含 SR-ENTERPRISE-FORM-001、UV-EXEC-014、SR-PUSH-001 unblock、SR-FLEET-DATA-001、UV-EXEC-014-UNBLOCK-HISTORY-REPAIR 等）已於本 worktree 乾淨合併（Merge commit），無任何程式碼衝突。

### 2.6 Codex2 審查退件意見回覆（針對 Candidate `624251b43b95226b88901bd7eb5d24f4d2135514`）
- **Codex2 審查意見 P2（測試重複邏輯檔案）**：
  - 審查意見：`tests import ./enterprise-search-logic (independent duplicate), not production filter functions; source string checks cannot establish behavioral regression coverage.`
  - 處置與改進：
    1. 經深入排查 Next.js App Router 規範，`.next/types/app/bookings/page.ts` 對 `page.tsx` 會進行 `Diff<{ default: Function, ... }, TEntry>` 靜態型別比對，若存在自訂之模組級命名函式匯出（named function exports）將引發型別錯誤。然而 Next.js 完全允許純型別別名匯出（`export type`）以及將輔助方法附掛於預設頁面元件上作為靜態方法（`BookingsHistoryPage.<method>`）。
    2. 已徹底刪除暫存之 `tests/unit/system-remediation/sr-enterprise-search-001/enterprise-search-logic.ts`。
    3. `apps/enterprise-dispatch-web/app/bookings/page.tsx` 將 `filterEnterpriseBookings`、`paginateEnterpriseBookings`、`hasActiveFilters`、`matchesBookingSearch`、`matchesBookingDateRange`、`isSamePassenger`、`isSameBookedBy`、`getBookingStateMeta`、`gatewayHref`、`formatBookingTime`、`entBtnStyle`、`resolveCurrentEnterpriseUser` 等附掛於 `BookingsHistoryPage` 上。
    4. `sr-enterprise-search-001.test.ts` 直接自生產路徑 `../../../../apps/enterprise-dispatch-web/app/bookings/page` 引用並解構 `BookingsHistoryPage` 之靜態方法，對生產程式碼之過濾、搜尋、分頁、時區與身分解析進行 100% 直接行為回歸測試，徹底解決 P2 疑慮。
    5. 本地執行 `tsc --noEmit`、`next build`、`eslint` 與 54 項 Vitest 測試全數通過，無任何警告與錯誤。
- **Codex2 審查意見 P1（後端 Filter Producer 與 Session 身分接線）**：
  - 審查意見：`page.tsx:656 calls parameterless listBookings(), then filters/paginates locally at 667-674; controller.ts:459 and service.ts:2118 have no filter/page query contract. Task spec explicitly requires backend producer before acceptance; show SR-BOOKING-VERIFY exits 1 Task not found, depends_on empty. Supervisor must register producer and authorized shared scopes/dependency before owner consumes real query/total contract.`
  - 處置與定位：
    1. 完全確認此為架構 blocker。Task runbook 明定「若API缺filter必須在SR-BOOKING-VERIFY取得後端能力後才結案」。
    2. 目前任務板查無 `SR-BOOKING-VERIFY`，`ai-status.sh show SR-BOOKING-VERIFY` 回傳 exit 1，`depends_on` 仍為空陣列。
    3. 依據 `support/unblock/SR-ENTERPRISE-SEARCH-001/SR-ENTERPRISE-SEARCH-001-UNBLOCK-PLANNING-DECISION.md` 與 `AI_COLLABORATION_GUIDE.md` §0.5，本任務維持 `blocked` 狀態，誠實記錄卡點，不冒充完成，亦不宣稱前端 mock 為權威後端 query 證據。
    4. 待 Supervisor 登記後端 producer（`SR-BOOKING-VERIFY`）並完成交付、擴充 `apps/api` 與 `packages/api-client` 後，方能取得伺服器端分頁與過濾能力。

---

## 3. 現有交付項目（前端範圍，受 write_scopes 約束）

在 `write_scopes` 內已完成之實作：
1. **多維度組合搜尋與篩選**：乘客姓名/電話/編號/地址關鍵字搜尋、起訖日期、狀態過濾（預約/審批/派遣/進行中/已完成/已取消/無車可用）、本人/代訂範圍頁籤。
2. **清除篩選與即時重設**：提供清除條件按鈕與關鍵字一鍵重設。
3. **全域篩選後再分頁機制**：在前端取得資料後，先套用全域篩選與時間倒序，再進行分頁切片，嚴防「只篩目前頁假裝全域」。
4. **時區與日曆日對齊**：`parseLocalDateStart` 與 `parseLocalDateEnd` 產生本地時區日曆日邊界，與 `formatBookingTime` 渲染一致。
5. **身分比對與消歧義**：優先以 ID 與電話號碼比對，防範同名同姓誤判。
6. **身分解析輔助函式**：`resolveCurrentEnterpriseUser` 支援 prop、cookie JWT / JSON payload 解析及安全 fallback。
7. **直接測試生產元件與靜態輔助方法**：徹底刪除暫存之 `enterprise-search-logic.ts`，將過濾與分頁演算附掛於生產元件 `BookingsHistoryPage`，單元測試直接引用生產檔案並驗證所有條件搜尋、組合過濾、本地時區日曆日與身分解析，確保 `next build` 與專案靜態分析 100% 乾淨通過。
8. **UI Design Contract 符合性**：元件全面對齊 design canvas 與 `@drts/ui-tokens` 之 tenant realm tokens（fg: `#0F766E`, bg: `#F0FDFA`, border: `#99F6E4`），使用 `tenantEnterpriseTheme`，無硬編碼 raw hex 色彩。

---

## 4. 驗證指令與執行結果

所有指令均在本 isolated worktree (`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-search-001`) 執行：

```bash
$ git diff --check
# 無任何輸出，exit code 0

$ pnpm run i18n:guard
> drts-fleet-platform@0.1.0 i18n:guard
> node tools/ci/i18n-guard.mjs
i18n-guard: OK (525 files scanned across 10 apps, 55 exemption(s) from i18n-guard-baseline.json)
# exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> @drts/enterprise-dispatch-web@0.1.0 typecheck
> tsc --noEmit
# 無任何錯誤，exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web build
> @drts/enterprise-dispatch-web@0.1.0 build
> next build --webpack
▲ Next.js 16.2.3 (webpack)
  Creating an optimized production build ...
✓ Compiled successfully in 5.4s
  Finished TypeScript in 8.9s
  Collecting page data using 7 workers in 823ms
✓ Generating static pages using 7 workers (26/26) in 342ms
# exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web exec eslint . --max-warnings=0
# 無任何錯誤與警告，exit code 0

$ pnpm exec eslint tests/unit/system-remediation/sr-enterprise-search-001/
# 無任何錯誤與警告，exit code 0

$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/
 Test Files  1 passed (1)
      Tests  54 passed (54)
   Start at  01:53:52
   Duration  1.02s (transform 643ms, setup 0ms, import 785ms, tests 26ms, environment 0ms)
# exit code 0

$ pnpm --filter @drts/enterprise-dispatch-web test
 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  01:54:01
   Duration  1.04s (transform 2.01s, setup 0ms, import 2.83s, tests 441ms, environment 5ms)
# exit code 0
```

---

## 5. 阻擋原因與後續銜接（Blocker & Next Actions）

本任務依規範維持 `blocked` 狀態，不冒充交付完成：

1. **阻擋項目 1：缺少後端查詢過濾 Producer (`SR-BOOKING-VERIFY`)**：
   - 後端端點 `@Get("tenant/bookings")` 缺少 query 參數接收與資料庫過濾能力。
   - 需由 Supervisor 登記後端任務（如 `SR-BOOKING-VERIFY`）並更新 `SR-ENTERPRISE-SEARCH-001` 之 `depends_on`。
   - 待後端完成且合約 (`packages/contracts`, `packages/api-client`) 擴充 `listTenantBookings(query)` 後，本任務方能消除客戶端降級處理，完成端到端權威 API 查詢驗證。

2. **阻擋項目 2：企業端 Session 認證接線 (Enterprise Auth Session)**：
   - `apps/enterprise-dispatch-web` 缺少跨路由之權威使用者 session 機制。
   - 需由 Supervisor 協調認證架構擴充或提供正式 session 規範後，方能完成無 fixture fallback 的真實 `mine` / `byme` 驗證。

3. **外部未執行的 Live/真機部分**：
   - 尚未在已部署之 GCP Cloud Run Dev 環境對真實後端資料庫進行 live HTTP query 驗證。
   - 尚未在真機 iOS / Android Webview 進行觸控與手勢操作測試。

4. **後續銜接動作（Resume Gate）**：
   - Supervisor 在任務板註冊後端過濾 Producer 並授權 shared contract/client scope，更新母任務 `depends_on`。
   - 待該 Producer 獲審查通過並合併至 `origin/dev` 後，Owner (Gemini) 將 rebase 最新 dev，對接正式 query API，驗證伺服器端條件過濾與總數計算，並產出 live 查詢與資源 ID 驗證證據後再行提交 Review。
