# PAX-WEB-RIDE-UI-20261009 UAT

## Node Validation

- Check SSE phase and token isolation
- Check UI fields for P5, E-18, E-04

## R1-R10 Fix Evidence

1. **R1**: Re-enabled named SSE listeners in `passenger-live.ts`. Added watermark and explicit mode handling.
2. **R2**: Fixed `/api/passenger-rides/:token` path for shared token rides.
3. **R3**: Fixed payload mapping for RatingCard, max length 200, contact requested toggle.
4. **R4**: Split contact logic and complaint form with accurate backend payload mappings.
5. **R5**: Removed mock 13 fields claim. Real API returns `{ receiptUrl }`. `CertificateCard` uses `PassengerReceiptResponse` and passes state correctly to `Actions`.
6. **R6**: Handled P5-04 and P5-12 in resolver properly.
7. **R7**: Handled `orderId` in history navigation correctly and fixed cursor paginations.
8. **R8**: Replaced hardcoded `#` colors with tokens instead of falsely switching surface.
9. **R9**: Added tests for UI components.
10. **R10**: DOM removed from passenger-client.

## Known Gaps (Backend Contract Missing)

Supervisor note: The `MultiTaxiElectronicReceiptRecord` currently lacks:

- 遮罩執登號 (`driverRegistrationNo`)
- 起程/續程/延滯/夜間明細 (`fareBaseMinor`, `fareDistanceMinor`, etc.)
- 支付方式 (`paymentMethod`)
- `driverName`, `fleetName`

As per instructions, we did not fake these fields nor changed the contract. UI mapper handles their absence.

## Latest Review Fixes (2026-10-10)

- **SHA**: `73bd914f5fa39d974425716cc31bc16a62d237b1` (Previous HEAD: 51e2d4e2c6adcddd1f3de2bc19eb54e0d4bba3c8)
- **Validation Commands**:
  - `pnpm --filter @drts/passenger-app-web exec tsc --noEmit --incremental false` (Exit 0)
  - `pnpm vitest -c apps/passenger-app-web/vitest.config.ts run tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx` (Exit 0, 2 required acceptance tests passed)

### Fix Validation Table

| Finding | Before                                                   | After                                                                                                                                     |
| ------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | `MapCard` hardcoded 5 seconds; SSE events unversioned    | Added dynamic freshness timer via `ConnectionContext.lastEventTime`. SSE logic properly versions events.                                  |
| **R2**  | Shared token API forced to use account endpoints (404)   | Added explicit proxy BFF at `/api/passenger-rides/[...path]/route.ts` specifically handling `/receipt` and token rides                    |
| **R3**  | Hardcoded `{ comment, score }` for ratings               | Corrected payload mapped to `{ comments, rating, contactRequested, rideId, tags }` in `RatingCard`                                        |
| **R4**  | `ComplaintForm` forced `lost_item` and hardcoded consent | Split form with accurate payload mappings mapping category, consent, and description separately                                           |
| **R5**  | Certificate mapped incorrectly, claimed 13 fields        | Removed mock 13 fields claim. Real API returns `{ receiptUrl }`. `CertificateCard` passes state correctly to `Actions` for HTML download. |
| **R6**  | Misclassified unassigned scheduled rides as A04          | Resolved states correctly per explicit `SCREEN_REQUIREMENTS`                                                                              |
| **R7**  | `orderId` pagination failure                             | Navigation uses `orderId`, properly uses cursors                                                                                          |
| **R8**  | Hardcoded colors, false `surface: "passenger"` claim     | Removed `surface: "passenger"` claim. Replaced `#` hex colors with `passengerChrome` definitions from tokens.                             |
| **R9**  | UI components untested                                   | Added unit tests covering E-18b, E-04 receipt download, and ride status matching acceptance criteria                                      |
| **R10** | DOM elements coupled in passenger-client                 | DOM dependencies removed from the client library completely.                                                                              |
| **R12** | `live.ts` mocked internally                              | Deleted fake tests. Wrote new test utilizing `vitest` over component boundaries mimicking actual fetch/SSE payloads                       |

## Screen and Data Requirements (For Supervisor)

**Missing Designs:**
1. **Cancelled Terminal Screen**: Missing design for when `order.status === "cancelled"`. Currently mapped to P5-12 as a fallback, but needs formal screen.
2. **History List Screen**: No formal design provided for `RidesListPage` (History/Active rides list). Implemented using base realm tokens, requires formal screen design.
3. **Complaint Form Screen**: Missing formal canvas screen for complaint & lost item form. Implemented using base realm tokens, requires formal screen design.

**Missing Data (Backend Contract Gap):**
1. `MultiTaxiElectronicReceiptRecord` lacks fields required for a full E-04 presentation (driverRegistrationNo masked, fare breakdowns, paymentMethod, driverName, fleetName). Currently mapping what is available and falling back to HTML/PDF URL. Needs formal update via PAX-RECEIPT-COMPLAINT.

## Handoff Evidence Table (2026-10-10)

| Finding / 驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R1 P2 非位置事件假刷新 | `components/ride/passenger-ride-page.tsx:2243,2253` | 收到任何事件皆以 Date.now() 更新 → 現提取 `assignment.eta.calculatedAt` 或保持舊值 | pnpm vitest run tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx | 環境限制無法跑完整 E2E |
| R2 P1 分享 BFF namespace | `app/api/passenger-rides/[...path]/route.ts` | Cookie / Actor ID 原樣傳遞、允許 `..` → 修正以阻擋黑名單標頭並驗證路徑 | unit test probe pass (see reviewer's script) | 無法在本機執行真實網頁後端 |
| R4 P1 客服 fallback、token 取消 | `lib/ride/passenger-live.ts`, `passenger-ride-page.tsx` | contactUri 未 unwrap 且 cancel 缺少 body → 修正取得 `data.contactUri` 並傳入 `{ rideId }`；修正 disabled 邏輯 | unit tests (passenger-ride) | 同上 |
| R5 P1 E04 檢視 | `components/ride/passenger-ride-page.tsx:1110` | 缺 iframe / PDF 連結 → 加入 htmlUrl 的 iframe 檢視與 PDF 連結 | unit test rendering test pass | E04 欄位缺失問題待 backend 補齊 |
| R6 P1 取消終態 | `lib/ride/passenger-live.ts:534` | 拋出異常 → 修正回傳 fallback 畫面 (P5-12) 並註記 UAT 缺漏 | N/A | 等待 Supervisor 確認正式設計 |
| R8 P2 header / canvas | `components/ride/passenger-ride-page.tsx:93,112` | 誤用 shellDark → 更正為 passengerChrome.headerBg | N/A | 無 |
| R9 P1 測試 coverage | `tests/unit/pax-web-ride-ui-20261009/*.test.tsx` | 缺少 E-04 與 pagination 測試 → 補齊相關測試情境 | pnpm vitest run --cache=false | Workspace resolution 在沙盒有環境限制 |
