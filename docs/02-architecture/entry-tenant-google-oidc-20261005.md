# ENTRY-TENANT-GOOGLE-OIDC-20261005

Owner: Codex · Reviewer: Claude2 · Base: `cf263f02f`

## 決策與修正邊界

- 使用既有 authorization-code / S256 PKCE、nonce、HttpOnly state cookie。
  Google 端點明確設定，外部 Google 帳號允許，不套用 `hd` 限制。
- 所有 tenant OIDC 入口必須驗證 issuer、audience、有效期與輪替 JWKS；
  未知 kid 必須刷新，不能退回第一把 key 或 JWT session secret。
- amr/acr 只採 ID token 真實 assertion，不以 userinfo 或預設值宣稱 MFA。
  與 ENTRY-IAP-WORKFORCE-AUTH-20261005 協調 `DRTS_DEV_MFA_WAIVED`；
  開發豁免必須有事件，不改 staging/production 政策。
- 未綁定 `(issuer, sub)` 一律拒絕；邀請接受需要 Google verified email
  與邀請收件者相符，並以一次性 proof 綁定，不能按 email 自動登入。
- 企業派車採同一 API 的獨立 PKCE callback，保留 host-only cookie；
  Google 瀏覽器登入可重用，DRTS 授權仍來自同一 tenant membership。
  此方案同時適用自訂網域與 run.app，避免跨所有 sibling host 分享 bearer cookie。
- 保留現有 canvas。已核對 `packages/ui-tokens/src/realms.ts`、
  `tenant-screens*.jsx`、`ent-states.jsx`；登入與邀請串接以既有路由完成，
  不自行新增未有 canvas 的邀請畫面。

## 來源與呼叫路徑

- `OidcPkceService.generateLoginParameters` → BFF state →
  `exchangeTenantCallbackSession` → `validateAndExchangeCode` → ID token verifier。
- `AuthController.issueTenantOidcSession` 原本使用靜態 key 並按 email 登入，
  必須與 PKCE 路徑共用驗證與 subject 授權。
- `TenantPartnerService.acceptTenantInvitation` 原本先 consume，再分次寫 userRole
  與 canonical membership；`bindTenantUserSubject` 為非原子快取修改，不能直接
  當成安全的一次性綁定實作。此修正需要 Supervisor 核對額外 repository scope。
- `verifyEnterpriseTenantSession` 已用 `/api/auth/session` 驗證 tenant realm；
  現缺企業派車主機自己的登入 callback。

Google 協定來源：[OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)。
已核對端點、nonce、精確 redirect URI、sub 作身分依據；OAuth client 只寫操作文件，
不代使用者建立或部署。

## 驗收與證據（持續更新）

| Finding／驗收項                          | 原始碼依據與修改位置                      | 舊版重現 → 修正版                | 命令／版本／證據      | 未驗項與限制                                 |
| ---------------------------------------- | ----------------------------------------- | -------------------------------- | --------------------- | -------------------------------------------- |
| 租戶後台可用Google帳號經PKCE登入 | `OidcPkceService`、tenant BFF | 正式 service 使用簽署 RSA token + mock provider HTTP 通過 | Google/PKCE/邀請 45 pass，exit 0；`waiver-regression.log` | 真實 OAuth client 尚待 operator 建立；strict startup 設定待擴充 scope |
| Google ID token以輪替金鑰驗證且不偽造MFA | `OidcIdTokenVerifier`、claims merge、session guard | 舊 9d191f5ac：6 fail / 3 pass → 修正後 9 pass；session 舊 1 fail → 修正後 7 pass | `{baseline,core,session-claims-before,session-regression,waiver-regression}.log` | PG／真實 Google 不能由 HTTP mock 推導；staging/production 拒絕 dev waiver 已測 |
| 外部Google帳號可依邀請綁定租戶使用者 | `IdentityRepository.acceptTenantOidcInvitation`、tenant service | 未綁定拒絕、verified email、錯 tenant、重放、撤銷、並發一次性皆通過 | 邀請 suite 7 pass；API PG suite 3 skip；`api-regression.log` | PG 必須由 hosted workflow 使用正式 migrations 驗證 |
| 企業派車共用租戶登入 | 共用 BFF factory、企業派車 session verifier | custom tenant／dispatch／run.app 登入與 session／logout-all／CSRF 通過 | BFF 12 pass + replay store 1 pass，exit 0；`logout-replay.log`；canvas `ent-states.jsx` | 本 VM 禁止 browser/server；真實跨主機登入待共享 dev |
| deploy-dev 全有或全無啟用 | workflow 的 `api_secrets` 與 deploy steps | 實際 shell 區段 5 cases pass | `deploy-dev-google-oidc.test.ts`；YAML parse 9 jobs；operator 步驟如下 | 未建立 OAuth client、未讀 secret 值、未部署 |
| 同候選SHA CI通過且獨立reviewer審查 | candidate lifecycle | 尚未鎖定候選 | reviewer Claude2；已發布 anchor 9d191f5ac → 43facf4ac → b5cf35d29 → ed6c34bbb | 完成實作後鎖 SHA；CI/review/merge pending；owner 不結案 |

