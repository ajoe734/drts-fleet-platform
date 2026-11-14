# FLEET-STAFF-ONBOARDING-20261114：實作任務包

Owner: Claude · Reviewer: Claude2 · 依據：[決策紀錄](../../01-decisions/SD-DP-20261114-001-fleet-staff-onboarding.md)、[SA/SD](01_system_sa_sd.md)

依相依順序列出，Supervisor 可直接登記為個別任務。`required_acceptance` key 採 `<task-id 小寫>_ready` 格式；`test_commands` 為本機可執行的檢查（本 VM 不得啟動服務/瀏覽器/Docker/資料庫，涉及 PG/hosted 的項目已標註為 hosted-only）。

## 與 PWD-LOGIN-004/009/012 的相依與 write_scopes 協調（總覽）

- [PWD-LOGIN-004](../portal-password-login-20261113/02_implementation_tasks.md)（邀請接受分支：設定密碼／綁定 Google）目前的 write_scopes 覆蓋 `apps/api/src/modules/identity/identity.repository.ts`、`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`、`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`、`packages/agency-auth/src/route-handlers.ts`、`packages/tenant-auth/src/route-handlers.ts`。它已針對 tenant／agency 合併（commit 3867de8d6, PWD-LOGIN-004）。**本任務包的 FLEET-ONB-002/003/004 會再次修改 `identity.repository.ts`、`tenant-partner.service.ts`**（新增車行專屬的 `issueFleetStaffInvitation`／`acceptFleetStaffOidcInvitation`／`acceptFleetStaffInvitationWithPassword`／`revokeFleetStaffInvitation` 及其呼叫點）——這些是**新函式**，不改動 PWD-LOGIN-004 已寫的 tenant/agency 函式本體，衝突風險是行號漂移而非邏輯衝突；FLEET-ONB-002/003/004 的 owner 在開工前必須 `git fetch origin && git merge origin/dev` 取得 PWD-LOGIN-004 的最新合併結果，避免在舊基線上重新引入已被取代的程式碼。
- [PWD-LOGIN-005](../portal-password-login-20261113/02_implementation_tasks.md)（密碼登入端點）會修改 `apps/api/src/modules/auth/auth.controller.ts`。**FLEET-ONB-004 也會修改同一檔案**（新增 `partner/invitation-login`、密碼分支的 `partner/invitation/accept-with-password`）。協調方式：FLEET-ONB-004 必須晚於 PWD-LOGIN-005 合併後才開工（`depends_on` 已標註跨包相依），且 FLEET-ONB-004 的 `password-login` 端點路由解析（realm `partner` 的角色/scope 來源）必須採用 SA/SD §3 的規則（直接查 membership，不查 `partner_user_identity_links`），這一條規則要同步通知 PWD-LOGIN-005/008 的 owner，不能讓 PWD-LOGIN-005 誤把車行密碼登入也導向 `exchangePartnerCallbackSession` 的 identity-link 查找路徑。
- [PWD-LOGIN-009](../portal-password-login-20261113/02_implementation_tasks.md)（四入口 UI）write_scopes 含 `apps/fleet-partner-portal-web/**`、`packages/tenant-auth/**`。**FLEET-ONB-008 也會修改 `apps/fleet-partner-portal-web/**`**（新增 `/invite` 接受邀請頁）。協調方式：FLEET-ONB-008 只新增 `/invite` 路由與對應元件，不修改 PWD-LOGIN-009 新增的登入頁密碼表單／帳號安全頁；若兩者在同一週期並行，由後開工的一方 `git merge origin/dev` 先吸收另一方已合併的改動，避免互相覆寫。共用元件（表單輸入框、錯誤訊息樣式）優先重用 `packages/ui-web` 既有元件，不在 `fleet-partner-portal-web` 內重新刻一套。
- [PWD-LOGIN-012](../portal-password-login-20261113/02_implementation_tasks.md)（hosted dev 實機驗收）涵蓋四個入口的「邀請→設定密碼→TOTP→登入→登出→重設密碼」。**車行入口在 PWD-LOGIN-012 執行前，必須先有 FLEET-ONB-009 建立的 dev `fleet-demo-001` partner entry 與邀請入口，否則 PWD-LOGIN-012 對車行入口這一段無法走通。** FLEET-ONB-009 的 `required_acceptance` 因此是 PWD-LOGIN-012 車行段落的前提，但不是同一個任務，兩者分別登記、分別驗收。

## FLEET-ONB-001：fleet partner entry 佈建與登入入口 entry 解析修正

