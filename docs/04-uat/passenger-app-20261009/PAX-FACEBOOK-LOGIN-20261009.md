# PAX-FACEBOOK-LOGIN-20261009

Owner: Codex · Reviewer: Codex2

最新狀態（2026-10-10 guard 修復輪）：FB-INGRESS-1 的 middleware 與 guard
兩層均已完成本機正式函式回歸；下方前輪「未解」及 expected-denial 記錄保留作歷史。
最新證據見本文末段。整項 acceptance 尚待同 candidate hosted CI、Codex2 review、
merge 與指定 acceptance evidence；本機 pass 不等於 PG／HTTP／真實 Meta 通過。

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

修復 checkpoint `8479accc8964b680fd19ae174a3d9a37d1833d73` 已普通 push，
PR #2503 head 核對一致。本輪必要本機 checks 已全部結束並讀取結果：

```bash
pnpm exec vitest run tests/unit/pax-facebook-login-20261009 tests/unit/pax-oidc-login-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-otp-20261009 tests/unit/internal-key.middleware.test.ts tests/unit/bootstrap-auth-guard-strict-env.test.ts tests/unit/system-remediation/sr-proof-001/proof-download-auth.test.ts --reporter=default --reporter=json --outputFile.json=.local/facebook-regression-current.json
# exit 0: 16 files / 372 tests；含 2 個 guard expected-denial probes（未修）
pnpm --filter @drts/api exec vitest run tests/unit/facebook-data-deletion.repository.test.ts tests/unit/passenger-oauth-transaction.repository.test.ts tests/unit/passenger-auth-provider-routing.test.ts --reporter=default --reporter=json --outputFile.json=../../.local/facebook-api-current.json
# exit 0: 3 files / 19 tests；正式 repository 執行，PG transport stub
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm typecheck:root
# 各命令 exit 0
pnpm exec eslint apps/api/src/common/auth/internal-key.middleware.ts apps/api/src/modules/passenger-app/oauth/facebook*.ts apps/api/src/modules/passenger-app/oauth/oauth-provider.config.ts apps/api/src/modules/passenger-app/oauth/passenger-oauth.service.ts apps/api/src/modules/passenger-app/passenger-app.module.ts apps/api/src/common/auth/auth.policy.ts apps/api/tests/unit/facebook-data-deletion.repository.test.ts tests/unit/pax-facebook-login-20261009 --max-warnings=0
# exit 0
git diff --check
# exit 0
```

依賴與執行版本：Node 22.23.2、pnpm 10.33.0、Vitest 4.1.4。
04:08Z PR #2499 仍 OPEN／mergeCommit=null，不提前改 guard、不鎖 candidate。
draft checkpoint 的 hosted CI 尚有 smoke/e2e pending；ci-integ 的 product jobs 為
SKIPPED，不能當作 required acceptance pass。guard 修復後的新 SHA 仍須重新讀 CI、
普通 push 並 handoff 給 Codex2。

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

## 2026-10-10：dependency 合併後的 guard 修復與交審證據

本輪讀完整原 artifact、正式 SD §2–4、controller metadata、middleware／guard
與 account、OTP、fare guard callers。live GitHub 核對 #2499 於 04:12:44Z 合併，
merge SHA `7991c0e01c6a3778bcc69a28bad0fc2d506499e9`；遵守 Supervisor 指示，
先普通 merge `origin/dev`（無衝突），再修改 guard，保留 published history。
此前 #2503 仍為 draft checkpoint，未有 review candidate 或獨立退修。

修復只在 `BootstrapAuthGuard.activatePassenger` 清除 identity 之後，要求
OpenRoute metadata **且**正式 `isFacebookDataDeletionRequest(method, originalUrl ?? url)`
精確匹配，才放行到 controller 的 signed_request／receipt HMAC 驗證。
不從此入口的 Bearer 授予乘客 identity；bootstrap identity headers 仍先拒絕。
Google/LINE/Facebook OAuth、OTP、account、fare 和 geo 的原驗證路徑保持既有行為。
原 `strict-ingress.blocker.test.ts` 已移除，改用真正 admission 的
`guard-ingress.test.ts`，不再用 expected-denial 充作入口通過。

