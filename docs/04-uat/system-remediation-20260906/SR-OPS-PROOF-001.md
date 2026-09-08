# SR-OPS-PROOF-001 — 備份還原／容量／背景部署可驗證方案

| 欄位          | 內容                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-OPS-PROOF-001.md`                                   |
| Owner         | Gemini                                                                                             |
| Reviewer      | Codex2                                                                                             |
| Base SHA      | `40ba315e4114369eaa7e12d35aae83a795c97b1d` (= `origin/dev` tip at task start)                      |
| Prior Candidate SHA | `8c1dbec1d443e456082b92b8e8a1a8fd50fe2136` (Codex2 審查駁回，存在假數據、未連線 PASS 與硬編碼問題) |
| Current Candidate SHA | 於本輪 commit / handoff 時記錄 (詳見 task board 與 git rev-parse HEAD)                               |
| Resource ID   | `iso-db-res-001`                                                                                   |

---

## 1. 審查意見與重現問題分析

前次提交版本（`8c1dbec1d443e456082b92b8e8a1a8fd50fe2136`）經 Reviewer Codex2 審查後駁回（P1），指出三大核心缺陷：
1. **快照還原偽通過與未實際連線**：
   - `ops-proof.mjs` 與 `snapshot-restore-engine.ts` 僅以內存 Map 模擬，未接受外部快照輸入，且未真正連線至指定的 `--isolated-url`。
   - 重現指令：`git show 8c1dbec1d443:tools/system-remediation/ops-proof/bin/ops-proof.mjs | node --input-type=module - snapshot-verify --isolated-url postgresql://localhost:1/review_isolated --json` 在無任何資料庫連線的情況下回傳 `exit 0, recordsRestored=7, overallPassed=true`。
2. **負載測試使用 Math.random 偽造數據且缺少目標未回報 not-run**：
   - `load-generator.ts` 與 CLI 使用 `Math.random` 偽造 `rawLatencies`，在未發送任何真實請求的情況下回傳 `errorRate=0, rawErrors=[]`。
   - 缺少目標伺服器時未回報 `not-run`，反而偽稱通過。
3. **部署與回滾驗證硬編碼 PASS 且 RPO/RTO 偽造基準評定**：
   - `deploy-verify` 在 `--candidate-sha invalid` 時雖輸出 `candidateShaValid: false`，但 `passed` 仍硬編碼為 `true`，`overallPassed: true`，回傳 `exit 0`。
   - RPO/RTO 在基準標記為 `pending_confirmation` 的情況下，仍擅自發明 15分／60分 門檻並評定為 PASS。
   - `all` 命令在沒有任何外部輸入的情況下輸出 `ALL CHECKS PASSED`。

---

## 2. 核心架構修復與實作改進

### A. 資料庫真實隔離還原適配器（`snapshot-restore-engine.ts`, `ops-proof.mjs`）
- **落實「工具不碰正式DB」**：`assertIsolatedDatabase` 嚴格阻擋生產標記（`drts-prod`、`production`、`cloudsql` 等）與正式庫名（`drts_fleet_platform`、`drts_production` 等）。
- **真實資料庫適配器**：
  - **PostgreSQL 適配器**：連線前執行 TCP 連線探測；若主機／通訊埠無法連線（如 `localhost:1`），立即捕捉 `ECONNREFUSED`，記錄連線錯誤，設定 `passed: false, overallPassed: false`，並以 `exit 1` 退出，絕不默默回報 PASS。連線成功時，執行 DDL 建立權威 schema（`ops.orders`, `ops.trips`, `billing.tenant_invoices`, `admin.audit_logs`），寫入資料並查詢回讀校核，記錄 `resourceEvidence`。
  - **SQLite 適配器**：基於 Node 22 原生 `node:sqlite` `DatabaseSync` 實作，建立資料庫表格，執行 SQL 插入與查詢回讀校核。
- **快照輸入**：支援 `--snapshot <file>`，校驗 SHA-256 完整性；內建 fixture 嚴格標記為 `self_test_fixture`，僅在 `--self-test` 模式下作為測試套件自身使用。
- **缺少隔離資料庫目標**：若未指定 `--isolated-url` 且非 `--self-test`，回報 `status: "missing_target"`, `passed: false`。

### B. 真實負載操作適配器與實測延遲（`load-generator.ts`, `workload-baseline-contracts.ts`）
- **徹底移除 `Math.random()` 偽造延遲**：
  - 實作真實 HTTP 操作適配器，發送實際網路請求至目標服務（Booking: `/api/v1/orders`、Dispatch: `/api/v1/dispatch/queue`、Report: `/api/v1/reports`），以 `performance.now()` 精確量測單次往返毫秒延遲，輸出真實 `rawLatencies` 陣列與捕獲之 `rawErrors` 錯誤紀錄。
  - 在 `--self-test` 模式下，動態啟動 in-process 本地 HTTP 伺服器，透過真實 loopback 網路請求量測毫秒級延遲，絕無隨機假數。
- **缺少目標時報告 not-run**：若未指定 `--target-url` 且非 `--self-test`，明確回報 `status: "not_run", passed: false`，絕不冒充通過。