本 VM 僅執行 repository checks，不啟動產品服務、瀏覽器或 Docker。

### 修復單元 1：ID token / PKCE

- `tests/unit/entry-tenant-google-oidc.test.ts` 直接呼叫正式 PKCE service；只 mock
  Google HTTP 邊界，以本次產生的 RSA key 簽 token，沒有 mock 驗證邏輯。
- 舊版 `9d191f5ac`（產品碼同 base）：9 項中 6 fail / 3 pass，exit 1。
  已重現輪替失敗、未知 kid 取第一把 key、Google HMAC 接受、錯誤 azp 接受、
  缺 sub/exp 接受、userinfo 提升 MFA。安裝缺件的首次失敗不列為重現。
- 新版工作樹：Google 9 項 + 既有 PKCE 29 項，38 pass，exit 0。
  `pnpm exec vitest run tests/unit/entry-tenant-google-oidc.test.ts tests/unit/auth-oidc-pkce.test.ts`
  本機 evidence：`.local/entry-tenant-google-oidc/{baseline,core}.log`。
- 現有 provider fixture 補入強制要求的 `exp`；callback 恢復 state 內 tenant，
  callback 若嘗試改寫已指定 tenant/partner 則拒絕。
- 後续單元已接通 legacy `/tenant/oidc-session`、邀請綁定、dev waiver、BFF
  與部署 gate；scoped pass 不代表真實 OAuth 或部署驗收。

### 修復單元 2：共同登入與原子邀請

- Supervisor 已核准 `identity.repository.ts` / `tenant-partner.service.ts` scope。
  `acceptTenantOidcInvitation` 在同一交易內鎖邀請、會員、principal、userRole，
  驗證收件者及 tenant，再同時啟用與寫入 `(oidcIssuer, subjectId)`。
  `syncLegacyTenantUserRole` 保留新身分，Google 模式停用純邀請碼入口。
- legacy ID-token 入口委派給 PKCE service 的同一 subject/MFA 授權路徑；
  `DRTS_DEV_MFA_WAIVED` 僅非 staging/production 可用，使用時必須記安全事件。
- 租戶／派車共用 BFF handler；各 host 自己持有 state、session、CSRF cookie。
  新 server transport 補入私有 Cloud Run 的 caller identity。
- 舊 MFA 測試仍指向已移走的 controller verifier／未注入 PKCE service，
  已修正裝配並使用明確綁定身分，保留正向及拒絕案例；最新 126 項範圍回歸
  與 API auth-bootstrap 101 項皆通過。先建置 control-plane-auth 型別輸出後，
  API typecheck pass（exit 0）。

## Operator：建立 Google OAuth client（文件步驟，尚未執行）

1. 先讀 `.github/workflows/deploy-dev.yml`、`docs/ops/branch-strategy.md` 與
   `docs/03-runbooks/smarttransport-tw-custom-domains.md`。用 `gh variable list`
   核對當次 `DEV_GCP_PROJECT_ID`、`DEV_GCP_REGION`；歷史 suspended project
   不可使用。本任務不建立 client、secret、public exposure 或觸發部署。
2. 在正確 GCP project 的 Google Auth Platform 設定 Branding，Audience 選
   **External**；testing 狀態加入實際測試帳號。只請求 `openid profile email`，
   不限制 Workspace hosted domain。External consent 不等於任意帳號有租戶權限。
3. Clients → Create client → **Web application**。加入精確 redirect URI：
   `https://tenant.smarttransport.tw/api/auth/tenant/callback` 與
   `https://dispatch.smarttransport.tw/api/auth/tenant/callback`；再以現行兩個
   Cloud Run service 的 `status.url` 各接 `/api/auth/tenant/callback` 加入
   run.app fallback。不得使用 wildcard、舊 project hostname 或前端 root URL。
4. 把 client ID 設為 repository variable `DEV_OIDC_CLIENT_ID`。把 client secret
   由 operator 建入現行 project 的 Secret Manager `drts-dev-oidc-client-secret`，
   建立 enabled version，給 runtime service account `secretAccessor`。
   不放入 Git、文件、issue 或日誌。部署 runner 只 describe，從不讀取 secret 值。
