# SR-INVOICE-MAIL-20261004 — C079 月結帳單寄信與失敗追蹤

Owner: Codex；Reviewer: Codex2。初始版本 `0e4b93191e039acabf71549495bd07c0cfa618ee`；本次沒有前輪候選或退修。

## 依據與修正邊界

- PRD §租戶管理（billing profile / invoice 收件）、service contracts Billing Service、SC-030 與 SC-050 財務權限；C079 `source/capabilities.json` 要求帳單連結、寄信與失敗追蹤。原指定文件不存在，於本任務建立並持續累積證據。
- `BillingSettlementController.updateTenantBillingProfile` 只信任 `x-tenant-id`；`BillingSettlementService.generateTenantInvoice` 只寫站內通知。原帳務收件人與帳單真值為 `billing.phase1_tenant_billing_profiles` / `billing.phase1_tenant_invoices`（V0012 的 record JSONB），不能以種子預設信箱寄信。
- 新寄送／回讀入口以已驗證租戶 identity、billing scope 與帳單歸屬授權；同步修補帳務 profile／invoice 讀寫入口，避免改寫其他租戶收件人或經郵件頁讀出其他租戶帳單。
- 使用既有 `PostgresMailOutbox` / `NotificationDeliveryService`（V0103），每張帳單固定 key；首筆內容與收件人不可變，retry 不新增信件。既有排程 drain 處理 crash／backoff；手動重試也遵循同一 lease、次數與退避。
- 信件連回 HTTPS Tenant Console 的 `/invoices?invoiceId=...`，需登入並重新授權；不用會過期的 bearer artifact URL。送信動作不接受 recipient/body/link。`sent` 只代表供應商接受；真收件另驗收。

## Finding 與 acceptance 證據

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F01 跨 tenant 可改帳務收件人 | BillingSettlementController.updateTenantBillingProfile | 舊版真 controller + service 接受 tenant A identity 改 tenant B 信箱；修復待驗 | `pnpm exec vitest run tests/unit/invoice-mail-20261004/authorization.test.ts`，初始 SHA，exit 1（預期 rejection 實際成功）；`.local/invoice-mail-20261004/baseline.log` | 本機不開 HTTP server |
| tenant_authorized_invoice_mail_path | 新 mail API + profile／invoice 授權 | 待實作驗證 | 待補 | browser／hosted 驗證待驗 |
| durable_idempotent_delivery_and_readback | 既有 outbox + invoice producer | 待實作驗證 | 待補 | PostgreSQL 正式 schema 與真實收件不得以 unit mock 宣稱通過 |
| regression_and_same_sha_review_ci | contracts／client／UI／billing regression | 待實作驗證 | 待補 | review／CI／merge 由 candidate lifecycle 記錄 |

VM 不啟動 product、browser、preview、Docker 或 PostgreSQL 服務。本機證據存 `.local/`；真 SMTP 與授權收件匣尚未驗收。
