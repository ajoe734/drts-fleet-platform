# SR-ENTERPRISE-FORM-001 — 驗收證據

## 2026-09-08 18:46 UTC dispatch — history repair 與 scope 分別核對

- Fresh `origin/dev` base：`d4f54ef94e059a981bf2be1f7b944e815870e117`；起始 head：`56beeaa0b210a2ab831ce56c71edc3f595825e8f`。
- `ai-status.sh start SR-ENTERPRISE-FORM-001` exit 0。helper `SR-ENTERPRISE-FORM-001-UNBLOCK-HISTORY-REPAIR` 確實為 done，PR #1774 / merge `7d1272fc85a7f4d2a20f4ccd2d01716e873cca5e`；但 parent machine `write_scopes` 仍缺 `lib/enterprise-theme.ts`、`lib/translations.ts`，`depends_on` 仍為空。helper 結案不是這兩個共用檔的寫入授權。
- `git fetch origin` exit 0；`git rebase origin/dev` 初次 exit 1，原因為歷史 merge 造成同一修復多次重播。逐項核對前段已保留修復後 skip 重複 patch，最後 exit 0；`git merge --no-edit origin/codex2/sr-enterprise-form-001` exit 0，保留普通 push ancestry。`git diff --stat 56beeaa0 HEAD -- apps/enterprise-dispatch-web tests/unit/system-remediation/sr-enterprise-form-001` exit 0、無輸出，確認本輪未變更既有程式與測試內容。
- 驗證 head：`f61f3847755c9065a88ffc2835b2def101bda07e`。`pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/` exit 0（15 passed、3 browser skipped）；`pnpm --filter @drts/enterprise-dispatch-web typecheck` exit 0；`git diff --check` exit 0。
- `git cat-file -e origin/dev:apps/enterprise-dispatch-web/components/booking-form/enterprise-booking-validation.ts` exit 128，base 尚無此修復 helper，不能以 history repair 代替本表單合併證據。
- 未啟動 browser/live server、未做真機鍵盤或錯誤遮 CTA 驗證、無 booking/order 資源 ID；本輪不重用歷史 browser 成功當成本 SHA 的實測。未鎖定 review candidate；本節 anchor 的最終 SHA 與 push 結果由 machine blocker 記錄。
- **請 supervisor 修正 scope/dependency 後再 dispatch**：`enterprise-theme.ts:54` 仍為 `#2457D6`，權威 tenant realm 為 light `#0F766E` / dark `#5EEAD4`；應擴 theme scope 並建立共用 writer 相依或先行修復 task。歷史 `translations.ts` diff 是三個錯誤／最早預約時間 keys 的 en/zh 文案，也需要 scope 決定。本轮沒有越界修改、沒有 handoff；單純重新開啟 parent 或重跑 history repair 不會解除設計契約阻礙。

## 2026-09-08 18:07 UTC dispatch — scope blocker 再確認

- Fresh base origin/dev：`a44ea852eabe0c88e54d8124802eccf86ebc1dc6`；起始已發布 head：`093734506e591e6aac7f75a72163a31a3ed4db8f`。目前 base 尚無 booking-validation.ts，不將歷史修復誤認為已合併。
- git fetch origin exit 0；git rebase origin/dev 初次 exit 1（重複歷史 patch 衝突），abort exit 0 後重新比對；skip 三個已保留的重複修復，最終 rebase exit 0。git merge --no-edit origin/codex2/sr-enterprise-form-001 exit 0，保留普通 push 歷史；task 檔案與起始 head 無內容差異。
- 驗證 SHA：`d9ad700ce1b54009f34a9b191849c5c61339669c`。pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/ exit 0（15 passed、3 browser skipped）；pnpm --filter @drts/enterprise-dispatch-web typecheck exit 0；git diff --check exit 0。
- 本輪未啟動 browser server，未做 live API、真機軟鍵盤或建立資源 ID；歷史 browser 結果見下節，不冒充本 SHA 的 browser 成功證據。尚無鎖定 candidate，最終 evidence-only head 由 machine blocker 記錄。
- 阻礙仍存在：enterprise-theme.ts:54 自訂 accent #2457D6；realm tenant light/dark 為 #0F766E/#5EEAD4。machine write_scopes 仍未包含 lib/enterprise-theme.ts，且歷史 lib/translations.ts 變更仍需 scope 核對。依 dispatch 明示 guardrail，需 supervisor 擴 scope 並建立共用檔相依後才能寫；本輪未修改 UI、未 handoff。

## 2026-09-08 15:44 UTC Codex2 dispatch — 回歸完成，scope blocker 尚存

