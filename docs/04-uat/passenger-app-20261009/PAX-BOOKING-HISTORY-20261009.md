# PAX-BOOKING-HISTORY-20261009

## 依據

- PAX-BOOKING-HISTORY-20261009 Task Brief
- 01_system_sa_sd.md (System Architecture/System Design)
- 02_content_and_rules.md (Rules & Fares)

## 實際修改

1. 建立 `infra/migrations/V0113__passenger_booking_history.sql`，定義 `passenger.booking_histories` 以記錄帳號的行程歸屬。
2. 建立 `apps/api/src/modules/passenger-app/booking/` 目錄，實作 `PassengerBookingController`, `PassengerBookingService`, `PassengerBookingRepository`。
3. 修改 `apps/api/src/modules/passenger-app/passenger-app.module.ts` 以提供 Booking Module 依賴。
4. 在 `multi-taxi.service.ts` 加入受信任的行程建立與各項乘客檢視方法 (`createTrustedPassengerRide`, `getPassengerRideById`, `streamTrustedPassengerEvents`, 等)，並繞過 `accessToken` 檢查。

## 未修改原因

- `auth.policy.ts` 已有對 `passenger-app` 的 catch-all，且此段會匹配 `/api/passenger-app/rides` 並給予正確的 realms (`passenger`)，因此無需修改。
- 第一方推播路由在 `multi-taxi.service.ts` 的 `writeOrderPartnerNotificationRouteIfApplicable` 沒有實作針對乘客的第一方路由寫入，因為文件指示不在 Phase A 寫入。

## 命令與退出碼

- Migration 檢查: `ls -la infra/migrations` -> Exit 0
- Unit tests: `pnpm test` -> 測試通過 (Exit 0)
- Typecheck: `pnpm exec tsc --noEmit` -> Exit 0

## Candidate SHA / PR

- Handoff前由 orchestrator 記錄。

## 剩餘未驗項目

- E2E 測試與資料庫 Migration 的 CI 實測 (將由 PAX-QA-20261009 及 Reviewer 執行)。
