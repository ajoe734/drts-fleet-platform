# PORTAL-PASSWORD-LOGIN-20261113：實作任務包

Owner: Claude · Reviewer: Claude2 · 依據：[決策紀錄](../../01-decisions/SD-DP-20261113-001-portal-password-login.md)、[SA/SD](01_system_sa_sd.md)

依相依順序列出，Supervisor 可直接登記為個別任務。每個任務的 `required_acceptance` key 採 `<task-id 小寫>_ready` 格式；`test_commands` 為本機可執行的檢查（本 VM 不得啟動服務/瀏覽器/Docker/資料庫，涉及 PG/hosted 的項目已標註為 hosted-only）。

## PWD-LOGIN-001：依賴與 schema 基線

- 目的：新增 Argon2id、TOTP（RFC 6238）、QR code 產生所需的套件依賴，並建立四張新表（§SA/SD §2）。
- write_scopes：`package.json`、`apps/api/package.json`、`pnpm-lock.yaml`、`infra/migrations/V0138__portal_password_login_credentials.sql`（實際編號以當時 repo 最新 `infra/migrations/V0NNN` 為準）、`packages/contracts/src/iam-policy-catalog.ts`（如需新增 scope，否則不動）。
- depends_on：無
- 驗收條件：`pnpm install` 可重現 lockfile；migration 可在空白 schema 上 up/down；四張新表的 unique/FK/check constraint 符合 SA/SD §2 定義。
- required_acceptance：`pwd-login-001_ready`
- test_commands：
  - `pnpm install --frozen-lockfile`
  - `pnpm --filter @drts/api exec vitest run tests/unit/**/*migration*.test.ts`（若既有 migration smoke test 套件涵蓋新檔案）
  - hosted-only：真 PG 上執行 migration up/down 並檢查 constraint（本 VM 不可執行）

## PWD-LOGIN-002：密碼雜湊服務（Argon2id + pepper）

- 目的：新增 `apps/api/src/common/auth/password-hashing.service.ts`：`hash(password)`/`verify(password, hash)`，內部套用 Secret Manager pepper（`pepper_version` 支援輪替、opportunistic rehash）。
- write_scopes：`apps/api/src/common/auth/password-hashing.service.ts`（新檔）、對應單元測試。
- depends_on：PWD-LOGIN-001
- 驗收條件：同密碼不同 salt 產生不同 hash；錯誤密碼拒絕；pepper 版本輪替後舊 hash 仍可驗證並於下次登入 rehash 成新版本；未設定 pepper secret 時服務啟動失敗（fail-closed，對齊 Stage 1.5 §15.2）。
- required_acceptance：`pwd-login-002_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/password-hashing.test.ts`

## PWD-LOGIN-003：密碼政策與外洩密碼檢查

- 目的：依 SA/SD §3 實作長度政策（視是否已啟用 TOTP 決定 8/15 字元下限）、離線常見/外洩密碼清單比對。
- write_scopes：`apps/api/src/common/auth/password-policy.service.ts`（新檔）、離線清單資料檔（`apps/api/src/common/auth/data/common-passwords.txt` 或等效壓縮格式）、對應單元測試。
- depends_on：PWD-LOGIN-002
- 驗收條件：長度不足、在清單內的密碼一律拒絕並給出不透露帳號狀態的錯誤；清單比對不呼叫任何外部網路服務。
- required_acceptance：`pwd-login-003_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/password-policy.test.ts`

## PWD-LOGIN-004：邀請接受分支（設定密碼／綁定 Google）

- 目的：擴充邀請接受流程，新增「設定密碼」分支並與既有 `acceptTenantOidcInvitation` 共用 membership/principal 啟用邏輯（SA/SD §1、§5）；agency/partner 側對等擴充。
- write_scopes：`apps/api/src/modules/identity/identity.repository.ts`、`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`、`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`、`packages/agency-auth/src/route-handlers.ts`、`packages/tenant-auth/src/route-handlers.ts`、對應單元/PG 測試。
- depends_on：PWD-LOGIN-001、PWD-LOGIN-002
- 驗收條件：同一 invitation token 只能被消費一次（密碼分支與 Google 分支互斥競爭同一 token 時只有一邊成功）；密碼分支啟用後 `identity_principals.issuer/subject` 不被覆寫；並發消費測試通過。
- required_acceptance：`pwd-login-004_ready`
- test_commands：
  - `pnpm --filter @drts/api exec vitest run tests/unit/tenant-invitation-lifecycle.test.ts`
  - hosted-only PG：`tenant-google-invitation.pg.test.ts` 對等的密碼分支測試

## PWD-LOGIN-005：密碼登入端點與速率限制/鎖定

