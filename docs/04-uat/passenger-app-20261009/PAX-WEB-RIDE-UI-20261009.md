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
  - `ec68886d3e813f640f09e08398e0404495e50529` (Pre-continuation baseline)
  - `f5999f848b59868c2264e9a8f2f256ea4f9c5d0e` (Pre-continuation baseline)
  - `8e3a246a48d82d499933c467a5b3a32f9ee8646b` (Pre-continuation baseline)
  - `c52a18300dbe5d5c815c82d16d451ce708f019fd` (Review 1: REJECTED / reopen, gen `cd60016aca1a4d33934b7e5e42f6bed9`)
  - `ca02682543d159b4844cc45698af59a888b687cd` (Review 2: REJECTED / reopen, gen `8995e0f59b19415ab9203150bc00f3bc`)
  - `b34eed506f8ab1aec7a83b19426fca8c7b67b47d` (Review 3: REJECTED / reopen, gen `677e5cdacdba4054b3d6dd5e40f79f5e`)
  - `a33a0f488dd2dceed195d6a67ed0e33a1025c9ba` (Review 4: REJECTED / reopen, gen `aee49e9a22ef46deb08485a5a2069f1e`)
  - `1f0170be9d5b8fdd7480001ba345386a24389308` (Review 5: REJECTED / reopen, gen `06eb7dc4e30544c197add929107b5327`)
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

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 (`1f0170b`) → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **R1 (SSE Monotonic Replay & Recovery Freshness)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:340-365, 2420-2530`, `apps/passenger-app-web/lib/ride/passenger-live.ts:136-203` | `1f0170b` 重現：`PassengerRidePage` 之 `lastEventTime` 預設為 `Date.now()`，A04 重新整理 (`handleFixtureUpdate`) 僅重啟 SSE 而未同步 GET 權威之 `eta.calculatedAt`，導致 1 小時前舊資料或缺少時間戳時誤判為 fresh (`位置更新於 0 秒前`，`1 PASS / 2 FAIL`)。<br>修正版：`lastEventTime` 初始值設為 0；初次 GET、A04 重試 GET (`handleFixtureUpdate`) 及 SSE (`startSubscription`) 均嚴格從權威 `eta.calculatedAt` 同步時間戳；舊戳記與缺戳記正確顯示「司機位置更新稍有延遲」，當前時間戳正確顯示「位置更新於 0 秒前」(`3 PASS / 0 FAIL`)。保留 SSE 事件單調性與 cleanup。 | Review 5 Probe: `R1 recovered GET freshness old timestamp` (PASS, stale: true, badge: null)<br>Review 5 Probe: `R1 recovered GET freshness missing timestamp` (PASS, stale: true, badge: null)<br>Review 5 Probe: `R1 recovered GET freshness current timestamp` (PASS, stale: false, badge: "位置更新於 0 秒前")<br>Fence 1: `R1 recovered A04 page starts live SSE` (PASS)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 10/10) | VM 限制禁止啟動真實 SSE 後端伺服器與原生瀏覽器長連線斷網模擬。 |
| **R2 (BFF Ingress - Baseline 35)** | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` | 舊版修復保留：完整支援 active/detail/SSE/cancel/ratings/receipt 轉發，維持基線 35 測試通過。Token 端點不支援未經上游核准之投訴路由。 | `pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts`<br>Exit 0, 35/35 passed | 未直連真實 API Gateway 或外部下游微服務。 |
| **R3 (Token Low-Score Rating & CRM Producer)** | `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1266-1310`, `apps/passenger-app-web/lib/ride/passenger-live.ts:80-135` | 舊版修復保留：普通合併 `origin/dev` `0a03db025` (`bd44f6b99`)，引入合約 `contactRequested?: boolean;` 及後端 V0119 token consent 交易。前端 RatingCard 維持單一評分請求發送 `contactRequested`。注入 SQL 客戶端之 47 項生產 controller/service/repository 單元回歸通過。 | Fence 2: `R3 single ratings wire token/2/false` (PASS)<br>Fence 2: `R3 single ratings wire token/2/true` (PASS)<br>Fence 2: `R3 single ratings wire token/3/false` (PASS)<br>Fence 2: `R3 single ratings wire id/2/false` (PASS)<br>Producer regressions: 47 passed (Exit 0)<br>`git merge-base --is-ancestor 0a03db025 HEAD` (Exit 0) | 本機無真實 PostgreSQL / Ops CRM 伺服器；持久化與 CRM 進件採外部模擬 / SKIP。 |
| **R4 (Contact Driver/Support Fallback)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/lib/ride/passenger-live.ts` | 舊版修復保留：`canContact === false` 時切換至 `support_only` 模式，提示改聯絡客服並提供電話連結 (`tel:02-2944-0985`)。Token 模式之客訴及遺失物亦保留此合法 fallback。 | Probe: `R9 degraded maps P5-12` (PASS)<br>Probe: `R9 canonical degraded explanation` (PASS)<br>Vitest: `screens.test.tsx` (P5-12 passed) | 真實行動裝置撥號體驗未在瀏覽器中操作。 |
| **R5 (E04 Receipt Strict 13 Fields, Account Retry & Download)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:204-290, 500-675`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1007-1115` | 舊版修復保留：徹底移除合成假資料；未就緒或缺少法定欄位誠實回傳 `pending` 或 `error`；account receipt 重試時並發查詢 `getRide` 與 `/receipt/downloads`，成功消費真實 13 項法定欄位 (20 rows) 與 `pdfUrl` 下載中繼資料。移除 iframe。 | Fence 1: `R5 account retry consumes real ready facts and explicit metadata PDF` (PASS, 20 rows, `pdfUrl` present)<br>Fence 2: `R5 complete captured facts` (PASS, 20 rows)<br>Fence 2: `R5 partial e04 rejected` (PASS)<br>Fence 2: `R5 URL-only missing authority stays pending without invented PDF` (PASS) | 本機無真實 PDF 渲染伺服器，驗證語意欄位對映、重試狀態機與下載連結。 |
| **R6 (Cancelled Terminal Presentation & Canvas Layout)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:695-700`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:2116-2140` | 修復保留承諾文字與 ETA 之移除。但畫布缺少核准之取消終端版面 (stencil)，依規則維持 **OPEN** 並撰寫畫面需求說明 (note + STOP)。 | Fence 1: `R6 cancelled no dispatch promise false` (PASS)<br>Fence 1: `R6 cancelled no dispatch promise true` (PASS) | **OPEN (Missing Approved Canvas Stencil)**。待 Supervisor 協調設計團隊提供核准之取消版面來源。 |
| **R7 (History Pagination Deduplication)** | `apps/passenger-app-web/app/rides/page.tsx` | 舊版修復保留：以 `orderId` 進行 Set 去重，過濾已存在或 active 列表之行程。 | Vitest: `rides-list.test.tsx` (Exit 0, 5/5) | 真實大資料量分頁 cursor 快照未於本機測試。 |
| **R8 (Complaint Composition & Body Canvas Palette)** | `apps/passenger-app-web/lib/passenger-presentation.ts:17-39`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 修復獨立 A18/A19 標頭 (`tripHeaders: 0, orderHeaders: 1`)，但通用 console tokens 與權威 `p5-ui.jsx` 顏色（#F3F5F8 vs #F1F4F8 等）存在靜態差距。依邊界指示維持 **OPEN**，待 Supervisor 協調共享 passenger ui-tokens / P5-kit 範疇。 | Fence 1: `R8 standalone A18 removes trip header` (PASS, `tripHeaders: 0`, `orderHeaders: 1`) | **OPEN (Canvas Body Palette Alignment)**。待 Supervisor 協調共享 passenger ui-tokens 範疇；不自行寫死 raw hex。 |
| **R9 & R12 (A04 Supported Authority GET Retry, Retained Authority Facts & Terminal Precedence)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1780-1840, 2465-2525`, `apps/passenger-app-web/lib/ride/passenger-live.ts:298-335, 688-725, 840-865` | `1f0170b` 重現：<br>1. 重試報價錯誤時呼叫 `createFareQuoteAnomalyFixture`，將已掌握之 orderNo、pickupLabel、預約時間覆蓋為虛構的 ride1 與當日時間 (FAIL)。<br>2. 重新整理權威取得真實已完成狀態 (`status: "completed"`) 但無 assignment fare 時，舊報價異常脈絡覆蓋終端狀態，誤判為 A04 鎖死完成/評價畫面 (FAIL)。<br>修正版：<br>1. `Actions.requote` 報價重試失敗時調用 `retainFixtureQuoteAnomaly`，嚴格保留現有 fixture 之 orderNo、地址、預約時間、狀態與操作權限 (`PASS`)。<br>2. `resolveScreenId` 與 `Actions.requote` 確立真實終端狀態優先權 (`completed` / `cancelled` 優先於殘留之 quoteAnomalyCode)，已完成訂單正確導向 `P5-08`（已評分則導向 `P5-09`），`routeFareMode` 呈現 `range` 且開放評分 (`PASS`)。<br>3. 支援之 GET 重試（account: `GET /rides/:id`，token: `GET /passenger-rides/:token`）與無關 409 conflict 誠實報錯全數保留通過。<br>4. 缺失之外部訂單重新計價 producer 明確標記為模擬 / SKIP。 | Review 5 Probe: `R9 A04 quote retry error retains actual known authority facts` (PASS)<br>Review 5 Probe: `R9 supported retry applies authoritative completed terminal state` (PASS)<br>Fence 1: `R9/R12 account A04 uses supported authority GET only` (PASS)<br>Fence 1: `R9/R12 refresh without valid quote retains formal unavailable feedback` (PASS)<br>Fence 1: `R9/R12 token A04 performs supported token authority GET` (PASS)<br>Fence 1: `R9/R12 real quote error renders A04` (PASS)<br>Fence 1: `R9 unrelated409 retains honest authority failure` (PASS)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 10/10) | 外部訂單重新計價 producer 不存在，以模擬 / SKIP 處理；不發明新端點或後端。 |
| **R10 (Commit Trailers & Clean Lineage)** | Git commit history | 舊版修復保留：自乾淨 dev baseline 建立，包含合規 trailers。 | `python3 tools/ci/git/check_commit_trailers.py --base db212a3d --head HEAD`<br>Exit 0 (17 commits OK) | 待 hosted CI 驗證。 |
| **R11 (i18n Guard Full Coverage)** | 全庫 11 apps 語系檔案 | 舊版修復保留：637 個語系檔案及 baseline exemptions 檢驗通過。 | `pnpm run i18n:guard`<br>Exit 0 (637 files scanned, 81 baseline exemptions) | 無。 |
| **R13 (Vitest Subpath Aliasing)** | `vitest.config.ts` | 舊版修復保留：精確排序 `@drts/ui-web/canvas-tokens` 先於 `@drts/ui-web`。 | Vitest 16 files, 192 tests passed (Exit 0) | 無。 |
| **R14 (Identity State Transition Isolation)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版修復保留：變更 token/rideId 立即清除舊 fixture 並展示錯誤處理。 | Vitest: `passenger-ride.test.tsx` (Exit 0) | 無。 |
| **R15 (Complaint Idempotency & Normalization Contract)** | `packages/passenger-client/src/client.ts`, `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts`, `apps/passenger-app-web/components/ride/complaint-form.tsx` | 舊版修復保留：客訴表單生成草稿專屬 `Idempotency-Key`，重送時維持相同 key；表單負載通過生產正規化器 `normalizePassengerComplaintIntake`。 | Fence 2: `R15 real service normalizer and stable retry` (PASS)<br>Fence 2: `R15 real lost_item normalizer and stable retry` (PASS) | 本機無 PostgreSQL 儲存庫，驗證 payload 規格與冪等重送。 |
| **R16 (Portable SubtleCrypto & Package Typecheck Linkage)** | `packages/passenger-client/src/payment/fields.ts`, `apps/passenger-app-web/tsconfig.json` | 舊版修復保留：移除 Node `crypto` 直連，改採標準跨平台 `globalThis.crypto.subtle`。本機 passenger-app-web 型別檢查通過。本機 passenger-client 於 detached worktree 因 monorepo 符號連結限制拋出 TS2307，同一 SHA 在 hosted CI typecheck 中兩 package 均順利通過 (33/33)。 | `pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit`<br>Exit 0 (0 errors)<br>Hosted CI run 38531983813 typecheck job 115746317322: SUCCESS (33/33) | 本機 detached worktree 存在 TS2307 符號連結限制；由 hosted CI 驗證。 |
| **`pax-web-ride_p5_live_page`** | 行程頁面主視覺、狀態切換、A04 重試與即時 SSE | A04 支援之權威 GET 重試、重試無有效報價保留 A04、恢復後正確時間戳同步與 SSE 監聽、非報價 409 錯誤分類已全部修復通過。<br>但因 R6 核准取消版面與 R8 畫布調色盤未決，依 §0.7 規範標記為 **NOT SATISFIED**。 | Review 5 Probe: 5/5 passed<br>Fence 1: 10/10 passed<br>Vitest: 192 passed | **NOT SATISFIED** (受限於 R6 畫布缺漏 stencil 與 R8 調色盤跨套件協調，且 hosted CI 尚在執行)。 |
| **`pax-web-ride_rating_receipt_history_complaint`** | 評價、乘車證明、歷史紀錄與客訴 | R3 普通合併導入合規 dev 來源，單一評分發送 contactRequested 通過 wire 與生產單元驗證；R5 乘車證明消費通過；R9 已完成終端狀態正確顯示 P5-08 開放評分。<br>但因 R8 畫布調色盤未決且無真實 PG/CRM/瀏覽器環境，依 §0.7 規範標記為 **NOT SATISFIED**。 | Review 5 Probe: 5/5 passed<br>Fence 2: 9/9 passed<br>Vitest: 192 passed | **NOT SATISFIED** (受限於 R8 調色盤協調；外部 DB/CRM 採模擬/SKIP)。 |

