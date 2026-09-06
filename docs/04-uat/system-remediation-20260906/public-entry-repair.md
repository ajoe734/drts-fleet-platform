# 公開入口／callback／版本清單修復準備與 Runbook (SR-PUBLIC-001)

**更新日期：** 2026-09-06
**任務編號：** `SR-PUBLIC-001`
**任務負責人：** `Gemini`
**審查人：** `Codex`
**關聯缺陷與能力：** R01, R29 / C001, C124
**前置任務：** 無（根任務）
**後續 Live 驗收任務：** `SR-LIVE-ENTRY-001` (blocked, 需 authorized credentials)

---

## 1. 摘要與分層診斷現況 (Layered Diagnostic Summary)

在 2026-09-06 基準 SHA `40ba315e4114369eaa7e12d35aae83a795c97b1d` 上，透過 `tools/system-remediation/public-entry/system-remediation-endpoints.py` 針對 9 個正式公開入口及已退休／暫停網域進行了分層（DNS、TLS、HTTP/Routing、Cloud Run Fallback）實測診斷。

### 1.1 核心診斷結論

1. **R01 重現與根因定位（公開域名 HTTPS 連線失敗）**：
   - **DNS 層**：Authoritative Name Server（GoDaddy `ns37.domaincontrol.com`, `ns38.domaincontrol.com`）對全部 9 個子網域配置了靜態 A 紀錄指向 `8.233.119.14`（Google Cloud 歷史／過期外部 IP），而**未配置** CNAME 指向 `ghs.googlehosted.com.`。DNS 解析若遇暫時性解析器異常（如 `socket.EAI_AGAIN`）嚴守 fail-closed，不誤判為 clean。
   - **TLS 層（直接連線）**：對 `8.233.119.14:443` 發起 TLS Client Hello 會遭遇 TCP/TLS 重設（`SSL_connect: SSL_ERROR_SYSCALL`，curl exit code 35，HTTP 000）。這完全吻合 R01 原始稽核報告中的重現結果。
   - **TLS 層（透過 Google Anycast IP 測試）**：若將子網域直接解析至 Google Front End (`ghs.googlehosted.com` 即 `108.177.97.121:443`)，TLS 握手**完全成功**，並取得由 Google Trust Services 簽發之有效 SSL 憑證（例如 `CN=fleets.smarttransport.tw`，有效期限 2026-08-01 至 2026-10-30）。
   - **路由／Cloud Run Domain Mapping 層**：雖然 Google Edge 已有有效憑證，但轉發至內部服務時回傳 HTTP 404，表明 Cloud Run domain-mapping 尚未正確路由到現行有效 revision 或專案 mapping 需要重新宣告。

2. **R29 重現與現行版本真值（文件入口與實際部署版本不一致）**：
   - 文件與部分測試中記載的 Cloud Run URL 尾綴 `4t7rg6fmeq-uc.a.run.app` 已全面失效（所有 9 個服務皆回傳 HTTP 404）。
   - 透過 2026-09-03 部署日誌與 live 探測確認：**現行真正存活且健康的 Cloud Run URL 尾綴為 `lyo6ra57fq-uc.a.run.app`**。
   - 經全量探測，9 個服務在 `lyo6ra57fq-uc.a.run.app` 上 **100% 存活且正常響應**。有界重新導向追蹤顯示：API、Admin、Referral、Dispatch、Bank 等回傳 200；Ops、Partner、Channel 回傳 307 導向 `/dashboard`（最終 URL 200）；Tenant 回傳 307 導向 `/login?redirect_uri=%2F`（最終 URL 200），登入重導向路徑健康無破裂。

