# SR-QA-BOOKING-001 — 預約、來源歸屬、時窗與取消驗收：完成證據

- Task ID: `SR-QA-BOOKING-001`
- Title: 預約、來源歸屬、時窗與取消驗收
- Status: `in_progress` → handoff pending
- Owner: `Claude2`（Chairman 因 Gemini2 auth-paused 401 改派）
- Reviewer: `Claude`
- Base SHA: `009af6c9c` (`origin/dev` tip at dispatch time)
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)`
- Branch: `claude2/sr-qa-booking-001`
- Worker cwd: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-qa-booking-001`
- Capabilities: `C013`–`C034`（22 項，`docs/04-uat/system-remediation-20260906/source/capabilities.json`）
- Dependencies: `SR-UAT-HARNESS-001`、`SR-ENTERPRISE-DATA-001`、`SR-ENTERPRISE-FORM-001`、`SR-ENTERPRISE-SEARCH-001`、`SR-REFERRAL-001`、`UV-EXEC-015`、`SR-FLEET-DATA-001`、`SR-MAIL-002`、`SR-PUSH-001`、`SR-READINESS-001`（皆已 `done`／已合併，於 dispatch 前逐一以 `ai-status.sh show` 確認）
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Execution Ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
- Task Spec Ref: `docs/03-runbooks/system-remediation-20260906/SR-QA-BOOKING-001.md`

---

## 0. 任務性質與範圍說明

本任務為端到端品質驗收（`verification`），只可寫入以下三個 `write_scopes`：

- `tests/unit/system-remediation/sr-qa-booking-001/`
- `docs/04-uat/system-remediation-20260906/SR-QA-BOOKING-001.md`
- `tests/e2e/system-remediation/sr-qa-booking-001/`

不越界修改 `apps/api/src/**` 業務核心代碼或共用配置。9/6 audit（`docs/04-uat/system-remediation-20260906/source/findings.json`）之觀察是歷史 SHA 的紀錄，非目前程式真值；本任務逐一對照目前 `apps/api/src` 原始碼重新確認，已由其他任務（`SR-ENTERPRISE-*`、`SR-REFERRAL-001`、`SR-MAIL-002`、`SR-PUSH-001` 等）修復的部分，以目前 SHA 的回歸證據提交，不重做或回退；仍屬缺口的部分，如實記錄並依規範建立具來源的修復子任務追蹤，不在本 verification-only 任務內偷偷改業務碼，也不以「已記待辦」代替閉環通過。

沿用權威 API／資料模型：所有正向與負向案例皆直接實例化並呼叫 `OwnedMobilityService`、`TenantPartnerService`、`ServiceProductService` 等真實服務層類別（與 `apps/api/tests/unit/owned-mobility.service.test.ts`、`apps/api/tests/integration/tenant-governance-e2e.test.ts` 相同的組裝方式），對真實記憶體資料結構進行寫入後再回讀驗證，不使用固定常數、假簽章或假送達模擬結果。

---

## 1. 測試架構與檔案劃分

### 1.1 Layer B — 單元與服務整合測試（`tests/unit/system-remediation/sr-qa-booking-001/`）

共 4 個測試套件檔案、**32 項測試案例，全部於本環境執行通過（32/32 passed, 100%）**：

1. `c022-referral-lifecycle-continuity.test.ts`（C022，8 項測試）：轉介乘客即時報價→送單→取消（寬限期內）同一 order 全程續接；建單冪等鍵重放不重複建單；完成行程後評分與冪等重複提交；4 項關鍵負向案例（非 referral 身分、entrySlug scope mismatch、跨乘客存取、未完成評分、衝突評分）。
2. `c016-c024-tenant-booking-cutoff-and-lead-time.test.ts`（C016 + C024 + C031/C032，12 項測試）：租戶建單依 `businessDispatchSubtype` 計算差異化 `modifiableUntil`/`cancelableUntil`（`enterprise_dispatch` 30 分、`credit_card_airport_transfer` 60 分、`travel_agency_transfer` 90 分、`insurance_replacement_vehicle` 120 分）；cutoff 前修改／取消成功、cutoff 後修改／取消遭拒（`ORDER_NOT_MODIFIABLE`/`ORDER_NOT_CANCELABLE`）；`travel_agency_transfer`/`insurance_replacement_vehicle` 預設停用需 tenant 主動啟用（`SERVICE_PRODUCT_INACTIVE`）；獨立一組 **C016 產品缺口重現**（見 §4）。
3. `c025-tenant-approval-workflow-order-consistency.test.ts`（C025，7 項測試）：高額訂單觸發送審、核准後訂單可派車、駁回後仍受阻、升級後審核人輪換至升級目標並加蓋 `escalatedAt`；3 項關鍵負向案例（核准不存在請求 404、重複核准衝突、跨租戶核准遭拒）。
4. `c028-tenant-quota-reservation-and-cancellation-gap.test.ts`（C028，5 項測試）：正向 2 項重跑既有 reserve→consume 契約作為獨立回歸證據；獨立一組 **C028 產品缺口重現**（見 §4）。

