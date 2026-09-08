# SR-ENTERPRISE-FORM-001 — 企業預約乘客、日期與手機表單修復：完成證據

- Task: `SR-ENTERPRISE-FORM-001`
- Owner: `Gemini`
- Reviewer: `Codex`
- Base SHA (`origin/dev`): `890548b4f357542968c8b14f33f23e0685be007a`
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001`
- Branch: `gemini/sr-enterprise-form-001`

---

## 1. 問題根因盤點（Fix 前與 Codex 審查回饋）

本次修復針對 2026-09-06 UAT 觀察與系統修復任務清單中指出的三大核心缺口（R20、R21、R22）與四項能力來源（C015、C016、C019、C120），並完整解決 Codex 於前次 candidate（`eddba0fd7`）審查提出的 2 項 P1 與 1 項 P2 意見：

1. **R20 / C015: 自訂情境與乘客資料未一致帶入、舉牌硬編碼與 Command 遺失（P1）**
   - 過去新增預約表單 `createEnterpriseBookingDraft` 預設直接寫死 `passengerMode: "other"` 與 `guestSato`（Sato Kenji），導致使用者選擇「為自己預約」進入時，表單仍預選他人外賓。
   - `parseEnterpriseBookingDraft` 僅辨識特定單一參數 `pm`，未支援 `entry=self`、`entry=airport`、`mode=self` 等首頁與導航入口情境。
   - 在 Review 確認頁（`app/bookings/review/page.tsx`）中，現場舉牌文字過去被硬編碼為 `{enterpriseDriver.placard}`（"Sato 様"），即使在表單中修改乘客為自己（林宜君）或其他同事（陳思妤），進到 Review 仍一律顯示 "Sato 様"，引發嚴重接機舉牌資訊混淆。
   - **Codex P1 審查意見**：前次 candidate 在 `buildEnterpriseBookingCommand` 未使用 `draft.placard`，使用者自訂的舉牌（如「自訂 VIP 田中董事長」）在 Review 顯示但產生 command 時完全遺失。

2. **R21 / C016: 過去日期與未達最短提前時間、Click 重驗與向上取整（P1 / P2）**
   - 原前端表單對用車日期與時間缺乏合法性驗證，填入過去日期或過小提前時間仍能進入 Review 頁。
   - **Codex P1 審查意見**：Review 頁過去僅在 SSR Render 時計算 `canSubmit`，送出按鈕在點擊當下未重新驗證當前即時時間；`buildEnterpriseBookingCommand` 亦未主動拒絕失效或已過期時間，若使用者停留 Review 頁至時間失效後送出，仍會產生失效時間之 command。
   - **Codex P2 審查意見**：`validateReservationWindow` 計算最早允許時間時過去僅截斷秒數（如 `now=2026-09-06T06:12:30Z` 截斷提示台北 `14:27`），使用者依提示填入 `14:27` 卻因實際秒數差距得到 `isTooSoon: true` 的誤判。

3. **R22 / C019 / C120: 行動版 390px 橫向溢出與鍵盤／錯誤遮擋 CTA**
   - 表單與確認頁過去在行內樣式硬編碼雙欄網格；在 390px viewport 下產生橫向捲動與文字擠壓。
   - `layout.tsx` 未聲明 `viewport` metadata，導致行動瀏覽器以桌面縮放尺寸渲染。
   - 右側或底部 CTA 面板使用 `position: "sticky"`，在行動裝置虛擬鍵盤開啟或錯誤提示展開時遮擋輸入欄位與主要按鈕。

---

## 2. 核心修復說明

### 2.1 乘客模式、自訂／代訂／機場入口與舉牌動態同步與 Command 整合（`lib/enterprise-booking-draft.ts` & `components/booking-form/` & `app/bookings/review/`）
- `lib/enterprise-booking-draft.ts`:
  - `EnterpriseBookingDraftForm` 擴充 `placard?: string` 欄位與對應 `QUERY_KEYS.placard = "placard"`。
  - 新增 `formatDefaultPlacard(passenger)` 智能敬稱格式化函式：當姓名已有「様／先生／女士／小姐」時不重複附加，其餘自動格式化為 `${name} 様`。
  - 新增 `isCustomPlacard(draft)` 與 `formatBookingNotesWithPlacard(notes, placard)`：當使用者明確自訂舉牌（`draft.placard` 異於預設敬稱）時，`buildEnterpriseBookingCommand` 自動將舉牌需求完整合併至 `command.notes`（格式如 `原備註 · 需舉牌「自訂舉牌文字」`），嚴格確保「自訂 VIP 田中董事長」等重要資訊持久送達後端派車指令。
  - `createEnterpriseBookingDraft` 支援 `options?: { mode, entry }`：
    - `entry: "self"` 或 `mode: "self"`：預設 `passengerMode: "self"`，乘客與舉牌自動同步為登入使用者（`林宜君`、`林宜君 様`）。
    - `entry: "delegate"` 或 `mode: "other"`：預設代訂模式與外賓資料。
    - `entry: "airport"`：預設入境接機（`pickup`）、航班號（`JL809`）、航廈（`T1`）與行李件數。
  - `parseEnterpriseBookingDraft` 支援 `entry`、`mode`、`pm`、`placard` 雙向 URL 序列化保存。
- `components/booking-form/enterprise-booking-form.tsx`:
  - 提供明確的 Segmented Control 切換「為自己預約」與「為他人代訂」。
  - 為他人代訂時提供快速代訂員工／外賓 Chip，點選即同步更新乘客姓名與預設舉牌。
  - 新增專屬「舉牌姓名 placard」欄位，使用者可即時檢視自動同步的舉牌文字，亦可自由編輯自訂舉牌，且編輯後不被自動覆蓋。
- `app/bookings/review/page.tsx` & `app/bookings/review/booking-submit-button.tsx`:
  - 徹底移除硬編碼之 `{enterpriseDriver.placard}`，改由 `draft.placard` 或 `formatDefaultPlacard(effectivePassenger)` 動態呈現。
  - 新建 review 專屬客戶端送出元件 `booking-submit-button.tsx`，於點擊送出當下（click event）強制重新執行 `validateReservationWindow` 驗證即時客戶端時間。若時間已過期或未達最短提前時間，立即中斷送出並於畫面上呈現清晰之過期錯誤提示，防範過期訂單進入後端。

### 2.2 過去時間／時區邊界檢核與最短提前時間（15分鐘）權威規則
- `lib/enterprise-booking-draft.ts`:
  - 匯入並落實既有權威值 `MIN_LEAD_TIME_MINUTES = 15`。
  - 實作 `validateReservationWindow(dateStr, timeStr, now, locale)`：
    - 嚴格綁定 `+08:00`（Asia/Taipei）時區計算。
    - 最早可預約時間（`earliestAllowedMs`）採 `Math.ceil(... / 60000) * 60000` 向上取整至下一分鐘，確保使用者輸入提示文字時間時絕不因秒數誤差產生 `isTooSoon` 誤判。
    - 若輸入過去時間：回傳 `isPast: true, isValid: false`。
    - 若小於 15 分鐘前置時間：回傳 `isTooSoon: true, isValid: false`。
  - `buildEnterpriseBookingCommand` 預設啟用 `shouldValidateTime: true`，在預約時間無效或已過期時主動拋出例外，堅決拒絕生成過期 command。
  - `isEnterpriseDraftComplete` 整合 `validateReservationWindow`：若用車時間無效，驗證回傳 `false`。

### 2.3 390px 響應式排版、Viewport Metadata 與鍵盤／錯誤防遮擋（`app/globals.css` & `app/layout.tsx`）
- `app/layout.tsx`:
  - 導出標準 `export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };`。
- `app/globals.css`:
  - 設定 `html, body { max-width: 100%; overflow-x: hidden; }`。
  - 定義響應式網格與彈性排版類別：`.ent-form-layout`、`.ent-review-layout`、`.ent-fields-two-cols`、`.ent-sticky-aside`。
  - 在 `@media (max-width: 768px)` 下：
    - 表單與確認頁雙欄網格自動收斂為單欄彈性排版（`flex-direction: column`），最大寬度受限 `100%`，消除橫向捲軸。
    - `.ent-sticky-aside` 在行動端解除 sticky 固定（改為 `position: static !important`），置於頁面自然流中，確保虛擬鍵盤彈出或錯誤橫幅展開時，完全不遮擋輸入欄位與 CTA 按鈕。
    - 設定 `word-break: break-word` 與 `overflow-wrap: anywhere`，確保長文字不撐開視窗。

### 2.4 UI Design Contract 與 Realm Token 遵循
- 所有元件與色彩樣式嚴格沿用 `packages/ui-tokens` 規範之 Tenant Realm Tokens（`--realm-tenant-fg: #0F766E`、`--realm-tenant-bg: #F0FDFA`、`--realm-tenant-border: #99F6E4`）與 `lib/enterprise-theme.ts`，不引入任何未定義之任意 hex 色彩。
- 遵循設計畫布（`docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` 及 `ent-screens-1.jsx`）之元件佈局與階層結構。

