# PAX-FACEBOOK-LOGIN-20261009

Owner: Codex · Reviewer: Codex2

## 正式依據與修改

SD `01_system_sa_sd.md` §2–4 定義 Facebook OAuth2、`/me` 帶 appsecret_proof、FACEBOOK_APP_ID/SECRET 全有全無、email 不作帳號合併、唯一登入身分刪除視同軟刪帳號。沿用 V0111 transaction 與 V0109 account repository；SQL 逐欄核對 migration。

- `facebook-oauth.ts / exchangeFacebookCode`：API code exchange、debug_token app_id/is_valid/user_id/expiry、/me subject 一致與 appsecret_proof；不保存 Facebook email 為 verified contact。
- `PassengerOAuthService.start/callback`：僅附加 Facebook 分支，state、一次性 claim、allowlist、session-bound link 維持既有路徑；`PassengerAccountService.linkIdentity` 再驗當下 session family。
- `FacebookDataDeletionService.delete/status`：HMAC-SHA256 signed_request、identity → account 鎖定順序、重新核對 ownership；移除唯一身分時沿用 anonymize，否則只刪 Facebook 身分。所有 session family 撤銷；保留歷史行程／財務。
- controller 回裸 `{url, confirmation_code}`、HTTP 200，附加 module/provider/policy。status 為匿名完成收據，無 process-memory job map、不需新 migration。

## 本輪證據與未解 finding

初始基準 `2bb31e7fd60074773932caa00a1c56711bb9b6ac` 無 Facebook implementation（新功能，舊版動態重現不適用）；尚無前輪退修。
已普通 push 的測試 checkpoint `b5f6336dba0c38f92d3f0de365f2b0daf411326f` **不是 review candidate**。
FB-INGRESS-1 未解，尚未 handoff、同候選 CI／review／merge 或 record-acceptance。

| Finding／驗收項                                  | 原始碼依據與修改位置                                                                    | 舊版重現 → 修正版結果                                                                                                                                 | 命令、退出碼、版本與證據                                                                                                              | 未驗項與限制                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| pax-facebook_flow_verification_and_data_deletion | Facebook adapter/controller/service、module/policy；既有 transaction/account repository | 基準功能不存在 → service/stub 正負向通過；**整项未滿足**                                                                                              | 上述 checkpoint；root 324、API 19 tests exit 0，命令如下                                                                              | FB-INGRESS-1；同候選 hosted CI、獨立 reviewer、PG 和真實 Meta gate                       |
| token／app／subject／proof                       | exchangeFacebookCode                                                                    | 62 個 Facebook service tests 通過：wrong app、無效 token、user_id、expiry、/me mismatch、無 token、HTTP/network/JSON error；合法 /me 必須帶正確 proof | facebook.test.ts；正式交換＋帳號／JWT，只 stub 外部 fetch                                                                             | 本地 verifier/challenge 和交換契約已驗；不聲稱 Meta 會驗 PKCE                            |
| state／PKCE／link                                | start/callback、linkIdentity                                                            | state/provider/expiry/UUID/額外 verifier/損壞 PKCE/replay 拒絕；explicit link 通過，匿名／換帳號／logout／deleted／他帳號身分拒絕；email 不合併       | Facebook＋既有 Google/LINE/account/OTP 回歸；root JSON                                                                                | persistence 是原 account task memory boundary，不聲稱 PG concurrency 實測                |
| signed_request／刪除結果／格式                   | verifyFacebookSignedRequest、delete/status                                              | 拒絕錯算法、簽章、subject、格式、篡改；唯一身分匿名化＋撤銷、其他身分保留、隔離、冪等、rollback；裸 JSON 格式通過                                     | Facebook service cases；API repository 4 cases 執行正式 SQL（PoolClient stub），exit 0                                                | SQL 已比對 V0109；PG semantics、HTTP form parser、Cloud Run ingress 待 hosted            |
| **FB-INGRESS-1：strict webhook/status 不可達**   | internal-key.middleware.ts:128–138；bootstrap-auth.guard.ts:231–258,374–396             | 基準靜態證據；checkpoint 動態 probe **仍被拒絕**：middleware、guard 各自強制 BFF WIF，Meta 不提供                                                     | strict-ingress.blocker.test.ts，staging/production 2 個 expected-denial probes，exit 0 是重現拒絕，**不是 admission acceptance pass** | 兩個 source 檔不在 write_scopes，已用 active release progress 請 Supervisor 擴充；未擅改 |