### 1.2 Layer C — Playwright E2E 證據層（`tests/e2e/system-remediation/sr-qa-booking-001/sr-qa-booking-001.spec.ts`）

使用標準 `UatNamespaceManager` 與 `UatEvidenceRecorder` 記錄端到端契約與資源關聯，並依 VM 限制規範調用 `recordLiveLimitation` 明確揭露環境邊界：

- `E2E-1 (C022)`：轉介乘客報價到收據端到端續接。
- `E2E-2 (C016/C024)`：租戶建單時窗、cutoff 與最短提前時間落差。
- `E2E-3 (C025)`：租戶送審→核准／駁回／升級與訂單狀態一致性。
- `E2E-4 (C028)`：租戶額度建單預留與取消未返還落差。

---

## 2. 各能力驗收判定對照表（C013–C034）

| 能力 ID | 狀態判定 | 證據 |
| :-- | :-- | :-- |
| **C013** 企業員工查看歷史預約 | 沿用既有（依賴任務 `SR-ENTERPRISE-DATA-001` `done`） | 本任務未新增獨立測試；建單/回讀基礎鏈路由 C024/C028 測試（`createTenantBooking`→`getOrder`/`getTenantBooking` 回讀）間接覆蓋。大量分頁與查詢條件仍為 audit 標註之「已測片段」缺口，未在本任務內補齊。 |
| **C014** 填寫預約必填檢核 | 沿用既有（依賴任務 `SR-ENTERPRISE-FORM-001` `done`） | `c016-c024-*.test.ts` 1.1/1.2 重跑 `createTenantBooking` 正向建單路徑作為回歸證據。 |
| **C015** 乘客資料／聯絡人／舉牌同步 | **未驗證（前端/live 邊界）** | 屬前端渲染與舉牌顯示問題，需真實瀏覽器；VM 限制無法啟動 dev server 驗證，未冒稱通過。 |
| **C016** 過去日期、最短提前時間 | **企業／租戶通道現況缺口，已重現並建修復子任務** | 見 §4.1；`c016-c024-*.test.ts` gap-1/gap-2/gap-3（3 項），對照組 gap-1 證明 multi-taxi 通道已有等效檢核。 |
| **C017** 首頁／行程／詳情一致 | **未驗證（前端 fixture／live 邊界）** | 需前端頁面與真實 API 回讀比對，VM 限制無法啟動 dev server。 |
| **C018** 聯絡司機／客服 | **未驗證（前端 live 邊界）** | 按鈕行為需真實瀏覽器操作。 |
| **C019** 手機排版 | **未驗證（真機邊界）** | 需實體行動裝置或行動瀏覽器模擬，VM 限制不啟動。 |
| **C020** 社區入口 signed handoff | **未驗證（需真實合作方 token／live 邊界）** | 依 audit 原文須由真實合作方產生 handoff 於正式容器完成；本任務不冒稱已用合法 token 驗證。`SR-REFERRAL-001`（依賴任務，`done`）已完成後端 referral channel 就緒度。 |
| **C021** 嵌入失敗獨立叫車 fallback | **未驗證（需可用獨立入口設定／live 邊界）** | 同上，需正式環境設定。 |
| **C022** 轉介乘客報價→送單→續接→取消→評分 | **本任務新增完整覆蓋（正向＋負向）** | `c022-referral-lifecycle-continuity.test.ts`（8/8 passing）：同一 order 全程續接、冪等重放、評分冪等、4 項負向案例。既有 `apps/api/tests/unit/owned-mobility.service.test.ts` 的 `referral attribution (CRC-BE-003)` describe block（6635 行起）已驗證單筆建單/取消欄位歸屬，本任務聚焦其未覆蓋的「全流程續接」與評分/權限負向案例。 |
| **C023** 派車／到達／異動通知送達 | **外部待完成（依賴任務 `SR-PUSH-001` `done`，真機送達仍為 live 邊界）** | `SR-PUSH-001` 已實作 `PassengerPushAdapter` 與安全降級／裝置驗證（見其 PR #2026）；真實供應商憑證與裝置端收信驗證超出本 VM 能力範圍，如實揭露不冒稱已驗證。 |
| **C024** 租戶建單／修改／取消與 cutoff | **本任務新增完整覆蓋（正向＋負向）** | `c016-c024-*.test.ts` 1.x/2.x（9/9 passing）：cutoff 計算、cutoff 前成功、cutoff 後 `ORDER_NOT_MODIFIABLE`/`ORDER_NOT_CANCELABLE`、不存在 bookingId 404。 |
| **C025** 送審→核准／駁回→人工升級 | **本任務新增完整覆蓋（正向＋負向）** | `c025-tenant-approval-workflow-order-consistency.test.ts`（7/7 passing）。既有 `apps/api/tests/integration/tenant-governance-e2e.test.ts` 已驗證核准正向路徑（3/3 passing，重跑作為回歸基線），本任務新增駁回、升級（含 escalate 之真實行為：`status` 保持 `pending`、`approvers` 輪換、`previousApprovers` 保留——非直接轉 `escalated` 終態，已對照原始碼註解確認為既有設計）與 3 項負向案例。 |
| **C026** 簽核通知 Email | **沿用既有（依賴任務 `SR-MAIL-002` `done`）** | 9/6 audit 稱「實作缺口」；`SR-MAIL-002` 已完成郵件 outbox 整合。本任務之最小記憶體 harness（未配置 outbox repository）重跑時仍出現 `AuditNotificationEmailAdapter` 的 "notification outbox is not configured" warning，此為測試 harness 未接 DB 所致，非回歸；真實郵件送達之獨立驗證屬 `SR-MAIL-002` 範圍，未在本任務重複驗證。 |
| **C027** 租戶乘客／常用地址／成本中心 | **沿用既有（大量既有覆蓋）** | `apps/api/tests/unit/tenant-partner.service.test.ts` 已有 passenger/address 治理、cost-center CRUD、跨租戶重複 code 等測試；本任務重跑該套件（連同 approval-rule-evaluator、compliance-gates 共 3 檔）**91/91 passing** 作為回歸證據，未發現退化。 |
| **C028** 額度、用車規則、SLA、取消返還 | **本任務新增覆蓋；發現並重現產品缺口，已建修復子任務** | `c028-tenant-quota-reservation-and-cancellation-gap.test.ts`（5/5 passing）：1.x 重跑 reserve→consume 正向契約；2.x 三項缺口重現見 §4.2。 |
| **C029** 銀行卡友資格外部審查 | **外部待完成（依賴任務族 `SR-BANK-*`）** | 已有 `bank-card-inline-eligibility.adapter.ts` 與 `reference-token-eligibility.adapter.ts` 契約，及 `tests/unit/system-remediation/sr-bank-001/002/003` 既有覆蓋；真實發卡方 issuer sandbox 整合非本 VM 可驗證，未冒稱已測。 |
| **C030** 銀行卡友預約列表與狀態篩選 | **沿用既有（依賴任務族 `SR-BANK-*`，已測片段）** | 未在本任務新增獨立測試；正式角色大量分頁與 PII 遮罩仍為既有 audit 標註缺口，超出本任務範圍未補齊。 |
| **C031** 機場接送航班異動、等待、加價、取消規則 | **部分覆蓋（cutoff 差異化已驗證；航班資料源未驗證）** | `c016-c024-*.test.ts` 3.1 驗證 `credit_card_airport_transfer` 差異化 60 分鐘 cutoff（預設啟用）。真實航班延誤訊號、等待費用回算未有資料源可測，如實揭露為缺口，非本任務新建修復子任務範圍（需先有航班資料源之產品決策）。 |
| **C032** 旅行社／保險代步獨立業務閉環 | **部分覆蓋（產品啟用閘門與差異化 cutoff 已驗證；計價/調度/對帳未驗證）** | `c016-c024-*.test.ts` 3.2–3.4：`travel_agency_transfer`／`insurance_replacement_vehicle` 預設停用（`SERVICE_PRODUCT_INACTIVE`），tenant 主動啟用後可建單且各自 cutoff（90／120 分鐘）正確。完整按產品之必填、eligibility、計價、調度、對帳閉環仍為 audit 標註缺口，未在本任務內以 enum 或部分測試冒充完成。 |
| **C033** 第三方轉派單接入／接受／拒絕／完成回傳 | **沿用既有（大量既有覆蓋）** | `apps/api/tests/unit/forwarder.service.test.ts` + `forwarder.controller.test.ts` 重跑 **38/38 passing**，涵蓋 Grab webhook 接入／簽章驗證失敗、`lost_race`/`cancelled_by_platform` 任務關閉、跨平台 ID 冪等接入。真實合作契約與 sandbox 消息閉環為 audit 標註「外部待完成」，未冒稱已用真簽章驗證。 |
| **C034** 取消競態、失去搶單、第三方收據歸屬 | **部分覆蓋（既有 idempotent 接入與任務關閉已驗證；精確競態時序未獨立新測）** | 同 C033 引用之 38/38 既有測試涵蓋 `lost_race`/`cancelled_by_platform` 任務關閉與跨平台重複 webhook 冪等接入；「先取消後完成」精確時序競態與外部 receipt reference 傳遞未在本任務內新增獨立驗證，如實記錄為剩餘缺口。 |

