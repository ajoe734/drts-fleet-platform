# PAX-WEB-RIDE-UI-20261009 UAT: 乘客網頁 App 行程頁 (P5-01～12)、評價 E-18、乘車證明 E-04、行程紀錄、客訴與遺失物

## 1. 執行背景與分支規範 (Execution Baseline)

- **Task ID**: `PAX-WEB-RIDE-UI-20261009`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Initial Baseline Commit**: `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1` (`origin/dev`)
- **Accepted Dev Merge Commit**: `32eb87f19e2a7ccb978057785bfad4116246916f`
- **Subsequent Dev Merge Commit**: `0a03db0250551d1732d82ff3a57abb2efb0691ce` (merged via `bd44f6b99`)
- **Execution Branch**: `gemini/pax-web-ride-ui-20261009-dev-continuation-20261014`
- **PR**: https://github.com/ajoe734/drts-fleet-platform/pull/2622
- **Prior Candidates (Reopened)**:
  - `c52a18300dbe5d5c815c82d16d451ce708f019fd` (Review 1: REJECTED / reopen, gen `cd60016aca1a4d33934b7e5e42f6bed9`)
  - `ca02682543d159b4844cc45698af59a888b687cd` (Review 2: REJECTED / reopen, gen `8995e0f59b19415ab9203150bc00f3bc`)
  - `b34eed506f8ab1aec7a83b19426fca8c7b67b47d` (Review 3: REJECTED / reopen, gen `677e5cdacdba4054b3d6dd5e40f79f5e`)
  - `a33a0f488dd2dceed195d6a67ed0e33a1025c9ba` (Review 4: REJECTED / reopen, gen `aee49e9a22ef46deb08485a5a2069f1e`)
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