3. **退休與暫停網域防污染審核**：
   - `book.smarttransport.tw`：自 2026-08-01 起 PAUSED，實測 DNS 為 `NXDOMAIN`（乾淨排除，不屬於 active surface）。
   - `ride.smarttransport.tw`：2026-06-16 RETIRED，實測 DNS 為 `NXDOMAIN`（乾淨排除）。
   - `concierge.smarttransport.tw`：2026-06-16 RETIRED，實測 DNS 為 `NXDOMAIN`（乾淨排除）。
   - 結論：舊 domain 無殘留污染，不需要且嚴禁於本修復中重建。

---

## 2. 9 個公開入口分層對照表 (Authoritative 9-Entry Matrix)

| # | 子網域 | Cloud Run 服務名稱 | 角色 / 用途 | 驗證路徑 | 目前 Public DNS (A) | 公網直連 TLS / HTTP | GHS Anycast TLS / HTTP | 重新導向目標與最終 URL | 現行 Cloud Run URL (`lyo6ra57fq`) | 陳舊 URL (`4t7rg6fmeq`) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `fleets.smarttransport.tw` | `drts-dev-platform-admin-web` | 平台管理員 / 車隊管理 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | 無重導向 (HTTP 200) | `https://drts-dev-platform-admin-web-lyo6ra57fq-uc.a.run.app/` (HTTP 200) | HTTP 404 (失效) |
| 2 | `ops.smarttransport.tw` | `drts-dev-ops-console-web` | 營運中心 / 調度員 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | `307 -> /dashboard` (HTTP 200) | `https://drts-dev-ops-console-web-lyo6ra57fq-uc.a.run.app/dashboard` (HTTP 200) | HTTP 404 (失效) |
| 3 | `partners.smarttransport.tw` | `drts-dev-fleet-partner-portal-web` | 車行夥伴門戶 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | `307 -> /dashboard` (HTTP 200) | `https://drts-dev-fleet-partner-portal-web-lyo6ra57fq-uc.a.run.app/dashboard` (HTTP 200) | HTTP 404 (失效) |
| 4 | `dispatch.smarttransport.tw` | `drts-dev-enterprise-dispatch-web` | 企業派車 / 預約 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | 無重導向 (HTTP 200) | `https://drts-dev-enterprise-dispatch-web-lyo6ra57fq-uc.a.run.app/` (HTTP 200) | HTTP 404 (失效) |
| 5 | `bank.smarttransport.tw` | `drts-dev-bank-console-web` | 銀行後臺 / 接送審查 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | 無重導向 (HTTP 200) | `https://drts-dev-bank-console-web-lyo6ra57fq-uc.a.run.app/` (HTTP 200) | HTTP 404 (失效) |
| 6 | `channel.smarttransport.tw` | `drts-channel-partner-portal-web` | 渠道夥伴門戶 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | `307 -> /dashboard` (HTTP 200) | `https://drts-channel-partner-portal-web-lyo6ra57fq-uc.a.run.app/dashboard` (HTTP 200) | HTTP 404 (失效) |
| 7 | `tenant.smarttransport.tw` | `drts-dev-tenant-console-web` | 企業租戶後臺 | `/` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | `307 -> /login?redirect_uri=%2F` (HTTP 200) | `https://drts-dev-tenant-console-web-lyo6ra57fq-uc.a.run.app/login?redirect_uri=%2F` (HTTP 200) | HTTP 404 (失效) |
| 8 | `refer.smarttransport.tw` | `drts-dev-referral-embed-web` | 推薦嵌入乘客 | `/embed/yuhe-residence` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | 無重導向 (HTTP 200) | `https://drts-dev-referral-embed-web-lyo6ra57fq-uc.a.run.app/embed/yuhe-residence` (HTTP 200) | HTTP 404 (失效) |
| 9 | `api.smarttransport.tw` | `drts-dev-api` | 後端核心 API / BFF | `/api/health` | `8.233.119.14` | Exit 35 (SSL Error) | Cert: Valid / HTTP 404 | 無重導向 (HTTP 200) | `https://drts-dev-api-lyo6ra57fq-uc.a.run.app/api/health` (HTTP 200) | HTTP 404 (失效) |

