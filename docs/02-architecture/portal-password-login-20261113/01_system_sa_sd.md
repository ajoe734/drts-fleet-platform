# PORTAL-PASSWORD-LOGIN-20261113：SA/SD

Owner: Claude · Reviewer: Claude2 · Decision: [SD-DP-20261113-001](../../01-decisions/SD-DP-20261113-001-portal-password-login.md)

本文件依原 task spec §2 的 12 個主題逐項回答，並引用現有程式位置。範圍：`tenant-console-web`、`enterprise-dispatch-web`、`agency-portal-web`、`fleet-partner-portal-web` 四個外部入口的帳號密碼登入，與既有 Google OIDC 並存。

## 0. 現有身分鏈基線（本設計的起點）

- Realm 與 session 拓樸：`docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md` §6.1（realm 表）、§6.2（identity resolution 最小欄位）、§6.3（token/BFF 原則）。
- Canonical 資料模型：`infra/migrations/V0068__canonical_identity_authority.sql` 的 `iam.identity_principals`（`(issuer, subject)` unique，`principal_type` 現為 `human/service/device/partner_machine`，`account_status` 含 `invited→pending_verification→active→locked|suspended→disabled→deletion_pending→deleted`）、`iam.identity_memberships`（`(principal_id, realm, scope_ref)` unique）。
- Tenant OIDC 流程與 BFF 契約：`docs/02-architecture/entry-tenant-google-oidc-20261005.md`、`docs/02-architecture/iam-minimum-operational-closure-system-design-20260815.md`（canonical topology、cookie 契約、CSRF、route classification；該文件 §7 明寫「不引入 password authentication」——本決策正是對此的範圍內修正）。
- Agency 入口：`docs/02-architecture/bureau-agency-readonly-20261024.md`（realm/scope/資料模型、`packages/agency-auth`、`drts_agency_session`／`drts_agency_oidc_state`／`drts_agency_csrf` cookie、D2 未決事項）。
- 程式：`apps/api/src/modules/auth/auth.controller.ts`（`:realm/login`、各 realm `callback-session`、`logout`、`logout-all`、`sessions`）、`apps/api/src/modules/auth/oidc-pkce.service.ts`、`apps/api/src/modules/auth/oidc-id-token-verifier.ts`、`apps/api/src/common/auth/jwt-auth.service.ts`（`issueSessionToken`/`verifyAccessToken`，payload 含 `sid`/`tokenVersion`/`amr`/`acr`）、`apps/api/src/common/auth/trusted-mfa.policy.ts`（`STRICT_TRUSTED_AMR = {mfa, otp, totp, push, webauthn, fido2, verified_iap_workforce}`）、`apps/api/src/common/auth/step-up.policy.ts`（逐路由 `freshnessWindowMs`，10/15 分鐘）、`apps/api/src/modules/identity/identity.repository.ts`（principal/membership/invitation upsert）、`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`（`issueTenantInvitation`/`acceptTenantInvitation`/`acceptTenantOidcInvitation`）、`apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service.ts`（既有 durable SMTP outbox 介接）、`packages/tenant-auth/src/route-handlers.ts`、`packages/agency-auth/src/route-handlers.ts`、`apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts`。
- 既有邀請 token：`rawToken = "ti_" + randomBytes(32).base64url()`（256-bit）、`tokenHash = sha256(rawToken)`、`expiresAt = +24h`、單次（`consumeInvitationToken`）——完全符合 Stage 1.5 §7.1／§9.3 的 128-bit/hash-only/單次/24h 要求，帳密登入的邀請接受流程直接沿用。
- 目前 repo **沒有** `argon2`/`bcrypt`/`otplib`/`speakeasy`/`qrcode` 依賴（已用 `grep` 確認 `package.json`、`apps/api/package.json`、`pnpm-lock.yaml`）；本設計需新增依賴（見實作任務包 PWD-LOGIN-001）。

## 1. 身分模型

**密碼憑證掛在哪個 canonical principal 上**：掛在既有 `iam.identity_principals` 上，**不新增第二個使用者資料庫**。

現況：邀請簽發時（`issueTenantInvitation`）即建立 `invited` 狀態的 principal，其 `(issuer, subject)` 暫填佔位值（tenant 現況是 `LEGACY_TENANT_USER_ISSUER` + 使用者內部 ID）；接受邀請時若選 Google，`acceptTenantOidcInvitation` 的 `activateUser` 把 `issuer`/`subject` 覆寫成 Google 的真實 `(issuer, sub)` 並轉 `active`。

