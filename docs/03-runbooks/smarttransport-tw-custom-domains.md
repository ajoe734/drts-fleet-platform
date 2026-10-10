# smarttransport.tw 自訂網域設定 Runbook

**更新日期：** 2026-10-10（PAX-WEB-DEPLOY-20261009）
**GCP Project：** 以 live `DEV_GCP_PROJECT_ID` 為準；2026-10-10 唯讀查詢為 `drts-dev-devcc-20260825`
**Region：** `us-central1`
**目標：** 記錄 shared dev 的部署／網域目標態及 DNS 交付；沒有部署或 DNS 生效證據前，不宣稱已上線。本機不部署、不改 DNS 或 billing。

> **歷史範圍：** §5、§6 保留 `nodal-alloy-503700-s3` 的原始觀測。
> 依 `AGENTS.md` 記錄，該 project 已於 2026-09-07
> 因 content/ToS 問題停權；現行 live 共用 dev target 是 GitHub repo
> variables `DEV_GCP_PROJECT_ID`／`DEV_GCP_REGION` 當時的值（2026-09-08 起為
> `drts-dev-devcc-20260825` / `us-central1`），且必須在使用前重新查詢，不可
> 從任何已提交文件推斷。2026-07-31／2026-08-01 實測記錄
> 保留為該舊 project 當時狀態的歷史記錄；
> 若要對現行 live project 執行或驗證 domain mapping，先讀
> `.github/workflows/deploy-dev.yml` 與現行 repo variables，以其為準，不要
> 直接套用本文件的 project ID。

> ⚠️ **執行前提（只有具權限者能做）**
>
> 1. GitHub authorized workflow 的現有 WIF 身分與 shared dev 權限。
> 2. `smarttransport.tw` 的 DNS 控制權。
> 3. `smarttransport.tw` 已在對應 GCP 帳號完成網域驗證（`gcloud domains verify smarttransport.tw` 或 Search Console）。

---

## 1. 前綴 → 服務對照

| 子網域                       | Cloud Run 服務                      | 用途                                            |
| ---------------------------- | ----------------------------------- | ----------------------------------------------- |
| `fleets.smarttransport.tw`   | `drts-dev-platform-admin-web`       | 車隊管理後臺                                    |
| `ops.smarttransport.tw`      | `drts-dev-ops-console-web`          | 營運中心                                        |
| `partners.smarttransport.tw` | `drts-dev-fleet-partner-portal-web` | 車行夥伴                                        |
| `dispatch.smarttransport.tw` | `drts-dev-enterprise-dispatch-web`  | 企業派車                                        |
| `bank.smarttransport.tw`     | `drts-dev-bank-console-web`         | 銀行後臺                                        |
| `channel.smarttransport.tw`  | `drts-channel-partner-portal-web`   | 渠道夥伴                                        |
| `tenant.smarttransport.tw`   | `drts-dev-tenant-console-web`       | 企業租戶                                        |
| `refer.smarttransport.tw`    | `drts-dev-referral-embed-web`       | 推薦嵌入                                        |
| `api.smarttransport.tw`      | `drts-dev-api`                      | 後端 API                                        |
| `ride.smarttransport.tw`     | `drts-dev-passenger-app-web`        | 第一方乘客網頁 App（2026-10-09 重開；部署待驗） |

> `passenger-web` 已於 2026-06-16 退休，`concierge-portal-web` / `assisted-entry-web`
> 亦已退休；三者不得回到 authoritative domain mapping inventory、deploy workflow、smoke URL inventory。

2026-10-09 使用者重開的是新 `passenger-app-web`，並沿用 `ride.smarttransport.tw`。
原 `passenger-web` 仍退役；新的 inventory 為 10 個 Cloud Run 服務（9 web + API）。
服務名稱從 `DEV_GCP_PASSENGER_APP_SERVICE` 解析，未設定時用
`drts-dev-passenger-app-web`；workflow 拒絕其他 target。既有分類規則已由
PAX-WEB-SHELL 登記新 App，本 task 不重複改 `repo-classification.json`。

### Partner Booking — PAUSED