### 退休／暫停網域（嚴格防回流清單）

| 子網域 | 服務狀態 | 策略說明 | DNS 觀測真值 |
|---|---|---|---|
| `book.smarttransport.tw` | PAUSED | 2026-08-01 起暫停，不包含於 active surface | `NXDOMAIN` (合規) |
| `ride.smarttransport.tw` | RETIRED | 2026-06-16 起退休，由 referral-embed 取代 | `NXDOMAIN` (合規) |
| `concierge.smarttransport.tw` | RETIRED | 2026-06-16 起退休 | `NXDOMAIN` (合規) |

---

## 3. 最小修復執行步驟 (Step-by-Step Runbook for SR-LIVE-ENTRY-001)

本修復涉及外部公網 DNS（GoDaddy）與 GCP Cloud Run 專案權限，受 Live Gate 保護，本任務（`SR-PUBLIC-001`）完成診斷、工具及設定腳本準備，交付由 `SR-LIVE-ENTRY-001` 在具備授權帳號下執行。

### 步驟 1：Cloud Run Domain Mapping 建立與校正 (GCP Side)

在 GCP 專案 `nodal-alloy-503700-s3`（Region `us-central1`）執行現有經審查之腳本：

```bash
PROJECT=nodal-alloy-503700-s3
REGION=us-central1

# 確認當前帳號具有 run.admin 權限
gcloud auth list

# 逐一對 9 個 active 服務更新/建立 domain mapping
./operations/deployment/map-domain-service.sh fleets.smarttransport.tw     drts-dev-platform-admin-web       "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh ops.smarttransport.tw        drts-dev-ops-console-web          "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh partners.smarttransport.tw   drts-dev-fleet-partner-portal-web "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh dispatch.smarttransport.tw   drts-dev-enterprise-dispatch-web "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh bank.smarttransport.tw       drts-dev-bank-console-web        "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh channel.smarttransport.tw    drts-channel-partner-portal-web  "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh tenant.smarttransport.tw     drts-dev-tenant-console-web      "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh refer.smarttransport.tw      drts-dev-referral-embed-web      "$REGION" "$PROJECT"
./operations/deployment/map-domain-service.sh api.smarttransport.tw        drts-dev-api                     "$REGION" "$PROJECT"

# 檢查 mapping 狀態
gcloud beta run domain-mappings list --region "$REGION" --project "$PROJECT"
```

### 步驟 2：公網權威 DNS 修正 (GoDaddy DNS Management)

登入 GoDaddy DNS 管理後臺（針對網域 `smarttransport.tw`）：

1. **刪除舊有失效 A 紀錄**：
   - 刪除 Host 為 `fleets`, `ops`, `partners`, `dispatch`, `bank`, `channel`, `tenant`, `refer`, `api` 且 Points to 為 `8.233.119.14` 的 A 紀錄。
2. **新增標準 Cloud Run CNAME 紀錄**：
   - Type: `CNAME`
   - Name: `fleets` -> Target: `ghs.googlehosted.com.`
   - Name: `ops` -> Target: `ghs.googlehosted.com.`
   - Name: `partners` -> Target: `ghs.googlehosted.com.`
   - Name: `dispatch` -> Target: `ghs.googlehosted.com.`
   - Name: `bank` -> Target: `ghs.googlehosted.com.`
   - Name: `channel` -> Target: `ghs.googlehosted.com.`
   - Name: `tenant` -> Target: `ghs.googlehosted.com.`
   - Name: `refer` -> Target: `ghs.googlehosted.com.`
   - Name: `api` -> Target: `ghs.googlehosted.com.`
   - TTL: 設定為 `600` 秒（10 分鐘，便於驗證與必要時快速回滾）。

### 步驟 3：分層讀回驗收 (Readback Verification)

利用本任務建立之專用診斷工具進行全自動檢核：