新設計：新增一張 **1:1** 的 `iam.identity_password_credentials` 表（`principal_id` 為 PK/FK，見 §2），**不占用** `identity_principals.issuer`/`subject` 欄位。理由：

- `(issuer, subject)` 的 UNIQUE 約束語意是「這個外部 IdP 身分對應哪個 principal」，密碼不是外部 IdP，不應該偽造一個 `issuer` 值去搶用這組約束，否則「同一人之後再綁 Google」時會與既有 `activateUser` 覆寫邏輯衝突。
- 分離後，一個 principal 可以同時有「0 或 1 筆 Google `(issuer,subject)` 綁定」與「0 或 1 筆密碼 credential」，兩者互不覆寫；§12 的「並存風險與遷移」就是以此為基礎設計。

邀請接受時使用者二選一（或都做，不互斥）：

- 選「設定密碼」：principal 轉 `active`，`identity_principals.issuer/subject` **維持邀請時的佔位值**（與今日 Google-only 情境下、使用者還沒接受邀請前的狀態一致，只是現在這個佔位值可能永久保留，因為使用者可能永遠不綁 Google），同時寫入 `identity_password_credentials`。
- 選「綁定 Google」：行為與今日相同，`activateUser` 覆寫 `issuer/subject` 為 Google 值。
- 兩者都落在 `issueTenantInvitation` 當時建立的**同一個** `membershipId`／`principalId`／角色上，不建立第二個 membership。

**同一人同時有 Google 與密碼時的綁定**：不得只憑 email 自動合併。綁定密碼本身不需要身分比對（密碼是邀請流程內設定，邀請本身已經過 email 驗證）；但「既有只用 Google 的使用者事後加設密碼」必須先用現有有效 session（若角色要求 MFA 則需 fresh MFA）呼叫新端點 `POST /api/auth/:realm/credentials/password`，以 `principalId`（來自已驗證 session，不是 request body 的 email）寫入 `identity_password_credentials`；反向「已有密碼的使用者事後綁 Google」沿用既有 `acceptTenantOidcInvitation`／新增對等的「已登入使用者綁定 Google」端點，同樣以 session 內的 `principalId` 比對，不接受 client 送來的 email 做合併依據。

**四個 realm 的對應關係**：

| 入口                       | realm     | membership scope      | 說明                                                                                                               |
| -------------------------- | --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `tenant-console-web`       | `tenant`  | `tenant:{tenantId}`   | 既有                                                                                                               |
| `enterprise-dispatch-web`  | `tenant`  | `tenant:{tenantId}`   | 與租戶後台共用同一 membership／session 規則（`entry-tenant-google-oidc-20261005.md`），各自 host 持有自己的 cookie |
| `agency-portal-web`        | `agency`  | `agency:{agencyId}`   | 既有（`bureau-agency-readonly-20261024.md` §2）                                                                    |
| `fleet-partner-portal-web` | `partner` | `partner:{partnerId}` | 既有（`partner/callback-session`、`packages/tenant-auth` 慣例）                                                    |

## 2. 儲存

新 migration（接續既有最後一支 `V0137`，實作時以當時 repo 最新號碼為準，暫定 `V0138`）新增：

```sql
CREATE TABLE iam.identity_password_credentials (
  principal_id varchar(100) PRIMARY KEY REFERENCES iam.identity_principals(principal_id),
  password_hash text NOT NULL,            -- argon2id 編碼字串（含 algorithm/params/salt）
  password_algo varchar(20) NOT NULL DEFAULT 'argon2id',
  pepper_version varchar(20) NOT NULL,     -- 對應 Secret Manager 的 pepper 版本，支援輪替
  must_change_at timestamptz,              -- 管理員強制下次登入改密碼時使用，一般流程為 null
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE iam.identity_totp_credentials (
  principal_id varchar(100) PRIMARY KEY REFERENCES iam.identity_principals(principal_id),
  secret_ciphertext bytea NOT NULL,        -- KMS/Secret Manager envelope-encrypted TOTP secret
  secret_key_version varchar(20) NOT NULL,
  confirmed_at timestamptz,                -- null = 已產生但未完成註冊確認
  last_used_step bigint,                   -- 防同一 TOTP code 重放
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE iam.identity_totp_recovery_codes (
  recovery_code_id varchar(100) PRIMARY KEY,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  code_hash text NOT NULL,                 -- sha256 或 argon2id，只存 hash
  used_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE iam.identity_password_reset_tokens (
  token_hash text PRIMARY KEY,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL
);
```