- 本輪 base：fresh `origin/dev` = `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`；起始 branch head `b97be8a00ff42bda340e40aa029e3b912b5203fd`。
- `gh pr view 1774 --json state,headRefOid,mergeCommit,url` exit 0：PR <https://github.com/ajoe734/drts-fleet-platform/pull/1774> 已合併，歷史 candidate `10ccb5f6522eb0d95d8d4f1349df2ef30d9b7b10`，merge `7d1272fc85a7f4d2a20f4ccd2d01716e873cca5e`。該 history repair 不代表本表單修復已進 dev；`git show origin/dev:apps/enterprise-dispatch-web/components/booking-form/enterprise-booking-validation.ts` 仍回報 path 不存在。
- `git fetch origin` exit 0；`git rebase origin/dev` 遇重複歷史 patch 的 add/add 衝突；確認修復已由前面的重播 commit 保留後，`git rebase --skip` exit 0，Git 同時略過兩個內容重複的 patch。`git merge --no-edit origin/codex2/sr-enterprise-form-001` exit 0，保留已發布歷史以容許普通 push，未 force push。
- 程式／測試驗證 SHA：`8f28e1add1ede9ab42fd3d818af9b08a7d69c9c2`。此文件後續 commit 僅補證據；最終發布 head 由 machine blocker 記錄，**未 handoff、未鎖定 review candidate**。
- 新增 `ReservationExpiryGate`：hydrate 前不開放送出，確認頁到期撤除送出元件、顯示既有警示；每秒／精確到期／視窗重新聚焦及 visibility change 重查。API command 邊界仍使用既有嚴格未來時間檢查，保護計時器暫停或事件競態。沿用 canvas 的按鈕、警示與版面，未新增色票。

實際指令與結果：

```text
pnpm --filter @drts/enterprise-dispatch-web exec next dev --webpack --hostname 127.0.0.1 --port 3317
Ready; isolated local server; 檢查後以 Ctrl-C 停止
ENTERPRISE_FORM_TEST_URL=http://127.0.0.1:3317 pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/
首次 exit 1：2 failed / 16 passed，測試錯用 reservationDate/onsiteContactPhone 等 URL keys
修正為既有 query contract 的 pm/date/time/contact/cc/ccLabel 後：exit 0；2 files / 18 tests passed
最後重跑 exit 0；2 files / 18 tests passed；Duration 7.39s
pnpm --filter @drts/enterprise-dispatch-web typecheck
exit 0；tsc --noEmit
pnpm --filter @drts/enterprise-dispatch-web exec eslint components/booking-form/reservation-expiry-gate.tsx app/bookings/review/page.tsx --max-warnings=0
exit 0
git diff --check
exit 0
git push origin codex2/sr-enterprise-form-001
exit 0：b97be8a00..9b62954f8；exit 0：9b62954f8..5bff0086d
```

Chromium headless 真正開啟兩個頁面：姓名改為 `Renamed Visitor` 後乘客／舉牌均顯示新名、聯絡電話保留；self 模式兩處均顯示 `Booker Name`；過去日期沒有 submit；以 browser clock 推進至到期後顯示 expired banner 且 submit 不存在。`390×844` 下 new/review 的 `documentElement.scrollWidth <= innerWidth` 斷言均通過。這是本地瀏覽器回歸，測試資料僅用於頁面查詢，沒有送出 API；未設定 `ENTERPRISE_FORM_TEST_URL` 時三項 browser tests 明確 skip，15 項純邏輯 tests 仍執行。

剩餘阻礙與資源界線：

- **需要 supervisor 擴 scope 並建立必要相依**：`apps/enterprise-dispatch-web/lib/enterprise-theme.ts` 仍使用 `accent = "#2457D6"` 及自訂色票，與指定 tenant realm tokens 不符，且不在 write_scopes。已讀 `packages/ui-tokens/src/realms.ts`、`ent-screens-1.jsx` New/Review，未以局部 CSS 蓋色規避規範。
- 歷史 task commit 已含 `lib/translations.ts` 變更（本次未新改該檔），也需 supervisor 核對 scope；沒有自行回退既有翻譯。Next dev 自動改動的 `next-env.d.ts` 已恢復。
- 未做真機軟鍵盤、API 錯誤與 CTA 遮擋、live backend、CI、merge 或 deploy 驗收；未建立 booking/order 資源，因此無 live 資源 ID。頁面 health proxy 曾回 503，不據此宣稱 backend 可用。
- 不將 fixture 金額／固定審批推估作為完成證據；最短提前時間 policy 仍由 SR-BOOKING-VERIFY 負責。本 task 尚未可 handoff 或結案。

## 2026-09-08 Codex2 dispatch — 最新進度（未 handoff）

