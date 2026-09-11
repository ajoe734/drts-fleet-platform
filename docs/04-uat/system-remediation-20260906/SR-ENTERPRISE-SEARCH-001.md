# SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致 UAT 驗收報告

- **Task ID**: `SR-ENTERPRISE-SEARCH-001`
- **Owner**: `Claude`
- **Reviewer**: `Claude2`
- **Branch**: `claude/sr-enterprise-search-001-recovery-20260911`
- **Base Commit**: `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127` (`origin/dev`)
- **Phase / Wave**: `system-remediation-20260906`
- **Dependency**: `SR-BOOKING-VERIFY` — `done`, merged at `8c19cc566468d54c548205bb21039ac0113e5900` (verified reachable from this branch's `HEAD` via `git branch --contains`).

---

## 1. 任務背景與修復目標

企業前台歷史預約頁（`apps/enterprise-dispatch-web`）在 `SR-BOOKING-VERIFY` 補齊後端權威篩選／分頁／總數契約之前，`EnterpriseBookingHistory` 元件僅呼叫不帶參數的 `listBookings()`，前端沒有任何日期／乘客／狀態篩選 UI，也沒有分頁；`listBookings()` 會遍歷全部分頁把整個租戶的預約一次抓回，不存在「組合篩選與清除、翻頁、空狀態一致」的行為。

`SR-BOOKING-VERIFY` 已於 `dev` 提供權威 `GET /api/tenant/bookings` 查詢（`passenger`／`status`／`dateField`／`dateFrom`／`dateTo`／`page`／`pageSize`），回傳精確篩選總數與分頁 envelope（`TenantBookingsPageRecord`），並提供型別化 `queryTenantBookings` client 方法。本任務將企業前台歷史頁改為消費這組權威 query，而非在前端對已抓回的資料做本地篩選（「page-local filtering posing as global」）。

交付項目：

1. **前端組合查詢 UI**：乘客搜尋（比對 passenger 姓名／電話／Email）、狀態下拉（`active` / `completed` / `cancelled`，直接對應 `BookingStatus` union，不臆造契約沒有的分類）、日期區間（月曆日期，經 `convertCalendarRangeToInstantRange` 轉為顯式時區 ISO instant，start-inclusive／end-exclusive）、清除篩選按鈕。
2. **伺服器端分頁**：頁碼、每頁筆數（5/10/20）、上一頁／下一頁，皆以伺服器回傳之 `pagination.totalItems` / `totalPages` 為準，不在前端重新計算「全域」總數。
3. **一致的空狀態**：
   - 完全無資料（未篩選且總數為 0）→ 顯示既有 `bookingLifecycle.history.empty` 空狀態。
   - 篩選後零筆（總數為 0 但篩選條件非預設）→ 顯示專屬「找不到符合條件的預約」空狀態，並提供「清除篩選」捷徑。
4. **日期區間前端驗證**：`dateFrom > dateTo` 時不送出請求、顯示行內錯誤訊息，避免打一個必然被後端 400 拒絕的請求。
5. **競態保護**：篩選/分頁變更時以 `AbortController` 取消前一個尚在途的查詢，避免舊回應覆蓋新篩選結果（stale response cancellation）。
6. **可測試的純查詢組合邏輯**：新增 `apps/enterprise-dispatch-web/lib/enterprise-booking-search.ts`，把「UI 篩選狀態 → `TenantBookingListQuery`」的組合邏輯抽成不依賴 React／Next／`@drts/api-client` 的純函式，讓 root Vitest 能在不需要這個 app 自己的 jsdom／alias 設定下直接匯入測試。
7. **前端查詢 → 真實後端 acceptance**：新增 `tests/e2e/system-remediation/sr-enterprise-search-001/enterprise-search-query-acceptance.test.ts`，直接呼叫前端的 `buildEnterpriseBookingSearchQuery`（不是手刻的 query 物件）餵給真實、未修改的 `OwnedMobilityController`／`OwnedMobilityService` 打真實 PostgreSQL，驗證組合篩選／清除／分頁／空狀態的總數在「前端組出的 query」與「後端真實資料」之間是一致的。
8. **專屬 GitHub Actions 遠端驗收工作流**：`.github/workflows/enterprise-search-acceptance.yml`（PostGIS 服務容器、`db:migrate`、零略過閘門、run-status 記錄、artifact 上傳）與 `tools/ci/test_enterprise_search_acceptance_workflow.py` 契約測試。

---

## 2. 異動檔案清單

| 檔案路徑 | 異動說明 |
|---|---|
| `apps/enterprise-dispatch-web/lib/enterprise-booking-search.ts` | **新增**。純函式：`EnterpriseBookingSearchFilters`、`buildEnterpriseBookingSearchQuery`、`hasActiveEnterpriseBookingFilters`、`validateEnterpriseBookingDateRange`、`formatEnterpriseBookingTime`、`computeEnterpriseBookingPageRangeLabel`。僅依賴 `@drts/contracts`，不依賴 `@drts/api-client` 或任何 `@/` alias，確保 root Vitest 可直接匯入。 |
| `apps/enterprise-dispatch-web/lib/api-client.ts` | 新增 `EnterpriseDispatchTenantClient.queryBookings()`（呼叫 `@drts/api-client` 的 `queryTenantBookings`），並 `export * from "./enterprise-booking-search"` 讓既有呼叫端維持單一 import 來源。 |
| `apps/enterprise-dispatch-web/components/enterprise-booking-lifecycle.tsx` | 重寫 `EnterpriseBookingHistory`：以篩選狀態組出 `TenantBookingListQuery`、呼叫 `queryBookings`、以 `AbortController` 取消過期請求、渲染篩選列／結果統計／兩種空狀態／分頁列。`EnterpriseBookingDetail` 與取消/編輯行為未變動。 |
| `apps/enterprise-dispatch-web/lib/translations.ts` | 新增 `bookingLifecycle.history.*` 系列 zh/en 翻譯鍵（sub、搜尋 placeholder、狀態選項、清除篩選、日期區間錯誤、篩選後空狀態、結果統計）。 |
| `tests/unit/system-remediation/sr-enterprise-search-001/enterprise-booking-search-query.test.ts` | **新增**。19 項單元測試，涵蓋 `hasActiveEnterpriseBookingFilters`、`validateEnterpriseBookingDateRange`、`buildEnterpriseBookingSearchQuery`（含 trim、單邊日期、雙邊日期、組合篩選）、`formatEnterpriseBookingTime`、`computeEnterpriseBookingPageRangeLabel`。 |
| `tests/e2e/system-remediation/sr-enterprise-search-001/enterprise-search-query-acceptance.test.ts` | **新增**。真實 PostgreSQL 驗收：清除篩選還原全域總數、乘客篩選、狀態篩選、組合篩選、分頁穩定排序、篩選後空狀態、再次清除的 round-trip。以 `DRTS_ENTERPRISE_SEARCH_DATABASE_URL` 守護，本機未設定時安全略過（見第 4 節）。 |
| `.github/workflows/enterprise-search-acceptance.yml` | **新增**。專屬遠端 acceptance 工作流。 |
| `tools/ci/test_enterprise_search_acceptance_workflow.py` | **新增**。工作流結構與 run-status 邏輯合約測試（9 項測試）。 |
| `docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md` | 本 UAT 驗收報告。 |

---

## 3. 驗證指令與實際結果

所有指令均於隔離 worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-enterprise-search-001` 中執行：

| 檢驗項目 | 執行指令 | Exit Code | 實際輸出與結果 |
|---|---|---|---|
| Whitespace 檢查 | `git diff --check` | 0 | 通過，無多餘空白或格式問題 |
| 前端型別檢查 | `pnpm --filter @drts/enterprise-dispatch-web typecheck` | 0 | `tsc --noEmit` 通過 |
| 前端 Lint | `pnpm exec eslint .`（於 `apps/enterprise-dispatch-web`） | 0 | 無 error／warning |
| 專屬單元測試套件 | `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/` | 0 | 1 檔案，19 項測試全部通過 (19 passed) |
| 專屬 e2e 驗收套件（本機） | `pnpm exec vitest run tests/e2e/system-remediation/sr-enterprise-search-001/` | 0 | 1 檔案，1 項測試因 `DRTS_ENTERPRISE_SEARCH_DATABASE_URL` 未設定而安全略過 (1 skipped) — 見第 4 節 |
| CI 工作流合約測試 | `python3 -m unittest tools/ci/test_enterprise_search_acceptance_workflow.py -v` | 0 | 9 項合約測試全部通過 (Ran 9 tests, OK) |

Resource IDs（e2e 測試種子資料，僅於真實 DB 驗收工作流執行時建立/刪除）：`tenant-ent-search-integ` 租戶下 `bkq-ent-1`..`bkq-ent-5`（`entq-ord-1`..`entq-ord-5`）。

---

## 3.1 candidate `af0bfedef50e` 的真實 CI 回歸與修復（GitHub reconciled）

`af0bfedef50e308bc10cd1591620958778f9d83e`（PR #1961）經 GitHub 對帳為 candidate 後，`Enterprise Search Acceptance (SR-ENTERPRISE-SEARCH-001)` 工作流（run `34560574799` / job `103142275007`）在真實 PostgreSQL 上實際執行，發現真實缺陷，**並非本機 6 項指令能重現**（本機當時無 `DRTS_ENTERPRISE_SEARCH_DATABASE_URL`，e2e 只能安全 skip，第 3 節第 4 列所述僅是「未崩潰」，不是「已驗證通過」）：

- **失敗現象**：`expect(passengerOnly.pagination.totalItems).toBe(4)` 實際收到 `5`（`tests/e2e/.../enterprise-search-query-acceptance.test.ts:238`）。
- **根因**：種子資料把 `bookingId`/`orderId` 命名為 `bk-ent-search-N` / `ent-search-ord-N`，而 `OwnedMobilityRepository.queryTenantBookings` 的 `passenger` 篩選（`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:291-308`，非本任務 write_scopes、未改動）本就是對 `record->'passenger'->>'name'`／`phone`／`mobile`／`email`／`passengerId`／`booking_id`／`order_id`／`costCenter` 做 `ILIKE '%…%'` 的多欄位比對，屬於既有、正確的權威後端行為。種子的 `bookingId`/`orderId` 字面含有 `search` 子字串，導致 `passenger=Search` 這個「只想比對乘客姓名」的測試查詢，連帶把所有 5 筆（含不該命中的 `Dave Other`）都透過 `booking_id ILIKE '%Search%'` 命中——是測試資料設計缺陷，不是後端或前端查詢組合邏輯的缺陷。
- **修復**（commit `924c9e42be67f7b855bdb491d6776f2738c78279`，在本任務 write_scopes 內 `tests/e2e/system-remediation/sr-enterprise-search-001/`）：把種子 `bookingId`/`orderId` 改名為 `bkq-ent-N` / `entq-ord-N`（不再含 `search` 子字串），使 `passenger=Search` 只命中乘客姓名含 "Search" 的 4 筆，其餘欄位不再意外命中。本機重跑 `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/`（19 passed）與 `tests/e2e/.../enterprise-search-query-acceptance.test.ts`（1 skipped，因本機無 DB，行為與修復前一致，非本次驗證範圍）。真實 DB 驗證交由 CI 重跑（見下）。
- **CI 重跑證據**：push 後 PR #1961 head 變為 `924c9e42be67f7b855bdb491d6776f2738c78279`，觸發新的 `Enterprise Search Acceptance` run `34561207686`（job `103144130125`），對真實 PostGIS/PostgreSQL 服務容器執行，結果 `SUCCESS`：`Gate on zero skips and all tests passed` 步驟輸出 `Enterprise search acceptance: 20/20 passed, zero skips.`，`run-status.json` 記錄 `status: passed`（`candidate_sha`/`workflow_sha` 均為 `924c9e42be67f7b855bdb491d6776f2738c78279`）。乘客篩選 `totalItems=4` 的原始斷言失敗已確認修復。

### 未解決的第二個真實缺陷（超出本任務 write_scopes，阻塞 CI 綠燈）

同一 candidate 的 `CI (integration trunk)` 工作流之 `changes` job（`tools/ci/check_test_coverage.py`）持續失敗，與上述乘客篩選缺陷**無關**、獨立缺陷：

```
check_test_coverage: test files that yield nothing when CI runs
  - tools/ci/test_enterprise_search_acceptance_workflow.py: on no path CI runs (discovery roots: tools/development-orchestrator)
```

- **根因**：本任務自己新增的 `tools/ci/test_enterprise_search_acceptance_workflow.py`（write_scopes 內）從未被接進 `.github/workflows/ci.yml` 與 `.github/workflows/ci-integ.yml` 的「Verify scope classifier contract」步驟——對照同目錄下已有先例（`test_tenant_binding_acceptance_workflow.py`、`test_academy_acceptance_workflow.py`、`test_leave_acceptance_workflow.py`、`test_booking_search_acceptance_workflow.py`、`test_host_acceptance_workflow.py`，皆各自在 `ci-integ.yml` 以 `python3 -m unittest tools/ci/test_X.py` 直接列出），本任務缺了對稱的一行 `python3 -m unittest tools/ci/test_enterprise_search_acceptance_workflow.py`。`tools/ci/check_test_coverage.py`（`tools/ci/`）的存在正是為了攔截「新增了測試檔但沒接進 CI discovery」這類缺口，此處被它正確攔下。
- **為何本任務未直接修**：`.github/workflows/ci.yml`、`.github/workflows/ci-integ.yml` 皆不在本任務 `write_scopes`（僅 `.github/workflows/enterprise-search-acceptance.yml` 在內），依 task brief「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫」與 `AI_COLLABORATION_GUIDE.md` §0.6，不應未經授權逕自修改這兩個跨任務共用的 CI 檔案。
- **需要的動作**：請 supervisor 將 `.github/workflows/ci.yml`、`.github/workflows/ci-integ.yml` 納入本任務 write_scopes（或改指派給有權限的 lane），各補一行對稱既有 pattern 的 `python3 -m unittest tools/ci/test_enterprise_search_acceptance_workflow.py`（`ci.yml` 第 55-59 行區塊、`ci-integ.yml` 第 80-88 行區塊）。此為機械式、與既有 5 個手足 acceptance workflow test 同 pattern 的單行新增，無需重新設計。
- 已透過 `ai-status.sh blocker` 記錄，`waiting_for=Claude`。

---

## 4. 誠實揭露：本機與遠端驗收邊界（未冒充完成的部分）

依 VM 限制，本 worker 環境**禁止**啟動產品開發伺服器、預覽／瀏覽器測試伺服器或 Docker Compose 基礎設施（不得執行 `pnpm dev`、`playwright test`、`docker compose`）。因此：

1. **本機無法產生真實瀏覽器 UI 渲染證據**。組合篩選／清除／翻頁／空狀態的「畫面」正確性，本任務僅能以 (a) 型別檢查、(b) 純函式單元測試、(c) 「前端查詢組合函式 → 真實後端／真實 PostgreSQL」的資料層 acceptance 來間接證明查詢語意正確；**沒有**用 Playwright／真實瀏覽器對已建置的 `enterprise-dispatch-web` 執行點擊、輸入、畫面斷言。
2. `tests/e2e/system-remediation/sr-enterprise-search-001/enterprise-search-query-acceptance.test.ts` 命名為 `e2e` 是因為它打真實、未修改的 controller/service/repository 與真實 PostgreSQL（不是 mock），但它**不**啟動 HTTP listener，也**不**是瀏覽器測試。這與 `SR-HOST-FE-001-ACCEPTANCE-RUNNER` 建立的「isolated Nest 組合 + 真實 build + 真實 Chromium」模式（`tests/e2e/system-remediation/sr-host-fe-001/host-browser-acceptance.spec.ts` 等）不是同一等級的證據。
3. 之所以在本任務內未複製 Host 那套「build + 啟動真實 API + 啟動真實 Next production server + Playwright」全鏈路瀏覽器 acceptance，是因為：
   - 本 worker 不能在此 VM 上啟動任何一段（dev server／browser／compose），整條鏈路完全無法在本機迭代除錯；
   - 完整 `AppModule` 是否能在乾淨 CI runner 上以 `app.listen()` 真正啟動（而非僅 DI 結構驗證），涉及本任務 write_scopes 之外的多個模組設定（金鑰、第三方 provider 等），貿然新增一個從未在本機驗證過的啟動腳本，風險是產出一個會在 CI 卡住或失敗、卻無法遠端除錯的工作流；
   - `OwnedMobilityModule`（本功能唯一相關模組）已確認註冊於真實 `AppModule`（`apps/api/src/app.module.ts:94`），不像 Host 案例存在「模組未接線」的既有缺口，因此本任務選擇風險較低、已有先例（`SR-BOOKING-VERIFY` 之 `tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts`）且可在本機安全執行到「skip」為止的資料層 acceptance 模式，而非在單一 turn 內盲目複製一條全新、未經任何本機驗證的瀏覽器全鏈路。
4. **建議**：若 supervisor／reviewer 認定 `required_acceptance: enterprise_search_actual_query_totals_and_ui` 中的 `_and_ui` 必須是真實瀏覽器渲染證據（而非資料層 acceptance），建議另立一個對稱於 `SR-HOST-FE-001-ACCEPTANCE-RUNNER` 的 follow-up task（例如 `SR-ENTERPRISE-SEARCH-001-ACCEPTANCE-RUNNER`），專門負責建置＋啟動＋Playwright 全鏈路，而不是把這個風險疊加進本次 owner turn。本任務已完成、且可驗證的部分是：真實查詢語意正確（資料層）、UI 程式碼本身依真實 API 契約組成查詢並正確渲染分頁/空狀態（型別檢查＋純函式測試），並非「冒充」全數完成。

---

## 5. 驗收標準檢核（Acceptance Checklist）

- [x] **組合篩選與清除、翻頁、空狀態一致；實際 query/總數有證據**：
  - 前端不再自行「抓全部再篩選」；`queryBookings` 直接送出組合後的 `TenantBookingListQuery`，總數／頁數一律取自伺服器 `pagination`。
  - e2e 測試證明：清除篩選（無參數）回傳全域總數 5；乘客篩選回傳 4；狀態篩選回傳 1；組合篩選回傳 2 且分頁在該 2 筆上穩定排序、無重複無遺漏；篩選後零筆時總數精準為 0；再次清除還原為 5（round-trip 無殘留篩選狀態）。
  - 兩種空狀態（全域無資料 vs. 篩選後無資料）在元件層以不同 `data-testid` 與文案區分，未合併成同一種訊息。
- [x] **證據包含 base/candidate SHA、實際指令結果與資源 ID**：見第 3 節指令表與資源 ID 清單；candidate SHA 將於 commit 後由 `ai-status.sh handoff` 記錄。
- [x] **未做的 live／真機部分明列，不冒充成功**：見第 4 節。
- [x] **先 commit＋普通 push，再 handoff**：owner 不直接 `done`。commit `924c9e42be67f7b855bdb491d6776f2738c78279` 已於 `af0bfedef50e` 之上以普通 non-force push 發布至 `claude/sr-enterprise-search-001-recovery-20260911`。因第 3.1 節所述、超出 write_scopes 的第二個缺陷仍阻塞該 candidate 的 CI 全綠，本次以 `ai-status.sh blocker` 而非 `handoff` 記錄狀態；待 scope 授權或 CI 修復後才會 `handoff` 給獨立 reviewer `Claude2`，且仍待 candidate CI／merge 及 `required_acceptance` 完備才可結案。

---

## 6. 未變更／未涉及範圍

- `EnterpriseBookingDetail`（單筆預約檢視／編輯／取消）行為與樣式未變動，僅共用 `errorContent`／`bookingState` 等既有 helper。
- 未修改 `apps/api/**`、`packages/contracts/src/index.ts`、`packages/api-client/src/index.ts` 等 `SR-BOOKING-VERIFY` 已交付並合併之後端/契約檔案，完全消費既有權威 API，未重做已修復之能力。
- 未引入任何 fixture、固定百分比、假簽章或假送達；所有畫面資料均來自 `queryTenantBookings` 之真實回應。
