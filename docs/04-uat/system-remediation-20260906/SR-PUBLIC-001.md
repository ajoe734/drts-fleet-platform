# SR-PUBLIC-001 — 公开入口／callback／版本清單修復準備

- Owner: `Gemini`
- Reviewer: `Codex`
- Wave: `system-remediation-20260906`
- Gap IDs: `R01`, `R29`
- Capability IDs: `C001`, `C124`
- Base SHA: `40ba315e4114369eaa7e12d35aae83a795c97b1d` (`origin/dev` at branch creation)
- Candidate SHA: recorded at `handoff` time via `git rev-parse HEAD`
- Branch: `gemini/sr-public-001`

---

## 1. Audit Source (2026-09-06) vs. Reproduction at Base SHA

### 1.1 原始稽核問題與能力定義

`docs/04-uat/system-remediation-20260906/source/findings.json`:
- **R01**（角色：全部對外角色，優先序 P0）：
  > 9個自訂網址無法建立HTTPS連線。重現步驟與實際結果：開 fleets/ops/partners/dispatch/tenant/bank/channel/refer/api.smarttransport.tw；Chromium connection closed、curl exit35，未取得HTTP回應。
- **R29**（角色：維運／驗收人員，優先序 P2）：
  > 文件入口與實際部署版本不一致。重現步驟與實際結果：文件4t7rg6fmeq服務URL404；需從9/3成功部署日誌取lyo6ra57fq入口。建議修正及驗收：部署自動輸出單一服務清單與SHA，健康檢查使用真實角色旅程。

`docs/04-uat/system-remediation-20260906/source/capabilities.json`:
- **C001**（領域：入口與身份，能力：從正式公開網址進入服務）：
  > 狀態：故障。目前證據與限制：9 個公開入口在本測試位置 TLS 連線失敗；dev 備援可用。缺口／下一個驗收條件：恢復公開域名後從外網重跑登入和主要工作；定位 DNS／TLS／路由原因。
- **C124**（領域：品質與營運保障，能力：部署版本、health、業務驗收與回滾）：
  > 狀態：驗收缺口。目前證據與限制：9/3 dev SHA 已確認；部分結案文件仍指舊 URL／舊 billing gate。缺口／下一個驗收條件：以目前各服務版本與可重跑用戶旅程作發布門檻；記錄 rollback 演練。

### 1.2 Base SHA `40ba315e4` 實測重現與分層根因定位

在 Base SHA 上執行即時分層診斷，精確重現並定位問題：

1. **DNS 層重現**：
   - 查詢 authoritative NS（GoDaddy `ns37.domaincontrol.com` / `ns38.domaincontrol.com`）：
     ```bash
     host -t A fleets.smarttransport.tw
     # 輸出：fleets.smarttransport.tw has address 8.233.119.14
     host -t CNAME fleets.smarttransport.tw
     # 輸出：fleets.smarttransport.tw has no CNAME record
     ```
   - 9 個子網域（`fleets`, `ops`, `partners`, `dispatch`, `bank`, `channel`, `tenant`, `refer`, `api`）全部帶有過期的靜態 A 紀錄 `8.233.119.14`，皆無 CNAME `ghs.googlehosted.com.`。

2. **TLS / HTTP 層重現 (R01)**：
   - 直接連線：
     ```bash
     curl -Iv https://fleets.smarttransport.tw --max-time 5
     # 輸出：curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to fleets.smarttransport.tw:443
     ```
   - 9 個子網域公網直連 100% 重現 curl exit 35、SSL_ERROR_SYSCALL，與 R01 描述完全相符。
   - 透過 Google Anycast IP (`108.177.97.121`) 測試 SNI 握手：
     ```bash
     curl -Iv --resolve fleets.smarttransport.tw:443:108.177.97.121 https://fleets.smarttransport.tw/ --max-time 5
     # 輸出：SSL connection using TLSv1.3. Server certificate: CN=fleets.smarttransport.tw (Google Trust Services). HTTP/2 404
     ```
   - 證實 Google Edge 已簽發有效 SSL 憑證，但 Cloud Run domain-mapping 尚未導通至現行 revision（回傳 HTTP 404）。

3. **Cloud Run 現行版本與文件漂移重現 (R29)**：
   - 探測舊文件中記載的 `*-4t7rg6fmeq-uc.a.run.app`：
     全部 9 個服務皆回傳 **HTTP 404**（已失效）。
   - 探測 2026-09-03 部署日誌記載的 `*-lyo6ra57fq-uc.a.run.app`：
     - `drts-dev-api/api/health`: **HTTP 200**
     - `drts-dev-platform-admin-web/`: **HTTP 200**
     - `drts-dev-ops-console-web/`: **HTTP 307** (安全重導向登入)
     - `drts-dev-fleet-partner-portal-web/`: **HTTP 307** (安全重導向登入)
     - `drts-dev-tenant-console-web/`: **HTTP 307** (安全重導向登入)
     - `drts-dev-bank-console-web/`: **HTTP 200**
     - `drts-dev-referral-embed-web/embed/yuhe-residence`: **HTTP 200**
     - `drts-dev-enterprise-dispatch-web/`: **HTTP 200**
     - `drts-channel-partner-portal-web/`: **HTTP 307** (安全重導向登入)
   - 證實：`lyo6ra57fq-uc.a.run.app` 為目前真實有效之 Cloud Run 環境，9 個服務 100% 存活。