依據 `AI_COLLABORATION_GUIDE.md` §0.7 及 Codex2 獨立審查結果，逐項對齊歷史結果、本次修正與具體限制：

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 (`a33a0f4`) → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **R1 (SSE Monotonic Replay & Recovery)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:2420-2530`, `apps/passenger-app-web/lib/ride/passenger-live.ts:136-203` | `a33a0f4` 重現：A04 報價異常重試恢復後，`PassengerRidePage` 未重新建立 SSE 連線 (`esCount === 0`)。<br>修正版：統一由 `startSubscription` 管理 SSE 生命週期；初次載入及 A04 重算成功恢復 (`screenId !== "A04"`) 均呼叫 `startSubscription` 啟動即時監聽 (`esCount === 1`)；組件卸載與錯誤轉換時確實 `unsubscribe`。 | Fence 1: `R1 recovered A04 page starts live SSE` (PASS, `esCount: 1`)<br>Fence 2: `R1 SSE replay/state/cleanup` (PASS)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 7/7) | VM 限制禁止啟動真實 SSE 後端伺服器與原生瀏覽器長連線斷網模擬。 |
| **R2 (BFF Ingress - Baseline 35)** | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` | 舊版修復保留：完整支援 active/detail/SSE/cancel/ratings/receipt 轉發，維持基線 35 測試通過。Token 端點不支援未經上游核准之投訴路由。 | `pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts`<br>Exit 0, 35/35 passed | 未直連真實 API Gateway 或外部下游微服務。 |
| **R3 (Token Low-Score Rating & CRM Producer)** | `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1266-1310`, `apps/passenger-app-web/lib/ride/passenger-live.ts:80-135` | `a33a0f4` 重現：上游合規 dev 來源 `0a03db025` 未經普通合併導入，契約仍缺 `contactRequested`。<br>修正版：普通合併 `origin/dev` `0a03db025` (`bd44f6b99`)，引入合約 `contactRequested?: boolean;` 及後端 V0119 token consent 交易。前端 RatingCard 維持單一評分請求發送 `contactRequested`。 | Fence 2: `R3 single ratings wire token/2/false` (PASS)<br>Fence 2: `R3 single ratings wire token/2/true` (PASS)<br>Fence 2: `R3 single ratings wire token/3/false` (PASS)<br>Fence 2: `R3 single ratings wire id/2/false` (PASS)<br>`git merge-base --is-ancestor 0a03db025 HEAD` (Exit 0) | 本機無真實 PostgreSQL / Ops CRM 伺服器；持久化與 CRM 進件採外部模擬 / SKIP。 |
| **R4 (Contact Driver/Support Fallback)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/lib/ride/passenger-live.ts` | 舊版修復保留：`canContact === false` 時切換至 `support_only` 模式，提示改聯絡客服並提供電話連結 (`tel:02-2944-0985`)。Token 模式之客訴及遺失物亦保留此合法 fallback。 | Probe: `R9 degraded maps P5-12` (PASS)<br>Probe: `R9 canonical degraded explanation` (PASS)<br>Vitest: `screens.test.tsx` (P5-12 passed) | 真實行動裝置撥號體驗未在瀏覽器中操作。 |
| **R5 (E04 Receipt Strict 13 Fields, Account Retry & Download)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:204-290, 500-675`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1007-1115` | `a33a0f4` 修復保留：徹底移除合成假資料；未就緒或缺少法定欄位誠實回傳 `pending` 或 `error`；account receipt 重試時並發查詢 `getRide` 與 `/receipt/downloads`，成功消費真實 13 項法定欄位 (20 rows) 與 `pdfUrl` 下載中繼資料。移除 iframe。 | Fence 1: `R5 account retry consumes real ready facts and explicit metadata PDF` (PASS, 20 rows, `pdfUrl` present)<br>Fence 2: `R5 complete captured facts` (PASS, 20 rows)<br>Fence 2: `R5 partial e04 rejected` (PASS)<br>Fence 2: `R5 URL-only missing authority stays pending without invented PDF` (PASS) | 本機無真實 PDF 渲染伺服器，驗證語意欄位對映、重試狀態機與下載連結。 |
| **R6 (Cancelled Terminal Presentation & Canvas Layout)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:695-700`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:2116-2140` | `a33a0f4` 修復保留承諾文字與 ETA 之移除。但畫布缺少核准之取消終端版面 (stencil)，依規則維持 **OPEN** 並撰寫畫面需求說明 (note + STOP)。 | Fence 1: `R6 cancelled no dispatch promise false` (PASS)<br>Fence 1: `R6 cancelled no dispatch promise true` (PASS) | **OPEN (Missing Approved Canvas Stencil)**。待 Supervisor 協調設計團隊提供核准之取消版面來源。 |
| **R7 (History Pagination Deduplication)** | `apps/passenger-app-web/app/rides/page.tsx` | 舊版修復保留：以 `orderId` 進行 Set 去重，過濾已存在或 active 列表之行程。 | Vitest: `rides-list.test.tsx` (Exit 0, 5/5) | 真實大資料量分頁 cursor 快照未於本機測試。 |
| **R8 (Complaint Composition & Body Canvas Palette)** | `apps/passenger-app-web/lib/passenger-presentation.ts:17-39`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | `a33a0f4` 修復獨立 A18/A19 標頭 (`tripHeaders: 0, orderHeaders: 1`)，但通用 console tokens 與權威 `p5-ui.jsx` 顏色（#F3F5F8 vs #F1F4F8 等）存在靜態差距。依邊界指示維持 **OPEN**，待 Supervisor 協調共享 passenger ui-tokens / P5-kit 範疇。 | Fence 1: `R8 standalone A18 removes trip header` (PASS, `tripHeaders: 0`, `orderHeaders: 1`) | **OPEN (Canvas Body Palette Alignment)**。待 Supervisor 協調共享 passenger ui-tokens 範疇；不自行寫死 raw hex。 |
| **R9 & R12 (A04 Supported Authority GET Retry & Error Classification)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1780-1840, 2465-2525`, `apps/passenger-app-web/lib/ride/passenger-live.ts:298-335, 688-725` | `a33a0f4` 重現：Actions 仍發送 `POST /quotes` 且偽造經緯度與時間；Token 模式直接 alert 返回未呼叫 GET；權威回傳 hold 無有效報價時誤轉 `P5-01` 遺失 A04 脈絡；頁面層將非報價 409 誤判為報價異常。<br>修正版：<br>1. 徹底移除 POST `/quotes` 及任意經緯度/時間；account 模式呼叫 `GET /rides/:id`，Token 模式呼叫 `GET /passenger-rides/:token`。<br>2. 重新整理權威時，若權威仍無有效報價 (`hold` 且無 routeFare)，確實保留 A04 異常回饋；若具備有效報價則正常切換至對應行程畫面。<br>3. 頁面層移除統包 409 判定，僅在錯誤代碼符合 `P5_QUOTE_ANOMALY_ERROR_CODES` 時呈現 A04；無關之 409 conflict 誠實呈現「無法取得行程資料」。<br>4. 依指示，缺失之外部訂單重新報價 producer 明確標記為模擬 / SKIP。 | Fence 1: `R9/R12 account A04 uses supported authority GET only` (PASS)<br>Fence 1: `R9/R12 refresh without valid quote retains formal unavailable feedback` (PASS)<br>Fence 1: `R9/R12 token A04 performs supported token authority GET` (PASS)<br>Fence 1: `R9/R12 real quote error renders A04` (PASS)<br>Fence 1: `R9 unrelated409 retains honest authority failure` (PASS)<br>Vitest: `passenger-ride.test.tsx` (Exit 0) | 外部訂單重新計價 producer 不存在，以模擬 / SKIP 處理；不發明新端點或後端。 |
| **R10 (Commit Trailers & Clean Lineage)** | Git commit history | 舊版修復保留：自乾淨 dev baseline 建立，包含合規 trailers。 | `python3 tools/ci/git/check_commit_trailers.py --base db212a3d --head HEAD`<br>Exit 0 (15 commits OK) | 待 hosted CI 驗證。 |
| **R13 (Vitest Subpath Aliasing)** | `vitest.config.ts` | 舊版修復保留：精確排序 `@drts/ui-web/canvas-tokens` 先於 `@drts/ui-web`。 | Vitest 15 files, 142 tests passed (Exit 0) | 無。 |
| **R14 (Identity State Transition Isolation)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版修復保留：變更 token/rideId 立即清除舊 fixture 並展示錯誤處理。 | Vitest: `passenger-ride.test.tsx` (Exit 0) | 無。 |
| **R15 (Complaint Idempotency & Normalization Contract)** | `packages/passenger-client/src/client.ts`, `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts`, `apps/passenger-app-web/components/ride/complaint-form.tsx` | 舊版修復保留：客訴表單生成草稿專屬 `Idempotency-Key`，重送時維持相同 key；表單負載通過生產正規化器 `normalizePassengerComplaintIntake`。 | Fence 2: `R15 real service normalizer and stable retry` (PASS)<br>Fence 2: `R15 real lost_item normalizer and stable retry` (PASS) | 本機無 PostgreSQL 儲存庫，驗證 payload 規格與冪等重送。 |
| **`pax-web-ride_p5_live_page`** | 行程頁面主視覺、狀態切換、A04 重試與即時 SSE | A04 支援之權威 GET 重試、重試無有效報價保留 A04、恢復後啟動即時 SSE、非報價 409 錯誤分類已全部修復通過。<br>但因 R6 核准取消版面與 R8 畫布調色盤未決，依 §0.7 規範標記為 **NOT SATISFIED**。 | Fence 1: 10/10 passed<br>Vitest: 142 passed | **NOT SATISFIED** (受限於 R6 畫布缺漏 stencil 與 R8 調色盤跨套件協調，且 hosted CI 尚在執行)。 |
| **`pax-web-ride_rating_receipt_history_complaint`** | 評價、乘車證明、歷史紀錄與客訴 | R3 普通合併導入合規 dev 來源，單一評分發送 contactRequested 通過 wire 驗證；R5 乘車證明消費通過。<br>但因 R8 畫布調色盤未決且無真實 PG/CRM/瀏覽器環境，依 §0.7 規範標記為 **NOT SATISFIED**。 | Fence 2: 9/9 passed<br>Vitest: 142 passed | **NOT SATISFIED** (受限於 R8 調色盤協調；外部 DB/CRM 採模擬/SKIP)。 |