```bash
# 輸出 9 入口分層狀態表與最終 URL
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode table

# 執行修復後驗收（嚴格檢核 DNS CNAME、TLS 握手、HTTP 狀態碼、重新導向鏈與退休網域 clean NXDOMAIN）
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode verify --target recovery

# （備用）缺陷重現檢核（用於回滾後或重現階段確認）：
# python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode verify --target diagnosis
```

驗收標準：
1. 9 個子網域 DNS 皆能查得 CNAME `ghs.googlehosted.com.` 或 Google Anycast IP，舊 A 紀錄 `8.233.119.14` 完全清除。DNS 若遇暫時性解析異常（`socket.EAI_AGAIN`）嚴格維持 fail-closed，不冒充 clean。
2. 直接發起 `curl -Iv https://<subdomain>.smarttransport.tw` 不再出現 exit 35，取得預期狀態碼（200 或 307）。
3. 具備認證要求之服務（ops, partners, channel, tenant）其 307 重導向之 Location 與最終 URL 正確解析（例如 `/dashboard`、`/login`）且終點響應 HTTP 200，無破裂導向迴圈。
4. `book`, `ride`, `concierge` 維持 clean `NXDOMAIN`。

---

## 4. 回滾計畫 (Rollback Plan)

若 DNS 變更或 Cloud Run 域名映射在切換過程中引發不可預期之路由崩潰或憑證簽發失敗，執行以下安全回滾程序：

### 4.1 業務流量降級 (Traffic Fallback)
各前端與客戶端立即切換至現行直連 Cloud Run URL（`*-lyo6ra57fq-uc.a.run.app`），此軌道已實測 100% 正常，具備完整高可用能力：
- Platform Admin: `https://drts-dev-platform-admin-web-lyo6ra57fq-uc.a.run.app/`
- Ops Console: `https://drts-dev-ops-console-web-lyo6ra57fq-uc.a.run.app/`
- Enterprise Dispatch: `https://drts-dev-enterprise-dispatch-web-lyo6ra57fq-uc.a.run.app/`
- Referral Embed: `https://drts-dev-referral-embed-web-lyo6ra57fq-uc.a.run.app/embed/yuhe-residence`
- Core API: `https://drts-dev-api-lyo6ra57fq-uc.a.run.app/api/health`

### 4.2 DNS 回滾操作
在 GoDaddy DNS 控制臺將 9 個子網域之 CNAME 紀錄暫停或改回原始狀態，或將 TTL 設為最低（300 秒）以加速快取清除。

### 4.3 Cloud Run 映射回滾
若特定服務之 mapping 出現配置衝突：
```bash
gcloud beta run domain-mappings delete --domain <subdomain>.smarttransport.tw --region us-central1 --project nodal-alloy-503700-s3 --quiet
```

---

## 5. 權限邊界與 Live Gate 說明

依據專案架構規範（`docs/ops/branch-strategy.md` 與 `docs/03-runbooks/system-remediation-20260906/SR-PUBLIC-001.md`）：
- **SR-PUBLIC-001** 職責：
  1. 完成唯讀分層診斷（DNS、TLS、HTTP、Cloud Run）。
  2. 建立自動化稽核與驗收工具 `system-remediation-endpoints.py`，完整支援重現檢驗與修復驗收兩階段。
  3. 提供可被 code review 的修復設定、Runbook 與 Rollback 計畫。
  4. 產出單元測試守護網，封鎖失效網域回流與確認正確現行版本。
- **SR-LIVE-ENTRY-001** 職責：
  1. 取得真實 GCP 專案管理授權與 GoDaddy DNS 控制權。
  2. 執行前述 Step 1 與 Step 2 之 live 變更。
  3. 產出真實 live candidate SHA、公網 DNS/TLS 讀回紀錄與真機瀏覽器驗收日誌。
- 本任務**不假定根因已自動解決**，**不在無權限帳號下強行發起寫入**，嚴守狀態與安全邊界。
