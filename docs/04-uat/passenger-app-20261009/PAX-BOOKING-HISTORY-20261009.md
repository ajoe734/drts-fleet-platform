# PAX-BOOKING-HISTORY-20261009

## 依據

- PAX-BOOKING-HISTORY-20261009 Task Brief
- 01_system_sa_sd.md (System Architecture/System Design)
- 02_content_and_rules.md (Rules & Fares)

## Finding 修復與驗收 (R1-R8)

| Finding | 修正邊界與結果 | 驗收方式與結果 |
|---|---|---|
| **R1** | MultiTaxiService DI lookup缺陷已在 aa0fd925 到 2c6ddccb 間修復。 | 確認 graph resolved=true/providerModule=MultiTaxiModule |
| **R2** | 嚴格 timestamp 驗證：檢查確認時間不可在未來，並實作 createBookingHistory 的交易補償機制。如果存檔失敗，則取消已建立之訂單。 | Vitest Unit test 確認 `cannot be in the future` 及 `Failed to save booking history` 錯誤觸發時正確呼叫 `cancelTrustedPassengerRide`。 |
| **R3** | 傳送正確的 Server 帳號 ID (`passengerId`)：將 `passengerId` 寫入 `order.passenger`，拒絕 body 偽造身分。 | DTO `passenger` 對應中已確實傳入 `passengerId`。Vitest Unit Test 驗證建單時正確帶入 account 權威資料。 |
| **R4** | 修正 Booking DTO 映射：比對請求的地址、時間與 quote，保留地址。透傳付款 ID、轉換 `rating` 為 `score` 及 `comments` 為 `comment`，並從 `getTrustedPassengerReceipt` 取出 `htmlUrl` 回傳 `receiptUrl`。 | 重新改寫 Controller 及 Service 介面，依據 `contracts/passenger-app.ts` 正式契約讀寫資料。 |
| **R5** | `getActiveRides` 擷取邏輯：確保在 owner 範圍中查全 active，正確掃頁而不再被 `LIMIT 50` 任意截斷。 | Service 使用 `hasMore` while 迴圈反覆擷取直到清空所有紀錄，並僅保留 active 狀態的行程。Vitest 驗證多筆資料。 |
| **R6** | `GetPassengerRidesQuery` 分頁機制與排序：在 Controller 加上 limit 的合法邊界驗證 (1-100)，在 Repository 實作正確的 Cursor-based pagination (`ORDER BY created_at DESC, order_id DESC`)。 | Repository 已改寫支援 `cursorCreatedAt` 及 `cursorOrderId` 過濾條件。 |
| **R7** | 手機驗證 `REQUIRE_SMS_VERIFICATION` 配置：依據環境變數強制檢查 `account.verifiedPhone`，未配置時 fallback `contactPhone`。 | Service 新增對 `process.env.REQUIRE_SMS_VERIFICATION` 判斷，若無則返回 `Phone number is required`。Vitest 已驗證此邏輯。 |
| **R8** | 實作完整的產品 Unit Test，取代原有的 toBeDefined 佔位測試。 | 建立 `booking-history-spec.test.ts`，並模擬合法與拒絕邊界（無手機、未來確認、存檔失敗、跨帳號存取等），均已驗證。 |

## 實際修改

1. 建立 `infra/migrations/V0113__passenger_booking_history.sql`，定義 `passenger.booking_histories` 以記錄帳號的行程歸屬。
2. 改寫 `apps/api/src/modules/passenger-app/booking/` 目錄的 `PassengerBookingController`, `PassengerBookingService`, `PassengerBookingRepository`。
3. 修改 `apps/api/src/modules/passenger-app/passenger-app.module.ts` 以提供 Booking Module 依賴。
4. 修正 DTO 映射與 Repository 查詢以支援 Cursor-based pagination 及正確的契約屬性。
5. 實作完整的 Vitest 測試 `booking-history-spec.test.ts`。

## 未修改原因

- `auth.policy.ts` 已有對 `passenger-app` 的 catch-all，且此段會匹配 `/api/passenger-app/rides` 並給予正確的 realms (`passenger`)，因此無需修改。
- 第一方推播路由在 `multi-taxi.service.ts` 的 `writeOrderPartnerNotificationRouteIfApplicable` 沒有實作針對乘客的第一方路由寫入，因為文件指示不在 Phase A 寫入。

## 命令與退出碼

- Unit tests (pax-booking-history): `pnpm exec vitest run tests/unit/pax-booking-history-20261009/booking-history-spec.test.ts` -> Exit 0
- Typecheck: 忽略因 `@drts/control-plane-auth` 未建置之依賴錯誤 (TS2307)。

## Candidate SHA / PR

- Handoff前由 orchestrator 記錄。

## 剩餘未驗項目

- E2E 測試與資料庫 Migration 的 CI 實測 (將由 PAX-QA-20261009 及 Reviewer 執行)。
