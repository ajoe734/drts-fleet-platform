# FLEET-STAFF-ONBOARDING-20261114：SA/SD

Owner: Claude · Reviewer: Claude2 · Decision: [SD-DP-20261114-001](../../01-decisions/SD-DP-20261114-001-fleet-staff-onboarding.md) · Base: `origin/dev 08d7d95e8`

本文件依 task spec §2 的九個主題逐項回答，並引用現有程式位置（行號以上列 base SHA 核對）。範圍：車行入口 `fleet-partner-portal-web`（API `partner` realm 中 `partnerType === "fleet_partner"` 的業務類型），補上 [PORTAL-PASSWORD-LOGIN SA/SD](../portal-password-login-20261113/01_system_sa_sd.md)（下稱「密碼登入 SA/SD」）§5 假設存在、但車行側實際不存在的邀請機制。

## 0. 現有權威基線（本設計的起點，不重寫）

- **身分三元組**：車行人員同時受兩套既有儲存約束：
  1. `admin.phase1_partner_user_identity_links`（鍵 `(entry_slug, partner_user_ref)`，`partner-user-identity-link.repository.ts:37-131`）——把「某個 entry 的 Google `sub`」映射到一個 `drtsPassengerId`。
  2. canonical IAM 四表（`iam.identity_principals`／`identity_memberships`／`identity_role_bindings`／`identity_invitations`，`V0068__canonical_identity_authority.sql`）——車行人員的 membership／role binding 用 `sourceRef` 字串慣例 `fleet_member:<entrySlug>:<principalId>`／`fleet_role:<entrySlug>:<principalId>` 定位（`identity.repository.ts:1492-1658`，`manageFleetHumanRole`／`listFleetHumanRoles`），其中 `principalId` **就是** identity link 的 `drtsPassengerId`（`oidc-pkce.service.ts:1259-1274`：`findPrincipalById(linkRecord.drtsPassengerId)`，且要求 `principal.sourceRef === "jwt_principal:partner:" + linkRecord.drtsPassengerId`）。
  - 這與機關（agency）入口不同：agency 只有 canonical IAM 四表，沒有第二套「identity link」表（[BUREAU-R13](../bureau-agency-readonly-20261024.md) §2.3）。車行的邀請設計必須同時建立／啟用這兩套儲存，且 `drtsPassengerId` 必須等於邀請當時建立的 principal 的 `principalId`，不能用 `resolveOrCreate`（§2 已解釋，它會隨機生出新的 `drtsPassengerId`，是給 referral 乘客用的）。
- **密碼登入 SA/SD 已交付的部分**（origin/dev 已合併，PWD-LOGIN-001/002/004 commit 可查）：`iam.identity_password_credentials`／`identity_totp_credentials`／`identity_totp_recovery_codes`／`identity_password_reset_tokens` 四張表已存在（`infra/migrations/V0138__portal_password_login_credentials.sql`）；`acceptAgencyOidcInvitation`／`acceptAgencyInvitationWithPassword`（`identity.repository.ts:4731-5050+`）已是 tenant/agency 的完整參照實作。本設計**直接重用**這些既有表與密碼雜湊/驗證服務（PWD-LOGIN-002/003 一旦就位），不新增第二套密碼儲存。
- **機關入口的邀請模式是車行唯一需要抄的對等設計**（tenant 的 `issueTenantInvitation` 沒有「identity link」這層，不完全對等）：`AgencyDirectoryService.inviteMember`（`agency-directory.service.ts:287-369`）→ `IdentityRepository.issueAgencyInvitation`（`identity.repository.ts:4477-4720+`）→ `AgencyInvitationDeliveryService.send`（`agency-invitation-delivery.service.ts`）→ `POST /api/auth/agency/invitation-login`（`auth.controller.ts:312-343`）→ `exchangeAgencyCallbackSession`／`issueVerifiedAgencySession` 的 `invitationTokenHash` 分支（`oidc-pkce.service.ts:738-868`）→ `acceptAgencyOidcInvitation`。本文件逐節把這條鏈路套到車行，並明寫兩者的差異（identity link 這一層）。

## 1. 誰可以邀請車行人員，需要哪個 step-up action

