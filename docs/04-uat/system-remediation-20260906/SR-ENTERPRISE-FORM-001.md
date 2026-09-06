# SR-ENTERPRISE-FORM-001 — 企業預約乘客、日期與手機表單修復：完成證據

- Task: `SR-ENTERPRISE-FORM-001`
- Owner: `Gemini`
- Reviewer: `Gemini2`
- Base SHA (`origin/dev`): `40ba315e4114369eaa7e12d35aae83a795c97b1d`
- Worktree: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001`
- Branch: `gemini/sr-enterprise-form-001`

---

## 1. 問題根因盤點（Fix 前）

本次修復針對 2026-09-06 UAT 觀察與系統修復任務清單中指出的三大核心缺口（R20、R21、R22）與四項能力來源（C015、C016、C019、C120）：

1. **R20 / C015: 自訂情境與乘客資料未一致帶入、舉牌硬編碼**
   - 過去新增預約表單 `createEnterpriseBookingDraft` 預設直接寫死 `passengerMode: "other"` 與 `guestSato`（Sato Kenji），導致使用者選擇「為自己預約」進入時，表單仍預選他人外賓。
   - `parseEnterpriseBookingDraft` 僅辨識特定單一參數 `pm`，未支援 `entry=self`、`entry=airport`、`mode=self` 等首頁與導航入口情境。
   - 在 Review 確認頁（`app/bookings/review/page.tsx`）中，現場舉牌文字被硬編碼為 `{enterpriseDriver.placard}`（"Sato 様"），即使在表單中修改乘客為自己（林宜君）或其他同事（陳思妤），進到 Review 仍一律顯示 "Sato 様"，引發嚴重接機舉牌資訊混淆。
   - 表單缺乏讓使用者明確檢視與自行微調舉牌文字的專屬欄位。

2. **R21 / C016: 過去日期與未達最短提前時間可進入最後確認頁**
   - 原前端表單對用車日期與時間完全缺乏時間合法性驗證，在 9/6 填入 6/13 等過去日期仍能成功點擊「繼續確認」進入 Review 頁，且 Review 頁照常顯示送出按鈕。
   - 雖然 Multi-taxi 後端已有 `TOO_SOON_TO_BOOK` 檢核，但前端未於表單輸入與 Review 階段攔截，且未依據權威規則計算並告知使用者「最早可約時間」（需至少提前 15 分鐘）。
   - 本地時間計算未統一綁定 `Asia/Taipei`（UTC+8），在 UTC 邊界時可能引發跨日跨時區誤判。

3. **R22 / C019 / C120: 行動版 390px 橫向溢出與鍵盤／錯誤遮擋 CTA**
   - 表單（`ent-form-layout`）與確認頁（`ent-review-layout`）過去在行內樣式硬編碼 `gridTemplateColumns: "1.55fr 1fr"` 與 `gridTemplateColumns: "1fr 1fr"`，未作斷點適配；在 390px viewport 下產生 694px 表單寬度與 743px 文件寬度，造成橫向捲動與文字擠壓。
   - `layout.tsx` 未聲明 `viewport` metadata，導致行動瀏覽器以桌面縮放尺寸渲染。
   - 右側或底部 CTA 面板使用 `position: "sticky"`，在行動裝置虛擬鍵盤開啟或錯誤提示展開時容易遮擋輸入欄位與主要按鈕。

---

## 2. 核心修復說明

### 2.1 乘客模式、自訂／代訂／機場入口與舉牌動態同步（`lib/enterprise-booking-draft.ts` & `components/booking-form/` & `app/bookings/review/page.tsx`）
- `lib/enterprise-booking-draft.ts`:
  - `EnterpriseBookingDraftForm` 擴充 `placard?: string` 欄位與對應 `QUERY_KEYS.placard = "placard"`。
  - 新增 `formatDefaultPlacard(passenger)` 智能敬稱格式化函式：當姓名已有「様／先生／女士／小姐」時不重複附加，其餘自動格式化為 `${name} 様`。
  - `createEnterpriseBookingDraft` 支援 `options?: { mode, entry }`：
    - `entry: "self"` 或 `mode: "self"`：預設 `passengerMode: "self"`，乘客與舉牌自動同步為登入使用者（`林宜君`、`林宜君 様`）。
    - `entry: "delegate"` 或 `mode: "other"`：預設代訂模式與外賓資料。
    - `entry: "airport"`：預設入境接機（`pickup`）、航班號（`JL809`）、航廈（`T1`）與行李件數。
  - `parseEnterpriseBookingDraft` 支援 `entry`、`mode`、`pm` 等入口參數解析，且自訂舉牌可在表單與 Review 頁間雙向 URL 序列化保存。
  - `buildEnterpriseBookingCommand` 嚴格確保 self mode 下 `passenger.name`、`onsiteContact.name` 與 `bookedBy.name` 一致，並將舉牌備註與使用者輸入備註完整整合。
- `components/booking-form/enterprise-booking-form.tsx`:
  - 提供明確的 Segmented Control 切換「為自己預約」與「為他人代訂」。
  - 為自己預約時標示「本人用車」，乘客姓名直接帶入下單人。
  - 為他人代訂時提供搜尋輸入框與快速代訂員工／外賓 Chip，點選即同步更新乘客姓名與預設舉牌。
  - 新增專屬「舉牌姓名 placard」欄位，使用者可即時檢視自動同步的舉牌文字，亦可自由編輯自訂舉牌（如自訂尊稱或訪客代表），且編輯後不被自動覆蓋。
- `app/bookings/review/page.tsx`:
  - 徹底移除硬編碼之 `{enterpriseDriver.placard}`。
  - 舉牌資訊卡改由 `draft.placard` 或 `formatDefaultPlacard(effectivePassenger)` 動態呈現，確保乘客姓名、現場聯絡電話與舉牌文字三者在 Review 頁完全一致。

### 2.2 過去時間／時區邊界檢核與最短提前時間（15分鐘）權威規則（`lib/enterprise-booking-draft.ts` & `components/booking-form/` & `app/bookings/review/page.tsx`）
- `lib/enterprise-booking-draft.ts`:
  - 匯入並落實既有權威值 `MIN_LEAD_TIME_MINUTES = 15`。
  - 實作 `validateReservationWindow(dateStr, timeStr, now, locale)`：
    - 嚴格綁定 `+08:00`（Asia/Taipei）時區計算。
    - 若輸入過去時間：回傳 `isPast: true, isValid: false`，並明確指出「預約時間不能為過去時間。最早可預約時間為 YYYY-MM-DD HH:mm（需至少提前 15 分鐘）」。
    - 若小於 15 分鐘前置時間：回傳 `isTooSoon: true, isValid: false`，指出「預約需至少提前 15 分鐘。最早可預約時間為 YYYY-MM-DD HH:mm」。
  - `isEnterpriseDraftComplete` 整合 `validateReservationWindow`：若用車時間無效，驗證回傳 `false`。
- `components/booking-form/enterprise-booking-form.tsx`:
  - 即時顯示錯誤橫幅（`EBanner tone="danger"`），日期與時間輸入框標記 `invalid` 紅框樣式。
  - 當時間無效時，「繼續確認」CTA 按鈕強制 disabled（`aria-disabled="true"` 並攔截 click 事件），防止進入確認頁。
- `app/bookings/review/page.tsx`:
  - 若使用者透過直接帶參數 URL 嘗試存取過期或違規預約時間，頂部立即渲染紅色告警橫幅，明確告知預約時間已過期與最早可約時間。
  - 送出按鈕強制停用（呈現「無法送出（時間無效）」），且提供「返回修改」按鈕完整保留草稿資料引導使用者修正。

### 2.3 390px 響應式排版、Viewport Metadata 與鍵盤／錯誤防遮擋（`app/globals.css` & `app/layout.tsx` & `components/booking-form/` & `app/bookings/review/page.tsx`）
- `app/layout.tsx`:
  - 導出標準 `export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };`。
- `app/globals.css`:
  - 設定 `html, body { max-width: 100%; overflow-x: hidden; }`。
  - 定義響應式網格與彈性排版類別：`.ent-form-layout`、`.ent-review-layout`、`.ent-fields-two-cols`、`.ent-sticky-aside`。
  - 在 `@media (max-width: 768px)` 下：
    - 表單與確認頁雙欄網格自動收斂為單欄彈性排版（`flex-direction: column`），最大寬度受限 `100%`，徹底消除橫向捲軸。
    - 內部兩欄輸入欄位收斂為單欄。
    - `.ent-sticky-aside` 在行動端解除 sticky 固定（改為 `position: static !important`），置於頁面自然流中，確保虛擬鍵盤彈出或錯誤橫幅展開時，完全不遮擋輸入欄位與 CTA 按鈕。
    - `main`、`header` 與 `footer` 內距適度收斂，防止 390px 螢幕下的邊界擠壓與溢出。
    - 設定 `word-break: break-word` 與 `overflow-wrap: anywhere`，確保超長外賓姓名、備註與錯誤文字不撐開視窗。

### 2.4 UI Design Contract 與 Realm Token 遵循
- 所有元件與色彩樣式嚴格沿用 `packages/ui-tokens` 規範之 Tenant Realm Tokens（`--realm-tenant-fg: #0F766E`、`--realm-tenant-bg: #F0FDFA`、`--realm-tenant-border: #99F6E4`）與 `lib/enterprise-theme.ts`（`t.primary`、`t.line`、`t.surface` 等），不引入任何未定義之任意 hex 色彩。
- 遵循設計畫布（`docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` 及 `ent-screens-1.jsx`）之元件佈局與階層結構。