---

## 3. 獨立驗證探針執行結果 (Readonly Probe Verification)

執行 Codex2 審查指定之三組重現與驗證探針，全部通過 (24 PASS / 0 FAIL)：

### 3.1 Codex2 Review 5 重現與修復驗證探針結果 (5 PASS / 0 FAIL)

對應 Review 5 退修之 R1 恢復時間戳與 R9/R12 既有權威欄位保留及完成終端狀態優先權：

```json
{"sha":"HEAD","name":"R1 recovered GET freshness old timestamp","result":"PASS","actual":{"stamp":"2026-10-14T07:29:50.660Z","badge":null,"stale":true,"boundary":"actual page; HTTP and EventSource open only injected, no SSE data event"}}
{"sha":"HEAD","name":"R1 recovered GET freshness missing timestamp","result":"PASS","actual":{"stamp":null,"badge":null,"stale":true,"boundary":"actual page; HTTP and EventSource open only injected, no SSE data event"}}
{"sha":"HEAD","name":"R1 recovered GET freshness current timestamp","result":"PASS","actual":{"stamp":"2026-10-14T08:29:50.660Z","badge":"位置更新於 0 秒前","stale":false,"boundary":"actual page; HTTP and EventSource open only injected, no SSE data event"}}
{"sha":"HEAD","name":"R9 A04 quote retry error retains actual known authority facts","result":"PASS","actual":{"before":{"orderNo":"ORD-KNOWN","pickup":"Actual known pickup","status":"行程保留處理中","time":"預約時間 2026年10月15日 中午12:00"},"after":{"orderNo":"ORD-KNOWN","pickup":"Actual known pickup","status":"行程保留處理中","time":"預約時間 2026年10月15日 中午12:00"}}}
{"sha":"HEAD","name":"R9 supported retry applies authoritative completed terminal state","result":"PASS","actual":{"expected":"P5-08","screenId":"P5-08","status":"行程已完成","routeFareMode":"range","canRate":true,"boundary":"formal nullable assignment authority HTTP injection; no live backend claim"}}
{"sha":"HEAD","passed":5,"failed":0,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0"}
```