---

## 3. Write Scopes 遵循檢查

本任務嚴格僅限於指定的 8 處 write scope 範圍：
1. `apps/enterprise-dispatch-web/app/bookings/new/page.tsx`
2. `apps/enterprise-dispatch-web/lib/enterprise-booking-draft.ts`
3. `apps/enterprise-dispatch-web/components/booking-form/`（包含 `index.ts` 與 `enterprise-booking-form.tsx`）
4. `tests/unit/system-remediation/sr-enterprise-form-001/sr-enterprise-form-001.test.ts`
5. `docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-FORM-001.md`
6. `apps/enterprise-dispatch-web/app/bookings/review/`（包含 `page.tsx` 與 `booking-submit-button.tsx`）
7. `apps/enterprise-dispatch-web/app/globals.css`
8. `apps/enterprise-dispatch-web/app/layout.tsx`

無任何越界寫入或修改共用套件檔案。

---

## 4. 驗證指令與執行日誌（附 Exit Code）

### 4.1 Git Diff 格式檢查與 Trailing Whitespace 守衛
```text
$ git diff --check
exit code: 0
```

### 4.2 套件 Typecheck 靜態型別檢查
```text
$ pnpm --filter @drts/enterprise-dispatch-web typecheck

> @drts/enterprise-dispatch-web@0.1.0 typecheck /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web
> tsc --noEmit

exit code: 0
```