- 目的：修正 `PARTNER_ENTRY_NOT_FOUND`（SA/SD §4、§5）：新增 dev `PARTNER_ENTRY_SEED` 項目（`partnerType: "fleet_partner"`、`entrySlug/partnerId` 皆為 `DRTS_FLEET_PARTNER_ID` 的值），並修正車行 BFF 的 `login`/未來 `invitation-login` action，改由 server 端環境變數決定 `partner_id`，不讀取 client query 參數。
- write_scopes：`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`（`PARTNER_ENTRY_SEED` 新增一筆）、`apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts`、對應單元測試。
- depends_on：無
- 驗收條件：`GET /api/auth/partner/login`（經車行 BFF）在 dev 環境可解析出 `entrySlug === DRTS_FLEET_PARTNER_ID` 的 active partner entry；缺少 `DRTS_FLEET_PARTNER_ID` 時 BFF 回 503 而不是把空字串傳給 API；client 带的 `partner_id` query 参数被忽略（有測試覆蓋「client 帶不同值仍解析到伺服端設定值」）。
- required_acceptance：`fleet-onb-001_ready`
- test_commands：
  - `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner-entries.test.ts`（若無此檔則比照既有 partner entry 測試慣例新增）
  - `pnpm --filter @drts/fleet-partner-portal-web exec vitest run`

## FLEET-ONB-002：車行邀請的身分模型基礎（principal／membership／role binding／identity link 橋接）

- 目的：新增 `FLEET_INVITATION_ISSUER` 常數與 `IdentityRepository` 內部的 sourceRef／scopeRef 建構輔助函式（仿 `agencyMemberSourceRef`／`buildAgencyScopeRef`），以及 `PartnerUserIdentityLinkRepository.createForInvitedPrincipal`（SA/SD §2 的 `ON CONFLICT DO NOTHING` 寫入，不經過 `resolveOrCreate`）。本任務只建立可被後續任務呼叫的基礎函式與型別，不建立對外路由。
- write_scopes：`apps/api/src/modules/identity/identity.repository.ts`（新增常數/輔助函式，不修改既有 tenant/agency 函式）、`apps/api/src/modules/tenant-partner/partner-user-identity-link.repository.ts`（新增 `createForInvitedPrincipal`）、`packages/contracts/src/referral-channel.ts`（`PARTNER_USER_IDENTITY_CONSENT_SCOPES` 新增 `"fleet_staff_invitation"` 值）、對應單元測試。
- depends_on：FLEET-ONB-001（需要先有 entrySlug 可供測試情境使用）
- 驗收條件：`createForInvitedPrincipal` 對同一 `(entrySlug, partnerUserRef)` 第二次呼叫回傳衝突訊號（不覆寫既有 row）；sourceRef 公式產出字串與 SA/SD §2 表格逐字一致，並有測試斷言 `manageFleetHumanRole`／`exchangePartnerCallbackSession` 既有的 sourceRef 比對邏輯可以辨識出本任務產生的記錄（回歸測試，防止格式漂移）。
- required_acceptance：`fleet-onb-002_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/partner-user-identity-link.test.ts tests/unit/identity-fleet-staff-sourceref.test.ts`（後者為新檔）

## FLEET-ONB-003：邀請核發／撤銷端點與投遞服務

- 目的：新增 `IdentityRepository.issueFleetStaffInvitation`／`revokeFleetStaffInvitation`（仿 `issueAgencyInvitation`／`revokeAgencyInvitation`，SA/SD §2、§8）、`FleetInvitationDeliveryService`（仿 `AgencyInvitationDeliveryService`，SA/SD §7）、`FleetPartnerController` 新端點 `POST/GET admin/fleet-partners/:fleetPartnerId/invitations`、`POST .../invitations/:invitationId/revoke`、`POST .../members/:membershipId/deactivate`，以及對應 step-up 規則（SA/SD §1）。
- write_scopes：`apps/api/src/modules/identity/identity.repository.ts`、`apps/api/src/modules/fleet-partner/fleet-partner.service.ts`、`apps/api/src/modules/fleet-partner/fleet-partner.controller.ts`、新檔 `apps/api/src/modules/fleet-partner/fleet-invitation-delivery.service.ts`、`apps/api/src/common/auth/step-up.policy.ts`、`packages/contracts/src/index.ts`（新 command/view 型別，仿 `InviteAgencyMemberCommand`/`AgencyInvitationView`）、對應單元測試。
- depends_on：FLEET-ONB-002
- 驗收條件：核發邀請要求 `platform`/`ops` realm 與 step-up fresh session，否則 403；email 格式與 `roleCode`（`fleet_partner_admin`/`fleet_partner_ops`/`fleet_partner_finance`）驗證；已存在 active membership 的 email 重複邀請回 409；撤銷寫 `revokedAt`；停用成員同交易撤銷既有 session（重用 `revokePrincipalSessionsInTransaction`）；只有 adapter 回 `sent` 才記 `delivered`。
- required_acceptance：`fleet-onb-003_ready`
- test_commands：
  - `pnpm --filter @drts/api exec vitest run tests/unit/fleet-partner.test.ts tests/unit/fleet-invitation-delivery.test.ts`
  - hosted-only PG：比照 `tenant-google-invitation.pg.test.ts` 的新檔，驗 constraint/並發