### 3.2 Codex2 Review Fence 1 探針執行結果 (10 PASS / 0 FAIL)

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

### 3.3 Codex2 Review Fence 2 探針執行結果 (9 PASS / 0 FAIL)

```json
{"sha":"HEAD","name":"R5 complete captured facts","result":"PASS","actual":{"state":"available","rows":20}}
{"sha":"HEAD","name":"R5 partial e04 rejected","result":"PASS","actual":{}}
{"sha":"HEAD","name":"R5 URL-only missing authority stays pending without invented PDF","result":"PASS","actual":{"requests":["/api/passenger-app/rides/ride1/receipt","/api/passenger-app/rides/ride1","/api/passenger-app/rides/ride1/receipt/downloads"],"html":"https://example.invalid/official.html?signature=abc"}}
{"sha":"HEAD","name":"R3 single ratings wire token/2/false","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1/ratings","body":{"score":2,"contactRequested":true}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R3 single ratings wire token/2/true","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1/ratings","body":{"score":2,"contactRequested":false}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R3 single ratings wire token/3/false","result":"PASS","actual":{"requests":[{"url":"/api/passenger-rides/ride1/ratings","body":{"score":3,"contactRequested":false}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R3 single ratings wire id/2/false","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/ride1/ratings","body":{"rideId":"ride1","rating":2,"tags":[],"comments":"","contactRequested":true}}],"boundary":"HTTP serialization only; not backend consent/CRM delivery"}}
{"sha":"HEAD","name":"R15 real service normalizer and stable retry","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"service","content":"driver behavior or wallet left in car","contactConsent":false},"key":"complaint-95c6022f-b709-468b-8a1d-aef7c36a884e"},{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"service","content":"driver behavior or wallet left in car","contactConsent":false},"key":"complaint-95c6022f-b709-468b-8a1d-aef7c36a884e"}],"alerts":["temporary test failure"],"boundary":"actual UI and formal normalizer; HTTP/PG persistence injected"}}
{"sha":"HEAD","name":"R15 real lost_item normalizer and stable retry","result":"PASS","actual":{"requests":[{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"lost_item","content":"driver behavior or wallet left in car","contactConsent":false,"lostItemDescription":"black wallet"},"key":"complaint-e582da5a-5229-4bd9-9123-a0a6f9d22bca"},{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"lost_item","content":"driver behavior or wallet left in car","contactConsent":false,"lostItemDescription":"black wallet"},"key":"complaint-e582da5a-5229-4bd9-9123-a0a6f9d22bca"}],"alerts":["temporary test failure"],"boundary":"actual UI and formal normalizer; HTTP/PG persistence injected"}}
{"sha":"HEAD","passed":9,"failed":0,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0"}
```

