# UAT: SR-LIVE-OPS-001 (部署排程／備份還原與容量驗收)

## 目標與範圍
本 UAT 文件驗證以下營運與品質能力缺口：
- **C122**：備份、還原、RPO／RTO及災難演練
- **C123**：負載、延遲、容量與限流
- **C124**：部署版本、health、業務驗收與回滾

## 執行狀態
**目前狀態**：`blocked`（等待授權與成本核准）

因涉及真實 GCP 備份還原、獨立環境資源建立與負載測試，目前此 UAT 的正式執行被設為 blocked，等待管理員或使用者明確授權。

## 基礎建設與工具

為準備上述驗證，我們實作了以下演練用基礎建設：
1. **GitHub Actions Workflow**：`.github/workflows/live-ops-restore-drill.yml`，支援手動與排程執行備份還原演練。
2. **Operator Script**：`infra/gcp/dev/ops-drill/run-restore-drill.sh`，符合最小權限原則，供自動化流程或人工執行備份還原操作。
3. **驗證腳本**：
   - Unit tests: `tests/unit/system-remediation/sr-live-ops-001/ops-drill.spec.ts`
   - E2E tests: `tests/e2e/system-remediation/sr-live-ops-001/sr-live-ops-001.spec.ts`

## 待取得的真實證據 (Acceptance Criteria Gates)

測試和流程啟動必須依賴以下真實取回之證據。取得後，Supervisor 才會解除 blocked 狀態並准許真實執行。

| 條件 / 變數 | 說明 | 狀態 |
|------------|------|------|
| `authorized_isolated_ops_target` | 授權之隔離測試環境 (例如 `dev-ops-drill-db`) 的準備與存取權限。 | 尚未取得 |
| `backup_restore_readback` | 成功還原後，應用程式讀取驗證成功的日誌或紀錄。 | 尚未取得 |
| `rpo_rto_capacity_baseline` | 容量基準與真實的 RPO/RTO 測量數據 (需根據 SLO 驗證負載與限流)。 | 尚未取得 |
| `scheduled_job_restart_proof` | 備份還原後，排程任務 (Cloud Scheduler 等) 成功重啟與執行的證據。 | 尚未取得 |
| `live_candidate_sha` | 用於部署驗證的發布版本 SHA，確認回滾與部署版本測試。 | 尚未取得 |

## 測試指令

取得上述授權與環境變數後，執行以下指令驗證：
```bash
# 設置環境變數後執行 Playwright UAT 驗證
pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-ops-001
```

## 追溯
- [原始問題](./source/findings.json)
- [能力盤點](./source/capabilities.json) (C122, C123, C124)
