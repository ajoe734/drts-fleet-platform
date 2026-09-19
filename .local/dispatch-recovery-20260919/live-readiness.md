# SR-LIVE-READINESS-20260919 盤點報告

## 1. 查核資訊
- **時間**: 2026-09-19T14:21:00Z
- **指令**: `gh run view 35430134402 --log`, `gh secret list`, `gh variable list`
- **來源 run**: 35430134402
- **真實 Deployed SHA**: `98e251cdc809467b16a158fc2f285e4296206f5f`

> **重要備註**: 經由 `deploy-dev` log (run 35430134402) 查證，實際部署的 SHA 為 `98e251cdc809467b16a158fc2f285e4296206f5f`。該 Commit 位於近期變更之前，**因此目前部署之環境並不包含後來實作的 SEQ/TRANSPORT (SR-PARTNER-NOTIFY-SEQ-20260918, SR-PARTNER-NOTIFY-TRANSPORT-20260918) 相關變更**。不可宣稱該等功能已在 dev 環境發布。

## 2. 資源狀態

### 🟢 已具備資源 (可直接恢復，解除舊 blocker)
*(無。所有要求 Live 驗證的任務均缺乏必要的真實環境證據或資源)*

### 🔴 仍缺外部依賴資源 (維持 Blocked)
下列事項未具備外部真實資源或憑證，需等待相關負責方提供，或實作 Live 驗證步驟，維持 Blocked 狀態。未做 live 項不可宣稱通過。

1. **SR-LIVE-OPS-001** (隔離運營目標/備份還原)
   - **缺項**: 雖有 `DEV_GCP_PROJECT_ID` 等變數，但缺乏真實可取回的 `backup_restore_readback`, `rpo_rto_capacity_baseline`, `scheduled_job_restart_proof`, `live_candidate_sha`。
   - **負責方/下一步**: 先完成已授權唯讀準備，未取得前不執行依賴的外部操作。
2. **SR-LIVE-ENTRY-001** (受控環境變更/DNS/TLS)
   - **缺項**: `DEV_IAP_CLIENT_ID` 為空，且缺乏真實可取回的 `public_dns_tls_readback`, `legitimate_role_accounts`, `live_candidate_sha`。
   - **負責方/下一步**: 先完成已授權唯讀準備，未取得前不執行依賴的外部操作。
3. **SR-LIVE-PUSH-001** (真夥伴通知端點與原生 App)
   - **缺項**: 真夥伴 HTTPS endpoint (如 yuhe-residence)、真機測試 App 與接收端帳號。
   - **負責方/下一步**: 等待外部合作夥伴建立端點、並提供 App 接收驗證環境。A controlled receiver 不可替代 B/C 驗證。
4. **SR-LIVE-MAIL-001** (邀請與簽核真郵件)
   - **缺項**: `configured_mail_provider` 憑證與測試信箱。
   - **負責方/下一步**: 平台管理端需開通 SMTP 或第三方發信憑證。
5. **SR-LIVE-FINANCE-001** (金流 sandbox)
   - **缺項**: `authorized_financial_sandbox` 憑證 (Stripe/LinePay 等)。
   - **負責方/下一步**: 財務/外部金流提供 Sandbox 帳號。
6. **SR-LIVE-MAP-001** (地圖/ETA API)
   - **缺項**: 真實地圖 API 憑證。目前系統變數 `PROD_MAP_PROVIDER_BACKEND` 設定為 `mock`。
   - **負責方/下一步**: 地圖服務商開通專屬測試 API Key。
7. **SR-LIVE-DRIVER-001** (原生裝置驗收)
   - **缺項**: `authorized_android_ios_devices`，即真機裝置或測試農場。
   - **負責方/下一步**: QA 提供實體 Android/iOS 設備。
8. **UV-EXEC-028** (真實 PSTN/CTI)
   - **缺項**: 真實 PSTN 門號、CTI/TWM/SIP 憑證。
   - **負責方/下一步**: 外部電信業者開通線路。
9. **SR-LIVE-FORWARD-001** (外部派車 Sandbox)
   - **缺項**: `authorized_forwarder_sandbox`。
   - **負責方/下一步**: 外部車隊合作商提供 Sandbox 憑證。
10. **SR-LIVE-DOC-001** (正式受控檔案與簽章)
    - **缺項**: 獨立簽章金鑰或憑證 (`authorized_storage_and_signer`)。
    - **負責方/下一步**: 資安或維運單位配置金鑰。
