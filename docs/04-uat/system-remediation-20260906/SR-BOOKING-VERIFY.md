# SR-BOOKING-VERIFY — 企業歷史查詢後端篩選／分頁與權威驗證 UAT 驗收報告

- **Task ID**: `SR-BOOKING-VERIFY`
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/sr-booking-verify`
- **Base Commit**: `553c4d6724757c2b9506f89dadcb94bf9829dfeb` (`origin/dev`)
- **Phase / Wave**: `system-remediation-20260906`

---

## 1. 任務背景與修復目標

既有企業租戶歷史訂單查詢（`GET /api/tenant/bookings`）存在後端篩選與分頁不足、單實例記憶體快取導致無法觀察外部實例變更、以及需要補齊真實租戶隔離與權威分頁契約之問題。

本任務補齊企業歷史查詢之完整後端篩選、排序、分頁與權威資料庫持久化讀取，具體交付項目包括：
1. **多維度後端篩選**：
   - 日期範圍：支援 `dateField`（預設 `reservationStart`，亦支援 `createdAt`），以 ISO 8601 時區時間戳或月曆日期區間（轉為當日 00:00:00 至次日 00:00:00+08:00 嚴格開閉區間 `[dateFrom, dateTo)`）進行篩選。
   - 乘客篩選：支援乘客姓名、電話、訂購者信箱之精確文字字面包含（包含 SQL 萬用字元 `%`、`_`、`\` 轉義），並支援 exact `passengerId` 精準匹配。
   - 狀態篩選：支援企業訂單狀態 union（`active`, `completed`, `cancelled`）與履約狀態（`OWNED_ORDER_STATUSES`）。
2. **持久化與第二實例可觀察性**：
   - 當資料庫連線啟用時，直接查詢 `ops.phase1_owned_orders`，每一請求均直接讀取資料庫，即時反映第二實例之狀態變更，絕不使用過期記憶體資料。
   - 資料庫查詢錯誤時立即拋出異常，絕不吞沒錯誤或降級為空資料。
3. **嚴格多租戶隔離**：
   - 未認證呼叫者：401 `AUTH_REQUIRED`。
   - 缺失 `x-tenant-id` header：400 `TENANT_ID_REQUIRED`。
   - JWT 租戶身分與 `x-tenant-id` 不符：403 `TENANT_SCOPE_MISMATCH`（平台管理員與系統身分允許跨租戶調閱）。
4. **權威分頁與穩定排序**：
   - 1-based 分頁（預設 `page=1, pageSize=20`，最大 `pageSize=100`）；不合法參數回傳 400 `INVALID_PAGINATION`。
   - 零比結果：`totalPages: 0, totalItems: 0`。
   - 超出頁數（out-of-range）：回傳空陣列 `items: []`，但維持精準之篩選總筆數與總頁數。
   - 穩定排序：依指定日期欄位 `DESC NULLS LAST, booking_id ASC`，確保分頁不重複、不漏頁。
5. **API 客戶端與契約對齊**：
   - 擴充 `@drts/api-client` 提供型別化 `queryTenantBookings(query?)`，回傳 `{ items, pagination }`。
   - 既有 `listTenantBookings(query?)`：若未帶 query 則自動遍歷所有分頁，防止第一頁截斷造成資料丟失；帶 query 時回傳 `items` 陣列，維持既有介面相容性。
   - 更新 `phase1_openapi_v1.yaml` 契約定義。
6. **專屬 GitHub Actions 遠端驗收工作流**：
   - 新增 `.github/workflows/booking-search-acceptance.yml`，配置真實 PostgreSQL / PostGIS 服務容器、自動遷移、Vitest 執行、零略過閘門（zero-skip gate）、狀態記錄與產物上傳。
   - 建立 `tools/ci/test_booking_search_acceptance_workflow.py` 契約測試。
7. **遠端驗收回歸診斷與修復（Candidate 6bdc24ee Diagnostic & Fix）**：
   - 遠端 run 34500698839 於 `booking-query-acceptance.test.ts:211` 拋出 `BOOKING_NOT_FOUND`。
   - 診斷確認：
     1. 整合測試的種子資料直接拼裝 JSON 記錄時缺少 canonical `OwnedOrderRecord` 欄位（`bookingType: "oneway"`, `approvalState: "not_required"`, `approvalRequestIds: []`, `complianceFlags: []` 等），造成 `mapOrderToBooking` 的嚴格檢查觸發 404；
     2. `OwnedMobilityService.mapOrderToBooking` 在既有實作中對可缺省欄位過於嚴苛；修復其對 `bookingType`（預設 `"oneway"`）、`reservationWindowEnd`（預設 `reservationWindowStart`）、`approvalState`（預設 `"not_required"`）與陣列解構的韌性保護，維持 `bookingId` 與 `tenantId` 核心不變數，確保多實例持久化資料映射不致因局部欄位缺失而誤判 404。
8. **通用 CI 單元測試隔離診斷與修復（Candidate ea308ba8 Diagnostic & Fix）**：
   - 遠端 PR #1927 之通用 CI（`ci-integ.yml` 及 `ci.yml` 之 `unit` / `smoke-acceptance`）失敗，因 runner 全域注入 `DATABASE_URL`，但單元測試階段尚未執行 `pnpm db:migrate`，導致 `booking-query-acceptance.test.ts` 誤判資料庫已就緒，拋出 `ops.phase1_owned_orders does not exist`。
   - 參照 `unattended-voice-postgres.integration.test.ts` 與專屬 acceptance 規範，嚴格禁止回退至通用 `DATABASE_URL`；將資料庫整合驗收測試守護精準綁定至專屬 `DRTS_BOOKING_VERIFY_DATABASE_URL`，避免通用單元測試套件因 unmigrated DB 誤報失敗，並確保專屬 GitHub Actions acceptance 工作流執行完整且零略過之遠端 PostgreSQL 驗收。


---

## 2. 異動檔案清單

| 檔案路徑 | 異動說明 |
|---|---|
| `packages/contracts/src/index.ts` | 匯出 `TenantBookingDateField`, `TENANT_BOOKING_DATE_FIELDS`, `TenantBookingListQuery`, `TenantBookingsPageRecord`, `DEFAULT_PRODUCT_TIMEZONE`, 日期轉換與驗證輔助函式 |
| `packages/api-client/src/index.ts` | 新增 `buildTenantBookingQueryParams`、`queryTenantBookings`，更新 `listTenantBookings` 自動分頁遍歷，匯出 `DrtsApiClient` 別名 |
| `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts` | 在 `ops.phase1_owned_orders` 上實作持久化 `queryTenantBookings`，支援 SQL 萬用字元轉義、精準 passengerId、日期開閉區間、穩定排序與計數 |
| `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | 實作 `assertTenantAccessScope`、`validateTenantBookingListQuery`，整合 repository 持久化查詢與記憶體退避；修復 `mapOrderToBooking` 韌性預設值與合規閘門防禦性存取 |
| `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | 更新 `GET /api/tenant/bookings` 接收 query 參數與當前身分，強制租戶範圍驗證，回傳完整分頁 envelope |
| `phase1_openapi_v1.yaml` | 更新 `GET /api/tenant/bookings` 參數定義與回應 schema |
| `tests/unit/system-remediation/sr-booking-verify/booking-query.test.ts` | 完整單元測試：身分隔離、400 參數驗證、日期區間、乘客模糊搜尋、狀態篩選、分頁排序、ApiClient 相容性以及映射不變數韌性測試（25 項測試） |
| `tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts` | 整合驗收測試：AppModule DI 線路驗證與真實 PostgreSQL 雙租戶資料庫查詢、外部實例異動即時觀察，補齊規範之種子記錄欄位 |
| `.github/workflows/booking-search-acceptance.yml` | 專屬遠端 acceptance 工作流（Postgres 16 服務、db:migrate、zero-skip gate、產物上傳） |
| `tools/ci/test_booking_search_acceptance_workflow.py` | GitHub Actions 工作流結構與 run-status 邏輯合約測試（9 項測試） |
| `docs/04-uat/system-remediation-20260906/SR-BOOKING-VERIFY.md` | 本 UAT 驗收報告 |

---

## 3. 驗證指令與實際結果

所有指令均於隔離 worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-booking-verify` 中執行：