| Finding／驗收項                                                               | 原始碼依據與修改位置                                                                                                                  | 舊版重現 → 修正版結果                                                                                                                                                                                                                                                                                     | 命令、退出碼、版本與證據位置                                                                                                                                                                     | 未驗項與具體限制                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FB-INGRESS-1 guard                                                            | `bootstrap-auth.guard.ts / canActivate → activatePassenger`；共用 `isFacebookDataDeletionRequest`；正式 controller OpenRoute metadata | 舊產品碼＋最終 probe checkpoint `731620876d7dcde9c1745973feab5334606aac56`：6 fail／12 pass，合法 POST/GET 因 `INTERNAL_KEY_REQUIRED` 被擋 → 修復 checkpoint `64df0362a38072c65fd7f963f16cc5c7dc746307`：18／18 pass                                                                                      | 下方 guard 命令 exit 1 → exit 0；`.local/facebook-guard-20261010/before.{sha,json,log}` 與 `after.{sha,json,log}`；Node 22.23.2、pnpm 10.33.0、Vitest 4.1.4                                      | 直接執行正式 middleware、guard、controller、service，未測 HTTP server/parser、Cloud Run ingress                                                                                                     |
| FB-INGRESS-1 middleware／安全拒絕回歸                                         | 原 middleware matcher；guard OpenRoute 邊界、正式 signed_request／receipt HMAC                                                        | staging、production、development（internal key enforced）合法 POST/GET 與 query 通過；錯 method、child/trailing path、receipt 格式、缺 OpenRoute、bootstrap header、相鄰 OAuth/OTP/me、相鄰路由 spoofed Bearer 均拒絕；偽造 signed_request 在 transaction 前拒絕，合法回呼產生可驗收據、偽造 receipt 拒絕 | 18 guard＋9 middleware tests 包含於 root regression，exit 0；`.local/facebook-guard-20261010/regression.{json,log}`                                                                              | account persistence 為既有 MemoryPassengerStore；HMAC、matcher、guard、controller 未 mock。多重 API prefix 的拒絕由 middleware suite 驗證，未將不存在的 router path 假接到 controller 作 guard 驗收 |
| token／app／subject／proof、state／PKCE／link、signed_request／刪除結果／格式 | 原 Facebook adapter/service、OAuth transaction、account repository 與 API controller                                                  | 原 Facebook 正負向及 Google/LINE/account/OTP 回歸全部通過；原 middleware 和共用 auth/geo/fare regression 通過                                                                                                                                                                                             | root 17 files：476 passed、2 skipped；API 4 files：120 passed；兩者 exit 0，`.local/facebook-guard-20261010/{regression,api}.{json,log}`                                                         | root 的 2 skips 是既有 fare/geo 僅 strict 環境的案例在 development 略過，同案例 staging/production 通過；不算 Facebook skip。API 正式 SQL 使用 PoolClient stub，未宣稱 PG concurrency 通過          |
| pax-facebook_flow_verification_and_data_deletion                              | 上述全部 finding＋原 acceptance 要求                                                                                                  | 本機 implementation 與受影響回歸已通過；整項尚未滿足                                                                                                                                                                                                                                                      | PR #2503 的最終 candidate 以 active release handoff 的完整 SHA 為準；本 artifact 所在 closeout commit 僅附加證據，產品碼／測試與最終本機檢查版本 `f97f538219518b2f14e176077084b52a36053bb8` 相同 | 同 SHA hosted CI、Codex2 獨立 review、merge／record-acceptance 待 lifecycle；真實 Meta App、provider-side PKCE、HTTP form parser、PG、公開 HTTPS API origin 的 hosted 驗證仍待外部環境              |