### 4.3 本次專屬迴歸單元測試（20/20 全部通過）
```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/

 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  17:05:12
   Duration  333ms (transform 118ms, setup 0ms, import 145ms, tests 30ms, environment 0ms)

exit code: 0
```

### 4.4 企業派遣 Web 套件全單元測試（24/24 全部通過，零破壞）
```text
$ pnpm --filter @drts/enterprise-dispatch-web test

> @drts/enterprise-dispatch-web@0.1.0 test /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web
> vitest run --config vitest.config.ts

 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web

 Test Files  8 passed (8)
      Tests  24 passed (24)
   Start at  17:05:07
   Duration  658ms (transform 1.01s, setup 0ms, import 1.56s, tests 219ms, environment 2ms)

exit code: 0
```

### 4.5 企業派遣 Web 應用編譯驗證（Next.js Production Build）
```text
$ pnpm --filter @drts/enterprise-dispatch-web build

> @drts/enterprise-dispatch-web@0.1.0 build /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001/apps/enterprise-dispatch-web
> next build --webpack

▲ Next.js 16.2.3 (webpack)

  Creating an optimized production build ...
✓ Compiled successfully in 13.4s
  Finished TypeScript in 7.1s
  Collecting page data using 7 workers in 828ms
✓ Generating static pages using 7 workers (26/26) in 366ms
  Collecting build traces in 591ms
  Finalizing page optimization in 676ms

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /approval-pending
├ ƒ /approval-rejected
├ ƒ /auth-required
├ ƒ /bookings
├ ƒ /bookings/[bookingId]
├ ƒ /bookings/new
├ ƒ /bookings/review
├ ƒ /bookings/submitted
...

exit code: 0
```

### 4.6 i18n 守衛檢查（全庫 523 檔案掃描零違規）
```text
$ pnpm run i18n:guard

> drts-fleet-platform@0.1.0 i18n:guard /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-enterprise-form-001
> node tools/ci/i18n-guard.mjs

i18n-guard: OK (523 files scanned across 10 apps, 55 exemption(s) from i18n-guard-baseline.json)

exit code: 0
```

### 4.7 UI Realm Token 守衛檢查
```text
$ python3 tools/ci/check_ui_realm_tokens.py
ui-realm-token guard: OK (2 canonical hexes; no off-token brand colors)

exit code: 0
```

---

## 5. 驗證界限與未施作部分說明

- **已完成驗證範圍**：
  - 自訂（self）、代訂（other）、機場（airport）各入口模式的預設資料建立與欄位一致性。
  - 乘客姓名修改與舉牌同步連動、使用者自訂客製舉牌跨頁往返序列化之持久性。
  - 自訂舉牌（如「自訂 VIP 田中董事長」）在 `buildEnterpriseBookingCommand` 中正確持久合併至 `command.notes`，解決前次 review P1 指出的 command 遺失缺陷。
  - 過去日期／時區跨日邊界／最短提前時間（15分鐘）前端拒絕邏輯。最早可約時間向上取整至下一分鐘，消除秒數誤差造成的 `isTooSoon` 誤判。
  - `buildEnterpriseBookingCommand` 主動拒絕失效/過期時間；Review 頁面送出按鈕在點擊當下即時重新執行時間驗證，徹底防禦過期訂單送出。
  - 390px 行動版窄螢幕單欄收斂排版規則與解除 sticky 防遮擋機制。
  - 型別安全（TypeScript `strict` + `exactOptionalPropertyTypes`）、i18n 規範與全套件單元測試迴歸。
- **未施作／需真實環境之項目**：
  - 本次任務限定於前端表單與確認頁面（`apps/enterprise-dispatch-web`），真實 PostgreSQL 資料庫持久化與後端下單 API 接受／拒絕由後續排程驗證與 E2E 驗收任務執行。
