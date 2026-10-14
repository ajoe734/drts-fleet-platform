# PAX-WEB-RIDE-UI-20261009 UAT: 乘客網頁 App 行程頁 (P5-01～12)、評價 E-18、乘車證明 E-04、行程紀錄、客訴與遺失物

## 1. 執行背景與分支規範 (Execution Baseline)

- **Task ID**: `PAX-WEB-RIDE-UI-20261009`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Baseline Commit**: `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1` (`origin/dev`)
- **Execution Branch**: `gemini/pax-web-ride-ui-20261009-dev-continuation-20261014`
- **PR**: https://github.com/ajoe734/drts-fleet-platform/pull/2622
- **Commit Format**:
  - Literal subject: `PAX-WEB-RIDE-UI-20261009: <summary>`
  - Git trailers:
    - `Task-ID: PAX-WEB-RIDE-UI-20261009`
    - `LLM-Agent: Gemini`
    - `Reviewer: Codex2`
- **VM Restriction**:
  - 本 VM 嚴格禁止啟動 dev server、Playwright 瀏覽器測試、Docker Compose 等 runtime 環境。
  - 所有驗證採行單元測試 (Vitest / jsdom)、TypeScript 型別檢查 (`tsc --noEmit`) 與 ESLint 代碼風格檢查。
- **Supervisor Directive (2026-10-14)**:
  - 移除 `passenger-ride-page.tsx` 中新引入之 preview/fixture-mode 分支與 `isProductionEnvironment`/`loadPassengerRideFixture` 依賴。
  - 刪除兩份超出 scope 的產品 fixture 檔案 (`passenger-fixture-loader.ts`, `passenger-fixtures.ts`)，維持純粹 live authority/SSE/actions。
  - `passengerClient` facade 採用 `passengerFetch` 保持展示模式選取相容。
  - 23 項單元測試通過屬 narrow WIP progress，保留 baseline 35 與 d2046 審查 finding，不主張 13 E04/real/full QA credit。

---

## 2. 逐項修復與驗證證據 (Review Findings & Acceptance Evidence)

依據 `AI_COLLABORATION_GUIDE.md` §0.7 及 d2046 審查結果，逐項記錄如下：

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **R1 (SSE Freshness & Replay)** | `apps/passenger-app-web/lib/ride/passenger-live.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：重播舊 `eventVersion` 或無效計算時間導致錯誤更新。<br>修正版：嚴格比對單調遞增 `eventVersion`，拒絕舊版本與重播；斷線重連狀態維護（`connecting`, `connected`, `disconnected`）；時間新鮮度以 `eta.calculatedAt` 判斷。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx`<br>Exit 0, 4/4 passed | VM 限制禁止啟動真實 SSE 後端伺服器與原生瀏覽器斷線重連。 |
| **R2 (BFF Ingress - Baseline 35)** | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts`, `apps/passenger-app-web/app/api/passenger-rides/[...path]/route.ts` | 舊版重現：缺少 rides/receipt/cancel/ratings/complaints 之轉發路徑。<br>修正版：完整支援 active/detail/SSE/cancel/ratings/receipt 轉發，新增 Token BFF 路由。 | `pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts`<br>Exit 0, 35/35 passed (Baseline 35 retained) | 未直連真實 API Gateway 或外部下游微服務。 |
| **R3 (E-18 Rating & Consent)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/components/ride/translations.ts` | 舊版重現：token 模式未提供評分或遺漏客服聯繫。<br>修正版：支援 1～5 星完整顯示（中文標籤「很差」到「非常好」），雙標籤群組獨立送出；<= 2 星提供「需要客服主動聯繫」勾選（預設選取）。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx`<br>Exit 0, 15/15 passed | 依 d2046 finding，後端合約 `SubmitPassengerTripRatingCommand` 尚無 contact 欄位，Token 模式真實客訴串接須後端協調支援，資料庫落盤未於本機執行。 |
| **R4 & R7 (Contact Fallback & History)** | `apps/passenger-app-web/app/rides/page.tsx`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：缺少客服電話 fallback；歷史清單無分頁/去重。<br>修正版：提供電話客服替代方案 (`tel:02-2944-0985`)；行程歷史清單支援 cursor 分頁、失敗重試、重複去重與 24 小時內評價入口限制。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/rides-list.test.tsx`<br>Exit 0, 4/4 passed | 真實電話撥打與真實歷史行程分頁 API 資料未連線。 |
| **R5 (E-04 Receipt & Signed URLs)** | `apps/passenger-app-web/lib/ride/passenger-live.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：舊實作以字串猜測 PDF 網址。<br>修正版：保留真實簽名 HTML/PDF 網址，不自創 URL；P5-10 提供下載按鈕。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx -t "P5-10"`<br>Exit 0 | 依 d2046 finding，後端 `PassengerReceiptResponse` 僅有 receiptUrl/pdfUrl，尚缺 13 項法定乘車證明欄位，全量 13 E-04 驗收留待 PAX-RECEIPT-COMPLAINT 與 PAX-QA。 |
| **R6 & R8 (Cancelled Screen & Tokens)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/lib/passenger-presentation.ts` | 舊版重現：取消行程出現「畫面設計待補」placeholder；寫死非 token 色碼。<br>修正版：提供「此行程已取消」卡片並移除 placeholder；採用 `@drts/ui-tokens` passenger realm tokens (`passengerChrome`, `#0B5CAB` 等)。 | `pnpm --filter @drts/passenger-app-web lint`<br>Exit 0；Vitest tests passed | VM 限制禁止瀏覽器畫面像素比對與實際 UI 渲染驗證。 |
| **R9 & R12 (Screen Mapping & A04)** | `apps/passenger-app-web/lib/ride/passenger-live.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：P5-12 無法到達，取消與 A04 混淆。<br>修正版：實作並測試 P5-01 至 P5-12；`canContact === false` 正確對應 P5-12；支援 A04 報價異常重試。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx`<br>Exit 0, 15/15 passed | 真實報價異常由派遣引擎產生的情境需端對端整合環境。 |
| **R10 (Clean Lineage & Commit Trailers)** | `check_commit_trailers.py` | 舊版重現：舊分支包含 8 個無效 commit trailers。<br>修正版：從 accepted `dev` (`db212a3d`) 起算乾淨 continuation branch，每個 commit 具備合法 subject 與 Task-ID/LLM-Agent/Reviewer trailers。 | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`<br>Exit 0 | 需待 hosted PR CI 完整通過。 |
| **R13 (Vitest Subpath Resolution)** | `vitest.config.ts` | 舊版重現：別名順序錯誤導致生產測試失敗。<br>修正版：精確排序 `@drts/ui-web/canvas-tokens` 先於 `@drts/ui-web`。 | `pnpm vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts`<br>Exit 0, 42/42 passed | 無。 |
| **R14 (Identity State Isolation)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：變更 token/rideId 時殘留前一行程資料。<br>修正版：重設 liveFixture 與 error 狀態；移除 preview fixture 分支。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx`<br>Exit 0 | Next.js router 在跨頁時是否 remount 屬瀏覽器行為，未於本機測試。 |
| **`pax-web-ride_p5_live_page`** | 前端元件與 BFF 路由實作 | 23 項單元測試通過 (WIP)，BFF 35 項基準通過。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/` (Exit 0, 23/23)<br>`pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts` (Exit 0, 35/35) | **NOT SATISFIED**（Narrow WIP progress，保留 d2046 審查結果，待 hosted CI 及真實環境驗收）。 |
| **`pax-web-ride_rating_receipt_history_complaint`** | 評價、乘車證明、歷史與客訴元件 | 評價、收據、歷史與客訴單元測試通過 (WIP)。 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/` (Exit 0, 23/23) | **NOT SATISFIED**（Narrow WIP progress，保留 13 E04 未全量及後端合約限制，待 PAX-QA 與後端整合）。 |