**決定：延續既有 `manageFleetHumanRole` 的權威模型——只有 `platform`／`ops` realm 的 `platform_admin`／`ops_user`（且有 `foundation:write` scope）可以核發邀請，不開放已登入的 `fleet_partner_admin` 自助邀請。**

理由：

- `manageFleetHumanRole`（`fleet-partner.service.ts:211-271`）目前把「管理車行人員角色」的權威硬編在 `manager.realm` 必須是 `platform`／`ops`（216-228 行），邀請是這個權威的前置步驟，延續同一模型不產生新的權威分裂。
- `BUREAU-R13` 的機關邀請採同一模型（platform admin 核發，機關使用者不能自己邀請其他機關同事），是目前 repo 內唯一存在的邀請對等設計；車行沿用可以不另開一套授權規則。
- 開放 `fleet_partner_admin` 自助邀請並授予 `fleet_partner_finance` 角色屬於新的治理範圍（哪個角色可以授予哪個角色、要不要雙人核准），不是使用者 2026-11-13 五項決定要求的範圍，本設計不自行擴大（見決策紀錄 §5）。

新端點 `POST /api/admin/fleet-partners/:fleetPartnerId/invitations`（掛在既有 `FleetPartnerController`，沿用 `admin/fleet-partners/...` 路徑慣例，`fleet-partner.controller.ts:388-422` 旁）要求 `@RequireRealms("platform", "ops")`，並新增 step-up 規則（仿 `BUREAU-R13` 的 `step-up.policy.ts:484-513`）：

```ts
{
  actionId: "platform:users:create", // 重用既有 action id，不新增
  description: "Fleet partner staff invitation",
  freshnessWindowMs: 10 * MINUTE_MS,
  enforcedRealms: ["platform", "ops"],
  matches: regexMatch("POST", /^admin\/fleet-partners\/[^/]+\/invitations$/),
},
{
  actionId: "platform:users:role:update",
  description: "Fleet partner staff invitation revoke / membership deactivate",
  freshnessWindowMs: 10 * MINUTE_MS,
  enforcedRealms: ["platform", "ops"],
  matches: regexMatch("POST", /^admin\/fleet-partners\/[^/]+\/invitations\/[^/]+\/revoke$/),
},
```

**既有缺口**：`PUT admin/fleet-partners/:fleetPartnerId/human-roles`（`fleet-partner.controller.ts:406-421`）目前**沒有**任何 step-up 規則（`step-up.policy.ts` 全文搜尋 `fleet-partners` 無結果）——只要求 realm/scope，不要求新鮮登入。這是一個既有缺口，與 `BUREAU-R13` 對機關角色變更要求 step-up 不一致。實作任務包（FLEET-ONB-005）把這條規則一併補上，而不是只替新端點加規則、放著既有端點的缺口不管。

## 2. 邀請資料模型：與既有 `partner_user_identity_links` 的關係

**決定：新增 canonical IAM 邀請（`iam.identity_invitations`，比照機關），不新建第二張邀請表；`partner_user_identity_links` 在邀請階段保持不存在，直到接受邀請時才寫入，且寫入方式不經過 `resolveOrCreate`。**

邀請核發時（`IdentityRepository.issueFleetStaffInvitation`，仿 `issueAgencyInvitation` §4477-4720）在同一交易建立：