---

## 4. 自動化測試日誌彙整 (Automated Test Summary)

```bash
# 1. 完整單元測試套件 (16 test files, 192 tests passed)
$ pnpm exec vitest run tests/unit/pax-web-ride-ui-20261009 tests/unit/pax-web-shell-20261009 tests/unit/pax-functional-demo-20261013/demo-transport.test.ts tests/unit/pax-functional-demo-20261013/demo-journey.test.tsx tests/unit/pax-functional-demo-20261013/demo-ride.test.tsx tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts tests/unit/pax-receipt-complaint-20261009/token-rating-contact.test.ts --no-cache --maxWorkers=1
Test Files  16 passed (16)
Tests       192 passed (192)
Exit 0

# 2. TypeScript 型別檢查
$ pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit --incremental false
Exit 0 (0 errors)

# 3. ESLint 代碼風格檢查
$ pnpm run lint
Exit 0 (24 packages/apps successful, 0 errors, 0 warnings)
$ pnpm lint:root
Exit 0 (0 errors, 0 warnings)

# 4. i18n Guard 規範檢查
$ pnpm run i18n:guard
i18n-guard: OK (637 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)
Exit 0 (0 errors)

# 5. Commit Trailers 規範檢查
$ python3 tools/ci/git/check_commit_trailers.py --base db212a3d6e6a0eced76fe2cebb0c05a46b8511c1 --head HEAD
check_commit_trailers: 17 commit(s) OK.
Exit 0
```