### C. 嚴格部署檢核與失敗傳播（`deploy-rollback-harness.ts`, `ops-proof.mjs`）
- **版本格式檢驗**：若 `--candidate-sha` 為非 40 位 hex 雜湊（例如 `invalid`），立即標記 `candidateShaValid: false` 與 `passed: false`，並連鎖傳播至 `overallPassed: false`，以 `exit 1` 退出。
- **真實健康檢查端點探測**：若提供 `--health-url`，發送真實 HTTP 請求檢查服務狀態；若未提供且非 self-test，回報 `not_run` 與 `passed: false`。
- **回滾演練協議驗證**：檢查演練證據檔或在 self-test 下檢驗回滾五步驟協議（強制 `skip_migration=true`）；未提供時回報 `not_run`。
- **失敗傳播**：`deployRollbackVerification.passed = candidateShaValid && healthCheck.passed && rollbackDrill.passed`，任一項失敗或未執行即判定不通過。

### D. 嚴格依規範將 RPO/RTO 標記為未評定（`rpo-rto-calculator.ts`）
- 依據 guardrail「沿runbook與現行SLO，RPO/RTO不自行發明」及 reviewer 意見：
  - `DISASTER_RECOVERY_BASELINE` 保持 `isConfirmed: false`、`status: "pending_confirmation"`、`sourceRef: null`。
  - RPO 與 RTO 評定物件中明確輸出 `status: "unevaluated"`、`compliant: null`、`passed: null`。
  - 報告明確說明：「RPO/RTO 基準待確認（非既有文件值），依規範標記為未評定 (unevaluated)，在維運團隊確認正式基準前不以暫定值評定 PASS。」

### E. 明確區分工具自身自測（Self-Test）與線上驗收（Acceptance）
- CLI 預設為 `acceptance` 模式。若在無外部輸入情況下執行 `ops-proof.mjs all`，各項缺口皆回報 `not_run` 或 `missing_target`，`overallPassed: false`，以 `exit 1` 退出。
- 新增 `--self-test` 旗標與 `self-test` 子命令：專供驗證 harness 工具自身的完整功能與單元/整合測試，結果明確標記 `mode: "self_test"`、`isSelfTest: true`，並在說明中註記真機雲端還原與負載壓測保留至 `SR-LIVE-OPS-001`。

---

## 3. 驗收條件對應矩陣

| 驗收條件 | 本輪實作對應與證據 |
| -------- | ------------------ |
| **同一snapshot可在隔離DB還原並校核行程/帳務/audit，工具不碰正式DB** | `assertIsolatedDatabase` 阻擋生產連線；支援 PostgreSQL 與 SQLite 真實適配器。若連線至無效之隔離 DB（如 `postgresql://localhost:1/review_isolated`），真實 TCP 探測捕獲 `ECONNREFUSED` 並退出 1，不再假通過。校核涵蓋外鍵、不變量、發票算術、司機淨額及 SHA-256 防篡改雜湊。 |
| **負載包含booking/dispatch/report三種；閾值來自已確認基準且輸出原始延遲與錯誤** | 移除所有 `Math.random`。以真實 HTTP 請求量測 Booking/Dispatch/Report，輸出 `rawLatencies` 陣列與 `rawErrors` 錯誤紀錄。閾值嚴格依據 `phase1-operational-workload-sla-degradation-baseline-20260430.md`（Booking p95≤2s、Dispatch p95≤10s、Report p95≤3s）。未指定目標服務時明確報告 `not_run`，不冒充 PASS。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功** | 本報告完整記錄各重現指令的真實輸出與退出碼；未做的 live 部分（GCP Cloud SQL 真機還原、線上真實流量壓測、正式 RPO/RTO 定案）明列於第 5 節，不冒充成功。 |
| **先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案** | 實作完成後執行 anchor commit 並 non-force push 至 `gemini/sr-ops-proof-001`，呼叫 `ai-status.sh handoff SR-OPS-PROOF-001 Codex2`，由 reviewer 進行二輪審查。 |

---

## 4. 實際指令驗證紀錄

### A. 重現指令 1 驗證：隔離 DB 無法連線時必須退出 1 且 passed: false

```bash
$ cat tools/system-remediation/ops-proof/bin/ops-proof.mjs | node --input-type=module - snapshot-verify --isolated-url postgresql://localhost:1/review_isolated --json
(exit 1)
```

輸出 JSON：
```json
{
  "taskId": "SR-OPS-PROOF-001",
  "executedAt": "2026-09-08T12:42:33.261Z",
  "baseSha": "40ba315e4114369eaa7e12d35aae83a795c97b1d",
  "candidateSha": "40ba315e4114369eaa7e12d35aae83a795c97b1d",
  "resourceId": "iso-db-res-001",
  "mode": "acceptance",
  "isolatedTarget": "review_isolated@localhost",
  "snapshotRestoreVerification": {
    "passed": false,
    "status": "failed",
    "error": "Failed to connect to isolated PostgreSQL at localhost:1: connect ECONNREFUSED 127.0.0.1:1",
    "recordsRestored": 0
  },
  "overallPassed": false
}
```
*驗證結論：連線失敗時即時中止並以 exit 1 退出，成功修正 Reviewer 指出之無連線偽通過問題。*