| 記錄 | 值 | 對照 `issueAgencyInvitation` 的差異 |
| --- | --- | --- |
| `iam.identity_principals` | `principalType: "human"`、`issuer: FLEET_INVITATION_ISSUER`（新常數，值如 `"fleet_invitation"`，仿 `AGENCY_INVITATION_ISSUER = "agency_invitation"`，`identity.repository.ts:140`）、`subject: "fleet:" + entrySlug + ":email:" + email`、`status: "invited"`、`sourceRef: "jwt_principal:partner:" + principalId`（**不是** agency 的 `${sourceRef}:principal`——這個 sourceRef 格式是 `exchangePartnerCallbackSession`（§1259-1274）與 `manageFleetHumanRole`（§1522-1531）寫死比對的，必須完全照抄，否則邀請接受後登入與角色指派都會因 sourceRef 不符而被拒） | sourceRef 格式不同，見左欄 |
| `iam.identity_memberships` | `realm: "partner"`（不是 `"agency"`）、`scopeRef: "fleet:" + entrySlug`、`partnerId: fleetPartnerId`、`tenantId: null`、`sourceRef: "fleet_member:" + entrySlug + ":" + principalId`（照抄 `manageFleetHumanRole` §1509 的 `sourceRef` 公式）、`status: "invited"` | sourceRef／realm／scopeRef 公式不同 |
| `iam.identity_role_bindings` | `roleCode` 為 `fleet_partner_admin`／`fleet_partner_ops`／`fleet_partner_finance`（`IAM_FLEET_ROLE_POLICY_DEFINITIONS`，`packages/contracts/src/iam-policy-catalog.ts:1059-1081`，**不是** task spec 寫的 `admin|ops|finance`，要用完整角色碼）、`sourceRef: "fleet_role:" + entrySlug + ":" + principalId`（照抄 §1574）、`validTo`：沿用 `manageFleetHumanRole` 的語意——可為 `null`（不過期），不像機關的 `valid_to` **必填**；邀請時若呼叫端不給 `accessValidTo`，就是 `null` | 機關 `validTo` 必填，車行沿用既有「可不過期」語意 |
| `iam.identity_invitations` | `realm: "partner"`、`scopeRef: "fleet:" + entrySlug`、`partnerId: fleetPartnerId`、`tenantId: null`、`roleCode`、`tokenHash`、`expiresAt`（24h，沿用既有 `ti_`/`ai_` token 慣例，見密碼登入 SA/SD §0：256-bit random、sha256 hash-only、單次、24h）、`deliveryStatus: "pending_delivery"` | 同機關，只是 realm/scopeRef 不同 |

**`partner_user_identity_links` 在邀請階段保持不存在**：邀請時還不知道受邀者的 Google `sub`，所以不建立 link row（這與機關一致——機關也沒有在邀請階段建立任何「待綁定」的 Google 專用表，身分綁定全部在接受邀請時發生）。

**接受邀請時**才在同一交易寫入 link row，而且**不經過** `resolveOrCreate`（它會生成新的隨機 `drtsPassengerId`，那是給 referral 乘客用的語意，見決策紀錄 §3）。改用新方法 `PartnerUserIdentityLinkRepository.createForInvitedPrincipal(entrySlug, partnerUserRef, drtsPassengerId, now)`：

```sql
INSERT INTO admin.phase1_partner_user_identity_links (
  entry_slug, partner_user_ref, drts_passenger_id, status, consent_scope,
  linked_at, last_seen_at, created_at, updated_at, record
) VALUES ($1, $2, $3, 'active', 'fleet_staff_invitation', $4, $4, $4, $4, $5::jsonb)
ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING
RETURNING record
```

若 `ON CONFLICT DO NOTHING` 命中（代表這個 `(entrySlug, sub)` 已經有一筆 link，無論是哪種 `consent_scope`），邀請接受**必須失敗**（回滾整個交易，邀請不算被消費），不得靜默覆寫既有 link 的 `drtsPassengerId`——這擋掉「同一個 Google 帳號先用 referral handoff 建立了乘客 link，後來被邀請當車行人員」的身分覆寫風險（決策紀錄 §3 的「不得以 referral handoff 當人員開通機制」的反向保證：也不讓人員開通去覆寫 referral 的 link）。新增 `PartnerUserIdentityConsentScope` 值 `"fleet_staff_invitation"`（`PARTNER_USER_IDENTITY_CONSENT_SCOPES`，`packages/contracts/src/referral-channel.ts:46-52`，現有值為 `"referral_attribution"`／`"referral_settlement"`／`"passenger_identity_link"`，皆為 referral 乘客語意）用於區分，供稽核與未來查詢過濾使用。

## 3. 接受邀請時如何綁定 Google `(issuer, sub)`，與密碼分支的銜接

**Google 分支**（仿 `acceptAgencyOidcInvitation` §4731-4945，新方法 `acceptFleetStaffOidcInvitation(tokenHash, proof)`）：