---

## 5. 獨立審查記錄與後續修復 (Codex2 Reopen Audits & Final Resolution)

### 5.1 審查歷史與重開摘要 (Audit Receipts)

- **審查輪次 1 (`c52a183` / 2026-10-14T06:09:46Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `cd60016aca1a4d33934b7e5e42f6bed9`)。
- **審查輪次 2 (`ca02682` / 2026-10-14T06:23:18Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `8995e0f59b19415ab9203150bc00f3bc`)。確認 R16 修復。
- **審查輪次 3 (`b34eed5` / 2026-10-14T07:15:46Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `677e5cdacdba4054b3d6dd5e40f79f5e`)。指出 R9/R12 A04 POST 不合約、R5 權威中繼資料未完全消費、R6 取消承諾文字、R8 嵌入標頭。
- **審查輪次 4 (`a33a0f4` / 2026-10-14T07:45:50Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `aee49e9a22ef46deb08485a5a2069f1e`)。
- **審查輪次 5 (`1f0170b` / 2026-10-14T08:10:30Z)**: Codex2 獨立審查判定 REJECTED / reopen (candidate_generation `06eb7dc4e30544c197add929107b5327`)。
  - **R1 (P1, A04 recovery freshness; new exact uncovered trigger)**: `PassengerRidePage` 之 `lastEventTime` 初始化為 `Date.now()`；A04 重試成功後 `handleFixtureUpdate` 未將 GET 回傳之 `eta.calculatedAt` 同步至 `lastEventTime`；導致 1 小時前舊資料或缺少時間戳時誤判為新鮮 (`位置更新於 0 秒前`，`stale=false`)。
  - **R9/R12 (P1, supported retry error destroys retained real authority)**: 具備已知權威事實（如保留中訂單 ORD-KNOWN）之 A04 點擊重新報價遇 409 錯誤時，調用 `createFareQuoteAnomalyFixture` 摧毀已掌握事實，將訂單替換為虛構之 ride1、空地址與當前時間。
  - **R9/R12 (P2, prior quote context overrides returned completed terminal state)**: 重新整理權威取得真實完成狀態 (`order.status === "completed"`) 但無 assignment fare 時，舊有 quoteAnomalyCode 殘留導致 `resolveScreenId` 誤判為 A04，鎖死評價與完成畫面。
  - **R6 (P2, RECURRING approved cancelled-terminal design missing)**: 承諾文字與 ETA 移除保持良好，但畫布缺少核准之取消終端版面，維持 OPEN。
  - **R8 (P2, RECURRING body/semantic canvas mismatch)**: 獨立標頭修復保持良好，但通用 console tokens 與 `p5-ui.jsx` 顏色差距維持 OPEN。
  - **R10/UAT (P2, update per-finding evidence; historical retention)**: 增列 Review 5 退修發現與 1 PASS / 4 FAIL 歷史證據，修正 R1 引用來源，明確區分 SQL 注入測試與真實 PG/CRM 驗收。

