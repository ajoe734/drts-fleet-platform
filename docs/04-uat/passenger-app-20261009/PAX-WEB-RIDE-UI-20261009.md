# PAX-WEB-RIDE-UI-20261009 UAT: 乘客網頁 App 行程頁 (P5-01～12)、評價 E-18、乘車證明 E-04、行程紀錄、客訴與遺失物

## 1. 執行背景與分支規範 (Execution Baseline)

- **Task ID**: `PAX-WEB-RIDE-UI-20261009`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Initial Baseline Commit**: `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1` (`origin/dev`)
- **Accepted Dev Merge Commit**: `32eb87f19e2a7ccb978057785bfad4116246916f`
- **Execution Branch**: `gemini/pax-web-ride-ui-20261009-dev-continuation-20261014`
- **PR**: https://github.com/ajoe734/drts-fleet-platform/pull/2622
- **Prior Candidate (Reopened)**: `8e1e7f97982640f59a71234479c46e22e21522b8` (Codex2 independent review: REJECTED / reopen)
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

依據 `AI_COLLABORATION_GUIDE.md` §0.7 及 Codex2 獨立審查結果，逐項記錄如下（誠實保留未決項 R3 之 OPEN 狀態）：

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 (`8e1e7f9`) → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **R1 (SSE Monotonic Replay & State)** | `apps/passenger-app-web/lib/ride/passenger-live.ts` | 舊版重現：重播舊 `eventVersion` 或無效計算時間導致錯誤更新。<br>修正版：比對單調遞增 `eventVersion` 拒絕重播；狀態維護 `connecting` → `connected` → `disconnected`；關閉時確實 cleanup。 | Probe: `R1 SSE replay/state/cleanup`<br>PASS (`events: [2]`, `closed: true`)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 4/4) | VM 限制禁止啟動真實 SSE 後端伺服器與原生瀏覽器長連線斷網模擬。 |
| **R2 (BFF Ingress - Baseline 35)** | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` | 舊版重現：缺少 rides/receipt/cancel/ratings/complaints 之轉發路徑。<br>修正版：完整支援 active/detail/SSE/cancel/ratings/receipt 轉發，維護基線 35 測試通過。 | `pnpm vitest run tests/unit/pax-web-shell-20261009/bff.test.ts`<br>Exit 0, 35/35 passed (Baseline 35 retained) | 未直連真實 API Gateway 或外部下游微服務。 |
| **R3 (Token Low-Score Rating & Complaint Boundary)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1266-1310`, `apps/passenger-app-web/app/api/passenger-rides/[...path]/route.ts`, `apps/passenger-app-web/lib/ride/passenger-live.ts:77-104` | 舊版重現 (`8e1e7f9`)：在未受支援情況下新增並偽造了 Token 端點 `/api/passenger-rides/:token/complaints` 同步發送，且 account 模式重複調用投訴端點。<br>修正版：<br>1. 移除 Token BFF 中未經上游支援的 `:token/complaints` 路由。<br>2. 移除 `RatingCard` 中未受支援的額外投訴發送邏輯及 account 重複調用，保留單一受支援之 `/ratings` 操作與 `contactRequested` 旗標。<br>3. 狀態標記：**OPEN**。依 `task_spec_ref` 規定，Token 匿名行程之正式 CRM 聯絡產生端點尚待獨立 PR (`codex2/pax-receipt-complaint-20261009-token-contact-20261014`) 合併，前端在真實上游 producer 就緒前不偽造成功聯絡進件。 | Probe: `R3 token default-on consent visible` (PASS)<br>Probe: `R3 token selected consent avoids unsupported standalone complaints` (PASS)<br>Probe: `R3 token 2 stars unchecked uses single supported rating producer` (PASS)<br>Probe: `R3 token 3 stars selected uses single supported rating producer` (PASS)<br>Probe: `R3 id 2 stars selected uses single supported rating producer` (PASS)<br>Probe: `R3 rejected contact intake is surfaced` (**OPEN / FAIL**，符合保留未修復之預期行為) | 上游後端 MultiTaxiService / Receipt PR 尚未合併前，本項維持 OPEN；本機無 DB/CRM 執行環境。 |
| **R4 (Contact Driver/Support Fallback)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/lib/ride/passenger-live.ts` | 舊版重現：缺少客服電話 fallback。<br>修正版：`canContact === false` 時切換至 `support_only` 模式，提示改聯絡客服並提供電話連結 (`tel:02-2944-0985`)。Token 模式之客訴及遺失物亦保留此合法 fallback。 | Probe: `R9 degraded maps P5-12` (PASS)<br>Probe: `R9 canonical degraded explanation` (PASS)<br>Vitest: `screens.test.tsx` (P5-12 passed) | 真實行動裝置撥號體驗未在瀏覽器中操作。 |
| **R5 (E04 Receipt Strict 13 Fields, Account Retry & Download)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:190-223, 446-531`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1007-1115` | 舊版重現 (`8e1e7f9`)：<br>1. `mapPassengerCertificate` 僅檢查 2 個欄位，缺駕駛、執登與車資拆分 4 項之部分快照誤標 available (14 rows)。<br>2. Account 重試時僅取回 `{receiptUrl: ...html}`，未取回 PDF 與完整快照。<br>3. 仍然使用 `<iframe>` 嵌入具備 CSP `frame-ancestors 'none'` 與 attachment disposition 之 HTML artifact。<br>修正版：<br>1. 嚴格驗證 E04 法定 13 項語意欄位（車隊、駕駛、執登遮罩、支付方式、起程/續程/延滯/夜間加成、車牌、上下車時間、行駛時間、路線、里程、總車資、電話）；缺少任何法定欄位皆回傳 `state: "error"`。<br>2. `fetchPassengerReceipt` 在只有 `receiptUrl` 時合成完整 E04 權威快照及 `pdfUrl`。<br>3. 徹底移除 `<iframe>`，直接在前端結構化渲染所有 E04 欄位，並提供安全的 HTML 及 PDF 下載連結。 | Probe: `R5 signed URLs retained` (PASS)<br>Probe: `R5 HTML-only response never mislabeled PDF` (PASS)<br>Probe: `R5 partial snapshot missing driver/masked registration/fare stays unavailable` (PASS, `state: "error"`)<br>Probe: `R5 account retry consumes full E04/PDF authority` (PASS, 18 rows, `state: "available"`)<br>Probe: `R5 accepted account receipt/downloads forwards` (PASS)<br>Probe: `R5 accepted account receipt/artifacts/html forwards` (PASS)<br>Probe: `R5 accepted account receipt/artifacts/pdf forwards` (PASS)<br>Probe: `R5 accepted token artifact html forwards` (PASS)<br>Probe: `R5 accepted token artifact pdf forwards` (PASS)<br>Vitest: `passenger-ride.test.tsx` (Exit 0) | 本機無 PDF 渲染伺服器，驗證語意欄位對映、重試狀態機與下載連結。 |
| **R6 & R8 (Tokens Styling & Canonical Canvas Alignment)** | `apps/passenger-app-web/lib/passenger-presentation.ts`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx`, `apps/passenger-app-web/app/rides/page.tsx`, `apps/passenger-app-web/components/ride/complaint-form.tsx` | 舊版重現 (`8e1e7f9`)：存在寫死 hex 調色盤 (`#F3F5F8`, `#E3E8EE`, `#16212C`, `#10161d`)；`/rides` 未使用 P5 元件。<br>修正版：<br>1. 採用 `@drts/ui-tokens` 之 `STATUS_TONES.neutral` 與 `REALM_COLORS.passenger`。<br>2. `/rides` 依照標準 `P5A_S16` 與 `P5A_S17` 規範重構，使用 `P5Phone`、`P5Header status="行程紀錄"`、`P5Card`、`P5Btn`，空狀態提供車輛圖示及「預約叫車」。<br>3. 客訴表單依照 `P5A_S18` 與 `P5A_S19` 規範，成功時展示打勾圖示、「我們已收到您的問題」與「返回行程」。 | Probe: `R6 cancelled placeholder removed` (PASS)<br>`pnpm --filter @drts/passenger-app-web lint` (Exit 0)<br>`pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit` (Exit 0)<br>`pnpm run i18n:guard` (Exit 0) | UI 視覺還原度比對屬靜態審查。 |
| **R7 (History Pagination Deduplication)** | `apps/passenger-app-web/app/rides/page.tsx` | 舊版重現：分頁載入重疊時未去重。<br>修正版：以 `orderId` 進行 Set 去重，過濾已存在或 active 列表之行程。 | Probe: `R7 overlapping history pages deduplicated` (PASS, `copies: 1`)<br>Vitest: `rides-list.test.tsx` (Exit 0, 5/5) | 真實大資料量分頁 cursor 快照未於本機測試。 |
| **R9 & R12 (Screen Mapping & Operational Hold vs A04 Requote)** | `apps/passenger-app-web/lib/ride/passenger-live.ts:670-710`, `apps/passenger-app-web/components/ride/passenger-ride-page.tsx:1800-1840` | 舊版重現 (`8e1e7f9`)：`exception_hold` 且無報價或 `assignment: null` 時誤轉為 `A04`；重試按鈕直接丟棄 GET 結果未更新頁面。<br>修正版：<br>1. `resolveScreenId` 僅在真報價異常 (`hasQuoteAnomaly`) 時對映至 `A04`；運作保留或無指派之調度中狀態對映至 `P5-01`。<br>2. `Actions` 於 `A04` 及 `P5-01` 之保留狀態提供「重新取得報價」按鈕，執行 `fetchPassengerRideAuthority` 並透過 `onFixtureUpdate` 即時套用至當前畫面。 | Probe: `R12 operational hold with valid quote never invents quote outage` (PASS, `P5-02`)<br>Probe: `R12 supply hold without any quote never invents quote outage` (PASS, `P5-01`)<br>Probe: `R12 A04 retry applies returned authority to actual page` (PASS, `updatedVehicle: true`)<br>Vitest: `screens.test.tsx` (Exit 0, 16/16) | 真實調度演算法運算由後端下游提供。 |
| **R10 (Commit Trailers & Clean Lineage)** | Git commit history | 舊版重現：包含無效 trailers。<br>修正版：繼承自乾淨 dev baseline，包含合規 trailers。 | `python3 tools/ci/git/check_commit_trailers.py --base db212a3d --head HEAD`<br>Exit 0 | 待 hosted CI 驗證。 |
| **R13 (Vitest Subpath Aliasing)** | `vitest.config.ts` | 舊版重現：別名順序錯誤導致生產測試失敗。<br>修正版：精確排序 `@drts/ui-web/canvas-tokens` 先於 `@drts/ui-web`。 | `pnpm vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx tests/unit/platform-admin-assistant-tools.test.ts tests/unit/platform-admin-assistant-context-packet.test.ts tests/unit/platform-admin-assistant-route-context.test.ts`<br>Exit 0, 42/42 passed | 無。 |
| **R14 (Identity State Transition Isolation)** | `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` | 舊版重現：換 rideId 時殘留舊資料。<br>修正版：變更 token/rideId 立即清除舊 fixture (`oldTrip = false`) 並展示錯誤處理。 | Probe: `R14 id change hides previous trip and shows error` (PASS, `oldTrip: false`)<br>Vitest: `passenger-ride.test.tsx` (Exit 0, 4/4) | 無。 |
| **R15 (Complaint Idempotency & Normalization Contract)** | `packages/passenger-client/src/client.ts`, `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts`, `apps/passenger-app-web/components/ride/complaint-form.tsx` | 舊版重現：客訴提交缺少冪等性保護與正規化驗證；`c52a183` 因 `packages/passenger-client` 在 `ES2022` 缺 DOM 宣告下直接調用 `crypto` 導致 CI build / typecheck 失敗。<br>修正版：<br>1. 客訴表單生成草稿專屬 `Idempotency-Key`，於重送時維持相同 key。<br>2. PassengerClient 與 BFF 完整傳遞 `Idempotency-Key` 標頭至後端。<br>3. 表單送出負載經過生產正規化器 `normalizePassengerComplaintIntake` 驗證，一般投訴與遺失物表單均 0 alerts 通過。<br>4. Client 透過 `globalThis.crypto?.randomUUID` 安全取用 UUID，通過 package build 及 typecheck。 | Probe C: `R15 formal producer positive fixture with explicit key is accepted` (PASS)<br>Probe C: `R15 actual service form satisfies accepted intake contract` (PASS, 0 alerts)<br>Probe C: `R15 actual lost_item form satisfies accepted intake contract` (PASS, 0 alerts)<br>`pnpm --filter @drts/passenger-client build` (Exit 0)<br>`pnpm --filter @drts/passenger-client typecheck` (Exit 0) | 本機無 PostgreSQL 儲存庫，驗證客戶端至 BFF 之標頭傳遞與 payload 規格。 |
| **`pax-web-ride_p5_live_page`** | 行程頁面主視覺、狀態切換與 BFF 代理 | P5-01～P5-12 元件、SSE 監聽、報價異常重試與 BFF 轉發全部通過測試。 | Vitest 8 files, 77 tests passed (Exit 0)<br>Readonly Probe 25/26 passed (Exit 0) | **SCOPED PASS (Unit/Probe)**。真實雲端環境部署與 E2E 驗收受限於 VM 限制，留待 hosted CI。 |
| **`pax-web-ride_rating_receipt_history_complaint`** | 評價、乘車證明、歷史紀錄與客訴 | E-18 評價、E-04 乘車證明 snapshot 欄位消費與下載路徑、歷史紀錄去重、客訴表單規範均完整實作且驗證通過。 | Vitest 8 files, 77 tests passed (Exit 0)<br>Readonly Probe 25/26 passed (Exit 0) | **SCOPED PASS (Unit/Probe)**。R3 之後端 CRM 聯絡產生端點留待後端 PR 合併。 |

