# BUREAU-R13-AGENCY-READONLY-DESIGN-20261024：主管機關唯讀介面設計

Owner: Claude · Reviewer: Claude2 · Base: `origin/dev`
`352d347e25cfcaecc2ab21f376b6976cc0944486`

本文件是 E-17「主管機關自有唯讀介面」的實作設計，只定義下一筆實作任務要照做
的身分、登入、可查詢範圍、存取稽核、UI 入口與檔案清單。本任務只新增本文件，
沒有修改產品碼、migration、部署設定，也沒有啟動任何服務。

task-spec 的 `source` 寫的是 gap audit 當時的 `origin/dev 5633d6e`；本文件引用的
行號與 symbol 全部以上列 base SHA 重新讀碼核對。交通局 R01–R14 原始表單欄位
不在 repo 內（**未提供**），因此本文件只使用 repo 內既有契約的欄位，不臆補
主管機關表單要求。

## 1. 背景與問題

E-17 要求主管機關（以下稱「機關」）以自己的帳號登入一個唯讀介面，查詢
R09／R10／R11／R12／R14 的資料，且每次調閱都要留下不可竄改的存取紀錄。
現況逐項核對結果如下。

| 缺口                    | 實際依據（檔案:行 / symbol）                                                                                                                                                                                                                                                                                                     | 結論                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 沒有機關 realm          | `apps/api/src/common/auth/auth.types.ts:15-22` `AUTH_REALMS` = `system/platform/tenant/ops/driver/partner`；`AUTH_ACTOR_TYPES`（1-11）與 `AUTH_ROLE_FAMILIES`（35-41）也沒有機關                                                                                                                                                 | 確認                                                                                                                  |
| 契約層沒有機關 actor    | `packages/contracts/src/iam-policy-catalog.ts:3-24` `IAM_ACTOR_TYPES`、`IAM_REALMS`；`IdentityContext.realm`（`packages/contracts/src/index.ts:802-814`）、`AuditLogRecord.actorType`（`index.ts:1339-1351`）均無機關值                                                                                                          | 確認                                                                                                                  |
| `ops_observer` 不適用   | `iam-policy-catalog.ts:741-746` 只有 `regulatory:read`；身分只由 `IdentityRepository.ensureLiveMapObserverAccount`（`apps/api/src/modules/identity/identity.repository.ts:298-401`）建立，且 `DRTS_E2E_PROVISIONING !== "true"` 或 staging／production 時直接回 `null`；principal 固定為 `live-map-observer`、`issuer: "system"` | 這是 E2E live-map 觀察帳號，不是可邀請、可停用的真人身分，也屬 `ops` realm（內部 control plane）                      |
| IAP viewer 不適用       | `apps/api/src/modules/auth/iap-subject.adapter.ts:23-42` `PLATFORM_VIEWER_SCOPES` 無 `multi_taxi_records:read`；`ResolveIapSubjectOptions.requestedRealm` 只允許 `"platform" \| "ops"`（59）；角色只來自 platform／ops membership（264）                                                                                         | IAP 是內部員工入口；機關是外部帳號，不能放在 IAP 後                                                                   |
| UI 只有 staff 內 banner | `apps/platform-admin-web/lib/translations.ts:1428` `cmp.reports.readonlyTitle`；唯一使用處 `apps/platform-admin-web/components/sandbox-compliance-console.tsx:3910`                                                                                                                                                              | 只是 Tesla sandbox compliance console（platform-admin，IAP 後）內的說明 banner，不是機關可登入的頁面                  |
| R11 由平台代查          | `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md:322-326` 使用者為「既有授權的 Platform Admin／法遵人員」                                                                                                                                                      | 確認；R11 API 全部 `@RequireRealms("platform")`（`apps/api/src/modules/multi-taxi/multi-taxi.controller.ts:448-556`） |
| 無機關存取稽核          | `admin.audit_logs`（`infra/migrations/V0009__admin_reporting_audit_and_integrations.sql:75-91`）無 filter／row count 欄位，`actor_id uuid`、`tenant_id` FK `core.tenants`                                                                                                                                                        | 既有表無法正確記錄機關存取，見 §5                                                                                     |

另外兩個會直接影響安全邊界的現況（實作必須處理，不能只「加一個 realm」）：

1. `BootstrapAuthGuard.assertRealmAllowed`（`apps/api/src/common/auth/bootstrap-auth.guard.ts:914-939`）
   在 `allowedRealms.length === 0` 時直接放行；非 strict 環境沒有分類的 route 會落入
   `default-authenticated`（同檔 312-331，`allowedRealms: []`）。若只新增 realm，
   機關 session 可以呼叫所有未限制 realm 的 route。
2. `JwtAuthService.validateDurableState`（`apps/api/src/common/auth/jwt-auth.service.ts:1015-1201`）
   只對 `tenant`、`partner`、`platform`/`ops`（1134）做持久狀態核對，其他 realm 落到
   1200 行 `return true`。機關 realm 若沒有自己的分支，停用或過期後既有 token 仍有效。

## 2. 身分模型

### 2.1 新 realm 與 actor type

| 項目        | 值                                                    | 寫入位置                                                                                                                                                                         |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| realm       | `agency`                                              | `AUTH_REALMS`（auth.types.ts）、`IAM_REALMS`（iam-policy-catalog.ts）、`IdentityContext.realm`（contracts index.ts:814）                                                         |
| actor type  | `agency_user`                                         | `AUTH_ACTOR_TYPES`、`IAM_ACTOR_TYPES`、`IdentityContext.actorType`、`AuditLogRecord.actorType`                                                                                   |
| role family | `agency`                                              | `AUTH_ROLE_FAMILIES`、`IAM_ROLE_FAMILIES`、`AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE`（`apps/api/src/common/auth/auth.constants.ts:29-42`）                                              |
| role code   | `agency_viewer`、`agency_exporter`                    | 新增 `IAM_AGENCY_ROLE_POLICY_DEFINITIONS`（仿 `IAM_TENANT_ROLE_POLICY_DEFINITIONS`，iam-policy-catalog.ts）                                                                      |
| realm 路徑  | `agency_oidc_bearer`                                  | `AuthPrimaryPath`（contracts index.ts:850-855）與 `AUTH_REALM_PATH_MATRIX`（`apps/api/src/common/auth/auth.matrix.ts`），`plane: "business_plane"`、`defaultIapProtected: false` |
| 身分 claim  | `BootstrapRequestIdentity.agencyId`（新增、optional） | auth.types.ts:56-89；JWT payload 與 `JwtAuthService.toRequestIdentity`                                                                                                           |

為什麼進 `AUTH_REALMS`，而不是比照 `PASSENGER_AUTH_REALM`（auth.types.ts:26-27）放在
canonical IAM 之外：乘客 realm 的註解明確寫「不參與 canonical IAM membership/session
contracts」；機關帳號需要邀請、membership、role binding、session 撤銷，正是 canonical
IAM（`iam.identity_*`）的職責。比照的是 `partner_user`（Host）新增 actor 的既有慣例
（commit `283a065e0`，SR-WIRE-001）：同時改 `IAM_ACTOR_TYPES`、actor policy 與
`AUTH_SCOPE_PRESETS` 的來源，並加 regression 防止 preset 為 `undefined`
（`tests/unit/system-remediation/sr-wire-001/iam-host-role.test.ts`）。

不使用 `ops_observer`、IAP `viewer` 的理由見 §1 表格：前者是 E2E 固定帳號、屬內部
`ops` realm；後者只解析 platform／ops workforce membership，且兩者 scope 集合都與
R09–R14 不符。新增的機關 scope 不得加進任何既有 actor policy。

### 2.2 Scope（命名沿用 `<resource>:<action>`，如 `multi_taxi_records:read`）

| scope                        | `allowedRealms`      | 授予                               | 用途                           |
| ---------------------------- | -------------------- | ---------------------------------- | ------------------------------ |
| `agency:trip_records:read`   | `system`, `agency`   | `agency_viewer`、`agency_exporter` | R11 列表／單筆                 |
| `agency:trip_records:export` | `system`, `agency`   | `agency_exporter`                  | R11 受控匯出                   |
| `agency:reports:read`        | `system`, `agency`   | `agency_viewer`、`agency_exporter` | R09、R10、R12                  |
| `agency:qualifications:read` | `system`, `agency`   | `agency_viewer`、`agency_exporter` | R14                            |
| `agency:directory:read`      | `system`, `platform` | `platform_admin`                   | 機關／成員／邀請查詢           |
| `agency:directory:write`     | `system`, `platform` | `platform_admin`                   | 建立機關、邀請、停用、延長期限 |
| `agency:access_audit:read`   | `system`, `platform` | `platform_admin`                   | 檢閱機關存取紀錄               |

`resourceConstraints` 新增 `IAM_RESOURCE_CONSTRAINT_KINDS` 值 `agency`，`claimKey: "agencyId"`，
用於前四個 scope。是否把 `agency_viewer` 與 `agency_exporter` 分開、或只開一種角色，
是 open decision D3；設計同時支援兩者，成本只是一筆 role policy。

### 2.3 資料模型

沿用 canonical identity 四張表（`infra/migrations/V0068__canonical_identity_authority.sql`），
它們的 `realm` 欄位是 `varchar(50)` 且沒有 realm CHECK（3-112 行），不需改表即可存
`agency`：