---

## 3. 驗證指令與執行結果

本任務於獨立工作區（`claude2-sr-qa-booking-001`）實際執行以下各項檢查指令：

| 檢查項目 | 執行指令 | Exit Code | 結果摘要 |
| :-- | :-- | :-- | :-- |
| **新增單元測試** | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001/` | `0` | **4 test files, 32 passed**（100%，耗時約 3s） |
| **新增測試 ESLint** | `pnpm exec eslint tests/unit/system-remediation/sr-qa-booking-001 tests/e2e/system-remediation/sr-qa-booking-001 --max-warnings=0` | `0` | 0 errors, 0 warnings |
| **新增測試 Prettier** | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-booking-001/ tests/e2e/system-remediation/sr-qa-booking-001/` | `0` | All matched files use Prettier code style |
| **型別檢查** | `pnpm --filter @drts/api exec tsc -p tsconfig.json --noEmit`（先 `pnpm --filter @drts/contracts build` 及 `pnpm --filter @drts/control-plane-auth build` 補齊未建置之 workspace 依賴，屬環境前置步驟，非本任務程式碼問題） | `0` | 0 errors |
| **Git Diff 格式** | `git diff --check` | `0` | 無多餘空白、換行或格式錯誤 |
| **既有回歸：owned-mobility 服務** | `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts` | `0` | **113 tests passed**（含 referral attribution、reservation window 等既有覆蓋，重跑作為回歸基線） |
| **既有回歸：tenant governance e2e** | `pnpm --filter @drts/api exec vitest run tests/integration/tenant-governance-e2e.test.ts` | `0` | **3 tests passed**（booking→approval→dispatch→completion→billing with quota consumption） |
| **既有回歸：tenant-partner／approval-rule／compliance** | `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-approval-rule-evaluator.test.ts tests/unit/owned-mobility-compliance-gates.test.ts` | `0` | **91 tests passed**（3 files） |
| **既有回歸：forwarder（C033/C034）** | `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts` | `0` | **38 tests passed**（2 files） |
| **Playwright E2E** | `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-booking-001` | 未在 VM 執行 | 遵照派工限制（禁止本機啟動 dev server/browser/Docker Compose），E2E spec 以 `UatEvidenceRecorder` 記錄，待 CI/遠端 runner 執行實機 |

