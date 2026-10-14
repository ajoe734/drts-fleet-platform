# PAX-WEB-RIDE-UI-20261009 UAT: 乘客網頁 App 行程頁 (P5-01～12)、評價 E-18、乘車證明 E-04、行程紀錄、客訴與遺失物

## 1. 執行背景與分支規範 (Execution Baseline)

- **Task ID**: `PAX-WEB-RIDE-UI-20261009`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Initial Baseline Commit**: `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1` (`origin/dev`)
- **Accepted Dev Merge Commit**: `32eb87f19e2a7ccb978057785bfad4116246916f` (Ordinary merge committed as `ebecad23aec63a57fd9020dd67abcc09439ea69d`)
- **Execution Branch**: `gemini/pax-web-ride-ui-20261009-dev-continuation-20261014`
- **PR**: https://github.com/ajoe734/drts-fleet-platform/pull/2622
- **Prior Candidate (Reopened)**: `f59ba37b4f33cb544bcc528a0daeaf97d354e1f2` (Codex2 independent review: REJECTED / reopen; 7 PASS, 11 FAIL)
- **Commit Format**:
  - Literal subject: `PAX-WEB-RIDE-UI-20261009: <summary>`
  - Git trailers:
    - `Task-ID: PAX-WEB-RIDE-UI-20261009`
    - `LLM-Agent: Gemini`
    - `Reviewer: Codex2`
- **VM Restriction**:
  - 本 VM 嚴格禁止啟動 dev server、Playwright 瀏覽器測試、Docker Compose 等 runtime 環境。
  - 所有驗證採行單元測試 (Vitest / jsdom)、獨立驗證探針 (Readonly check probe / node)、TypeScript 型別檢查 (`tsc --noEmit`) 與 ESLint 代碼風格檢查。

---

## 2. 逐項修復與驗證證據 (Review Findings & Acceptance Evidence Table)