## FLEET-ONB-004：接受邀請（Google 綁定／密碼分支）與密碼登入路由解析

- 目的：新增 `IdentityRepository.acceptFleetStaffOidcInvitation`／`acceptFleetStaffInvitationWithPassword`（SA/SD §3）；`OidcPkceService` 新增 `issueVerifiedFleetSession` 的 `invitationTokenHash` 分支（仿 `issueVerifiedAgencySession` §781-878）；`AuthController` 新增 `POST auth/partner/invitation-login`（仿 `agency/invitation-login`）；密碼分支的 `partner/invitation/accept-with-password` 掛在 PWD-LOGIN-004 已建立的端點族下；確保 `partner` realm 的 `password-login` 角色/scope 解析走 SA/SD §3 的「直查 membership」規則，不經過 `partner_user_identity_links`。
- write_scopes：`apps/api/src/modules/identity/identity.repository.ts`、`apps/api/src/modules/auth/oidc-pkce.service.ts`、`apps/api/src/modules/auth/auth.controller.ts`、對應單元/PG 測試。
- depends_on：FLEET-ONB-003、[PWD-LOGIN-004](../portal-password-login-20261113/02_implementation_tasks.md)（已合併）、[PWD-LOGIN-005](../portal-password-login-20261113/02_implementation_tasks.md)（密碼登入端點須先存在才能掛車行分支）
- 驗收條件：Google 分支在 `(entrySlug, sub)` identity link 已存在時整段回滾（SA/SD §9 負向矩陣）；`(issuer, sub)` 唯一約束衝突時整段回滾；密碼分支不覆寫 `issuer/subject`；密碼登入對 `partner` realm 回傳的 scope 與 `manageFleetHumanRole` 建立的角色一致，且不因為沒有 `partner_user_identity_links` row 而被誤判為未受邀。
- required_acceptance：`fleet-onb-004_ready`
- test_commands：
  - `pnpm --filter @drts/api exec vitest run tests/unit/fleet-staff-invitation-accept.test.ts tests/security/iam-oidc-strict-negative.test.ts`
  - hosted-only PG：並發一次性消費測試（仿 `acceptTenantOidcInvitation` 的既有並發測試）

## FLEET-ONB-005：既有角色管理端點補 step-up

- 目的：`PUT admin/fleet-partners/:fleetPartnerId/human-roles` 補上 step-up 規則（SA/SD §1 指出的既有缺口），並確認其 `sourceRef` 查詢與 FLEET-ONB-002/004 建立的記錄互通（SA/SD §6）。
- write_scopes：`apps/api/src/common/auth/step-up.policy.ts`、對應單元測試。
- depends_on：FLEET-ONB-004
- 驗收條件：未帶 fresh step-up session 呼叫 `PUT .../human-roles` 回 403；已接受邀請的人員可以被 `manageFleetHumanRole` 正確找到既有 membership/binding 並更新（不誤判為新建）。
- required_acceptance：`fleet-onb-005_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/step-up-policy.test.ts tests/unit/fleet-partner.test.ts`

## FLEET-ONB-006：重寄流程與稽核事件

- 目的：確認「撤銷＋重新核發」的重寄路徑（SA/SD §8）在 UI 操作層一致可用；新增 security events（`fleet_staff_invitation.issued`/`revoked`/`accepted`/`denied`，仿機關 `agency_oidc_invitation.bound`／`agency_oidc_session.denied` 的既有命名慣例）寫入 `admin.security_events`。
- write_scopes：`apps/api/src/modules/fleet-partner/fleet-partner.service.ts`、`apps/api/src/modules/auth/oidc-pkce.service.ts`（security event 呼叫點）、對應單元測試。
- depends_on：FLEET-ONB-003、FLEET-ONB-004
- 驗收條件：重寄後舊 token 不可用、新 token 可用；每個狀態轉換都有對應 security event，且不含明文（token/密碼）。
- required_acceptance：`fleet-onb-006_ready`
- test_commands：`pnpm --filter @drts/api exec vitest run tests/unit/fleet-partner.test.ts tests/security/security-events.test.ts`

## FLEET-ONB-007：負向資安測試矩陣（單元＋PG）