---

## 3. Write Scopes 遵循檢查

本任務嚴格僅限於指定的 8 處 write scope 範圍：
1. `apps/enterprise-dispatch-web/app/bookings/new/page.tsx`
2. `apps/enterprise-dispatch-web/lib/enterprise-booking-draft.ts`
3. `apps/enterprise-dispatch-web/components/booking-form/`（新增 `index.ts` 與 `enterprise-booking-form.tsx`）
4. `tests/unit/system-remediation/sr-enterprise-form-001/sr-enterprise-form-001.test.ts`
5. `docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-FORM-001.md`
6. `apps/enterprise-dispatch-web/app/bookings/review/page.tsx`
7. `apps/enterprise-dispatch-web/app/globals.css`
8. `apps/enterprise-dispatch-web/app/layout.tsx`

無任何越界寫入或修改共用套件檔案。

---

## 4. 驗證指令與執行日誌（附 Exit Code）

### 4.1 Git Diff 格式檢查
```text
$ git diff --check
exit code: 0
```

### 4.2 套件 Typecheck 靜態型別檢查
```text
$ pnpm --filter @drts/enterprise-dispatch-web typecheck

> @drts/enterprise-dispatch-web@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web
> tsc --noEmit

exit code: 0
```

### 4.3 本次專屬迴歸單元測試（15/15 通過）
```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001

 ✓ tests/unit/system-remediation/sr-enterprise-form-001/sr-enterprise-form-001.test.ts (15 tests) 46ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  14:28:08
   Duration  767ms
exit code: 0
```

