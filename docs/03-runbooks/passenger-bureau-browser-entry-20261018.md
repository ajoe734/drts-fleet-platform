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
| `grant-passenger-app-iap-invoker.sh <service> <region> <project>` | 先以冪等的 `gcloud beta services identity create --service=iap.googleapis.com` 確保 Cloud IAP service agent（`service-<project-number>@gcp-sa-iap.iam.gserviceaccount.com`）本身存在，再對它授予 `roles/run.invoker`；純增量，不會移除既有 binding，也絕不觸碰 `allUsers`／`allAuthenticatedUsers`（`enforce-no-public-access.sh` 仍會攔截這兩者）。 |
| `setup-passenger-public-entry.sh <service> <region> <project> <host>` | 建立／對齊 serverless NEG、兩個 backend service、guard-backend 無公開授權的驗證、public-backend 的 `allUsers` IAP 授權、URL map、受管憑證、靜態 IP、HTTPS proxy 與 forwarding rule。所有資源建立前先以 `list --filter=name=...` 查存在性（idempotent）；URL map 一律用 `import` 整份宣告式重套，不做局部 `add-path-matcher`。 |

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
  - 同樣讀入 `DEV_PAX_BUREAU_ENTRY_HOST`；在既有
    `ride.smarttransport.tw` domain mapping 之後（不是取代它——既有直接
    Cloud Run domain mapping 仍保留給帶 identity token 的既有呼叫者），
    若此變數有值則呼叫 `setup-passenger-public-entry.sh`。

兩個 workflow 的呼叫都是 **opt-in**：在對應 repo variable 設定之前，既有
部署與 domain-mapping 行為完全不變。

## 4. 操作步驟（需要具權限 operator 執行；本機不執行雲端變更）

```bash
# 1. 設定新 host（第一次執行前）：
gh variable set DEV_PAX_BUREAU_ENTRY_HOST --body "bureau.smarttransport.tw"

# 2. 正常 reviewed/merge 流程把本 task 變更帶到 immutable publish snapshot。

# 3. 用該 publish ref 跑現有 domain-maintenance workflow：
gh workflow run domain-mappings-dev.yml --ref "$PUBLISH_REF" -f confirm=apply
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