**Argon2id 參數**：遵循 RFC 9106「RFC 9106 §4 的 second recommended option（非高記憶體伺服器場景）」基線起點 `memory=19 MiB (19456), iterations=2, parallelism=1`，由實作任務在真實 API 容器資源下量測調整並記錄於 migration 旁的 ADR 註記；memory-hard，每使用者隨機 salt（由 argon2 libray 內建產生並編碼進 `password_hash`）。

**Server pepper**：額外的 server-side secret（不是 salt），存於 Secret Manager（`drts-{env}-password-pepper`），hash 時以 `HMAC-SHA256(pepper, password)` 的輸出再餵給 argon2id，等同於「資料庫全部外洩但 pepper 沒有外洩」時仍無法離線暴力破解。`pepper_version` 欄位支援未來輪替（新 pepper 版本上線後，舊版本仍可驗證既有 hash，下次登入成功時 opportunistic rehash 成新版本）。

**任何地方都不出現明文**：密碼只在 `POST .../password-login`、`POST .../credentials/password`、`POST .../password-reset/confirm` 的 request body 短暫存在於記憶體，不寫入 log、不寫入 audit record、不回傳。`identity_password_reset_tokens`／`identity_totp_recovery_codes` 同既有邀請 token 模式，只存 hash。

## 3. 密碼政策

依 NIST SP 800-63B-4（2026 修訂）：

- **帳密為唯一因素**（即該角色不屬於 Stage 1.5 §7.2 強制 MFA 清單、或尚未完成 TOTP 註冊前的過渡期）：最小長度 **15** 字元。
- **搭配 MFA（TOTP 已啟用）**：最小長度 **8** 字元。
- 最大長度：**128** 字元（防止 hash 演算法 DoS，不是安全需求）。
- **不設組成規則**（不強制大小寫/數字/符號），依 800-63B-4 建議。
- 檢查常見／外洩密碼清單：採**離線清單**（`zxcvbn`-style 常見密碼字典 + 已知外洩 top-N 列表，隨服務部署，不即時對外呼叫）。理由：k-anonymity API（如 HaveIBeenPwned range API）即使只送出密碼 SHA-1 前 5 字元也是對外第三方服務的額外相依與延遲；dev/prod 都要穩定運作，且車行/機關入口可能在受限網路環境，離線清單更穩定、不洩漏任何使用者輸入內容給第三方。清單需定期更新（實作任務包標註為持續治理項，不阻擋本次上線）。
- 密碼確認（註冊/重設時要求輸入兩次）屬前端 UX，不是後端政策。

## 4. 登入

**統一回應**：`POST /api/auth/:realm/password-login` 對「帳號不存在」「密碼錯」「未受邀（principal 不是 active）」「已停用（suspended/disabled）」一律回傳相同的 `401 AUTHENTICATION_FAILED`（沿用 Stage 1.5 §12.3 既有錯誤碼），不區分訊息文字；真實原因只寫入 `security_events`（`password_login.denied`，`reason` 欄位區分，但不對外）。

**速率限制與鎖定**：

- 帳號維度：`identity_password_credentials.failed_attempts`/`locked_until`，採漸進式：5 次失敗鎖 5 分鐘、10 次鎖 30 分鐘、15 次鎖 24 小時（與現有 driver/tenant 速率限制慣例一致的指數退避風格，實作時對齊既有 throttling 模組 `apps/api/tests/unit/throttling.test.ts` 的既有工具）。鎖定期間一樣回統一的 `401`，不提示「帳號被鎖」。
- IP 維度：既有 open-route rate limiter 擴充一個 `auth:password-login` bucket（Stage 1.5 §15.1 要求 OIDC/invitation/refresh/key exchange 各自有 rate limit，密碼登入屬於同類敏感端點，不能共用一般 quota）。
- 登入成功清空 `failed_attempts`；手動解鎖只能由 `platform_user_admin`/`tenant_admin`（依 realm）觸發「強制重設密碼」，不能直接讀取或設定密碼（§6）。

