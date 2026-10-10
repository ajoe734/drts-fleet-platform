# PAX-WEB-DEPLOY-20261009 — owner 修復與驗證紀錄

Owner: Codex2；指定 reviewer: Codex。2026-10-10。

## 本輪修復（Supervisor 04:52:06Z scope 決議後）

本輪 repository 實作與檢查已完成；同 SHA hosted CI、獨立 review、merge 和
required acceptance 仍由 candidate lifecycle 收錄。未宣稱 dev 已上線。
PR：[2507](https://github.com/ajoe734/drts-fleet-platform/pull/2507)，base `dev`，
branch `codex2/pax-web-deploy-20261009`。最終 candidate 是加入本成果紀錄後的
PR head；完整 SHA 由 PR、handoff machine truth 和
`.local/pax-web-deploy-20261009/candidate-ci.json` 追溯，不能用 merge SHA 代替。

- Supervisor 已將兩 cleanup helper 和四 legacy tests 加入原 task scopes。
  helper 只新增 active `drts-dev-passenger-app-web`、9→10 描述；action、exact
  inventory、optional scanner、paused targets 和拒絕演算法保留。
- F2 依 Supervisor 決議：smoke 改驗現有 `/`、`/login`，200 + candidate SHA，
  拒絕 redirect；`/fares` 由 BOOKING-UI 提供，PAX-QA 合併後補 smoke/matrix。
- F3：目前 shell 沒有 cookie crypto key 讀取端，移除 optional cookie slot、
  metadata query 與 API/BFF 掛載；BFF 一律 `--clear-secrets`。支付 token 名稱
  依 SD §4 使用 `PSP_TOKEN_ENCRYPTION_KEY_NAME`，PAYMENT-CORE 對齊讀取端。
  輸出改為 `*_mounts_complete`，只記錄 metadata，不宣稱 SMS/PSP 功能可用。
- 本輪重新唯讀確認 live `DEV_GCP_*`：`drts-dev-devcc-20260825` / `us-central1`。
  未設定 passenger variable 時沿用正式 exact guard default。未查 secret list/value。
- 修復 commits：inventory `9edb9699f`、workflow `004642296`；最後 source
  首次整體 regression source `915d356c5f8e2c688410e2a83aba39fac5e2868b` 包含執行下列驗證時的完全相同
  source/formatting。F5 後最新 source 為 `00824068ccece322b968e2f82b8090744ea39b3c`；
  其後候選僅新增本成果紀錄。所有 anchors 普通 push，
  無 rebase/amend/force-push/stash，無 VM runtime/browser/Compose。

| Finding／驗收項                                           | 正式呼叫路徑與修復                                                                                                                    | 舊版 → 修正版證據                                                                                                                                                                                                                                                                    | 命令／版本／退出碼與 evidence                                                                                                                                                                                                                                               | 未驗項／限制                                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1：十服務被拒絕；新服務 missing 時舊 helper 反而允許刪除 | paused cleanup `active_services`、retired cleanup `intended_services`，由 workflow 正式呼叫                                           | 舊 `d724fba9` helper + 本輪十服務 fixtures：29 PASS / 12 FAIL / 0 SKIP；`9edb9699f` 同 fixtures 41/41 PASS                                                                                                                                                                           | `pnpm exec vitest run tests/unit/cleanup-paused-partner-booking-service.test.ts tests/unit/cleanup-retired-dev-service.test.ts --reporter=json --outputFile=...`，before exit 1／after exit 0；Node 22.23.2、Vitest 4.1.4；`.local/.../{before,after}-inventory.{json,log}` | gcloud list/delete 為 stub，正式 helper 演算法未 mock；包含合法十服務、scanner optional、每個 missing/new missing、rogue、paused absent、retired absent/none、限定 delete target。未真正刪除 |
| F1a：broad passenger exclusions／固定九服務               | dev-active-surface、cloud-run-deploy-retry、兩 cleanup tests                                                                          | 前輪57 PASS / 4 FAIL；本輪只禁止 retired passenger-web，承認新 passenger-app-web/ride/十個 wrapper；完整142-case regression PASS                                                                                                                                                     | 下方 final-regression exit 0；source `915d356c5f8e2c688410e2a83aba39fac5e2868b`；`.local/.../final-regression.json`                                                                                                                                                         | 原九服務 runtime matrix 保留，PAX-QA 增補；未宣稱新 UI E2E                                                                                                                                   |
| F2：`/fares` 尚無正式 route                               | Verify passenger app endpoints、summary、runbook、entry index                                                                         | 舊要求與 shell 不合；依 Supervisor 改 `/ /login`；正式 smoke script 的200+SHA正向及302/404/錯SHA拒絕 PASS                                                                                                                                                                            | final-regression exit 0，同source；curl外部邊界 stub，script未 mock                                                                                                                                                                                                         | 未實測HTTP；`/fares` 留給 BOOKING-UI→QA，沒有拿JSON/redirect冒充頁面                                                                                                                         |
| F3：未使用cookie key／metadata不代表provider可用          | optional secret mounts、Deploy passenger-app、SD §4 PSP token slot                                                                    | 移除cookie group/query/mount；全有或缺任一項的group、pepper去重 PASS；API正式 deploy wrapper 的 absent/partial/complete消耗 PASS                                                                                                                                                     | 41 passenger executable contracts，包含wrapper→mock gcloud flags；final-regression exit 0，同source                                                                                                                                                                         | 不驗真實key bytes/provider；SMS/PSP外部gate；無 configured=true 的功能可用宣稱                                                                                                               |
| F4：artifact-provider CI合約固定舊set-secrets參數         | tools/ci/test_dev_artifact_providers.py `test_workflow_wires_outputs_into_existing_api_arguments_only`；Deploy api secret composition | `d724fba9` hosted [38025423411](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38025423411)、[38025423334](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38025423334) 同處FAIL；本輪單案例重現FAIL，再核對core refs+optional concat+最終flags，39/39 PASS | before single-test exit 1／after suite exit 0；Python3；`.local/.../{before,after}-artifact-contract.log`；整體Python100/100 PASS                                                                                                                                           | 只更新既有workflow contract，artifact env/secret suffix與core refs保留；最終候選hosted CI另讀                                                                                                |
| pax-web-deploy_workflow_and_secret_gating                 | Dockerfile、prepare/build/deploy/health scripts、正式helpers及contracts                                                               | 41 passenger executable + 36 domain-helper + legacy regressions，共142 PASS / 0 FAIL / 0 SKIP；Python100 PASS                                                                                                                                                                        | final-regression/final-python exit0；source同上；candidate CI以PR checks、handoff及`.local/.../candidate-ci.json`追溯                                                                                                                                                       | Docker build/Cloud Run deploy由immutable publish流程執行；未部署。獨立review、merge、acceptance不由owner宣告                                                                                 |
| pax-web-deploy_domain_mapping_and_runbook                 | domain-mappings-dev、正式map-domain-service.sh、runbook§1–4.2、entry index                                                            | absent→create / correct→skip / retired→refuse PASS；既有helper36/36；DNS `ride CNAME ghs.googlehosted.com.` TTL300、三callbacks已核對                                                                                                                                                | final-regression exit0；actionlint1.7.12 exit0（shellcheck/pyflakes未啟用）；Prettier/classification exit0                                                                                                                                                                  | 無Cloud Run URL/run evidence、live mapping/DNS/TLS/OAuth登入；使用者/operator交付DNS/provider                                                                                                |

### F5：同 SHA hosted CI 的 root typecheck 退回與修復

`5c685e92c73ce9d7420af4f8d565248d8caf0cfa` 的 hosted
[CI 38026168064](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38026168064)
在 root typecheck 失敗，未轉正式／未 handoff。失敗來源為新增測試的
`result.outputs.api.match(...)`；`Object.fromEntries` 型別在 strict root
tsconfig 下可能 undefined。隨後缺 `unit-test-results.json` 是前置檢查失敗
的結果，不能把未執行的 unit/PG gates 視為 PASS。

| Finding／驗收項                               | 正式原始碼與修復                                                                                                                    | 舊版 → 修正版                                                                                                                                     | 命令／版本／evidence                                                                                                                                                                                                               | 未驗項                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| F5／pax-web-deploy_workflow_and_secret_gating | deployment-contract.test.ts 的 shared pepper dedup assertion；改 `api?.match(...)`，仍要求一個 match，undefined 仍會 fail assertion | 本機原 SHA 同錯誤 exit2；source `00824068ccece322b968e2f82b8090744ea39b3c` root typecheck exit0；142回歸 PASS，0 FAIL/SKIP；ESLint/Prettier exit0 | `pnpm typecheck:root`；`.local/.../{before,after}-root-typecheck.log`；Node22.23.2 / TypeScript5.9.3；`.local/.../final-regression-root-fix.json`、root-fix-lint.log、root-fix-prettier.log；hosted failed log/candidate JSON 已讀 | 新候選同 SHA hosted CI 仍需讀完；未改 product/workflow 行為，App typecheck 不能代替 root typecheck |

F5 後重跑下列八檔完整 regression 命令，outputFile 改為
`.local/pax-web-deploy-20261009/final-regression-root-fix.json`，exit0、142 PASS。
另 `pnpm typecheck:root` exit0，測試 ESLint／Prettier exit0，所有啟動檢查
已結束並讀過。Python100與App lint/typecheck所依據檔案無變更，沿用先前結果。

### 本輪已讀檢查

下列檢查均結束且讀過結果；evidence 在本 isolated worktree 的
`.local/pax-web-deploy-20261009/`，不是canonical runtime或外部驗收。

```bash
pnpm exec vitest run tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts \
  tests/unit/map-domain-service.test.ts tests/unit/dev-active-surface-contract.test.ts \
  tests/unit/cloud-run-deploy-retry.test.ts \
  tests/unit/cleanup-paused-partner-booking-service.test.ts \
  tests/unit/cleanup-retired-dev-service.test.ts \
  tests/unit/deploy-dev-google-oidc.test.ts tests/unit/deployment-architecture-guards.test.ts \
  --reporter=json --outputFile=.local/pax-web-deploy-20261009/final-regression.json
# exit 0；142 PASS / 0 FAIL / 0 SKIP

python3 -m unittest tools/ci/test_dev_artifact_providers.py \
  tools/ci/test_dev_cloud_metadata_preflight.py tools/ci/test_workflow_timeouts.py \
  tools/ci/test_classify_change_scope.py
# exit 0；100 PASS；final-python.log

pnpm --filter @drts/passenger-app-web typecheck
pnpm --filter @drts/passenger-app-web lint
pnpm exec eslint tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts \
  tests/unit/dev-active-surface-contract.test.ts tests/unit/cloud-run-deploy-retry.test.ts \
  tests/unit/cleanup-paused-partner-booking-service.test.ts \
  tests/unit/cleanup-retired-dev-service.test.ts --max-warnings=0
pnpm classification:check
# 全部 exit 0；classification validated 6215 files

.local/pax-web-deploy-20261009/actionlint -shellcheck= -pyflakes= \
  .github/workflows/deploy-dev.yml .github/workflows/domain-mappings-dev.yml
# exit 0；actionlint1.7.12；actionlint.log
```

本輪一次 `MODULE_NOT_FOUND` 是舊依賴symlink失效，未算PASS；首次offline
install需非互動CI設定，以 `CI=true pnpm install --frozen-lockfile --ignore-scripts --offline`
修復exit0後完整重跑；未改lockfile，未把環境錯誤冒充defect重現。

### 候選交接條件與外部待驗

先核對本機/遠端/PR head相同，讀完該SHA CI結果，再ready PR並以
`CANDIDATE_SHA=$(git rev-parse HEAD)`、`CANDIDATE_BRANCH=$(git branch --show-current)`
透過現行release `ai-status.sh handoff ... Codex ...` 鎖候選。
ready-for-review新啟動的full CI也讀完，不把draft `ci-integ` aggregate當完整
檢查通過。run/job/results保存在PR、`.local/.../candidate-ci.json`與handoff引用。

新服務上線由publish流程hosted build/deploy，再由operator執行mapping、
使用者設定DNS/provider console；需source SHA、run/job/artifact、Cloud Run
URL、HTTP/SHA、DNS/TLS evidence才能聲稱dev上線。舊project歷史結果不算
本輪驗收。本task未執行部署、讀取secret value、建立帳號、真實SMS/PSP/OAuth
呼叫，未自行merge/done。

## 前輪 checkpoint 歷史（d724fba9；以下保留當時未解 findings，非目前狀態）

目前是 **checkpoint，尚未完成實作或 handoff**。部署 workflow 與新服務設定
已寫入，但原 write scopes 未包含兩個正式 inventory helper 和四個既有
contract test；原 inventory 會拒絕第十個服務。不得把 scoped tests 的通過
解讀為 deploy、整體 CI 或產品驗收通過。

## 依據與版本

- 讀取 `AI_COLLABORATION_GUIDE.md` §0.7、`AGENTS.md`、branch-strategy §11、
  worker-anchor-commit、candidate-lifecycle，以及指定 `.local` common/task spec。
- 產品依據：`docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md`
  §1、§4、§6；`02_content_and_rules.md`。沒有修改 UI、token 或 canvas。
- 基準／shell 合入 commit：`e07c0b95110706f32ff78c85ad6a1e30ec4b1d5d`。
- 初次 workflow checkpoint：`6b4e7ec06a3efab8bb457ee2886888980b63f855`。
- Docker／文件／初版 contracts checkpoint：`5dc31402be2ee2ddae4b3655372c7a33cd85afb8`。
- 最後 executable contracts checkpoint：`d873687488dc9aa7bc446abb9cfa48996b192010`。
  本紀錄後續的 docs-only checkpoint 不是 review candidate。
- 工作分支：`codex2/pax-web-deploy-20261009`。全部 checkpoint 普通 push；
  沒有 rebase、amend、force push、stash 或 canonical-root 切分支。
- `gh variable list --json name,value` 唯讀輸出確認 live target
  `DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`、`DEV_GCP_REGION=us-central1`。
  尚無 `DEV_GCP_PASSENGER_APP_SERVICE`，workflow 使用經 guard 驗證的 default。
  沒有查 secret list／value，也沒有建立外部帳號或 secret。

## 已實作範圍

- `apps/passenger-app-web/Dockerfile`：Node 22 / pnpm 10.33.0 multi-stage，
  build candidate SHA、contracts/ui/passenger-client build、standalone server、
  static/public copy，port 3009，`HOSTNAME=0.0.0.0`。
- `next.config.ts` 已由 shell 提供 `output: "standalone"`、tracing root、
  candidate header，故不重寫。`repo-classification.json` 的 active rules
  與 activeDeployables 也已登記新 App，沒有重複修改。
- deploy-dev：新 service config/default/exact target guard、immutable image
  查重與 build/push、專屬 BFF env/deploy、private-by-default IAM 與公開 binding
  撤除、readiness/URL/ID-token smoke、200 與 candidate header 檢查、summary。
  舊 passenger-web 的 cleanup action／retired URL acceptance 保留。
- passenger optional metadata gates：Google、LINE、Facebook、OTP pepper、SMS、
  PSP+token key、cookie；缺任一項時整組不掛載且 exit 0。API reference 去重，
  BFF 只可拿 optional cookie slot，沒有 OAuth/PSP credentials 或 NEXT_PUBLIC
  secrets。舊 tenant OIDC／SMTP／Maps 配置政策未放寬。
- API full callback allowlist：custom domain 三條固定完整 URL，加上由正式
  service metadata 發現的 Cloud Run URL 三條；新服務尚不存在時僅 custom
  URLs，後續重跑同一 immutable publish reference 補 default callbacks。
- domain workflow：ride → `drts-dev-passenger-app-web`，拒絕其他 passenger
  target，沿用正式 map-domain helper 的 idempotent／禁止覆寫行為。
- runbook／entry index：live target 與歷史觀測分開、10-service 目標態、新 App
  entry、**`ride CNAME ghs.googlehosted.com.`**、三個 custom callbacks、預設
  Cloud Run callbacks 的取得流程、DNS/TLS 與外部 provider 尚待交付。

## Finding／acceptance 對照

| Finding／驗收項                                                                          | 正式原始碼與修改位置                                                                                                                                                        | 舊版／修正版結果                                                                                                                                                   | 命令、退出碼、版本與證據                                                                                                                                                  | 未驗項／修正邊界                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pax-web-deploy_workflow_and_secret_gating`：新 service、optional references、smoke      | deploy-dev 的 Resolve dev config、Resolve passenger app optional secret mounts、Build API env vars、Deploy passenger-app、Verify passenger app endpoints；Dockerfile        | 新功能在基準無部署步驟，不適用舊版產品行為重現。直接執行正式 workflow scripts，40/40 PASS；36/36 既有 domain-helper regressions PASS                               | Vitest 4.1.4 / Node 22.23.2；scoped exit 0；source `d873687488dc9aa7bc446abb9cfa48996b192010`；`.local/pax-web-deploy-20261009/final-scoped.json`                         | 不代表整個部署成功；F1、F2 尚未解決，Docker/Cloud Run、實際 provider config 與同 SHA CI 未驗                                                                                                          |
| F1：第十個 active service 使 mandatory paused cleanup 與 opt-in retired cleanup 拒絕執行 | `operations/deployment/cleanup-paused-partner-booking-service.sh:active_services`；`cleanup-retired-dev-service.sh:intended_services`                                       | 正式兩個 helper 都以 ten-service mock inventory exit 1，精確指出 `drts-dev-passenger-app-web` 是 Unexpected services；沒有 delete。修正尚未獲原 task scope，尚未做 | `python3 .local/pax-web-deploy-20261009/inventory-probe.py` exit 0 代表成功重現兩個預期 exit 1，非 guard 通過；`.local/.../inventory-probe.log`                           | 請 Supervisor 擴充兩檔 scope；只追加新 active service 並改 9→10 描述，保留退休 action、exact inventory、optional scanner、paused targets 和拒絕演算法                                                 |
| F1a：legacy tests 仍禁止新 passenger surface 或固定九服務                                | `tests/unit/dev-active-surface-contract.test.ts`；`cloud-run-deploy-retry.test.ts`；`cleanup-paused-partner-booking-service.test.ts`；`cleanup-retired-dev-service.test.ts` | 61 cases 中 57 PASS、4 FAIL、0 SKIP；失敗是 broad passenger regex、ride domain 禁用、wrapper count 9→10、exact target list 9→10。修正未做                          | legacy command exit 1；`.local/.../legacy-regression.json`、`.log`；source `5dc31402be2ee2ddae4b3655372c7a33cd85afb8` 的 production workflow，當時新增 tests 為工作樹版本 | 請 Supervisor 擴四檔 scope。只對 retired `passenger-web` 繼續拒絕；新服務應加入 inventory 正向和 missing/rogue 拒絕案例。既有 runtime-matrix 仍是舊九服務，交 PAX-QA 協調增補，不宣稱新 UI E2E 已覆蓋 |
| F2：新 workflow `/fares` smoke 要求與 shell route 不一致                                 | `apps/passenger-app-web/app/` 目前只有 home/login/account/ride；Build/health smoke 需 `/fares`                                                                              | repo route 檢視確認缺少 `/fares`。typecheck 可通過，但不能代替 HTTP 200。未啟動 runtime                                                                            | `rg --files apps/passenger-app-web`；本 VM 不允許 runtime/browser probe                                                                                                   | 交 WEB-BOOKING lane 在其 scope 提供正式 fare page；如需此 task 寫頁面，先由 Supervisor 核對 scope/canvas。不得拿 BFF JSON 或 redirect 冒充頁面 smoke                                                  |
| F3：key slot 完整配置不代表金鑰契約／provider runtime 完成                               | SD §4 `PSP_TOKEN_ENCRYPTION_KEY_NAME`；auth-startup `COOKIE_SECRET`；shell bearer cookies；`UnconfiguredSmsPort`                                                            | metadata gate PASS。SD 沒有 cookie slot、目前 shell 不使用 crypto key；payment key name/bytes 仍須 PAYMENT owner 對齊正式讀取端。沒有設定任何真實 key              | 單元測試 mock metadata，只允許 `gcloud secrets describe`；不 access/create，也不呼叫真實 OAuth/SMS/PSP                                                                    | Supervisor 協調 PAX-SD／WEB-AUTH／PAYMENT contracts；SMS/PSP adapter 外部 gate 保留，不以 `*_configured=true` 宣稱 provider 可用                                                                      |
| `pax-web-deploy_domain_mapping_and_runbook`                                              | domain-mappings-dev、正式 map-domain helper、runbook §1–4.2、entry index                                                                                                    | 新 mapping absent→create、已正確→skip、指向 retired→refuse 都以正式 helper PASS。文件核對 DNS 欄位與三個 callback；保留舊 project 歷史 evidence                    | scoped exit 0；actionlint 1.7.12 exit 0（shellcheck/pyflakes 未啟用）；Prettier content check exit 0                                                                      | 沒有對 shared dev 執行部署或 mapping，也沒有 DNS/TLS/live HTTP evidence；default callback 完整 URL 要等 hosted deployment `status.url`；同 candidate CI/reviewer 未驗                                 |

## 檢查命令與已讀結果

所有本輪啟動的檢查均已結束並讀過結果；沒有背景 pending tests。
測試只 mock `gcloud`／`curl` 外部邊界，直接執行 workflow 原始 script 與
正式 `map-domain-service.sh`，沒有改寫被驗證的 grouping、HTTP/SHA 或
mapping-refusal 邏輯。沒有 VM product server、browser/E2E、Docker 或 PG。

```bash
# 最後 source checkpoint，76 tests = 40 passenger scripts + 36 domain helper
pnpm exec vitest run tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts \
  tests/unit/map-domain-service.test.ts --reporter=json \
  --outputFile=.local/pax-web-deploy-20261009/final-scoped.json
# exit 0；76 PASS，0 FAIL，0 SKIP

pnpm exec vitest run tests/unit/dev-active-surface-contract.test.ts \
  tests/unit/cloud-run-deploy-retry.test.ts \
  tests/unit/cleanup-paused-partner-booking-service.test.ts \
  tests/unit/cleanup-retired-dev-service.test.ts \
  tests/unit/deploy-dev-google-oidc.test.ts \
  tests/unit/deployment-architecture-guards.test.ts --reporter=json \
  --outputFile=.local/pax-web-deploy-20261009/legacy-regression.json
# exit 1；57 PASS，4 FAIL，0 SKIP（F1a）

pnpm --filter @drts/passenger-app-web typecheck
pnpm --filter @drts/passenger-app-web lint
pnpm exec eslint tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts --max-warnings=0
pnpm classification:check
# 全部 exit 0；classification checked 6213 tracked files

.local/pax-web-deploy-20261009/actionlint -shellcheck= -pyflakes= \
  .github/workflows/deploy-dev.yml .github/workflows/domain-mappings-dev.yml
# exit 0；actionlint 1.7.12
```

首次 new-test ESLint 曾因 `no-regex-spaces` 失敗；已改成 `{2}` 並重跑通過。
Prettier 對兩份 workflow、new test 與兩份更新文件檢查 exit 0。
機器專屬 JSON/log/probe 位於本 task worktree 的 `.local/pax-web-deploy-20261009/`，
不作為已提交的 durable delivery 或外部驗收。

## 下一步與 candidate

1. Supervisor 核對平行任務衝突，擴充 F1/F1a 的原 task write scopes；原 owner
   只更新 inventory/retired-specific expectations，跑正式 helper 的正向和拒絕回歸。
2. WEB lane 提供 `/fares`，SD/WEB-AUTH/PAYMENT 核對 F3 key contracts。
3. 檢查 branch／PR／remote head 一致，所有 scope checks 通過後再鎖
   `CANDIDATE_SHA`／`CANDIDATE_BRANCH`，handoff 給 Codex；同 SHA CI 與獨立 review
   依既有 lifecycle 收錄。本次不 handoff、不 done、不自行 merge。
4. 由 publish 流程執行新服務 hosted build/deploy，再執行 authorized domain
   workflow；使用者設定 DNS／provider console。記錄 source SHA、run/job/
   artifact、Cloud Run URL、HTTP/SHA、DNS/TLS，才能聲稱 dev 上線。

Candidate SHA: **未建立**。PR 僅作為 draft checkpoint；不是候選交審。
沒有本 task 的 hosted CI／merge／外部 acceptance evidence。
