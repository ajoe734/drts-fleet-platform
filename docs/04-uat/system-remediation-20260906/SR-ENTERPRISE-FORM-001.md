# SR-ENTERPRISE-FORM-001 — 驗收證據

| 欄位                                                                                | 內容                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------ |
| Owner                                                                               | Claude2                                    |
| Reviewer                                                                            | Claude                                     |
| Base SHA (origin/dev，重現用)                                                       | `69c519702047862212bc0e4890350e6b58917062` |
| Rebase 後 base SHA (origin/dev)                                                     | `650e233bb1c35269852c291ef892d25967380c12` |
| Candidate branch                                                                    | `claude2/sr-enterprise-form-001`           |
| 前一 candidate（reviewer 已標記缺陷，未合併，仍在 `gemini/sr-enterprise-form-001`） | `93d7f83a75331241e616a10fb3e84e6c0d7459ec` |
| 時間                                                                                | 2026-09-06T19:06:00Z                       |

## 1. 重現（base SHA = 69c51970）

在 base SHA 上直接檢視程式（未執行 live/真機，僅程式碼追溯 + 既有單元邏輯推導）：

- **R20（自訂/代訂舉牌不一致）**：`apps/enterprise-dispatch-web/app/bookings/review/page.tsx`
  第 234 行（base）直接輸出 `enterpriseDriver.placard`，其值是
  `apps/enterprise-dispatch-web/lib/enterprise-fixtures.ts:59` 寫死的
  `"Sato 様"`，與目前表單選擇的乘客（self/other/改名）完全無關。這與 reviewer
  在 candidate `93d7f83a7533` round 標記的「hardcodes」缺陷是同一顆——candidate
  沒有修掉這個寫死值，此輪確認 base/candidate 都尚未修復，非「已由其他任務修復」
  的情況，因此本輪實際修復而非補回歸證據。
- **R21（過去日期可進最後確認頁並可送出)**：
  `apps/enterprise-dispatch-web/lib/enterprise-booking-draft.ts` 的
  `isEnterpriseDraftComplete()`（base 版本）只檢查欄位非空，不檢查
  `reservationDate`/`reservationTime` 是否已過去；`review/page.tsx` 一律渲染
  `<BookingSubmitButton>`，該元件（`components/booking-submit-button.tsx`）
  的 `isDisabled = !isHydrated || isSubmitting`，hydrate 完成即可點擊送出，
  與稽核重現步驟「9/6 填 6/13 並等 hydration 完成；可進 review 且顯示送出按鈕」
  完全一致。
- **R22（390px 橫向溢出）**：`components/enterprise-booking-form.tsx`
  的表單主體使用 `gridTemplateColumns: "1.55fr 1fr"`（無 `minmax`/媒體查詢），
  子區塊（pickup/dropoff/日期時間、機場、政策）亦為固定 `1fr 1fr` 兩欄，
  窄螢幕下依賴 grid 隱含 `minmax(auto, 1fr)`，內容 min-content 撐開造成溢出。

## 2. 本輪修復（write_scopes 內）

只改動 write_scopes 內檔案，未動 `components/enterprise-booking-form.tsx`、
`components/booking-submit-button.tsx`、`components/enterprise-shell.tsx`、
`components/enterprise-app-frame.tsx`、`lib/enterprise-fixtures.ts`、
`lib/translations.ts`（皆非本任務 write_scopes，且為多任務共用檔）。

1. 新增 `apps/enterprise-dispatch-web/components/booking-form/enterprise-booking-validation.ts`
   （write_scopes 內 `components/booking-form/` 目錄，先前不存在，屬新增目標）：
   - `isReservationWindowInFuture(draft, now)`：以 `+08:00` 牆鐘時間解析
     `reservationDate`/`reservationTime`，嚴格要求 `> now`；格式不合法直接視為無效
     （不再回退到寫死的 `"2026-06-13"/"15:20"` fixture 日期）。
   - `getEarliestBookableLabel(locale, now)`：回傳目前時區下「最早可預約時間」
     的可讀說明（zh/en）。
   - `getEnterprisePassengerDisplayName(draft)`：self → `bookedBy`，other →
     `passenger`，單一來源，供舉牌與乘客卡片共用（修 R20）。
   - `isEnterpriseDraftComplete(draft, now)`：必填欄位 + 上述未來時間檢查。
     本檔案刻意不 import 任何 `@/...` alias，純函式、零外部相依，原因見下方「測試」。

2. `apps/enterprise-dispatch-web/lib/enterprise-booking-draft.ts`：
   - 改為從新模組 import 並 re-export 上述四個函式（單一事實來源，
     `isEnterpriseDraftComplete` 舊版就地實作已移除)。
   - `buildEnterpriseBookingCommand` 的 `passengerName` 改用
     `getEnterprisePassengerDisplayName(draft)`（原本兩處重複邏輯合一）。

