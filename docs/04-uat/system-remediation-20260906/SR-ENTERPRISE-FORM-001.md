# SR-ENTERPRISE-FORM-001 — 企業預約乘客、日期與手機表單

- Owner: `Gemini2`
- Reviewer: `Gemini`
- Wave: `system-remediation-20260906`
- Gap IDs: `R20`, `R21`, `R22`
- Capability IDs: `C015`, `C016`, `C019`, `C120`
- Base SHA: `548608e45841ca9edcbf382399bbbfb74d164535` (`origin/dev`)
- Candidate SHA: recorded at `handoff` time via `git rev-parse HEAD`
- Branch: `gemini2/sr-enterprise-form-001`

---

## 1. Audit Source (2026-09-06) vs. Reproduction at Base SHA

### R20 / C015 (角色: 企業員工／代訂)
- **問題描述**: 自訂情境與乘客資料未一致帶入。為自己預約卻預選 `other/Sato`；改乘客進 review 仍舉牌 `Sato 様`。
- **Base SHA 重現**:
  1. `createEnterpriseBookingDraft` 硬編碼 `passengerMode: "other"` 與 `passenger: seed.passenger`（Sato Kenji）。
  2. `parseEnterpriseBookingDraft` 在 query params 為空時回退至 `other` 模式，造成使用者進入預約頁預設為他人代訂訪客。
  3. `apps/enterprise-dispatch-web/app/bookings/review/page.tsx` 第 234 行硬編碼顯示 `{enterpriseDriver.placard}`（固定為 `"Sato 様"`），即便在表單修改乘客為本人或其他姓名，進入 review 仍顯示 `Sato 様`。

### R21 / C016 (角色: 企業預約者)
- **問題描述**: 過去日期可進最後確認頁。9/6 填 6/13 並等 hydration 完成；可進 review 且顯示送出按鈕。
- **Base SHA 重現**:
  1. `isEnterpriseDraftComplete` 僅檢查字串非空，無日期有效性檢查。
  2. 缺乏前端預約時段與最短提前時間（15 分鐘）檢核，填寫 2026-06-13 等過期日期時，表單「繼續確認」按鈕保持啟用，進入 `/bookings/review` 後仍渲染可點擊的 `BookingSubmitButton`。

### R22 / C019 / C120 (角色: 手機企業使用者)
- **問題描述**: 390px viewport 下首頁寬度 743px、表單寬度 694px，文字擠壓且卡片超出。輸入鍵盤與錯誤訊息可能遮擋 CTA。
- **Base SHA 重現**:
  1. 表單採用硬編碼桌面雙欄 `gridTemplateColumns: "1.55fr 1fr"` 與內層 `gridTemplateColumns: "1fr 1fr"`，無 `@media (max-width: 768px)` 響應式斷點。
  2. Review 頁面亦使用硬編碼雙欄 `gridTemplateColumns: "1fr 1.1fr"`。
  3. `apps/enterprise-dispatch-web/app/globals.css` 缺少視窗防溢出規則，導致在 390px 行動寬度下強制橫向展開產生水平捲軸。

---

## 2. Remediation Implementation (Write Scopes Only)

所有修改嚴格限定於 `write_scopes`，且完全遵循 UI Design Contract，僅引用 `@drts/ui-tokens` 與 `enterpriseTheme` 規範之租戶 realm token（`#0F766E` / `#5EEAD4` / `#F0FDFA` / `#99F6E4` 等）：

1. **`apps/enterprise-dispatch-web/lib/enterprise-booking-draft.ts`**:
   - `EnterpriseBookingDraftForm` 新增 `placard: string` 欄位。
   - 新增 `derivePlacard(passenger: string)` 智慧推導輔助函式，支援外賓格式清洗與 Japanese honorific 様。
   - 新增 `MIN_LEAD_TIME_MINUTES = 15`、`getEarliestReservationTime(now, leadTimeMinutes)` 與 `validateReservationWindow(date, time, now, leadTimeMinutes)`：
     - 正確依據 `+08:00` 台灣時區基準進行毫秒級 instant 換算比對。
     - 拒絕過去時間（`PAST_DATE`）及違反 15 分鐘最短提前時間之時段（`TOO_SOON_TO_BOOK`），並輸出最早可預約時間標籤（UTC+8）。
   - `createEnterpriseBookingDraft`:
     - 預設模式改為 `"self"`，乘客及舉牌均預設為 `seed.bookedBy`（"林宜君"）。
   - `parseEnterpriseBookingDraft`:
     - 智慧判斷 `pm` 參數或根據乘客與下單人關係自動識別 `self` / `other`。
     - 支援 `placard` query key 反序列化；未指定時自動依乘客狀態推導保持一致。
   - `serializeEnterpriseBookingDraft`:
     - 序列化加入 `placard` 確保 review 頁面與來回編輯時舉牌資料不丟失。
   - `isEnterpriseDraftComplete`:
     - 加入 `validateReservationWindow` 檢核，過去時間或提前量不足時直接回傳 `false`，防禦性阻擋送審流程。

