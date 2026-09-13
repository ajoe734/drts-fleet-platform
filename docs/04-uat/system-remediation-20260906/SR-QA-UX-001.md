# SR-QA-UX-001 — 全角色響應式／可及性／多語／錯誤恢復驗收

- **Task ID**: `SR-QA-UX-001`
- **Title**: 全角色響應式／可及性／多語／錯誤恢復驗收
- **Status**: `in_progress` -> Ready for Review Handoff
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/sr-qa-ux-001`
- **Base SHA**: `5af9055ec6a0f7ce3ec1b978ede4435dffc769f0` (`origin/dev`)
- **Planning Ref**: [`docs/04-uat/system-remediation-20260906/source/capabilities.json`](file:///home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/source/capabilities.json) (`C117`, `C119`, `C120`, `C121`, `C125`)
- **Audit Findings Ref**: [`docs/04-uat/system-remediation-20260906/source/findings.json`](file:///home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/source/findings.json) (`R05`, `R08`, `R16`, `R22`, `R23`, `R30`)
- **New Gaps Ref**: [`docs/04-uat/system-remediation-20260906/source/new-gaps.json`](file:///home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/source/new-gaps.json) (`N04`, `N08`, `N09`)
- **Dependencies**: `SR-UAT-HARNESS-001`, `SR-ENV-COPY-001`, `SR-ENTERPRISE-FORM-001`, `SR-FLEET-FORM-001`, `SR-OPS-SHELL-001`, `SR-BANK-001`, `SR-ENTERPRISE-DATA-001`, `SR-IAM-001`, `SR-PLACARD-001`, `SR-PROOF-001`

---

## 1. 基準重現與來源追溯

本任務為系統修復波次（System Remediation 2026-09-06）之綜合性跨角色體驗、無障礙可及性、多語系本地化、錯誤分類恢復、冪等防重以及文件檔案實體驗收任務。

任務從目前 `origin/dev`（Base SHA `5af9055ec6a0f7ce3ec1b978ede4435dffc769f0`）出發，所有 10 項前置相依任務均已依序完成並合併至 `origin/dev`。本任務於獨立 task worktree 執行，在不更動既有業務碼（嚴格限定 write_scopes）的前提下，建立可重複執行之測試套件與端到端驗收規範，沿用權威 API 與資料模型，嚴禁以 fixture、固定百分比、假簽章或假送達冒充完成。

### 1.1 追溯能力矩陣 (C117, C119, C120, C121, C125)

| 能力 ID  | 領域           | 角色                   | 能力／應完成工作                     | 歷史觀察／限制與本任務驗收交付                                                                                                                                                                                                                                                       |
| :------- | :------------- | :--------------------- | :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C117** | 品質與營運保障 | 所有寫入者             | 同一請求重送不重複建單／扣款／派車   | 驗證 `IdempotencyService` 與資料庫 V0079/V0081 之唯一約束：缺失 Key (400)、超長 Key (400)、同 Key 相同 Payload 正常 Replay (200, isReplay: true)、同 Key 不同 Payload 衝突拒絕 (409 `IDEMPOTENCY_KEY_REUSED`)、處理中併發衝突 (409 `IDEMPOTENCY_IN_PROGRESS`)，以及不同 Scope 隔離。 |
| **C119** | 品質與營運保障 | 平臺與一線使用者       | 失敗、空清單、過期、429與重試恢復    | 解決 R05（403 請求風暴）、R08（404 BOOKING_NOT_FOUND 誤回服務暫時不穩定）、R16（NaN% / 假 0 誤導統計）。驗證不可重試 (400/403/404, retryable: false) 與暫時故障 (429/500, retryable: true) 之嚴格分類，空狀態 envelope (Q-X15) 區分真實 `zero` 與 `no_record`。                      |
| **C120** | 品質與營運保障 | 鍵盤／讀屏／行動使用者 | 全域可及性、焦點、對比與響應式       | 解決 R22（390px 橫向溢出、鍵盤/錯誤遮蔽 CTA）、R23（暗色 label 對比僅 1.09:1 且缺 id 關聯）。驗證 390px 單欄折疊與 sticky aside 解除、Tab 焦點循環、Enter 提交、Modal 焦點捕捉與關閉返回、WCAG 2.1 AA 對比度 (>= 4.5:1) 與 aria-live 播報。                                          |
| **C121** | 品質與營運保障 | 多語系使用者           | 繁中／英文、一致時間與貨幣格式       | 驗證多 app 字典繁中 (zh-TW) 與英文 (en-US) 鍵值全對齊 (Lockstep)、無缺 key、無工程碼洩漏 (如 `IDEMPOTENCY_*`, `BOOKING_NOT_FOUND`, `editableUntil`)；貨幣標準化為 ISO 4217 TWD (V0084)；時區採用 Asia/Taipei 與一致帳期 YYYY-MM。                                                    |
| **C125** | 品質與營運保障 | 上傳文件使用者／稽核   | 檔案 bytes、掃描、歸屬、到期與真下載 | 解決 N04（帳單 501 ARTIFACT_NOT_MATERIALISED）、N08（牌貼 404 與過期）、N09（匯款證明無實體 bytes/掃描/防竄改）。驗證 `DocumentArtifactStore` 真實二進位存取與 SHA-256、15 分鐘短效簽章驗證、過期拒絕、防毒掃描 (clean vs rejected) 與跨租戶越權阻斷。                               |

### 1.2 歷史缺口與審查問題追溯 (Findings & Gaps)

1. **R05 (403 請求風暴與死循環)**:
   - 歷史現象：平台管理員查閱 Ops Operator 詳情，7 秒內發出 31 個 403 請求，持續輪詢顯示載入中。
   - 驗收交付：`classifyEnterpriseDashboardFetchError` / `classifyHostAccessError` 將 401/403 明確分類為 `auth-required` / `forbidden`，終止輪詢並給出明確下一步。
2. **R08 (404 誤導為服務不穩定)**:
   - 歷史現象：行程詳情查無預約回傳 404 BOOKING_NOT_FOUND，前端卻提示「服務暫時不穩定」。
   - 驗收交付：`classifyEnterpriseBookingFetchError` 嚴格將 404 歸類為 `not-found`，不可作為可重試暫時故障（`degraded`）。
3. **R16 (讀取失敗呈現假 0 / NaN% 誤導統計)**:
   - 歷史現象：銀行連線逾時顯示 NaN%、0% SLA 未達，P5 被拒仍標 100% 保存覆蓋率。
   - 驗收交付：`classifyHostEarningsVariant` 嚴格區分 `no_record`（查無紀錄）、`zero`（真實零業績）與 `reported`（正常回報）；`formatHostMoneyOrNull(null)` 回傳 `null`，前端呈現 `— (pending_policy)`，嚴禁填充假 0 或 NaN。
4. **R22 (行動版 390px 橫向溢出)**:
   - 歷史現象：390px viewport 下首頁寬度 743px、表單 694px，需橫向捲動。
   - 驗收交付：`apps/enterprise-dispatch-web/app/globals.css` 之 `@media (max-width: 768px)` 設定 `flex-direction: column`、`width: 100%`、`max-width: 100vw`、`box-sizing: border-box`，且 `.ent-sticky-aside` 改為 `position: static !important`，確保鍵盤與錯誤提示不遮蔽 CTA。
5. **R23 (暗色文字對比不足與缺欄位關聯)**:
   - 歷史現象：車行表單暗字暗底對比僅約 1.09:1，輸入項無對應 `label` / `id`。
   - 驗收交付：所有表單控制項具備明確 `id` 與 `<label htmlFor={id}>`；配色符合 WCAG 2.1 AA 標準，實測對比度達 14.24:1（遠高於標準 4.5:1）。
6. **N04 (帳單僅有中繼資料而無真實檔案)**:
   - 歷史現象：`generateTenantInvoice` 產生 artifactUrl，但 controlled-download 回傳 501 `ARTIFACT_NOT_MATERIALISED`。
   - 驗收交付：`InMemoryDocumentArtifactStore` 實作真實二進位 PDF bytes 存取，計算真實 SHA-256 與 `byteLength`。
7. **N08 (牌貼無實體檔案且連結過期)**:
   - 歷史現象：牌貼連結於 8/25 過期且 GET 報 404。
   - 驗收交付：提供真列印檔存取、15 分鐘短效 HMAC 簽章換發 (`DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES = 15`)，且 `isPlacardSourceSelectionBlocked` 嚴格禁止選取 `retired` 停用版本。
8. **N09 (匯款證明缺少上傳、防毒掃描與歸屬查驗)**:
   - 歷史現象：PRD 要求上傳證明，頁面僅有文字 proof ID，未驗證檔案與防毒。
   - 驗收交付：`RemittanceProofService` 支援真實 bytes 暫存 (`stageContent`)、防毒掃描狀態機（`pending_scan` -> `clean` / `rejected`）、15 分鐘短效簽章回讀授權 (`requestReadback` / `verifyReadbackGrant`)，非 `clean` 狀態嚴禁標記付款。

---

## 2. 測試分層架構與驗收套件

本任務建立嚴格的分層測試體系，所有測試檔案均位於任務專屬之 write_scopes 內：

### 2.1 單元測試套件（Layer B，5 套件，50 測試，100% 通過）

路徑：`tests/unit/system-remediation/sr-qa-ux-001/`

1. **`c117-idempotency-deduplication.test.ts` (9 tests)**:
   - 驗證缺 Key 且 required: true 時拋 400 `IDEMPOTENCY_KEY_REQUIRED`。
   - 驗證缺 Key 但 required: false 時直通執行且不存儲。
   - 驗證 Key 長度超過 255 字元時拋 400 `IDEMPOTENCY_KEY_TOO_LONG`。
   - 驗證同 Key 同 Payload 重複送出時返回 Replay（`isReplay: true`），不重複執行業務回呼。
   - 驗證同 Key 不同 Payload 衝突時拋 409 `IDEMPOTENCY_KEY_REUSED`（`retryable: false`）。
   - 驗證同 Key 併發處理中時拋 409 `IDEMPOTENCY_IN_PROGRESS`（`retryable: true`）。
   - 驗證不同 Scope 之間相同 Key 不互相干擾（租戶預約 vs 乘客叫車 vs 派車指派）。
   - 驗證資料庫遷移 `V0079__shared_idempotency_records.sql` 與 `V0081__owned_mobility_idempotency.sql` 之 UNIQUE 約束與索引定義。

2. **`c119-error-recovery-classification.test.ts` (11 tests)**:
   - R08：404 `BOOKING_NOT_FOUND` 嚴格分類為 `not-found`，杜絕誤報為 `degraded`。
   - 配額與政策阻擋分類為 `quota-blocked`，無車或調度不可行分類為 `no-supply`。
   - R05：401/403 錯誤嚴格分類為 `auth-required` / `forbidden`，終止無限重試輪詢。
   - R16：`classifyHostEarningsVariant` 區分 `zero`、`reported` 與 `no_record`；`formatHostMoneyOrNull(null)` 返回 null，杜絕假 0 與 NaN。
   - Q-X15：`EmptyStateEnvelope` 完整涵蓋 7 種空狀態原因（`no_data`, `not_provisioned`, `fetch_failed`, `permission_denied`, `external_unavailable`, `driver_not_eligible`, `filtered_empty`）與 `nextAction`。
   - 429 速率限制標註 `retryable: true` 與 `retryAfterSeconds`，而 400/403/404 標註 `retryable: false`。

3. **`c120-accessibility-responsive-focus.test.ts` (9 tests)**:
   - R22：驗證 `apps/enterprise-dispatch-web/app/globals.css` 包含 `@media (max-width: 768px)` 單欄折疊與 `.ent-sticky-aside` static 解除。
   - 評估 390px（單欄無溢出）、768px（平板自適應）、1440px（多欄導航）三級斷點佈局指標。
   - R23：以 WCAG 2.1 相對亮度公式驗證主題配色符合對比度標準（>= 4.5:1），實測亮色 15:1、暗色 14.24:1。
   - 驗證管理表面色調（`MANAGEMENT_SURFACE_TONES`）支援 info/success/warning/danger/neutral。
   - 驗證表單欄位定義具備非空 `id` 與 `label`，且電話/數字欄位宣告對應 `inputMode`。
   - 驗證鍵盤焦點 Tab 循環順序與 Enter 提交行為。
   - 驗證對話框（Modal/Drawer）焦點捕獲（Focus Trap）與關閉後焦點返回（Focus Return）。
   - 驗證螢幕閱讀器狀態通知區分 `aria-live="polite"`（儲存成功）與 `role="alert"` / `assertive`（驗證失敗/斷線）。
   - 驗證極端超長字串防破版機制（省略號截斷與換行限制）。

4. **`c121-multilingual-locale-formatting.test.ts` (10 tests)**:
   - 驗證租戶後台（Tenant Console）、企業派車（Enterprise Dispatch）、銀行工作台（Bank Console）繁中 (zh-TW) 與英文 (en-US) 鍵值完全對齊 (Lockstep)。
   - 驗證關鍵使用者文案無任何未翻譯代碼（如 `IDEMPOTENCY_*`, `BOOKING_NOT_FOUND`, `editableUntil`, `readOnlyReasonCode`, `NaN`, `undefined`, `[object Object]`）。
   - 驗證查無 key 時安全 fallback 而不崩潰。
   - 驗證 V0084 遷移指令將 `NTD` 全面更正為 ISO 4217 標準代碼 `TWD`。
   - 驗證金額格式化支援千分位與 `NT$` 前綴。
   - 驗證帳期符合 `YYYY-MM` 正則，時間戳符合 ISO 8601 標準。
   - 驗證語系切換時介面標題與導航文字即時更新。

5. **`c125-document-artifacts-upload-download.test.ts` (11 tests)**:
   - N04：`InMemoryDocumentArtifactStore` 存儲實體二進位 PDF bytes，計算真實 SHA-256，支援安全讀回。
   - 防禦性複製：緩衝區讀寫均做記憶體複製，避免外部篡改污染存儲。
   - 不支援之文件類型嚴格拒絕；不存在文件返回 `null` 而非虛構資料。
   - N08：`createControlledDownloadMetadata` 產生 15 分鐘 TTL 之 HMAC-SHA256 簽章中繼資料。
   - 時效保護：過期簽章驗證返回 `expired`。
   - 篡改保護：主旨 ID 或雜湊遭修改時返回 `signature_invalid`。
   - 停用版本保護：`isPlacardSourceSelectionBlocked` 阻斷 `status: "retired"` 之牌貼選取。
   - N09：`RemittanceProofService` 支援真實匯款單 bytes 暫存、`pending_scan` 初始狀態、防毒掃描結果記錄（`clean` / `rejected`）。
   - 授權回讀：產生包含 15 分鐘有效期限與 `sig` 簽名之 readbackUrl，並支援驗證。
   - 越權隔離：查無此證明 ID 時拋出 404。

---

### 2.2 Playwright 端到端驗收規格（Layer C）

路徑：`tests/e2e/system-remediation/sr-qa-ux-001/sr-qa-ux-001.spec.ts`

- 整合 `UatNamespaceManager`（Shard 0 / 命名空間隔離）與 `UatEvidenceRecorder`。
- **Fail-Closed 驗證保證**：
  - 呼叫 `generateAuthHeaders(BASELINE_PERSONAS.platform_admin, "live")` 強制拋出 `"Live environment requires authentic credentials/tokens and does not permit synthetic auth headers (fakeheaders)."`，杜絕在正式環境注入偽造標頭。
- **透明揭露 VM 限制**：
  - 使用 `recordLiveLimitation` 明確揭露容器環境下不得啟動 dev server / 瀏覽器 GUI / 真實 ClamAV daemon，確保與主管審查要求一致。
- 完整涵蓋 C117, C119, C120, C121, C125 契約呼叫記錄，包含 HTTP 狀態碼、耗時、資源 ID 關聯與清理機制。

---

## 3. 實作驗證紀錄

本任務於獨立 task worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-qa-ux-001` 執行，Base SHA 為 `5af9055ec6a0f7ce3ec1b978ede4435dffc769f0`。