---

## 3. 獨立驗證探針執行結果 (Readonly Probe Verification)

執行 Codex2 審查指定之兩組重現探針，全部通過：

### 3.1 Codex2 Review Fence 1 探針執行結果 (10 PASS / 0 FAIL)

```json
{"sha":"HEAD","name":"R9/R12 account A04 uses supported authority GET only","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/ride1","method":"GET","body":null}],"updatedScreen":"A04","alerts":[]}}
{"sha":"HEAD","name":"R9/R12 refresh without valid quote retains formal unavailable feedback","result":"PASS","actual":{"updatedScreen":"A04","held":true,"assignment":null}}
{"sha":"HEAD","name":"R9/R12 token A04 performs supported token authority GET","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1","method":"GET"}],"alerts":[]}}
{"sha":"HEAD","name":"R9/R12 real quote error renders A04","result":"PASS","actual":{"esCount":0,"requests":[{"url":"/api/passenger-app/rides/ride1","method":"GET"}]}}
{"sha":"HEAD","name":"R1 recovered A04 page starts live SSE","result":"PASS","actual":{"esCount":1,"requests":[{"url":"/api/passenger-app/rides/ride1","method":"GET"},{"url":"/api/passenger-app/rides/ride1","method":"GET"}],"renderedVehicle":true}}
{"sha":"HEAD","name":"R9 unrelated409 retains honest authority failure","result":"PASS","actual":{"genericError":true,"inventedDispatch":false}}
{"sha":"HEAD","name":"R6 cancelled no dispatch promise false","result":"PASS","actual":{"screenId":"P5-01"}}
{"sha":"HEAD","name":"R6 cancelled no dispatch promise true","result":"PASS","actual":{"screenId":"P5-11"}}
{"sha":"HEAD","name":"R5 account retry consumes real ready facts and explicit metadata PDF","result":"PASS","actual":{"requests":["/api/passenger-app/rides/ride1/receipt","/api/passenger-app/rides/ride1","/api/passenger-app/rides/ride1/receipt/downloads"],"state":"available","rows":20,"pdfUrl":"/api/passenger-app/rides/ride1/receipt/artifacts/pdf"}}
{"sha":"HEAD","name":"R8 standalone A18 removes trip header","result":"PASS","actual":{"tripHeaders":0,"orderHeaders":1}}
{"sha":"HEAD","passed":10,"failed":0,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0"}
```

