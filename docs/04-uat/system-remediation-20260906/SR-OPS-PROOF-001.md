# SR-OPS-PROOF-001 — 備份還原／容量／背景部署可驗證方案

| 欄位          | 內容                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-OPS-PROOF-001.md`               |
| Owner         | Gemini                                                                         |
| Reviewer      | Claude                                                                         |
| Base SHA      | `40ba315e4114369eaa7e12d35aae83a795c97b1d` (= `origin/dev` tip at task start)  |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)                |
| Resource ID   | `iso-db-res-001`                                                               |

## 1. 重現與基準

- **追溯來源**：
  - 能力來源：
    - **C122**（「備份、還原、RPO／RTO及災難演练：取得實際策略、成功備份與隔離環境restore紀錄，驗證業務資料」）。
    - **C123**（「負載、延遲、容量與限流：按已確認SLO做代表性並發、佇列積壓和報表負載」）。
    - **C124**（「部署版本、health、業務驗收與回滾：以目前各服務版本與可重跑用戶旅程作發布門檻；记录rollback演练」）。
  - 規格與基準來源：
    - `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`（非功能性負載、容量與延遲 SLO 基準）。
    - `docs/03-runbooks/incident-escalation-service-recovery-runbook.md`（事故升級、服務復原與派車異常交接程序；注意：全庫核查確認目前 repo 與該 runbook 尚未定義具體數值 RPO/RTO 指標，演練暫定參考值明確標記為待確認）。
    - `docs/03-runbooks/production-deploy-rail-spec-20260519.md` 與 `docs/03-runbooks/production-rollback-drill-20260519.md`（生產部署與回滾演練規範）。
- **Base SHA**：`40ba315e4114369eaa7e12d35aae83a795c97b1d`（當前 `origin/dev`）。
- **重現狀況與問題現狀**：
  - 9/6 audit 觀察指出：「本輪無權讀當前雲備份／還原證據；不代表不存在備份」、「沒有本輪負載測試；先前單次429不構成容量結論」、「部分結案文件仍指舊 URL／舊 billing gate」。
  - 在本任務之前，專案缺乏可重跑的離線/隔離驗收工具，無法在隔離環境中安全驗證資料庫快照還原與行程、帳務、稽核三領域的數據一致性，且缺乏防止意外觸碰生產資料庫的安全隔離護欄。
  - 同時，缺乏能夠按既定架構 SLO 執行 Booking、Dispatch、Report 代表性負載量測並輸出原始延遲與錯誤資訊的工具套件。

## 2. 這個任務做了什麼

### A. 建立資料庫安全隔離護欄（`tools/system-remediation/ops-proof/src/db-safety-guard.ts`）

- 實作 `assertIsolatedDatabase(connectionUrl)` 與 `isProductionTarget(target)`：
  - 嚴格落實**「工具不碰正式DB」**核心安全要求。
  - 主動掃描並嚴格拒絕包含生產特徵（`drts-prod`、`production`、`cloudsql`、`rds.amazonaws.com` 等）的資料庫連線字串。
  - 拒絕預設正式資料庫名稱（`drts_fleet_platform`、`drts_production`、`drts_prod`）。
  - 僅允許明確標記為隔離／測試的目標（如 `in-memory`、`sqlite://:memory:`、含 `_isolated`、`_restore_test`、`_test`、`_ops_proof` 之本地資料庫），若違規立即拋出 `ProductionDatabaseAccessDeniedError`（錯誤碼 `PRODUCTION_DB_TOUCH_PROHIBITED`）並中斷執行。

### B. 建立快照模型、隔離還原引擎與三領域校核器（`snapshot-schema.ts`, `snapshot-restore-engine.ts`, `reconciliation-engine.ts`）

- **快照模型與校驗和**：
  - 定義完整快照結構，包含中繼資料（`snapshotId`、`capturedAt`、`checksumSha256`、`resourceId`）與三大業務領域資料：
    1. **行程（Trips）**：`ops.orders`、`ops.bookings`、`ops.dispatch_jobs`、`ops.dispatch_assignments`、`ops.trips`、`ops.proof_bundles`。
    2. **帳務（Billing）**：`billing.driver_fee_plans`、`billing.driver_statements`、`billing.driver_statement_lines`、`billing.tenant_invoices`、`billing.invoice_lines`。
    3. **稽核（Audit）**：`admin.audit_logs`、`ops.dispatch_trace_logs`。
  - 支援以 SHA-256 驗證快照完整性；實作 `calculateAuditLogHash` 以 actor、module、action、resource、timestamp 驗證稽核日誌之防篡改雜湊。