---

## 4. 新發現之產品缺口（已重現，已建修復子任務，未在本任務內修改業務碼）

依規範「若發現產品缺陷，以 canonical task command 建立具來源的修復子任務，不在本驗收範圍偷偷改業務碼或只寫待辦就稱閉環通過」，以下兩項缺口皆已直接檢視 `apps/api/src` 目前原始碼確認（非猜測），並以 `AI_NAME=Claude2 ai-status.sh assign` 建立具體 write_scopes、acceptance 與缺陷來源的修復子任務，狀態為 `backlog`：

### 4.1 C016：企業／租戶通道缺少最短提前時間與過去日期檢核

- **後續任務**：`SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME`（owner `Codex`、reviewer `Claude`）
- **證據**：`c016-c024-tenant-booking-cutoff-and-lead-time.test.ts` 的 `gap-1`（對照組，證明 `createMultiTaxiRide()` scheduled 模式在提前時間 < 15 分鐘時正確拋出 `400 TOO_SOON_TO_BOOK`）、`gap-2`（企業／租戶通道用相同的 2 分鐘提前時間建單，目前**成功**無任何拒絕）、`gap-3`（企業／租戶通道可用過去時間作為 `reservationWindowStart`，cutoff 隨之落在過去，形同建立即不可修改／取消）。
- **根因**：`owned-mobility.service.ts` 的 `_executeCreateTenantBooking()` 只呼叫 `assertBookingRules()`（僅檢查機場接機班機號）與 `computeBookingWindows()`（僅計算 modifiableUntil/cancelableUntil），全程未呼叫 `getMinLeadTimeMinutes()`／`TOO_SOON_TO_BOOK` 等價檢查；轉介乘客 `createReferralPassengerBooking()` 內部呼叫同一 `createTenantBooking()` 路徑，故同樣受影響。