本輪工具啟動失敗單列：Vitest dependency symlink 再次失效，首次 0 tests；只移除
本 task worktree 的 node_modules symlinks，offline frozen-lockfile install exit 0。
第一次 cleanup 因重複 root path 報 FileNotFoundError，去重後完成；canonical dependencies
未修改，證據 `.local/facebook-guard-20261010/{dependency-links.txt,install.log}`。
第一版 probe 將不存在的 `/api//api/...` 假接 OpenRoute handler，導致 3 個 fixture assertion
失敗；移除該 guard fixture（middleware 已覆蓋此錯 prefix）後才記錄可追溯的 6 fail／12 pass。
這些工具／fixture 失敗不計作產品缺陷重現。

```bash
pnpm exec vitest run tests/unit/pax-facebook-login-20261009/guard-ingress.test.ts --reporter=default --reporter=json --outputFile.json=.local/facebook-guard-20261010/before.json
# 舊碼 exit 1：6 fail／12 pass；修復後相同案例、outputFile=after.json，exit 0：18 pass

pnpm exec vitest run tests/unit/pax-facebook-login-20261009 tests/unit/pax-oidc-login-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-otp-20261009 tests/unit/pax-fare-quote-20261009/geo-realm.test.ts tests/unit/internal-key.middleware.test.ts tests/unit/bootstrap-auth-guard-strict-env.test.ts tests/unit/system-remediation/sr-proof-001/proof-download-auth.test.ts --reporter=default --reporter=json --outputFile.json=.local/facebook-guard-20261010/regression.json
# exit 0：476 pass／2 既有 skips

pnpm --filter @drts/api exec vitest run tests/unit/facebook-data-deletion.repository.test.ts tests/unit/passenger-oauth-transaction.repository.test.ts tests/unit/passenger-auth-provider-routing.test.ts tests/unit/auth-bootstrap.test.ts --reporter=default --reporter=json --outputFile.json=../../.local/facebook-guard-20261010/api.json
# exit 0：120 pass

pnpm exec eslint apps/api/src/common/auth/bootstrap-auth.guard.ts apps/api/src/common/auth/internal-key.middleware.ts apps/api/src/modules/passenger-app/oauth/facebook*.ts apps/api/src/modules/passenger-app/oauth/oauth-provider.config.ts apps/api/src/modules/passenger-app/oauth/passenger-oauth.service.ts apps/api/src/modules/passenger-app/passenger-app.module.ts apps/api/src/common/auth/auth.policy.ts apps/api/tests/unit/facebook-data-deletion.repository.test.ts tests/unit/pax-facebook-login-20261009 --max-warnings=0
# exit 0，.local/facebook-guard-20261010/lint.log
```