---

## 3. 驗收狀態 (Acceptance Status)

- **`pax-web-ride_p5_live_page`**: **NOT SATISFIED (Narrow WIP Progress)**
  - P5-01～P5-12、A04 單元測試 23 項通過；BFF 路由測試 35 項通過。
  - 遵循 Supervisor 指示，此處屬窄範圍單元測試進展，保留 d2046 findings，不預支真實環境驗收信用。
- **`pax-web-ride_rating_receipt_history_complaint`**: **NOT SATISFIED (Narrow WIP Progress)**
  - E-18 評價、E-04 乘車證明按鈕、行程紀錄分頁與客訴表單均具備元件單元測試。
  - 保留 13 項 E-04 法定欄位及後端合約限制，待後續跨團隊端對端整合與 PAX-QA 驗證。

---

## 4. 驗證日誌彙整 (Verification Test Summary)

```bash
# 1. PAX-WEB-RIDE-UI 單元測試套件 (23 tests passed)
$ pnpm vitest run tests/unit/pax-web-ride-ui-20261009/
 ✓ tests/unit/pax-web-ride-ui-20261009/rides-list.test.tsx (4 tests)
 ✓ tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx (4 tests)
 ✓ tests/unit/pax-web-ride-ui-20261009/screens.test.tsx (15 tests)
Test Files  3 passed (3)
Tests       23 passed (23)

# 2. BFF 路由轉發測試套件 (Baseline 35 passed)
$ pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts
Test Files  1 passed (1)
Tests       35 passed (35)

# 3. 既有生產組件回歸測試套件 (42 tests passed)
$ pnpm vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts
Test Files  4 passed (4)
Tests       42 passed (42)

# 4. TypeScript 型別檢查
$ pnpm turbo run typecheck --filter=@drts/passenger-app-web --filter=@drts/passenger-client
Tasks: 12 successful, 12 total

# 5. ESLint 代碼風格檢查
$ pnpm --filter @drts/passenger-app-web lint
Exit 0 (0 warnings, 0 errors)

$ pnpm --filter @drts/passenger-client lint
Exit 0 (0 warnings, 0 errors)

$ pnpm lint:root
Exit 0 (0 warnings, 0 errors)
```