| 檢驗項目 | 執行指令 | Exit Code | 實際輸出與結果 |
|---|---|---|---|
| Whitespace 檢查 | `git diff --check` | 0 | 通過，無多餘空白或格式問題 |
| 合約包構建 | `pnpm --filter @drts/contracts build` | 0 | `tsc` 構建成功，型別定義生成 |
| API Client 型別檢查 | `pnpm --filter @drts/api-client typecheck` | 0 | `tsc -p tsconfig.typecheck.json --noEmit` 通過 |
| 後端 API 型別檢查 | `pnpm --filter @drts/api typecheck` | 0 | `tsc -p tsconfig.json --noEmit` 通過 |
| 專屬單元測試套件 | `pnpm exec vitest run tests/unit/system-remediation/sr-booking-verify/` | 0 | 1 檔案，25 項測試全部通過 (25 passed) |
| 既有行程單元測試 | `pnpm exec vitest run tests/unit/owned-mobility.test.ts` | 0 | 1 檔案，39 項測試全部通過 (39 passed) |
| 整合驗收測試套件 | `pnpm exec vitest run tests/integration/system-remediation/sr-booking-verify/` | 0 | DI 測試通過；PostgreSQL 測試在無本機 DB 守護下安全略過 (1 passed, 1 skipped) |
| CI 工作流合約測試 | `python3 tools/ci/test_booking_search_acceptance_workflow.py` | 0 | 9 項合約測試全部通過 (Ran 9 tests in 0.199s, OK) |

