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

| Finding／驗收項                          | 原始碼依據與修改位置                                            | 舊版重現 → 修正版                                                                | 命令／版本／證據                                                                                | 未驗項與限制                                                                     |
| ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 租戶後台可用Google帳號經PKCE登入         | `OidcPkceService`、tenant BFF、`buildAuthStartupConfigReport`   | 正式 service 使用簽署 RSA token + mock provider HTTP 通過；strict startup 已修正 | 最新合併後 164 pass，exit 0；`final-regression.log`，下方修復單元 5                             | 真實 OAuth client 尚待 operator 建立                                             |
| Google ID token以輪替金鑰驗證且不偽造MFA | `OidcIdTokenVerifier`、claims merge、session guard              | 舊 9d191f5ac：6 fail / 3 pass → 修正後 9 pass；session 舊 1 fail → 修正後 7 pass | `{baseline,core,session-claims-before,session-regression,waiver-regression}.log`                | PG／真實 Google 不能由 HTTP mock 推導；staging/production 拒絕 dev waiver 已測   |
| 外部Google帳號可依邀請綁定租戶使用者     | `IdentityRepository.acceptTenantOidcInvitation`、tenant service | 未綁定拒絕、verified email、錯 tenant、重放、撤銷、並發一次性皆通過              | 邀請 suite 7 pass；API PG suite 3 skip；`api-regression.log`                                    | PG 必須由 hosted workflow 使用正式 migrations 驗證                               |
| 企業派車共用租戶登入                     | 共用 BFF factory、企業派車 session verifier                     | custom tenant／dispatch／run.app 登入與 session／logout-all／CSRF 通過           | BFF 12 pass + replay store 1 pass，exit 0；`logout-replay.log`；canvas `ent-states.jsx`         | 本 VM 禁止 browser/server；真實跨主機登入待共享 dev                              |
| deploy-dev 全有或全無啟用                | workflow 的 `api_secrets` 與 deploy steps                       | 實際 shell 區段 5 cases pass                                                     | `deploy-dev-google-oidc.test.ts`；YAML parse 9 jobs；operator 步驟如下                          | 未建立 OAuth client、未讀 secret 值、未部署                                      |
| 同候選SHA CI通過且獨立reviewer審查       | candidate lifecycle、PR #2320                                   | 舊 checkpoint CI 四個 failure 的三個修復單元已完成                               | reviewer Claude2；candidate 完整 SHA／branch 與後續 hosted 結果寫入 PR 及 handoff machine truth | CI/review/merge pending；owner 不結案；不能以 draft skipped integration 代替通過 |

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

### 最新 checkpoint：合併 dev 後的狀態

- 已保留所有已推送歷史，合併 `origin/dev` 的 `07081d0f1` 至
  `4ee8a738b646e6d9ba23023cf82e091ab76735fd`；平行 live-map 變更完整保留，
  沒有 rebase、amend 或 force push。此為 checkpoint，不是鎖定候選。
- 該 SHA 的 `merged-regression.log`：10 files / 94 pass，exit 0，涵蓋 Google、
  PKCE、邀請、BFF、replay store、deployment、identity session 與 MFA policy。
  `merged-api-typecheck.log` 與 `merged-eslint.log` 均 exit 0。
  Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4；所有啟動的檢查已結束並讀取結果。
- `startup-probe.ts` 使用既有 `buildValidProductionEnv` fixture，移除 tenant
  static controls 後加入正式 Google issuer/client/endpoints/JWKS，再直接呼叫
  `buildAuthStartupConfigReport`。`startup-before.log` exit 1，精確重現三個
  `TENANT_OIDC_*` missing controls；沒有執行服務啟動。首次缺少 tsx 的錯誤
  不列重現，最後以已安裝 TypeScript 的 CommonJS/ES2022 transpiler 執行成功。
- Supervisor 待擴充原 task write scopes：
  `apps/api/src/config/auth-startup-config.ts`（只改 tenant provider verification
  區段，不碰 IAP 的 waiver guard），以及 `tests/integ/oidc-pkce-bff.test.ts`
  （只補 real-provider 正向 fixture 的明確 issuer/sub binding）。擴充後先修這兩项、
  重跑受影響 checks，再建立 PR 並 handoff；本 checkpoint 不聲稱 CI／review 通過。

### 本次 redispatch：可重跑的 strict startup 回歸（仍待 scope）

- 重新讀取 canonical task slice，兩個 scope 申請仍未加入 `write_scopes`。
  Owner 維持 Codex、reviewer 維持 Claude2；沒有候選交審或退修輪次可宣稱。
  依協作指南 §0.7，須由 Supervisor 核對衝突並擴充原任務，owner 不自行改寫 scope。