### B. 重現指令 2 驗證：候選 SHA 非法時必須退出 1 且 passed: false

```bash
$ cat tools/system-remediation/ops-proof/bin/ops-proof.mjs | node --input-type=module - deploy-verify --candidate-sha invalid --json
(exit 1)
```

輸出 JSON：
```json
{
  "taskId": "SR-OPS-PROOF-001",
  "executedAt": "2026-09-08T12:42:41.090Z",
  "baseSha": "40ba315e4114369eaa7e12d35aae83a795c97b1d",
  "candidateSha": "invalid",
  "resourceId": "iso-db-res-001",
  "mode": "acceptance",
  "isolatedTarget": "none",
  "deployRollbackVerification": {
    "passed": false,
    "candidateShaValid": false,
    "candidateShaNote": "Candidate SHA 'invalid' is invalid or malformed",
    "healthCheck": {
      "status": "not_run",
      "passed": false,
      "note": "未提供健康檢查 URL (--health-url 或 --target-url)。依規範回報 not-run，不冒充 PASS。"
    },
    "rollbackDrill": {
      "status": "not_run",
      "passed": false,
      "note": "未提供回滾演練證據檔 (--rollback-evidence)。依規範回報 not-run，不冒充 PASS。"
    }
  },
  "overallPassed": false
}
```
*驗證結論：SHA 非法時 `candidateShaValid: false` 且連鎖導致 `overallPassed: false` 並以 exit 1 退出，成功修正硬編碼 PASS 問題。*

### C. 重現指令 3 驗證：無任何外部輸入時不冒充 ALL CHECKS PASSED

```bash
$ cat tools/system-remediation/ops-proof/bin/ops-proof.mjs | node --input-type=module - all --json
(exit 1)
```

輸出摘要：各項檢驗皆回報 `missing_target` 或 `not_run`，`overallPassed: false`，退出碼為 1。

### D. 工具自檢模式執行驗證（Self-Test Mode）

```bash
$ cat tools/system-remediation/ops-proof/bin/ops-proof.mjs | node --input-type=module - all --self-test --json
(exit 0)
```

輸出 JSON 重點：
- `mode`: `"self_test"`
- `dbEvidence`: SQLite 本地隔離適配器建立表格與驗證 7 筆紀錄。
- `rpo`: `status: "unevaluated", baselineStatus: "pending_confirmation", passed: null`
- `rto`: `status: "unevaluated", baselineStatus: "pending_confirmation", passed: null`
- `loadCapacityVerification`: 動態啟動 in-process 本地 HTTP 伺服器，發送 75 筆真實請求並量測實際延遲（`rawLatencies` 皆為實測浮點毫秒數，無 Math.random）。
- `overallPassed`: `true`

### E. 單元與整合測試套件

```bash
$ pnpm vitest run tests/unit/system-remediation/sr-ops-proof-001/

 Test Files  1 passed (1)
      Tests  35 passed (35)
   Duration  3.15s
(exit 0，35 項測試全數通過)
```

### F. 代碼格式與 TypeScript 類型檢查

```bash
$ git diff --check
(exit 0，無格式錯誤或尾隨空白)

$ pnpm tsc -p tsconfig.json --noEmit
(write_scopes 範圍內零 TypeScript 錯誤，符合 exactOptionalPropertyTypes 要求)
```

---

## 5. 未做的部分（明列邊界，不冒充成功）

1. **真機 GCP Cloud SQL 活體備份還原與雲端資源建立**：
   - 本任務聚焦於可重跑之隔離資料庫驗證 harness、安全防護與自動校核。真機 GCP Cloud SQL 實例建立、跨專案權限與正式資料還原保留至 `SR-LIVE-OPS-001`（具備外部閘門 `authorized_isolated_ops_target` 授權）。
2. **真機 Cloud Run 多實例線上高壓壓力測試**：
   - 跨節點負載、真實公網流量與限流 429 演練保留至 `SR-LIVE-OPS-001`。
3. **正式 RPO / RTO 權威 SLA 數值定案**：
   - 經全庫查核確認既有文件中尚無具體數值定義，本任務工具在維運與架構團隊簽核前，一律標記為未評定（`unevaluated`），不以暫定值冒充正式合規。
4. **真機 GitHub Actions 生產回滾工作流實際 dispatch**：
   - 涉及雲端環境發布變更，保留至正式生產發布維運程序。

---

## 6. Write scope 遵守情況

本任務嚴格遵守指定的 `write_scopes` 範圍：
1. `tools/system-remediation/ops-proof/`（資料庫適配器、負載產生器、回滾驗證器、CLI 執行檔、snapshot fixture）
2. `tests/unit/system-remediation/sr-ops-proof-001/`（單元與整合測試套件）
3. `docs/04-uat/system-remediation-20260906/SR-OPS-PROOF-001.md`（驗收交付報告）

未修改任何共用 config、lockfile、全域 routes 或未授權檔案。
