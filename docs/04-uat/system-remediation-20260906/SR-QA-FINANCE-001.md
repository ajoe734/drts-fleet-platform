# SR-QA-FINANCE-001 — 金流／帳單／司機／通路結算一致驗收：完成證據報告

| 欄位             | 內容                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Task ID          | `SR-QA-FINANCE-001`                                                                                  |
| Task Spec        | `docs/03-runbooks/system-remediation-20260906/SR-QA-FINANCE-001.md`                                  |
| 任務名稱         | 金流／帳單／司機／通路結算一致驗收                                                                   |
| 工作類型 / 優先級 | verification / P1                                                                                    |
| Owner / Reviewer | `Gemini` / `Gemini2`                                                                                 |
| Base SHA         | `efaa9ff6efbf6ae76d7450a257e8ea38071ba40a` (Clean fast-forward to `origin/dev` after PR #1995)       |
| Candidate SHA    | 於 commit & push 後記錄於本報告與 handoff 指令                                                       |
| 分支 / Worktree  | `gemini/sr-qa-finance-001` / `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-qa-finance-001` |
| 前置依賴任務     | `SR-UAT-HARNESS-001`, `SR-FLEET-SETTLE-001`, `SR-BANK-003`, `SR-CHANNEL-001`, `SR-BANK-001`, `SR-MAIL-002` (皆已合併至 `origin/dev`) |
| 負責驗收能力 (16) | `C068`, `C074`, `C075`, `C076`, `C077`, `C078`, `C079`, `C080`, `C081`, `C082`, `C083`, `C084`, `C085`, `C086`, `C087`, `C088` |

---

## 1. 驗收背景與基線對齊

### 1.1 任務目標與範疇
本任務為金流、帳單、司機、車行及通路分潤之端到端整合驗收（Verification），涵蓋財務與結算引擎共 16 項核心能力：
- 車行對帳單明細、空狀態、跨車行資料隔離與 R13 橫幅矛盾修復驗收（`C068`）。
- 調帳 Issue 狀態機生命週期、Forwarder 外部平臺同步異常自動衍生 Issue（`C074`）。
- 乘客電子支付補收狀態機、權威宣告（`billing:write`）、冪等保護與無資料庫時誠實 Fail-Closed（`C075`）。
- 司機費率方案發布、不可變快照（409 `FEE_PLAN_IMMUTABLE`）與月結歷史隔離（`C076`）。
- 租戶帳務資訊設定、格式檢驗與真實回讀（`C077`）。
- 關帳週期檢驗（未關帳拒絕 400）、租戶範圍檢查與發票金額計算（`C078`）。
- 發票二進位真實 PDF 生成（`%PDF-` / `%%EOF`）、HMAC-SHA256 簽名受控下載 URL 與審計通知（`C079`）。
- 駕駛補貼撥款批次建立、雙人覆核機制（`pending` -> `approved`）（`C080`）。
- 匯款憑證上傳、駕駛歸屬檢查（非本人 403）、安全掃描 Fail-Closed（`pending_scan` 拒付 409）與付款收據回讀（`C081`）。
- 銀行對帳單資料與 CSV 行程總額一致性（`C082`）。
- 銀行報表真實 SHA-256 摘要與 RSASSA-PKCS1-v1_5-SHA256 數位簽章防偽驗證、竄改即時回報 `TAMPERED`（`C083`）。
- 對帳期間邊界、Asia/Taipei（UTC+8）時區一致性（`C084`）。
- 銀行主控台首頁快照、合約資料 SSR 穩定性與 Persona 角色邊界（`C085`）。
- 通路轉介分潤（15%）、GMV 與活躍搭乘者計算、動態規則解析、未註冊通路拒絕與結算方向 `drts_pays_partner`（`C086`）。
- 通路 Portal 儀表板整合、權威結算報表與總覽 CSV 匯出端點篩選條件綁定（`C087`）。
- 多方分攤總額守恆（企業行程、贊助卡友行程、轉介通路分潤）、取消/退款衝正對稱性、清算矩陣五大通路權威邊界與零孤兒差額（`C088`）。

### 1.2 9/6 審計與當前真值對齊
- 9/6 審計觀察（`findings.json`、`capabilities.json`）記錄了歷史缺陷（如 R13 橫幅「請確認對帳單」與「尚無對帳單」同時顯示、R14 假簽章固定 hex 摘要等）。
- 本任務確認前置任務 `SR-FLEET-SETTLE-001`（PR #1995）、`SR-BANK-003`、`SR-CHANNEL-001` 等已依 canonical contract 修正缺陷並合併至 `origin/dev`。
- 本任務自最新 `origin/dev`（SHA: `efaa9ff6efbf6ae76d7450a257e8ea38071ba40a`）建立獨立驗收套件，如實檢驗現有業務模組與合約行為，不重寫程式碼、不假冒成功。

---

## 2. 驗收套件清單與結構

本任務嚴格於授權之 `write_scopes` 內建立測試與報告，未更動任何共用配置或中央業務邏輯：
1. `tests/unit/system-remediation/sr-qa-finance-001/`：共 8 組單元測試套件，涵蓋 16 項能力正常路徑、邊界異常與負向防禦（共 50 項測試案例，100% 通過）。
2. `tests/e2e/system-remediation/sr-qa-finance-001/`：共 1 組端到端 Playwright 證據規格，透過 `UatNamespaceManager` 與 `UatEvidenceRecorder` 記錄執行痕跡、HTTP 請求、SHA 摘要與未實作限制。
3. `docs/04-uat/system-remediation-20260906/SR-QA-FINANCE-001.md`：本完成證據報告。

### 檔案清單
| 檔案路徑 | 涵蓋能力 | 測試案例數 | 結果 |
| -------- | -------- | ---------- | ---- |
| `tests/unit/system-remediation/sr-qa-finance-001/c068-fleet-settlement.test.ts` | C068 | 7 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c074-c075-reconciliation-payment-recovery.test.ts` | C074, C075 | 8 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts` | C076 | 4 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts` | C077, C078, C079 | 6 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c080-c081-reimbursement-remittance-proof.test.ts` | C080, C081 | 6 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c082-c083-c084-c085-bank-console-finance.test.ts` | C082, C083, C084, C085 | 7 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c086-c087-channel-settlement-overview.test.ts` | C086, C087 | 5 | ✅ Passed |
| `tests/unit/system-remediation/sr-qa-finance-001/c088-settlement-conservation-reversal.test.ts` | C088 | 7 | ✅ Passed |
| `tests/e2e/system-remediation/sr-qa-finance-001/sr-qa-finance-001.spec.ts` | C068, C074-C088 | 1 | ✅ Passed |

---

## 3. 16 項能力驗收結果逐項對照

### 3.1 C068: 車行對帳明細與 R13 橫幅狀態
- **驗證項目**：
  1. `resolveStatementBannerState` 於 `currentStatement === null` 時回傳 `"no_statement"`，不再同時顯示確認橫幅。
  2. `currentStatement.status === "pending"` 時顯示 `"pending"`，為 `"paid"` 時顯示 `"paid"`。
  3. `loadStatementDetail` 正確加載行程明細（金額、行程 ID、時間戳記）。
  4. 跨車行資料隔離：非擁有者租戶查詢外車行對帳單一律返回 `null`，拒絕跨租戶外洩。
  5. 空狀態多語系支援（繁中 / 英文）顯示誠實提示。

### 3.2 C074 & C075: 異常單追蹤、調帳 Issue 與乘客支付補收
- **驗證項目**：
  1. `BillingSettlementService` 調帳 Issue 完整生命週期：建立（`createReconciliationIssue`）、指派負責人、留言與證據掛載、標記解決（`resolved_with_corrective_action`）、以及重啟（`reopen`）。
  2. Forwarder 外部同步異常自動衍生 Issue，並正確附帶外部平臺與 Shadow Ledger 上下文。
  3. 乘客電子支付異常補收：僅支援合法動作（`retry_capture`、`begin_manual_recovery`），不支援動作立即退回 404 `PAYMENT_RECOVERY_ACTION_NOT_SUPPORTED`。
  4. 嚴格檢查平臺角色與 `billing:write` 權限；要求 `Idempotency-Key` 防重送。
  5. 在無正式資料庫連線環境下，誠實退回 503 `PAYMENT_RECOVERY_AUTHORITY_UNAVAILABLE`，絕不偽造補收成功。

### 3.3 C076: 費率草稿、比較、發布與不可變快照
- **驗證項目**：
  1. 司機費率方案發布（`publishDriverFeePlan`）：包含費率名稱、版本號、抽成費率（bps）與補貼模式。
  2. 輸入邊界防禦：空白名稱／版本或不合法費率（超出 0-10000 bps）立即拋出 400 `VALIDATION_ERROR`。
  3. 不可變合約檢查：重複發布同名同版本方案時，拋出 409 `FEE_PLAN_IMMUTABLE`。
  4. 既有對帳單採用結算時之不可變費率版本快照，不受後續發布之新費率影響。

### 3.4 C077, C078, C079: 租戶帳務、發票、真實 PDF 與受控下載
- **驗證項目**：
  1. 租戶帳務設定（`updateTenantBillingProfile`）支援抬頭、統編、地址、聯絡人與 Email，空白欄位檢驗（400）。
  2. 租戶邊界防禦：跨租戶開立發票拋出 400 `TENANT_SCOPE_MISMATCH`。
  3. 關帳週期邊界防禦：未關帳（未來月份）週期開立發票拋出 400 `VALIDATION_ERROR`。
  4. 已完成行程依比例與金額準確加總產開發票行項目。
  5. 真實二進位 PDF 生成：以 `DocumentArtifactStore` 產出符合 PDF 1.4 標準之二進位串流，包含 `%PDF-` 標頭與 `%%EOF` 結尾，絕非字串替身。
  6. 受控下載連結（`createControlledDownloadUrl`）：具備 HMAC-SHA256 簽名、過期時效與 Key-ID，驗證簽名正確性。
  7. 發票開立時自動觸發 `AuditNotificationService` 寄發審計通知。

### 3.5 C080 & C081: 駕駛補貼撥款批次、匯款憑證與安全掃描
- **驗證項目**：
  1. 補貼撥款批次（`ReimbursementBatch`）需經雙人覆核流程（`pending` -> `approved`）。
  2. 匯款憑證上傳嚴格驗證駕駛本人歸屬，非本人上傳遭 403 `REMITTANCE_PROOF_BATCH_OWNERSHIP_VIOLATION` 拒絕。
  3. 安全掃描 Fail-Closed：新上傳憑證狀態為 `pending_scan`，在完成掃描標記為 `clean` 前執行撥款，拋出 409 `REMITTANCE_PROOF_NOT_CLEAN` 拒絕付款。
  4. 完成掃描後，以具備冪等鍵之 `markReimbursementPaidWithProof` 完成支付，將批次與關聯對帳單同步標記為 `paid`，並產生唯一支付收據。

### 3.6 C082, C083, C084, C085: 銀行報表、真實 SHA-256 簽章防偽與時區邊界
- **驗證項目**：
  1. 銀行對帳單資料與 CSV 行程總額一致性：CSV 各行金額總和與對帳單 `totalIssuerPayableAmount` 完全相符。
  2. 真實密碼學摘要與簽章：以 UTF-8 bytes 計算真實 SHA-256 雜湊，並以 RSA-2048 私鑰進行 RSASSA-PKCS1-v1_5-SHA256 簽署。
  3. 防偽與竄改偵測：修改 CSV payload 任意 1 byte（如金額或行程 ID），驗證器立即判定無效並回傳 `status: "TAMPERED"`。
  4. Asia/Taipei（UTC+8）時區一致性：`deriveStatementDates` 正確產出包含 `+08:00` 偏移量之月界時間。
  5. 銀行主控台首頁快照與合約資料 SSR 穩定性：支援不同角色（`bank_program_admin` / `bank_ops_viewer`）之權限隔離與空資料安全回退。

### 3.7 C086 & C087: 通路轉介分潤（15%）、明細與總覽匯出
- **驗證項目**：
  1. 通路轉介分潤計算：依權威結算矩陣 `drts_pays_partner` 方向，依 GMV 扣除退款後按 15%（1500 bps）精確計算分潤金額與活躍搭乘者數。
  2. 動態規則解析：依通路登錄資料判定，未登錄通路請求拋出 404 `REFERRAL_CHANNEL_NOT_REGISTERED`。
  3. 無搭乘紀錄月份回傳空對帳單週期，不產出虛假對帳資料。
  4. 通路 Portal 儀表板整合：前端直接綁定後端權威 `getReferralSettlementStatement` 數據。
  5. 通路總覽匯出：驗證前端組件正確綁定 `/api/channel-partner/referral-settlement/overview/export` 查詢參數（`periodMonth`, `channelKey`），支援即時 CSV 下載。

### 3.8 C088: 跨平臺／租戶／司機／夥伴總額守恆與衝正一致性
- **驗證項目**：
  1. **企業派車總額守恆**：
     $$\text{租戶應付 (Tenant Billed)} = \text{司機實收 (Driver Net)} + \text{平臺抽成 (Platform Fee)}$$
     驗證單一行程與月結彙總金額完全守恆，零孤兒差額。
  2. **卡友機場接送總額守恆**：
     $$\text{乘客實付} + \text{發卡行補助 (平臺代墊補貼)} = \text{司機實收} + \text{平臺淨手續費}$$
     補貼批次建立使司機實收保持完整，發卡行結算獨立入帳。
  3. **通路轉介分潤總額守恆**：
     $$\text{GMV} = \text{司機實收} + \text{通路分潤 (15\%)} + \text{平臺保留手續費}$$
     平臺自總手續費提撥分潤支付合作夥伴，四方帳目總和守恆。
  4. **取消與退款衝正對稱性**：
     - 已取消／已退款行程透過 `eligibleForTenantInvoice: false` 與 `eligibleForDriverStatement: false` 旗標自動排除於結算週期之外，防止重開或重複請款。
     - 車資爭議經調帳流程以 `resolved_with_refund` 結案，完整記錄退款依據與退費收據工件，並於租戶帳單記錄衝正折抵。
  5. **清算矩陣五大通路權威邊界**：
     - 自有派車（`tenant_enterprise`, `partner_airport`, `phone_dispatch`, `partner_referral`）採用 `full_service` 本地總帳；
     - 轉派車（`forwarded_shadow`）採用 `shadow_only` 本地總帳，司機出金權威留於外部平臺，杜絕雙重出金風險。

---

## 4. 實際執行指令與結果證據

所有測試均在工作樹 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-qa-finance-001` 內執行。

### 4.1 Git Diff 檢查
```bash
$ git diff --check
(exit code: 0)
```
- 無任何 trailing whitespace、merge conflict markers 或格式違規。

### 4.2 單元測試全套執行（Vitest）
```bash
$ pnpm exec vitest run tests/unit/system-remediation/sr-qa-finance-001/
```
```
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-qa-finance-001

 ✓ tests/unit/system-remediation/sr-qa-finance-001/c068-fleet-settlement.test.ts (7 tests) 123ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c082-c083-c084-c085-bank-console-finance.test.ts (7 tests) 119ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts (4 tests) 40ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts (6 tests) 33ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c088-settlement-conservation-reversal.test.ts (7 tests) 44ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c074-c075-reconciliation-payment-recovery.test.ts (8 tests) 39ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c080-c081-reimbursement-remittance-proof.test.ts (6 tests) 48ms
 ✓ tests/unit/system-remediation/sr-qa-finance-001/c086-c087-channel-settlement-overview.test.ts (5 tests) 66ms

 Test Files  8 passed (8)
      Tests  50 passed (50)
   Start at  16:04:15
   Duration  4.84s (transform 17.16s, setup 0ms, import 26.75s, tests 511ms, environment 3ms)
```
- **Exit code**: `0`

### 4.3 端到端測試執行（Playwright Test Runner）
```bash
$ pnpm exec playwright test -c playwright.system-remediation.config.ts tests/e2e/system-remediation/sr-qa-finance-001/sr-qa-finance-001.spec.ts
```
```
Running 1 test using 1 worker

     1 …o-end evidence recording across all 16 finance & settlement capabilities
  ✓  1 …vidence recording across all 16 finance & settlement capabilities (84ms)

  1 passed (1.5s)
```
- **Exit code**: `0`
- 產出 UAT 證據包包含角色 Persona、追蹤資源 ID、HTTP 呼叫紀錄、SHA-256 工件摘要，並正確驗證無跨租戶污染。

---

## 5. 未實作／環境限制誠實申報（NOT COVERED）

依據架構規範與沙箱容器隔離政策，下列項目明確列為本任務未涵蓋之 Live 環境邊界，不以虛假打樁冒充成功：
1. **瀏覽器圖形介面互動（Browser GUI Interactions）**：
   - 本容器為無周邊無瀏覽器之沙箱環境，禁止啟動 Next.js / Nest.js 服務（`pnpm dev`）或 Playwright 瀏覽器二進位檔。
   - 所有前端組件與報表輸出均透過純函式、合約與 API 整合測試進行嚴格驗收。實際瀏覽器點擊與跨介面視覺由具備瀏覽器環境之上層任務執行。
2. **真實外部銀行／金流閘道扣款與電匯（Live Banking & Payment Gateway）**：
   - 真實銀行跨行轉帳、Taiwan Pay 金流電文、外部信用卡閘道請退款等需真實機構連線憑證與專線金鑰。
   - 本任務驗收平臺內部結算引擎、RSASSA 密碼學簽章與防偽驗證；真實出入金操作留待專屬 `LIVE-FINANCE` 與 `LIVE-DOC` 環境。
3. **資料庫層實體衝正寫入（PostgreSQL Hard Ledger Reversal Write-through）**：
   - 如 `capabilities.json`（C088）所標註「settlement 模型存在；未在本輪完成衝正寫入」，本任務驗證了業務服務層之調帳 Issue 狀態流、衝正計算與資格防禦，實體 SQL 衝正交易與資料庫 Migration 由後續專屬模組接續完成。

---

## 6. 發現事項與後續追蹤（Findings & Follow-ups）

1. **R13 橫幅矛盾已徹底解決**：
   - 經由 `SR-FLEET-SETTLE-001` 引入 `resolveStatementBannerState`，對帳單橫幅判定已具備獨立純函式真值來源，徹底排除「同時顯示無對帳單與請確認對帳單」之狀態矛盾。
2. **車行對帳單手動確認與爭議持久化**：
   - 目前車行端對帳單確認與爭議按鈕為模擬狀態機，實際在 DB 儲存確認者身分與爭議理由由專屬追蹤任務（`SR-FLEET-SETTLE-002`）擴充。

---

## 7. 驗收結論與交接狀態

- **結論**：`SR-QA-FINANCE-001` 所列之 16 項能力（`C068`, `C074`-`C088`）均已完成正常路徑、關鍵負向防禦、密碼學防偽、多方分攤總額守恆與 E2E 證據記錄，全部 50 項單元測試與 Playwright 規格皆為 Exit Code 0。
- **交接指令**：完成分支 commit 與 push 後，執行 `ai-status.sh handoff SR-QA-FINANCE-001 Gemini2` 交付獨立審查人 `Gemini2`，嚴格遵守不自行標記 `done` 之治理規範。