### 5.2 本次 Candidate 具體修復與邊界對齊 (Bounded Repairs)

1. **R1 (A04 Recovery Freshness & Authority Timestamp Synchronization)**:
   - `PassengerRidePage` 之 `lastEventTime` 初始狀態設為 0，避免在未取得有效更新前誤標為當前時間。
   - `MapCard` 增加 `lastEventTime > 0` 守衛：當無有效時間戳或時間戳大於 60 秒前時，明確標記為 `stale`（顯示「司機位置更新稍有延遲」），不顯示「位置更新於 X 秒前」。
   - 初次 GET 載入、A04 重新整理 GET (`handleFixtureUpdate`) 及 SSE 接收事件 (`startSubscription`) 三處統一從權威 `assignment.eta.calculatedAt` 解析時間戳並設定 `lastEventTime`。若時間戳缺失或無效則重設為 0。
   - 保留 SSE 事件單調性重播過濾、斷線重連與組件生命週期清理。

2. **R9 & R12 (Preservation of Known Authority Facts on Requote Error)**:
   - 於 `passenger-live.ts` 引入 `retainFixtureQuoteAnomaly` 輔助函式。
   - 於 `Actions.requote` 捕捉到 `P5_QUOTE_ANOMALY_ERROR_CODES` 時，調用 `retainFixtureQuoteAnomaly(fixture, errCode)`，保留現有 fixture 之 orderNo、pickupLabel、dropoffLabel、status、requestedPickupText 等真實權威資料，僅切換至 A04 提示與警告 banner，杜絕用假資料覆蓋已知事實。

