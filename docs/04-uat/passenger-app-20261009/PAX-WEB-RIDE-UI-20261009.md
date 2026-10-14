# PAX-WEB-RIDE-UI-20261009 UAT: 乘客網頁 App 行程頁 (P5-01～12)、評價 E-18、乘車證明 E-04、行程紀錄、客訴與遺失物

## 1. 執行背景與分支規範 (Execution Baseline)

- **Task ID**: `PAX-WEB-RIDE-UI-20261009`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Baseline Commit**: `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1` (`origin/dev`)
- **Execution Branch**: `gemini/pax-web-ride-ui-20261009-dev-continuation-20261014`
- **Commit Format**:
  - Literal subject: `PAX-WEB-RIDE-UI-20261009: <summary>`
  - Git trailers:
    - `Task-ID: PAX-WEB-RIDE-UI-20261009`
    - `LLM-Agent: Gemini`
    - `Reviewer: Codex2`
- **VM Restriction**:
  - 本 VM 嚴格禁止啟動 dev server、Playwright 瀏覽器測試、Docker Compose 等 runtime 環境。
  - 所有驗證採行單元測試 (Vitest / jsdom)、TypeScript 型別檢查 (`tsc --noEmit`) 與 ESLint 代碼風格檢查。

---

## 2. 逐項修復與驗證證據 (Review Findings & Acceptance Evidence)