- **隔離還原引擎**（`IsolatedSnapshotRestoreEngine`）：
  - 執行還原前先經 `assertIsolatedDatabase` 檢查，嚴禁觸碰正式 DB。
  - 於隔離資料結構（`IsolatedDataStore`）載入所有表格資料，記錄還原筆數與精確毫秒耗時。
- **三領域交叉校核器**（`OpsReconciliationEngine`）：
  - **行程校核**：驗證訂單、預約、派車任務、司機指派與行程的關聯外鍵完整性；驗證距離與時長非負不變量；校核需要簽核憑證（`proof_required = true`）之行程具有有效的 `proof_bundles` 記錄。
  - **帳務校核**：校核租戶發票金額等於各發票明細總和（`sum(line_total) == total_amount`）；校核幣別為標準 `TWD`；校核司機月結算單淨額符合毛額減服務費加補貼之算術關係（`net_amount == gross_earning - service_fee + subsidy_amount`），且等於結算明細總和。
  - **稽核校核**：驗證所有稽核日誌之 SHA-256 雜湊與原始負載相符（防篡改）；驗證關鍵生命週期（如 `order.created`、`invoice.issued`）皆具備稽核軌跡；驗證已完成行程具備派車追蹤軌跡（`dispatch_trace_logs`）。

#### C. 嚴格依全庫核查現狀處理 RPO 與 RTO（`rpo-rto-calculator.ts`）

- **核查結果與待確認標記**：
  - 經全庫檢索（含 Phase 1 PRD、系統分析、服務合約、Runbook 及 Dev Pack），既有文件尚未定義具體數值之 RPO/RTO 指標。
  - 依據 guardrail「沿runbook與現行SLO，RPO/RTO不自行發明」，**堅決不偽造引用，移除所有虛構 sourceRef 與虛擬章節**。
  - 程式常數 `DISASTER_RECOVERY_BASELINE` 明確設定 `isConfirmed: false`、`status: "pending_confirmation"`、`sourceRef: null`，並載明警語說明此為「演練暫定參考值（RPO ≤ 15 分鐘 / RTO ≤ 60 分鐘），非既有文件值，待 SRE／維運團隊正式確認」。
- **評定與傳遞機制**：
  - 實作 `calculateRpo`、`calculateRto` 與 `evaluateDisasterRecoveryReadiness`，於評定物件中明確傳遞 `baselineConfirmed: false` 與 `baselineStatus: "pending_confirmation"`。
  - 單元測試不再回頭自我斷言常數（消除循環斷言），改為檢驗待確認狀態、null sourceRef 及門檻數值計算邏輯，確保如實呈現待確認現狀，不冒充權威基準通過。

### D. 建立多負載容量與原始延遲/錯誤校驗工具（`workload-baseline-contracts.ts`, `load-generator.ts`）

- 依據 `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md` 之權威基準定義：
  - **Booking（Intake）**：穩定 20 req/min、尖峰 60 req/min、並發 50；**SLO p95 ≤ 2,000ms, p99 ≤ 5,000ms, 可用度 ≥ 99.9%**。
  - **Dispatch**：穩定 120 transitions/min、尖峰 300 transitions/min、佇列積壓 500；**SLO p95 ≤ 10,000ms, 可用度 ≥ 99.9%**。
  - **Report**：穩定 10 jobs/min、尖峰 30 jobs/min、並發 50；**SLO p95 ≤ 3,000ms, 可用度 ≥ 99.0%**。
- `LoadGenerator` 執行代表性取樣測試：
  - **完整輸出原始延遲陣列**（`rawLatencies`）與**原始錯誤清單**（`rawErrors`，含時間戳、操作名稱、錯誤碼與耗時）。
  - 精確計算 min、max、mean、p50、p90、p95、p99 統計分位數。
  - 嚴格對照基準閾值評定 SLO 達標情況，一旦違規明確記錄違規原因。

### E. 建立部署版本與回滾演練驗證（`deploy-rollback-harness.ts`）