最後 typecheck 首次 exit 2：新 probe 的 closed fixture 展開 `never`，TS2698。
只改成明確建立 `switchToHttp`，未改測試情境／產品碼，checkpoint
`f97f538219518b2f14e176077084b52a36053bb8` 重跑 guard 18 pass、scoped lint、
Prettier、root typecheck、diff check 全部 exit 0，均已結束並讀結果。
Contracts build、control-plane-auth build、API typecheck 在此前修復 checkpoint
`64df0362a38072c65fd7f963f16cc5c7dc746307` 各自 exit 0；後續僅修改 root test fixture
與本 artifact，未影響 API/source。未為純證據文件更動重跑整套測試。

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
# 各 exit 0
pnpm typecheck:root
# 首次 exit 2 (TS2698)，修 fixture 後 exit 0：.local/facebook-guard-20261010/root-typecheck.log
pnpm exec vitest run tests/unit/pax-facebook-login-20261009/guard-ingress.test.ts --reporter=default --reporter=json --outputFile.json=.local/facebook-guard-20261010/final-guard.json
# exit 0：18 pass，final-guard.{json,log}、final-verification.sha
pnpm exec eslint tests/unit/pax-facebook-login-20261009/guard-ingress.test.ts --max-warnings=0
pnpm exec prettier --check apps/api/src/common/auth/bootstrap-auth.guard.ts tests/unit/pax-facebook-login-20261009/guard-ingress.test.ts docs/04-uat/passenger-app-20261009/PAX-FACEBOOK-LOGIN-20261009.md
git diff --check
# 各 exit 0
```

已讀前輪 hosted checkpoint run `38023023954` 最終結果：cancelled（舊 head
`30b7ed74be6ff9973f37f633548fe1a8f4af4b6c`，Product smoke cancelled、aggregate failure）。
同舊 head 的 run `38023023986` product jobs SKIPPED；兩者都不是新 candidate CI
或 acceptance。最終普通 push 後，以 local／remote branch／PR head 一致的完整 SHA
handoff Codex2；交接觸發的 hosted checks 可列 pending，由 GitHub bus／reviewer
收錄並讀取同 SHA 結果，不以舊綠燈、skip 或本機 scoped pass 代替。

本轮無背景本機檢查、未啟 VM runtime、未部署、未呼叫真實 Meta。

## 2026-10-10：FB-SESSION-RACE-1 最小回歸與 scope 協調 checkpoint

本次續修讀過 Codex2 的完整退修
`/home/lupin/workspace/drts-fleet-platform/.local/review-pax-facebook-c98fee7702e7/review.md`
及其正式 service/JWT probe（SHA256
`11ce146694b84009538f23305a516c194a561e233a394665a0877f7666e675e9`）。
退修 candidate 是 `c98fee7702e738e4fec2ea43279705cf84f0dbb4`，generation
`383dbe9b67be465db0ab3eb4721cc249`，PR #2503。fetch 後 local、remote task
branch 和 PR head 一致；沒有 rebase/reset/amend/force push 或 merge 新 trunk。

精確呼叫鏈：`PassengerOAuthService.callback` 的
`findOrCreateByIdentity(provider, claims.sub)` 已 commit，接著
`PassengerAccountService.issueSession(account.drtsPassengerId)` 尚未開始。
`FacebookDataDeletionService.delete` 此時能移除 Facebook identity 並
`revokeAll`；若帳號仍有 Email/Google identity，帳號維持 active。
後續 `issueSession` 僅檢查 active，因而在刪除 commit 後寫入新的有效 session。

本 checkpoint **只新增測試與本文件，尚未修產品碼，也不是交審候選**。
`facebook.test.ts` 新增四個案例，以 instance wrapper 暫停後再呼叫原始
`issueSession`，控制 transaction 的先後順序。Graph transport 與既有
MemoryPassengerStore 是 stub；OAuth/state、account/session、JWT 驗證、
signed_request、刪除與 receipt 都執行正式函式。兩個失敗案例明確驗證：
receipt completed、Facebook identity 不存在、舊 session 無效，但新 callback
session 的 `authenticateAccessToken` 仍回傳 passenger identity。
這是正式 service 的 transaction 順序重現，不是 live PG concurrency 驗收。

| Finding／驗收項                                  | 原始碼依據與修改位置                                                                         | 舊版重現 → 本 checkpoint 結果                                                                                                     | 命令、退出碼、版本與證據位置                                                                      | 未驗項與具體限制                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| FB-SESSION-RACE-1：delete 先 commit              | OAuth `callback` → account `findOrCreateByIdentity`／`issueSession`；新增 `facebook.test.ts` | 原產品碼 c98fee7702e7＋新增回歸：Email／Google 保留帳號的 2 cases FAIL（新 access 可用）；唯一 Facebook case PASS；修正版尚未建立 | 下方命令 exit 1：64 pass／2 fail；`.local/facebook-session-race-20261010/before-final.{json,log}` | account service 不在原 task write_scopes，等待 Supervisor 核對平行修改並擴充 scope；PG 待 hosted 正式 schema/repository 驗證 |
| FB-SESSION-RACE-1：issue 先 commit               | 原始 `issueSession` commit 後 gate callback return，正式 deletion `revokeAll`                | 新 case PASS：新／舊 access 失效，新 refresh invalid_grant；包含於上述 64 pass                                                    | 同一命令／JSON／log，沒有 mock issuance 或 revocation                                             | 不是修復 delete-first race 的證据                                                                                            |
| FB-INGRESS-1／既有 Facebook 正負向               | 原 guard/middleware 修復保留；本輪 Facebook service suite 62 個既有 cases                    | 既有 Facebook service cases PASS；guard/middleware 本輪未重跑，前候選 Codex2 已確認消除                                           | 前節 UAT 與上述 reviewer artifact，未冒充本輪完整回歸                                             | 待原子化產品修復後重跑 Google/LINE/link/logout、account/OTP/auth/ingress 完整受影響回歸                                      |
| pax-facebook_flow_verification_and_data_deletion | 上述 findings、獨立 review、同 SHA CI／merge／acceptance                                     | **仍未滿足**：FB-SESSION-RACE-1 未修；此 checkpoint 不 handoff                                                                    | 用 active release CLI progress 記錄 scope 協調，checkpoint 普通 push 只供恢復及定位               | 真實 Meta、PG、HTTP parser、公開 Cloud Run、同候選 CI/review/merge/acceptance 仍待驗，不降原要求                             |

```bash
pnpm exec vitest run tests/unit/pax-facebook-login-20261009/facebook.test.ts --reporter=default --reporter=json --outputFile.json=.local/facebook-session-race-20261010/before-final.json
# exit 1：64 pass／2 fail，已結束並讀取結果；Node 22.23.2、pnpm 10.33.0、Vitest 4.1.4
```

最終 regression 檔案 SHA256：
`5470e67974a2570648561fe1be3c7435b2e8ef12cd097645e197acb57bd652fd`。
初版 `before.{json,log}` 同樣 64 pass／2 fail；最終版增加實際 access 驗證，
沒有改產品碼、fixture provider proof 或 transaction 的實際工作。

修正邊界已用 task progress 向 Supervisor 記錄：加入
`apps/api/src/modules/passenger-app/account/passenger-account.service.ts`
至原 task write_scopes。由原 owner 增加 `issueSession` 的 optional verified
identity binding，與 session 寫入在**同一 transaction**依 identity → account
鎖定並驗證 provider/subject/account ownership；OAuth callback 帶入 binding。
不以另一個 transaction 的 precheck 代替，不改 repository/schema，不修改
既有 OTP callers 的契約。所有共用 callers 已搜尋；原子化修復後還需兩種
commit 順序、唯一 Facebook 刪除、保留 Email/Google 新登入及 Google/LINE/link/logout
完整回歸。scope 更新前不修改越界檔案，不另造 OAuth 的 session/JWT 邏輯。

本輪未啟動 VM 產品服務、PG、HTTP/browser server、Docker 或部署，未呼叫真實 Meta。

本次 regression anchor `9442adbed162b5871bd2cd3c715180ed208f95ac` 已普通 push，
local／remote／PR #2503 head 核對一致，worktree clean。後續 evidence commit
只附加以下 check 結果，沒有改產品碼或回歸內容。

```bash
pnpm exec eslint tests/unit/pax-facebook-login-20261009/facebook.test.ts --max-warnings=0
# exit 0；.local/facebook-session-race-20261010/lint.log
pnpm exec prettier --check tests/unit/pax-facebook-login-20261009/facebook.test.ts docs/04-uat/passenger-app-20261009/PAX-FACEBOOK-LOGIN-20261009.md
git diff --check
# 各 exit 0
pnpm typecheck:root
# exit 2；.local/facebook-session-race-20261010/root-typecheck.log
```

root typecheck 未通過，完整輸出已讀：`fleet-partner-list-envelope.test.ts` 與
`sr-admin-verify-001/fleet-lists.test.ts` 的 ApiClient private `requestEnvelope`
同時來自本 worktree 與 `auto/gemini-pax-booking-history-20261009`，導致
TS2345／never intersection。現有 node_modules 連至 canonical dependencies；
未修改共享 dependencies 或越界修其他 task。輸出沒有 Facebook 測試診斷，
但不能將此工具解析問題說成 typecheck pass；修復時需隔離 dependencies 後重驗。
本輪所有已啟動的檢查已結束，沒有背景本機工作。

scope 協調仍待 Supervisor：本輪 task slice 的 write_scopes 未包含 account
service。依協作規範 §0.7，先由 Supervisor 核對並更新原 task scope，再由
原 owner 實修；保留 in_progress 與此可重跑回歸，不將品質退修當成 quota
問題，不 handoff 未修的候選、不要求使用者再次授權。