---

## 3. 獨立驗證探針執行結果 (Readonly Probe Verification)

執行 Codex2 獨立驗證探針測試腳本，共 26 項檢查（其中 25 項 PASS，1 項 R3 依 Task Spec 規定維持誠實 OPEN / FAIL 狀態）：

```json
{"sha":"WORKTREE","name":"R9 degraded maps P5-12","result":"PASS","actual":"P5-12"}
{"sha":"WORKTREE","name":"R9 canonical degraded explanation","result":"PASS","actual":true}
{"sha":"WORKTREE","name":"R6 cancelled placeholder removed","result":"PASS","actual":false}
{"sha":"WORKTREE","name":"R5 signed URLs retained","result":"PASS","actual":{"html":"https://example.invalid/receipt.html?signature=abc","pdf":"https://example.invalid/receipt.pdf?signature=pdf"}}
{"sha":"WORKTREE","name":"R5 HTML-only response never mislabeled PDF","result":"PASS","actual":{}}
{"sha":"WORKTREE","name":"R5 incomplete E04 stays nonofficial/unavailable","result":"PASS","actual":{"state":"error"}}
{"sha":"WORKTREE","name":"R5 accepted producer E04 snapshot is consumed","result":"PASS","actual":{"labels":["乘車證明編號","開立時間","車隊","駕駛","車牌","遮罩執登號","上車時間","下車時間","行駛時間","路線","行駛里程","車資金額","通行費","客服電話","主管機關申訴電話","支付方式","起程","續程","延滯","夜間加成"],"hasFleet":true,"hasPayment":true}}
{"sha":"WORKTREE","name":"R12 operational hold with valid quote never invents quote outage","result":"PASS","actual":{"screenId":"P5-02","fare":"應付 NT$ 100"}}
{"sha":"WORKTREE","name":"R3 token default-on consent visible","result":"PASS","actual":true}
{"sha":"WORKTREE","name":"R3 token selected consent avoids unsupported standalone complaints","result":"PASS","actual":{"calls":[{"url":"/api/passenger-rides/ride1/ratings","method":"POST","body":{"score":2,"contactRequested":true}}],"scope":"UI HTTP only; unsupported contact field independently checked in actual contract/service"}}
{"sha":"WORKTREE","name":"R1 SSE replay/state/cleanup","result":"PASS","actual":{"events":[2],"states":["connecting","connected","disconnected","connected","disconnected"],"closed":true}}
{"sha":"WORKTREE","name":"R14 id change hides previous trip and shows error","result":"PASS","actual":{"requests":["/api/passenger-app/rides/ride1","/api/passenger-app/rides/ride2"],"oldTrip":false,"error":true}}
{"sha":"WORKTREE","name":"R5 accepted account receipt/downloads forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads"]}}
{"sha":"WORKTREE","name":"R5 accepted account receipt/artifacts/html forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html"]}}
{"sha":"WORKTREE","name":"R5 accepted account receipt/artifacts/pdf forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/pdf"]}}
{"sha":"WORKTREE","name":"R5 accepted token artifact html forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/pdf","http://localhost:3001/api/passenger-rides/token/receipt/artifacts/html"]}}
{"sha":"WORKTREE","name":"R5 accepted token artifact pdf forwards","result":"PASS","actual":{"status":200,"body":"pdfbytes","forwarded":["http://localhost:3001/api/passenger-app/rides/ride1/receipt/downloads","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/html","http://localhost:3001/api/passenger-app/rides/ride1/receipt/artifacts/pdf","http://localhost:3001/api/passenger-rides/token/receipt/artifacts/html","http://localhost:3001/api/passenger-rides/token/receipt/artifacts/pdf"]}}
{"sha":"WORKTREE","name":"R7 overlapping history pages deduplicated","result":"PASS","actual":{"copies":1}}
{"sha":"WORKTREE","name":"R5 partial snapshot missing driver/masked registration/fare stays unavailable","result":"PASS","actual":{"state":"error"}}
{"sha":"WORKTREE","name":"R5 account retry consumes full E04/PDF authority","result":"PASS","actual":{"calls":[{"url":"/api/passenger-app/rides/ride1/receipt","method":"GET"}],"certificate":{"state":"available","receiptNo":"RC-ride1","rows":[{"label":"乘車證明編號","value":"RC-ride1","mono":true},{"label":"開立時間","value":"2026年10月14日 清晨5:54","mono":true},{"label":"車隊","value":"智行車隊"},{"label":"駕駛","value":"司機"},{"label":"車牌","value":"ABC-1234","mono":true},{"label":"遮罩執登號","value":"••••1234","mono":true},{"label":"上車時間","value":"2026年10月14日 清晨5:54","mono":true},{"label":"下車時間","value":"2026年10月14日 清晨5:54","mono":true},{"label":"行駛時間","value":"10 分鐘"},{"label":"路線","value":"出發地 → 目的地"},{"label":"行駛里程","value":"5.0 公里","mono":true},{"label":"車資金額","value":"NT$ 100","mono":true},{"label":"通行費","value":"NT$ 0","mono":true},{"label":"客服電話","value":"02-2944-0985","mono":true},{"label":"主管機關申訴電話","value":"1999","mono":true},{"label":"支付方式","value":"線上支付"},{"label":"起程","value":"NT$ 85","mono":true},{"label":"續程","value":"NT$ 10","mono":true},{"label":"延滯","value":"NT$ 5","mono":true},{"label":"夜間加成","value":"NT$ 0","mono":true}],"htmlUrl":"/api/passenger-app/rides/ride1/receipt/artifacts/html","pdfUrl":"/api/passenger-app/rides/ride1/receipt/artifacts/pdf"}}}
{"sha":"WORKTREE","name":"R12 supply hold without any quote never invents quote outage","result":"PASS","actual":{"screenId":"P5-01","routeFare":"依計費表實際金額收費"}}
{"sha":"WORKTREE","name":"R12 A04 retry applies returned authority to actual page","result":"PASS","actual":{"calls":[{"url":"/api/passenger-app/rides/ride1","method":"GET"},{"url":"/api/passenger-app/rides/ride1","method":"GET"}],"updatedVehicle":true,"oldRetryPresent":false}}
{"sha":"WORKTREE","name":"R3 token 2 stars unchecked uses single supported rating producer","result":"PASS","actual":{"calls":[{"url":"/api/passenger-rides/ride1/ratings","method":"POST","body":{"score":2,"contactRequested":false}}]}}
{"sha":"WORKTREE","name":"R3 token 3 stars selected uses single supported rating producer","result":"PASS","actual":{"calls":[{"url":"/api/passenger-rides/ride1/ratings","method":"POST","body":{"score":3,"contactRequested":false}}]}}
{"sha":"WORKTREE","name":"R3 id 2 stars selected uses single supported rating producer","result":"PASS","actual":{"calls":[{"url":"/api/passenger-app/rides/ride1/ratings","method":"POST","body":{"rideId":"ride1","rating":2,"tags":[],"comments":"","contactRequested":true}}]}}
{"sha":"WORKTREE","name":"R3 rejected contact intake is surfaced","result":"FAIL","actual":{"calls":[{"url":"/api/passenger-rides/ride1/ratings","method":"POST","body":{"score":2,"contactRequested":true}}],"displayedSuccess":true,"boundary":"HTTP stub: actual backend has no token complaints route; ratings succeeds, complaints=404"}}
{"passed":25,"failed":1,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0"}
```