- 已在允許的 `tests/unit/auth-startup-config.test.ts` 補入 7 項回歸，保存於
  `f5c561d9a387dea73584a2006f19894b1d1bd4cf`。直接呼叫正式
  `buildAuthStartupConfigReport`，沿用既有完整環境 fixture，不 mock 驗證邏輯。
  兩項合法 Google JWKS 設定案例仍失敗，未用 skip 或 expected-failure 隱藏；
  這是待修缺陷的 anchor，不是已完成的候選。
- 修正邊界更精確：staging／production 會被三個 `TENANT_OIDC_*` 舊設定要求
  擋住；共享 dev 的 `NODE_ENV=production`、`DRTS_ENV=development`、
  `AUTH_MODE=explicit` 設定可通過。不能把此 strict startup 缺陷描述為已證明
  共享 dev 啟動失敗。Google 缺 client ID、啟用 mock mode 的拒絕情境各兩項皆通過。

| Finding                                          | 原始碼與修正邊界                                                                                                                                                                     | 本輪重現／驗證                                                                                                                           | 待辦                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Google JWKS 被要求另設 static tenant credentials | `auth-startup-config.ts` 的 tenant workforce verification 區段；應與 `OidcIdTokenVerifier.verify` 的 issuer/audience 與遠端 JWKS 路徑一致，不以 JWT session secret 代替 provider key | `586d93d2b8c61bf58c513e3e9ebaf9b5786097c6` 產品碼 + 新回歸：staging／production 各 1 fail，精確回報三個 `TENANT_OIDC_*` missing controls | 加入 config 檔 scope；保留 generic PKCE 必填／mock 拒絕，以及 IAP lane 的 MFA waiver 政策             |
| real-provider 正向 fixture 缺 issuer/sub         | `tests/integ/oidc-pkce-bff.test.ts` 最後一項刪除 `OIDC_MOCK_MODE` 後，seed 只有 sub；`findTenantUserByOidcIdentity` 正確拒絕未綁定 issuer 的身分                                     | 原檔 baseline 與本輪均 4 pass / 1 fail；`issueVerifiedTenantSession` 回 `AUTH_SESSION_EXCHANGE_DENIED`                                   | 加入該 test scope；以既有 `bindTenantUserSubject` 明確装配測試身分，不放寬正式登入或恢復按 email 登入 |

本輪命令與結果（Node 22.23.2／pnpm 10.33.0／Vitest 4.1.4）：

- `pnpm exec vitest run tests/unit/auth-startup-config.test.ts tests/integ/oidc-pkce-bff.test.ts`
  原 checkpoint：40 pass / 1 fail，exit 1；新增回歸後：45 pass / 3 fail，exit 1。
  新增的兩個 fail 是把原 startup probe 轉為版本控制中的 regression，未修改產品碼。
- `pnpm run typecheck:root`、針對修改 test 的 ESLint 與 Prettier check 均 exit 0。
  初次 test fixture 缺 `AUTH_MODE`、初次 typecheck 缺 record 型別已修正，
  這些測試裝配錯誤不列為產品缺陷；上列數字是修正 fixture 後的完整結果。
- 本輪工作樹 `.local/entry-tenant-google-oidc/` 保存
  `redispatch-baseline.log`、`redispatch-startup-regression.log`、
  `redispatch-root-typecheck.log`、`redispatch-startup-eslint.log`。
  所有已啟動本機 checks 已結束並讀取結果；不重述前輪 scoped pass 為本輪驗收。
- 下一步仍是 Supervisor 擴充兩檔 scope → 原 owner 修復 → 同一命令應達
  48 pass → 受影響整體回歸 → 鎖定並 handoff 同一 SHA。
  未執行服務、瀏覽器、Docker、OAuth client 建立或部署；CI／獨立 review／真實登入仍待驗。

### 修復單元 5：2026-10-05 scope 擴充後修復與候選準備