- 目的：新增 `POST /api/auth/:realm/password-login`，統一錯誤回應、帳號＋IP 速率限制、漸進式鎖定（SA/SD §4）。
- write_scopes：`apps/api/src/modules/auth/auth.controller.ts`、`apps/api/src/common/auth/`（速率限制/鎖定邏輯新檔或擴充既有 throttling 模組）、對應單元測試。
- depends_on：PWD-LOGIN-002、PWD-LOGIN-003、PWD-LOGIN-004
- 驗收條件：帳號不存在／密碼錯／未受邀／已停用四種情境回應逐 byte 相同；鎖定門檻觸發後拒絕，不提示已鎖定；security event 寫入但不含明文。
- required_acceptance：`pwd-login-005_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/password-login.test.ts tests/security/iam-oidc-strict-negative.test.ts`

## PWD-LOGIN-006：忘記密碼／重設

- 目的：新增 `password-reset/request`、`password-reset/confirm`、管理員「發送重設」端點，接到既有 durable SMTP outbox（SA/SD §6）。
- write_scopes：`apps/api/src/modules/auth/auth.controller.ts`、`apps/api/src/modules/identity/identity.repository.ts`（reset token 表存取）、`apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service.ts` 或新增對等 `password-reset-delivery.service.ts`、`apps/api/src/modules/platform-admin/platform-admin.service.ts`（管理員觸發端點）、對應測試。
- depends_on：PWD-LOGIN-002、PWD-LOGIN-004
- 驗收條件：request 一律回 200；confirm 成功後撤銷該 principal 所有 session 並寄送通知信；token 單次/15 分鐘到期；管理員端點不回傳或接受明文密碼。
- required_acceptance：`pwd-login-006_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/password-reset.test.ts`

## PWD-LOGIN-007：TOTP 註冊、驗證與復原碼

- 目的：實作 TOTP enroll/confirm、登入時驗證、復原碼產生與單次消耗、secret envelope encryption（SA/SD §7）。
- write_scopes：`apps/api/src/modules/auth/`（新 TOTP service/controller 路由）、`apps/api/src/common/auth/trusted-mfa.policy.ts`（如需調整註解，不新增 AMR 值）、`apps/api/src/common/auth/step-up.policy.ts`（如新增特定路由項目）、對應測試。
- depends_on：PWD-LOGIN-002、PWD-LOGIN-004
- 驗收條件：未確認的 secret 不能用於登入；TOTP code 時間窗驗證含防重放；復原碼單次消耗後立即失效並強制重新註冊；secret 不以明文存 DB 或出現於 log。
- required_acceptance：`pwd-login-007_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/totp-enrollment.test.ts tests/unit/totp-login.test.ts`

## PWD-LOGIN-008：Session 簽發一致性

- 目的：密碼（+TOTP）登入成功後透過 `JwtAuthService.issueSessionToken` 簽發與 Google 路徑相同結構的 session，正確設定 `amr`（`pwd`／`pwd,otp`）；確保 enterprise dispatch 共用 tenant membership 的既有機制不受影響。
- write_scopes：`apps/api/src/modules/auth/auth.controller.ts`、`apps/api/src/common/auth/jwt-auth.service.ts`（如需擴充呼叫參數，不改既有 claim 結構）、`apps/enterprise-dispatch-web/app/api/auth/[...auth]/route.ts`（如需銜接密碼登入入口）、對應測試。
- depends_on：PWD-LOGIN-005、PWD-LOGIN-007
- 驗收條件：密碼+TOTP 登入後的 session 可被既有 `GET /api/auth/session`、`logout`、`logout-all`、`sessions` 端點正確識別與撤銷；enterprise dispatch host 能承接同一 tenant membership 的已登入狀態。
- required_acceptance：`pwd-login-008_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/identity-session.test.ts tests/unit/identity-session-context.test.ts`

## PWD-LOGIN-009：四入口 UI（登入、設定密碼、TOTP、帳號安全）

- 目的：四個 app 的登入頁加入帳密表單並保留 Google 按鈕；新增設定密碼、忘記密碼/重設、TOTP 註冊/驗證、帳號安全頁（SA/SD §9）。
- write_scopes：`apps/tenant-console-web/**`、`apps/enterprise-dispatch-web/**`、`apps/agency-portal-web/**`、`apps/fleet-partner-portal-web/**`（僅新增/修改登入與帳號安全相關路由、元件、翻譯檔）、`packages/tenant-auth/**`、`packages/agency-auth/**`、`packages/ui-web/**`（共用表單元件，如需要）。
- depends_on：PWD-LOGIN-005、PWD-LOGIN-006、PWD-LOGIN-007、PWD-LOGIN-008
- 驗收條件：zh-TW/en 文案完整；表單可鍵盤操作；TOTP 畫面提供文字 secret 作替代內容；四個入口畫面一致但各自 host 的 cookie/session 行為不互相污染。
- required_acceptance：`pwd-login-009_ready`
- test_commands：
  - `pnpm --filter @drts/tenant-console-web exec vitest run`（新增/受影響測試）
  - `pnpm --filter @drts/agency-portal-web exec vitest run`
  - `pnpm --filter @drts/fleet-partner-portal-web exec vitest run`
  - `pnpm --filter @drts/enterprise-dispatch-web exec vitest run`
  - 各 app `pnpm --filter <app> typecheck`