### 3.2 Codex2 Review Fence 2 探針執行結果 (9 PASS / 0 FAIL)

```json
{"sha":"HEAD","name":"R5 complete captured facts","result":"PASS","actual":{"state":"available","rows":20}}
{"sha":"HEAD","name":"R5 partial e04 rejected","result":"PASS","actual":{}}
{"sha":"HEAD","name":"R5 URL-only missing authority stays pending without invented PDF","result":"PASS","actual":{"requests":["/api/passenger-app/rides/ride1/receipt","/api/passenger-app/rides/ride1","/api/passenger-app/rides/ride1/receipt/downloads"],"html":"https://example.invalid/official.html?signature=abc"}}
{"sha":"HEAD","name":"R3 single ratings wire token/2/false","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1/ratings","body":{"score":2,"contactRequested":true}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R3 single ratings wire token/2/true","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1/ratings","body":{"score":2,"contactRequested":false}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R3 single ratings wire token/3/false","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1/ratings","body":{"score":3,"contactRequested":false}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R3 single ratings wire id/2/false","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/ride1/ratings","body":{"rideId":"ride1","rating":2,"tags":[],"comments":"","contactRequested":true}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R15 real service normalizer and stable retry","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"service","content":"driver behavior or wallet left in car","contactConsent":false},"key":"complaint-7ad8ae50-f94e-41e4-9c2c-662dc9aa0c6a"},{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"service","content":"driver behavior or wallet left in car","contactConsent":false},"key":"complaint-7ad8ae50-f94e-41e4-9c2c-662dc9aa0c6a"}],"alerts":["temporary test failure"],"boundary":"actual UI and formal normalizer; HTTP/PG persistence injected"}}
{"sha":"HEAD","name":"R15 real lost_item normalizer and stable retry","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"lost_item","content":"driver behavior or wallet left in car","contactConsent":false,"lostItemDescription":"black wallet"},"key":"complaint-bae3cf50-7ba2-4290-9110-373ad5ace536"},{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"lost_item","content":"driver behavior or wallet left in car","contactConsent":false,"lostItemDescription":"black wallet"},"key":"complaint-bae3cf50-7ba2-4290-9110-373ad5ace536"}],"alerts":["temporary test failure"],"boundary":"actual UI and formal normalizer; HTTP/PG persistence injected"}}
{"sha":"HEAD","passed":9,"failed":0,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0"}
```