### 4.4 企業派遣 Web 套件全單元測試（24/24 通過，零破壞）
```text
$ pnpm --filter @drts/enterprise-dispatch-web test

> @drts/enterprise-dispatch-web@0.1.0 test /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web
> vitest run --config vitest.config.ts

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web

 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  14:28:24
   Duration  831ms
exit code: 0
```

---

## 5. 驗證界限與未施作部分說明

- **已完成驗證範圍**：
  - 自訂（self）、代訂（other）、機場（airport）各入口模式的預設資料建立與欄位一致性。
  - 乘客姓名修改與舉牌同步連動、使用者自訂客製舉牌跨頁往返序列化之持久性。
  - 過去日期／時區跨日邊界／最短提前時間（15分鐘）前端拒絕邏輯、錯誤訊息提示、CTA 停用與 Review 頁防送出機制。
  - 390px 行動版窄螢幕單欄收斂排版規則與解除 sticky 防遮擋機制。
  - 型別安全（TypeScript `strict` + `exactOptionalPropertyTypes`）與全單元測試套件迴歸。
- **未施作／需真實環境之項目**：
  - 本次任務限定於前端表單與確認頁面（`apps/enterprise-dispatch-web`），真實 PostgreSQL 資料庫持久化與後端下單 API 接受／拒絕由後續排程驗證與 E2E 驗收任務執行。
  - 真實手機實體硬體與原生軟鍵盤彈出互動（已在 Chromium 390×844 CSS 斷點規範與單元測試中完成結構性約束）。