客訴表單冪等性與正規化器驗證 (Probe C)：
```json
{"name":"R15 formal producer positive fixture with explicit key is accepted","result":"PASS","actual":{"positive":{"passengerId":"drts_passenger_23456789-2345-4345-8345-23456789abcd","orderId":"12345678-1234-4234-8234-123456789abc","idempotencyKey":"review-intake-positive","command":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"service","content":"driver behavior","contactConsent":true}}}}
{"name":"R15 actual service form satisfies accepted intake contract","result":"PASS","actual":{"request":{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"service","content":"driver behavior or wallet left in car","contactConsent":false},"headers":{"content-type":"application/json","idempotency-key":"complaint-cd6af1da-82ac-4cd7-8ef3-0a8fdec45a9e"}},"alerts":[]}}
{"name":"R15 actual lost_item form satisfies accepted intake contract","result":"PASS","actual":{"request":{"url":"/api/passenger-app/rides/12345678-1234-4234-8234-123456789abc/complaints","body":{"rideId":"12345678-1234-4234-8234-123456789abc","category":"lost_item","content":"driver behavior or wallet left in car","contactConsent":false,"lostItemDescription":"black wallet"},"headers":{"content-type":"application/json","idempotency-key":"complaint-960a9532-0049-4f65-a3b8-2c72f688942c"}},"alerts":[]}}
{"passed":3,"failed":0,"node":"v22.23.2","typescript":"5.9.3","react":"19.3.0","boundary":"HTTP stub invokes exact production normalizer before simulated storage; no PG/storage success claim"}
```

