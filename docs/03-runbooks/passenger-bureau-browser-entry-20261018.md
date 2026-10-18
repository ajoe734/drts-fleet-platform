# 交通局可實際開啟的乘客審查入口 Runbook

**Task：** `PAX-BUREAU-BROWSER-ENTRY-20261018`
**前置閱讀：** `docs/03-runbooks/smarttransport-tw-custom-domains.md`（既有 domain mapping 與
passenger-app-web 既有 `--no-allow-unauthenticated` 曝光狀態）

## 0. 問題本身

`passenger-app-web`（`drts-dev-passenger-app-web`）維持
`--no-allow-unauthenticated`，`ride.smarttransport.tw` 是對它的 **Cloud Run 域名
對應**，不是公開前門：任何一般瀏覽器 GET 都會拿到 Cloud Run IAM 的 403，因為
Cloud Run 的 IAM 檢查只認 `Authorization: Bearer <identity-token>`，沒有瀏覽器
登入頁。單一具名身分的 `roles/run.invoker` binding 也不能解決這件事（Chrome
登入 Google 不會替一般 `*.run.app` 請求附上該身分的 identity token）；這點由
`.local/passenger-bureau-gap-correction-20261018/entry-R1-ordinary-browser-authentication-finding.md`
確認。

能讓一般瀏覽器用真正登入流程打到這個私有 Cloud Run 服務的 GCP 原生機制是
**Cloud Load Balancer + Cloud IAP**：IAP 在 Load Balancer 終止瀏覽器請求，再用
它自己的 service agent 身分呼叫 Cloud Run；Cloud Run 本身的 IAM 只需額外多信任
這一個 service agent，既有 CI/部署呼叫者的既有授權不變。

## 1. 架構

```
瀏覽器
  │  https://<host>/...
  ▼
Cloud Load Balancer (global, EXTERNAL_MANAGED)
  │  URL map: <urlmap-name>
  ├─ hostRules: Host == <host> → pathMatcher "bureau-entry"
  │     ├─ pathMatcher defaultService → <service>-public-entry   (IAP: allUsers)
  │     └─ pathRules /review-driver*, /api/review-driver-api/*
  │           → <service>-review-driver-guard                   (IAP: 無 accessor grant)
  └─ top-level defaultService (任何不符 hostRules 的 Host)
        → <service>-review-driver-guard                         (同樣沒有 accessor grant)
  ▼ (兩個 backend service 都指向同一個 serverless NEG)
Cloud Run: passenger-app-web  (--no-allow-unauthenticated 不變)
  只多一個 run.invoker 授權：Cloud IAP service agent
```

兩個 backend service 指向同一個 Cloud Run 服務；差別只在 IAP 存取權：
`<service>-public-entry` 開放 `allUsers`，`<service>-review-driver-guard`
刻意不給任何 accessor。`/review-driver` 與 `/api/review-driver-api/*`
（司機端演練上線與調度派遣控制）因此只能走 guard backend，不會因為這個新公開
前門而曝光；其餘路徑（`/login`、`/review`、預約、行程）走 public backend，
對一般瀏覽器公開。