3. **R9 & R12 (Authoritative Completed/Cancelled Terminal State Precedence)**:
   - 於 `resolveScreenId` 調整優先順序：在檢查 `effectiveAnomaly` 之前，優先檢查 `view.order.status === "completed"`（導向 `P5-08` 或 `P5-09`）與 `"cancelled"`（導向 `P5-01` / `P5-11`）。真實終端狀態絕對優先於殘留之報價異常上下文。
   - 於 `Actions.requote` 中，當回傳訂單狀態為 `completed` 或 `cancelled` 時，標記 `isTerminal = true`，停止向下傳遞 `quoteAnomalyCode`。
   - 於 `mapPassengerRideAuthorityToFixture` 中，僅在 `screenId === "A04"` 時才掛載 `quoteAnomalyCode`，確保完成狀態下 `routeFareMode` 保持為 `range` 且開放送出評價。

4. **R6 (Screen Requirements Note for Cancelled Terminal Layout)**:
   - **畫面識別**: P5 行程已取消終端畫面 (P5 Cancelled Terminal Screen)
   - **依據規則**: UI Design Contract 規定「若畫布缺少該狀態畫面，應撰寫畫面需求說明並 STOP，絕不可自行發明替代設計。」
   - **現狀缺漏**: `docs/05-ui/drts-design-canvas/p5-screens.jsx` 未定義獨立的已取消終端畫面。
   - **現行處置**: 前端以標準 P5-01 / P5-11 承接，不渲染抵達 ETA，不顯示調度承諾文案。維持 **OPEN**，待 Supervisor 協調設計團隊提供核准版面。

5. **R8 (Generic Body Palette Mismatch Alignment Note)**:
   - 前端已修正 A18/A19 獨立標頭與訂單編號。
   - 關於 `passengerChrome` 調色盤與 `p5-ui.jsx` 之靜態色彩差異（如 #F3F5F8 vs #F1F4F8 等），維持 **OPEN**，待 Supervisor 協調共享 passenger ui-tokens / P5-kit 範疇，不自行寫死 raw hex。

6. **CI Lint Reconcile (Candidate 400093e38f1e)**:
   - **發現來源**: CI Run 38536610592 之 lint 工作回報 `tests/unit/pax-web-ride-ui-20261009/passenger-ride.test.tsx:483:17 error 'label' is assigned a value but never used @typescript-eslint/no-unused-vars`。
   - **修復內容**: 於測試迴圈解構中 elide 未使用的 `label` 變數 (`for (const [, stamp, expectFresh] of [...]`)。
   - **驗證依據**: `pnpm lint:root` 通過 (0 errors, 0 warnings)，`pnpm run lint` 24/24 專案全數成功，單元測試 31/31 PASS。

---

## 6. 驗收結論 (Acceptance Conclusion)

- **`pax-web-ride_p5_live_page`**: **NOT SATISFIED** (A04 supported GET retry、恢復後時間戳同步與 SSE 監聽、報價錯誤保留已知事實已全數修復通過；但因 R6 畫布取消版面與 R8 調色盤尚待跨團隊協調，且 hosted CI 尚在執行)。
- **`pax-web-ride_rating_receipt_history_complaint`**: **NOT SATISFIED** (R3 普通合併導入合規 dev 來源並經 SQL 注入回歸通過、R5 乘車證明消費通過、R9 完成狀態優先開放評分已修復通過；但因 R8 畫布調色盤未決，且外部 DB/CRM 採模擬/SKIP)。
- 本輪提交所有 24 項探針（Review 5 探針 5 + Fence 1 探針 10 + Fence 2 探針 9）全數 PASS，16 個測試檔案共 192 項單元測試全數 PASS，代碼靜態檢查（lint, tsc, i18n, commit trailers）全數 Exit 0。
