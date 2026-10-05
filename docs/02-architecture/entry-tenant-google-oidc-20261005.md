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

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版 | 命令／版本／證據 | 未驗項與限制 |
| --- | --- | --- | --- | --- |
| 租戶後台可用Google帳號經PKCE登入 | oidc-pkce.service.ts、tenant BFF | 尚未執行 | Base cf263f02f | 真實 OAuth client 尚待 operator 建立 |
| Google ID token以輪替金鑰驗證且不偽造MFA | verifier、claims merge | 靜態確認預設 MFA 與 kid fallback | 尚未執行回歸 | 需測 rotation、錯誤 issuer/aud/nonce、缺 MFA |
| 外部Google帳號可依邀請綁定租戶使用者 | invitation acceptance、canonical identity | 靜態確認未綁定 | 待 scope 協調 | PG 需 hosted 正式 schema 驗證 |
| 企業派車共用租戶登入 | enterprise session、host-local auth route | 尚未執行 | canvas ent-states.jsx | 本 VM 禁止 browser/server |
| 同候選SHA CI通過且獨立reviewer審查 | candidate lifecycle | 尚未建立候選 | reviewer Claude2 | owner 不結案 |

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
- legacy `/tenant/oidc-session`、邀請綁定、dev waiver、BFF 與部署尚待下一單元；
  以上 scoped pass 不代表完整交付。