2. **`apps/enterprise-dispatch-web/components/booking-form/`** (新建 `booking-form.tsx` 與 `index.ts`):
   - 建立獨立表單組件，完全支援本人預約／他人代訂動態切換：
     - 切換至「為自己預約」時，同步將乘客與舉牌設為下單人姓名。
     - 切換至「為他人代訂」時，支援乘客選單並即時推導舉牌姓名。
     - 機場情境卡片提供明確的「接機舉牌（Placard）」自訂欄位，使用者可自訂特殊舉牌標題（如「王大明 經理」），自訂後不再被自動覆蓋。
   - 即時表單日期校驗：
     - 過去時間與違規提前時間即時呈現 `.form-field-error` 提示並附上最早可預約時間。
     - 即時檢核卡片以紅綠狀態 pill（`有效` vs `時間過期` / `需提前預約`）標記，違規時停用「繼續確認」CTA 按鈕。
   - 響應式佈局：
     - 套用 `.booking-form-grid`、`.booking-form-inner-grid` 與 `.booking-form-sticky-panel`，在 390px 寬度下平滑切換為單欄垂直流，輸入框、錯誤訊息與 CTA 不重疊、不遮擋。

3. **`apps/enterprise-dispatch-web/app/bookings/new/page.tsx`**:
   - 匯入路徑切換至 `@/components/booking-form`。
   - 完整傳遞 resolved searchParams 進入 `parseEnterpriseBookingDraft`。

4. **`apps/enterprise-dispatch-web/app/bookings/review/page.tsx`**:
   - 舉牌顯示由原本硬編碼之 `{enterpriseDriver.placard}` 修正為動態讀取 `draft.placard || derivePlacard(draft.passenger) || draft.passenger`，徹底消除 Sato 様殘留缺陷。
   - 增加 Review 頁面服務端驗證：若外部 URL 直入過期日期，顯示警示 Banner，並將送出按鈕置換為「時間過期不可送出（Disabled）」及「返回修改預約時間」按鈕。
   - 採用響應式 `.review-grid`，390px 寬度下收斂為單欄。

5. **`apps/enterprise-dispatch-web/app/globals.css`**:
   - 引入 `@drts/ui-tokens` 之 `--realm-tenant-*` 與 `--tone-danger-*` CSS 變數。
   - 設定 `html, body { overflow-x: hidden; max-width: 100vw; }` 防護。
   - 增加 `@media (max-width: 768px)` 斷點：
     - 導覽列與標頭收斂。
     - 首頁多欄 KPI 與表單／確認頁格線均降維至單欄 `1fr !important`，消除 743px / 694px 溢出。
     - 行動端輸入框字級設為 16px，防止 iOS Safari 自動縮放產生視窗橫向偏移。

6. **`apps/enterprise-dispatch-web/app/layout.tsx`**:
   - 匯出 `viewport: Viewport`，設定 `width: "device-width", initialScale: 1, maximumScale: 5, viewportFit: "cover"`。

---

## 3. Regression Tests

建立專屬回歸測試套件：
`tests/unit/system-remediation/sr-enterprise-form-001/sr-enterprise-form-001.test.ts` (16 項測試全部通過):

- **R20 / C015 驗證**:
  - `defaults to self mode with bookedBy as passenger and matching placard`
  - `parses empty query params as self-booking for the logged-in user without defaulting to other/Sato`
  - `parses explicit pm=self and synchronizes passenger and placard to bookedBy`
  - `parses explicit pm=other and derives matching placard`
  - `derives respectful placard for guest or Japanese titles`
  - `preserves custom edited placard across serialization and parsing`
  - `maintains data integrity from form draft to review serialization`
- **R21 / C016 驗證**:
  - `rejects past dates such as 2026-06-13 relative to current evaluation date`
  - `rejects reservation inside the authoritative 15-minute lead time`
  - `accepts valid reservation after the 15-minute minimum lead time`
  - `correctly handles timezone day boundaries (+08:00 vs UTC)`
  - `calculates earliest reservation time rounded up to nearest 5 minutes`
  - `enforces isEnterpriseDraftComplete to block review progress on past dates`
- **R22 / C019 / C120 驗證**:
  - `defines responsive single-column classes and viewport protections in globals.css`
  - `strictly utilizes realm tokens from @drts/ui-tokens without arbitrary hex palettes`
  - `configures viewport in layout.tsx to support responsive mobile scaling`

---

## 4. Test Commands Run at Candidate SHA

```bash
$ git diff --check
(exit 0, no output)

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> @drts/enterprise-dispatch-web@0.1.0 typecheck
> tsc --noEmit
(exit 0, no output)

$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-enterprise-form-001

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  15:09:46
   Duration  807ms (transform 454ms, setup 0ms, import 534ms, tests 21ms, environment 0ms)
(exit 0)
```

---

## 5. Verification Boundaries & Explicit Limitations

- **真機環境界線**: 本次驗收針對 Chromium 390×844 / 390px viewport CSS 規則與無溢出佈局進行嚴格單元與靜態審核；未在實體 iOS / Android 真機 App webview 執行 E2E 跑表。
- **後端 API 規則界線**: 本任務專注於前端表單輸入、推導校驗與 Review 頁面防護；後端派車引擎之資料庫最短提前時間校驗與改期規則由既有權威模組（`OwnedMobilityService`）及後續任務（`SR-BOOKING-VERIFY`）專職保障，未在此處篡改後端 API 合約。
- **無假資料與無造假保證**: 所有測試與資料結構沿用既有權威 API 模型與 `@drts/contracts`，不使用假簽章或靜態假成功繞過驗證。