3. `apps/enterprise-dispatch-web/app/bookings/review/page.tsx`：
   - 移除 `enterpriseDriver.placard` 寫死值，改用
     `displayDraftValue(getEnterprisePassengerDisplayName(draft))`；
     `EntParty` 的乘客名稱也改用同一來源（R20 修復，含 self/other/改名一致性）。
   - 新增 `isSubmittable = isEnterpriseDraftComplete(draft)`；當
     `false` 時不渲染 `<BookingSubmitButton>`，改顯示 `EBanner` 警示（缺欄位或
     過去時間/時區邊界兩種文案），並附上 `getEarliestBookableLabel` 的說明。
     有效資料仍完整渲染於 review 頁（滿足「有效資料保持到 review」）。
   - `new/page.tsx` 未變更判斷邏輯——`EnterpriseBookingForm` 的
     `canContinue = isEnterpriseDraftComplete(draft)`（該行本身在
     `components/enterprise-booking-form.tsx`，非本任務 write_scopes，但呼叫的
     函式已在 write_scopes 內更新），因此新表單頁「繼續」按鈕也會因為未來時間
     檢查而自動反映（R21 第一道防線，未修改該檔案本身）。

4. R22（390px，僅限本任務 write_scopes 範圍：新增/確認預約頁面）：
   - `app/bookings/review/page.tsx` 自有的兩個 inline grid 直接加上
     `className="ent-page-grid"` / `className="ent-2col-grid"`。
   - `app/bookings/new/page.tsx` 用 `<div className="ent-booking-form-shell">`
     包住 `<EnterpriseBookingForm>`（該元件本身的 grid 標記不在 write_scopes，
     無法直接加 class）。
   - `app/globals.css` 新增 `@media (max-width: 640px)` 區塊：
     - `.ent-page-grid` / `.ent-2col-grid` 收斂為單欄；
     - `.ent-booking-form-shell` 內以屬性選擇器
       `[style*="grid-template-columns"]` 收斂子元件內所有 inline grid 為單欄，
       並把 `[style*="position: sticky"]` 側欄 CTA 改為 `static`，避免窄螢幕下
       CTA 錯位或被鍵盤/錯誤訊息遮擋。
     - 這兩個 class 是本輪新增、只掛在 bookings/new 與 bookings/review 兩頁，
       不影響其他頁面（例如首頁 743px 溢出不在本任務 write_scopes 內，未修，
       見下方「未完成事項」）。

## 3. 測試（write_scopes 內：`tests/unit/system-remediation/sr-enterprise-form-001/`）

新增 `tests/unit/system-remediation/sr-enterprise-form-001/enterprise-booking-validation.test.ts`
（13 個測試，覆蓋 R20 與 R21 的邏輯）。

**為何測試直接 import 新模組而非 `lib/enterprise-booking-draft.ts`**：
repo 根目錄 `vitest.config.ts` 把 `"@"` alias 寫死指向
`apps/tenant-console-web`；`lib/enterprise-booking-draft.ts` 內部有
`import ... from "@/lib/enterprise-fixtures"`，該路徑在 `tenant-console-web`
下不存在，直接或以 `vi.mock` 方式 import 該檔案在 root vitest 執行時都會炸掉
（`Cannot find package '@/lib/enterprise-fixtures'`，已實測驗證兩種寫法皆失敗）。
因此把不依賴 fixtures/translations 的純邏輯抽到零 alias 的
`components/booking-form/enterprise-booking-validation.ts`，測試直接 import
這個檔案；production 呼叫端（`review/page.tsx`、`enterprise-booking-form.tsx`）
仍經由 `lib/enterprise-booking-draft.ts` 的 re-export 取得同一份實作，無邏輯
重複。

### 實際指令與結果（在本 worktree 執行，2026-09-06）

```
$ git diff --check
EXIT=0

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> tsc --noEmit
(no output, exit 0)

$ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  441ms
```

執行 typecheck 前，本 worktree 共用的 `node_modules`（跨 worktree 以 symlink
指向 canonical root）原本缺少 `packages/contracts` 的 `zod` 依賴解析
（`tsc` 報 `Cannot find module 'zod'`），與本任務程式碼無關（未觸及
`packages/contracts`）。已執行 `CI=true pnpm install --frozen-lockfile`
修復（僅重新安裝以符合現有 `pnpm-lock.yaml`，未變更 lockfile／
`package.json`，`git status` 確認兩者皆無 diff）。因為 `node_modules` 是
跨 worktree 共用的 symlink，這個 reinstall 影響範圍是整個機器上的所有
worktree，記錄於此供其他並行任務參考；並非本任務程式碼變更。