- 目的：補齊 SA/SD §9 完整負向測試矩陣：token 重放、過期/撤銷邀請、email/proof 不符、identity link 衝突、`(issuer,sub)` 唯一約束衝突、停用 membership 雙路徑擋下、跨車行呼叫邀請端點、無 step-up 呼叫、client 自帶 `partner_id` 被忽略。
- write_scopes：`apps/api/tests/**`、`tests/security/**`、`tests/unit/**`（僅新增測試檔，不改產品碼；發現產品碼缺陷回報對應 FLEET-ONB-00x 任務修正）。
- depends_on：FLEET-ONB-003、FLEET-ONB-004、FLEET-ONB-005、FLEET-ONB-006
- 驗收條件：矩陣全綠；本機無 PG 的項目明確標記 hosted-only 並列出對應 hosted CI job。
- required_acceptance：`fleet-onb-007_ready`
- test_commands：
  - `pnpm --filter @drts/api exec vitest run`
  - `pnpm exec vitest run tests/security/`
  - hosted-only：`pnpm --filter @drts/api test`（含 `.pg.test.ts`）

## FLEET-ONB-008：車行入口 UI（接受邀請頁）

- 目的：新增 `apps/fleet-partner-portal-web/app/invite/page.tsx`（仿 `apps/agency-portal-web/app/invite/page.tsx`），呈現「設定密碼」／「綁定 Google」兩個分支（與密碼登入 SA/SD §9 的通用接受邀請畫面規格一致）；核發/撤銷/重寄的管理操作 UI（供 platform-admin-web 或既有車行管理介面使用，依既有 `human-roles` 管理 UI 掛載位置決定，不新建獨立管理 app）。
- write_scopes：`apps/fleet-partner-portal-web/app/invite/**`、`apps/fleet-partner-portal-web/lib/translations.ts`（新增文案鍵）、既有車行人員角色管理 UI 所在檔案（依現況掛載位置而定，若在 `platform-admin-web` 則限定該既有頁面檔案，不擴大其他 write_scopes）。
- depends_on：FLEET-ONB-004、FLEET-ONB-006；協調 [PWD-LOGIN-009](../portal-password-login-20261113/02_implementation_tasks.md)（見本文件開頭的協調說明）
- 驗收條件：zh-TW/en 文案完整；表單可鍵盤操作；邀請狀態（`invited`/`active`/`disabled`）在管理 UI 清楚區分（SA/SD §6）。
- required_acceptance：`fleet-onb-008_ready`
- test_commands：
  - `pnpm --filter @drts/fleet-partner-portal-web exec vitest run`
  - `pnpm --filter @drts/fleet-partner-portal-web typecheck`

## FLEET-ONB-009：部署設定與 hosted dev 實機驗收證據（外部閘門）

- 目的：新增 `FLEET_INVITATION_ACCEPT_URL_BASE` 環境變數到 `.github/workflows/deploy-dev.yml`（SA/SD §7）；在共享 dev 環境實際走一次「邀請→（Google 或密碼）接受→登入→撤銷/重寄」並產出證據，供後續 PWD-LOGIN-012 的車行段落使用。
- write_scopes：`.github/workflows/deploy-dev.yml`、`docs/04-uat/fleet-staff-onboarding-20261114/` 或本任務的 `.local/` 證據目錄（僅文件/證據檔案，不改產品碼）。
- depends_on：FLEET-ONB-001、FLEET-ONB-003、FLEET-ONB-004、FLEET-ONB-008
- 驗收條件：`FLEET_INVITATION_ACCEPT_URL_BASE` 缺失時部署前失敗（仿既有 `AGENCY_INVITATION_ACCEPT_URL_BASE` 的全有或全無檢查）；dev 環境至少一組「邀請→接受→登入」完整走訪證據（截圖/trace + 部署 revision + commit SHA + CI 綠燈連結）。
- required_acceptance：`fleet-onb-009_ready`
- external_gate：`true`（需要可用的 hosted dev 環境，不是本機可自證的任務）
- test_commands：
  - 本 VM 禁止執行：不得在本機啟動瀏覽器、Docker、playwright 或任何 preview/dev server 來模擬或替代此驗收。
  - hosted-only（僅可在共享 dev 或等效 hosted 環境執行）：對 `fleet-partner-portal-web` 走一次「platform admin 核發邀請→受邀者接受（Google 或密碼）→登入車行入口→管理者撤銷/重寄」，收集截圖/trace、deploy-dev revision、commit SHA、FLEET-ONB-003/004/007/008 的 CI 綠燈 run 連結。
  - 證據存放：`docs/04-uat/fleet-staff-onboarding-20261114/` 或本任務 `.local/` 證據目錄；完成後才可記錄 `fleet-onb-009_ready`。