- Owner / reviewer：Codex2 / Codex，以本次 machine task slice 為準；下方歷史紀錄不代表目前狀態。
- 本輪 `git fetch origin` exit 0；base `origin/dev` = `c4c4a35f88907df6bf68e781059dde397c06ba03`。
- `git rebase origin/dev` exit 0，保留三個既有 task 修復。rebase 後 dry-run push 被 non-fast-forward 拒絕，因此正常 merge 已發布的 `origin/codex2/sr-enterprise-form-001`（無內容差異，exit 0），保留遠端歷史，未 force push。
- `git show origin/dev:apps/enterprise-dispatch-web/app/bookings/review/page.tsx` 確認目前 base 第 234 行仍引用 `enterpriseDriver.placard`、第 316 行仍無條件 render `BookingSubmitButton`。base draft completeness 第 455–466 行仍僅檢查非空；因此前次修復尚未存在目前 dev，沒有回退其他任務修復。
- 新發現：review 的 server render gate 不會隨停留時間更新；原 command builder 對錯誤日期還會回退至 fixture／now。新增 `requireFutureReservationStart`，create/update 共用的 builder 在實際送出時重新嚴格解析與驗證 `+08:00` 日期；時間已到或不存在則拋出既有錯誤文案，由既有 submit catch 顯示錯誤，不呼叫 create/update API。
- 已發布 anchor SHA：`01ed8ba44`，branch `codex2/sr-enterprise-form-001`。`git push -u origin codex2/sr-enterprise-form-001` exit 0（`a02f14513..01ed8ba44`）。本節所在後續 commit 僅整理格式及證據；最終 progress SHA 由 machine status 記錄，沒有鎖定 review candidate。

實際檢查（本 isolated worktree）：

```text
pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/
exit 0; Test Files 1 passed; Tests 15 passed (新增停留至到期、無效 command 日期回歸)
pnpm --filter @drts/enterprise-dispatch-web typecheck
exit 0; tsc --noEmit
git diff --check
exit 0
pnpm exec prettier --check <本輪三個 TypeScript 檔案>
exit 1; validation helper / test formatting warnings
pnpm exec prettier --write apps/enterprise-dispatch-web/components/booking-form/enterprise-booking-validation.ts tests/unit/system-remediation/sr-enterprise-form-001/enterprise-booking-validation.test.ts
exit 0; formatting corrected
```

尚未達到 handoff 的界線：

- **需要 supervisor 擴 scope／加入共用設計相依**：`lib/enterprise-theme.ts` 不在 write_scopes，仍自行定義 raw palette（`accent = "#2457D6"`），沒有使用 `@drts/ui-tokens`。本次 UI contract 要求 tenant realm tokens；權威 `packages/ui-tokens/src/realms.ts` tenant fg 是 light `#0F766E` / dark `#5EEAD4`。已讀 `ent-screens-1.jsx` New/Review，保留 canvas layout，不在 globals.css 以硬蓋 palette 迴避 scope。需要由 supervisor 授權共用 theme 檔或提供先行修復 dependency。
- 確認頁到期後的按鈕尚未主動消失；本輪只補實際 command 阻擋。仍需在 `components/booking-form/` 內完成動態到期 gate 並接到 review。
- 390px 瀏覽器／鍵盤／錯誤與 CTA 量測仍未執行；既有 CSS 推導不等於瀏覽器驗收。未執行 live backend 或真機，沒有建立 booking/order 資源 ID，沒有送達、CI、merge、deploy 成功證據。
- 既有 fixture 金額／審批推估不作為本任務完成證據；前端不得自行新增最短提前分鐘數，後端 policy 仍由 SR-BOOKING-VERIFY 負責。

---

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
  `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` 的 15 分鐘 lead time 屬於另一個
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

## 6. Dispatch recovery verification（2026-09-08）

- **Base SHA**：`70355aba9`（fresh `origin/dev`）；重建來源為
  `origin/claude2/sr-enterprise-form-001` 的 `a3dbd1a96`（其前置修復
  `a54e2d19e`）。兩個既有修復已 clean cherry-pick 到本 task branch，沒有
  回退已存在的修復。
- **新增回歸**：日期／時間格式雖符合欄位形狀但不存在（`2026-02-30`）或超出
  時間範圍（`24:00`）時，JavaScript 不再將它自動正規化成未來的有效時間；兩者
  均不可進入可送出的確認狀態。
- **實際指令結果（此 worktree）**：

  ```text
  $ pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/
   Test Files  1 passed (1)
        Tests  13 passed (13)
  EXIT=0

  $ pnpm --filter @drts/enterprise-dispatch-web typecheck
  > tsc --noEmit
  EXIT=0

  $ git diff --check
  EXIT=0
  ```

- **資源／環境界線**：未建立或更新任何 live booking，因此沒有 booking resource
  ID；本 dispatch 仍未啟動產品 dev/browser/E2E server 或 Docker。390px 真機／
  瀏覽器量測仍是未完成的外部驗證，不將靜態 CSS 檢查描述為成功的實機測試。