Supervisor 已於原 task 的 integration_notes／write_scopes 核准三條修復路徑。
上述「待擴充 scope」段落保留為歷史 checkpoint；目前沒有 scope blocker。
前一版本為 `6caff9b119d42162c7739d6b6688ad8e0bf4f43f`，完整 findings 來源為
[PR #2320](https://github.com/ajoe734/drts-fleet-platform/pull/2320) 原始 checkpoint
說明與 [CI 37320413674](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37320413674)。
尚未發生獨立 reviewer 退修；不把 owner 自查當成 reviewer approval。

| Finding／驗收項                                                                           | 原始碼依據與修改位置                                                                                                                                                                                                                                                   | 舊版重現 → 修正版結果                                                                                                                          | 命令、版本與證據                                                                                                                                                                    | 未驗項與限制                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1：完整 Google JWKS 設定在 strict startup 被要求 static tenant credentials               | `auth-startup-config.ts:buildAuthStartupConfigReport` 的 tenant verification block；以 verifier 相同的有效 issuer 判別 Google，audience 使用 tenant override／OIDC client，Google 使用遠端 JWKS 預設或 HTTPS override                                                  | 舊版 staging／production 各失敗；修正版 51 startup cases pass，含缺 client、mock mode、非 Google override、wildcard audience、不安全 JWKS 拒絕 | `scoped-repair-before.log` exit 1 → `startup-repair.log` exit 0；修正 anchor `6944cdca7`                                                                                            | 不改 generic PKCE 必填及 IAP/MFA policy；沒有啟動 API，不能宣稱真實 provider 驗收                                                                     |
| F2：real-provider 正向 fixture 只有 seed sub、缺 issuer binding                           | `tests/integ/oidc-pkce-bff.test.ts` 呼叫既有 `TenantPartnerService.bindTenantUserSubject` 明確綁定，正式 `findTenantUserByOidcIdentity` 拒絕規則保持                                                                                                                   | 舊版 4 pass／1 fail → provider＋strict negative suites 8 pass                                                                                  | `provider-fixture-repair.log` exit 0；anchor `eda06d314`                                                                                                                            | 僅 mock token HTTP；真實簽章、PKCE、會員授權皆執行；unbound／inactive 拒絕保留                                                                        |
| F3：logout-all harness 丟失 Headers，且用過時 principal／version／scopes 建立無效 session | `tests/e2e/tenant-console-oidc-production.test.ts`；Fetch headers 轉 HTTP/Nest header record；取 beforeEach 建立的 active user、`updatedAt`、正式 `getTenantRoleScopes`；`JwtAuthService.verifyAccessToken`／`AuthController.logoutAll`／`IdentityRepository` 實際執行 | 舊版 503≠200；只改 Headers 仍 401；定位到 `.toBeDefined()` 放過 null。修正版先驗證兩個非空有效 session，呼叫真实 logoutAll，再確認兩者皆 null  | `logout-fixture-trace.log`、`logout-session-trace.log`；最終三 suites 58 pass：`three-repairs-final.log` exit 0；產品及 fixture 最終實作 `c15da7cacdb2b687589bc499791db75ca065d9f2` | 模擬 HTTP 傳輸，無 server/browser；兩 session 撤銷與 BFF backend-failure 保留 cookie 案例皆保留；單獨篩選時的 skip 不列驗收                           |
| 先前三項實作／Google JWKS、邀請綁定、派車共用登入回歸                                     | verifier、PKCE、invitation repository、兩個 BFF、session/replay/deploy gate、ordinary/admin MFA suites                                                                                                                                                                 | 合併後 root 16 files／164 pass；API auth-bootstrap 101 pass；PG 3 skip                                                                         | `final-regression.log`、`final-api-tests.log`，皆 exit 0                                                                                                                            | 本機沒有 PG；必須以同候選 hosted CI 的正式 migration／repository 測試補 PG evidence；真實 Google 及跨主機 browser acceptance 仍待 operator/shared dev |

本輪檢查版本：Node 22.23.2、pnpm 10.33.0、Vitest 4.1.4。
所有本機 logs 位於本 worker `.local/entry-tenant-google-oidc/`。
主命令（已結束並讀取結果）：

```sh
pnpm exec vitest run tests/unit/auth-startup-config.test.ts tests/integ/oidc-pkce-bff.test.ts tests/e2e/tenant-console-oidc-production.test.ts
pnpm exec vitest run tests/unit/auth-startup-config.test.ts tests/unit/entry-tenant-google-oidc.test.ts tests/unit/auth-oidc-pkce.test.ts tests/unit/tenant-google-invitation.test.ts tests/unit/tenant-google-bff.test.ts tests/unit/tenant-oidc-replay-store.test.ts tests/unit/deploy-dev-google-oidc.test.ts tests/unit/identity-session.test.ts tests/unit/identity-session-context.test.ts tests/unit/tenant-invitation-lifecycle.test.ts tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts tests/unit/system-remediation/sr-auth-admin-mfa-env-20260915/admin-mfa-gate-environment-aware.test.ts tests/integ/oidc-pkce-bff.test.ts tests/integ/oidc-pkce-bff-route.test.ts tests/e2e/tenant-console-oidc-production.test.ts tests/security/iam-oidc-strict-negative.test.ts
pnpm --filter @drts/api exec vitest run tests/unit/auth-bootstrap.test.ts tests/unit/tenant-google-invitation.pg.test.ts
pnpm run typecheck:root
pnpm --filter @drts/api typecheck
pnpm --filter @drts/tenant-console-web typecheck
pnpm --filter @drts/enterprise-dispatch-web typecheck
pnpm exec eslint apps/api/src/config/auth-startup-config.ts tests/unit/auth-startup-config.test.ts tests/integ/oidc-pkce-bff.test.ts tests/e2e/tenant-console-oidc-production.test.ts --max-warnings=0
```

四個 typecheck、scoped lint 均 exit 0（`final-*-typecheck.log`、`final-eslint.log`）。
web 檢查只產生型別，沒有啟動服務；已還原其自動修改的 `next-env.d.ts`。
本輪中共享 node_modules symlink 被外部變更破壞後，在本 isolated worktree
移除**自己的 symlink**並依既有 lockfile 安裝獨立 dependencies（`--ignore-scripts`）；
沒有修改 canonical root 或 lockfile。該次 `MODULE_NOT_FOUND` 不當作產品失敗證據。

依 Supervisor 要求以普通 merge 保留 `origin/dev` 的
`89502f7fc0ebf920db5143ef9568b9ad3d03a04d`，merge commit
`54efbcfac` 完整保留 dev 的 private-console 與 live-ops changes；沒有 rebase、amend、
force push。上列完整回歸及 typechecks 均在合併後實作執行。
交接候選只新增此證據文件，產品碼與上述 `c15da7cac` 相同；其完整 SHA 由 PR head
及 `CANDIDATE_SHA` handoff 一致鎖定，獨立 reviewer 為 Claude2。
同 SHA hosted CI／review／merge 及真實 Google acceptance 各自待寫入，不由本機 pass 推導。

### 修復單元 6：hosted PG fixture 使用正式 delivery status

- 前候選 `c93c9a934d20c1b9f29dd3e4201e33ebdb274799` 已獲 Claude2 獨立審查，
  但 [CI 37330026292](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37330026292)
  最終 failure。完整讀取 Product smoke acceptance：lint、typecheck、正式 migrations
  及 root tests（5517 pass／44 skip）成功；API tests 1538 pass／3 fail。
- 三個 fail 都是 `tenant-google-invitation.pg.test.ts:fixture` 寫入
  `deliveryStatus: "sent"`，違反 `V0068__canonical_identity_authority.sql` 的
  `chk_identity_invitations_delivery_status`，尚未進入被驗證的邀請交易。
  這是 fixture 裝配缺陷，不能算三個業務行為的舊版失敗重現。
- 正式契約 `CANONICAL_INVITATION_DELIVERY_STATUSES` 使用 `delivered`；
  `TenantPartnerService.issueTenantInvitation` 也明確把 delivery adapter 的 `sent`
  轉成 `delivered`。本次只修 fixture 使用相同 canonical 值，保留正式 schema、
  production repository 及原本三項交易斷言，沒有新增／放寬 migration 或 mock DB。

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、版本與證據 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F4：PG 邀請 fixture 在交易前違反 delivery status constraint | `apps/api/tests/unit/tenant-google-invitation.pg.test.ts:fixture`；migration V0068、canonical invitation contract、`issueTenantInvitation` | 舊候選 hosted 3 fail 均停在 fixture；修正後須由新 SHA hosted CI 驗證 | `pnpm --filter @drts/api test -- --no-file-parallelism --maxConcurrency=1`；舊 run 完整結果已讀；本機 `.local/entry-tenant-google-oidc/ci-37330026292-{failed,product}.log` | 本 VM 無 PG 且禁止啟動服務；本機 skip 不算通過，hosted 結果另記 PR／machine truth |
| 外部 Google 帳號依邀請綁定：並發一次性、錯 email／tenant 不耗 proof、subject 衝突全回滾 | `IdentityRepository.acceptTenantOidcInvitation`、正式 migrations、原三個 PG tests | 原斷言全部保留；等待正式 PG 環境執行結果 | 新候選完整 SHA 由 PR head 與 handoff 鎖定 | 真實 OAuth、跨主機 browser acceptance 仍待 operator／共享 dev |
| 同候選 SHA CI／獨立 review | 前候選 Claude2 approval；CI failure 已讀 | 新 fixture commit 必須重新取得同 SHA CI 與 Claude2 review | PR #2320，禁止沿用舊 SHA approval 當新候選證據 | draft integration 37330026268 跳過產品 gates，不列驗收；owner 不結案 |

本輪沒有修改產品碼／UI／部署設定，沒有啟動本機服務、瀏覽器或 Docker，
沒有建立 OAuth client 或部署。修正以普通 commit／push 保留已發布歷史。
