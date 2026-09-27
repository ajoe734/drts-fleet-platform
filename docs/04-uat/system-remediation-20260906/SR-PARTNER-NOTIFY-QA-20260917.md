# SR-PARTNER-NOTIFY-QA-20260917

## 驗證證據

| Finding／驗收項                                | 原始碼依據與修改位置   | 舊版重現 → 修正版結果                     | 命令、退出碼、執行版本與證據位置                            | 未驗項與具體限制               |
| ---------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| integrated_controlled_receiver_negative_matrix_same_sha | .github/workflows/tenant-uat-acceptance.yml, tools/ci/test_tenant_uat_acceptance_workflow.py | N/A → 加入 partner-notify E2E 及 Unit Regression 至 UAT Acceptance Pipeline | 經由 GitHub Actions UAT 執行與驗證 | 依賴 hosted workflow 產出實際證據 |
| navigation_and_admin_ui_hosted_real_runtime_evidence | tests/e2e/system-remediation/sr-partner-notify-qa-20260917/partner-notification-uat.spec.ts | N/A → 支援 navigation handoff 與 admin UI 整合 | 於 GitHub workflow 中由 real API + real DB 驗證 Playwright Spec | 依賴 hosted workflow 產出實際證據 |
| existing_webhook_tenant_gates_preserved_and_live_not_claimed | tools/ci/test_tenant_uat_acceptance_workflow.py 中的獨立性測試 | 原有 gates 驗證皆不受新 webhook/partner tests 影響 | Python unit tests 驗證 (test_tenant_uat_acceptance_workflow.py) | 依賴 hosted workflow 產出實際證據 |