1. 鎖 `iam.identity_invitations`（`token_hash = $1 AND realm = 'partner' AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now`）。
2. 鎖對應 `fleet_partners`（透過 `fleetPartnerRepository.findActiveFleetPartnerById`，仿機關核對 `core.regulatory_agencies.status === 'active'`，§4862-4865）與對應 `partner_entries`（`entrySlug` 必須 `status === 'active' && activeFlag === true`，仿 `oidc-pkce.service.ts:1181-1196` 的 HARD ACCEPTANCE RULE）——車行比機關多一層，因為車行有 `fleet_partners` 主檔**與** `partner_entries` 兩個需要都 active 的實體。
3. 鎖 membership／principal／role bindings，核對 `principal.status === 'invited' && principal.issuer === FLEET_INVITATION_ISSUER && principal.email === proof.email`（仿 §4765-4773）。
4. **新增車行特有的一步**：以 `INSERT ... ON CONFLICT DO NOTHING` 寫入 `partner_user_identity_links`（§2），若衝突（link 已存在）整個交易回滾，邀請不算被消費。
5. `upsertPrincipal`：`issuer/subject` 覆寫為 `(proof.issuer, proof.subject)`，`status: 'active'`，`emailVerified: true`（仿 §4908-4919）；membership 轉 `active`；invitation 寫 `acceptedAt`。
6. `(issuer, subject)` 唯一約束衝突（`error.code === '23505'`，已有其他 principal 綁同一個 Google 帳號）時整段回滾，回傳 `null`（仿 §4937-4941），不是部分成功。

**密碼分支**（仿 `acceptAgencyInvitationWithPassword` §4954-5050+，新方法 `acceptFleetStaffInvitationWithPassword(tokenHash, credential)`）：與 Google 分支共用同一個 `tokenHash` 鎖與同一組 membership/principal/role binding 驗證，**差異只在**：不要求 OIDC proof，principal 的 `issuer/subject` **維持**邀請時的佔位值（`FLEET_INVITATION_ISSUER` / `fleet:<entrySlug>:email:<email>`）不被覆寫，另外寫入 `iam.identity_password_credentials`（§0 已存在的表）。**不**建立 `partner_user_identity_links` row——這個表的語意本來就是「Google `sub` → `drtsPassengerId`」的映射，密碼登入沒有 Google `sub` 可以映射。這意味著：

> **密碼登入的車行人員，`exchangePartnerCallbackSession`／Google 專用的 OIDC 流程完全不適用；密碼登入必須走密碼登入 SA/SD §4 的 `POST /api/auth/partner/password-login`，直接以 `principalId` 簽發 session（§8 此文件），不經過 `partner_user_identity_links` 查找。**

這是車行與機關/租戶最大的設計差異，必須寫進密碼登入 SA/SD 的實作任務（PWD-LOGIN-005、PWD-LOGIN-008）協調說明（§9）：`password-login` 端點對 `partner` realm 的角色/scope 解析，不能沿用 `exchangePartnerCallbackSession` 那條「先查 link 再查 membership」的路徑，必須直接用 `findMembershipsByPrincipalId(principal.principalId)` 取 `realm === 'partner' && scopeRef === 'fleet:' + entrySlug` 的 membership（同 `manageFleetHumanRole` 的查詢方式），不依賴 link 表。

兩個分支消費同一個 `tokenHash`，由 `FOR UPDATE` 鎖保證互斥（仿密碼登入 SA/SD §5 的既有並發保證）；任一分支成功後 `invitation.acceptedAt` 寫入，另一分支的後續嘗試一律查無未接受的邀請而失敗。

## 4. 登入入口如何帶 entry/partner 識別，修正 `PARTNER_ENTRY_NOT_FOUND`

**決定：由 server 依 `DRTS_FLEET_PARTNER_ID` 決定 `partner_id`，完全不讀取 client 送出的 `partner_id` query 參數。**

