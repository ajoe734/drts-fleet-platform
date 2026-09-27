# Sources and Case Matrix

正式依據：同目錄 `01_system_sa_sd.md` §4–14 與 `02_partner_integration_contract.md`
§3–9（canonical root可讀，未把held設計複製發布）。完整finding/SHA與證據沿用
[原UAT artifact](../../04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md)。

## SD §14 Case Matrix

| Scenario | 正式期望與現有位置 | 驗收狀態 |
| --- | --- | --- |
| 正向worker delivery | C201；200/201/202 + 相符durable accepted/duplicate receipt；partner_accepted，downstream unknown | checkpoint setup failed；未驗 |
| accepted後timeout與dedupe | C202；大於10秒deadline、同notification/delivery/body hash、同receipt duplicate、只入列一次 | fixture failed；未驗 |
| 缺route | C203；typed route_missing/manual_only、不猜entry、receiver count=0 | generic failed斷言不足；未驗 |
| 204、HTML200、錯receipt | C204；partner_ack_invalid/manual_only，不能自動retry | fixture failed；未驗 |
| 同tenant兩entry、跨tenant同URL、同住戶兩App | 僅原entry/tenant/subject收到，payload不串單 | 缺整合案例 |
| entry移轉與link撤銷 | 舊消息不移轉；owner_changed/manual_only與recipient_revoked/terminal；零外送 | 缺整合案例 |
| endpoint停用、secret輪替重測、未配置availability | 明確configuration_blocked；測試就緒後才enable | 缺整合案例 |
| ack後DB失敗、lease/fence、兩worker競爭 | durable transaction、舊fence不可commit、dedupe且單retry owner | PG歷史21/21；缺整合fault evidence |
| maxAttempts=5與expiry | 總共五次、最多四次retry、超expiresAt停止 | 缺整合案例 |
| 舊ETA、取消後舊到場、payload confidentiality | superseded/obsolete terminal；缺driver情報不洩漏敏感資料 | 缺整合案例 |
| admin readiness/stage/failure與手動retry | C205；真route/auth、點control、觀察request及durable readback | checkpoint無Chromium；未驗 |
| notification-navigation | fresh single-use handoff、HttpOnly session、returnTo、最新ride readback、錯entry/subject/logout/account switch | 缺hosted runtime案例 |
| 一般tenant webhook C111–C115與restart | 獨立既有gate不可由partner數量取代 | checkpoint C111/112 passed；C113–115/restart skipped |

## Acceptance Matrix

- `integrated_controlled_receiver_negative_matrix_same_sha`：**NOT MET**（R1/R2/R6/R9）。
- `navigation_and_admin_ui_hosted_real_runtime_evidence`：**NOT MET**（R5）。
- `existing_webhook_tenant_gates_preserved_and_live_not_claimed`：**NOT MET**（R2/R3/R9）。

A：DRTS受控receiver/PG/browser全套同SHA通過才是 `controlled_receiver_verified`；目前未達。
B：`SR-LIVE-PUSH-001` 真夥伴HTTPS request/response、receipt/outbox才是 `partner_endpoint_verified`；未執行。
C：真夥伴native App背景/冷啟動通知與fresh handoff正確ride（支援雙平台須iOS/Android）；未執行。
A不能代替B，B不能代替C；本案無真夥伴/真機通過宣稱。

## Pinned Evidence

最新獨立review候選 `62962c9eb4bc10652c9e8314cc145064fa3c56ff`：REOPEN；
[run36331863431](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36331863431/job/108655212817)
API build failed、runtime skipped，artifact10936380053；完整hash在原UAT artifact。

交接checkpoint `91b1d4ac122b1373ac7beb05df902cb991b62232`：
[run36333604497/job108660116702](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36333604497/job/108660116702)，
artifact10936532926，ZIP SHA256 `4307d12373836309d2e565e00de208ab1c912d104efdf8f597914da14381f0e8`。
unit280/280、PG21/21是真實該SHA歷史；partner E2E fail、restart skipped；整體failed。
本輪修復仍在進行，尚未handoff新candidate，不把歷史綠燈帶到新SHA。
