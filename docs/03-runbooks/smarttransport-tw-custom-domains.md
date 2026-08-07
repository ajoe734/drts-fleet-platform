# smarttransport.tw 自訂網域設定 Runbook

**產生日期：** 2026-07-26
**GCP Project：** `drts-dev-ray-tw-20260530`（dev live set，hash `ne55h7sy3a`）
**Region：** `us-central1`
**目標：** 把每個 Cloud Run web app 對到 `smarttransport.tw` 下的獨立子網域。

> ⚠️ **執行前提（只有具權限者能做）**
>
> 1. `gcloud auth login`（本 runbook 產生時 CLI 認證已過期，非互動環境無法重登）。
> 2. `smarttransport.tw` 的 **DNS 控制權**。目前 apex 解到 `185.158.133.1`（註冊商 parking），
>    `fleets.` 等子網域尚未解析 → 代表還沒接到 Cloud Run。
> 3. **網域驗證**：`smarttransport.tw` 需在此 GCP 帳號完成驗證
>    （`gcloud domains verify smarttransport.tw` 或 Search Console），否則 domain-mapping 會被拒。

---

## 1. 前綴 → 服務對照

| 子網域                       | Cloud Run 服務                    | 用途             |
| ---------------------------- | --------------------------------- | ---------------- |
| `fleets.smarttransport.tw`   | `drts-platform-admin-web`         | 車隊管理後臺     |
| `ops.smarttransport.tw`      | `drts-ops-console-web`            | 營運中心         |
| `partners.smarttransport.tw` | `drts-fleet-partner-portal-web`   | 車行夥伴         |
| `dispatch.smarttransport.tw` | `drts-enterprise-dispatch-web`    | 企業派車         |
| `ride.smarttransport.tw`     | `drts-passenger-web`              | 智行叫車（乘客） |
| `bank.smarttransport.tw`     | `drts-bank-console-web`           | 銀行後臺         |
| `channel.smarttransport.tw`  | `drts-channel-partner-portal-web` | 渠道夥伴         |
| `tenant.smarttransport.tw`   | `drts-tenant-console-web`         | 企業租戶         |
| `api.smarttransport.tw`      | `drts-api`                        | 後端 API         |

---

## 2. 建立 domain mappings（逐條執行）

```bash
PROJECT=drts-dev-ray-tw-20260730
REGION=us-central1

gcloud auth login   # 前提 1

# （若尚未驗證）先驗證網域，照輸出加 TXT 記錄後再繼續：
gcloud domains verify smarttransport.tw

map() {  # map <subdomain> <service>
  gcloud beta run domain-mappings create \
    --service "$2" --domain "$1" \
    --region "$REGION" --project "$PROJECT"
}

map fleets.smarttransport.tw     drts-platform-admin-web
map ops.smarttransport.tw        drts-ops-console-web
map partners.smarttransport.tw   drts-fleet-partner-portal-web
map dispatch.smarttransport.tw   drts-enterprise-dispatch-web
map ride.smarttransport.tw       drts-passenger-web
map bank.smarttransport.tw       drts-bank-console-web
map channel.smarttransport.tw    drts-channel-partner-portal-web
map tenant.smarttransport.tw     drts-tenant-console-web
map api.smarttransport.tw        drts-api
```

每條 `create` 會輸出該子網域要加的 DNS 記錄（子網域一律 CNAME → `ghs.googlehosted.com.`）。

---

## 3. DNS 記錄（加到 smarttransport.tw 的 DNS）

所有子網域都是 **CNAME → `ghs.googlehosted.com.`**（Cloud Run 對子網域的標準對應）：

```dns
fleets     CNAME  ghs.googlehosted.com.
ops        CNAME  ghs.googlehosted.com.
partners   CNAME  ghs.googlehosted.com.
dispatch   CNAME  ghs.googlehosted.com.
ride       CNAME  ghs.googlehosted.com.
bank       CNAME  ghs.googlehosted.com.
channel    CNAME  ghs.googlehosted.com.
tenant     CNAME  ghs.googlehosted.com.
api        CNAME  ghs.googlehosted.com.
```

> 若 DNS 供應商不允許 CNAME 指到 apex 以外的具名 host，以 domain-mappings create
> 實際輸出的 `rrdata` 為準（Google 有時給多筆 A/AAAA 而非 CNAME）。

Google 會自動為每個對應簽發受管 SSL 憑證（首次 provisioning 可能數分鐘～數小時）。

---

## 4. 驗證

```bash
for sub in fleets ops partners dispatch ride bank channel tenant api; do
  echo -n "$sub.smarttransport.tw → "
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$sub.smarttransport.tw" || echo "尚未生效"
done
gcloud beta run domain-mappings list --region us-central1 --project drts-dev-ray-tw-20260730
```

全部 200 且憑證 ACTIVE 即完成。

---

## 5. 現況（產生本 runbook 時）

- Cloud Run 服務全部已部署且 dev URL 回 200（`drts-*-web-ne55h7sy3a-uc.a.run.app`）。
- `smarttransport.tw`：apex→`185.158.133.1`，子網域未解析 → **尚未接 Cloud Run**。
- 本 runbook 的指令與記錄**未套用**，等前提 1+2 齊備後由具權限者執行。