現況缺陷精確位置：`apps/fleet-partner-portal-web/app/login/page.tsx:58-67` 的表單只送 `redirect_uri`；`apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts:99-107` 的 `login` action 用 `request.nextUrl.searchParams.get("partner_id") || ""`——因為表單從不送這個參數，永遠是空字串，`query.set("partner_id", partnerId)` 這一行永遠不執行（105 行的 `if (partnerId)` 為假），`/api/auth/partner/login` 呼叫因此永遠不帶 `partner_id`。API 端 `exchangePartnerCallbackSession`（`oidc-pkce.service.ts:1116-1135`）的 `entrySlug` 解析鏈（`command.partnerId` → `claims.partner_id` → `stateRecord?.partnerId`）三個來源全部是空，直接回 `PARTNER_ENTRY_NOT_FOUND`。

修正（`apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts` 的 `login` 與新增的 `invitation-login` 分支）：

```ts
// 不再讀取 request 的 partner_id query 參數；entrySlug 永遠由本服務的部署
// 設定決定，client 不能自選進哪個 fleet entry（否則任何人都能嘗試把自己的
// Google 帳號掛到別的車行 entrySlug 上，即使最終仍會在 identity link 這關
//被擋下，也不該讓未受邀主體能自由指定 entrySlug 去撞 PARTNER_ENTRY_MISMATCH
// 這類會洩漏「這個 entrySlug 存在」的 side channel）。
const partnerId = requireNonBlankEnv("DRTS_FLEET_PARTNER_ID");
```

`DRTS_FLEET_PARTNER_ID` 同一個值同時是：

- `fleet-principal.server.ts:222` 既有讀取的「下游 API 呼叫必須匹配的 canonical `partnerId`」（已存在，不新增）；
- 新 `partner_entries` row 的 `entrySlug`（§5 詳述）——讓 `entrySlug === partnerId`，`/api/auth/partner/login?partner_id=<值>` 一次解析就同時命中 `oidc-pkce.service.ts:1140` 的 `e.entrySlug === entrySlug || e.partnerId === entrySlug` 比對，不需要維護兩個不同的環境變數。

缺少此環境變數時，`login`／`invitation-login` action 必須回 503（仿既有 `FLEET_SELECTOR_REQUIRED` 錯誤碼慣例，`fleet-principal.server.ts:224-229`），不得靜默略過導致又回到 `PARTNER_ENTRY_NOT_FOUND`。

## 5. fleet entry 與 `fleet-demo-001` 在 shared dev／正式環境的佈建方式

現況：`fleet-demo-001` 只是 `fleet_partners` 主檔（`FLEET_PARTNER_SEED`，`fleet-partner.service.ts:55-66`），**不是** `partner_entries` 的一筆資料；`PARTNER_ENTRY_SEED`（`tenant-partner.service.ts:821-`）目前只有 `referral_channel`／`bank_partner`，沒有任何 `partnerType: "fleet_partner"` 的項目。建立 `partner_entries` row 的唯一生產路徑是 `createPlatformPartnerEntry`（`tenant-partner.service.ts:5846-5920+`），需要 `partnerType === "fleet_partner"` 且 `fleetPartnerId` 指向一個既存 active 的 `fleet_partners` 主檔（5869-5912 行的驗證）。

**dev**：在 `PARTNER_ENTRY_SEED` 新增一筆（仿既有兩筆 `bank_partner` demo 的寫法）：

```ts
{
  partnerId: "fleet-demo-001", // 與 FLEET_PARTNER_SEED 的 fleetPartnerId 相同，
                                // 所以 entrySlug/partnerId 两种比對都命中（§4）
  partnerCode: "fleet_demo",
  partnerType: "fleet_partner",
  entrySlug: "fleet-demo-001",
  authMode: "partner_api_key", // 既有 normalizePartnerEntryAuthModes 會覆寫，
                                // 沿用既有慣例，不是本設計新增的行為
  status: "active",
  activeFlag: true,
  // ...其餘欄位仿 bank_partner demo seed 的既有欄位結構
}
```

但 `reconcilePartnerEntrySeeds`（`tenant-partner.service.ts:13581-13605`）在 `isStrictAuthEnvironment()` 為真時**直接 return，不會把 seed 寫進 DB**（13582-13584 行）。這代表：