`partner-booking-web`（含獨立網站與 bank-app embed）自 2026-08-01 起明確暫停，
不屬於 active inventory。`domain-mappings-dev.yml` 不建立或重建
`book.smarttransport.tw`；`deploy-dev.yml` 也不 build、deploy、公開或 smoke 此
service，並會以 fail-closed cleanup 刪除殘留的
`drts-dev-partner-booking-web` Cloud Run service。程式碼與 route 文件保留，恢復
必須透過 reviewed workflow change。

---

## 2. 建立 domain mappings（domain-maintenance；idempotent；不覆寫既有 live mapping）

```bash
# 唯讀核對 live variables；不得用舊 project 或推測 hostname。
gh variable get DEV_GCP_PROJECT_ID
gh variable get DEV_GCP_REGION
# PUBLISH_REF 必須是包含本 task 已審核變更的 immutable publish/v* snapshot。
# 先讓 publish 流程部署新服務成功，再由具權限 operator 執行 mapping workflow。
gh workflow run domain-mappings-dev.yml --ref "$PUBLISH_REF" -f confirm=apply
```

每條新建 `create` 會輸出該子網域要加的 DNS 記錄（子網域一律 CNAME → `ghs.googlehosted.com.`）。
若 mapping 已正確存在，腳本會直接 skip；若 mapping 指向錯誤 service，腳本會 fail closed and hand off to the single deploy cleanup task.，不在此 repo-only task 直接覆寫 live target。

若現行 project 內的 `ride.smarttransport.tw` 仍指向舊 passenger 服務，helper
會拒絕覆寫。由既有 cleanup/operator 流程核對後處理；worker 不使用
`--force-override`。網域驗證 TXT 的值由 Search Console 對 workflow acting
identity 產生，不能預填或沿用舊 project 的值。

---

## 3. DNS 記錄（active inventory 目標態）

所有子網域都是 **CNAME → `ghs.googlehosted.com.`**（Cloud Run 對子網域的標準對應）：

```dns
fleets     CNAME  ghs.googlehosted.com.
ops        CNAME  ghs.googlehosted.com.
partners   CNAME  ghs.googlehosted.com.
dispatch   CNAME  ghs.googlehosted.com.
bank       CNAME  ghs.googlehosted.com.
channel    CNAME  ghs.googlehosted.com.
tenant     CNAME  ghs.googlehosted.com.
refer      CNAME  ghs.googlehosted.com.
api        CNAME  ghs.googlehosted.com.
ride       CNAME  ghs.googlehosted.com.
```

乘客 App 要由使用者在 **smarttransport.tw zone** 新增／核對這一筆：

| 欄位           | 精確值                                       |
| -------------- | -------------------------------------------- |
| Name / Host    | `ride`（完整名稱 `ride.smarttransport.tw.`） |
| Type           | `CNAME`                                      |
| Target / Value | `ghs.googlehosted.com.`                      |
| TTL            | `300` 秒（或 DNS 供應商支援的預設值）        |