### 測試涵蓋重點

- R21：過去日期（含稽核重現的 `2026-06-13`/`2026-09-06` 情境）判定為不可送出；
  未來日期判定可送出；`+08:00` 邊界（同日 09:59 vs 10:01，now=10:00）正確；
  格式不合法（空字串/非日期）不會回退成任何 fixture 日期，直接視為無效；
  `isEnterpriseDraftComplete` 同時驗證「必填齊全但時間過去」與「時間合法但缺欄位」
  兩種情境都會被擋下。
- R20：self 模式一律用 `bookedBy`；other 模式用 `passenger`；由 other 切到
  self 會立刻改用 `bookedBy`（即稽核重現「預選 other/Sato 改自己」情境的
  回歸測試）；改名（`bookedBy`/`passenger` 更新）立即反映；空白輸入正確
  trim 為空字串而非殘留舊值。

## 4. 未完成 / 未驗證事項（誠實列出，不冒充完成）

- **未做 live/真機瀏覽器驗證**：本輪未能以 Chromium 390×844 實際開啟
  `/bookings/new`、`/bookings/review` 量測 `scrollWidth`／視覺回歸。原因：
  本機 `enterprise-dispatch-web` dev server 埠 3010 已被另一個並行 worker/
  session 佔用（`ss -ltnp` 顯示 `127.0.0.1:3010` 已在監聽中），本任務
  `serial_resources: ["enterprise-form"]` 提示這是共用資源，故未搶佔或關閉
  該行程，改以程式碼／CSS 靜態推導確認修復方向，但**未有實機截圖或
  scrollWidth 量測數據**。建議 reviewer 或後續 owner 在埠可用時，用
  `playwright.enterprise-dispatch.config.ts` 或手動啟動 dev server，於
  390×844 viewport 檢查 `/bookings/new`、`/bookings/review` 是否仍有橫向
  捲動，並確認過去時間送出後的警示 banner 實際渲染正確。
- **首頁 743px 溢出（R22 的一部分）未修**：稽核原文同時提到「首頁寬 743px」，
  該版面由 `components/enterprise-app-frame.tsx` / `enterprise-shell.tsx`
  控制，兩者皆不在本任務 `write_scopes` 內（涉及全站共用 shell，非
  booking 表單專屬），本輪僅修復 `write_scopes` 內的
  `/bookings/new`、`/bookings/review` 兩頁面的表單溢出。首頁溢出如需修復，
  需要 supervisor 擴大 scope 或另立 task。
- **後端最短提前時間規則未變更**：本任務僅在前端加入「不得為過去時間」的
  嚴格檢查（`> now`），未新增固定提前分鐘數門檻（例如
  `apps/api/.../owned-mobility.service.ts` 的 15 分鐘 lead time 屬於另一個
  完全不同的產品域——一般叫車即時派車，非企業 A→B 預約），亦未觸碰任何後端
  驗證邏輯；若需要更嚴格的「最短提前 N 分鐘」規則，依 task brief 說明由
  `SR-BOOKING-VERIFY` 處理。
- **`components/enterprise-booking-form.tsx` / `components/booking-submit-button.tsx`
  未直接修改**：這兩個檔案不在本任務 `write_scopes`
  （write_scopes 只列出 `components/booking-form/`，不含既有的
  `components/enterprise-booking-form.tsx`、`components/booking-submit-button.tsx`）。
  R21 的「新表單頁繼續按鈕」防線是透過這兩個檔案已經呼叫的
  `isEnterpriseDraftComplete()`（本輪已更新）間接生效，未直接修改檔案本身；
  390px 收斂也是靠 `globals.css` 的屬性選擇器覆寫其 inline grid，而非直接
  編輯該元件的 JSX。這個既有 write_scopes 與實際 repo 檔案佈局的落差
  （`components/booking-form/` 目錄先前不存在）已在 runbook 中被提示為
  「supervisor 更新 reviewed scope」的情況，本輪選擇在既有 scope 內以
  lib 層級間接修復，未擅自擴大 write_scopes。

## 5. 資源 ID / 影響範圍

- 本任務未呼叫任何真實後端 API（無建立/更新真實 booking 資源 ID）；
  所有驗證皆為前端邏輯單元測試 + 型別檢查 + 靜態程式碼追溯。
- 受影響檔案：見「本輪修復」章節列表，皆在 write_scopes 內
  （新增 `components/booking-form/enterprise-booking-validation.ts` 屬於
  write_scopes 內先前不存在的新增目標）。