- **dev（非 strict）**：新增的 seed 項目會在 API 啟動時自動補進 `partnerEntries`（13596 行），shared dev 不需要額外手動呼叫。
- **正式環境（strict）**：`reconcilePartnerEntrySeeds` 不執行，必須由 platform admin 呼叫 `POST /api/platform-admin/partner-entries`（`createPlatformPartnerEntry`）明確建立，且**不得使用 "Demo Fleet Management Co., Ltd." 這個示範法人名稱**——正式環境的 `fleet_partners` 主檔與對應 `partner_entries` 必須是真實車行的法人資料，經由既有部署管線（GitHub WIF → push 觸發的 `ops/` branch workflow，依記憶 `project-dev-partner-entries-and-ci-ops-path`）建立，不得由任何 agent 或 VM 直接寫 DB，也不得把真實金融/車行識別資訊寫進程式碼常數或 commit（避免重演 `GCP-TOS-REMEDIATION-20260907`）。

## 6. 角色指派（`human-roles`）與邀請的整合

邀請核發時已經把 `roleCode` 寫進 `iam.identity_role_bindings`（§2），接受邀請後角色立即生效（membership／binding 轉 `active`），**不需要**邀請者事後再呼叫一次 `PUT .../human-roles`。既有 `manageFleetHumanRole`（`fleet-partner.service.ts:211-271`）／`PUT admin/fleet-partners/:fleetPartnerId/human-roles` 保留給**已接受邀請之後**的角色變更（升級/降級/停用角色、調整 `validTo`）——這與機關模式一致（邀請本身帶角色，`access-period`／`deactivate` 是接受後才用得到的端點）。

兩者的 `sourceRef` 公式必須完全一致（§2 已強調），這樣 `manageFleetHumanRole` 的 `previous`／`priorBinding` 查詢（`identity.repository.ts:1532-1552、1574-1586`）才能在邀請接受後找到同一筆 membership/binding 去「更新」而不是「誤判為新建」。

`listFleetHumanRoles`（`identity.repository.ts:1624-1658`）回傳的是 `membership.status`（`invited`/`active`/`disabled`），實作時 UI（FLEET-ONB-008）要能顯示「已邀請未接受」狀態，不能只顯示 enabled/disabled 二元狀態。

## 7. 邀請信投遞：durable SMTP outbox、recipient allowlist、`*_INVITATION_ACCEPT_URL_BASE`

新增 `FleetInvitationDeliveryService`（新檔 apps/api/src/modules/fleet-partner/fleet-invitation-delivery.service.ts，結構完全比照 `AgencyInvitationDeliveryService`，`agency-invitation-delivery.service.ts`），接上既有 durable SMTP outbox（`NotificationDeliveryService`／`V0103__notification_mail_outbox.sql`，與密碼登入 SA/SD §6 的重設信同一條 outbox，不新增第二套寄信機制）。

新環境變數 `FLEET_INVITATION_ACCEPT_URL_BASE`（仿 `.github/workflows/deploy-dev.yml:1264` 的 `AGENCY_INVITATION_ACCEPT_URL_BASE=${agency_login_origin}/invite`），dev 設為 `${fleet_login_origin}/invite`（`fleet_login_origin` 沿用既有 `apps/fleet-partner-portal-web` 的 Cloud Run 對外網址解析慣例，deploy-dev.yml 已有同構的 `tenant_login_origin`／`agency_login_origin` 變數可抄）。

**recipient allowlist**：沿用既有部署中對 dev 環境信件收件人的既有 allowlist 機制（密碼登入 SA/SD 與既有 `tenant-invitation-delivery.service.ts` 共用的檢查，不重複定義新的一套）——寄送前核對 `email` 落在 dev 允許的收件人清單內，避免 dev 環境誤寄信給非測試信箱；production 無此限制但受信件內容稽核政策約束（不含明文密碼/token，只含一次性連結，同密碼登入 SA/SD §12）。

只有 adapter 回 `sent` 才寫 `invitation.deliveryStatus = "delivered"`，否則 `"delivery_failed"`，不偽造寄送成功（完全照抄 `BUREAU-R13` §2.4 第 2 點的既有承諾）。

## 8. 撤銷與重寄