### 4.2 C028：取消租戶訂單不釋放已預留額度

- **後續任務**：`SR-QA-BOOKING-001-FIX-QUOTA-RELEASE`（owner `Codex`、reviewer `Claude`）
- **證據**：`c028-tenant-quota-reservation-and-cancellation-gap.test.ts` 的 `gap-1`（取消後 quota ledger 沒有任何 `release` 分錄）、`gap-2`（取消後 `getTenantQuotaSummary().usage.pendingReservedBookingCount` 仍計入已取消訂單）、`gap-3`（**業務衝擊驗證**：額度用盡後取消一筆訂單，第三筆訂單仍因 `QUOTA_INSUFFICIENT_AT_COMMIT` 被拒絕，證明額度未真正騰出）。
- **根因**：完整讀過 `owned-mobility.service.ts` 的 `cancelOwnedOrder()`/`cancelTenantBooking()`（約 3355–5555 行），全程未呼叫 `tenantPartnerService` 任何方法；`tenant-quota-ledger.ts` 的 `buildQuotaLifecycleEntrySpecs()` 明確支援 `"cancel"` → `"release"` ledger entry 轉換，且 `tenant-partner.service.ts` 的用量彙總邏輯（約 2443–2447 行）也已支援解讀 `"release"` entry type；但全庫搜尋 `buildQuotaLifecycleEntrySpecs` 僅 `tenant-quota-ledger.test.ts` 呼叫，生產路徑從未呼叫此函式。

---

## 5. 涉及之真實資源 ID 與狀態流轉