**安全事件與稽核**：新增 `password_login.issued`/`password_login.denied`/`password_reset.requested`/`password_reset.completed`/`totp.enrolled`/`totp.verified`/`totp.denied`/`totp.recovery_used` 寫入既有 `admin.security_events`（`V0069__identity_security_events.sql`），`subject_id_hash` 雜湊化，不記錄明文密碼、TOTP code 或 recovery code。

## 5. 邀請流程

沿用既有邀請 token：`TenantInvitationDeliveryService`／`issueTenantInvitation` 產生的 `ti_` 前綴 token（256-bit random, sha256 hash-only, 單次, 24h）不變；agency/partner 側的對應邀請機制（`bureau-agency-readonly-20261024.md` §2.4）同樣沿用，不新增第二套邀請 token 規格。

**接受邀請畫面**新增分支：使用者點擊邀請信連結進入既有 accept-invitation 頁，呈現兩個選項（可都做）：

- 「設定密碼」：提交新密碼（§3 政策），呼叫新端點 `POST /api/auth/:realm/invitation/accept-with-password`（帶 `invitationToken` + `password`），伺服器驗證 token 後與 `acceptTenantInvitation` 共用「啟用 membership／principal」邏輯，差異只在不要求 Google proof、改寫入 `identity_password_credentials`。
- 「綁定 Google」：行為不變，沿用 `acceptTenantOidcInvitation`。

兩者消費同一個 `tokenHash`、落在 `issueTenantInvitation` 當時建立的同一個 `membershipId`／角色上；resend 邀請（`resendTenantInvitation`）同樣作廢舊 token，不因為新增密碼分支而改變既有 resend/revoke 語意。

## 6. 忘記密碼／重設

- `POST /api/auth/:realm/password-reset/request`：接受 email，**一律回 200 且文字相同**（不洩漏帳號是否存在／是否已設密碼）。若該 email 對應一個已 `active` 且有 `identity_password_credentials` 的 principal，才透過既有 `TenantInvitationDeliveryService` 所依附的同一條 durable SMTP outbox（`NotificationDeliveryService`／`V0103__notification_mail_outbox.sql`）寄出重設信；沒有密碼 credential（例如只用 Google）則不寄信，但回應一樣是 200。
- Reset token：128-bit random、sha256 hash-only、單次（`consumed_at`）、**15 分鐘**到期（比邀請的 24 小時短，因為這是已存在帳號的高風險操作；具體時限為本設計決定，可在實作時與 reviewer 核對是否需要更短）。
- `POST /api/auth/:realm/password-reset/confirm`：帶 token + 新密碼，成功後：寫入新 `password_hash`、**撤銷該 principal 所有既有 session**（呼叫既有 `IdentityRepository` 的 logout-all 等效邏輯，與 Stage 1.5 §9.2「角色變更 60 秒內失效」同一機制）、寄送「您的密碼已被重設」通知信（同一 outbox，不含新密碼或任何敏感內容）。
- **管理員只能「發送重設」**：`platform_user_admin`/`tenant_admin` 可呼叫 `POST /api/identity/users/:id/password-reset/send`（觸發與使用者自己申請相同的信件流程），**沒有**任何 API 回傳或允許設定使用者的明文密碼；此端點本身也要 `reasonCode`（Stage 1.5 §12.2 的 mutation command 規則）與 audit。

## 7. TOTP 兩步驟驗證