## PWD-LOGIN-010：部署設定（secret 全有或全無、rail 檢查）

- 目的：在 dev 與正式環境部署管線加入 pepper／TOTP 加密金鑰的全有或全無檢查（SA/SD §10）。
- write_scopes：`.github/workflows/deploy-dev.yml`、`.github/workflows/deploy-prod.yml`、`operations/verification/production-release-rail/rail.cjs`、相關部署測試（如 `tests/unit/deploy-dev-google-oidc.test.ts` 旁新增對等測試檔）。
- depends_on：PWD-LOGIN-001、PWD-LOGIN-007
- 驗收條件：缺任一新 secret 時 workflow 在部署前失敗；全部存在才啟用密碼登入路徑；不讀取/輸出 secret 值到日誌。
- required_acceptance：`pwd-login-010_ready`
- test_commands：`pnpm exec vitest run tests/unit/deploy-dev-password-login.test.ts`（新檔，比照 `deploy-dev-google-oidc.test.ts` 模式）

## PWD-LOGIN-011：自動化驗收矩陣（單元＋PG＋資安負向）

- 目的：補齊 SA/SD §11 的完整負向測試矩陣：帳號列舉、暴力破解、token 重放、MFA 繞過、跨 realm、跨租戶。
- write_scopes：`apps/api/tests/**`、`tests/security/**`、`tests/unit/**`（僅新增測試檔，不改產品碼；若發現產品碼缺陷則回報對應 PWD-LOGIN-00x 任務修正，不在本任務直接擴大 write_scopes）。
- depends_on：PWD-LOGIN-004、PWD-LOGIN-005、PWD-LOGIN-006、PWD-LOGIN-007、PWD-LOGIN-008、PWD-LOGIN-009
- 驗收條件：矩陣全綠；本機無 PG 的項目明確標記 hosted-only 並列出對應 hosted CI job。
- required_acceptance：`pwd-login-011_ready`
- test_commands：
  - `pnpm --filter @drts/api exec vitest run`
  - `pnpm exec vitest run tests/security/`
  - hosted-only：`pnpm --filter @drts/api test`（含 `.pg.test.ts`，需正式 migrations 與真 PG）

## PWD-LOGIN-012：Hosted dev 實機驗收證據（外部閘門）

- 目的：在共享 dev 環境對四個入口各走一次「邀請→設定密碼→TOTP→登入→登出→重設密碼」，產出證據包（SA/SD §11）。
- write_scopes：僅文件/證據檔案（例如 `docs/04-uat/` 或任務自己的 `.local/` 證據目錄），不改產品碼。
- depends_on：PWD-LOGIN-009、PWD-LOGIN-010、PWD-LOGIN-011
- 驗收條件：四入口各一組完整走訪證據（截圖/trace + 對應 SHA/CI/部署 revision）；本 VM 不得執行，必須在共享 dev 或等效 hosted 環境完成。
- required_acceptance：`pwd-login-012_ready`
- external_gate：`true`（需要可用的 hosted dev 環境與真實 SMTP/TOTP app，不是本機可自證的任務）
- test_commands：
  - 本 VM 禁止執行：不得在本機啟動瀏覽器、Docker、playwright 或任何 preview/dev server 來模擬或替代此驗收；本機沒有可產出有效證據的指令。
  - hosted-only（僅可在共享 dev 或等效 hosted 環境執行）：對 tenant-console-web、enterprise-dispatch-web、agency-portal-web、fleet-partner-portal-web 四個入口各走一次「邀請→設定密碼→TOTP 註冊→登入→登出→重設密碼」，並收集：(1) 每步驟畫面截圖或 browser trace（如 Playwright trace.zip）；(2) 對應的 deploy-dev 或正式環境部署 revision 與 commit SHA；(3) PWD-LOGIN-009、PWD-LOGIN-010、PWD-LOGIN-011 的 CI 綠燈 run 連結。
  - 證據存放：`docs/04-uat/portal-password-login-20261113/` 或本任務的 `.local/` 證據目錄，依入口與步驟命名；證據完成後才可記錄 `pwd-login-012_ready`。