- 驗證候選 commit SHA 格式與有效性。
- 驗證 `/health` 健康檢查端點規格（HTTP 200, status: `ok`, database: `connected`）。
- 依據 `production-rollback-drill-20260519.md` 檢核回滾演練協議：
  - 步驟 A：識別失敗版本與上一穩定版本 tag 對（`prod/v*`）。
  - 步驟 B：檢核操作員指令**嚴格強制 `skip_migration=true`**（防範破壞性 down-migration）。
  - 步驟 C：檢核 `production` 環境審查者閘門確認。
  - 步驟 D：確認 API、Platform Admin、Ops Console 服務達 `Ready=True` 且健康。
  - 步驟 E：產生結構化演練證據包。

### F. 提供獨立 CLI 工具與單元測試套件

- 實作 `tools/system-remediation/ops-proof/bin/ops-proof.mjs` 獨立執行檔：
  - 支援 `all`、`snapshot-verify`、`load-test`、`deploy-verify` 等子命令。
  - 支援 `--json` 輸出機讀數據與 `--output <path>` 存檔。
  - 支援 `--isolated-url` 傳入外部隔離資料庫，遇生產 URL 自動阻擋。
- 實作 `tests/unit/system-remediation/sr-ops-proof-001/sr-ops-proof-001.test.ts`：
  - 涵蓋安全護欄、快照完整性、三領域校核、RPO/RTO 待確認狀態與門檻、負載百分位數、錯誤回報、回滾演練及 CLI 整合共 32 項測試，全數通過。

## 3. 驗收條件對應

| 驗收條件 | 對應實作與證據 |
| -------- | -------------- |
| **同一snapshot可在隔離DB還原並校核行程/帳務/audit，工具不碰正式DB** | `assertIsolatedDatabase` 嚴格阻擋生產連線（拋出 `PRODUCTION_DB_TOUCH_PROHIBITED`）；`IsolatedSnapshotRestoreEngine` 在隔離儲存成功還原；`OpsReconciliationEngine` 完整校核訂單-行程關聯、發票-明細與司機淨額算術、稽核 SHA-256 防篡改雜湊。單元測試與 CLI 驗證全數通過。 |
| **負載包含booking/dispatch/report三種；閾值來自已確認基準且輸出原始延遲與錯誤** | 閾值嚴格源自 `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`（Booking p95≤2s、Dispatch p95≤10s、Report p95≤3s）。`LoadGenerator` 輸出每一筆 `rawLatencies` 與 `rawErrors`，並計算 p50/p90/p95/p99 統計量。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功** | 記錄 Base SHA（`40ba315e4114369eaa7e12d35aae83a795c97b1d`）、Resource ID（`iso-db-res-001`）；實際執行輸出與指令詳列於第 4 節；第 5 節明列真機雲端還原與線上壓測屬於 `SR-LIVE-OPS-001`，且 RPO/RTO 正式權威值標明待確認，不冒充成功。 |
| **先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案** | 依循工作流執行 task-scoped anchor commit，透過普通 push 推送至 `gemini/sr-ops-proof-001`，呼叫 `ai-status.sh handoff SR-OPS-PROOF-001 Claude`，不直接呼叫 `done`。 |

## 4. 實際指令與結果

### A. Git 格式與空白檢查

```bash
$ git diff --check
(exit 0，無任何 trailing whitespace 或格式錯誤)
```

### B. 單元與整合測試套件

```bash
$ node /home/lupin/drts-fleet-platform/node_modules/.pnpm/vitest@4.1.4_@types+node@24.12.2_vite@8.0.11_@types+node@24.12.2_esbuild@0.27.7_jiti@2._561c481093c389f7659e44b5ed90ab72/node_modules/vitest/vitest.mjs run tests/unit/system-remediation/sr-ops-proof-001/

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-proof-001

 Test Files  1 passed (1)
      Tests  32 passed (32)
   Start at  14:58:57
   Duration  737ms
(exit 0，32 項單元與整合測試全數通過)
```

### C. CLI 驗證工具直接執行（人讀格式）