---

## 4. 自動化測試日誌彙整 (Automated Test Summary)

```bash
# 1. 完整單元測試套件 (15 test files, 142 tests passed)
$ pnpm exec vitest run tests/unit/pax-web-ride-ui-20261009 tests/unit/pax-web-shell-20261009 tests/unit/pax-functional-demo-20261013/demo-transport.test.ts tests/unit/pax-functional-demo-20261013/demo-journey.test.tsx tests/unit/pax-functional-demo-20261013/demo-ride.test.tsx tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts --no-cache --maxWorkers=1
Test Files  15 passed (15)
Tests       142 passed (142)
Exit 0

# 2. TypeScript 型別檢查
$ pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit --incremental false
Exit 0 (0 errors)

# 3. ESLint 代碼風格檢查
$ pnpm --filter @drts/passenger-app-web lint && pnpm --filter @drts/passenger-client lint
Exit 0 (0 warnings, 0 errors)

# 4. i18n Guard 規範檢查
$ pnpm run i18n:guard
i18n-guard: OK (637 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)
Exit 0 (0 errors)

# 5. Commit Trailers 規範檢查
$ python3 tools/ci/git/check_commit_trailers.py --base db212a3d6e6a0eced76fe2cebb0c05a46b8511c1 --head HEAD
check_commit_trailers: 15 commit(s) OK.
Exit 0
```

---

## 5. 獨立審查記錄與後續修復 (Codex2 Reopen Audits & Final Resolution)

### 5.1 審查歷史與重開摘要 (Audit Receipts)

- **審查輪次 1 (`c52a183` / 2026-10-14T06:09:46Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `cd60016aca1a4d33934b7e5e42f6bed9`)。
- **審查輪次 2 (`ca02682` / 2026-10-14T06:23:18Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `8995e0f59b19415ab9203150bc00f3bc`)。確認 R16 修復。
- **審查輪次 3 (`b34eed5` / 2026-10-14T07:15:46Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `677e5cdacdba4054b3d6dd5e40f79f5e`)。指出 R9/R12 A04 POST 不合約、R5 權威中繼資料未完全消費、R6 取消承諾文字、R8 嵌入標頭。
- **審查輪次 4 (`a33a0f4` / 2026-10-14T07:45:50Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `aee49e9a22ef46deb08485a5a2069f1e`)。
  - **R9/R12 (P1, A04 requote POST/estimate vs supported GET)**: `passenger-ride-page.tsx:1781–1838` 仍調用 `POST /api/passenger-app/quotes` 並偽造經緯度 (25.033, 121.565 -> 25.04, 121.56) 與未來時間；Token 模式僅彈窗未執行受支援之 `GET /api/passenger-rides/:token`；權威重整若仍無有效報價誤轉 `P5-01` 遺失 A04 脈絡；頁面層將非報價 409 統包為 A04。
  - **R1 (P1, Recovered A04 live SSE subscription regression)**: 初始載入遇到報價錯誤進入 catch 渲染 A04 後，Actions 重算成功更新權威，但 `PassengerRidePage` 未重新啟動 SSE (`esCount === 0`)。
  - **R3 (P1, Supported token low-rating producer unmerged)**: 上游合規 dev 來源 `0a03db025` 未經普通合併，合約缺少 `contactRequested` 欄位。
  - **R6 (P2, Cancelled terminal design stencil missing)**: 承諾文字與 ETA 已消除，但畫布缺少核准之取消版面。
  - **R8 (P2, Body canvas palette mismatch)**: 通用 console tokens 與 `p5-ui.jsx` 存在靜態色彩差距。
  - **R10 & UAT Evidence Reconciliation**: UAT 需客觀反映歷史與現狀，標明未決項，將外部缺失步驟標示為模擬 / SKIP。

### 5.2 本次 Candidate 具體修復與邊界對齊 (Bounded Repairs)

