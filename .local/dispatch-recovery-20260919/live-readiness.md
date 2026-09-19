# SR-LIVE-READINESS-20260919 盤點報告

## 1. 查核資訊
- **時間**: 2026-09-19T15:40:55Z
- **指令**: `gh run view 35430134402 --log`, `gh secret list`, `gh variable list`
- **來源 run**: 35430134402
- **真實 Deployed SHA**: `98e251cdc809467b16a158fc2f285e4296206f5f`

> **重要備註**: 經由 `deploy-dev` log (run 35430134402) 查證，實際部署的 SHA 為 `98e251cdc809467b16a158fc2f285e4296206f5f`。該 Commit 位於近期變更之前，**因此目前部署之環境並不包含後來實作的 SEQ/TRANSPORT (SR-PARTNER-NOTIFY-SEQ-20260918, SR-PARTNER-NOTIFY-TRANSPORT-20260918) 相關變更**。不可宣稱該等功能已在 dev 環境發布。
> PUSH A controlled, B true partner endpoint, C native pilot are separate and gates are preserved. PR2080 (SR-PARTNER-NOTIFY-NAV-20260917) is not a valid CI/merge evidence for this task.

## 2. 資源狀態

### 🟢 已具備資源 / 已完成項目 (Prepared / Done)
1. **AGY-SANDBOX-RECOVERY** (agy_sandbox_write_access)
   - **狀態**: 已恢復 (available)
   - **說明**: 2026-09-19 已授權的 agy AppArmor userns 修復完成；保留 `--sandbox`，實測 `run_command` 寫入/讀回/刪除成功。證據位於 `.local/dispatch-recovery-20260919/agy-shell-after-profile-v2.json`。
2. **SR-DEV-HEALTHCHECK-IDENTITY-20260915** (dev_health_check)
   - **狀態**: Done (Merge SHA: `8901d8386e8fba0bb9dff18c9ab659809e1d8b00`)
   - **說明**: Deploy 35430134402 Dev health check / Candidate SHA operational acceptance 成功。舊 blocker 已解除，現有部署基礎存在。

### 🚀 已完成 Runner / 執行器 (Done Producers)
1. **SR-LIVE-ENTRY-MAP-RUNNER-001** (Done, SHA: `25ecae6295898d80883f03a9f5a1276fab03ab24`)
   - **能力**: 執行 live entry map acceptance
   - **輸入**: 依據 `docs/04-uat/system-remediation-20260906/live-entry-map-acceptance-runner.md`
   - **重用指令**: 既有 runner script
   - **下一步**: 當 operator 提供授權與輸入時執行 runner
2. **SR-LIVE-DOC-RUNNER-001** (Done, SHA: `f1731dfdd892b10a2831ceec94512db87694e976`)
   - **能力**: 執行 live document acceptance
   - **輸入**: 依據 `docs/04-uat/system-remediation-20260906/live-document-acceptance-runner.md`
   - **重用指令**: 既有 runner script
   - **下一步**: 當 operator 提供授權與輸入時執行 runner
3. **UV-EXEC-029-PILOT-RUNNER** (Done, SHA: `dc84431eed6ee3fd778e828c030ae77db661df54`)
   - **能力**: Unattended voice pilot 驗收
   - **輸入**: 依據 `docs/04-uat/unattended-voice-pilot-acceptance.md`
   - **重用指令**: `operations/verification/check-unattended-voice-pilot.mjs --evidence <file> --expected-sha <sha>`
   - **下一步**: 當 operator 提供 structured authorization/drill schema 與輸入時執行

### 🔴 仍缺外部依賴資源 / 未執行驗收 (Parents - Blocked / Acceptance)
下列事項未具備外部真實資源或憑證，需等待相關負責方提供，或尚未執行實作 Live 驗證步驟。未做 live 項不可宣稱通過。

1. **SR-LIVE-OPS-001** (隔離運營目標/備份還原)
   - **狀態**: Blocked
   - **缺項**: 待執行驗收證據 (backup_restore_readback, rpo_rto_capacity_baseline, scheduled_job_restart_proof)。此為 pending execution evidence，而非隔離目標不存在之證明。
   - **負責方/下一步**: Operator/DevOps 於授權後執行 live evidence run。
2. **SR-LIVE-ENTRY-001** (受控環境變更/DNS/TLS)
   - **狀態**: Blocked
   - **缺項**: 缺 DRTS_LIVE_ENTRY_* (allowlist/targets/role/routing)、DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN 及 deployed candidate 授權。DEV_IAP_CLIENT_ID 並非唯一 gate。
   - **負責方/下一步**: Operator/Security 提供 DRTS_LIVE_ENTRY_* 授權。保留 gate，未取得前不授權 restore/load/restart/env change。
3. **SR-LIVE-PUSH-001** (真夥伴通知端點與原生 App)
   - **狀態**: Blocked
   - **缺項**: 真夥伴 HTTPS webhook endpoint 與原生測試 App。
   - **負責方/下一步**: 外部夥伴建立端點。
4. **SR-LIVE-MAIL-001** (邀請與簽核真郵件)
   - **狀態**: Blocked
   - **缺項**: Mail provider credentials。
   - **負責方/下一步**: 平台管理端開通 SMTP/third-party credentials。
5. **SR-LIVE-FINANCE-001** (金流 sandbox)
   - **狀態**: Blocked
   - **缺項**: Financial sandbox credentials。
   - **負責方/下一步**: Finance/External Provider 提供 sandbox credentials。
6. **SR-LIVE-MAP-001** (地圖/ETA API)
   - **狀態**: Not Verified
   - **缺項**: 未查驗 GCP Secret Manager 內之 map API keys。不能僅因 PROD_MAP_PROVIDER_BACKEND=mock 且 GitHub secrets 未見就斷定資源不存在。
   - **負責方/下一步**: Operator 檢查 GCP Secret Manager (deploy-dev.yml:645-746)。
7. **SR-LIVE-DRIVER-001** (原生裝置驗收)
   - **狀態**: Blocked
   - **缺項**: Android/iOS 實體裝置或設備農場。
   - **負責方/下一步**: QA 提供實體設備或農場存取權。
8. **UV-EXEC-028** (真實 PSTN/CTI)
   - **狀態**: Acceptance
   - **缺項**: Acceptance execution。
   - **負責方/下一步**: Operator/QA 執行 acceptance process。
9. **UV-EXEC-029** (Unattended voice pilot)
   - **狀態**: Blocked
   - **缺項**: Structured authorization/drill schema, inputs。
   - **負責方/下一步**: Operator 提供 drill schema 並執行 UV-EXEC-029-PILOT-RUNNER。
10. **SR-LIVE-FORWARD-001** (外部派車 Sandbox)
    - **狀態**: Blocked
    - **缺項**: Forwarder sandbox credentials。
    - **負責方/下一步**: External Partner 提供 credentials。
11. **SR-LIVE-DOC-001** (正式受控檔案與簽章)
    - **狀態**: Blocked
    - **缺項**: SR_LIVE_DOC_LIVE_SESSION_COOKIE, SR_LIVE_DOC_LIVE_PUBLIC_KEY_PEM (public key, 不要求 private key), authorization target/bank/path。
    - **負責方/下一步**: Security/Operations 提供 cookie, public key, 及路徑授權。取得後可重用既有 DOC-RUNNER。(備註: deploy 35430134402 成功 Resolve API secret mounts 僅證明 smoke 狀態，不代表 controlled-download HMAC 就是 bank file signing private key，也不能推論所有 provider 資源不存在)

