# SR-PUBLIC-001 公開入口診斷與修復準備

本工具只讀；live 變更及真實登入驗收由 SR-LIVE-ENTRY-001 執行。
來源：R01/R29、C001/C124、task execution spec；歷史 audit `08b7a32…` 不代表目前程式。

目前 GitHub repository variables（2026-09-08 `gh variable list --json name,value`）:
`DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`、`DEV_GCP_REGION=us-central1`。
每次執行仍須讀回當下變數，不使用舊 runbook 的 `nodal-alloy-503700-s3`，
也不拼接歷史 `4t7rg6fmeq` 或 `lyo6ra57fq` URL suffix。
現有 deploy-dev.yml 已寫入 DRTS_CANDIDATE_SHA 並查詢 status.url；沿用它，不新增替代部署真值。

```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py \
  --project drts-dev-devcc-20260825 --region us-central1 \
  --base-sha 6f4ac8c74ae3618b6109efd010014365a85d36d8 > /tmp/sr-public-001.json
```

JSON 記錄執行 HEAD、工具 hash、dirty status、UTC、九個 resource ID、DNS 回覆、
SNI/hostname 驗證、環境 proxy 和直連 HTTP 結果及最終 URL。
不輸出 proxy URL／認證值、cookie、頁面內容或完整服務環境變數。
exit 1 代表至少有未通過／未取得的觀察，不能把取得報告當成功。
HTTP 200 也不是登入／業務驗收。直接 TLS 不經 HTTP proxy；兩者差異不能直接歸因憑證。
Cloud Run URL 僅從成功的 services list 取得；失敗填 unknown，不回退到歷史網址。
版本清單保存服務流量、實際承接流量的 revisions、image digest 和 labels；
部署 SHA 必須再與同次 Deploy - Dev 的 build candidate、image digest 核對，不能把工具 HEAD 當部署 SHA。

## 待 SR-LIVE-ENTRY-001 執行的最小修復與 rollback

1. 取得目前 project/region 的授權只讀工作階段，再執行工具。保存九個 mapping 的
   `spec.routeName`、conditions、resourceRecords；保存 DNS provider 的 RRset、TTL、
   zone ID 和現有 proxy 模式。未取得這些之前，不能判定是 DNS、憑證或 route 根因。
2. 比對工具 SERVICES（與 deploy-dev.yml 九個 active service 相同）。只有確認 mapping
   不存在且 service 在本 project 存在時，才由 live gate 使用既有
   `operations/deployment/map-domain-service.sh <domain> <service> us-central1 drts-dev-devcc-20260825`。
   helper 對認證／權限失敗會 fail closed；不要把錯誤改成 NOT_FOUND。
   若 mapping 已存在但指錯服務，先提附前後 routeName 的變更單；本任務不刪除重建。
3. DNS 必須採用該 mapping **實際回傳**的 resourceRecords，不能直接套歷史
   ghs.googlehosted.com 或某個 IP。若有第三方 proxy，保存設定後比較 proxy 與 origin
   TLS；只有取得兩端可重現差異，才提單一 hostname 的 proxy 模式／origin SNI 修正。
   記錄憑證 resource ID、SAN、到期日與 Ready/CertificateProvisioned conditions。
4. Tenant callback 的目前程式在 `apps/tenant-console-web/app/api/auth/[...auth]/route.ts`
   login 與 callback 都使用 request.nextUrl.origin；是否被 reverse proxy 改成 localhost
   必須真實請求證明，交 SR-TENANT-LOGIN-001 修復。核對
   `DEV_TENANT_CONSOLE_ORIGIN=https://tenant.smarttransport.tw` 的適用性，與即時 tenant
   status.url 一起進既有 deploy workflow 的 AUTH_ALLOWED_ORIGINS，IdP redirect URI
   為各獲准 origin 加 `/api/auth/tenant/callback`。禁止 wildcard 或 localhost production
   allowlist；不在此範圍外修改 auth code／workflow／repository variables。
5. 修正單必須附舊值→新值、資源 ID、TTL、操作者與時間；先單入口驗證，通過才逐一套用。
   重跑九入口、`api /health`、正式角色登入、IdP 往返、回原頁、logout、proxy API 回讀。
   未授權角色應拒絕，根頁 HTTP 200 不能替代這些檢查。
6. Rollback：DNS/proxy 回復事前 RRset/TTL/模式；新建 mapping 僅在確認本次建立且不再被使用後
   由 live gate 移除；既有 mapping 依事前 routeName 回復。
   callback/IdP allowlist 回復事前精確清單；若有部署變更，依保存的各服務
   `status.traffic`（含 split）回復到已驗證 revisions，不能只回 latestReadyRevisionName。
   復原後重跑相同診斷與角色旅程，保存時間及結果；本次未演練 rollback。

## 已知限制

本次 Cloud Run discovery 與 domain-mappings list 皆因 reauthentication required exit 1。
因此尚無可批准的精確 DNS/cloud 設定 patch，以上是依觀察分支的 runbook。
這是 SR-LIVE-ENTRY-001 的外部 gate，不是宣稱已修復公開入口。
最新成功 workflow run 的 SHA 也不保證目前服務未被其他操作修改，不能替代即時 revision 清單。