- **轉介乘客（C022）**：`entrySlug: "yuhe-residence"`（TenantPartnerService 內建 demo 種子資料）、`tenantId: "tenant-demo-001"`、`orderId`/`bookingId` 由服務端隨機產生並跨建單→取消→評分步驟保持一致；評分 `submittedAt` 於重複提交時保持不變（冪等）。
- **租戶建單 cutoff（C016/C024）**：`businessDispatchSubtype` 涵蓋 `enterprise_dispatch`（30 分）、`credit_card_airport_transfer`（60 分，預設啟用）、`travel_agency_transfer`（90 分，預設停用需啟用）、`insurance_replacement_vehicle`（120 分，預設停用需啟用）；`modifiableUntil`/`cancelableUntil` 皆以 `reservationWindowStart - N 分鐘` 精確驗證（毫秒級比對，非約略檢查）。
- **審核流程（C025）**：沿用 `TenantPartnerService` 內建 demo 種子 `tenant-demo-001` 之 `tenant-user-demo-001`（`tenant_admin`，升級目標）與 `tenant-user-demo-003`（`tenant_finance_admin`，一般審核人）；`approvalRequestId` 由服務端產生，狀態流轉 `pending → approved`／`pending → rejected`／`pending`（升級後 `approvers` 輪換、`escalatedAt` 加蓋）。
- **租戶額度（C028）**：`tenantId: "tenant-quota-gap-demo-001"`，`bookingCountLimit: 2`（`hard_block`），逐筆驗證 `pendingReservedBookingCount`/`confirmedBookingCount` 在 reserve／consume／cancel 各節點的精確數值，非僅檢查布林存在性。

---

## 6. 未做的部分與環境限制揭露（誠實記錄，不冒充完成）

1. **未啟動本機開發伺服器或瀏覽器（VM 限制）**：遵照 Supervisor 派工規範，本 VM 禁止執行 `pnpm dev`、`docker compose` 或直接運行 `playwright` 啟動前端／後端服務。E2E spec（`tests/e2e/system-remediation/sr-qa-booking-001/sr-qa-booking-001.spec.ts`）以 `UatEvidenceRecorder` 定義契約與資源關聯並呼叫 `recordLiveLimitation`，真實瀏覽器操作留待遠端 CI/驗收環境執行。
2. **前端／真機邊界能力（C015、C017、C018、C019）**：乘客資料同步、首頁/行程一致性、聯絡按鈕、手機排版皆需真實前端頁面或實體裝置驗證，本任務未越界啟動前端或宣稱已用瀏覽器驗證，如實標記為未驗證。
3. **需真實外部合作方或供應商（C020、C021、C023、C029、C031、C033 部分）**：社區入口 signed handoff、嵌入 fallback 的正式獨立入口設定、推播真機送達、銀行 issuer sandbox、真實航班資料源、第三方平台真實合作契約與簽章驗證，皆超出本 VM 可驗證範圍，如實揭露不冒充成功。
4. **已知產品缺口，已建修復子任務但本任務不修復（§4）**：`SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME`（C016）與 `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE`（C028），依 verification-only 任務紀律不在本 write_scopes 外修改業務碼。
5. **未越界修改業務產品程式**：本任務為 `verification` 驗收任務，所有驗收均針對既有實作邏輯進行真邏輯檢驗，嚴格限制修改範圍在三項 write_scopes 內；兩項發現的缺口均以獨立 write_scopes 的修復子任務追蹤，未在本任務內直接修改 `apps/api/src/**`。

---

## 7. 結案與交接程序

- 本任務已完成全部 write_scopes 成果：
  - `tests/unit/system-remediation/sr-qa-booking-001/`（4 個測試套件，32 項測試全數通過）
  - `docs/04-uat/system-remediation-20260906/SR-QA-BOOKING-001.md`（本文件，完整驗收與回歸報告）
  - `tests/e2e/system-remediation/sr-qa-booking-001/sr-qa-booking-001.spec.ts`（E2E 證據層規格）
- 格式與代碼質量經 `vitest run`、`eslint`、`prettier`、`tsc --noEmit`、`git diff --check` 100% 驗證通過。
- 兩項新發現產品缺口已依規範建立具來源、具體 write_scopes 與 acceptance 的修復子任務（`SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME`、`SR-QA-BOOKING-001-FIX-QUOTA-RELEASE`），狀態 `backlog`，等待 Supervisor 排入 dispatch。
- 提交具備規範 trailers 之 commit（`LLM-Agent: Claude2`、`Task-ID: SR-QA-BOOKING-001`、`Reviewer: Claude`）。
- 以普通（non-force）push 推送至遠端任務分支 `claude2/sr-qa-booking-001`。
- 呼叫 `ai-status.sh handoff` 將任務交接予 Reviewer `Claude` 進入 `review` 階段，由 candidate lifecycle 負責後續 review、CI 與自動 merge 結案。