### 3.1 驗證指令與執行結果

| 檢查項目                  | 執行指令                                                                                                                 | Exit Code  | 實際結果摘要                                                                                                          |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------- | :--------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Git Diff 乾淨度**       | `git diff --check`                                                                                                       | `0`        | 無任何未清理空白、衝突標記或格式錯誤。                                                                                |
| **ESLint 靜態分析**       | `pnpm exec eslint tests/unit/system-remediation/sr-qa-ux-001 tests/e2e/system-remediation/sr-qa-ux-001 --max-warnings=0` | `0`        | 0 errors, 0 warnings。                                                                                                |
| **Prettier 代碼風格**     | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-ux-001 tests/e2e/system-remediation/sr-qa-ux-001`        | `0`        | All matched files use Prettier code style!                                                                            |
| **TypeScript 型別檢查**   | `tsc -p tsconfig.json --noEmit` (針對 write_scopes 驗收單元測試)                                                         | `0`        | 5 個測試檔案原先 9 處型別錯誤全數修復完畢，0 錯誤。                                                                   |
| **多語系檢查保護**        | `node tools/ci/i18n-guard.mjs`                                                                                           | `0`        | i18n-guard: OK (560 files scanned across 10 apps, 55 baseline exemptions)。                                           |
| **C117 冪等驗收**         | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-ux-001/c117-idempotency-deduplication.test.ts`                 | `0`        | 9 passed (32ms)。                                                                                                     |
| **C119 錯誤恢復驗收**     | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-ux-001/c119-error-recovery-classification.test.ts`             | `0`        | 11 passed (16ms)。                                                                                                    |
| **C120 可及性與響應式**   | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-ux-001/c120-accessibility-responsive-focus.test.ts`            | `0`        | 9 passed (14ms)。                                                                                                     |
| **C121 多語與格式一致**   | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-ux-001/c121-multilingual-locale-formatting.test.ts`            | `0`        | 10 passed (32ms)。                                                                                                    |
| **C125 文件二進位與下載** | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts`        | `0`        | 11 passed (16ms)。                                                                                                    |
| **全套件單元測試集合**    | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-ux-001/`                                                       | `0`        | **5 files, 50 passed (50 tests)**，總執行耗時 1.53 秒。                                                               |
| **Playwright E2E 規格**   | `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-ux-001`                                      | **未執行** | VM 限制：不得於本機啟動 dev server 或 Playwright 瀏覽器；規格已遵循 UatEvidenceRecorder 撰寫並包含 fail-closed 驗證。 |

---

## 4. 檢查中發現、限制與透明揭露

1. **VM 限制透明揭露 (VM Restriction)**:
   - 依 supervisor 與容器環境政策，禁止在目前 VM 啟動 `pnpm dev`、`playwright test` 或 `docker compose`。因此 Playwright E2E 測試未啟動真實 Chromium 瀏覽器，而是在 E2E 規格中透過 `recordLiveLimitation` 如實記錄受限項目。
   - 所有實體業務邏輯、響應式斷點樣式規則、無障礙對比度與標籤關聯、防毒掃描狀態機與真實檔案二進位儲存均由 Layer B 的 50 項 Vitest 測試進行真值驗證。
2. **PostgreSQL 資料庫遷移約束**:
   - 冪等性與貨幣標準化之資料庫層行為透過驗證 `infra/migrations/V0079__shared_idempotency_records.sql`、`infra/migrations/V0081__owned_mobility_idempotency.sql` 與 `infra/migrations/V0084__standardise_currency_code_twd.sql` 之 DDL 語法與約束存在性進行，符合單元測試環境無 PostgreSQL 實例之要求。
3. **無寫入範圍溢出 (Zero Out-of-Scope Mutations)**:
   - 本任務嚴格遵守 `write_scopes` 限制，僅建立 `tests/unit/system-remediation/sr-qa-ux-001/`、`tests/e2e/system-remediation/sr-qa-ux-001/` 與本驗收文件 `docs/04-uat/system-remediation-20260906/SR-QA-UX-001.md`，未修改任何共用配置、中央 router、lockfile 或產品業務碼。

---

## 5. 驗收結論

- **狀態**: 實作與可重跑測試均已完成，驗收證據齊全。
- **Candidate 準備**: 待提交 anchor commit 並進行普通 non-force push，隨後呼叫 `ai-status.sh handoff SR-QA-UX-001 Gemini2` 移交獨立審查人。
- **後續結案**: 由 `Gemini2` 進行獨立 Review 與同 candidate CI / merge 後自動推導至 `done`。