## 檢查命令與結果

Node 22.23.2、pnpm 10.33.0、Vitest 4.1.4、TypeScript 5.9.3。
本輪啟動的本機檢查均已結束並讀結果。

```bash
pnpm exec vitest run tests/unit/pax-facebook-login-20261009 tests/unit/pax-oidc-login-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-otp-20261009 --reporter=default --reporter=json --outputFile.json=.local/facebook-regression-results.json
# exit 0: 12 files, 324 tests；包含 2 個 expected-denial blocker probes

pnpm --filter @drts/api exec vitest run tests/unit/facebook-data-deletion.repository.test.ts tests/unit/passenger-oauth-transaction.repository.test.ts tests/unit/passenger-auth-provider-routing.test.ts --reporter=default --reporter=json --outputFile.json=../../.local/facebook-api-results.json
# exit 0: 3 files, 19 tests

pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm typecheck:root
# 各命令 exit 0

pnpm exec eslint apps/api/src/modules/passenger-app/oauth/facebook*.ts apps/api/src/modules/passenger-app/oauth/oauth-provider.config.ts apps/api/src/modules/passenger-app/oauth/passenger-oauth.service.ts apps/api/src/modules/passenger-app/passenger-app.module.ts apps/api/src/common/auth/auth.policy.ts apps/api/tests/unit/facebook-data-deletion.repository.test.ts tests/unit/pax-facebook-login-20261009 --max-warnings=0
# exit 0
git diff --check
# exit 0
```

初次 formatter exit 1：既有 node_modules symlink 指到已刪除 worktree。
僅移除本 task worktree 的 dependency symlink，`pnpm install --frozen-lockfile --ignore-scripts --offline` exit 0 建立隔離依賴，保留 canonical node_modules；`.local/facebook-dependency-links.txt` 記錄。
初次 suite 因 root reflect-metadata import exit 1／0 tests，以及 unused import lint exit 1，已修正並重跑通過。依賴失敗不當作產品重現。

## FB-INGRESS-1 下一修復單元與 scope 請求

依 AI_COLLABORATION_GUIDE.md §0.7：「需要額外檔案時，由 Supervisor 核對平行任務衝突並更新原 task 的 write_scopes」。請納入：