- **註冊**：`POST /api/auth/:realm/mfa/totp/enroll` 產生 secret（寫入 `identity_totp_credentials`，`confirmed_at = null`），回傳供前端產生 QR code 的 `otpauth://totp/...` URI（issuer 標為 `DRTS`，label 含 realm/email）；`POST /api/auth/:realm/mfa/totp/confirm` 要求輸入一次有效 code，驗證成功才把 `confirmed_at` 寫入並視為啟用——未確認的 secret 不能用於登入，避免使用者誤設或被社交工程誘導綁一個攻擊者產生的 secret。
- **secret 加密存放**：TOTP secret 用 KMS/Secret Manager 的 envelope encryption 加密後存 `secret_ciphertext`（`secret_key_version` 支援輪替），**不**以明文或僅 base32 編碼存 DB；驗證時由 API 服務的執行環境金鑰解密，不回傳給前端。
- **一次性復原碼**：確認啟用時一次性產生 10 組復原碼，**只顯示一次**（與既有 API credential「plaintext only once」慣例一致，Stage 1.5 §10.3），只存 hash（`identity_totp_recovery_codes`），每組單次使用；使用後標記 `used_at`，剩餘數量低於 2 組時提示使用者在帳號安全頁重新產生整組（重新產生會作廢所有舊碼）。
- **哪些角色強制**（對應 Stage 1.5 §7.2）：

  | 角色（四 realm 範圍內）                                            | TOTP 強制時機                                                                                                                    |
  | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
  | `tenant_admin` / `tenant_technical_admin` / `tenant_finance_admin` | 帳密登入時必須已啟用 TOTP；未啟用則登入成功但強制導向註冊頁，無法進入一般功能                                                    |
  | `tenant_ops_admin`                                                 | 同上（Stage 1.5 §7.2「tenant admin / technical / finance」必須列）                                                               |
  | `tenant_ops` / `tenant_viewer`                                     | 「上 production 前必須」——dev 環境可暫緩，但 production 環境與 tenant_admin 同樣強制，不給 pilot 例外（本案沒有既存 pilot 期限） |
  | `partner_portal_admin` / `partner_portal_user`（fleet partner）    | 必須（Stage 1.5 §7.2「partner portal user」必須列）                                                                              |
  | agency 角色（finance/compliance/audit 等已明列於 §7.2 的角色）     | 必須                                                                                                                             |
  | agency 一般角色（非上述明列角色）                                  | **依 D2 決定**（見決策紀錄 §6），本設計不單方面擴大或縮小                                                                        |

- **Step-up 新鮮度**：沿用既有 `apps/api/src/common/auth/step-up.policy.ts` 的 `freshnessWindowMs`（10/15 分鐘，依操作類型），帳密+TOTP 路徑產生的 session 一樣受這份政策約束，不新增第二套 step-up 規則。
- **amr 寫入**：成功密碼驗證後 `amr` 含 `"pwd"`；完成 TOTP 驗證後 `amr` 含 `"pwd", "otp"`（`"otp"`/`"totp"` 已是既有 `trusted-mfa.policy.ts` 的 `STRICT_TRUSTED_AMR` 成員，**不需新增新的 AMR 值**，只需在 `JwtAuthService.issueSessionToken` 呼叫時正確傳入 `amr`/`acr`，與 Google 路徑的 `resolveDefaultAmr` 並列）。前端不得送任何 `mfa=true` 之類的 boolean 影響這個判斷。
- **遺失裝置的復原**：使用復原碼登入後，立即強制要求重新註冊 TOTP（舊 secret 失效）；復原碼全部用盡且使用者無法登入時，必須走 Stage 1.5 §7.1「帳號復原不得只靠客服改 email」的既有雙人身分復原流程，不開「客服關閉 MFA」的後門。

## 8. Session

密碼（+TOTP）登入與 Google OIDC 登入**簽發同一套 canonical durable session**：都呼叫 `JwtAuthService.issueSessionToken`，寫入相同的 `sid`/`tokenVersion`/`amr`/`acr`/`realm`/角色/scope claims，存入既有 `iam.identity_sessions`（`V0070__identity_sessions_and_refresh_families.sql`）。既有的 `GET /api/auth/session`、`POST /api/auth/logout`、`POST /api/auth/logout-all`、`GET /api/auth/sessions`、`POST /api/auth/sessions/:sid/revoke` 不需要區分登入方式，因為 session 本身已經是統一格式；UI 上「目前使用的登入方式」可從 `amr` 推導顯示，不是另開一套 session 模型。

Enterprise dispatch 沿用租戶登入狀態的機制不變：兩個 host 各自持有自己的 `HttpOnly` session/state/CSRF cookie，但 cookie 內的 bearer 指向同一個 tenant membership 的 session；帳密登入在 tenant-console-web 完成後，enterprise-dispatch-web 一樣透過既有共用 BFF handler／`verifyEnterpriseTenantSession` 類等效機制承接，不需要為密碼路徑重新設計跨 host 共用規則。

## 9. UI

四個入口的登入頁同時提供「使用 Google 登入」（既有按鈕/流程不變）與帳號密碼表單（email + password + 「忘記密碼」連結）。新增畫面：

- 設定密碼頁（接受邀請時的分支畫面，§5）。
- 忘記密碼頁（輸入 email → 統一提示「若帳號存在，重設信已送出」）、重設密碼頁（輸入新密碼兩次）。
- TOTP 註冊頁（QR code + 手動輸入 secret 備援 + 一次性 code 確認）與登入時的 TOTP 驗證頁（6 位數字 + 「改用復原碼」連結）。
- 帳號安全頁：改密碼（需先驗證目前密碼或 fresh session）、重新產生復原碼（顯示一次後只給下載/複製，不可再次檢視）、檢視目前有效 session 清單與個別登出（沿用 Stage 1.5 §10.1 masking 規則：不顯示完整 IP/user agent）。