**撤銷**：新端點 `POST /api/admin/fleet-partners/:fleetPartnerId/invitations/:invitationId/revoke`（仿 `revokeAgencyInvitation`／`platform-admin-agencies.controller.ts:176-193`），寫 `invitation.revokedAt`；若已接受（membership 已 active），改走**停用成員**：新端點 `POST /api/admin/fleet-partners/:fleetPartnerId/members/:membershipId/deactivate`，membership 轉 `disabled`，同交易呼叫既有 `revokePrincipalSessionsInTransaction`（`identity.repository.ts:1606-1612`，`manageFleetHumanRole` 已在用同一個函式撤銷角色變更時的既有 session，本端點沿用同一機制，不新增第二套撤銷邏輯）。

**重寄**：沒有獨立的「resend」端點或函式——機關端也沒有（`identity.repository.ts` 只有 `issueAgencyInvitation`／`revokeAgencyInvitation`，無 `resendAgencyInvitation`）。重寄＝呼叫端先 `revoke` 舊邀請（若尚未撤銷），再呼叫一次 `POST .../invitations` 核發新邀請（`issueFleetStaffInvitation` 的 `buildRecords` 邏輯本身已處理「重新邀請一個先前邀請過的 principal」的情況，仿 `issueAgencyInvitation` §4494-4496 的註解：重新邀請會把 principal 重置回未綁定的邀請佔位狀態，新 proof 必須重新驗證，不延用舊的 Google 綁定）。UI 的「重寄」按鈕對應「撤銷＋重新發送同一個 email/roleCode」兩個 API 呼叫，不是一個新端點。

## 9. 負向資安測試矩陣

| 測試情境 | 預期結果 | 對應程式/規則 |
| --- | --- | --- |
| 邀請 token 被消費兩次（Google 與密碼分支同時搶同一個 token） | 只有一邊成功；輸家查無未接受邀請 | §3 的 `FOR UPDATE` 鎖 |
| 邀請已過期（`expiresAt < now`）才接受 | 拒絕，邀請不算消費 | 仿 `validInvitation`（§4739-4753） |
| 邀請已撤銷後才接受 | 拒絕 | 同上 |
| OIDC proof 的 email 與邀請 email 不符 | 拒絕 | 仿 `validPrincipal`（§4765-4773） |
| OIDC `email_verified !== true` | 拒絕 | 仿既有 `exchangePartnerCallbackSession`（§1094-1114）同規則 |
| 接受邀請時 `(entrySlug, sub)` 的 identity link 已存在（無論是先前的 referral link 還是另一筆員工 link） | 拒絕，整段回滾，不覆寫既有 link | §2 的 `ON CONFLICT DO NOTHING` 回滾規則 |
| 接受邀請時 `(issuer, sub)` 已綁定另一個 active principal | 拒絕（`23505` 唯一約束），不部分成功 | 仿 §4937-4941 |
| `fleet_partners` 主檔或 `partner_entries` 任一方非 active 時接受邀請 | 拒絕 | §3 第 2 點 |
| 密碼分支接受邀請後，直接用 Google 登入同一 email 的其他帳號 | 拒絕（`findPrincipalBySubject` 找不到或找到別的 principal；密碼分支不覆寫 issuer/subject） | §3 密碼分支 |
| 已停用（`disabled`）的 membership 嘗試登入（Google 或密碼） | 拒絕，兩條路徑共用同一個 `account_status`/`membership.status` 檢查 | 比照密碼登入 SA/SD §12 |
| 車行 A 的已登入 session 嘗試呼叫車行 B 的 `admin/fleet-partners/:fleetPartnerIdB/invitations` | 拒絕：邀請端點要求 `platform`/`ops` realm，車行自身 session 的 realm 是 `partner`，不可能通過 `@RequireRealms` | 權威模型本身排除此情境（§1） |
| 未帶 step-up fresh session 呼叫邀請核發/撤銷/`human-roles` | 403 要求 step-up | §1 新增的 step-up 規則 |
| client 在 `/api/auth/login` 自行帶 `partner_id` 想切換到別的 entrySlug | 被忽略：server 端已不讀取該參數，一律用 `DRTS_FLEET_PARTNER_ID`（§4） | §4 修正 |
| 邀請信內容外洩（log/audit） | 不含明文 token 或密碼；只含一次性連結 | 仿密碼登入 SA/SD §2「任何地方都不出現明文」 |
