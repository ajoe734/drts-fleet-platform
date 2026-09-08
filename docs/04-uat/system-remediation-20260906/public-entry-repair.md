# 公開入口修復準備 Runbook（SR-PUBLIC-001）

本文件是 R01／R29（C001／C124）的候選 SHA 診斷與最小 live-change runbook。它不宣稱 DNS、憑證、Cloud Run mapping 或 OIDC callback 已被本任務修好；這些寫入及真實角色登入屬 `SR-LIVE-ENTRY-001` 的授權 live gate。

## 證據邊界與版本來源

- Base／candidate SHA 必須隨 handoff 寫入 `SR-PUBLIC-001.md`；2026-09-06 audit SHA 是歷史觀察，不能當成現在部署真值。
- 目前 repo inventory 取自 `docs/03-runbooks/smarttransport-tw-custom-domains.md` 與 current `dev`：`4t7rg6fmeq-uc.a.run.app`。`lyo6ra57fq-uc.a.run.app` 只保留為 9/6 audit observation，診斷工具逐一探測兩者，絕不把任一 suffix 預設為健康。
- Cloud Run 資源 ID 是表格中的 service name；真正 revision、mapping UID、READY 條件與 certificate state 必須由授權帳號的 `gcloud` 讀回。

## 9 個公開入口分層對照表

| 公開入口 | Cloud Run resource ID | 路徑 | callback／預期最終 URL |
| --- | --- | --- | --- |
| `fleets.smarttransport.tw` | `drts-dev-platform-admin-web` | `/` | 直達或授權入口 |
| `ops.smarttransport.tw` | `drts-dev-ops-console-web` | `/` | 僅記錄實際 redirect chain |
| `partners.smarttransport.tw` | `drts-dev-fleet-partner-portal-web` | `/` | 僅記錄實際 redirect chain |
| `dispatch.smarttransport.tw` | `drts-dev-enterprise-dispatch-web` | `/` | 直達或授權入口 |
| `bank.smarttransport.tw` | `drts-dev-bank-console-web` | `/` | 直達或授權入口 |
| `channel.smarttransport.tw` | `drts-channel-partner-portal-web` | `/` | 僅記錄實際 redirect chain |
| `tenant.smarttransport.tw` | `drts-dev-tenant-console-web` | `/` | 僅記錄實際 login callback chain |
| `refer.smarttransport.tw` | `drts-dev-referral-embed-web` | `/embed/yuhe-residence` | 直達或授權入口 |
| `api.smarttransport.tw` | `drts-dev-api` | `/api/health` | 不得以 browser UI health 代替 API health |

`book.smarttransport.tw`（paused）、`ride.smarttransport.tw` 與 `concierge.smarttransport.tw`（retired）不是 active inventory，絕不新增到 mapping／驗收成功清單。外部 DNS 是否仍殘留只作 observation，不可反推它們應被重新啟用。

## 候選 SHA 的唯讀重現

```bash
BASE_SHA=$(git rev-parse origin/dev)
CANDIDATE_SHA=$(git rev-parse HEAD)
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode json > public-entry-${CANDIDATE_SHA}.json
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode table
```

JSON 一筆一筆記錄 DNS resolver 結果、direct／GFE TLS、HTTP initial/final status、最多五跳 redirect chain、兩個 Cloud Run inventory URL 與 final URL。`EAI_AGAIN` 是 resolver failure，必須 fail closed，不能當成 NXDOMAIN。DNS 結果只描述本次 resolver 觀察，不能宣稱是 GoDaddy authoritative state。

## 最小 live 變更與讀回（SR-LIVE-ENTRY-001）

取得網域 owner 與 `run.admin` 權限後，先保存現有 DNS record 和 domain mapping describe JSON。只對上表 9 個 active resource 逐項使用既有、idempotent 的 `operations/deployment/map-domain-service.sh`；該 shared script 不是本 task 的 write scope，故本候選沒有修改它。

```bash
PROJECT=nodal-alloy-503700-s3 REGION=us-central1
gcloud beta run domain-mappings list --region "$REGION" --project "$PROJECT"
gcloud beta run domain-mappings describe --domain fleets.smarttransport.tw --region "$REGION" --project "$PROJECT"
```

依每個 mapping 的 Google 指示更新 DNS，並讀回 record、TLS certificate、mapping `READY`、HTTP/redirect chain 及真實 OIDC callback。不要假設 CNAME 目標、固定 IP 或 status code 就是根因；`ghs.googlehosted.com` 與 historical IP `8.233.119.14` 僅是診斷工具會顯示的比較值。

## 回滾計畫

1. 停止下一個 DNS／mapping 變更，保存失敗時的 timestamp、resource ID 與 `gcloud ... describe` 輸出。
2. 還原變更前已保存的 DNS record set；不可憑本文件猜測舊 A/CNAME。
3. 若本次建立的 mapping 導致問題，依變更紀錄用既有 runbook 刪除該本次建立的 mapping，然後讀回確認；不要刪除 pre-existing mapping。
4. 再跑本工具並把 output 與 candidate SHA 附到 live task evidence；若無法完成 TLS、真實登入或 callback，明列為未完成，不宣告 recovery。

## 權限邊界與 Live Gate 說明

本 task 沒有 GoDaddy、GCP write、真機 browser 或測試 IdP credentials。因此不產出公網已修復、mapping 已建立或 callback 已通過的結論。offline mode 只驗證診斷程式的回歸契約，不能作 live acceptance 證據。