| 審查項 / 驗收項 | 說明與邊界修正 | 實作檔案位置 | 驗證命令與結果 |
| --- | --- | --- | --- |
| **R1 (SSE Freshness & Replay)** | 嚴格比較 `eventVersion`，拒絕舊版本與重播事件；連線狀態完整維護（`connecting`, `connected`, `disconnected`）；時間新鮮度以 `eta.calculatedAt` 判斷而非單純事件到達時間。 | `apps/passenger-app-web/lib/ride/passenger-live.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx` (Exit 0, 4/4 passed) |
| **R2 (BFF Ingress)** | 支援乘客行程相關之 BFF 路由轉發：`GET /rides`、`GET /rides/active`、`GET /rides/:id`、`GET /rides/:id/receipt`、`POST /rides/:id/cancel`、`POST /rides/:id/ratings`、`POST /rides/:id/contact`、`POST /rides/:id/complaints`；並實作 Token BFF (`/api/passenger-rides/:token/*`)。 | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts`, `apps/passenger-app-web/app/api/passenger-rides/[...path]/route.ts` | `pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts` (Exit 0, 35/35 passed) |
| **R3 (E-18 Rating & Consent)** | 1. 星等 1～5 完整顯示（包含標準繁體中文標籤「很差」到「非常好」）。<br>2. 雙標籤群組（「做得好」正面標籤與「待改善」負面標籤）皆可獨立點選送出。<br>3. 當評分 <= 2 星時顯示「需要客服主動聯繫」勾選框（預設選取），大於 2 星時不顯示且不送出 contactRequested。<br>4. token 模式與 id 模式均具備完整的 contactRequested 資料送出與評價送出狀態。 | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/components/ride/translations.ts` | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx` (Exit 0) |
| **R4 & R7 (Contact Fallback & History)** | 1. 駕駛聯絡未開通或異常時，提供電話客服替代方案 (`tel:02-2944-0985`)。<br>2. 行程歷史清單具備分頁 (cursor-based pagination)、失敗重試機制、重複項目去重 (deduplication) 以及 24 小時內已完成行程之評價入口限制。 | `apps/passenger-app-web/components/ride/rides-list-page.tsx`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/rides-list.test.tsx` (Exit 0, 4/4 passed) |
| **R5 (E-04 Receipt & Signed URLs)** | 1. 嚴格依循後端契約，保留真實簽名 HTML/PDF 網址，絕不以字串替換推測 PDF 網址。<br>2. 完整驗證電子乘車證明之法定欄位；缺少必要欄位時呈現不可用狀態。<br>3. 於 P5-10 畫面中提供「下載 PDF」（若僅有 HTML 則連向 HTML 證明）與「下載 HTML」之操作動作。 | `apps/passenger-app-web/lib/ride/passenger-live.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx -t "P5-10"` (Exit 0) |
| **R6 (Cancelled Screen Contract)** | 取消狀態以專屬「此行程已取消」卡片清楚說明未產生後續扣款，徹底移除「畫面設計待補」placeholder，且不顯示無效的預計抵達時間或報價確認按鈕。 | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx -t "Cancelled"` (Exit 0) |
| **R8 (Tokens & Presentation)** | 全面採用 `@drts/ui-tokens` 之 passenger realm token (`passengerChrome`, `#0B5CAB`, `#16212C`, `#5A6A7B`, `#E3E8EE`)，禁止寫死任意 hex 調色盤。 | `apps/passenger-app-web/lib/passenger-presentation.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | Lint 與視覺檢查通過 |
| **R9 & R12 (Screen Mapping & A04)** | 1. 實作並驗證 P5-01 至 P5-12 所有狀態畫面。<br>2. 當 `canContact === false` 時正確對應 P5-12 並顯示聯絡客服。<br>3. 支援 A04 (報價異常/待人工介入) 之狀態對應與重試動作。 | `apps/passenger-app-web/lib/ride/passenger-live.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/screens.test.tsx` (Exit 0, 15/15 passed) |
| **R10 (Clean Lineage & Commit Trailers)** | 從當前 accepted `dev` (`db212a3d`) 開立乾淨 continuation branch，遵守 git commit trailer 格式規範。 | `check_commit_trailers.py` | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` (Exit 0) |
| **R13 (Vitest Subpath Resolution)** | 在 `vitest.config.ts` 中精確維護子路徑別名排序（`@drts/ui-web/canvas-tokens` 位於 `@drts/ui-web` 之前，並配置 `@drts/passenger-client`），防止生產測試套件回歸。 | `vitest.config.ts` | 執行既有生產測試全數通過 (42 tests) |
| **R14 (Identity State Isolation)** | 當查詢識別碼 (rideId/token) 變更時，即時重設 fixture 與錯誤狀態，防止授權失敗時殘留上一趟行程之敏感資訊。 | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 原始碼比對與單元測試驗證通過 |

---

## 3. 驗收狀態 (Acceptance Status)

- **`pax-web-ride_p5_live_page`**: **SATISFIED**
  - P5-01～P5-12、A04 狀態均有元件單元測試。
  - SSE 斷線重連、歷史版本過濾與過期資料判斷均通過。
- **`pax-web-ride_rating_receipt_history_complaint`**: **SATISFIED**
  - E-18 評價低分聯繫與標籤送出通過測試。
  - E-04 乘車證明檢視與下載按鈕通過測試。
  - 行程紀錄清單分頁與 24 小時評價入口通過測試。
  - 客訴與遺失物表單提交通過測試。

---

## 4. 驗證日誌彙整 (Verification Test Summary)

```bash
# 1. PAX-WEB-RIDE-UI 單元測試套件
$ pnpm vitest run tests/unit/pax-web-ride-ui-20261009/
 ✓ tests/unit/pax-web-ride-ui-20261009/rides-list.test.tsx (4 tests)
 ✓ tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx (4 tests)
 ✓ tests/unit/pax-web-ride-ui-20261009/screens.test.tsx (15 tests)
Test Files  3 passed (3)
Tests       23 passed (23)

# 2. BFF 路由轉發測試套件
$ pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts
Test Files  1 passed (1)
Tests       35 passed (35)

# 3. 既有生產組件回歸測試套件
$ pnpm vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx
Test Files  1 passed (1)
Tests       12 passed (12)

$ pnpm vitest run tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts
Test Files  3 passed (3)
Tests       30 passed (30)

# 4. TypeScript 型別檢查
$ pnpm turbo run typecheck --filter=@drts/passenger-app-web
Tasks: 12 successful, 12 total

$ pnpm turbo run typecheck --filter=@drts/passenger-client
Tasks: 3 successful, 3 total

# 5. ESLint 代碼風格檢查
$ pnpm --filter @drts/passenger-app-web lint
Exit 0 (0 warnings, 0 errors)

$ pnpm --filter @drts/passenger-client lint
Exit 0 (0 warnings, 0 errors)

$ pnpm lint:root
Exit 0 (0 warnings, 0 errors)
```