同名 A/AAAA 與 CNAME 不能共存；DNS 變更由使用者執行。以現行 mapping
輸出的 `status.resourceRecords` 核對最終記錄，不能將本表視為已生效證據。
Cloud Run 的 DNS 設定與受管憑證程序見
[Google 官方文件](https://docs.cloud.google.com/run/docs/mapping-custom-domains#dns_update)。

Google 會自動為每個對應簽發受管 SSL 憑證（首次 provisioning 可能數分鐘～數小時）。

---

## 4. 驗證指令

```bash
for sub in fleets ops partners dispatch bank channel tenant refer api ride; do
  echo -n "$sub.smarttransport.tw → "
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$sub.smarttransport.tw" || echo "尚未生效"
done
PROJECT="$(gh variable get DEV_GCP_PROJECT_ID)"
REGION="$(gh variable get DEV_GCP_REGION)"
gcloud beta run domain-mappings describe --domain ride.smarttransport.tw \
  --region "$REGION" --project "$PROJECT" --format='yaml(spec,status)'
```

全部 active mapping `READY=True` 且憑證 ACTIVE 即完成。`book.smarttransport.tw`
若仍可解析或仍有既有 mapping，只代表待清理的外部殘留，不是 active surface，
也不得由本 workflow 重建。

DNS 不會開放 Cloud Run IAM。新乘客服務預設 private，shared dev operator
須按既有公開流程明確設定 `DEV_PASSENGER_APP_ALLOW_UNAUTHENTICATED=true`
並透過 immutable publish workflow 部署，乘客才可直接使用網址；設回 false
時 workflow 會撤除 allUsers binding。health-check 用 WIF ID token 驗證
`/` 與 `/fares` 均回 **200**，並比對 `x-drts-candidate-sha`，不接受 redirect。
本機只執行 repo checks，不啟動 App、browser 或 Docker 環境。

### 4.1 OAuth callback 交付

| Provider | 乘客 App callback（須由使用者登記於該 provider）        |
| -------- | ------------------------------------------------------- |
| Google   | `https://ride.smarttransport.tw/auth/callback/google`   |
| Facebook | `https://ride.smarttransport.tw/auth/callback/facebook` |
| LINE     | `https://ride.smarttransport.tw/auth/callback/line`     |

API 的 `OAUTH_REDIRECT_ALLOWLIST` 採這三個完整 URL，不能用 origin 或 wildcard。
workflow 另從現行新服務的 `status.url` 加入相同三個 `/auth/callback/<provider>`
URL，dev provider console 要另外登記；不要使用本文件 §6 的舊 hostname。
首次部署前服務尚不存在，API allowlist 只有 custom callbacks；新 URL 從
health-check `Resolve service URLs`／Summary 取得，再以**同一 immutable
publish reference** 重跑部署加入預設網域 callbacks。沒有新服務的 run
evidence 前，Cloud Run 預設 callback URL 仍待交付，不猜 suffix。
callback route 的產品驗證由 PAX-WEB-AUTH-UI／PAX-QA 提供，不以網址字串宣稱登入可用。

### 4.2 Passenger optional secret reference 契約

`Resolve passenger app optional secret mounts` 只在 hosted runner 使用
`gcloud secrets describe` 查 metadata；不 create，也不 access value。
每個 env slot 的 secret 名稱是 `${DEV_SECRET_PREFIX:-drts-dev}-` 加上
env 名稱的小寫 kebab case。例如 `GOOGLE_OAUTH_CLIENT_SECRET` 對應
`drts-dev-google-oauth-client-secret`；值僅由 Cloud Run `:latest` 掛載。

| 群組                    | 全部必須存在的 env／secret suffix                                                                                                                                      | 掛載位置                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Google                  | `GOOGLE_OAUTH_CLIENT_ID` / `google-oauth-client-id`；`GOOGLE_OAUTH_CLIENT_SECRET` / `google-oauth-client-secret`                                                       | API                                               |
| LINE                    | `LINE_CHANNEL_ID` / `line-channel-id`；`LINE_CHANNEL_SECRET` / `line-channel-secret`                                                                                   | API                                               |
| Facebook                | `FACEBOOK_APP_ID` / `facebook-app-id`；`FACEBOOK_APP_SECRET` / `facebook-app-secret`                                                                                   | API                                               |
| Email OTP pepper        | `PASSENGER_OTP_PEPPER` / `passenger-otp-pepper`                                                                                                                        | API；Email 另須既有完整 SMTP 與平台 delivery 可用 |
| SMS                     | `SMS_PROVIDER_API_KEY` / `sms-provider-api-key`；`SMS_PROVIDER_SENDER_ID` / `sms-provider-sender-id`；`PASSENGER_OTP_PEPPER` / `passenger-otp-pepper`                  | API；仍須實際 SmsPort adapter                     |
| PSP + payment token key | `PSP_MERCHANT_ID` / `psp-merchant-id`；`PSP_API_KEY` / `psp-api-key`；`PSP_SANDBOX` / `psp-sandbox`；`PSP_TOKEN_ENCRYPTION_KEY_NAME` / `psp-token-encryption-key-name` | API；完整套組才掛載                               |
| Cookie key              | `COOKIE_SECRET` / `cookie-secret`                                                                                                                                      | API + passenger BFF；單一 optional slot           |

各群組缺任一項時整組不掛載並輸出 notice；其他完整 provider 獨立保留。
API `--set-secrets` 與 BFF `--clear-secrets`／`--set-secrets` 也會移除前次
部署殘留的配置。OAuth／SMS／PSP secret 不進 BFF 或 `NEXT_PUBLIC_*`。
本 task 沒有建立、讀值或驗證任何實際 secret，沒有呼叫真實 provider。
現有 tenant OIDC、SMTP、Maps 的配置檢查仍沿用原流程；它們的既有 partial
configuration 錯誤不因新增乘客服務而放寬。

完整 metadata 套組只代表可以掛載，**不代表功能已驗收啟用**：目前 API 的
SMS port 是 `UnconfiguredSmsPort`、PSP adapter 是外部 gate，
`REQUIRE_SMS_VERIFICATION=false`。SD §4 尚未定義 cookie slot；本 task 沿用
既有 auth startup 的 `COOKIE_SECRET`，shell 的 HttpOnly bearer cookies
目前不消耗此 key，不以配置結果冒充 cookie crypto 驗收。付款核心須確認
`PSP_TOKEN_ENCRYPTION_KEY_NAME` 是 key name 或 key bytes 與正式讀取端一致後
再 provision；本 task 不自行選 PSP 或產生金鑰。

## 5. 2026-07-31 實測現況

- Authoritative active surface 是 `deploy-dev.yml` 內的 9 services：`drts-dev-api`、`drts-dev-platform-admin-web`、`drts-dev-ops-console-web`、`drts-dev-fleet-partner-portal-web`、`drts-dev-tenant-console-web`、`drts-dev-bank-console-web`、`drts-dev-enterprise-dispatch-web`、`drts-dev-referral-embed-web`、`drts-channel-partner-portal-web`；不含 paused `partner-booking-web`，也不含 retired `passenger-web`、`concierge-portal-web`、`assisted-entry-web`。
- GCP target 已固定為 project `nodal-alloy-503700-s3`、region `us-central1`。
- DNS 已存在：
  - `smarttransport.tw` → `185.158.133.1`
  - active inventory 子網域 `fleets/ops/partners/dispatch/bank/channel/tenant/refer/api.smarttransport.tw` 皆解析到 `ghs.googlehosted.com` 後的 Google anycast IP
  - paused `book.smarttransport.tw` 若仍解析到 Google，只是外部 DNS / mapping 殘留，不是 active inventory
  - retired `ride.smarttransport.tw` 與 `concierge.smarttransport.tw` 也仍解析到 `ghs.googlehosted.com`，代表外部 DNS / mapping 清理尚未完成；它們不是 authoritative active inventory
- HTTPS 實測（純觀測，不構成本 task gate）：
  - `https://refer.smarttransport.tw/` 於 2026-07-31 會 `307` 轉到 `/embed/referral-demo-community`
  - `https://refer.smarttransport.tw/embed/referral-demo-community` 回 `200`
  - `https://channel.smarttransport.tw`、`https://api.smarttransport.tw/health`、`https://ride.smarttransport.tw`、`https://concierge.smarttransport.tw` 於 2026-07-31 測得 TLS/SSL 連線失敗；這些是外部 live-state observation，不回寫 repo active inventory，也不阻擋本次 repo-only domain-maintenance rails 修復
- 因此本 runbook 的 machine-truth 職責只有對齊 repo 內 authoritative inventory；外部 DNS、憑證、mapping 存活清理另案處理。

## 6. 2026-08-01 Referral 正式 partner entry（dev acceptance）

- Platform Admin authority 已建立正式非 demo entry：`御和物業` / `yuhe-residence`。
- Dev acceptance URL：`https://refer.smarttransport.tw/embed/yuhe-residence`；
  Cloud Run fallback：`https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence`。
- Authority 的 primary `entryHost` 是 `app.yuhe-living.com.tw`；dev embed
  allowlist 同時保留 `app-stg.yuhe-living.com.tw`。允許 host 的請求必須沒有
  `X-Frame-Options`，且 CSP `frame-ancestors` 只包含該次指定的允許 origin。
- `deploy-dev.yml` 的 source default 已改為 `yuhe-residence`。在包含此變更的
  publish snapshot 部署前，既有 revision 的 `/` 仍可能歷史性地導向
  `referral-demo-community`；直接正式 URL 不受影響。
- `referral-demo-community` 僅保留為測試 seed／歷史驗收資料，不再是 root
  default 或對外 partner URL。
- 本節描述的是 project `nodal-alloy-503700-s3` 的 dev acceptance rail。
  `app.yuhe-living.com.tw` 在設計 authority 中代表 partner primary host，但本
  runbook 不據此宣稱該外部 host 或 DRTS production rail 已完成 production cutover。