| 表                           | 機關用法                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iam.identity_principals`    | 一個 Google 帳號一筆，`(issuer, subject)` UNIQUE（`uq_identity_principals_issuer_subject`）；`email_verified` 必須為 true                                                         |
| `iam.identity_memberships`   | `realm = 'agency'`、`scope_ref = 'agency:<agencyId>'`、`tenant_id`/`partner_id` 為 NULL；`agencyId` 同時寫入 `record` jsonb。`uq_identity_memberships_context` 保證一人一機關一筆 |
| `iam.identity_role_bindings` | `role_code` = `agency_viewer` 或 `agency_exporter`；`valid_to` **必填**，代表存取到期日                                                                                           |
| `iam.identity_invitations`   | `realm = 'agency'`、`scope_ref` 同 membership、`role_code`、`token_hash`、`expires_at`；`delivery_status` 只用 `chk_identity_invitations_delivery_status` 允許值                  |

新增一張機關主檔（目前 repo 沒有任何機關／regulator 組織表，已 grep `infra/migrations`
確認），見 §7.3 migration 1：`core.regulatory_agencies`
（`agency_id`、`agency_code` UNIQUE、`display_name`、`status`：`active`/`suspended`/`retired`、
`created_by_principal_id`、`created_at`、`updated_at`、`record jsonb`）。
不填入任何真實機關名稱或代碼種子資料（見 D1，並避免重演
`GCP-TOS-REMEDIATION-20260907` 的真實機構識別問題）。

### 2.4 建立、邀請、解除

1. **建立機關**：platform admin `POST /api/platform-admin/agencies`，寫 `core.regulatory_agencies`，
   同交易寫 `admin.audit_logs`（既有 `AuditNotificationService.recordAuditLogAsync`）。
2. **邀請**：`POST /api/platform-admin/agencies/:agencyId/invitations`
   （`email`、`roleCode`、`accessValidTo`）。在同一交易建立 principal 草稿
   （`account_status = 'invited'`）、membership（`invited`）、role binding（`valid_to = accessValidTo`）
   與 invitation（`pending_delivery`）。token 產生方式比照
   `TenantPartnerService.issueTenantInvitation`（`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:17327`
   起：raw token 只出現在信件，DB 只存 hash）。寄送使用新的
   `AgencyInvitationDeliveryService`，結構比照 `TenantInvitationDeliveryService`
   （`tenant-invitation-delivery.service.ts:80`），以 `AGENCY_INVITATION_ACCEPT_URL_BASE`
   組連結；只有 adapter 回 `sent` 才寫 `delivered`，否則 `delivery_failed`，不偽造寄送成功。
3. **接受**：新增 `IdentityRepository.acceptAgencyOidcInvitation(tokenHash, proof)`，語意比照
   `acceptTenantOidcInvitation`（identity.repository.ts:787 起）：同一交易鎖 invitation、
   membership、principal、role binding；驗證 `realm === 'agency'`、未接受、未撤銷、未過期、
   Google verified email 等於 `target_email`、`proof.agencyId`（若 state 帶入）等於 invitation 的
   agency；再同時把 principal `issuer/subject` 寫成 `(proof.issuer, proof.subject)`、
   principal 與 membership 改 `active`、invitation 寫 `accepted_at`。任何一步失敗全部 rollback，
   不耗用 invitation。機關沒有 legacy tenant user 表，所以不經 `syncLegacyTenantUserRole`。
4. **一般登入**：`findPrincipalBySubject(issuer, subject)`（identity.repository.ts:1226）→
   `findMembershipsByPrincipalId` 取 `realm === 'agency'` 且 `active` 的 membership → role binding。
   未綁定的 `(issuer, sub)` 一律拒絕，不按 email 自動登入（與 tenant 決策一致）。
5. **停用／撤銷**：
   - `POST /api/platform-admin/agencies/:agencyId/members/:membershipId/deactivate`：membership
     改 `disabled`，同交易呼叫 `IdentityRepository.revokeAllSessionsForPrincipal`（1830）。
   - `POST .../invitations/:invitationId/revoke`：寫 `revoked_at`。
   - `PATCH /api/platform-admin/agencies/:agencyId`（`status: suspended`）：撤銷該機關全部成員 session。
   - `POST .../members/:membershipId/access-period`：只允許調整 role binding `valid_to`。

### 2.5 過期／停用如何連動撤權

在 `JwtAuthService.validateDurableState` 新增 `payload.realm === "agency"` 分支（放在
1134 行 platform/ops 分支之後、1200 行 `return true` 之前），每次請求都核對：

1. principal 存在且 `status === "active"`；
2. membership 的 `membershipId`、`realm === "agency"`、`status === "active"`，且 `scope_ref`
   的 agencyId 等於 token 的 `agencyId`；
3. `core.regulatory_agencies.status === "active"`；
4. 至少一筆 role binding `valid_from <= now < valid_to`，且 `valid_to` 非 NULL；
5. `computeWorkforceTokenVersion(principal、membership、role binding updatedAt)` 等於
   `payload.tokenVersion`；token scopes 是有效 role binding preset 的子集合。

既有 platform/ops 分支不看 `valid_to`；機關分支必須看，因為「到期撤權」是本需求的
驗收點。這是請求時判斷，所以不需要新增排程或背景工作（符合 VM 限制）。session
上限沿用 tenant 的 8 小時（`TENANT_SESSION_MAX_AGE_SECONDS`，
`packages/tenant-auth/src/constants.ts:6`；API 端 `issueSessionToken(..., { expiresIn: "8h" })`）。

### 2.6 預設拒絕（deny-by-default）

在 `BootstrapAuthGuard` 對 `identity.realm === "agency"` 加兩條規則，放在
`assertRealmAllowed` 之前：

1. route 的合併 `allowedRealms` 必須**明確包含** `agency`；空陣列或
   `default-authenticated` 對機關一律 403 `AUTH_REALM_DENIED`。
2. HTTP method 必須在 `AUTH_ROUTE_READ_METHODS`（auth.constants.ts:17）內；唯一例外是一份
   固定 allowlist：`POST agency/trip-records/export-jobs/preview`、
   `POST agency/trip-records/export-jobs`、`POST auth/logout`、`POST auth/logout-all`。
   匯出建立是產生存取紀錄與匯出檔，不改變任何營運資料。

## 3. 登入方式

### 3.1 沿用與差異

沿用 ENTRY-TENANT-GOOGLE-OIDC-20261005
（`docs/02-architecture/entry-tenant-google-oidc-20261005.md`）的同一條路徑：
`OidcPkceService.generateLoginParameters`（`apps/api/src/modules/auth/oidc-pkce.service.ts:239`）
產生 S256 PKCE、nonce 與簽章 state token → BFF 以 HttpOnly state cookie 保存 →
callback 以 `x-oidc-state-token` header 交給 API → `validateAndExchangeCode`
（1018-1024 行驗證 `stateRecord.realm === expectedRealm`）→ `OidcIdTokenVerifier`
驗 issuer／audience／JWKS → 依 `(issuer, sub)` 綁定授權。

| 項目              | tenant（既有）                                                                            | agency（新增）                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| login URL         | `GET /api/auth/:realm/login`，目前只允許 `tenant`/`partner`（auth.controller.ts:211-235） | 同 endpoint 加允許 `agency`                                                                   |
| 邀請 login        | `POST /api/auth/tenant/invitation-login`（239）                                           | 新 `POST /api/auth/agency/invitation-login`，state 帶 `invitationTokenHash` 與 `agencyId`     |
| callback exchange | `POST /api/auth/tenant/callback-session`（273）                                           | 新 `POST /api/auth/agency/callback-session` → `OidcPkceService.exchangeAgencyCallbackSession` |
| 身分解析          | `findTenantUserByOidcIdentity`／`acceptTenantOidcInvitation`                              | `findPrincipalBySubject` + agency membership／`acceptAgencyOidcInvitation`                    |
| email_verified    | 必須為 true（oidc-pkce.service.ts:396）                                                   | 相同                                                                                          |
| MFA               | `hasTrustedMfa({amr, acr})`；`tenant_admin`/`tenant_ops_admin` 強制（584-637）            | 相同函式；production 是否強制見 D2                                                            |
| dev 豁免          | `DRTS_DEV_MFA_WAIVED`，staging/production 禁用，使用時必須寫 security event               | 相同，event type `agency_oidc_session.mfa_waived`                                             |
| security events   | `tenant_oidc_session.issued/denied`                                                       | `agency_oidc_session.issued/denied`（`admin.security_events`，V0069）                         |

同一個 Google OAuth client（repo variable `DEV_OIDC_CLIENT_ID`）可以沿用：ID token
audience 驗證不變，跨 realm 重放由 state token 的 realm 綁定擋下。只需由 operator 在該
client 加一條精確 redirect URI（§3.2），並把新 origin 加入 API 的 `AUTH_ALLOWED_ORIGINS`
（`validateRedirectUri` 依 allowed origins 精確比對 origin，oidc-pkce.service.ts:207-224）。

### 3.2 App／host 決定：新 app `apps/agency-portal-web`

**決定：新建獨立 Next.js app `apps/agency-portal-web`，部署為 Cloud Run
`drts-dev-agency-portal-web`，公開 HTTPS，不在 IAP 後。** 建議子網域
`agency.smarttransport.tw`（名稱可由使用者改，見 D5），callback
`https://agency.smarttransport.tw/api/auth/agency/callback`，另加 Cloud Run `status.url`
的 run.app fallback（與 tenant 相同作法）。