```bash
$ node tools/system-remediation/ops-proof/bin/ops-proof.mjs all

================================================================================
 DRTS Ops-Proof Verification Runner — Task SR-OPS-PROOF-001
================================================================================
 Base SHA:       40ba315e4114369eaa7e12d35aae83a795c97b1d
 Candidate SHA:  40ba315e4114369eaa7e12d35aae83a795c97b1d
 Resource ID:    iso-db-res-001
 Isolated Target: in-memory-isolated-store@localhost (工具不碰正式DB: PASS)
--------------------------------------------------------------------------------

[1] 隔離 DB 快照還原與三領域校核 (C122): ✓ PASS
    - 還原紀錄: 7 筆 (耗時 2ms)
    - 行程校核: ✓ PASS (訂單/派車/行程關聯一致)
    - 帳務校核: ✓ PASS (發票/明細/司機結算金額平整)
    - 稽核校核: ✓ PASS (SHA-256 防篡改雜湊驗證通過)
    - RPO 評定: 5m (暫定參考值 ≤15m [基準待確認，非既有文件值]) -> ✓ PASS (暫定)
    - RTO 評定: 0m (暫定參考值 ≤60m [基準待確認，非既有文件值]) -> ✓ PASS (暫定)

[2] 三負載容量與原始延遲校驗 (C123): ✓ PASS
    - Booking (Intake):
      樣本數: 25, 錯誤數: 0, 錯誤率: 0%
      延遲統計: min=36.6ms, p50=80.3ms, p95=202.5ms (SLO ≤2000ms), max=204ms
      SLO 達標: ✓ PASS
    - Dispatch:
      樣本數: 50, 錯誤數: 0, 錯誤率: 0%
      延遲統計: min=50.8ms, p50=113.7ms, p95=346.1ms (SLO ≤10000ms), max=401.9ms
      SLO 達標: ✓ PASS
    - Report:
      樣本數: 20, 錯誤數: 0, 錯誤率: 0%
      延遲統計: min=101.5ms, p50=349ms, p95=711.6ms (SLO ≤3000ms), max=711.6ms
      SLO 達標: ✓ PASS

[3] 部署版本與回滾演練 (C124): ✓ PASS
    - 候選版本: 40ba315e4114369eaa7e12d35aae83a795c97b1d (格式合法: ✓)
    - 健康檢查: /health -> ok (DB: connected)
    - 回滾演練: prod/v2026.05.19.1 -> prod/v2026.05.18.0 (skip_migration=true: ✓)
--------------------------------------------------------------------------------
 總體驗收結果: ALL CHECKS PASSED (合規)
================================================================================
(exit 0)
```

### D. 生產資料庫誤碰防禦驗證

```bash
$ node tools/system-remediation/ops-proof/bin/ops-proof.mjs all --isolated-url "postgresql://admin:secret@prod-db.internal:5432/drts_fleet_platform"
[FATAL ERROR] [PRODUCTION_DB_TOUCH_PROHIBITED] Connection string contains forbidden production marker 'prod-db'. Aborting.
(exit 1，安全防禦生效，成功阻擋觸碰正式資料庫)
```

## 5. 未做的部分（明列，不冒充成功）

- **正式 RPO / RTO 權威 SLA 數值定案**：經全庫查核確認既有文件中尚無具體數值定義，本任務工具暫定 15m / 60m 作為離線演練門檻並標記 `pending_confirmation`，待正式 SRE 與維運主管確認後更新，絕不偽稱已為 runbook 現行值。
- **真機 GCP Cloud SQL 活體快照還原**：本任務為離線可重跑之還原校核 harness 與安全防線。真機 GCP Cloud SQL 實例建立、備份還原演練與雲端權限操作屬於 `SR-LIVE-OPS-001`（具備外部閘門 `authorized_isolated_ops_target`），本任務不冒充已在真機雲端執行還原。
- **真機 Cloud Run 多實例線上高壓壓測**：跨實例真實負載與網路流量壓測保留至 `SR-LIVE-OPS-001`。
- **真機 GitHub Actions 生產回滾工作流 dispatch**：涉及實際 GCP 雲端資源變更，保留至正式發布維運程序。

## 6. Write scope 遵守情況

本任務僅新增於指定 `write_scopes` 範圍：

1. `tools/system-remediation/ops-proof/`（新增：資料庫安全護欄、快照還原引擎、三領域校核器、RPO/RTO評定器、負載產生器、部署回滾驗證器與 CLI 工具）
2. `tests/unit/system-remediation/sr-ops-proof-001/`（新增：`sr-ops-proof-001.test.ts` 單元與整合測試套件）
3. `docs/04-uat/system-remediation-20260906/SR-OPS-PROOF-001.md`（新增：本驗收交付報告）

未修改任何共用 config、lockfile、routes、API 伺服器程式碼或未授權檔案。
