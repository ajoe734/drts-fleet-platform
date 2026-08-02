# Stage 1.5 身分、權限、帳號與資安補強計畫

狀態：Stage 1.5 canonical hardening supplement  
版本：`2026-08-01.v1`  
日期：2026-08-01  
適用系統：`drts-fleet-platform` 與其正式串接之 tenant / partner / driver surfaces  
主要 owner：Platform Engineering、Security、SRE  
業務驗收 owner：Platform Operations、Tenant Operations、Finance / Compliance

## 1. 執行結論

Phase 1 已具備 realm、JWT、scope guard、tenant user / role、platform user、partner API key、driver device binding、audit 與 sensitive-data governance 的基礎，不需要重做整套系統。

但目前不能只因畫面與 happy path 可操作，就把登入與帳號治理視為 production-ready。2026-08-01 的 code-backed review 顯示，以下項目應被視為 Stage 1 正式上線前的阻斷條件：

1. tenant session 目前可由 email 與 tenant membership 直接換取，沒有外部 IdP、密碼、magic-link proof 或 MFA proof；`invited` 狀態也未被明確排除。
2. bootstrap actor headers 仍能參與 production code path，且 `/api/auth/token` 可依 caller-supplied actor / role / scope claims mint token；此路徑必須只接受已驗證的 control-plane 或 workload identity。
3. 未命中 auth policy 的 route 目前可能以無 policy 路徑通過；production 必須改成「明確 public，否則一律 authenticated and authorized」。
4. 一般 JWT 將角色與 scopes 固定在 token 內，缺少 `jti`、session version、token family 與即時撤銷檢查；停權或降權後可能在 token 到期前仍保有舊權限。
5. driver device binding 與 refresh token 仍以 process memory 與明文 token state 為主，宣告的 30 日 refresh lifetime 尚未形成可持久化、可驗證、可偵測 reuse 的正式 session store。
6. platform user 管理仍是 seed / in-memory 主體，狀態變更理由沒有完整進 backend contract，部分 audit actor 仍為 `null`；tenant account lifecycle 也只有 `invited / active / suspended`，不足以支持邀請驗證、鎖定、離職與刪除治理。
7. MFA、定期 access review、break-glass、SoD、離職撤權 SLA、session inventory、異常登入告警等需求散落或僅有原則，尚未形成一致且可驗收的控制面。

因此，本計畫把 Stage 1.5 定義為「不新增核心運輸業務功能，專注把既有身分與帳號能力補成可上 production 的治理閉環」。P0 完成前，不應對外宣稱 tenant / driver / partner / platform account security 已 production-ready。

## 2. 文件定位與優先順序

本文件補充但不推翻以下既有決策：

- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md`
- `docs/03-runbooks/auth-plane-separation-matrix.md`
- `phase1_prd_detailed_v1.md` 第 12、13 章
- `phase1_service_contracts_v1.md` Identity Service、Tenant & Partner Service、Audit Service
- `docs/02-architecture/phase1-sensitive-data-governance-matrix-20260429.md`
- `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`

適用規則：

- realm 與 control-plane / business-plane 的拓撲，以 accepted decision 為準。
- 本文件將 tenant `bootstrap-session` 收斂為「已驗證 identity proof 的 session exchange」，不再允許 email-only proof。
- 本文件將 bootstrap headers 收斂為 local / test / explicit diagnostic capability，不得作為 production caller identity。
- 本文件新增的角色、scope、session 與 account lifecycle 規則，應透過 controlled sync path 轉成 contracts、migration、API、UI、runbook、UAT 與 machine backlog。
- 本文件是目標設計與 release baseline，不代表文中項目已實作或已取得 live staging evidence。

## 3. 目標、範圍與非目標

### 3.1 目標

Stage 1.5 必須達成：

- 每一個 human、machine、partner 與 device caller 都有可驗證且不可由前端自行宣告的 identity。
- authentication、authorization、resource boundary 與 account status 都由 backend authoritative enforcement 決定。
- 使用者邀請、啟用、角色異動、停權、離職、session revoke、復權與刪除具備完整狀態、owner、SLA 與 audit。
- 高權限操作具備 MFA、step-up、理由、approval / four-eyes 與不可竄改的稽核證據。
- tenant、partner、driver 與 control-plane 維持清楚的 trust boundary，不因補登入而混成同一種驗證方式。
- auth failure、credential abuse、privilege escalation、cross-tenant access 與 suspicious session 行為能被偵測、告警、調查與復原。
- 所有 P0 / P1 控制都有 automated negative test 與 staging evidence，而不只是文件勾選。

### 3.2 納入範圍

- Platform Admin、Ops Console、Tenant Portal / Console 的 human identity。
- Partner portal human identity、partner API client、tenant API key 與 webhook secret。
- Driver master、driver app device registration、access / refresh session 與 rebind / revoke。
- System jobs、BFF、service-to-service 與 CI / deploy workload identity。
- Role、scope、resource ownership、tenant / partner / driver boundary 與 privileged approval。
- Account lifecycle、session lifecycle、MFA、break-glass、access review 與 offboarding。
- Audit schema、security log、alert、retention、incident response 與 evidence。
- Auth-related API、DB、UI、configuration、deployment、test 與 rollout。

### 3.3 非目標

- 不改寫 dispatch、billing、reporting、fleet 或 partner booking 的業務 authority。
- 不把 tenant、driver、partner 或 webhook 強制放入 Cloud IAP。
- 不自行開發一套 production password vault 或 MFA server；human authentication 優先採 managed IdP / OIDC。
- 不在本階段導入完整企業 PAM、SCIM 或全公司 HRIS 整合；但資料模型與 API 不得阻擋後續接入。
- 不以 UI 隱藏按鈕取代 backend authorization。

## 4. 2026-08-01 現況基線

| 能力               | 已存在的基線                                                                            | 仍需補強                                                                                              | 成熟度       |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| Realm topology     | `system / platform / tenant / ops / driver / partner` 與 plane separation 已定案        | production trust signal 與 fallback 必須技術性隔離                                                    | partial      |
| Control-plane auth | IAP / proxy / inner Bearer 路徑與 runbook 已存在                                        | token minting claims、workforce membership、MFA proof、session revoke 需閉環                          | partial      |
| Tenant auth        | invited-user lookup、tenant-bound JWT、cross-tenant rejection存在                       | 目前 email-only、未驗 invitation proof、未處理 refresh / logout / revoke / MFA                        | critical gap |
| Platform accounts  | `/platform-admin/users` 畫面與 create / role / suspend API 存在                         | 使用者 state 仍為 seed / in-memory、角色過粗、理由與 actor audit 不完整                               | major gap    |
| Tenant accounts    | user / role CRUD、role catalog、tenant audit 存在                                       | lifecycle 過粗、technical admin scope 缺口、self-escalation / last-admin protection 未定義            | major gap    |
| Authorization      | route policy、realm、scope、tenant boundary 與 denial audit 部分存在                    | 未命中 policy fail-open、scope preset drift、resource-level policy 不一致                             | critical gap |
| Driver auth        | 15m access token、refresh rotation、device revoke 與 eligibility check 存在             | binding / refresh token 未持久化、明文儲存、expiry / reuse detection / remote logout 缺口             | critical gap |
| Partner auth       | hashed API key、key revoke / rotate、entry scope 與 bootstrap JWT 存在                  | expiry enforcement、dual-key rollout、rate anomaly、portal human identity 需統一                      | partial      |
| Service identity   | inner Bearer、internal key 與 WIF 方向存在                                              | static internal key 仍太接近 trust boundary，需 workload identity 與 audience-bound token             | major gap    |
| JWT security       | signature、expiry、optional issuer / audience verification存在                          | production issuer / audience 非 mandatory、單一 shared secret、無 `kid / jti / sid / auth_time / amr` | major gap    |
| MFA / step-up      | PRD 要求 SSO + MFA、four-eyes                                                           | runtime evidence、recovery、step-up policy 與 UAT 未閉環                                              | major gap    |
| Audit              | authz denial、tenant mutation、artifact access 與 2555 日 audit retention baseline 存在 | successful / failed login、session、MFA、role approval、break-glass schema 需統一                     | partial      |
| Sensitive data     | masking、hash-only API keys、Secret Manager 原則、signed download 已有基線              | auth credentials、refresh tokens、IdP subject、IP / device data retention 需納管                      | partial      |

### 4.1 Code-backed evidence anchors

- `apps/api/src/modules/auth/auth.controller.ts`：tenant bootstrap 只檢查 email、tenant membership 與 suspended 狀態後即簽發 8 小時 JWT。
- `apps/api/src/common/auth/internal-key.middleware.ts`：bootstrap realm 與 bearer 可繞過 internal-key gate；未設定 expected key 時 `validateInternalKey()` 直接通過。
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`：未解析出 route policy 時會建立 anonymous / bootstrap identity 後放行。
- `apps/api/src/common/auth/jwt-auth.service.ts`：使用單一 `JWT_SECRET`，issuer / audience 可省略，payload 尚無 session revoke 所需 claims。
- `apps/api/src/modules/auth/driver-device-session.service.ts`：binding 與 refresh token 存在 process-local `Map`，token 值以明文比對。
- `apps/api/src/modules/platform-admin/platform-admin.service.ts` 與 repository：platform users 來自 seed / in-memory collection，repository 尚未將 users 納入 durable state。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`：tenant user mutation 已有 persistence 與 masked audit，但 audit actor 仍可能為 `null`，且 state 僅三態。
- `apps/api/src/common/auth/auth.constants.ts`：actor-type preset 與 tenant role preset 已存在，但仍需轉成可治理、可測試的 policy catalog。

## 5. 風險登錄與處置順序

### 5.1 P0：production release blockers

| Risk ID        | 風險                                                  | 可能影響                                   | 必要處置                                                                                                             | 關閉證據                                               |
| -------------- | ----------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `IAM-RISK-001` | tenant email-only session exchange                    | 知道受邀 email 即可冒用 tenant user        | 改為 verified OIDC authorization code + PKCE 或等價的一次性 signed proof；`invited` 不得直接登入                     | negative E2E、IdP claims evidence、staging login trace |
| `IAM-RISK-002` | caller-supplied bootstrap claims 可進入 token minting | 權限提升、任意 realm / scope token         | production 禁用 bootstrap identity；`/auth/token` 僅接受 verified IAP / workload identity，server-side resolve roles | direct-path escalation tests 全拒絕                    |
| `IAM-RISK-003` | 未命中 auth policy 的 route 可放行                    | 新增 route 時意外公開                      | 全域 fail-closed；public route 必須 `@OpenRoute` 且列入 inventory                                                    | route inventory test 100% classified                   |
| `IAM-RISK-004` | 角色、停權與 session 無即時撤銷                       | 離職或降權後舊 JWT 仍有效                  | session store、`sid / jti / tokenVersion`、revoke-all、role change invalidation                                      | 角色異動 / suspend 後舊 token 60 秒內失效              |
| `IAM-RISK-005` | driver refresh session 為 process memory / plaintext  | restart 遺失撤銷狀態、token 洩漏、無有效期 | DB-backed hashed token family、expiry、rotation、reuse detection、device rebind revoke                               | restart / replay / expired / revoked E2E               |
| `IAM-RISK-006` | production auth config 可缺漏                         | issuer / audience / key / CORS 配錯仍啟動  | production startup validation fail closed                                                                            | config-negative deployment tests                       |

### 5.2 P1：上線治理必備

| Risk ID        | 風險                                                   | 必要處置                                                                            |
| -------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `IAM-RISK-007` | platform user 不持久化、角色與 IAP group 不一致        | durable identity / membership tables、group sync 或 JIT binding、drift alert        |
| `IAM-RISK-008` | MFA 與 step-up 只有需求文字                            | enforce `amr / acr / auth_time`，高風險操作要求近期 MFA                             |
| `IAM-RISK-009` | self-escalation、last-admin removal、SoD 未封鎖        | backend policy、approval workflow、last-admin invariant                             |
| `IAM-RISK-010` | account lifecycle 與 offboarding 沒有 SLA              | formal state machine、immediate session revoke、owner 與 overdue alert              |
| `IAM-RISK-011` | audit actor / reason / before-after 不完整             | canonical security event schema、append-only store、masked context、correlation IDs |
| `IAM-RISK-012` | permissive CORS 與 browser token exposure              | origin allowlist、BFF HttpOnly cookie、CSRF、CSP、no localStorage token             |
| `IAM-RISK-013` | internal key / service secret 為長效 shared credential | workload identity、audience-bound short token、dual-key rotation、usage inventory   |
| `IAM-RISK-014` | account / credential abuse 缺少偵測                    | rate limit、anti-enumeration、risk signals、alerts 與 incident runbook              |

### 5.3 P2：持續治理

- tenant enterprise federation 與 domain verification。
- SCIM / HRIS joiner-mover-leaver automation。
- WebAuthn / passkey 作為 phishing-resistant MFA。
- managed device posture、mobile attestation 與 conditional access。
- just-in-time privileged access、完整 PAM 與 automated access recertification。

### 5.4 威脅模型

本計畫至少針對以下 assets 與 abuse cases 設計。若實作引入新的 ingress、credential 或 privileged action，必須同步擴充 threat model 與 negative tests。

核心 assets：

- human / service / device identity 與 memberships。
- access / refresh token、invitation、API key、webhook / signing secrets。
- tenant / partner / driver scoped operational data。
- platform configuration、role catalog、billing / evidence / audit authority。
- security events、retention evidence 與 incident recovery capability。

| Threat actor / failure               | 主要攻擊或失敗路徑                                                                     | 必要控制                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| unauthenticated external attacker    | email enumeration、invitation guessing、credential stuffing、callback / redirect abuse | proof-based login、anti-enumeration、rate limit、PKCE / state / nonce、redirect allowlist  |
| malicious or compromised tenant user | cross-tenant IDOR、self-escalation、sensitive export                                   | tenant-bound membership、object policy、SoD、step-up、download audit                       |
| compromised workforce account        | platform / ops privilege abuse、mass export、role grant                                | workforce MFA、server role mapping、short session、approval、behavior alert                |
| leaked partner / tenant API key      | booking abuse、cross-entry access、data harvesting                                     | hash-only、narrow scope、expiry、rotation、entry boundary、rate anomaly                    |
| stolen / cloned driver device        | refresh replay、other-driver task access、fraudulent proof                             | durable device binding、secure storage、rotation / reuse detection、remote revoke          |
| compromised service / CI principal   | arbitrary token minting、broad backend access                                          | workload identity、audience restriction、least privilege、no caller-defined scopes         |
| malicious insider / support user     | impersonation、audit tampering、break-glass abuse                                      | delegated session、two-person approval、append-only audit、post-use review                 |
| developer / deployment error         | new route accidentally public、auth env missing、CORS wildcard                         | route inventory fail-closed、startup validation、policy-as-code、deployment tests          |
| signing / session-store outage       | invalid tokens accepted、revocation lost、whole auth bypassed                          | fail-closed validation、durable store、key overlap、controlled break-glass、rollback drill |

## 6. 目標身分架構

### 6.1 Realm 與唯一正式驗證路徑

| Realm / caller     | 正式 authentication                                                              | session / credential                                  | authoritative account source                | 禁止事項                                        |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `platform`         | Cloud IAP + workforce OIDC；公司帳號與 MFA                                       | BFF HttpOnly session + short-lived inner token        | workforce IdP subject + platform membership | browser 自填 actor / role / scope headers       |
| `ops`              | Cloud IAP + workforce OIDC；公司帳號與 MFA                                       | BFF HttpOnly session + short-lived inner token        | workforce IdP subject + ops membership      | 共用 ops 帳號、只憑 email header                |
| `tenant`           | managed OIDC Authorization Code + PKCE；enterprise federation 可後接             | BFF HttpOnly session；refresh rotation                | IdP subject + tenant membership             | email-only login、tenantId 由 client 決定       |
| partner human      | managed OIDC；MFA 依角色                                                         | BFF HttpOnly session                                  | IdP subject + partner membership            | 以 API key 當人員登入憑證                       |
| partner machine    | scoped API credential exchange；後續可升 mTLS / private-key JWT                  | short-lived partner Bearer                            | partner credential registry                 | 永久不過期 key、跨 entry 共用 key               |
| driver             | single-use registration invitation + device binding；後續 local biometric unlock | 15m access + rotated refresh family in secure storage | driver master + durable device binding      | 可重播 registration code、明文 refresh token DB |
| referral passenger | signed, audience-bound, one-time handoff                                         | <= 10m one-time token                                 | partner entry + referral grant              | 可重播 token、攜帶任意 partner / tenant scope   |
| `system`           | cloud workload identity / OIDC federation                                        | <= 15m audience-bound service token                   | service principal registry                  | production shared internal key 作 primary auth  |

### 6.2 Identity resolution

所有 request identity 必須由 server 建立，最少包含：

- `subjectId`：不可變的 IdP / principal subject，不以 email 當 primary key。
- `actorId`：DRTS 內部 user / driver / service / credential ID。
- `actorType` 與 `realm`。
- `tenantId / partnerId / entrySlug / driverId` 等資源邊界。
- `roles`、`scopes` 與 `policyVersion`。
- `sessionId (sid)`、`tokenId (jti)`、`tokenVersion`。
- `authTime`、`amr`、`acr` 與 `mfaVerifiedAt`。
- `issuedAt / expiresAt`、`issuer`、`audience`。
- `requestId / traceId` 僅用於追蹤，不作 authentication input。

email、display name、IAP email header、tenant header 與 UI route 都不是 authority。`tenantId` 等 resource scope 必須由 membership / credential lookup 投影，若 client 另送 scope，只能做一致性比對，不得覆蓋 server identity。

Task boundary note:

- `IAM-SES-002` 擁有上述最小 authority claim envelope 的 canonical projection。該 task 必須把這組欄位落到 issued bearer/session payload、middleware request identity、`IdentityContext` 與 `GET /api/identity/context` 等共享 authority surface，而不是只停留在 JWT 內部。
- `IAM-SES-003` 只擁有 session-management surface：`/api/auth/logout`、`/api/auth/logout-all`、`/api/auth/sessions`、`/api/auth/sessions/:sid/revoke` 與 admin-scoped `/api/identity/sessions`。它必須沿用 `IAM-SES-002` 定義的 session identifiers / claim semantics，不得重新定義 authority envelope。
- 對於某些非 human 或非 step-up flow 不適用的欄位，可投影為 `null` 或空集合，但 canonical field names 不得因 realm 不同而漂移。

### 6.3 Token 與 BFF 原則

- Browser 不得把 long-lived access / refresh token 存在 `localStorage`、`sessionStorage` 或可被 JavaScript 讀取的 cookie。
- Browser session 使用 `HttpOnly; Secure; SameSite=Lax` cookie；跨站需求需逐案審核，不得預設 `SameSite=None`。
- 所有 browser mutation 需要 CSRF protection；OIDC callback 必須驗 `state`、`nonce` 與 PKCE verifier。
- API access token 建議 10 至 15 分鐘；現有 driver 15 分鐘可保留。
- Refresh token 每次使用都 rotation；舊 token reuse 立即 revoke 整個 family 並告警。
- Workforce / tenant 一般 session absolute lifetime 8 小時，idle timeout 30 分鐘；高權限 console idle timeout 15 分鐘。
- Driver refresh absolute lifetime 最長 30 日，但 driver suspended、binding revoked、rebind、credential compromise 時立即失效。
- Role、status、tenant membership 或 privilege 變更時，該 principal 的 active sessions 必須在 60 秒內失效。
- Production token 必須驗證 signature algorithm allowlist、`iss`、`aud`、`exp`、`nbf`，且拒絕 `alg=none` 與 algorithm confusion。
- Signing key 必須有 `kid` 與 rotation；驗證端需支援 current + previous overlap，不得只靠一個永久 shared secret。

## 7. Authentication 與 MFA 政策

### 7.1 Human identity

- Production human user 不在 DRTS 儲存本地密碼；密碼政策、breached-password detection、recovery 與 MFA 由 approved managed IdP 負責。
- 若因災難復原保留 local emergency credential，必須獨立於日常登入、存放於受控 vault、使用 memory-hard password hash、至少 14 字元、禁止已知洩漏密碼、每次使用後立即 rotation，且全部進 break-glass audit。
- 登入錯誤回應不得透露 email 是否存在、是否屬於某 tenant 或是否被邀請；詳細原因只進 security log。
- invitation token 必須至少 128-bit entropy、hash-only storage、單次使用、24 小時到期；resend 會使舊 invitation 失效。
- account recovery 不得只靠客服人工改 email；必須由 IdP recovery 或雙人核准的 identity re-verification 流程處理。

### 7.2 MFA requirement

| 角色 / 操作                                 | MFA                                          | Step-up freshness                                          |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `platform_superadmin / platform_user_admin` | 必須                                         | 權限提升、break-glass、key / IdP config 變更：10 分鐘      |
| ops management / dispatcher override        | 必須                                         | 高風險 override、driver remote revoke：15 分鐘             |
| finance / compliance / audit                | 必須                                         | export、legal hold release、settlement correction：10 分鐘 |
| tenant admin / technical / finance          | 必須                                         | role、API key、webhook secret、billing profile：15 分鐘    |
| tenant ops / viewer                         | 上 production 前必須；pilot 例外需具名期限   | sensitive export 時 15 分鐘                                |
| partner portal user                         | 必須                                         | credential / entry configuration 時 15 分鐘                |
| driver                                      | device binding 必須；互動式 MFA 可依 rollout | rebind、敏感個資 / payout change 時重新驗證                |

MFA evidence 必須來自可信 IdP claims（如 `amr / acr / auth_time`）或 server-owned device proof，前端 boolean 不得作為依據。SMS 僅可作 transitional fallback，不作 privileged user 的唯一 MFA。

## 8. Authorization 模型

### 8.1 RBAC + resource-bound ABAC

Stage 1.5 採「RBAC 決定可做哪類操作，ABAC / resource checks 決定可對哪一筆資料操作」：

- role 是可管理的業務責任集合。
- scope 是 API capability，例如 `identity:users:read`。
- resource constraint 包含 tenant、partner program、entry、driver ownership、case assignment、data classification 與 environment。
- route policy、service method 與 repository query 都要維持相同 boundary；不得只在 controller 或 UI 檢查。
- 預設 deny。只有 `@OpenRoute` 且位於 public route inventory 的 endpoint 可匿名。
- wildcard / superadmin scope 只允許受 MFA、approval 與 audit 控制的 privileged role，不對一般 `platform_admin` 預設開放。

### 8.2 Scope naming 與相容性

新 identity scopes 採 colon-delimited 命名：

- `identity:users:read / invite / manage / suspend`
- `identity:roles:read / assign / manage`
- `identity:sessions:read / revoke`
- `identity:access-reviews:read / manage / certify`
- `identity:break-glass:request / approve / activate`
- `identity:credentials:read / issue / rotate / revoke`
- `security:audit:read / export`
- `security:policy:read / manage`

現有 `identity:read` 在 migration period 可映射到最低唯讀能力，但不得默認取得 invite、assign、revoke 或 export。所有 scope preset 與 control-plane proxy preset 必須由同一份 generated policy catalog 產生，消除雙邊手動同步 drift。

### 8.3 角色基線

| Role                     | 主要能力                                                   | 明確禁止                                        |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| `platform_superadmin`    | 平台政策、break-glass approval、最高權限治理               | 自批自己、單人移除最後一名 superadmin           |
| `platform_user_admin`    | platform / ops user invitation、membership、session revoke | pricing、settlement、audit content mutation     |
| `platform_partner_admin` | partner / bank / entry 與 credential governance            | 平台 user privilege escalation                  |
| `dispatcher`             | dispatch read / write、一般 reassignment                   | user admin、finance、audit export               |
| `ops_supervisor`         | queue、override approval、incident escalation              | role catalog 管理、secret reveal                |
| `finance_user`           | billing、invoice、reconciliation                           | user role 管理、dispatch override               |
| `compliance_user`        | evidence、retention、legal hold request                    | 單人 release 自己建立的 legal hold              |
| `audit_user`             | read-only audit 與 approved export                         | 任意 operational mutation                       |
| `tenant_admin`           | tenant membership 與一般設定                               | 平台 policy、跨 tenant 存取、自升平台角色       |
| `tenant_ops_admin`       | booking、passenger、ops notification                       | role / API key / billing mutation               |
| `tenant_finance_admin`   | tenant billing、report、invoice                            | user / webhook / dispatch 管理                  |
| `tenant_technical_admin` | API key、webhook、integration                              | billing correction、tenant owner transfer       |
| `tenant_viewer`          | tenant-scoped read-only                                    | mutation、secret issuance、raw sensitive export |
| `partner_portal_admin`   | partner membership、entry 與 credential request            | platform activation final approval              |
| `partner_portal_user`    | partner-scoped booking / lookup                            | credential issuance、跨 entry 存取              |
| `driver_user`            | self-owned task、profile、device session                   | 其他 driver 資料、dispatch authority、pricing   |

### 8.4 Separation of Duties 與 invariant

- 使用者不得核准自己的 privilege escalation、break-glass、API credential、legal-hold release 或高額 finance override。
- `platform_superadmin`、`tenant_admin` 與 partner owner 不得被降權到系統沒有最後一名有效管理者。
- role 變更若增加 privileged scopes，必須由不同 actor 核准；降權與 suspend 可由單一 authorized admin 執行並立即生效。
- audit role 與會改寫 operational state 的角色預設不可同時授予；例外需有明確時限與 approval。
- 任何 support impersonation 必須使用具名 delegated session，不得直接取得使用者 token；session banner、scope cap、reason、TTL 與 audit 必須完整。

## 9. 帳號生命週期

### 9.1 Human account state machine

正式狀態：

`invited -> pending_verification -> active -> locked | suspended -> active -> disabled -> deletion_pending -> deleted`

規則：

- `invited`：只有 invitation metadata，不可登入，不可建立一般 session。
- `pending_verification`：IdP identity 已建立但 membership / MFA / approval 未完成，只能進 onboarding。
- `active`：authentication 與 membership 均有效。
- `locked`：風險或多次失敗暫時封鎖；既有 sessions 依 policy revoke。
- `suspended`：管理者或 incident response 停權，立即 revoke 全部 sessions / credentials。
- `disabled`：離職或合作終止，不可復權，除非經正式 rehire / re-onboard approval。
- `deletion_pending`：等待 retention、legal hold 與資料匿名化檢查。
- `deleted`：身份資料依 retention 政策移除或匿名化，但不可竄改 audit 保留 subject pseudonym。

### 9.2 Joiner / mover / leaver

| 事件               | 必做動作                                                                                  | SLA                               |
| ------------------ | ----------------------------------------------------------------------------------------- | --------------------------------- |
| 新進 / 邀請        | verify domain / identity、assign least privilege、MFA enrollment、owner approval          | 使用前完成                        |
| 轉調 / role change | before-after diff、SoD check、必要 approval、revoke old sessions                          | 生效後 60 秒內                    |
| 暫時停權           | account suspend、revoke sessions、disable API / device credentials、alert owner           | 15 分鐘內；security incident 即時 |
| 離職 / 終止合作    | disable account、revoke all sessions / keys / devices、transfer ownership、preserve audit | effective time 起 15 分鐘內       |
| 復權               | 重新驗 identity、重新評估 role、MFA、不得沿用舊 refresh family                            | 核准後重新發 session              |
| 刪除 / 匿名化      | 檢查 legal hold、retention、business ownership 與 audit pseudonym                         | policy-defined                    |

### 9.3 Invitation 與 membership

- identity 與 membership 分離：一個 subject 可有多個 tenant / partner memberships，但每次 session 必須選定且綁定單一 active context。
- 相同 email 不代表相同 identity；account link 只接受已驗證 IdP subject 與受控 migration proof。
- tenant 邀請必須記錄 inviter、role、tenant、expiry、acceptedAt、revokedAt 與 delivery status。
- tenant / partner domain claim 不能自動授予 admin；domain discovery 最多建立 pending membership。
- invite resend、revoke、expiry、wrong tenant、wrong subject、already accepted 都要有明確 negative contract 與 audit。

### 9.4 Access review

- privileged roles 每季 review；一般 tenant / partner membership每半年 review。
- reviewer 必須是 resource owner 或其上級，不得自行 certify 自己的 privileged access。
- review outcome：`certified / reduce_access / suspend / remove / exception_with_expiry`。
- overdue privileged review 超過 14 日，先告警；超過 30 日自動 suspend 或降為 safe read-only，例外需 security approval。

## 10. Session、裝置與 credential lifecycle

### 10.1 Session state

Session 最少包含：`active / revoked / expired / compromised`。每筆 session 需記錄：

- `sessionId`、principal、membership、realm、auth time、MFA methods。
- refresh token family、current token hash、rotation counter、absolute expiry、idle expiry。
- device / browser summary、IP prefix、user agent hash、created / last seen / revoked timestamps。
- revoke reason、revoked by、risk flags；不得在 UI 或 audit 顯示完整 token、IP 或 user agent。

使用者至少要能查看自己的 active sessions 並執行單筆 revoke / logout all。Admin 只能在具備 scope 與 tenant boundary 時 remote revoke，且必須留理由。

### 10.2 Driver device binding

- registration invitation 單次使用、24 小時到期、hash-only persistence。
- binding 應綁定 driver、device key / installation ID、platform、app version 與 push token reference；不得把可 spoof 的 display device ID 當唯一信任根。
- refresh token hash 以 keyed hash 或適當 slow hash 儲存；每次 refresh rotation。
- refresh reuse、rebind、driver suspend、certification invalid、device revoke 皆 revoke entire family。
- mobile secure storage 使用 iOS Keychain / Android Keystore；log、analytics、crash report 不得包含 tokens。
- admin remote rebind 需要 reason 與近期 MFA；舊 binding 在新 binding 生效前就必須撤銷。

### 10.3 API keys 與 service credentials

- plaintext 只在 issuance response 顯示一次；server 永遠 hash-only storage。
- credential 必須有 owner、purpose、realm、resource scope、createdAt、expiresAt、lastUsedAt、lastUsedIp / workload、status 與 rotation lineage。
- production credential 必須有到期日；partner / tenant API key最長 90 日，service key 最長 30 日，除非由 security 具名核准例外。
- rotation 支援新舊雙 key 最長 7 日 overlap；舊 key 於 cutover 後自動 revoke。
- webhook secret、partner key、tenant key 與 signing key 分離，不得重用。
- production service-to-service 優先 WIF / workload identity；`x-drts-internal-key` 僅保留受限 break-glass / local 路徑，必須有 network restriction、expiry 與 usage alert。

## 11. Canonical 資料模型

Stage 1.5 應新增或正式化以下 durable entities；命名可依 migration convention 調整，但語意不得省略：

| Entity                        | 關鍵欄位                                                                    | 關鍵 constraint                                       |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `identity_principals`         | principalId、subject、issuer、type、emailVerified、status                   | `(issuer, subject)` unique；email 非 primary identity |
| `identity_memberships`        | membershipId、principalId、realm、tenant / partner scope、status            | 一筆 session 只綁一個 membership context              |
| `identity_roles`              | roleCode、realm、assignable、riskLevel、policyVersion                       | role code immutable；版本化                           |
| `identity_role_scopes`        | roleCode、scope、effect                                                     | default deny；禁止 client-defined scope               |
| `identity_role_bindings`      | membershipId、roleCode、validFrom / To、grantedBy、approvalId               | privileged binding 需 approval                        |
| `identity_invitations`        | tokenHash、target、role、expiresAt、acceptedAt、revokedAt                   | tokenHash unique；single use                          |
| `identity_sessions`           | sid、principalId、membershipId、status、authTime、MFA、expiry、tokenVersion | revoke / version 可即時檢查                           |
| `identity_refresh_families`   | familyId、sessionId、currentTokenHash、counter、expiresAt、compromisedAt    | rotation / reuse detection                            |
| `identity_mfa_status`         | principalId、providerRef、methods、verifiedAt、recoveryState                | 不保存 TOTP seed plaintext                            |
| `identity_device_bindings`    | bindingId、principal / driver、deviceKeyRef、status、expiry、rebind lineage | durable、可 revoke、不可只靠 deviceId                 |
| `identity_service_principals` | serviceId、workloadSubject、audiences、status、owner                        | owner 必填；static secret 非預設                      |
| `identity_credentials`        | credentialId、owner、hash、prefix、scopes、expiry、rotation lineage         | plaintext 不落 DB                                     |
| `identity_access_requests`    | requester、target、requestedRole、reason、risk、status                      | requester 不得是 final approver                       |
| `identity_access_reviews`     | scope、reviewer、dueAt、outcome、evidence                                   | overdue policy 可執行                                 |
| `identity_break_glass_grants` | requester、approver、scope、reason、expiresAt、activatedAt                  | two-person、short TTL、不可續期沿用                   |
| `security_events`             | eventType、outcome、actor、target、sid / jti、reason、risk、request / trace | append-only、masked、correlatable                     |

DB migration 必須包含 foreign keys、status check、unique constraints、expiry / lookup indexes、tenant-scoped indexes、append-only audit permissions 與 rollback / backfill strategy。不得只以 JSON snapshot 取代 session revoke 與 credential uniqueness 所需的 relational constraints。

## 12. API 與 contract 補強

### 12.1 Login / session

| Endpoint                              | 目的                                  | 必要控制                                                      |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `GET /api/auth/:realm/login`          | 啟動 OIDC flow                        | server-generated state / nonce / PKCE、return URL allowlist   |
| `GET /api/auth/:realm/callback`       | 驗證 IdP response 並建立 session      | issuer / audience / nonce / code verifier、membership resolve |
| `POST /api/auth/refresh`              | rotation refresh family               | hash compare、reuse detection、risk check                     |
| `POST /api/auth/logout`               | revoke current session                | CSRF、audit                                                   |
| `POST /api/auth/logout-all`           | revoke principal sessions             | recent auth、audit                                            |
| `GET /api/auth/session`               | 回傳目前安全 session summary          | 不回傳 token / secret                                         |
| `GET /api/auth/sessions`              | user 自己的 session inventory         | self scope；masked device / IP                                |
| `POST /api/auth/sessions/:sid/revoke` | self / authorized admin remote revoke | resource boundary、reason、audit                              |

既有 `/auth/tenant/bootstrap-session` 在 migration period 可保留名稱，但 request 必須改成 verified one-time exchange code，不接受 email 當 proof。既有 `/auth/token` 必須改為 private workload exchange 或 decommission，且 caller 不得提交任意 roles / scopes。

以上 session-management endpoints 的 API owner 為 `IAM-SES-003`；它們消費 `IAM-SES-001` / `IAM-SES-002` 已定義的 `sid`、token version、revoke state 與 masking rules，而不重新定義 claim envelope。

### 12.2 Account / role administration

| Endpoint family                | 必備能力                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `/api/identity/users`          | list / detail / invite / suspend / disable / reactivate，含 filter 與 tenant scope |
| `/api/identity/invitations`    | resend / revoke / accept status；不得回 plaintext token                            |
| `/api/identity/memberships`    | tenant / partner membership list、transfer、remove                                 |
| `/api/identity/role-bindings`  | role diff、request、approve、apply、expire                                         |
| `/api/identity/roles`          | canonical catalog、scopes、risk、assignability；一般 admin read-only               |
| `/api/identity/sessions`       | admin scoped inventory、revoke、compromise marking                                 |
| `/api/identity/access-reviews` | create campaign、certify、remediate、overdue                                       |
| `/api/identity/break-glass`    | request、approve、activate、expire；無永久 grant                                   |
| `/api/identity/credentials`    | issue、rotate、revoke、usage history；plaintext only once                          |

所有 mutation command 必須包含 `reasonCode`；高風險動作另含 `reasonText`、`expectedVersion` 與 approval / step-up reference。API 從 current identity 取得 actor，禁止 service 以 `actorId: null` 寫入 human-initiated audit。

### 12.3 Error contract

對外 auth error 使用穩定且不洩漏 membership 的 code，例如：

- `AUTHENTICATION_REQUIRED`
- `AUTHENTICATION_FAILED`
- `MFA_REQUIRED`
- `STEP_UP_REQUIRED`
- `SESSION_EXPIRED / SESSION_REVOKED / SESSION_COMPROMISED`
- `ACCOUNT_NOT_ACTIVE / ACCOUNT_LOCKED`
- `AUTH_REALM_DENIED / AUTH_SCOPE_DENIED / RESOURCE_SCOPE_DENIED`
- `INVITATION_INVALID_OR_EXPIRED`
- `REFRESH_TOKEN_REUSE_DETECTED`
- `LAST_ADMIN_PROTECTED`
- `SELF_APPROVAL_FORBIDDEN`
- `ACCESS_REVIEW_OVERDUE`

email 是否存在、正確 tenant、內部 role、IdP subject、credential hash 等資訊只可寫入受限 security event，不得放在 public error detail。

## 13. UI / UX 必做畫面

### 13.1 Platform Admin

- `Users`：durable user / membership / role / MFA / last login / session / review summary。
- `Invite User`：role risk、scope preview、expiry、approval requirement。
- `User Detail`：memberships、role history、active sessions、credentials、audit timeline。
- `Role Change`：before-after diff、SoD warning、last-admin protection、approval status。
- `Suspend / Disable`：reason、effective time、session / credential revoke impact。
- `Access Reviews`：campaign、overdue、certify / reduce / remove。
- `Break Glass`：request、two-person approval、countdown、active-session banner。

### 13.2 Tenant Console

- `Users & Roles`：tenant-scoped list、invite、resend、revoke、role change、suspend、last-admin protection。
- `Sessions`：使用者自助 logout other sessions；tenant admin 僅可看自己 tenant 的 masked summaries。
- `API Keys / Webhooks`：owner、scope、expiry、last used、rotation due、revoke impact。
- 對 finance / technical / admin 操作顯示 MFA / step-up 狀態，不得只在失敗後顯示 generic 403。

### 13.3 Driver App

- `DeviceNotProvisioned`、`RegisterDevice`、`SessionExpired`、`DeviceRevoked`、`DriverSuspended`。
- `Devices`：目前 binding、last active、revoke / rebind 流程。
- refresh reuse / remote revoke 時清除 secure storage 並回到 re-auth，不可無限 retry。
- offline task state 與 auth state 分離；token 到期不能把未同步 proof 靜默丟失。

### 13.4 共通 UX security rules

- 不在 URL、toast、analytics、DOM debug data 或 client log 暴露 token / secret。
- 角色與 status label 必須顯示 server response，不以前端 hardcoded role 推定 authority。
- 403 應說明「缺少權限或需核准」，但不揭露其他 tenant / user 是否存在。
- break-glass / impersonation session 全程顯示不可忽略的 banner、有效期限與退出動作。

## 14. Audit、security event 與 retention

### 14.1 必記錄事件

- login success / failure、callback validation failure、MFA challenge / failure / recovery。
- invitation create / resend / accept / expire / revoke。
- account lock / unlock / suspend / disable / reactivate / delete request。
- role request / approve / reject / assign / remove / expire。
- session create / refresh / revoke / revoke-all / expiry / refresh reuse。
- driver registration / rebind / revoke、partner / tenant credential issue / rotate / revoke。
- auth realm / scope / resource denial、cross-tenant attempt、unknown-route denial。
- break-glass request / approve / activate / use / expire。
- access review create / certify / remediate / overdue。
- security config、IdP mapping、role catalog、signing key與 CORS policy 變更。

### 14.2 Canonical security event fields

`eventId, occurredAt, eventType, outcome, severity, actorId, actorType, subjectIdHash, realm, tenantId, partnerId, targetType, targetId, sessionId, tokenIdHash, authMethods, sourceIpPrefix, userAgentHash, requestId, traceId, reasonCode, approvalId, policyVersion, beforeSummary, afterSummary`

遮罩規則：

- 不記 password、OTP、authorization code、access / refresh token、API key、cookie、private key。
- email、姓名、電話、IP、device identifier 依 sensitive-data matrix 遮罩或 hash。
- before / after 只放治理所需欄位，不把完整 domain record 複製進 audit。
- security event 使用 append-only permission；application role 不得 update / delete。
- 沿用 `audit_log` hot 180 日、archive 2555 日的既有 baseline；若法務調整，以 evidence retention policy 的新版為準。

### 14.3 告警基線

| Signal                         | Alert threshold / 行為                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| login / invitation brute force | 同 account / IP prefix / tenant 在短時間超標即 throttle；不洩漏 account existence |
| refresh token reuse            | 單次即 revoke family + high severity alert                                        |
| cross-tenant / wrong realm     | 同 actor 5 分鐘內 3 次即 security alert                                           |
| privileged role assignment     | 每次通知 Security / platform owner；未附 approval 視為 critical                   |
| break-glass activation         | 每次即時通知；到期自動 revoke                                                     |
| dormant credential used        | 30 日未使用後突然使用，建立 investigation signal                                  |
| key nearing expiry             | 30 / 14 / 7 / 1 日提醒 owner；到期 fail closed                                    |
| audit pipeline failure         | 任何 privileged mutation 無法記 audit 時 fail closed 並告警                       |

## 15. Application 與基礎設施安全控制

### 15.1 API / browser

- CORS 改為明確 origin allowlist、method、header 與 credential policy；production 不得 `cors: true` 全開。
- 啟用 HSTS、CSP、`frame-ancestors`、`X-Content-Type-Options`、Referrer Policy 與 cache-control for auth responses。
- OIDC / invitation / refresh / key exchange endpoint 各自有 rate limit；不能只共用一般 open-route quota。
- JSON body size、header size、redirect URI、return URL 與 callback host 必須 allowlist / bounded。
- 所有 resource ID API 執行 object-level authorization，避免 IDOR。
- auth error 與 logs 不包含 raw request body 或 sensitive headers。

### 15.2 Secrets 與 cryptography

- production keys 來自 Secret Manager / KMS；repo、image、frontend env 與 CI log 不得含 plaintext。
- signing、encryption、API key hashing、webhook signing 使用不同 key purpose。
- key rotation 有 `kid`、owner、createdAt、activateAt、retireAt、rollback key 與演練證據。
- production startup 必須確認 issuer、audience、allowed algorithms、cookie key、CSRF key、CORS origins、session store、audit store 與 secret references 完整；缺一即不啟動。
- 不在本文件硬編自製密碼學演算法；採用維護中的 library / cloud primitives。

### 15.3 Environment boundary

- dev / test 可啟用 bootstrap headers，但 token、issuer、audience、keys 與 users 不得與 stage / prod 共用。
- stage 應盡量 production-like，只有具名 test users / partner credentials。
- production 禁用 demo seed users、default tenant fallback、mock identity、bootstrap scope override 與未設定 internal key 時的 fail-open。
- deploy pipeline 以 WIF 取得最小權限，不使用長效 service-account JSON key。

## 16. Break-glass 與資安事件處理

### 16.1 Break-glass

- 只處理 IdP outage、重大事件調查或無其他可用 admin 的復原，不作日常 convenience login。
- requester 與 approver 必須不同；scope 必須最小，TTL 最長 60 分鐘。
- 啟用前要求硬體或 phishing-resistant MFA；若 IdP 全面故障，使用 vault-controlled emergency proof。
- 每次 API 使用帶 `breakGlassGrantId`，UI 顯示 banner，session 不得 refresh。
- expiry 或 manual close 立即 revoke；24 小時內完成 post-use review 與 credential rotation 判定。

### 16.2 Auth incident runbook minimum

1. 確認受影響 principal、credential、session family、realm 與 resource scope。
2. revoke session / credential / device，必要時 suspend account 或 tenant integration。
3. 保全 security events、request traces、IdP logs、deployment / config change evidence，套用 legal hold。
4. rotate compromised key，確認 dependent services 與 dual-key cutover。
5. 搜尋 cross-tenant / privilege escalation / export / destructive action impact。
6. 恢復時重新驗 identity、重建 session，不沿用舊 refresh family。
7. 完成事後報告、控制修正、偵測規則與 UAT regression。

## 17. 實作工作包與 task IDs

### WP0：立即 containment 與 fail-closed

| Task ID      | Priority | Deliverable                                                            | Acceptance                                                      |
| ------------ | -------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `IAM-P0-001` | P0       | production feature gate 關閉 email-only tenant bootstrap               | 未經 proof 的 email 在 stage / prod 一律拒絕                    |
| `IAM-P0-002` | P0       | `/auth/token` 改 private verified exchange；拒絕 caller roles / scopes | 任意 bootstrap claim 無法 mint token                            |
| `IAM-P0-003` | P0       | global route inventory + unmatched route fail-closed                   | 每個 controller route classified；新增未分類 route 測試失敗     |
| `IAM-P0-004` | P0       | production auth startup validator                                      | 缺 issuer / audience / keys / origins / DB 時 deployment fail   |
| `IAM-P0-005` | P0       | CORS allowlist 與 auth security headers                                | 非 allowlisted origin preflight / credential request 拒絕       |
| `IAM-P0-006` | P0       | bootstrap headers local/test only                                      | production direct bootstrap E2E 全拒絕；local fixtures 可控保留 |

### WP1：IdP、session 與 token foundation

| Task ID       | Priority | Deliverable                                                  | Acceptance                                                         |
| ------------- | -------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `IAM-IDP-001` | P0       | tenant / partner-human managed OIDC + PKCE BFF flow          | callback negative matrix、MFA claims、tenant context live evidence |
| `IAM-IDP-002` | P0       | control-plane verified IAP subject -> membership resolution  | email header spoof、wrong audience、inactive workforce user 拒絕   |
| `IAM-SES-001` | P0       | durable sessions + refresh families schema / repository      | restart 不遺失 revoke state；expiry / rotation 生效                |
| `IAM-SES-002` | P0       | `sid / jti / tokenVersion / amr / auth_time` 與 revoke check；將最小 authority claim envelope 投影到 canonical request identity / session contracts | suspend / role change 60 秒內使舊 token 失效                       |
| `IAM-SES-003` | P1       | self session inventory、logout、logout-all、admin revoke；沿用 `IAM-SES-002` 的 session identifiers / masking rules | UI / API / audit / negative boundary 完成                          |
| `IAM-KEY-001` | P1       | asymmetric signing or managed key + `kid` rotation           | current / previous overlap、old key retirement、rollback drill     |

### WP2：帳號、角色與治理

| Task ID        | Priority | Deliverable                                                   | Acceptance                                                     |
| -------------- | -------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `IAM-ACC-001`  | P0       | canonical principal / membership / invitation data model      | unique / status / expiry / tenant constraints 與 backfill 完成 |
| `IAM-ACC-002`  | P1       | platform users durable CRUD + actor-aware audit               | restart 後資料保留；reason / before-after / actor 完整         |
| `IAM-ACC-003`  | P1       | tenant account lifecycle、invite proof、last-admin protection | invited 不可登入；self-escalation / last-admin negative tests  |
| `IAM-RBAC-001` | P0       | generated policy catalog 與 proxy / API parity                | 單一 source 產生 scopes；drift test 綠燈                       |
| `IAM-RBAC-002` | P1       | privileged role request / approval / expiry                   | SoD、step-up、session invalidation、audit 完成                 |
| `IAM-MFA-001`  | P1       | MFA / step-up policy enforcement                              | 各高風險 action 缺 fresh MFA 一律拒絕                          |
| `IAM-GOV-001`  | P1       | quarterly privileged access review workflow                   | campaign、remediation、overdue alert 與 evidence 完成          |
| `IAM-BG-001`   | P1       | break-glass request / approval / short session                | two-person、60m max、no refresh、post-use review               |

### WP3：Driver、partner 與 service credential

| Task ID       | Priority | Deliverable                                                 | Acceptance                                              |
| ------------- | -------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `IAM-DRV-001` | P0       | durable driver binding / invitation / hashed refresh family | restart / replay / expiry / revoke / rebind E2E         |
| `IAM-DRV-002` | P1       | mobile secure-storage、remote logout 與 compromised UX      | tokens 不進 log；revoke 後安全回登入                    |
| `IAM-PRT-001` | P1       | partner / tenant key expiry、owner、dual rotation、usage    | expiry fail closed、plaintext once、old key auto revoke |
| `IAM-SVC-001` | P1       | WIF service identity 與 audience-bound token                | production primary path 無 shared internal key          |
| `IAM-SVC-002` | P1       | internal key exception inventory / rotation / alert         | 每個例外有 owner、TTL、network boundary、removal date   |

### WP4：Audit、偵測、runbook 與驗收

| Task ID       | Priority | Deliverable                                                  | Acceptance                                                  |
| ------------- | -------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `IAM-AUD-001` | P0       | canonical security events + append-only persistence          | auth / session / role / credential matrix events 可查且遮罩 |
| `IAM-OBS-001` | P1       | metrics、dashboard、alerts 與 alert routing                  | refresh reuse / cross-tenant / privileged change drill      |
| `IAM-IR-001`  | P1       | credential compromise / account takeover runbook             | tabletop + staging revoke / rotate drill                    |
| `IAM-UAT-001` | P0       | automated auth negative matrix                               | P0 scenarios 全自動且 release-blocking                      |
| `IAM-UAT-002` | P1       | human UAT / live staging evidence pack                       | Security、Ops、Tenant owner sign-off                        |
| `IAM-DOC-001` | P1       | PRD / SA / SD / contract / OpenAPI / runbook controlled sync | canonical docs 與 runtime 無 contradictory wording          |

## 18. 建議執行波次

### Wave A：48 小時內完成 containment

- 建立 `IAM-P0-001` 至 `IAM-P0-006`。
- production / shared stage 先禁止 email-only tenant session 與 arbitrary bootstrap claims。
- 加入 production startup fail-closed 與 unmatched route test。
- 盤點所有現有 users、service keys、partner / tenant keys、driver refresh sessions 與 owners。

### Wave B：Identity / session foundation

- 完成 managed IdP 決策與 tenant OIDC flow。
- 建立 durable principal、membership、session、refresh family、invitation tables。
- 加入 token version / revoke 與 role-change invalidation。
- 將 control-plane identity 改為 verified IAP subject + server-resolved membership。

### Wave C：Account / RBAC productization

- platform / tenant account management 切到 canonical identity APIs。
- 建立 role catalog、generated scope policy、SoD、last-admin 與 approval workflow。
- 實作 MFA / step-up、session inventory、invite lifecycle 與 offboarding。

### Wave D：Driver / partner / service hardening

- driver binding / refresh family durable cutover。
- partner / tenant credential expiry、rotation、owner 與 usage alerts。
- service-to-service 切 WIF / audience-bound token，縮減 internal key exceptions。

### Wave E：治理與 release closure

- access review、break-glass、security dashboard 與 incident runbook。
- automated negative matrix、live staging evidence、rollback drill。
- controlled sync 回 PRD / SA / SD / contracts / OpenAPI / UAT / runbooks。

不得平行開太多依賴 task：WP0 先於所有 production claim；session data model 先於 UI session management；policy catalog 先於大量 route scope 調整；audit schema 先於 break-glass 與 access review closeout。

## 19. 測試與 UAT 必備矩陣

### 19.1 Authentication negative paths

- missing / expired / reused OIDC state、nonce、PKCE verifier。
- wrong issuer、audience、algorithm、realm、tenant membership。
- unverified email、invited-only、locked、suspended、disabled user。
- expired / revoked / already-used invitation。
- MFA missing、MFA too old、recovery method not allowed。
- login enumeration 與 rate-limit bypass。
- bootstrap headers、internal key、IAP email header spoof。

### 19.2 Authorization negative paths

- unknown route 沒有 policy。
- tenant A token 讀寫 tenant B resource。
- partner entry A token 讀寫 entry B booking / eligibility。
- driver A token 操作 driver B task / device。
- viewer / finance / technical / ops role 執行不相容 mutation。
- self role escalation、self approval、last-admin removal。
- stale token 在 role downgrade / suspend 後重播。
- object ID enumeration / IDOR。

### 19.3 Session / credential negative paths

- refresh token replay、parallel refresh race、expired family、compromised family。
- logout / logout-all / admin revoke 後 access 與 refresh token 重播。
- app / API restart 後 revoked driver binding 仍維持 revoke。
- driver rebind 前後舊 device session 重播。
- expired / revoked API key、dual-key overlap 結束、wrong scope、wrong tenant。
- signing key rotation current / previous / retired key matrix。

### 19.4 Audit / security controls

- 每個 allow / deny / approval / revoke 是否有正確 actor、target、reason、request / trace。
- raw token、secret、OTP、password、full PII 不出現在 logs / audit / analytics / screenshots。
- audit write failure 時 privileged mutation fail closed。
- CORS、CSRF、cookie flags、CSP、cache、redirect allowlist。
- alert 能從 event 觸發到 on-call，且 runbook 可找到受影響 sessions / credentials。

### 19.5 Minimum live staging journeys

1. Workforce user 經 IAP + MFA 登入，依 membership 取得 platform / ops 權限。
2. Tenant admin 經 OIDC + MFA 登入、邀請 tenant viewer；viewer 驗 invitation 後只能 read。
3. Tenant admin 提升 technical / finance role，觸發 approval / step-up 並使舊 session 失效。
4. Driver register、refresh、revoke、rebind；舊 token / refresh token / device 全拒絕。
5. Partner key issue、use、rotate、overlap、revoke、expiry 與 wrong-entry rejection。
6. User offboarding 使 human sessions、API keys、device binding 與 owned resources 完成 revoke / transfer。
7. Break-glass request、different approver、activate、use、expiry、post-use review。
8. Cross-tenant attempt 觸發 denial audit 與 security alert，無資料洩漏。

## 20. Release gates

### Gate 0：不可繞過的 production boundary

- bootstrap headers、demo identity、default tenant fallback 在 production 關閉。
- public route inventory 完整；unknown route fail closed。
- tenant login 有 cryptographic identity proof，不接受 email-only。
- production config 缺漏時 fail startup。

### Gate 1：Identity / session integrity

- issuer / audience / algorithm / key rotation 完整。
- durable session / refresh / driver binding 已 cutover。
- suspend、role change、revoke 可在 60 秒內阻斷舊 session。
- refresh reuse detection 與 alerts live-proven。

### Gate 2：Least privilege 與 account lifecycle

- platform / tenant / partner / ops roles 有 approved matrix。
- self-escalation、last-admin、SoD、approval、MFA / step-up enforced。
- invite、activate、lock、suspend、disable、offboard、reactivate 可操作且有 audit。

### Gate 3：Security operations

- security events、dashboard、alerts、retention、break-glass、incident runbook 可用。
- key / account compromise 與 rollback drill 完成。
- 所有 P0、P1 negative tests 綠燈，live staging evidence 由 Security、SRE、Ops 簽核。

任一 Gate 未過，不得以 UI 已完成、unit tests 綠燈或文件勾選替代 production readiness。

## 21. 指標與 SLO

| 指標                                          | Stage 1.5 目標                          |
| --------------------------------------------- | --------------------------------------- |
| classified API routes                         | 100%                                    |
| privileged human accounts with MFA            | 100%                                    |
| active accounts with named owner / membership | 100%                                    |
| production credentials with expiry / owner    | 100%                                    |
| role / suspend revoke propagation             | p95 <= 60 秒                            |
| offboarding revoke SLA                        | security incident 即時；一般 <= 15 分鐘 |
| refresh token reuse response                  | family revoke + alert <= 60 秒          |
| privileged mutations with complete audit      | 100%                                    |
| quarterly privileged access review completion | >= 98%，其餘具名 exception              |
| unknown / orphan privileged accounts          | 0                                       |
| secrets found in logs / client storage scans  | 0                                       |

## 22. Ownership / RACI

| 項目                         | Accountable                | Responsible                | Consulted / approver                      |
| ---------------------------- | -------------------------- | -------------------------- | ----------------------------------------- |
| Identity topology / IdP      | Head of Engineering        | Platform Engineering       | Security、SRE、Product                    |
| RBAC / SoD / role catalog    | Product / Operations owner | Platform Engineering       | Security、Finance、Compliance、Tenant Ops |
| Session / token / keys       | Security owner             | API / Platform Engineering | SRE                                       |
| Driver binding               | Mobility Engineering owner | Driver App + API           | Operations、Security                      |
| Partner / tenant credentials | Partner Platform owner     | API / Tenant Engineering   | Security、Partner Ops                     |
| Audit / alert / incident     | Security owner             | Security Engineering / SRE | Compliance、Operations                    |
| Access review / offboarding  | Business system owner      | User Admin / Tenant Admin  | Security、HR / Partner owner              |
| UAT / release sign-off       | Release owner              | QA / Engineering           | Security、SRE、Ops、Tenant representative |

## 23. Rollout、migration 與 rollback

### 23.1 Migration

- 先 inventory 現有 principals，以 `(issuer, subject)` 建 canonical identity；找不到 subject 的 seed / email records 標記 `migration_pending`，不可自動提升為 active privileged account。
- tenant memberships 由現有 `phase1_tenant_user_roles` backfill，但 `invited` 保持不可登入，必須重新發 proof-based invitation。
- platform users 與 workforce IdP groups 做一次 reconciliation；衝突採最小權限，不取兩邊聯集。
- 既有 JWT 可有短暫 read-only grace period，但 privileged writes 必須立即使用新 session claims；切換窗口不得超過一個舊 token lifetime。
- driver 舊 binding 轉 durable store 時，無法證明 refresh lineage 的 session 需重新註冊，不直接匯入明文 refresh token。
- partner / tenant keys 補 owner / expiry / hash metadata；未知 owner 的 key 先降 scope 並排定 revoke。

### 23.2 Rollback

- DB migration 採 expand -> dual-read / controlled dual-write -> backfill -> verify -> cutover -> contract 的順序。
- auth rollback 不得回到 email-only、bootstrap claim trust、unknown-route allow 或明文 refresh token。
- IdP outage 使用受控 break-glass，不以解除整個 auth guard 作回復方式。
- signing key rotation 保留 previous verification key 至 overlap 結束；發生問題只回切 signing key，不放寬 issuer / audience。
- 每個 wave 在 stage 做 rollback drill，記錄資料一致性、active sessions、audit continuity 與 restore time。

## 24. 決策門與待確認事項

以下項目要在 Wave B 前由具名 owner 定案，不能留給各畫面自行選擇：

1. managed IdP provider 與 tenant federation roadmap。
2. workforce IAP group 到 DRTS role 的 authoritative mapping owner。
3. token signing 採 cloud-managed asymmetric key 或 app-managed key ring。
4. tenant / partner human session cookie domain 與 BFF deployment boundary。
5. driver registration proof 的 delivery channel、device key / attestation 可用程度。
6. privileged role、finance threshold、legal-hold release 的 exact approval matrix。
7. account PII、IP / device risk data 的 retention / deletion policy 與法務依據。
8. access review overdue 的自動降權或 suspend 規則。
9. break-glass vault owner、approver roster 與 disaster drill cadence。

在上述 provider / policy 選擇完成前，WP0 的 containment、fail-closed、route inventory、startup validation與 durable session schema 仍可先進行，不應等待。

## 25. Stage 1.5 Definition of Done

只有同時符合以下條件，才能宣告 Stage 1.5 完成：

- P0 / P1 tasks 全部有 owner、reviewer、commit、tests 與 evidence，不存在只寫文件未落地的 done。
- 六個 realms 與所有 caller families 都有一條唯一、production-valid、文件與 runtime 一致的 auth path。
- 所有 API route 都被 public 或 authenticated policy 明確分類，default deny。
- human identity 使用可信 IdP proof；privileged roles 100% MFA；高風險操作有 step-up / approval。
- account、membership、invitation、session、refresh、device binding、credential 與 role binding 都是 durable authority。
- suspend、offboard、role change、revoke、refresh reuse 可即時阻斷並留下完整 audit。
- tenant / partner / driver resource isolation 的 automated negative matrix 全通過。
- bootstrap header、email-only、demo seed、default tenant 與 internal-key primary trust 已從 production 移除或被技術性封鎖。
- security dashboard、alerts、incident / break-glass / key rotation / rollback runbooks 完成 staging drill。
- PRD、SA、SD、service contracts、OpenAPI、DB migrations、UI、UAT、runbooks 與 `ai-status.json` 不存在互相矛盾的 production claim。

## 26. Controlled sync 與後續輸出

本文件核定後，依序產生或更新：

1. `phase1_service_contracts_v1.md`：Identity Service commands / queries / events 與 error contract。
2. `packages/contracts` 與 OpenAPI：identity、session、role、invitation、approval、review、credential contracts。
3. `infra/migrations`：canonical IAM tables、constraints、indexes、backfill與 append-only permissions。
4. `docs/03-runbooks/`：Stage 1.5 execution packet、key rotation、account compromise、break-glass、offboarding runbooks。
5. `docs/04-uat/` 與 tests：negative matrix、live staging journeys、evidence template。
6. `ai-status.json` / `current-work.md`：將 `IAM-*` task materialize 成 machine truth，指派 owner / reviewer / dependencies。
7. code-backed audit：每個 wave 完成後回寫「implemented / partial / blocked / live-proven」，不得沿用本文件的目標狀態冒充現況。
