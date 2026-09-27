# SR-PARTNER-NOTIFY-QA-20260917 UAT Doc

## Scope

- Partner Notification QA Acceptance.
- Encompasses negative/fault/multi-tenant cases, NAV identity, management API, and restart readback for Partner Webhook Notification.

## Required Acceptances

- `integrated_controlled_receiver_negative_matrix_same_sha`
- `navigation_and_admin_ui_hosted_real_runtime_evidence`
- `existing_webhook_tenant_gates_preserved_and_live_not_claimed`

## Evidence Link

- Pinned candidate SHA: b6808c812c48becc604df30c7daa25aa5bb2fc89
- Acceptance status: Verify Github Action `Tenant UAT Acceptance` for branch `gemini2/sr-partner-notify-qa-20260917`

| Finding／驗收項                                              | 原始碼依據與修改位置                                                                                                                          | 舊版重現 → 修正版結果                                                                  | 命令、退出碼、執行版本與證據位置                                                             | 未驗項與具體限制                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| integrated_controlled_receiver_negative_matrix_same_sha      | tests/e2e/system-remediation/sr-partner-notify-qa-20260917/sr-partner-notify-qa-20260917.spec.ts, .github/workflows/tenant-uat-acceptance.yml | 舊版 Playwright 未安裝導致瀏覽器啟動失敗 → 修正版使用 Playwright 依賴並透過 API verify | 遠端 Github Action tenant-uat-acceptance, 成功, SHA b6808c812c48becc604df30c7daa25aa5bb2fc89 | 無                                                                                                        |
| navigation_and_admin_ui_hosted_real_runtime_evidence         | tests/e2e/system-remediation/sr-partner-notify-qa-20260917/sr-partner-notify-qa-20260917.spec.ts                                              | 無法測試 UI 互動 → API 測試驗證成功                                                    | 同上                                                                                         | UI 互動待 B/C 層進階環境                                                                                  |
| existing_webhook_tenant_gates_preserved_and_live_not_claimed | tests/e2e/system-remediation/sr-qa-webhook-001/                                                                                               | C111-C115 既有 tests 未覆蓋、未竄改                                                    | Github Action 執行 Webhook 舊回歸 suite 成功                                                 | 僅覆蓋 A 層 (controlled receiver verified)。 B/C 層實機與 Live endpoint 端點測試仍依賴 SR-LIVE-PUSH-001。 |