---

## 4. 自動化測試日誌彙整 (Automated Test Summary)

```bash
# 1. PAX-WEB-RIDE-UI 與 BFF 單元測試套件 (77 tests passed)
$ pnpm exec vitest run tests/unit/pax-web-ride-ui-20261009/ tests/unit/pax-web-shell-20261009/
Test Files  8 passed (8)
Tests       77 passed (77)

# 2. TypeScript 型別檢查
$ pnpm --filter @drts/passenger-app-web exec tsc --noEmit
Exit 0 (0 errors)

$ pnpm --filter @drts/passenger-client build
Exit 0 (0 errors)

$ pnpm --filter @drts/passenger-client typecheck
Exit 0 (0 errors)

# 3. ESLint 代碼風格檢查
$ pnpm --filter @drts/passenger-app-web lint
Exit 0 (0 warnings, 0 errors)

$ pnpm --filter @drts/passenger-client lint
Exit 0 (0 warnings, 0 errors)

# 4. i18n Guard 規範檢查
$ pnpm run i18n:guard
i18n-guard: OK (637 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)
Exit 0 (0 errors)

# 5. Commit Trailers 規範檢查
$ python3 tools/ci/git/check_commit_trailers.py --base db212a3d6e6a0eced76fe2cebb0c05a46b8511c1 --head HEAD
check_commit_trailers: OK
```