5. 核對 `DEV_TENANT_CONSOLE_ORIGIN`、`DEV_ENTERPRISE_DISPATCH_ORIGIN` 與實際
   domain mappings。workflow 將兩個 public origin 與 run.app origin 加入
   `AUTH_ALLOWED_ORIGINS`，並把邀請信連結設到 tenant 的既有登入路由。
6. 兩份設定皆不存在時，OIDC 關閉；只有一份存在時 workflow 在部署前失敗；
   全部存在才啟用 Google 端點、secret mount、兩個 BFF state secret 與
   明示的 `DRTS_DEV_MFA_WAIVED=true`。BFF state secret 使用既有 JWT secret
   mount，Google client secret 只進 API。重新部署使用完整 `--set-env-vars` /
   `--set-secrets`，不保留半套舊 OAuth 設定。
7. 透過既有授權 deploy workflow，使用 immutable release/publish ref 或完整 SHA。
   在共享 Cloud Run 驗證：外部帳號邀請 → email 對應 → Google 登入 → 一次綁定，
   相同 sub 後續登入、錯誤帳號拒絕、重放／撤銷拒絕、派車登入、logout-all。
   未有實際部署 source SHA/run 證據前不可宣稱上線。

邀請信的 token 由 BFF 以 POST body 傳至 API，雜湊只存於加密 state；
不傳給 Google。回覆加 `Referrer-Policy: no-referrer` 與 `Cache-Control: no-store`。
兩個入口共用會員、角色與 session API；各自 logout 清除自己的 cookie，
logout-all 透過 API 撤銷所有 session。企業派車的登入按鈕維持 canvas，僅接上路由。

### 修復單元 3：session 實際消耗與部署 gate

- 新增 `JwtAuthService.verifyAccessToken` 實際消耗測試：原有 guard 對空
  amr/acr 拒絕（1 fail / 6 pass），修正後 7 pass；原有 identity session
  suite 另 10 pass。現在合法缺少 MFA assertion 的 durable session 可用，
  撤銷後立即拒絕；不改任何 step-up 的 trusted MFA 判定。
- 最新範圍回歸：13 files / 126 tests pass；API auth-bootstrap 101 pass；
  ordinary-login + step-up 15 pass。PostgreSQL 新增 3 cases 本機 skip，
  由現有 CI Product smoke acceptance 在正式 migrations 後執行，測並發消耗、
  錯誤 email/tenant 不耗 proof、重複 `(issuer, sub)` 全部回滾。
- API、root、tenant-console、enterprise-dispatch typecheck exit 0；兩個 web
  typecheck 僅產生型別，沒有啟動服務。BFF-only import gate exit 0。
- deployment 的 5-case 測試直接執行 workflow 的 OIDC shell 區段，mock
  Secret Manager describe，驗證全缺／全有／任一缺／錯誤 client ID。
  YAML parse 9 jobs；沒有呼叫任何 deploy 或建立 OAuth 資源。
- 2026-10-05 read-only `gh variable list`：現行 dev target 為
  `drts-dev-devcc-20260825` / `us-central1`；兩個 origin 目前是 run.app。
  未列出 `DEV_OIDC_CLIENT_ID`，真實 OAuth acceptance 仍待 operator 設定。
- 上述 machine-specific logs 在 `.local/entry-tenant-google-oidc/`。
  CI／review／merge／真實 Google 登入均不可由 scoped pass 推導。

### 修復單元 4：擴大相容性與失敗邊界

- 一般 provider 同時設定 OAuth client secret 與 RSA JWKS 時，舊 selector
  錯誤只允許 HS256；改為依 token alg 選擇對應 key，Google 仍固定 RS256。
  dev waiver 的 `recordEventRequired` 寫入失敗必須拒絕 session，45 項回歸通過。
- 既有 strict hermetic fixture 透過 `bindTenantUserSubject` 裝配，現在 helper
  寫入不可替換的 issuer/sub；不容許 Google seed 或 email 自動成為會員。
- logout-all 遇 API HTTP／network 失敗回傳 503，保留 session 供重試，不宣稱
  全部登出成功；三種 host 各有正向與拒絕測試。configured DB outage 不可
  將 OIDC state consume 退回 process-local storage。兩個 suite 共 13 pass。
- 待修：`tests/integ/oidc-pkce-bff.test.ts` 最後一個 real-provider fixture
  仍缺明確 issuer/sub 綁定（擴大 hermetic 回歸 15 pass / 1 fail）；以及
  `auth-startup-config.ts` strict validation 仍強制 tenant static key，須允許
  正式 Google JWKS 設定。兩者已透過原 task progress 請 Supervisor 核對 scope，
  尚未改動未授權檔案；不以此版本宣稱可交審。