文案：所有新增畫面提供 `zh-TW` 與 `en` 兩版，沿用各 app 既有 `lib/translations.ts` 慣例（如 `apps/tenant-console-web/lib/translations.ts`），不新增第三套 i18n 機制。無障礙：表單欄位有對應 `label`、錯誤訊息用 `aria-live`、TOTP QR code 提供文字形式的 secret 作為螢幕閱讀器替代內容，鍵盤可完整操作（含 TOTP 6 碼輸入與「改用復原碼」切換）。

## 10. 設定與部署

新 secret（遵循 Stage 1.5 §15.2「全有或全無」啟動驗證規則，缺一律 startup/readiness failure，不得部分啟用）：

| Secret                           | 用途                                                                                             | 存放                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `drts-{env}-password-pepper`     | Argon2id 密碼 hash 的 server pepper                                                              | Secret Manager，runtime service account `secretAccessor` |
| `drts-{env}-totp-encryption-key` | TOTP secret envelope encryption 金鑰（含 `kid`，支援 current/previous overlap，Stage 1.5 §15.2） | Secret Manager / KMS                                     |

`.github/workflows/deploy-dev.yml` 與正式環境 `operations/verification/production-release-rail/rail.cjs`／`deploy-prod.yml` 都要新增這兩個 secret 的「全有或全無」檢查段落，仿照既有 Google OIDC secret（`DEV_OIDC_CLIENT_ID` 等）的全有或全無模式。功能旗標：**不按 realm 開關**——使用者 2026-11-13 的決定是四個入口全部要有帳密登入，沒有要求逐 realm 可獨立關閉；但保留一個全域 `PASSWORD_LOGIN_ENABLED` 旗標用於部署順序（先部署後端支援、再開前端入口），關閉時只隱藏入口按鈕與拒絕新建密碼，不影響既有 Google 登入或既有密碼使用者的登入能力。

## 11. 驗收設計

- **單元測試**：Argon2id hash/verify、密碼政策（長度依是否有 MFA）、離線外洩清單比對、TOTP code 驗證（含時間窗/重放拒絕）、復原碼單次消耗、速率限制/鎖定狀態機、統一錯誤回應（不同失敗原因回同一個 code）。
- **真 PG migration 整合測試**：沿用既有 `apps/api/tests/unit/*.pg.test.ts` 慣例（如 `tenant-google-invitation.pg.test.ts`），對新四張表做 constraint／unique／FK／rollback 測試；邀請接受的密碼分支要有並發一次性消耗測試（與 `acceptTenantOidcInvitation` 的並發測試同等要求）。
- **hosted dev 實際走訪**（本 VM 禁止，需共享 dev 環境）：對四個入口各走一次「邀請 → 設定密碼 → TOTP 註冊 → 登入 → 登出 → 忘記密碼重設 → 用新密碼登入」。
- **資安負向測試**：帳號列舉（不同失敗原因回應要逐 byte 相同）、暴力破解（鎖定生效、IP rate limit 生效）、邀請/重設 token 重放（第二次使用必須拒絕）、MFA 繞過（偽造 `amr`/前端 boolean 必須被拒絕、未確認的 TOTP secret 不能登入）、跨 realm（tenant 密碼不能登入 agency）、跨租戶（tenant A 密碼不能存取 tenant B membership）。

## 12. 與 Google 登入並存的風險與遷移

- **既有只用 Google 的使用者加設密碑**：必須透過已登入的 session 呼叫 `POST /api/auth/:realm/credentials/password`（§1），不提供「忘記密碼」入口給從未設過密碼的帳號去建立密碼（那是忘記密碼重設流程，不是初次建立流程，兩者的 UX 與風險不同，不可混用同一端點）。
- **停用帳號同時封鎖兩種登入**：`identity_principals.account_status` 是單一欄位，Google 校驗（`findPrincipalBySubject`）與密碼校驗都在同一個 principal 查詢後檢查 `account_status`；停用時兩條路徑自動一起被擋，不需要分別維護兩套停用開關。撤銷 session 同樣作用於不分登入方式產生的所有 session（§8）。