4. **防污染檢查（退休與暫停網域）**：
   - `book.smarttransport.tw`（2026-08-01 起 PAUSED）：實測 `NXDOMAIN`。
   - `ride.smarttransport.tw`（2026-06-16 起 RETIRED）：實測 `NXDOMAIN`。
   - `concierge.smarttransport.tw`（2026-06-16 起 RETIRED）：實測 `NXDOMAIN`。
   - 三者無 DNS 殘留，嚴禁納入 active surface。

---

## 2. 實作內容與可寫入範圍 (Write Scopes Implementation)

嚴格遵守任務規範，僅在指派之 `write_scopes` 範圍內交付：

1. **`tools/system-remediation/public-entry/system-remediation-endpoints.py`**（新建）：
   - 自動化分層診斷與評估工具，支援 live 模式與 offline/mock 模式。
   - 完整評估 4 個層次：
     1. DNS Resolution Layer（A 紀錄 vs CNAME `ghs.googlehosted.com.`、NXDOMAIN 檢查）。
     2. TLS Layer（直接連線 TLS 握手 vs GHS Anycast SNI 握手與憑證檢驗）。
     3. HTTP/Routing Layer（HTTP 狀態碼、重新導向路徑）。
     4. Cloud Run Fallback Layer（`lyo6ra57fq` 現行版本健康探測 vs `4t7rg6fmeq` 陳舊版本偵測）。
   - 支援 `--mode table` 輸出 Markdown 稽核矩陣、`--mode verify` 輸出自動判定結果。

2. **`docs/04-uat/system-remediation-20260906/public-entry-repair.md`**（新建）：
   - 記錄 9 入口 DNS/TLS/HTTP 與最終 URL 分層對照矩陣。
   - 提供供 `SR-LIVE-ENTRY-001` 執行的最小修復步驟（Cloud Run mapping 建立、GoDaddy DNS A 紀錄刪除與 CNAME 新增）。
   - 制定完整回滾計畫（業務流量導向 `lyo6ra57fq` 直連 URL、DNS 快取清理、Cloud Run mapping 刪除）。
   - 明確標定權限界線與 Live Gate，不偽造成功。

3. **`tests/unit/system-remediation/sr-public-001/`**（新建）：
   - `public-endpoints-registry.test.ts`：
     - 鎖定 9 個 active public entries 契約（子網域、服務名稱、路徑、認證要求）。
     - 鎖定退休網域（book, ride, concierge）防回流契約。
     - 檢驗 R01 與 R29 之錯誤分類邏輯。
   - `public-endpoints-diagnostics.test.ts`：
     - 測試 Python 診斷工具的離線執行、JSON 結構、不變量判定與 Markdown 表格產出。
     - 測試修復 Runbook 文件的必要章節與關鍵字（R01, R29, C001, C124, SR-LIVE-ENTRY-001, 回滾計畫等）。

4. **`docs/04-uat/system-remediation-20260906/SR-PUBLIC-001.md`**（本交付文件）。

---

## 3. 驗證指令與測試證據 (Verification Evidence)

### 3.1 單元測試

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-public-001/
```
執行結果：
```
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-public-001

 Test Files  2 passed (2)
      Tests  13 passed (13)
   Start at  14:38:43
   Duration  1.20s (transform 226ms, setup 0ms, import 484ms, tests 566ms, environment 1ms)
```
Exit Code: `0`

### 3.2 程式碼格式與差異檢查

```bash
git diff --check
```
Exit Code: `0` (無任何空白、換行或格式違規)

### 3.3 Python 診斷工具驗收

```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --offline --mode verify
```
執行結果：
```
=== SR-PUBLIC-001 Verification Check ===
Active entries count: 9 (expected: 9)
R01 reproduced (exit 35 on direct A record): True
R29 reproduced (stale URL 404, active lyo6ra57fq healthy): True
Retired domains clean NXDOMAIN: True
All Cloud Run active healthy: True
Status: PASS (Diagnosis and inventory complete; live gate preserved)
```
Exit Code: `0`

```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode verify
```
執行結果（Live 探測）：
```
=== SR-PUBLIC-001 Verification Check ===
Active entries count: 9 (expected: 9)
R01 reproduced (exit 35 on direct A record): True
R29 reproduced (stale URL 404, active lyo6ra57fq healthy): True
Retired domains clean NXDOMAIN: True
All Cloud Run active healthy: True
Status: PASS (Diagnosis and inventory complete; live gate preserved)
```
Exit Code: `0`

---

## 4. 外部資源與 Live Gate 交接邊界 (Live Gate Handover)

依據驗收與守則規範，本任務（`SR-PUBLIC-001`）屬於實作準備（Implementation / Preparation），**未執行的 Live／真機操作**明列如下：

1. **未在 GoDaddy DNS 控制臺修改公網 A / CNAME 紀錄**：
   - 原因：需要網域所有者之 GoDaddy 管理權限。
   - 交接對象：`SR-LIVE-ENTRY-001`（具備 `public_dns_tls_readback` 驗收門檻）。
2. **未在 GCP 雲端直接執行 `gcloud beta run domain-mappings create`**：
   - 原因：需要具備 `run.admin` 權限之合法 GCP Service Account 憑證（WIF）。
   - 交接對象：`SR-LIVE-ENTRY-001`（具備 `authorized_environment_change` 驗收門檻）。
3. **未以真實企業 IdP / OIDC / MFA 執行端到端登入**：
   - 原因：需要合法之測試租戶 OIDC 憑證與電話驗證。
   - 交接對象：`SR-LIVE-ENTRY-001` 與 `SR-QA-IDENTITY-001`。

本任務嚴格不以 fixture 假造公網成功，亦不在無權帳號強行變更，以完整的診斷矩陣、自動化工具與可回滾 Runbook 完成交接準備。
