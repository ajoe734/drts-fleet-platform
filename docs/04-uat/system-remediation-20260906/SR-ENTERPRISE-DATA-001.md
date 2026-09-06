# SR-ENTERPRISE-DATA-001 — 企業首頁／行程真資料及聯絡入口

| 欄位          | 內容                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-DATA-001.md`   |
| Owner         | Gemini                                                                     |
| Reviewer      | Claude2                                                                    |
| Base SHA      | `564e27f63045789537b54f5c0b5909f6468032ca` (rebased onto `origin/dev` tip) |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD`                             |

## 1. 重現與基準

- **歷史觀察基準**：9/6 盤點（R08、R09、R16）觀察到 Enterprise Dispatch Web 原先首頁（`app/page.tsx`）與目前行程頁（`app/trip/page.tsx`）直接讀取靜態 fixture（`EB-7K2E1D`），即使在 9 月仍呈現已過期的 6 月行程並寫死「9 分鐘後抵達」；點擊「預約詳情」導向不存在的 `EB-7K2E1D`，後端 API 回應 404 後前端卻顯示「服務暫時不穩定」（R08, C017, C119）。
- **聯絡按鈕缺失**：行程頁的「聯絡司機」與「企業客服」為無動作的靜態按鈕，且無條件顯示寫死的示範司機個資（「張家豪 · 4.9 ★」），在尚未派車或電話未授權時亦無法表達「無司機狀態」（R09, C018）。
- **當前程式真值**：本任務自 `origin/dev` 出發，確認既有 `@drts/enterprise-dispatch-web` 具備 `/control-plane-proxy` 與 `getEnterpriseDispatchTenantClient` API，但首頁及行程頁從未接上權威 API，也沒有資料轉接與錯誤分類機制。

## 2. 這個任務做了什麼

本任務嚴格限制於宣告的 `write_scopes`，完成企業首頁與行程權威資料接線及聯絡入口修正：

### 1. `apps/enterprise-dispatch-web/lib/dispatch-fixture-adapter.ts`

- **權威資料模型適配**：`adaptBookingRecordToEnterpriseBooking(record)` 將後端 `BookingRecord` 轉換為前端檢視模型，如實映射訂單狀態（`orderStatus`）、預約時間窗、上下車地址、航班資訊與核准狀態，保留真實 `bookingId`，不以固定百分比或假 9 分鐘 ETA 欺騙使用者。
- **無司機狀態與個資保護**：`resolveTripDriverInfo(booking)` 正確識別派車狀態。若尚未指派司機（如 `submitted`、`matching`、`no_supply`），返回明確的「無司機狀態」（`status: "unassigned"`、`driverName: "尚未指派司機"`、`vehicle: "車輛安排中"`），絕不露出假個資；若司機電話未公開（`isPhoneAuthorized: false`），遮蔽電話並導向客服，貫徹「資料未授權不可露出」。
- **可測聯絡動作配置**：`resolveTripContactConfig(driverInfo, supportPhone)` 提供標準化聯絡動作：
  - 客服動作：永遠提供真實租戶客服電話 `tel:0800-200-118`。
  - 司機動作：若司機已派且電話已授權，提供 `tel:${driverPhone}`；若電話未公開，轉為客服轉達；若尚未派車，按鈕設為 disabled 並載明「尚未指派司機」。
- **404 與錯誤分類**：`classifyBookingApiError(error, bookingId)` 嚴格區分 404 與 500 伺服器錯誤。404 判定為 `BOOKING_NOT_FOUND`（不可重試、非暫時故障），提供明確的「查無此行程 (404)」提示與返回列表操作，禁止將 404 包裝成「服務暫時不穩定」。
- **行程軌道階段映射**：`mapBookingRecordToProgressStage(record)` 依後端真實 `orderStatus`（`assigned`、`enroute_pickup`、`arrived_pickup`、`on_trip`、`completed`）驅動 5 階段進度條。

### 2. `apps/enterprise-dispatch-web/lib/enterprise-fixtures.ts`

- 新增 `getAuthoritativeEnterpriseBooking(bookingId, records)`：支援從權威清單中查詢並適配指定預約。
- 保留既有靜態 lookup 以維持既有測試向後相容。

### 3. `apps/enterprise-dispatch-web/app/trip/trip-client.tsx` 與 `page.tsx`

- 重構為由權威 API 驅動的客戶端元件：
  - 若 URL 指定 `?bookingId=<id>`，精確向租戶 API 查詢該筆預約；若查無該筆（404），呈現清晰的 404 狀態卡片與回列表/首頁按鈕，不宣告服務不穩。
  - 若未指定 `bookingId`，自動載入最新或進行中行程；若無任何預約，呈現象徵正常的空狀態（`trip-empty`），引導建立新預約。
  - 「聯絡司機」與「企業客服」按鈕連接真實動作（`tel:` 協議與 `data-testid`）。
  - 「預約詳情」按鈕導向 `/bookings/${booking.bookingId}`，確保跨頁 ID 完全一致。