1. **R9 & R12 (A04 Supported Authority GET Retry & Error Envelope Boundary)**:
   - 徹底移除 `Actions` 中之 `POST /api/passenger-app/quotes` 以及合成經緯度/時間之邏輯。
   - 點擊「重新取得報價」於 account 模式下執行 `fetchPassengerRideAuthority(token, false)` (`GET /api/passenger-app/rides/:id`)；於 Token 模式下執行 `fetchPassengerRideAuthority(token, true)` (`GET /api/passenger-rides/:token`)。
   - 權威重新取得後，檢查權威是否具備有效報價 (`view.assignment?.routeFare`)；若權威狀態仍為保留且無有效報價（如 `exception_hold` 且 `assignment === null`），確實保留 A04 脈絡與說明。
   - 頁面層 `PassengerRidePage` 移除統包 409 攔截，僅在錯誤代碼符合 `P5_QUOTE_ANOMALY_ERROR_CODES` 時呈現 A04；無關之 409 conflict 誠實呈現「無法取得行程資料」。
   - 真實訂單連結之固定報價重新計價 producer 不存在，依指示以明確模擬 / SKIP 處理，不自行發明新端點或後端。

2. **R1 (A04 Recovery Live SSE Lifecycle)**:
   - `PassengerRidePage` 統籌 SSE 生命週期，引入 `startSubscription` 與 `unsubscribeRef`。
   - 當 A04 重新整理取得有效權威畫面 (`next.screenId !== "A04"`) 時，自動啟動即時 SSE 監聽 (`esCount === 1`)，接收後續車輛位置與狀態更新；組件卸載與錯誤重置時確實執行 cleanup。

3. **R3 (Ordinary Merge of Dev 0a03db025 & Single Ratings Request)**:
   - 以普通合併 (`git merge origin/dev` / commit `bd44f6b99`) 導入已審查並合規合併之 `0a03db0250551d1732d82ff3a57abb2efb0691ce`。
   - `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` 引入 `contactRequested?: boolean;`。
   - 前端維持單一 `/ratings` 送出 `contactRequested` 旗標，通過 Fence 2 全部 4 項 wire 探針測試。
   - 本機無真實 PostgreSQL 與 Ops CRM 執行環境，持久化與 CRM 進件採外部模擬 / SKIP。

4. **R6 (Screen Requirements Note for Cancelled Terminal Layout)**:
   - **畫面識別**: P5 行程已取消終端畫面 (P5 Cancelled Terminal Screen)
   - **依據規則**: UI Design Contract 規定「若畫布缺少該狀態畫面，應撰寫畫面需求說明並 STOP，絕不可自行發明替代設計。」
   - **現狀缺漏**: `docs/05-ui/drts-design-canvas/p5-screens.jsx` 定義了 P5-01～12、A03、A04，但未定義獨立的已取消終端畫面。
   - **現行處置**: 前端以標準 P5-01 / P5-11 承接，Header 狀態顯示「行程已取消」，不渲染抵達 ETA，不插入未核准之自行發明卡片，且不顯示調度中承諾文案。本項在 UAT 維持 **OPEN**，待 Supervisor 協調設計團隊提供核准版面。

5. **R8 (Generic Body Palette Mismatch Alignment Note)**:
   - 前端已修正 A18/A19 獨立標頭與訂單編號。
   - 關於 `passengerChrome` 調色盤與 `p5-ui.jsx` 之靜態色彩差異（如 #F3F5F8 vs #F1F4F8 等），依指示維持 **OPEN**，待 Supervisor 協調 `@drts/ui-tokens` 共享 passenger ui-tokens / P5-kit 範疇，不自行寫死 raw hex。

---

## 6. 驗收結論 (Acceptance Conclusion)

- **`pax-web-ride_p5_live_page`**: **NOT SATISFIED** (A04 supported GET retry 與恢復 SSE 已完成並全數通過探針與單元測試；但 R6 畫布取消版面與 R8 調色盤尚待跨團隊協調，且 hosted CI 尚在執行)。
- **`pax-web-ride_rating_receipt_history_complaint`**: **NOT SATISFIED** (R3 上游來源普通合併完成且 wire 探針通過、R5 乘車證明嚴格消費完成；但 R8 畫布調色盤未決，且無真實 PG/CRM/瀏覽器環境)。
- 本輪提交所有 19 項 Fence 探針（10 + 9）及 142 項單元測試全數 PASS，代碼靜態檢查（lint, tsc, i18n, commit trailers）全數 Exit 0。