理由：

1. **不能放 platform-admin-web**：`AUTH_REALM_PATH_MATRIX` 的 platform realm
   `defaultIapProtected: true`、走 control-plane inner bearer（auth.matrix.ts）；IAP 只解析
   workforce membership（iap-subject.adapter.ts）。機關是外部 Google 帳號。設計 canvas
   `docs/05-ui/drts-design-canvas/platform-regulator.jsx:2` 把 Regulator Viewer 放在 Platform
   Admin governance shell，那是 Tesla sandbox（S2 ruling）給內部人員檢視的 delta；本需求明確
   要求機關自有、非 IAP 的入口，兩者衝突，見 D6。
2. **不能放 tenant-console-web route group**：`@drts/tenant-auth` 的 handler 寫死
   `tenant/callback`（`packages/tenant-auth/src/route-handlers.ts:151`）、cookie
   `drts_tenant_session`（constants.ts:1），`verifyTenantSession` 只接受 `realm === "tenant"`
   （`verified-tenant-session.server.ts:38`）。同一 host 混兩種 realm 的 session cookie，
   會讓 logout、CSRF 與 middleware 判斷混在一起；`tenant.smarttransport.tw` 也是租戶品牌。
3. **符合既有 host-only cookie 先例**：企業派車 `apps/enterprise-dispatch-web` 與 tenant
   共用 API 登入，但每個 host 自己持有 state／session／CSRF cookie
   （entry-tenant-google-oidc-20261005.md「企業派車採同一 API 的獨立 PKCE callback」）。
4. **公開曝光預設關閉**：新服務比照 `deploy-dev.yml` 既有 `*_ALLOW_UNAUTHENTICATED`
   （91-99、279-287，`exposure_flag ... false`），新增 `DEV_AGENCY_PORTAL_ALLOW_UNAUTHENTICATED`，
   預設 private；開放由 operator 明確設定。

BFF 實作：新 package `packages/agency-auth`（`createAgencyAuthHandlers`、
`verifyAgencySession`，要求 `realm === "agency"` 且有 `agency_id`），cookie 名稱
`drts_agency_session`／`drts_agency_oidc_state`／`drts_agency_csrf`。純工具函式
（CSRF、state envelope、`sanitizeReturnPath`、`isSecureEnvironment`）直接 import
`@drts/tenant-auth/session`（package.json `exports` 已公開），不複製、不改 tenant 行為。

## 4. 可查詢範圍

所有機關 API 掛在新 controller `AgencyPortalController`（`@Controller("agency")`、
`@RequireRealms("agency")`），由新 `AgencyPortalService` 呼叫既有權威 service，再做
**機關專屬投影**（allowlist 欄位，未列出的欄位一律不回傳）。不直接把機關 realm 加到
`platform-admin/*`、`reports/*`、`regulatory-registry/*` 既有 route，因為那些 route 回傳
內部完整欄位（例如 `MultiTaxiTripOperationalAdminView` 的 `legalHold.activeHolds[].placedByActorId`）。

遮罩函式全部沿用 `apps/api/src/common/sensitive-data-policy.ts`：`maskName`（70）、
`maskPhone`（86）、`maskEmail`（103）、`maskAddress`（118）、`maskOpaqueToken`（131）。
值為 `null` 或來源沒有該欄位時，回傳 `null`，UI 顯示「未提供」，不補 0 或預設值。

### 4.1 R11 行程紀錄（2 年保存檢視與匯出）

權威來源：`reporting.multi_taxi_trip_operational_records`（原定義於 `V0056__multi_taxi_runtime_compliance_closure.sql`，並由 `V0135__multi_taxi_trip_record_truth_retention.sql` 補齊逐趟真值欄位、歷史回填與 DB 保存／法律保留防護）。
每一趟 `runtimeProfileCode === "multi_taxi_direct"` 的多元化計程車行程於司機完成行程的**同一筆交易**（`OwnedMobilityService.finalizeDriverTaskCompletionInTransaction` → `MultiTaxiRepository.persistTripOperationalRecordInTransaction`）寫入單一邏輯 R11 營運紀錄（`recordId = mtr-<orderId>`，`ON CONFLICT (order_id)` 冪等重播；若完成交易回滾，R11 紀錄一併回滾）。
`MultiTaxiService.listTripOperationalRecords`、`getTripOperationalRecord` 與 `exportTripOperationalRecords` 直接讀取已提交之 `reporting.multi_taxi_trip_operational_records`（並關聯 `billing.multi_taxi_passenger_payments` 實收狀態與 `AuditNotificationService` 證據治理／法律保留狀態），不再由單一行程的記憶體啟動快取重算。既有已完成的歷史多元化計程車行程由已提交之訂單／司機任務／派車指派／電子乘車證明／付款紀錄回填對齊，缺漏的歷史事實誠實標示為 `null`／`"unavailable"`／`"unknown"`，絕不以派車時間、更新時間、預估路線或報價金額冒充。

每筆紀錄的 `generatedAt` 為實際完成時間（`completedAt`），`retainUntil = computeTwoCalendarYearRetentionFloorIso(generatedAt)`（依計程車客運服務業申請核准經營辦法第 18 條第 10 款「至少保存二年」與民法第 119、121、123 條曆年期間計算，至少保存滿兩曆年且不少於 730 日：例如 `2026-10-25T02:00:00.000Z` 跨越 2028 閏年須保存至 `2028-10-25T02:00:00.000Z`，不得以固定 730 日提前於 `2028-10-24T02:00:00.000Z` 屆滿；非閏年控制組 `2028-03-01T02:00:00.000Z` 保存至 `2030-03-01T02:00:00.000Z`；閏日 `2028-02-29T02:00:00.000Z` 起算進位至 `2030-03-01T02:00:00.000Z` 而不提前於 `2030-02-28` 屆滿；既有更長 `retainUntil` 絕不縮短）；`reservedAt` 為 `order.reservationWindowStart ?? order.createdAt`；`pickupAt` 為司機實際載客起算時間（`task.startedAt`，歷史無紀錄時為 `null`，不以 `assignedAt` 冒充）；`dropoffAt` 為實際下車完成時間（`command.completedAt`／`task.completedAt`，不以 `updatedAt` 冒充）。