### 4. `apps/enterprise-dispatch-web/app/page.tsx`

- 重構首頁為客戶端權威資料驅動：
  - 首頁載入權威預約清單，若有進行中行程，主卡片直接顯示該筆真實行程，點擊「查看行程」帶入同一個 `bookingId`（`/trip?bookingId=<id>`）。
  - 即將到來的預約清單中，每一筆項目皆包含指向 `/bookings/<id>` 的可點擊連結，與列表及詳情完全一致。
  - 若無進行中行程或無預約，呈現適當的空狀態與引導，不以 June mock 示意資料充數。
  - KPI 審批狀態與預約總數如實反映權威清單數據（待審筆數依真實資料計算，無待審時顯示 0 件）。

### 5. `tests/unit/system-remediation/sr-enterprise-data-001/`

- 新增 `enterprise-authoritative-data.test.ts`，涵蓋：
  - 列表→首頁→詳情同一 Booking ID 的導航連結與一致性。
  - 司機未派車時的「無司機狀態」及未授權電話遮蔽。
  - 司機已派且授權時的電話撥號動作。
  - 企業客服真實專線（`0800-200-118`）之可測電話協議。
  - 404 NOT_FOUND 錯誤分類與不誤報暫時故障檢驗。
  - 5 階段進度條狀態對齊。
  - 空清單時的優雅處理。

## 3. 驗收條件對應

| 驗收條件                                             | 對應實作與證據                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 列表→首頁→詳情指向存在同booking；不存在就合理空/404  | `enterprise-authoritative-data.test.ts` 驗證 `bookingId` 跨列表、首頁、行程與詳情完全一致；`trip-client.tsx` 與 `page.tsx` 實作權威查詢，不存在時回報 404 BOOKING_NOT_FOUND 或合理空狀態。 |
| 聯絡按鈕有可測導航/電話/支援動作；資料未授權不可露出 | `resolveTripContactConfig` 提供 `tel:0800-200-118` 與司機 `tel:` 連結；未授權或無司機時遮蔽電話並給予不可用原因，禁止露出非授權個人資料。                                                  |
| 證據包含 base/candidate SHA、實際指令結果與資源 ID   | 記錄於本文件第 1、4 節；單元測試包含模擬資源 ID `BK-ENT-20260906-001` 及租戶 ID `10000000-0000-0000-0000-000000000201`。                                                                   |
| 先 commit＋普通 push，再 handoff                     | 實作完成後依規範執行 anchor/closeout commit 並進行 push 與 handoff。                                                                                                                       |

## 4. 實際指令與結果

```bash
$ git diff --check
(exit 0，無空白或格式問題)

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> @drts/enterprise-dispatch-web@0.1.0 typecheck
> tsc --noEmit
(exit 0，全套 TypeScript 類型檢查無錯誤)

$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-data-001-2

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  07:51:06
   Duration  778ms
(exit 0，9 項單元測試全數通過)

$ pnpm --filter @drts/enterprise-dispatch-web test
> @drts/enterprise-dispatch-web@0.1.0 test
> vitest run --config vitest.config.ts

 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  07:51:10
   Duration  1.28s
(exit 0，enterprise-dispatch-web 既有 8 個測試檔案與 24 項測試全數通過，無回歸)
```

## 5. 未做的部分（明列，不冒充成功）

- **真實 PSTN 電話撥號與語音通話**：本任務驗證 `tel:0800-200-118` 及 `tel:${driverPhone}` 連結屬性與電話協議可用性，未連接真實電信運營商閘道或發起實際手機通話（此為 PSTN live 範疇）。
- **真實 GPS 即時推播車輛位置**：本任務 ETA 與軌道進度依權威 `BookingRecord.orderStatus` 與 `etaMinutes` 計算，未連接 WebSocket / SSE live 車機高頻座標回傳（此屬 live/真機範疇）。
- **跨 package 檔案未修改**：未修改 `components/enterprise-booking-lifecycle.tsx` 或中央 test config，嚴格恪守 supervisor 指派之 `write_scopes`。

## 6. Write scope 遵守情況

僅新增/修改宣告範圍內的檔案：

- `apps/enterprise-dispatch-web/app/page.tsx`（修改）
- `apps/enterprise-dispatch-web/app/trip/page.tsx`（修改）
- `apps/enterprise-dispatch-web/app/trip/trip-client.tsx`（新增）
- `apps/enterprise-dispatch-web/lib/dispatch-fixture-adapter.ts`（修改）
- `apps/enterprise-dispatch-web/lib/enterprise-fixtures.ts`（修改）
- `tests/unit/system-remediation/sr-enterprise-data-001/enterprise-authoritative-data.test.ts`（新增）
- `docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-DATA-001.md`（本檔案，新增）