---

## 4. 驗收標準檢核（Acceptance Checklist）

- [x] **Durable authenticated tenant query filters before pagination**:
  - 資料庫模式下直接查詢 `ops.phase1_owned_orders`，於分頁前計算精確之總筆數 (`COUNT(*)`)。
  - 第二實例之直接 SQL 更新於下一次查詢立即呈現，無記憶體快取滯留。
  - 資料庫故障立即拋出例外，不吞沒錯誤。
- [x] **Strict Tenant Isolation**:
  - 401: 未認證請求回傳 `AUTH_REQUIRED`。
  - 400: 缺失 `x-tenant-id` header 回傳 `TENANT_ID_REQUIRED`。
  - 403: JWT 租戶身分與 `x-tenant-id` 不符時回傳 `TENANT_SCOPE_MISMATCH`。
  - Cross-tenant data leakage: A 租戶查詢絕不回傳 B 租戶訂單。
- [x] **Typed client/envelope/OpenAPI agree**:
  - `@drts/contracts` 定義 `TenantBookingListQuery` 與 `TenantBookingsPageRecord`。
  - `@drts/api-client` 提供 `queryTenantBookings` 與向後相容之 `listTenantBookings`（未帶參數時自動全分頁遍歷）。
  - `phase1_openapi_v1.yaml` 完整記錄各 query 參數與回應結構。
- [x] **Filtering & Ordering**:
  - 日期範圍支援 `reservationStart` 與 `createdAt`，處理月曆日或 ISO 8601 時區時間。
  - 乘客搜尋支援轉義萬用字元（`%`、`_`、`\`）與 `passengerId` 精準篩選。
  - 狀態支援 `active`, `completed`, `cancelled` 與履約狀態。
  - 穩定排序：`DESC NULLS LAST, booking_id ASC`。
- [x] **Remote Acceptance Workflow**:
  - 建立 `.github/workflows/booking-search-acceptance.yml`，具備 PostGIS 容器、db:migrate、零略過檢查與 run-status 記錄。
  - 經由 `tools/ci/test_booking_search_acceptance_workflow.py` 嚴格測試驗證。

---

## 5. BOOKING-QUERY-LARGE-PG-ACCEPTANCE-20261020 — C013 代表性大量資料 PostgreSQL 分頁與跨租戶／第二實例驗收補強

- **Continuation Task ID**: `BOOKING-QUERY-LARGE-PG-ACCEPTANCE-20261020`
- **Parent Task ID**: `SR-BOOKING-VERIFY`（維持原 `done` 狀態與既有 keys 不變）
- **Source Requirement ID**: `C013`（補查詢條件與大量資料分頁；未等同建立到結算完成）
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/booking-query-large-pg-acceptance-20261020`
- **Base Commit**: `28ba56f7abb0292c4560d87c2c76bde5676984f7` (`origin/dev`)
- **Write Scopes**:
  - `tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts`
  - `docs/04-uat/system-remediation-20260906/SR-BOOKING-VERIFY.md`

### 5.1 設計錨點（Design Anchor）

1. **問題背景與覆蓋缺口**：
   - 既有 `SR-BOOKING-VERIFY` 已透過真實 PostgreSQL 驗證 3 筆自有租戶訂單＋1 筆他租戶訂單之篩選、排序、`100%` 萬用字元轉義、分頁（`pageSize=2`, `page=1/2/99`）與第二實例 SQL 異動觀察；而 `booking-query.test.ts` 中之 125 筆分頁測試為 API client `fetch` 替身。
   - 為完整覆蓋 `C013` 原驗收「代表性大量資料分頁」要求，於既有 `tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts` 之 `Real PostgreSQL Acceptance Matrix` 新增代表性大量資料案例，完全沿用既有正式 `OwnedMobilityController` / `OwnedMobilityService` / `OwnedMobilityRepository` / `DatabaseService` 與 `ops.phase1_owned_orders` 遷移 schema，不新增任何產品路徑、helper、workflow 或替代資料表。