- `apps/api/src/common/auth/internal-key.middleware.ts`：僅 POST `/api/passenger-app/auth/facebook/data-deletion` 與 GET `/api/passenger-app/auth/facebook/data-deletion/status/:code` 的 public ingress 例外。
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`：相同精確路由＋OpenRoute；這兩個自行驗 signed_request／receipt 的入口不再強制 BFF WIF。

修正邊界：不得放行全部 passenger auth 或全部 OpenRoute；一般 OAuth/OTP/me 的 BFF／passenger-session 邊界保留。
必要回歸：正式 middleware＋guard 允許沒有 BFF credential 的 Meta 路由；controller 拒絕偽造 signed_request／receipt 且不存取帳號；錯誤 method、相鄰 child path、一般 OAuth/OTP/me、spoofed Bearer 仍拒絕。
原 expected-denial probes 必須改成 admission＋signature/capability 負向 tests，不能保留它們並聲稱修復完成。

## 部署設定與外部待驗

### 2026-10-10 Supervisor 擴充 scope 後：middleware 修復單元

Supervisor 04:03:16Z 授權修改 middleware／guard，並指定 guard 必須等
PAX-FARE-QUOTE PR #2499 合併、普通 merge `origin/dev` 後才修改。
本輪開始時本機／published branch 均為 `0fc9c622b6796e863fa6925a4bc8846f40706775`，
PR #2503 為 draft，尚無 candidate、review 或退修。04:05Z PR #2499 仍 OPEN。
原 FB-INGRESS-1 分兩層記錄；只修 middleware，guard finding 保留。

| Finding／驗收項                                  | 原始碼依據與修改位置                                                              | 舊版重現 → 修正版結果                                                                                                                                                                                                                  | 命令、退出碼、版本與證據位置                                                                                                                                                                                                                                                                                                        | 未驗項與具體限制                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FB-INGRESS-1 middleware                          | `internal-key.middleware.ts / validateInternalKey, isFacebookDataDeletionRequest` | 上述舊 SHA：新增正式函式 regression 6 fail／3 pass，錯誤 `INTERNAL_KEY_REQUIRED` → middleware 修復版 9／9 pass                                                                                                                         | `pnpm exec vitest run tests/unit/pax-facebook-login-20261009/middleware-ingress.test.ts --reporter=default --reporter=json --outputFile.json=.local/facebook-middleware-before.json` exit 1；修復後 Facebook＋原 middleware suite 87 tests exit 0，`.local/facebook-middleware-after.{json,log}`；新版本為此修復紀錄所在 checkpoint | 不聲稱完整 ingress 可達；guard 尚未修                                             |
| HMAC／receipt 邊界                               | 同上 matcher＋正式 `FacebookDataDeletionController / delete,status`＋service      | staging／production／development（有設定 key、enforced=true）精確 POST／GET 與 query 可達；偽造 signed_request 在 transaction 前拒絕；合法回呼取得可驗 receipt、偽造 receipt 拒絕；錯 method／child／prefix／其他 passenger 路徑仍拒絕 | 上述新 regression，外部帳號 persistence 用既有 `MemoryPassengerStore` stub；未 mock middleware、controller、HMAC 或 receipt 邏輯                                                                                                                                                                                                    | 未測 HTTP parser、PG、Cloud Run／真實 Meta                                        |
| FB-INGRESS-1 guard                               | `bootstrap-auth.guard.ts / activatePassenger`                                     | middleware 已可達，但 staging／production guard expected-denial probe 仍拒絕                                                                                                                                                           | 原 `strict-ingress.blocker.test.ts` 改為 middleware admission＋guard expected-denial；2 pass 是拒絕重現，不是 acceptance                                                                                                                                                                                                            | 等 PR #2499 合併，再普通 merge、修改 guard、替換 blocker probes 為 admission 回歸 |
| pax-facebook_flow_verification_and_data_deletion | 原 acceptance 全部保留                                                            | middleware 部分已修；整項尚未滿足                                                                                                                                                                                                      | 本輪 scoped pass 不取代同 candidate CI／review                                                                                                                                                                                                                                                                                      | guard、同 SHA CI、Codex2 review／merge／acceptance 仍待完成                       |

本輪依賴工具初次 exit 1：dispatch 重建的 node_modules symlink 指向 canonical root，
其 Vitest symlink 又指向已刪除的另一 worker worktree，0 tests。只移除本 task
worktree 的 22 個 dependency symlink，offline frozen-lockfile install exit 0；
`.local/facebook-dependency-links-current.txt` 與 `.local/facebook-install.log` 記錄。
canonical dependencies 未修改。此工具失敗不計為產品重現。

設定 `FACEBOOK_DATA_DELETION_STATUS_ORIGIN` 為真正可公開到達的 HTTPS **API origin**（不含 path/query/credentials）；缺少／不合法時在 DB 寫入前回 503。
不能把只有 BFF 的 ride origin 當成已存在 API proxy。ID/secret 仍按 SD 啟用 login；status origin 是 webhook 部署設定，無假預設。

完成收據只在 transaction commit 後簽發：隨機 nonce＋domain-separated HMAC，不含 user_id／帳號資訊，新 process 能驗。
重送產生新收據；completed 指該次刪除已完成，不查使用者未來是否重註冊。
更換／移除 app secret 後舊收據無法驗證，需在實際部署／rotation 流程規劃。

Graph 固定 v24.0；真實 App、Graph/PKCE 支援情形仍須外部 gate 核實。
官方參考：[deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)、[manual code flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)、[Graph proof](https://developers.facebook.com/docs/graph-api/securing-requests/)。
此次官方文件回 429／不可讀，未用次級資料冒充 Meta 驗收。

CI、獨立 review、merge、acceptance：未完成。
PR 若建立為 draft，只供 scope coordination，未鎖候選。
入口修复後才用實際完整 HEAD handoff 給 Codex2。
未部署、未啟動 VM runtime／PG／browser／Docker，未呼叫真實 Meta endpoint。
