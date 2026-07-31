# smarttransport.tw 自訂網域設定 Runbook

**產生日期：** 2026-07-31
**GCP Project：** `drts-dev-ray-tw-20260730`
**Region：** `us-central1`
**目標：** 記錄 dev active inventory 與 `smarttransport.tw` 目前可觀測的 custom-domain 狀態，僅供控管與後續清理；本 task 不部署、不改 billing。

> ⚠️ **執行前提（只有具權限者能做）**
>
> 1. `gcloud auth login`。
> 2. `smarttransport.tw` 的 DNS 控制權。
> 3. `smarttransport.tw` 已在對應 GCP 帳號完成網域驗證（`gcloud domains verify smarttransport.tw` 或 Search Console）。

---

## 1. 前綴 → 服務對照

| 子網域                       | Cloud Run 服務                    | 用途           |
| ---------------------------- | --------------------------------- | -------------- |
| `fleets.smarttransport.tw`   | `drts-platform-admin-web`         | 車隊管理後臺   |
| `ops.smarttransport.tw`      | `drts-ops-console-web`            | 營運中心       |
| `partners.smarttransport.tw` | `drts-fleet-partner-portal-web`   | 車行夥伴       |
| `dispatch.smarttransport.tw` | `drts-enterprise-dispatch-web`    | 企業派車       |
| `book.smarttransport.tw`     | `drts-partner-booking-web`        | 機場／合作預約 |
| `bank.smarttransport.tw`     | `drts-bank-console-web`           | 銀行後臺       |
| `channel.smarttransport.tw`  | `drts-channel-partner-portal-web` | 渠道夥伴       |
| `tenant.smarttransport.tw`   | `drts-tenant-console-web`         | 企業租戶       |
| `refer.smarttransport.tw`    | `drts-referral-embed-web`         | 推薦嵌入       |
| `api.smarttransport.tw`      | `drts-api`                        | 後端 API       |

> `passenger-web` 已於 2026-06-16 退休，`concierge-portal-web` / `assisted-entry-web`
> 亦已退休；三者不得回到 authoritative domain mapping inventory、deploy workflow、smoke URL inventory。

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
map book.smarttransport.tw       drts-partner-booking-web
map bank.smarttransport.tw       drts-bank-console-web
map channel.smarttransport.tw    drts-channel-partner-portal-web
map tenant.smarttransport.tw     drts-tenant-console-web
map refer.smarttransport.tw      drts-referral-embed-web
map api.smarttransport.tw        drts-api
```

每條 `create` 會輸出該子網域要加的 DNS 記錄（子網域一律 CNAME → `ghs.googlehosted.com.`）。

---

## 3. DNS 記錄（active inventory 目標態）

所有子網域都是 **CNAME → `ghs.googlehosted.com.`**（Cloud Run 對子網域的標準對應）：

```dns
fleets     CNAME  ghs.googlehosted.com.
ops        CNAME  ghs.googlehosted.com.
partners   CNAME  ghs.googlehosted.com.
dispatch   CNAME  ghs.googlehosted.com.
book       CNAME  ghs.googlehosted.com.
bank       CNAME  ghs.googlehosted.com.
channel    CNAME  ghs.googlehosted.com.
tenant     CNAME  ghs.googlehosted.com.
refer      CNAME  ghs.googlehosted.com.
api        CNAME  ghs.googlehosted.com.
```

> 若 DNS 供應商不允許 CNAME 指到 apex 以外的具名 host，以 `domain-mappings create`
> 實際輸出的 `rrdata` 為準（Google 有時給多筆 A/AAAA 而非 CNAME）。

Google 會自動為每個對應簽發受管 SSL 憑證（首次 provisioning 可能數分鐘～數小時）。

---

## 4. 驗證指令

```bash
for sub in fleets ops partners dispatch book bank channel tenant refer api; do
  echo -n "$sub.smarttransport.tw → "
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$sub.smarttransport.tw" || echo "尚未生效"
done
gcloud beta run domain-mappings list --region us-central1 --project drts-dev-ray-tw-20260730
```

全部 mapping `READY=True` 且憑證 ACTIVE 即完成。若 `book`/`fleets` 需要特定路徑健檢，比照 `deploy-dev` smoke（例如 `book.../ctbc`）。

## 5. 2026-07-31 實測現況

- Authoritative active surface 仍是 `deploy-dev.yml` 內的 10 services：`api` + 9 web；不含 `passenger-web`、`concierge-portal-web`、`assisted-entry-web`。
- GCP target 已固定為 project `drts-dev-ray-tw-20260730`、region `us-central1`。
- DNS 已存在：
  - `smarttransport.tw` → `185.158.133.1`
  - active inventory 子網域 `fleets/ops/partners/dispatch/book/bank/channel/tenant/refer/api.smarttransport.tw` 皆解析到 `ghs.googlehosted.com` 後的 Google anycast IP
  - retired `ride.smarttransport.tw` 與 `concierge.smarttransport.tw` 也仍解析到 `ghs.googlehosted.com`，代表外部 DNS / mapping 清理尚未完成；它們不是 authoritative active inventory
- HTTPS 實測：
  - `https://refer.smarttransport.tw/` 於 2026-07-31 會 `307` 轉到 `/embed/referral-demo-community`
  - `https://refer.smarttransport.tw/embed/referral-demo-community` 回 `200`
  - `https://channel.smarttransport.tw`、`https://api.smarttransport.tw/health`、`https://ride.smarttransport.tw`、`https://concierge.smarttransport.tw` 於 2026-07-31 測得 TLS/SSL 連線失敗，表示 mapping / certificate / backend readiness 仍需由具權限者在外部環境排查
- 因此本 runbook 只能把 repo 內 authoritative inventory 對齊；外部 DNS、憑證、mapping 存活清理不屬於此 no-deploy task。