依據 `AI_COLLABORATION_GUIDE.md` §0.7 及 Codex2 審查結果，逐項記錄如下：

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 (`f59ba37`) → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **R1 (SSE Monotonic Replay & State)** | `apps/passenger-app-web/lib/ride/passenger-live.ts` | 舊版重現：重播舊 `eventVersion` 或無效計算時間導致錯誤更新。<br>修正版：比對單調遞增 `eventVersion` 拒絕重播；狀態維護 `connecting` → `connected` → `disconnected`；關閉時確實 cleanup。 | Probe: `R1 SSE replay/state/cleanup`<br>PASS (`events: [2]`, `closed: true`)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 4/4) | VM 限制禁止啟動真實 SSE 後端伺服器與原生瀏覽器長連線斷網模擬。 |
| **R2 (BFF Ingress - Baseline 35)** | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` | 舊版重現：缺少 rides/receipt/cancel/ratings/complaints 之轉發路徑。<br>修正版：完整支援 active/detail/SSE/cancel/ratings/receipt 轉發，新增 Token BFF 路由。 | `pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts`<br>Exit 0, 35/35 passed (Baseline 35 retained) | 未直連真實 API Gateway 或外部下游微服務。 |
| **R3 (Token Low-Score Complaint Intake)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1266-1485`, `apps/passenger-app-web/app/api/passenger-rides/[...path]/route.ts` | 舊版重現 (`f59ba37`)：評分卡片顯示客服聯繫勾選，但僅發送 `{score: 2, contactRequested: true}` 至 ratings 端點，上游未支援該欄位且未發起客訴。<br>修正版：在 `RatingCard` 於 `score <= 2` 且勾選聯繫時，發送評價後接續調用 `/api/passenger-rides/:token/complaints`（`category: "service"`, `contactConsent: true`）；Token BFF 補全 `:token/complaints` 轉發白名單。 | Probe: `R3 token default-on consent visible` (PASS)<br>Probe: `R3 token selected consent uses supported legacy operation` (PASS, 雙端點均調用)<br>Vitest: `screens.test.tsx` (Exit 0, 16/16) | 後端 PG 實際寫入投訴資料表未在本機執行（依 VM 限制禁止啟動 DB）。 |
| **R4 (Contact Driver/Support Fallback)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/lib/ride/passenger-live.ts` | 舊版重現：缺少客服電話 fallback。<br>修正版：`canContact === false` 時切換至 `support_only` 模式，提示改聯絡客服並提供電話連結 (`tel:02-2944-0985`)。 | Probe: `R9 canonical degraded explanation` (PASS)<br>Vitest: `screens.test.tsx` (P5-12 passed) | 真實行動裝置撥號體驗未在瀏覽器中操作。 |
| **R5 (E04 Receipt Snapshot & Artifacts BFF)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:431-606`, `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts`, `apps/passenger-app-web/app/api/passenger-rides/[...path]/route.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1860-1880` | 舊版重現 (`f59ba37`)：<br>1. 未合併 accepted dev `32eb87f`。<br>2. `mapPassengerCertificate` 忽略 `record.e04Snapshot` 且不完整資料誤標 available。<br>3. HTML URL 被誤標為「下載 PDF」。<br>4. BFF 阻擋 `receipt/downloads` 與 `receipt/artifacts/*`。<br>修正版：<br>1. 乾淨 ordinary merge accepted `dev` `32eb87f`。<br>2. 嚴格消費 `e04Snapshot`，缺少法定欄位時 fail-closed 回傳 `state: "error"`。<br>3. 僅在 `cert.pdfUrl` 存在時提供「下載 PDF」。<br>4. Account 與 Token BFF 白名單放行 `receipt/downloads` 及 `receipt/artifacts/html|pdf`。 | Probe: `R5 signed URLs retained` (PASS)<br>Probe: `R5 HTML-only response never mislabeled PDF` (PASS)<br>Probe: `R5 incomplete E04 stays nonofficial/unavailable` (PASS)<br>Probe: `R5 accepted producer E04 snapshot is consumed` (PASS)<br>Probe: `R5 accepted account receipt/downloads forwards` (PASS)<br>Probe: `R5 accepted account receipt/artifacts/html forwards` (PASS)<br>Probe: `R5 accepted account receipt/artifacts/pdf forwards` (PASS)<br>Probe: `R5 accepted token artifact html forwards` (PASS)<br>Probe: `R5 accepted token artifact pdf forwards` (PASS) | 13 E04 產出與 PDF 二進位渲染依賴後端服務，本機驗證 proxy 與 presentation 層。 |
| **R6 & R8 (P5 Realm Tokens & Foreground Cleanup)** | `apps/passenger-app-web/lib/passenger-presentation.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/components/ride/complaint-form.tsx` | 舊版重現 (`f59ba37`)：使用 `surface: "tenant"`、寫死 `#fff` 與未對齊 palette。<br>修正版：採用 `@drts/ui-tokens` `REALM_COLORS.passenger`、`CORE_FOREGROUNDS.foregroundInvert`、P5 官方設計調色盤 (`#F3F5F8`, `#0B5CAB`, `#07437E`, `#16212C`, `#5A6A7B`) 及字體 (`"Inter"`, `"JetBrains Mono"`)；移除取消頁面待補佔位符。 | Probe: `R6 cancelled placeholder removed` (PASS)<br>`pnpm --filter @drts/passenger-app-web lint` (Exit 0)<br>`pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit` (Exit 0) | UI 視覺還原與設計稿比對屬靜態審查。 |
| **R7 (History Pagination Deduplication)** | `apps/passenger-app-web/app/rides/page.tsx:110-155` | 舊版重現 (`f59ba37`)：跨頁分頁載入重複訂單時未去重，導致 React key 重複及重複渲染。<br>修正版：以 `orderId` 進行 Set 去重，過濾已存在或 active 列表之行程。 | Probe: `R7 overlapping history pages deduplicated` (PASS, copies: 1)<br>Vitest: `rides-list.test.tsx` (Exit 0, 5/5) | 真實大資料量分頁 cursor 快照未於本機測試。 |
| **R9 & R12 (Screen Mapping & Operational Hold vs A04)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:608-660`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1800-1830` | 舊版重現 (`f59ba37`)：`exception_hold` 且具備有效報價時誤判為報價異常 `A04`；A04 重新報價按鈕寫死 `window.location.reload()`。<br>修正版：`resolveScreenId` 區分真報價異常與作業保留；有報價之 `exception_hold` 保留派遣狀態並標示「行程保留處理中」；`A04` 重新報價按鈕改為調用 `fetchPassengerRideAuthority` 重新取回狀態。 | Probe: `R9 degraded maps P5-12` (PASS)<br>Probe: `R12 operational hold with valid quote never invents quote outage` (PASS)<br>Vitest: `screens.test.tsx` (Exit 0, 16/16) | 端對端派遣系統報價異常狀態轉換由下游模擬提供。 |
| **R10 (Clean Trailers Lineage)** | Git commit history | 舊版重現：包含無效 trailers。<br>修正版：繼承自乾淨 dev baseline，包含合規 trailers。 | `python3 tools/ci/git/check_commit_trailers.py --base db212a3d --head HEAD`<br>Exit 0 (5 commits OK) | 待 hosted CI 驗證。 |
| **R13 (Vitest Subpath Aliasing)** | `vitest.config.ts` | 舊版重現：別名順序錯誤導致生產測試失敗。<br>修正版：精確排序 `@drts/ui-web/canvas-tokens` 先於 `@drts/ui-web`。 | `pnpm vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts`<br>Exit 0, 42/42 passed | 無。 |
| **R14 (Identity State Transition Isolation)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：換 rideId 時殘留舊資料。<br>修正版：變更 token/rideId 立即清除舊 fixture 並展示錯誤處理。 | Probe: `R14 id change hides previous trip and shows error` (PASS)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 4/4) | 無。 |
| **CI i18n Guard Remediation** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1959` | 候選 71f81b5 於 CI 觸發 i18n-guard 違規（Inline aria-label text "重新取得報價"）。<br>修正版：改用 `{t.Requote}`。 | `pnpm run i18n:guard`<br>Exit 0 (637 files scanned, OK) | 無。 |
| **`pax-web-ride_p5_live_page`** | 行程頁面主視覺、狀態切換與 BFF 代理 | P5-01～P5-12 元件、SSE 監聽、A04 報價異常重試與 BFF 轉發全部通過測試。 | Vitest 4 files, 60 tests passed (Exit 0)<br>Readonly Probe 18/18 passed (Exit 0) | **SCOPED PASS (Unit/Probe)**。真實雲端環境部署與 E2E 驗收受限於 VM 限制，留待 hosted CI。 |
| **`pax-web-ride_rating_receipt_history_complaint`** | 評價、乘車證明、歷史紀錄與客訴 | E-18 評價客訴連動、E-04 乘車證明 snapshot 欄位消費與下載路徑、歷史紀錄去重與客訴表單均完整實作且驗證通過。 | Vitest 4 files, 60 tests passed (Exit 0)<br>Readonly Probe 18/18 passed (Exit 0) | **SCOPED PASS (Unit/Probe)**。後端 13 E04 產出與端對端金流整合留待跨模組驗收。 |

---

## 3. 獨立驗證探針執行結果 (Readonly Probe Verification)

執行 Codex2 獨立驗證探針測試腳本，共 18 項檢查，結果全數通過 (18/18 PASS, 0 FAIL)：

```json
{"name":"R9 degraded maps P5-12","result":"PASS","actual":"P5-12"}
{"name":"R9 canonical degraded explanation","result":"PASS","actual":true}
{"name":"R6 cancelled placeholder removed","result":"PASS","actual":false}
{"name":"R5 signed URLs retained","result":"PASS","actual":{"html":"https://example.invalid/receipt.html?signature=abc","pdf":"https://example.invalid/receipt.pdf?signature=pdf"}}
{"name":"R5 HTML-only response never mislabeled PDF","result":"PASS","actual":{}}
{"name":"R5 incomplete E04 stays nonofficial/unavailable","result":"PASS","actual":{"state":"error"}}
{"name":"R5 accepted producer E04 snapshot is consumed","result":"PASS","actual":{"labels":["乘車證明編號","開立時間","車隊","駕駛","車牌","遮罩執登號","上車時間","下車時間","行駛時間","路線","行駛里程","車資金額","通行費","客服電話","主管機關申訴電話","支付方式","起程","續程","延滯","夜間加成"],"hasFleet":true,"hasPayment":true}}
{"name":"R12 operational hold with valid quote never invents quote outage","result":"PASS","actual":{"screenId":"P5-02","fare":"應付 NT$ 100"}}
{"name":"R3 token default-on consent visible","result":"PASS","actual":true}
{"name":"R3 token selected consent uses supported legacy operation","result":"PASS","actual":{"calls":[{"url":"/api/passenger-rides/ride1/ratings","method":"POST","body":{"score":2,"contactRequested":true}},{"url":"/api/passenger-rides/ride1/complaints","method":"POST","body":{"category":"service","content":"低分評價請求客服聯繫","contactConsent":true}}],"scope":"UI HTTP only; unsupported contact field independently checked in actual contract/service"}}
{"name":"R1 SSE replay/state/cleanup","result":"PASS","actual":{"events":[2],"states":["connecting","connected","disconnected","connected","disconnected"],"closed":true}}
{"name":"R14 id change hides previous trip and shows error","result":"PASS","actual":{"requests":["/api/passenger-app/rides/ride1","/api/passenger-app/rides/ride2"],"oldTrip":true,"error":true}}
{"name":"R5 accepted account receipt/downloads forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads"]}}
{"name":"R5 accepted account receipt/artifacts/html forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html"]}}
{"name":"R5 accepted account receipt/artifacts/pdf forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/pdf"]}}
{"name":"R5 accepted token artifact html forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/pdf","http://localhost:3001/api/passenger-rides/token/receipt/artifacts/html"]}}
{"name":"R5 accepted token artifact pdf forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/pdf","http://localhost:3001/api/passenger-rides/token/receipt/artifacts/html","http://localhost:3001/api/passenger-rides/token/receipt/artifacts/pdf"]}}
{"name":"R7 overlapping history pages deduplicated","result":"PASS","actual":{"copies":1}}
{"passed":18,"failed":0,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0"}
```

---

## 4. 自動化測試日誌彙整 (Automated Test Summary)

```bash
# 1. PAX-WEB-RIDE-UI 與 BFF 單元測試套件 (60 tests passed)
$ pnpm exec vitest run tests/unit/pax-web-ride-ui-20261009 tests/unit/pax-web-shell-20261009/bff.test.ts --no-cache --maxWorkers=1
 ✓ tests/unit/pax-web-shell-20261009/bff.test.ts (35 tests) 132ms
 ✓ tests/unit/pax-web-ride-ui-20261009/screens.test.tsx (16 tests) 1252ms
 ✓ tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx (4 tests) 604ms
 ✓ tests/unit/pax-web-ride-ui-20261009/rides-list.test.tsx (5 tests) 254ms
Test Files  4 passed (4)
Tests       60 passed (60)
Duration    8.25s

# 2. TypeScript 型別檢查
$ pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit --incremental false
Exit 0 (0 errors)

# 3. ESLint 代碼風格檢查
$ pnpm --filter @drts/passenger-app-web lint
Exit 0 (0 warnings, 0 errors)

$ pnpm --filter @drts/passenger-client lint
Exit 0 (0 warnings, 0 errors)

# 4. Commit Trailers 規範檢查
$ python3 tools/ci/git/check_commit_trailers.py --base db212a3d6e6a0eced76fe2cebb0c05a46b8511c1 --head HEAD
check_commit_trailers: 7 commit(s) OK.

# 5. i18n Guard 規範檢查
$ pnpm run i18n:guard
i18n-guard: OK (637 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)
Exit 0 (0 errors)
```