頂層 `defaultService` 刻意指向 guard backend，而不是 public backend：Google
URL map 對不符任何 `hostRules` 的 Host（包含直接用 IP 或偽造 Host 送出的請求）
一律落到頂層 default
（[官方文件](https://docs.cloud.google.com/load-balancing/docs/url-map-concepts)）。
若頂層 default 指向 public backend，任何人只要送出不符 `<host>` 的 Host 標頭
就能繞過 path 層的 guard 規則直達司機/派遣控制面；這是
`entry-R3-routing-review/findings.json`（`ENTRY-R3-UNMATCHED-HOST-DEFAULT`）
記錄的既有缺陷，已在本次 `setup-passenger-public-entry.sh` 修正，並由
`tests/unit/pax-bureau-browser-entry-20261018/setup-passenger-public-entry.test.ts`
的 `ENTRY-R3-UNMATCHED-HOST-DEFAULT` 案例鎖定回歸。

## 2. 提供的腳本（`operations/deployment/passenger-bureau-entry/`）

| 腳本 | 用途 |
| --- | --- |
| `grant-passenger-app-iap-invoker.sh <service> <region> <project>` | 先 `gcloud services enable iap.googleapis.com --quiet`，再以冪等的 `gcloud beta services identity create --service=iap.googleapis.com --quiet` 確保 Cloud IAP service agent（`service-<project-number>@gcp-sa-iap.iam.gserviceaccount.com`）本身存在，最後對它授予 `roles/run.invoker`；純增量，不會移除既有 binding，也絕不觸碰 `allUsers`／`allAuthenticatedUsers`（`enforce-no-public-access.sh` 仍會攔截這兩者）。`--quiet` 同時讓冷 Cloud SDK 的 beta 元件安裝確認不卡在互動提示（見 §6a）。 |
| `setup-passenger-public-entry.sh <service> <region> <project> <host>` | 先 `gcloud services enable compute.googleapis.com iap.googleapis.com --quiet`（見 §6a），再建立／對齊 serverless NEG、兩個 backend service、guard-backend 無公開授權的驗證、public-backend 的 `allUsers` IAP 授權、URL map、受管憑證、靜態 IP、HTTPS proxy 與 forwarding rule。所有資源建立前先以 `list --filter=name=...` 查存在性（idempotent）；URL map 一律用 `import` 整份宣告式重套，不做局部 `add-path-matcher`。 |

兩個腳本都遵守既有 `set -euo pipefail` fail-closed 慣例：任何 `gcloud`
讀取失敗（例如 guard backend 的 IAP policy 讀不到）都視為「未知」而中止，不會
被誤判成「已確認沒有公開授權」後繼續執行（`ENTRY-R3-UNKNOWN-GUARD-POLICY`，
同樣由上述單元測試鎖定）。

## 3. Wiring

- `.github/workflows/deploy-dev.yml`：
  - 新增 repo variable 讀入 `DEV_PAX_BUREAU_ENTRY_HOST`，寫入
    passenger-app-web Cloud Run 服務的 `PAX_BUREAU_ENTRY_HOST` 環境變數
    （供 `apps/passenger-app-web/components/bureau-review/BureauReviewPage.tsx`
    顯示目前實際可用的網址；未設定時頁面會明確顯示「尚未設定」，不會假裝
    已解除 403）。
  - 在既有「Enforce no public access — passenger-app-web」之後，新增
    「Grant Cloud IAP service agent run.invoker — passenger-app-web」步驟，
    只在 `DEV_PAX_BUREAU_ENTRY_HOST` 有值時執行 `grant-passenger-app-iap-invoker.sh`。
- `.github/workflows/domain-mappings-dev.yml`：
  - 同樣讀入 `DEV_PAX_BUREAU_ENTRY_HOST`；新增 `target` workflow input
    （`all`，預設／`passenger-entry-only`）。`target=all` 時行為不變：在既有
    `ride.smarttransport.tw` domain mapping 之後（不是取代它——既有直接
    Cloud Run domain mapping 仍保留給帶 identity token 的既有呼叫者），
    若此變數有值則呼叫 `setup-passenger-public-entry.sh`；此 job 的
    `set -euo pipefail` 仍會在任何一個既有十個 legacy 網域中途失敗時中止，
    維持既有 fail-closed 行為與全量 inventory 預設不變。
  - `target=passenger-entry-only` 啟用獨立的 `passenger-public-entry` job：
    只驗證 passenger app service 在審查過的 inventory 內、只呼叫
    `setup-passenger-public-entry.sh`，完全不執行其餘十個 legacy
    `map-domain-service.sh` 呼叫，因此不受任何無關既有網域驗證/對應失敗影響
    （`ENTRY-R9-UNRELATED-DOMAIN-MAINTENANCE-GATE`）。不新增 IAM、不新增
    VM 服務、不繞過既有 pause（`DEV_PARTNER_BOOKING_STATE`）或 private
    exposure guard——這些只存在於 `target=all` 的既有 job，`passenger-entry-only`
    單純是同一個既有 `setup-passenger-public-entry.sh` 的獨立呼叫路徑。

兩個 workflow 的呼叫都是 **opt-in**：在對應 repo variable 設定之前，既有
部署與 domain-mapping 行為完全不變。

## 4. 操作步驟（需要具權限 operator 執行；本機不執行雲端變更）

```bash
# 1. 設定新 host（第一次執行前）：
gh variable set DEV_PAX_BUREAU_ENTRY_HOST --body "bureau.smarttransport.tw"

# 2. 正常 reviewed/merge 流程把本 task 變更帶到 immutable publish snapshot。

# 3. 用該 publish ref 跑現有 domain-maintenance workflow：
# 3a. 預設：連同既有十個 legacy 網域一起重新驗證/對應（維持既有全量行為）。
gh workflow run domain-mappings-dev.yml --ref "$PUBLISH_REF" -f confirm=apply -f target=all
# 3b. 或者：只建立這個 passenger 公開前門，不受任何既有十個 legacy 網域
#     驗證/對應成功與否影響（ENTRY-R9-UNRELATED-DOMAIN-MAINTENANCE-GATE）。
gh workflow run domain-mappings-dev.yml --ref "$PUBLISH_REF" -f confirm=apply -f target=passenger-entry-only
# 腳本輸出會包含新 host 要加的 DNS A 記錄（靜態 IP）。

# 4. 使用者在 smarttransport.tw zone 新增該 A 記錄；受管憑證在 DNS 生效、
#    Google CA 驗證後才會 ACTIVE（可能數分鐘到數小時）。

# 5. 之後每次 deploy-dev.yml 部署都會順帶執行
#    grant-passenger-app-iap-invoker.sh（因為 DEV_PAX_BUREAU_ENTRY_HOST 已設定）。
```

## 5. 驗證指令（部署與 DNS/憑證生效後）

```bash
PROJECT="$(gh variable get DEV_GCP_PROJECT_ID)"
REGION="$(gh variable get DEV_GCP_REGION)"
HOST="$(gh variable get DEV_PAX_BUREAU_ENTRY_HOST)"

gcloud compute url-maps describe "${service}-public-entry-urlmap" \
  --global --project "$PROJECT" --format='yaml(hostRules,pathMatchers,defaultService)'

gcloud compute ssl-certificates describe "${service}-public-entry-cert" \
  --global --project "$PROJECT" --format='value(managed.status)'

curl -s -o /dev/null -w "%{http_code}\n" "https://${HOST}/login"
curl -s -o /dev/null -w "%{http_code}\n" "https://${HOST}/review-driver"
```

預期：`/login` 回一般乘客登入頁（非 403）；`/review-driver` 不能回到和
`/login` 相同的乘客畫面（guard backend 沒有 IAP accessor，應得到 IAP 自己的
拒絕回應，不是 passenger-app-web 的正常內容）。本機 VM 不執行這些
雲端/瀏覽器指令；實際結果由具權限 operator 在部署後回填本文件或
`docs/04-uat/passenger-app-20261009/PAX-BUREAU-BROWSER-ENTRY-20261018.md`。

## 6. 首次開通順序（`ENTRY-R6-FIRST-IAP-IDENTITY-BOOTSTRAP`）

正常 publish 的自動部署會先跑 `grant-passenger-app-iap-invoker.sh`，
`domain-mappings-dev.yml`（真正啟用 IAP 的 `setup-passenger-public-entry.sh`）
是另一個獨立 workflow，不保證先執行。對一個從未啟用過 IAP 的全新專案，若
grant 腳本在 IAP service agent 身分還不存在時就直接授權，會失敗。依官方文件
（<https://docs.cloud.google.com/iap/docs/enabling-cloud-run#gcloud>）作法，
`grant-passenger-app-iap-invoker.sh` 在授權前一律先呼叫冪等的
`gcloud beta services identity create --service=iap.googleapis.com`，不論
IAP 是否已經由 `domain-mappings-dev.yml` 啟用過，這個呼叫都安全重複執行；
若這個身分建立呼叫本身失敗，腳本在 `set -euo pipefail` 下直接終止，不會繼續
嘗試授權。回歸測試見
`tests/unit/pax-bureau-browser-entry-20261018/grant-passenger-app-iap-invoker.test.ts`
新增的兩個案例（身分建立在授權之前執行、身分建立失敗時不嘗試授權）。

## 6a. 首次雲端啟用：Compute／IAP API 必須先 `enable`（`ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP`）

實際 `publish/v2026.10.18.7` 部署（run
[39166716207](https://github.com/ajoe734/drts-fleet-platform/actions/runs/39166716207)）在
`drts-dev-devcc-20260825` 第一次執行 `setup-passenger-public-entry.sh` 時，
`compute network-endpoint-groups list` 直接回
`SERVICE_DISABLED: compute.googleapis.com`：這個專案從未用過 Compute Engine
API。WIF 驗證與 project lookup 本身成功，沒有拿到靜態 IP 或可用 URL，不是已
證明缺 IAM role。

同一批次 deploy（run 39165989369）另外十個既有服務的 deploy steps 全部
success，但最後的 `grant-passenger-app-iap-invoker.sh` 在呼叫
`gcloud beta services identity create` 時失敗：冷安裝的 Cloud SDK 第一次用到
`beta` command group，gcloud 嘗試互動詢問是否自動安裝 `gcloud Beta Commands`
元件，noninteractive runner 無法回答，實際錯誤是 gcloud 自己的
`This prompt could not be answered because you are not in an interactive
session. You can re-run the command with the --quiet flag to accept default
answers for all prompts.`——這不是 IAP API 未啟用，也不是 IAM 權限不足，而是
冷 SDK 元件安裝需要互動確認。

修正（本次 `PAX-BUREAU-ENTRY-CLOUD-BOOTSTRAP-20261018`）：

- `setup-passenger-public-entry.sh` 在第一個 Compute／IAP 指令之前，先呼叫
  `gcloud services enable compute.googleapis.com iap.googleapis.com
  --project="$project" --quiet`。`services enable` 本身對已啟用的 API 是
  idempotent 的 no-op，所以每次執行都直接呼叫，不另外查詢「是否已啟用」；
  這個呼叫失敗（例如呼叫者缺 `serviceusage.services.enable`）會在
  `set -euo pipefail` 下直接中止腳本，後面的 Compute／IAP 變更都不會被嘗試。
- `grant-passenger-app-iap-invoker.sh` 在 `beta services identity create` 之前
  先用同樣方式 `gcloud services enable iap.googleapis.com --project="$project"
  --quiet`；`beta services identity create` 呼叫本身也加上 `--quiet`——這正是
  上述 gcloud 錯誤訊息要求的修法，讓冷 SDK 的元件安裝確認自動採預設答案，不
  再需要互動輸入。

兩個腳本都沒有自行 grant 任何 IAM role、沒有停用任何 API、沒有改動
public/private、hostguard、NEG 附件重試或 pause／VM 規則。若實際 WIF caller
真的缺 `serviceusage.services.enable` 或 Compute/IAP 權限，`gcloud services
enable` 會以非零結束並保留原始 stderr，由具權限 operator 依該錯誤訊息補授權，
不由本腳本臆測或自行授權。回歸測試見
`tests/unit/pax-bureau-browser-entry-20261018/setup-passenger-public-entry.test.ts`
與
`tests/unit/pax-bureau-browser-entry-20261018/grant-passenger-app-iap-invoker.test.ts`
新增的 `ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP`／`ENTRY-R11-COLD-BETA-SDK-NOPROMPT`
案例（啟用先於第一次使用、已啟用時的 idempotent 重跑、啟用失敗時中止、
`--quiet` 不留互動提示）。

## 7. `/bureau-review` 執行期算繪（`ENTRY-R4-RUNTIME-HOST-PRERENDER`）

`BureauReviewPage` 讀取的 `PAX_BUREAU_ENTRY_HOST` 只在 Cloud Run 執行期由
`deploy-dev.yml` 注入，Docker build 階段（`next build`）看不到這個值。
`apps/passenger-app-web/app/bureau-review/page.tsx` 因此宣告
`export const dynamic = "force-dynamic"`
（[官方文件](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic)），
讓這個路由固定走每次請求時在執行容器內重新算繪，而不是被 Next 預設的靜態
預先產生凍結成 build 當下（空字串）的版本。以實際 `next build --webpack`
確認：路由表中 `/bureau-review` 標示為 `ƒ`（Dynamic，隨請求算繪），不是
`○`（Static）；未另外新增比對原始碼字串的鏡像測試，核實方式就是這次實際
build 的分類輸出本身。

## 8. 已知邊界

- 本次變更不新增任何安全產品或新授權範圍；`setup-passenger-public-entry.sh`
  只重用既有 serverless NEG + backend service + Cloud IAP 的標準 GCP 機制，
  範圍限定在本 task 的 `write_scopes`。
- `grant-passenger-app-iap-invoker.sh` 的 grant 對象永遠是計算出來的 Cloud IAP
  service agent，不接受也不應該被改造成接受任意 principal 參數。
- 福利／無障礙（UC16）等既有需求不因本次新增入口而視為完成或排除，見
  `apps/passenger-app-web/components/bureau-review/content.ts`。