2. **代表性語料與獨立已知 Cohort 設計（1,003 筆自有 ＋ 251 筆外租戶）**：
   - **自有租戶（`tenant-integ-large-alpha`）**：固定建立 `1,003` 筆訂單（`integ-lrg-own-0001` .. `integ-lrg-own-1003`，對應 `bk-lrg-own-0001` .. `bk-lrg-own-1003`）。
   - **外租戶（`tenant-integ-large-beta`）**：固定建立 `251` 筆訂單（`integ-lrg-foreign-0001` .. `integ-lrg-foreign-0251`，對應 `bk-lrg-foreign-0001` .. `bk-lrg-foreign-0251`），並故意配置重疊之時間區間、狀態與搜尋關鍵字作為跨租戶隔離誘餌。
   - **穩定排序與同時間戳平手（Tie-Breaking）設計**：
     - 每 3 筆連續訂單共用同一 `reservationWindowStart` 與 `createdAt` 時間戳（`slot = Math.floor(i / 3)`，由 `2026-09-20T00:00:00.000Z` 依 slot 每小時遞減），寫入資料庫時於每個 3 筆同時間戳群組內故意打亂插入順序（如 `3, 1, 2`），驗證正式 SQL `ORDER BY ... DESC NULLS LAST, booking_id ASC` 能於頁內與跨頁邊界（例如 `pageSize=100` 時第 100 筆與第 101、102 筆同屬 `slot=33`）維持嚴格 `bk-lrg-own-0001` .. `bk-lrg-own-1003` 排序。
   - **已知篩選 Cohort**：
     - 狀態 Cohort：`0001..0200`（200 筆）為 `completed`；`0201..0350`（150 筆）為 `cancelled`；`0351..1003`（653 筆）為 `dispatched`（對應 bookingStatus `active`）。
     - 搜尋與萬用字元轉義 Cohort：`0001..0065`（65 筆）含字面 `CohortVIP_100%`；`0001..0012`（12 筆）具 `passengerId = "pax-lrg-key-cohort"`。
     - 日期開閉區間 Cohort：`[2026-09-18T15:00:00.000Z, 2026-09-20T00:00:00.000Z)` 精準涵蓋 `slot = 1..33` 共 `99` 筆（`bk-lrg-own-0004` .. `bk-lrg-own-0102`），排除邊界 `slot = 0`（3 筆）與 `slot >= 34`。
   - **第二實例重水合（Rehydration）與持久化異動驗證**：
     - 實例化獨立之第二組 `DatabaseService` / `OwnedMobilityRepository` / `OwnedMobilityService` / `OwnedMobilityController`，將原本位於最末頁（第 11 頁第 3 筆、`status = "dispatched"`）之 `integ-lrg-own-1003` 直接以 SQL 更新為 `status = "completed"` 且 `reservationWindowStart = "2026-09-21T00:00:00.000Z"`，驗證第二實例立即觀察到其躍升至第 1 頁第 1 筆、`completed` 總筆數由 `200` 增至 `201`（總頁數由 `2` 增至 `3`）、`active` 總筆數由 `653` 減至 `652`。

### 5.2 實作與驗證對照表（依 `AI_COLLABORATION_GUIDE.md` §0.7）