| API                                                        | scope                        | 重用                                                                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/agency/trip-records`                             | `agency:trip_records:read`   | `listTripOperationalRecords`，再套保存邊界、精確篩選、分頁與列表投影                                                                                                                         |
| `GET /api/agency/trip-records/:recordId`                   | `agency:trip_records:read`   | `getTripOperationalRecord`／`listTripOperationalRecords` 以 `recordId` 取單筆；保存邊界外或不存在一律 404                                                                                    |
| `POST /api/agency/trip-records/export-jobs/preview`        | `agency:trip_records:export` | `AgencyPortalService` 先呼叫 `exportTripOperationalRecords(scope)` 並套保存邊界與精確範圍，再以過濾後筆數呼叫 `ReportingFilingService.previewMultiTaxiTripExport(scope, recordCount, identity)` |
| `POST /api/agency/trip-records/export-jobs`                | `agency:trip_records:export` | 同上取得過濾後 rows，呼叫 `createMultiTaxiTripExportJobDurably(command, rows, identity)`（需 `purpose`、`idempotencyKey`，`CreateMultiTaxiTripOperationalExportJobCommand`）                 |
| `GET /api/agency/trip-records/export-jobs/:jobId`          | `agency:trip_records:export` | `getMultiTaxiTripExportJob`，只回本機關、本人建立的 job                                                                                                                                      |
| `GET /api/agency/trip-records/export-jobs/:jobId/download` | `agency:trip_records:export` | `issueMultiTaxiTripExportDownload`（controlled download，簽章下載連結），同上擁有者核對                                                                                                      |

既有 `preview`／`create` 的 rows 與 `recordCount` 本來就由 caller 傳入（平台端是
multi-taxi.controller.ts 先呼叫 `exportTripOperationalRecords`），所以機關的保存邊界與精確篩選範圍
在 `AgencyPortalService` 傳入前套用即可，並由 `ReportingFilingService.normalizeMultiTaxiTripExportScope` 一併驗證與持久化至匯出 job scope。

機關查詢參數（列表與匯出 scope 對齊）：
- 日期區間：`month`（`YYYY-MM`）、`reservedFrom`、`reservedTo`（ISO 日期，比對 `reservedAt`）
- 核准車號精確查詢：`plateNo`（精確比對完整車號，不分大小寫但須完整一致）
- 訂單／趟次識別碼精確查詢：`orderNo`、`orderId`、`tripId`、`recordId`（精確比對，不開放任意子字串模糊搜尋）
- 列表附加參數：`legalHold`（`all`／`active`／`none`）、`page`、`pageSize`（上限 200）。
- **不接受任意子字串 `q`**：既有平台端 `q` 允許任意子字串比對未遮罩欄位，機關路徑拒絕 `q`（回 400 `AGENCY_QUERY_PARAMETER_UNSUPPORTED`；欄位格式錯誤回 400 `AGENCY_QUERY_INVALID`），僅開放上述法定最小精確查詢條件並回傳總筆數（`total`）。`AgencyPortalService.tripFilter` 將精確查詢條件（`plateNo`、`orderNo`、`orderId`、`tripId`、`recordId`、`month`、`reservedFrom`、`reservedTo`、`legalHold`、`page`、`pageSize`）完整記錄至 `admin.agency_access_logs.filter`。

必要的權威層調整：

- `ReportingFilingService.assertMultiTaxiTripExportAccess`
  允許 `realm === "platform"`（`platform_admin` + `multi_taxi_records:export`）與 `realm === "agency"`（`agency_user` + `agency:trip_records:export`）。
- job 擁有者：`MultiTaxiTripExportJobMetadata` 與 `EvidenceAccessIdentity` 帶 `agencyId?`；agency identity 呼叫 `getMultiTaxiTripExportJob`／`issueMultiTaxiTripExportDownload` 時核對 `requestedByActorId === identity.actorId` 且 `agencyId === identity.agencyId`，不符回 404，機關不能讀平台或其他機關／其他使用者的 job。
- `normalizeMultiTaxiTripExportScope` 驗證並保留 `month`、`reservedFrom`、`reservedTo`、`plateNo`、`orderNo`、`orderId`、`tripId`、`recordId`，使匯出 job scope 與機關列表篩選條件完全一致並參與 idempotency 比對。
- `assertEvidenceAccess` 的 `report_artifact` 規則包含 `{ realms: ["agency"], actorTypes: ["agency_user"], requiredScopes: ["agency:trip_records:export"], tenantScoped: false }`。

**2 年（兩曆年）保存邊界與持久保護**：
- 資料庫層（`V0135`）透過 `reporting.multi_taxi_two_calendar_year_retention_floor(generated_at)` 強制 `retain_until >= max(generated_at + 2 calendar years in UTC, generated_at + 730 days)`（閏日 2/29 起算進位至 3/1，絕不提前屆滿），禁止 `TRUNCATE`、禁止將既有 `retain_until` 縮短、禁止竄改已寫入之核心趟次事實（`record_id`、`order_id`、`trip_id`、`vehicle_id`、非 `'UNRECORDED'` 之 `plate_no`、`reserved_at`、已非 NULL 之 `pickup_at`/`dropoff_at`、`generated_at`），且當 `GREATEST(retain_until, reporting.multi_taxi_two_calendar_year_retention_floor(generated_at)) > clock_timestamp()` 時拒絕任何 `DELETE`。
- 超過兩曆年保存期後，仍須同時具備 `reporting.allow_trip_record_retention_purge = 'on'` 且該趟次無有效法律保留（`voice.legal_hold` 針對 `proof_bundle`／`multi_taxi_trip_record` 之 `active` hold）或刪除例外（`AuditNotificationService` deletion exception），才允許受控清理。任何選填參考時間（`nowIso`／`reporting.trip_record_retention_now`）均以真實當下時鐘封頂（`LEAST(..., clock_timestamp())`／`Math.min(..., Date.now())`），僅可作不高於真實 DB 時鐘之歷史保守篩選，絕不允許以未來參考時鐘提前刪除尚未屆滿真實兩曆年／更長 `retain_until` 之紀錄。
- 機關列表、詳情與匯出只包含 `retainUntil >= now` 的紀錄（保存期限至少滿兩曆年，例如 `2026-10-25T02:00:00Z` 完成之紀錄於 `2028-10-24T02:00:00Z` 仍為有效可查且不可刪除，至少保存至 `2028-10-25T02:00:00Z`）。

**D4 決議與九大法定欄位投影／來源誠實性**：
依 `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md` 與 `08_multi_taxi_operations_ui_design_requirements_20260723.md`，R11 九大法定欄位類別（車號、預約時間、上車時間、下車時間、行駛路線、行駛里程、應付車資、實收車資、通行費）在機關列表、詳情（`AgencyTripRecordView`）與 CSV 匯出（`MultiTaxiTripOperationalExportRow`）完整揭露，不另設新的使用者權限 gate（維持既有 `agency:trip_records:read` 與 `agency:trip_records:export`）：
1. **車號**：揭露完整法定車號 `plateNo`（同時保留 `plateNoMasked` 供相容顯示）。
2. **預約／上車／下車時間**：原值揭露 `reservedAt`、`pickupAt`、`dropoffAt`；缺漏時為 `null`（UI 顯示「未提供」）。
3. **行駛路線與行駛里程（含 `telemetry.driver_location_events` 評估與來源 provenance）**：
   - `route.routeSummary`：完成時保存之起訖路線摘要（例如 `pickup.address -> dropoff.address`），歷史缺漏時為 `null`。
   - `route.distanceMeters`、`route.durationSeconds`：實際完成里程（公尺）與行駛時間（秒）；若僅有預估路線或歷史未記錄實際里程，區分來源且不將預估路線偽裝為實際 GPS 軌跡。
   - **既有 `telemetry.driver_location_events` 持久軌跡評估與兩曆年快照保存**：R11 完成交易寫入（`MultiTaxiRepository.persistTripOperationalRecordInTransaction`）與歷史回填（`V0135`）會針對權威完單司機任務（`ops.phase1_driver_tasks.status = 'completed'`）核對 `driver_id`、`task_id`、車輛所有權（若樣本 `e.vehicle_id IS NULL`，僅可由權威任務 `at.vehicle_id` 解析；若樣本 `e.vehicle_id` 非空且與任務車輛不符則拒絕）、時間窗 `[pickup_at, dropoff_at]`、`work_state = 'on_trip'`、`out_of_order = false` 與 `accuracy_m <= 100`（依 `recorded_at ASC, sequence_no ASC` 排序）。
     - 當有效樣本數 `>= 2` 且包含起點／相鄰樣本／終點之最大間隔 `maxGapSeconds <= 180` 秒時，標示 `route.source = "driver_gps"`（`coverage = "full_sampled"`、`pointCount = validSampleCount`、持久保存取樣折線與 `telemetryProvenance`）。
     - 當僅有單點樣本（`validSampleCount = 1`、`encodedPolyline = null`）或取樣間隔過大（`maxGapSeconds > 180`）時，誠實標示 `route.source = "mixed"`（`coverage = "single_point" | "gapped_sampled"`），絕不將單點或斷續心跳冒充為完整行駛軌跡 `"driver_gps"`。
     - 當無符合條件之 GPS 樣本時，依實際完成摘要標示 `"pickup_dropoff_summary"`（`pointCount = 0`、`encodedPolyline = null`，不沿用派車前預估折線）、僅有派車預估時標示 `"provider_route"`，或歷史缺漏標示 `"unavailable"`。
     - 取樣後之路線幾何、點數與 `telemetryProvenance` 直接保存在 `reporting.multi_taxi_trip_operational_records.record->'route'` 達完整兩曆年法定保存期（與該趟 R11 紀錄 `retainUntil` 同壽命保存；即使底層 `telemetry.driver_location_events` 日後清理或重播 upsert，亦不降級已保存之 `driver_gps`／`mixed` 快照）。
   - `route.encodedPolyline`：原始座標折線仍不對機關回傳，兼顧法定行駛路線查核與乘客住址座標最小揭露。
4. **應付車資、實收車資、通行費（含收款狀態 provenance 與平台端 P5 對齊）**：
   - `payableFareMinor`：契約預告／應付車資。
   - `actualFareMinor`：行程完成計費金額（`sync_multi_taxi_trip_record_payment` 僅同步收款狀態與實收金額，不覆寫完單 `actual_fare_minor`）。
   - `collectedFareMinor` 與 `paymentStatus`：對齊 `billing.multi_taxi_passenger_payments` 真實收款結果——僅於 `paymentStatus === "captured"` 時為實際扣款金額；`paymentStatus === "refunded"` 時為 `0`；`not_selected`／`authorized`（待請款）／`failed`／`manual_recovery`／`unknown` 時為 `null`，絕不將未請款、失敗或已退款之交易偽裝為正數實收車資。
   - `tollMinor` 與 `tollSource`：司機完單證明（`expenseItems.toll`）或電子乘車證明紀錄之通行費；明確為 0 時回傳 `0`，歷史紀錄無通行費證據（`tollSource === "unavailable"`）時在 `MultiTaxiTripOperationalRecord`、機關檢視與 CSV 匯出均保持 `null`（未提供，不轉為 `0`）。
   - **平台端 P5 既有消費端同步對齊**：`apps/platform-admin-web/app/platform-admin/p5/records/records-operations-model.ts`、`records-operations-console.tsx` 與 `p5-admin-console.tsx` 同步透過 `resolveRecordCollectedFareMinor`／`resolveRecordTollMinor`／`formatRecordMoney` 呈現 `collectedFareMinor`、`paymentStatus`、`tollSource` 與 `route.routeSummary`，對未收款或未知通行費顯示未提供（`—`）而非 `$0`。

| 欄位                                                           | 列表／詳情（`AgencyTripRecordView`）          | 匯出（`MultiTaxiTripOperationalExportRow`）                | 規則／來源                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `recordId`、`orderId`、`tripId`                                | 原值                                          | 原值（`recordId`、`orderId`、`tripId`）                    | 供精確查核與跨表對照                                                                         |
| `orderNo`                                                      | `orderNoMasked`                               | `orderNoMasked`                                            | `maskOpaqueToken(v, 3, 2)`                                                                   |
| `plateNo`                                                      | `plateNo`（全碼）＋ `plateNoMasked`           | `plateNo`（全碼）＋ `plateNoMasked`                        | D4 決議：法定車號全碼揭露，保留遮罩欄位相容                                                  |
| `reservedAt`、`pickupAt`、`dropoffAt`                          | 原值                                          | 原值                                                       | 法定時間欄位；`pickupAt` 取自實際上車時間，缺漏為 `null`                                     |
| `route.routeSummary`、`route.source`                           | 原值                                          | `routeSummary`、`routeSource`                              | D4 決議：揭露起訖路線摘要與路線來源，不回傳 `encodedPolyline`                                |
| `route.distanceMeters`、`route.durationSeconds`                | 原值                                          | `distanceMeters`、`durationSeconds`                        | 法定行駛里程與時間；缺漏為 `null`                                                            |
| `payableFareMinor`、`actualFareMinor`                          | 原值                                          | `payableFareMinor`、`actualFareMinor`                      | 應付車資與完單計費車資                                                                       |
| `collectedFareMinor`、`paymentStatus`                          | 原值（未收／失敗為 `null`，退款為 `0`）       | `collectedFareMinor`、`paymentStatus`                      | 實收車資真值與收款狀態（`captured`／`refunded`／`authorized`／`failed`／`not_selected` 等） |
| `tollMinor`                                                    | 原值（未知時 `null`）                         | `tollMinor`（未知時 `null`）、`tollSource`                 | 通行費與來源（`driver_proof`／`electronic_receipt`／`none`／`unavailable`）                  |
| `currency`、`farePolicyVersion`、`chargingMode`                | 原值                                          | 原值                                                       |                                                                                              |
| `generatedAt`、`retainUntil`                                   | 原值                                          | 原值                                                       | 完成時間與至少兩曆年法定保存期限（跨閏年不少於兩曆年）                                       |
| `legalHold`                                                    | 只回 `state`（`active`/`none`/`unavailable`） | 無此欄                                                     | 不回 `activeHolds`（含 `placedByActorId`、`reasonNote`）                                     |

### 4.2 R10 六個月營運統計

權威來源：`ReportingService.previewSixMonthOperationsSummary`（reporting.service.ts:379；
controller `GET reports/operations-summary/preview`，reporting.controller.ts:85-98）回傳
`SixMonthOperationsSummary`（`packages/contracts/src/phase1-delta-supply-eligibility.ts:414-435`）；
同一 builder 也是報表 job `six_month_statistics`（reporting-filing.service.ts:315）。

| API                                                                                  | scope                 | 規則                                                                        |
| ------------------------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------------- |
| `GET /api/agency/reports/operations-summary?from&to&businessArea`                    | `agency:reports:read` | 區間上限 6 個曆月，超過 400 `AGENCY_REPORT_WINDOW_TOO_LARGE`                |
| `GET /api/agency/reports/monthly-operations-summaries?periodMonthFrom&periodMonthTo` | `agency:reports:read` | `listMonthlyOperationsSummaries`（reporting.service.ts:343），同 6 個月上限 |

全部欄位皆為彙總數字（`demandRequestCount`、`actualDispatchCount`、`completedTripCount`、
`cancelledOrderCount`、`averageDispatchableVehicleCount`、`validSnapshotCount`、
`expectedSnapshotCount`、`snapshotCoverageRate`、`complaintCount`、`complaintsByCategory`），
不含個資，原值回傳。`expectedSnapshotCount === 0` 時 `snapshotCoverageRate` 顯示未提供，
不顯示 0%。

### 4.3 R12 每日派遣報表

權威來源：`ReportingService.listDailyDispatchRecords`（reporting.service.ts:165；controller
`GET reports/daily-dispatch-records`，reporting.controller.ts:28-36），查詢型別
`DailyDispatchRecordQuery`（`apps/api/src/modules/reporting/reporting.repository.ts:77-87`），
資料表 `reporting.dispatch_daily_records`，列型別 `DispatchDailyRecord`
（phase1-delta-supply-eligibility.ts:357 起）。

API：`GET /api/agency/reports/daily-dispatch-records?serviceDate|serviceDateFrom&serviceDateTo&serviceProductCode&finalStatus&page&pageSize`
（scope `agency:reports:read`，區間上限 31 日）。機關不能呼叫 `rebuild`（POST）。

| 欄位                                                                                                                                                    | 機關看到 | 規則                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| `serviceDate`、`serviceProductCode`、`orderSource`、`finalStatus`、`redispatchCount`、`complaintCount`                                                  | 原值     |                                                  |
| `requestedAt`、`reservationTime`、`firstDispatchAt`、`firstAssignedAt`、`arrivedPickupAt`、`tripStartedAt`、`tripCompletedAt`、`etaSecondsAtAssignment` | 原值     | 時間戳                                           |
| `orderNo`                                                                                                                                               | 遮罩     | `maskOpaqueToken(v, 3, 2)`                       |
| `finalPlateNo`                                                                                                                                          | 遮罩     | `maskOpaqueToken(v, 2, 2)`，同 D4                |
| `pickupAddressSnapshot`、`dropoffAddressSnapshot`                                                                                                       | 遮罩     | `maskAddress`（只留前 6 字）                     |
| `finalDriverId`                                                                                                                                         | 遮罩     | `maskOpaqueToken(v, 3, 2)`                       |
| `cancellationReason`                                                                                                                                    | 原值     | 實作時須核對是否為代碼；若是自由文字則改為不回傳 |
| `orderId`、`tenantId`、`partnerId`、`finalVehicleId`                                                                                                    | 不回傳   | 內部／商業識別                                   |

### 4.4 R09 投訴月統計

repo 內沒有獨立的投訴月報 endpoint：`complaints/*` 是案件管理（`ComplaintController`，
`@Controller("complaints")`，auth.policy.ts:919-930 只允許 ops）；`complaint_case_detail`
報表（reporting-filing.service.ts:1975-2001）逐案輸出 `description`、`closingNote`、`assigneeId`
等自由文字與人員欄位，不能給機關。可用的權威彙總是 `MonthlyOperationsSummaryRecord` 的
`complaintCount` 與 `complaintsByCategory`（reporting.repository.ts:98-105，來源
`crm.phase1_complaint_cases`）。

API：`GET /api/agency/reports/complaint-monthly-statistics?periodMonthFrom&periodMonthTo`
（scope `agency:reports:read`，上限 12 個月）。由 `listMonthlyOperationsSummaries` 依
`periodMonth` 加總，只回 `periodMonth`、`businessArea`、`serviceProductCode`、`complaintCount`、
`complaintsByCategory`。不回任何案件明細。

缺口：結案數、SLA 逾期數、處理時效等月報常見欄位目前沒有權威彙總，回應以
`unavailableMetrics: ["resolvedCount", "slaBreachCount"]` 明示未提供；是否需要補彙總見 D7。

### 4.5 R14 車輛／駕駛資格與到期狀態

權威來源：`RegulatoryRegistryService.listVehicles`（regulatory-registry.service.ts:874）、
`listDrivers`（889）、`listPolicies`（2101）；既有 route 在
`regulatory-registry.controller.ts:125-133、180-192`。型別 `VehicleRegistryRecord`
（contracts index.ts:4400-4419，保險日期在 `supplyLifecycle.insurance`，`VehicleSupplyLifecycleRecord`
4352 起）、`DriverRegistryRecord`（4421-4440）、`InsurancePolicyRecord`（4558-4571）。

**不使用** `listExpiringDriverLicenses`（2121）與 `listExpiringPolicies`（2108）：兩者只回傳
「`lifecycleStatus === "active"` 且日期落在 `[now, now + windowDays]`」的資料（2113-2117、2128-2140），
已過期、尚有長期效期或非 active 的駕駛／保單都不在結果內，無法據以算出 `expired`／`valid`。
駕駛的三個證照日期本來就在 `listDrivers()` 回傳的 `DriverRegistryRecord` 上；車輛保險的
`endAt`／`lifecycleStatus` 在 `listVehicles()` 回傳的 `supplyLifecycle.insurance` 上，所以到期狀態
直接由這兩個 list 計算。只有遮罩後的 `policyNo` 需要 `listPolicies()`，以
`supplyLifecycle.insurance.policyId === InsurancePolicyRecord.policyId` 對應。駕駛列表比照既有
route（180-192）先等 `prepareMatchingSuppressions()` 完成再呼叫 `listDrivers()`。

| API                                                              | scope                        | 重用                            |
| ---------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| `GET /api/agency/qualifications/vehicles?status&windowDays&page` | `agency:qualifications:read` | `listVehicles` + `listPolicies` |
| `GET /api/agency/qualifications/drivers?status&windowDays&page`  | `agency:qualifications:read` | `listDrivers`                   |

`status` 篩選的是下列計算後的到期狀態（任一日期欄位符合即列入），不是權威層的 lifecycle 欄位。
到期狀態計算（每個日期欄位各自計算，在投影層以同一個 `now` 計算）：`expired`（日期 < now）、
`expiring`（now ≤ 日期 ≤ now + `windowDays`；`windowDays` 預設 30、上限 365，邊界含端點，與
`listExpiringDriverLicenses`／`listExpiringPolicies` 的 `>= now && <= cutoff` 一致）、`valid`
（日期 > now + `windowDays`）、`unavailable`（欄位為 `null`/不存在或無法解析，顯示未提供）。

| 來源欄位                                                                                                                                                                | 機關看到                                             | 規則                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| 車輛 `plateNo`                                                                                                                                                          | 遮罩                                                 | `maskOpaqueToken(v, 2, 2)`，同 D4                                |
| 車輛 `licenseType`、`operatingArea`、`dispatchableFlag`、`insuranceStatus`                                                                                              | 原值                                                 | `licenseType` 為 optional，缺值顯示未提供                        |
| 車輛 `supplyLifecycle.dispatch.eligible`、`supplyLifecycle.dispatch.blockedReasons`、`supplyLifecycle.offboarding.status`                                               | 原值                                                 | `supplyLifecycle` 其他欄位（含 `offboarding.requestedBy`）不回傳 |
| 車輛保險 `supplyLifecycle.insurance.endAt`、`supplyLifecycle.insurance.lifecycleStatus`                                                                                 | 原值                                                 | `endAt` 計算到期狀態；`null` 為 `unavailable`                    |
| 保單 `policyNo`、`insurerName`、`coverageAmount`（`listPolicies`）                                                                                                      | `policyNo` 遮罩 `maskOpaqueToken(v,2,2)`；其餘不回傳 | 商業條件；對不到 policy 時 `policyNoMasked` 為 `null`            |
| 車輛定期檢驗到期日                                                                                                                                                      | 未提供                                               | `VehicleRegistryRecord` 沒有此欄位                               |
| 駕駛 `name`                                                                                                                                                             | 遮罩                                                 | `maskName`                                                       |
| 駕駛 `driverId`                                                                                                                                                         | 遮罩                                                 | `maskOpaqueToken(v, 3, 2)`                                       |
| `licensesValid`、`licenseExpiry`、`professionalDriverLicenseExpiry`、`taxiDriverRegistrationExpiry`、`lifecycleStatus`、`dispatchEligible`、`eligibilityBlockedReasons` | 原值                                                 | 三個 `*Expiry` 為 optional，各自計算到期狀態                     |
| `deviceBindings`、`workState`、駕駛位置                                                                                                                                 | 不回傳                                               | 與資格無關／即時位置                                             |

### 4.6 資料範圍（機關轄區）

PRD 9.10.1 報表描述的是「營運者對公路主管機關的全車隊資料」（reporting-filing.service.ts
`assertReportTypeIsAvailableToScope` 註解），`VehicleRegistryRecord` 也沒有 tenant 欄位。
因此預設：一個機關看到本平台全部營運資料，不依 tenant 切分。若某機關只能看特定
轄區／營業區（`businessArea`、`operatingArea`），需要在 `core.regulatory_agencies.record`
加轄區清單並在投影層過濾，見 D1。

## 5. 存取稽核

### 5.1 為什麼不直接寫 `admin.audit_logs` 或 `admin.security_events`

- `admin.audit_logs.actor_id` 是 `uuid`，`AuditLogRepository.append` 用 `normalizeUuidOrNull`
  把非 UUID 的 actor 改成 `NULL`（`apps/api/src/modules/audit-notification/audit-log.repository.ts:121-158`、
  `audit-log.persistence.ts:52-60`）；canonical principal id 是 `principal_<uuid>` 形式，會被清空。
  `tenant_id` 有 FK 到 `core.tenants`，不能放 agencyId。沒有 filter、row count 欄位。
  同步的 `recordAuditLog` 只寫記憶體再非同步持久化，不能保證「先記錄再回資料」。
- `admin.security_events`（V0069）是登入／授權事件族，`subject_id_hash` 雜湊化、沒有 row count；
  適合記登入成功／失敗（§3.1 已使用），不適合當資料調閱紀錄。

### 5.2 新表 `admin.agency_access_logs`

| 欄位                                  | 型別                    | 說明                                                                                                                                                                                                     |
| ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_id`                           | `uuid` PK               | `gen_random_uuid()`                                                                                                                                                                                      |
| `occurred_at`                         | `timestamptz NOT NULL`  | 伺服器時間                                                                                                                                                                                               |
| `agency_id`                           | `varchar(100) NOT NULL` | FK `core.regulatory_agencies`                                                                                                                                                                            |
| `principal_id`                        | `varchar(100) NOT NULL` | FK `iam.identity_principals`                                                                                                                                                                             |
| `membership_id`                       | `varchar(100) NOT NULL` |                                                                                                                                                                                                          |
| `session_id`                          | `varchar(255)`          | 來自 identity                                                                                                                                                                                            |
| `action`                              | `varchar(60) NOT NULL`  | CHECK：`list`、`detail`、`report_view`、`export_preview`、`export_create`、`export_status`、`export_download`                                                                                            |
| `resource_type`                       | `varchar(60) NOT NULL`  | CHECK：`trip_record`、`operations_summary`、`monthly_operations_summary`、`daily_dispatch_record`、`complaint_monthly_statistics`、`vehicle_qualification`、`driver_qualification`、`trip_record_export` |
| `route_key`                           | `varchar(150) NOT NULL` | 與 auth policy routeKey 一致                                                                                                                                                                             |
| `resource_id`                         | `varchar(255)`          | 詳情 recordId／export jobId                                                                                                                                                                              |
| `filter`                              | `jsonb NOT NULL`        | 正規化後的查詢條件（allowlist key，值不含 PII）                                                                                                                                                          |
| `row_count`                           | `integer`               | 實際回傳筆數；失敗或拒絕為 `NULL`                                                                                                                                                                        |
| `total_count`                         | `integer`               | 分頁前總筆數（若有）                                                                                                                                                                                     |
| `outcome`                             | `varchar(20) NOT NULL`  | CHECK：`success`、`denied`、`error`                                                                                                                                                                      |
| `reason_code`                         | `varchar(100)`          | 拒絕／錯誤代碼                                                                                                                                                                                           |
| `export_manifest_hash`                | `varchar(128)`          | 匯出下載時的 manifest hash                                                                                                                                                                               |
| `request_id`                          | `varchar(100)`          |                                                                                                                                                                                                          |
| `source_ip_prefix`、`user_agent_hash` | `varchar`               | 比照 `admin.security_events`，不存完整 IP／UA                                                                                                                                                            |

不可竄改：照 `infra/migrations/V0080__audit_log_immutability.sql` 的作法加
`BEFORE UPDATE OR DELETE` row trigger、`BEFORE TRUNCATE` statement trigger、
`REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC`；保存期間到期刪除只允許既有
`audit_retention_operator` role 搭配 session flag。索引：`(agency_id, occurred_at DESC)`、
`(principal_id, occurred_at DESC)`、`(request_id)`。

### 5.3 寫入時機與失敗處理

`AgencyAccessAuditService.recordOrDeny()`（新增，`AgencyAccessLogRepository.append`）在
`AgencyPortalService` 取得結果、完成投影之後、回應之前同步寫入（await），寫入失敗回
503 `AGENCY_ACCESS_AUDIT_UNAVAILABLE` 且不回資料（fail closed，比照 MFA 豁免
`requirePersistence: true` 的作法）。授權拒絕（realm／scope／agency 不符）也寫一筆
`outcome = 'denied'`。DB 未啟用（`DatabaseService.isEnabled() === false`）時，非 strict 環境用
記憶體 fallback，strict 環境拒絕所有機關請求。

### 5.4 誰能看、誰不能改

- platform admin：`GET /api/platform-admin/agency-access-logs?agencyId&principalId&action&from&to&page`
  （`@RequireRealms("platform")`、`agency:access_audit:read`）。這次檢閱本身以既有
  `recordAuditLogAsync` 寫 `admin.audit_logs`（action `view_agency_access_logs`）。
- 機關：沒有任何寫入 route；`agency/*` 沒有讀取自身紀錄的 route（是否開放見 D8）。
- DB 層 trigger 讓應用程式帳號也無法 UPDATE／DELETE，竄改不依賴應用層紀律。

## 6. UI 入口

App：`apps/agency-portal-web`（Next.js，App Router，與 tenant-console-web／enterprise-dispatch-web
相同建置方式；`@drts/ui-web`、`@drts/ui-tokens`）。每頁顯示「唯讀」與「個資已遮罩」
標示，可沿用 canvas `platform-regulator.jsx` 的 `PrgMask` chip 與存取紀錄提示語意。
目前沒有這個獨立 portal 的設計 canvas（見 D6）。

| 路由                       | 頁面                         | 呼叫的 BFF → API                                                                                         |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/login`                   | 登入（Google）               | `/api/auth/agency/login` → `GET /api/auth/agency/login`                                                  |
| `/invite`                  | 邀請接受                     | `/api/auth/agency/login?token=` → `POST /api/auth/agency/invitation-login`                               |
| `/`                        | 首頁（機關名稱、到期日）     | `/api/auth/session` → `GET /api/auth/session`                                                            |
| `/trip-records`            | R11 行程紀錄查詢             | `GET /api/agency/trip-records`                                                                           |
| `/trip-records/[recordId]` | R11 單筆詳情                 | `GET /api/agency/trip-records/:recordId`                                                                 |
| `/trip-records/exports`    | R11 匯出（預覽／建立／下載） | `POST .../export-jobs/preview`、`POST .../export-jobs`、`GET .../export-jobs/:jobId`、`GET .../download` |
| `/reports/operations`      | R10 六個月營運統計           | `GET /api/agency/reports/operations-summary`、`GET /api/agency/reports/monthly-operations-summaries`     |
| `/reports/complaints`      | R09 投訴月統計               | `GET /api/agency/reports/complaint-monthly-statistics`                                                   |
| `/reports/daily-dispatch`  | R12 每日派遣報表             | `GET /api/agency/reports/daily-dispatch-records`                                                         |
| `/qualifications/vehicles` | R14 車輛資格／到期           | `GET /api/agency/qualifications/vehicles`                                                                |
| `/qualifications/drivers`  | R14 駕駛資格／到期           | `GET /api/agency/qualifications/drivers`                                                                 |

平台端（platform-admin-web，IAP 後）新增：

| 路由                    | 頁面                   | API                                                                 |
| ----------------------- | ---------------------- | ------------------------------------------------------------------- |
| `/agencies`             | 機關清單／建立         | `GET/POST /api/platform-admin/agencies`                             |
| `/agencies/[agencyId]`  | 成員、邀請、停用、期限 | `GET .../members`、`POST .../invitations`、`POST .../deactivate` 等 |
| `/agencies/access-logs` | 機關存取稽核檢閱       | `GET /api/platform-admin/agency-access-logs`                        |

## 7. 給下一個實作任務的清單

建議拆成兩個實作任務，避免一次動到部署：**IMPL-A**（API、契約、migration、兩個 web
app、測試）與 **IMPL-B**（`deploy-dev.yml`、domain mapping、runbook，需 operator 權限，
在 IMPL-A merge 後）。以下路徑都以 base SHA 實際存在與否標示「改」或「新」。

### 7.1 契約與授權（IMPL-A）

| 動作 | 路徑                                                | 內容                                                                                                                                        |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 改   | `packages/contracts/src/iam-policy-catalog.ts`      | `agency` realm／role family／actor policy、§2.2 scopes、`agency` resource constraint、agency role policy；bump `IAM_POLICY_CATALOG_VERSION` |
| 改   | `packages/contracts/src/index.ts`                   | `IdentityContext.actorType/realm`、`AuditLogRecord.actorType`、`AuthPrimaryPath`；新增 agency portal DTO 與 `AgencyAccessLogRecord`         |
| 改   | `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` | `MultiTaxiTripOperationalRecordQuery.reservedFrom/reservedTo`；`MultiTaxiTripOperationalExportJobView.agencyId?`                            |
| 改   | `apps/api/src/common/auth/auth.types.ts`            | `AUTH_REALMS`、`AUTH_ACTOR_TYPES`、`AUTH_ROLE_FAMILIES`、`BootstrapRequestIdentity.agencyId`                                                |
| 改   | `apps/api/src/common/auth/auth.constants.ts`        | `AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE.agency_user`、agency role scope presets                                                                   |
| 改   | `apps/api/src/common/auth/auth.matrix.ts`           | agency realm path record                                                                                                                    |
| 改   | `apps/api/src/common/auth/auth.policy.ts`           | `agency/*`、`auth/agency/*`、`platform-admin/agencies*`、`platform-admin/agency-access-logs` 的 route policy                                |
| 改   | `apps/api/src/common/auth/auth.extractor.ts`        | 解析 `agencyId` claim（`AUTH_ACTOR_TYPES` 已在 81 行使用）                                                                                  |
| 改   | `apps/api/src/common/auth/bootstrap-auth.guard.ts`  | §2.6 agency deny-by-default 與 method allowlist                                                                                             |
| 改   | `apps/api/src/common/auth/jwt-auth.service.ts`      | `validateDurableState` agency 分支（§2.5）、`toRequestIdentity` 帶 `agencyId`                                                               |
| 改   | `apps/api/src/common/auth/step-up.policy.ts`        | platform 端邀請／停用／延長期限加入 step-up action（比照 `platform:multi-taxi-trip-records:export`，260-266）                               |
| 改   | `apps/api/src/common/evidence-governance.ts`        | `report_artifact` agency 規則（§4.1）                                                                                                       |
| 改   | `apps/api/src/config/auth-startup-config.ts`        | 只有在 MFA 決策 D2 需要時新增 agency MFA 開關；否則不改                                                                                     |

### 7.2 API 模組（IMPL-A）

| 動作 | 路徑                                                                                 | 內容                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 改   | `apps/api/src/modules/auth/auth.controller.ts`                                       | `:realm/login` 允許 `agency`；`POST agency/invitation-login`、`POST agency/callback-session`                                                       |
| 改   | `apps/api/src/modules/auth/oidc-pkce.service.ts`                                     | `exchangeAgencyCallbackSession`、state 的 `agencyId`／`invitationTokenHash`                                                                        |
| 改   | `apps/api/src/modules/identity/identity.repository.ts`                               | `acceptAgencyOidcInvitation`、`findAgencyMembershipForPrincipal`、agency invitation／membership 寫入                                               |
| 新   | apps/api/src/modules/agency-access/agency-access.module.ts（尚未建立）               | 模組                                                                                                                                               |
| 新   | apps/api/src/modules/agency-access/agency-portal.controller.ts（尚未建立）           | §4 全部 `agency/*` route                                                                                                                           |
| 新   | apps/api/src/modules/agency-access/agency-portal.service.ts（尚未建立）              | 呼叫權威 service、保存邊界、分頁、投影與遮罩                                                                                                       |
| 新   | apps/api/src/modules/agency-access/agency-projections.ts（尚未建立）                 | §4 各表的 allowlist 投影（純函式，便於單元測試）                                                                                                   |
| 新   | apps/api/src/modules/agency-access/platform-admin-agencies.controller.ts（尚未建立） | §2.4 platform admin route、§5.4 稽核檢閱 route                                                                                                     |
| 新   | apps/api/src/modules/agency-access/agency-directory.service.ts（尚未建立）           | 機關主檔、邀請、停用、期限                                                                                                                         |
| 新   | apps/api/src/modules/agency-access/agency-directory.repository.ts（尚未建立）        | `core.regulatory_agencies`                                                                                                                         |
| 新   | apps/api/src/modules/agency-access/agency-invitation-delivery.service.ts（尚未建立） | 比照 `TenantInvitationDeliveryService`                                                                                                             |
| 新   | apps/api/src/modules/agency-access/agency-access-audit.service.ts（尚未建立）        | `recordOrDeny`                                                                                                                                     |
| 新   | apps/api/src/modules/agency-access/agency-access-log.repository.ts（尚未建立）       | `admin.agency_access_logs` append／list                                                                                                            |
| 改   | `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`                  | `assertMultiTaxiTripExportAccess` 接受 agency，job 擁有者／agency 核對；`normalizeMultiTaxiTripExportScope` 保留 `reservedFrom/reservedTo`（§4.1） |
| 改   | `apps/api/src/modules/reporting-filing/reporting-filing.repository.ts`               | `MultiTaxiTripExportJobMetadata.agencyId?`（§4.1）                                                                                                 |
| 改   | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts`                              | `reservedFrom/reservedTo` 過濾（平台端行為不變）                                                                                                   |
| 改   | `apps/api/src/app.module.ts`                                                         | 註冊 `AgencyAccessModule`（比照 `HostViewModule`，41、125 行）                                                                                     |

### 7.3 Migrations（IMPL-A）

base SHA 最新為 `V0129__referral_passenger_fee_consent.sql`。版本號在實作當下取
`infra/migrations` 的下一個可用號碼。平行任務曾撞號（IAM-IDP-001 的
`consumed_oidc_states` 在 commit `924336600` 內為避開 `V0073` 改號，最終為 `V0075`），需先核對：

1. `V01xx__regulatory_agencies.sql`：`core.regulatory_agencies`（§2.3）。
2. `V01xx__agency_access_logs.sql`：`admin.agency_access_logs` 與 append-only trigger／REVOKE（§5.2）。

canonical identity 表不需改 schema。

### 7.4 Web（IMPL-A）

| 動作 | 路徑                                                                 | 內容                                                                   |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 新   | `packages/agency-auth/**`                                            | BFF handlers、session verifier、constants（§3.2）                      |
| 新   | `apps/agency-portal-web/**`                                          | §6 機關頁面、`app/api/auth/[...auth]/route.ts`、middleware、Dockerfile |
| 新   | `apps/platform-admin-web/app/agencies/**`                            | §6 平台端三頁                                                          |
| 改   | `apps/platform-admin-web/lib/translations.ts`                        | 平台端頁面字串（zh-TW／en）                                            |
| 改   | `repo-classification.json`                                           | 登記新 app 與新 package                                                |
| 改   | `pnpm-workspace.yaml`／根 `package.json`（若 workspace glob 未涵蓋） | 實作時核對，涵蓋則不改                                                 |

### 7.5 Tests（IMPL-A）

| 動作 | 路徑                                                                              | 必須證明（在 base SHA 失敗、實作後通過）                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新   | tests/unit/bureau-r13-agency-readonly/iam-agency-catalog.test.ts（尚未建立）      | `agency_user` 為已知 actor、preset 非 undefined、機關 scope 不出現在任何既有 actor policy                                                                                                                 |
| 新   | tests/security/iam-route-agency-negative.test.ts（尚未建立）                      | agency session 打 `platform-admin/*`、`reports/*`、`regulatory-registry/*`、`complaints`、default-authenticated route 皆 403；所有非 GET（allowlist 外）403；tenant／ops／IAP viewer 打 `agency/*` 皆 403 |
| 改   | `tests/security/iam-route-inventory.test.ts`                                      | 新 route 全部已分類                                                                                                                                                                                       |
| 新   | tests/unit/bureau-r13-agency-readonly/agency-oidc-session.test.ts（尚未建立）     | 呼叫正式 `OidcPkceService`（只 mock Google HTTP 邊界）：未綁定 sub 拒絕、email 不符拒絕、tenant state 不能換 agency session、MFA 規則、dev waiver 必寫 event                                              |
| 新   | tests/unit/bureau-r13-agency-readonly/agency-durable-state.test.ts（尚未建立）    | `validateDurableState`：membership disabled、機關 suspended、`valid_to` 過期、tokenVersion 變更皆立即拒絕                                                                                                 |
| 新   | apps/api/tests/unit/agency-invitation.pg.test.ts（尚未建立）                      | 正式 migrations：並發接受一次性、錯 email／錯 agency 不耗 proof、`(issuer, sub)` 衝突全回滾                                                                                                               |
| 新   | apps/api/tests/unit/agency-access-log.pg.test.ts（尚未建立）                      | 正式 migrations：UPDATE／DELETE／TRUNCATE 皆被 trigger 拒絕；寫入失敗時 API 回 503 且不回資料                                                                                                             |
| 新   | tests/unit/bureau-r13-agency-readonly/agency-projections.test.ts（尚未建立）      | §4 每個投影只輸出 allowlist 欄位、遮罩函式結果、`null` 保持 `null`、2 年邊界外紀錄不出現                                                                                                                  |
| 新   | tests/unit/bureau-r13-agency-readonly/agency-export-ownership.test.ts（尚未建立） | 機關只能讀自己建立的 export job；平台 job 與他機關 job 403                                                                                                                                                |
| 新   | apps/agency-portal-web/tests/unit/auth-bff-routes.test.ts（尚未建立）             | 比照 tenant-console-web 同名測試：callback／session／logout／CSRF；`verifyAgencySession` 拒絕 tenant realm                                                                                                |

PG 測試在本 VM 只能 skip，由既有 CI Product smoke acceptance 在正式 migrations 後執行；
不在本 VM 啟動 DB、browser 或 Compose。

### 7.6 部署（IMPL-B，另開任務）

`.github/workflows/deploy-dev.yml`（新服務 build／deploy、`DEV_AGENCY_PORTAL_ALLOW_UNAUTHENTICATED`
預設 false、`AUTH_ALLOWED_ORIGINS` 加入 agency origin、`AGENCY_INVITATION_ACCEPT_URL_BASE`）、
`.github/workflows/domain-mappings-dev.yml`、`docs/03-runbooks/smarttransport-tw-custom-domains.md`。
Google OAuth client 加 redirect URI 與 DNS 由 operator／使用者執行，不由 worker 代做。

## 8. Open decisions（需要使用者決定，本文件不代為決定）

| #   | 決策                                       | 為什麼需要使用者決定                                                                                                                                                                                                 | 設計中的暫定處理                                                        |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| D1  | 要開通哪些機關、各機關可看的轄區範圍       | repo 內沒有任何機關清單；寫入真實機關名稱／代碼屬對外識別資料，曾因真實機構識別碼導致 GCP 停權（`GCP-TOS-REMEDIATION-20260907`）。轄區切分也影響資料範圍                                                             | 不放種子資料；預設全平台資料（§4.6）；由 platform admin 在 UI 建立      |
| D2  | production 是否強制機關 MFA                | `hasTrustedMfa` 只認 ID token 真實 `amr`/`acr`（`trusted-mfa.policy.ts` `STRICT_TRUSTED_AMR`）。Google 外部帳號 ID token 是否帶可信 amr，本 repo 沒有實測證據（**待確認**）；若強制而 IdP 不提供，機關將完全無法登入 | dev 用既有 `DRTS_DEV_MFA_WAIVED` 並記 event；production 行為待決定      |
| D3  | 是否分「唯讀」與「唯讀＋匯出」兩種角色     | 匯出代表資料離開平台，責任歸屬是業務／法遵判斷                                                                                                                                                                       | catalog 同時支援 `agency_viewer`、`agency_exporter`；邀請時由管理者選擇 |
| D4  | 機關是否看全碼車號、是否提供行駛路線       | doc 08 把「車號」「行駛路線」列為法定欄位，但原匯出契約 `plateNoMasked` 是遮罩值；全碼與路線屬揭露程度決定                                                                                                           | **已決議（BUREAU-R11-EXISTING-TRIP-RECORD-SOURCE-FOLLOWTHROUGH-20261025）**：沿用既有 `agency:trip_records:read`／`agency:trip_records:export` 權限（不新增 permission gate），於機關列表、詳情與 CSV 匯出完整揭露全碼 `plateNo`（並保留 `plateNoMasked` 相容）、`route.routeSummary`（起訖路線摘要）、`route.source`（路線來源 provenance）、`route.distanceMeters`、`route.durationSeconds`、`payableFareMinor`、`actualFareMinor`、`collectedFareMinor`、`paymentStatus` 與 `tollMinor`；原始 `encodedPolyline` 座標折線仍不回傳 |
| D5  | 機關入口網域名稱                           | DNS 由使用者控制（custom-domains runbook 前提 2）                                                                                                                                                                    | 建議 `agency.smarttransport.tw`                                         |
| D6  | 是否先出機關 portal 設計 canvas            | 現有 canvas `platform-regulator.jsx` 把主管機關檢視放在 Platform Admin shell，與本需求的獨立非 IAP 入口衝突；過往任務有「不自行新增未有 canvas 畫面」的約束                                                          | 實作沿用 `@drts/ui-web` 元件與 `PrgMask` 語意；待決定是否先補 canvas    |
| D7  | R09 投訴月報是否要補結案數／SLA 逾期等彙總 | 交通局 R09 表單欄位不在 repo（未提供）；現有權威彙總只有 `complaintCount`、`complaintsByCategory`                                                                                                                    | 回應以 `unavailableMetrics` 明示缺項，不臆算                            |
| D8  | 機關能否查看自己的存取紀錄                 | 透明度與資安揭露的取捨                                                                                                                                                                                               | 預設不開放；只有 platform admin 可檢閱                                  |
| D9  | 存取期限預設與上限、存取紀錄保存年限       | 法遵政策；`admin.audit_logs` 既有保存政策是否同樣適用於機關紀錄未定義                                                                                                                                                | `valid_to` 必填、由邀請者填；紀錄 append-only，刪除只走 retention role  |

## 9. Requirement 對應表

| task-spec requirement                              | 本文件章節 | 實際原始碼依據                                                                                                                                                                                                            |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 專屬 realm／actor，邀請綁定一機關，停用過期撤權    | §2         | `auth.types.ts`、`iam-policy-catalog.ts`、`identity.repository.ts`（298、787、1226、1830）、V0068、`jwt-auth.service.ts:1015-1201`、`bootstrap-auth.guard.ts:312-331,914-939`                                             |
| 沿用 Google OIDC PKCE＋邀請，公開非 IAP，明確 host | §3         | `oidc-pkce.service.ts`（239、396、584-637、1018-1024）、`auth.controller.ts:211-311`、`packages/tenant-auth/src/*`、`auth.matrix.ts`、`deploy-dev.yml:91-99,279-287`                                                      |
| R11／R10／R12／R09／R14 唯讀範圍與逐欄遮罩         | §4         | `multi-taxi.controller.ts`、`multi-taxi.service.ts`、`reporting.controller.ts`、`reporting.repository.ts`、`reporting-filing.service.ts`、`regulatory-registry.controller.ts`、`sensitive-data-policy.ts`、contracts 型別 |
| 存取稽核欄位、平台可查、機關不可改                 | §5         | V0009、V0069、V0080、`audit-log.repository.ts`、`audit-log.persistence.ts`、`audit-notification.service.ts`                                                                                                               |
| 精確 API routes、policy、migration、UI、tests      | §6、§7     | 同上，加 `app.module.ts`、`evidence-governance.ts`、`step-up.policy.ts`、`tests/security/*`                                                                                                                               |
| 明列 open decisions                                | §8         | 見各項理由欄                                                                                                                                                                                                              |

## 10. 本任務驗證

- 只新增本文件；沒有修改程式、migration、workflow 或其他文件。
- 每個引用的路徑、行號與 symbol 都在 base SHA 以 `grep`／`sed` 實際讀取核對；交通局
  原始表單、Google amr 實際行為、真實機關清單在 repo 內不存在，均標示未提供／待確認。
- 未啟動服務、瀏覽器、Docker、資料庫；未呼叫 gcloud 或任何雲端憑證。