- **Design Anchor Commit**: `379a0a23943411ed41c53b38da2e03b47924b7eb` (`wip(BOOKING-QUERY-LARGE-PG-ACCEPTANCE-20261020): anchor C013 large-corpus PG acceptance design`)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
|---|---|---|---|---|
| `booking_query_large_real_pg_pagination_and_isolation` | 既有正式查詢路徑：`OwnedMobilityController.listTenantBookings` (`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#L544-L569`) → `OwnedMobilityService.listTenantBookings` (`apps/api/src/modules/owned-mobility/owned-mobility.service.ts#L3240-L3291`) → `OwnedMobilityRepository.queryTenantBookings` (`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts#L559-L724`) 與正式 `ops.phase1_owned_orders` (`infra/migrations/V0011__phase1_runtime_snapshots.sql`, `V0064__owned_booking_cross_instance_identity.sql`)。<br>測試修改位置：`tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts` 新增 `"executes representative large-corpus (1003 own + 251 foreign) real PostgreSQL pagination, tie-breaking sort, cohort filtering, tenant isolation, and rehydrated second-instance mutation observation"`，並完整保留原 DI 測試與原 3 own + 1 foreign 小語料測試案例。 | 舊版 `ba11837fb7dc2185cf51aa3dba61774cd57f249b` / `28ba56f7abb0292c4560d87c2c76bde5676984f7` 之真實 PG 整合測試僅涵蓋 3 筆自有＋1 筆外租戶訂單（hosted run `39397025176` 共 `27 passed, 0 skipped`），未涵蓋 C013 代表性大量資料跨多頁與末頁部分頁之真 PG 驗證。<br>→ 修正版於同一 `booking-query-acceptance.test.ts` 補齊 `1,003` 筆自有＋`251` 筆外租戶真實 PG 測試：驗證 `pageSize=100` 下第 `1..10` 滿頁（各 100 筆）與第 `11` 部分末頁（3 筆）及第 `12` 超界頁（0 筆、總數維持 1,003）、1,003 筆自有 ID 恰各出現一次、頁內與跨頁邊界（`slot=0` 與 `slot=33`）同時間戳 tie-breaking (`DESC NULLS LAST, booking_id ASC`)、已知狀態／`CohortVIP_100%` 萬用字元轉義／`passengerId`／日期區間／`subtype`＋`createdAt` 篩選與清除還原、251 筆外租戶 3 頁分頁與雙向 403 `TENANT_SCOPE_MISMATCH`、以及重水合第二組 `DatabaseService`/`OwnedMobilityRepository`/`OwnedMobilityService`/`OwnedMobilityController` 實例觀察 `integ-lrg-own-1003` 持久化異動後第 1 頁／第 11 頁與 `completed` (`200→201`, `totalPages 2→3`)／`active` (`653→652`) 即時更新。 | 1. `git diff --check` → Exit `0`。<br>2. `pnpm exec eslint tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts --max-warnings=0` → Exit `0`。<br>3. `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/api typecheck` → Exit `0`。<br>4. `env -u DRTS_BOOKING_VERIFY_DATABASE_URL -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-booking-verify/booking-query.test.ts tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts` → Exit `0`（本機無 PG 守護下：`26 passed, 2 skipped (28 total)`）。<br>5. `python3 tools/ci/test_booking_search_acceptance_workflow.py` → Exit `0`（9 項工作流合約測試全數通過）。 | 依 VM 限制規範，不在本機啟動 PostgreSQL 或產品伺服器；真實遷移後 PostgreSQL（`28/28 passed, 0 skipped`）由候選發布後透過既有 `.github/workflows/booking-search-acceptance.yml` 於 GitHub-hosted disposable runner 執行並收錄 raw `test-report.json` / `run-status.json` 證據。 |
| `booking_query_large_source_review_ci_merge` | 僅修改授權 `write_scopes` 內之兩檔案：<br>- `tests/integration/system-remediation/sr-booking-verify/booking-query-acceptance.test.ts`<br>- `docs/04-uat/system-remediation-20260906/SR-BOOKING-VERIFY.md` | 保留原 `SR-BOOKING-VERIFY` 母任務 `done` 狀態、原驗收項目與所有既有測試名稱／斷言；先建立 `wip(BOOKING-QUERY-LARGE-PG-ACCEPTANCE-20261020)` 設計錨點 commit `379a0a23943411ed41c53b38da2e03b47924b7eb`，再完成實作並推送候選分支與 PR 交由 `Gemini2` 獨立審查。 | 1. `git status --short` 確認僅觸及上述 2 個授權檔案。<br>2. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` → Exit `0`。<br>3. 本地 `HEAD`、遠端 `origin/gemini/booking-query-large-pg-acceptance-20261020` 與 PR `headRefOid` 完整 40 字元 SHA 一致後執行 `ai-status.sh handoff`。 | 待 `Gemini2` 對鎖定之 `CANDIDATE_SHA` 完成獨立 review、GitHub Actions 必過 CI 綠燈、受保護分支 merge，以及 Root 於既有 `booking-search-acceptance.yml` 執行 `0 skip / 0 fail` 後記錄兩項 acceptance keys。 |

### 5.3 範圍邊界與限制聲明（Limitations）

- 本次交付僅補強 `C013` 原有「代表性大量資料分頁」在真實遷移 PostgreSQL 下之整合驗收覆蓋（`1,003` 筆自有＋`251` 筆外租戶代表性測試語料），**不構成**新的產品吞吐量／效能 SLO，亦未修改任何產品 API、service、repository、migration 或 workflow 定義。
- 本次驗證屬於原始碼與 GitHub-hosted disposable PostgreSQL 驗收工作流（`.github/workflows/booking-search-acceptance.yml`）範圍；**不等同**完整預訂到結算（booking-to-settlement）端到端閉環，亦不取代真實外部供應商、實體裝置、人工營運演練、正式環境部署／回滾、PAX 或 Final 階段驗收要求。
