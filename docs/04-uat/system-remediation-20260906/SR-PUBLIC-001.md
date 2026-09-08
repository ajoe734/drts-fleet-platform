# SR-PUBLIC-001 — 公开入口／callback／版本清單修復準備

- Owner: `Gemini`
- Reviewer: `Codex`
- Wave: `system-remediation-20260906`
- Gap IDs: `R01`, `R29`
- Capability IDs: `C001`, `C124`
- Reassignment Note: Chairman reassigned owner from Gemini2 to Gemini (Gemini2 exact lane capacity paused; terminal failure 1 time; reassigned to healthy Gemini, retaining independent reviewer Codex).
- Base SHA: `40ba315e4114369eaa7e12d35aae83a795c97b1d` (`origin/dev` at branch creation)
- Current `origin/dev` SHA: `3b60a3757238663572f16f010c94f446f2c71eaa` (verified no overlap with write scopes)
- Prior Branch Commits: `7ad94cfe7` (initial implementation), `c22646b66` (review round 1), `9f34a4be8` (review round 2)
- Current Candidate SHA: recorded at `handoff` time via `git rev-parse HEAD`
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

2. **TLS / HTTP 層重現**：
   - 直連靜態 A 紀錄：
     ```bash
     curl -Iv --connect-timeout 5 https://fleets.smarttransport.tw/
     # 輸出：OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to fleets.smarttransport.tw:443 (exit code 35)
     ```
   - 強制解析至 Google Anycast Front End (`108.177.97.121`)：
     ```bash
     curl -Iv --resolve fleets.smarttransport.tw:443:108.177.97.121 https://fleets.smarttransport.tw/
     # 輸出：Server certificate: CN=fleets.smarttransport.tw (valid), HTTP/2 404 Not Found
     ```
   - 證實 TLS 握手在 Google Edge 完全有效，核心瓶頸在於 Cloud Run domain mapping 路由轉發。

3. **Cloud Run Fallback 與文件漂移重現 (R29)**：
   - 陳舊文件 URL `4t7rg6fmeq` 實測回傳 HTTP 404。
   - 2026-09-08 候選即時實測觀測：歷史紀錄 `lyo6ra57fq` 在公網直連探測亦回傳 HTTP 404（因目標環境未將 revision 宣告公網開放，屬未決 Live Gate）。

4. **退休／暫停網域乾淨排除**：
   - `book.smarttransport.tw`, `ride.smarttransport.tw`, `concierge.smarttransport.tw` 實測皆為 `NXDOMAIN`。
   - 三者無 DNS 殘留，嚴禁納入 active surface。

### 1.3 Review Rejection (`7ad94cfe7`) 審查意見與修復項目

Codex 對 candidate `7ad94cfe7` 提出 3 項具體缺陷反饋，已修復完成：
1. **[P1] 診斷重現判定與修復驗收判定分離**（`diagnosis_passed` vs `recovery_passed`，引入 `--target {auto,diagnosis,recovery}`）。
2. **[P1] 有界重新導向鏈追蹤（Bounded Redirect Chain）與最終 URL 收集**（追蹤至多 5 跳，記錄中間狀態與最終 landing URL）。
3. **[P2] DNS 解析錯誤 fail-closed 防護**（`socket.EAI_AGAIN` 視為暫態故障，不誤判 clean NXDOMAIN）。

### 1.4 Review Rejection (`9f34a4be8`) 審查意見與修復項目

Codex 對 candidate `9f34a4be8` 提出 2 項具體 P1 審查反饋，本候選版本已徹底落實修復：

1. **[P1] 傳輸成功判定與終點響應完成檢驗（修復忽略 exit_code 與誤收終點 307）**：
   - **審查反饋**：`system-remediation-endpoints.py:663-669,737-742` 忽略 curl exit_code 且接受終點 307 為 healthy：當記憶體模擬 subprocess 回傳 exit 47 (`CURLE_TOO_MANY_REDIRECTS`)、HTTP 307、NUM_REDIRECTS 5 時，誤將 `active_healthy` 判定為 `True`。要求必須嚴格檢驗傳輸成功（`exit_code == 0`）且終點響應完成（`final_http_code == 200`，不可為 307 導向未決）；並新增重導向耗盡與逾時之回歸測試。
   - **修復實現**：
     - 在 `check_cloud_run_fallback` 中將 `active_healthy` / `stale_healthy` 約束為：`exit_code == 0`、`initial_http_code in [200, 307]` 且 `final_http_code == 200`。
     - 在 `diagnose_public_entries` 中將 `repaired_http` 約束為：`exit_code == 0`、`http_code in expected`、`final_http_code == 200` 且 `not broken_redirect`。
     - 若 curl `exit_code != 0`（如 exit 47、exit 28 逾時、exit 35 TLS 失敗）或終點非 200（如 terminal 307、404、500），皆標記 `broken_redirect = True` 並記錄 `HTTP_TRANSPORT_ERROR` / `FALLBACK_TRANSPORT_ERROR` / `REDIRECT_LAYER`。
     - 在 `public-endpoints-diagnostics.test.ts` 新增 4 個回歸測試（exit 47 重導向耗盡、exit 28 逾時、terminal 307 拒絕、exit 0 terminal 200 成功）。
     - 在 `public-endpoints-registry.test.ts` 更新 `evaluateRedirectChain` 嚴格要求 `finalCode === 200`。

2. **[P1] 移除 `lyo6ra57fq` 100% 存活與已驗證回滾之不實宣稱，標定未決 Live Gate**：
   - **審查反饋**：`public-entry-repair.md:27-29,140` 宣稱 `lyo6ra57fq` 目前 100% healthy 且為可用回滾，與 `SR-PUBLIC-001.md` Section 3.3C 2026-09-08 實測觀測（公網直連回傳 404）產生矛盾。要求將歷史成功宣稱替換為時間戳連結之 9 入口候選實測輸出與 GCP 權威服務／revision URL 驗證指令，或明確標定未決 live gate，嚴禁將失敗 URL 作為已驗證回滾。
   - **修復實現**：
     - 在 `public-entry-repair.md` Section 1.1 與 Section 2 更新時間戳為 `2026-09-08T12:34:02Z` 之 9 入口候選實測輸出，明確標示 `lyo6ra57fq` 在公網直連目前為 HTTP 404。
     - 在 Section 4 嚴正宣告 `LIVE-GATE-PUBLIC-ENTRY`，嚴禁將 404 URL 偽造為有效回滾。
     - 提供 `SR-LIVE-ENTRY-001` 在執行切換時使用之權威 GCP 查詢指令（`gcloud run services describe --format='value(status.url)'`）與 revision 回滾指令（`gcloud run services update-traffic --to-revisions`）。

---

## 2. 實作內容與可寫入範圍 (Write Scopes Implementation)

嚴格遵守任務規範，僅在指派之 `write_scopes` 範圍內交付：

1. **`tools/system-remediation/public-entry/system-remediation-endpoints.py`**：
   - 自動化分層診斷與評估工具，支援 live 模式與 offline/mock 模式（支援 `reproduced` 與 `repaired` 兩種模擬情境）。
   - 完整評估 4 個層次：
     1. DNS Resolution Layer（A 紀錄 vs CNAME `ghs.googlehosted.com.`、NXDOMAIN 檢查、`EAI_AGAIN` fail-closed）。
     2. TLS Layer（直接連線 TLS 握手 vs GHS Anycast SNI 握手與憑證檢驗）。
     3. HTTP/Routing Layer（HTTP 狀態碼、有界重導向鏈、最終 URL 與狀態碼、exit_code 0 嚴格檢核、terminal 307 拒絕）。
     4. Cloud Run Fallback Layer（健康探測與重導向解析、exit_code 檢核 vs 陳舊版本偵測）。
   - 支援 `--mode table` 輸出 Markdown 稽核矩陣、`--mode verify --target recovery` 與 `--mode verify --target diagnosis`。

2. **`docs/04-uat/system-remediation-20260906/public-entry-repair.md`**：
   - 記錄 9 入口 DNS/TLS/HTTP、重新導向目標與最終 URL 分層對照矩陣（具備 2026-09-08T12:34:02Z 候選時間戳）。
   - 提供供 `SR-LIVE-ENTRY-001` 執行的最小修復步驟（Cloud Run mapping 建立、GoDaddy DNS A 紀錄刪除與 CNAME 新增）。
   - 制定完整回滾計畫與權威 GCP 指令（查詢權威 URL、流量切回穩定 revision、DNS 快取清理、Cloud Run mapping 刪除）。
   - 明確標定權限界線與 Live Gate，不偽造成功。

3. **`tests/unit/system-remediation/sr-public-001/`**：
   - `public-endpoints-registry.test.ts`：
     - 鎖定 9 個 active public entries 契約（子網域、服務名稱、路徑、認證要求、預期重導向目標）。
     - 鎖定退休網域（book, ride, concierge）防回流契約。
     - 檢驗 R01/R29 錯誤分類邏輯、DNS fail-closed 分類規則與重導向健康度分類（終點 200 嚴格判定）。
   - `public-endpoints-diagnostics.test.ts`：
     - 測試 Python 診斷工具的離線執行、JSON 結構、Markdown 表格產出。
     - 測試重現判定（`--target diagnosis`）與修復驗收（`--target recovery`）分離驗證邏輯。
     - 測試模擬 307 下之有界重導向追蹤、Cloud Run fallback 重導向解析與破裂重導向偵測。
     - 測試 `socket.EAI_AGAIN` fail-closed 防護，確保解析器異常不被誤判為 clean NXDOMAIN。
     - 測試 curl exit 47 重導向耗盡、exit 28 逾時、terminal 307 拒絕、exit 0 terminal 200 回歸保護。
     - 測試修復 Runbook 文件的必要章節與關鍵字。

4. **`docs/04-uat/system-remediation-20260906/SR-PUBLIC-001.md`**（本交付文件）。

---

## 3. 驗證指令與測試證據 (Verification Evidence)

### 3.1 單元測試

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-public-001/
```
執行結果（2026-09-08 重驗）：
```
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-public-001

 Test Files  2 passed (2)
      Tests  26 passed (26)
   Start at  12:36:23
   Duration  2.07s (transform 157ms, setup 0ms, import 213ms, tests 1.71s, environment 0ms)
```
Exit Code: `0` (26 項測試全部通過)

### 3.2 程式碼格式與差異檢查

```bash
git diff --check
```
Exit Code: `0` (無任何空白、換行或格式違規)

### 3.3 Python 診斷工具各模式驗證

#### A. 離線重現檢核 (`--target diagnosis`)
```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --offline --mode verify --target diagnosis
```
執行結果：
```
=== SR-PUBLIC-001 Verification Check ===
Target phase: diagnosis
Active entries count: 9 (expected: 9)
R01 reproduced (exit 35 on direct A record): True
R29 reproduced (stale URL 404, active lyo6ra57fq healthy): True
Diagnosis reproduction passed: True
Recovery acceptance passed: False
Retired domains clean NXDOMAIN: True
All Cloud Run active healthy: True
Status: PASS (Diagnosis reproduction verified: defects R01 and R29 confirmed; retired domains clean; Cloud Run fallbacks healthy)
```
Exit Code: `0`

#### B. 離線修復驗收檢核 (`--target recovery`)
```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --offline --mock-state repaired --mode verify --target recovery
```
執行結果：
```
=== SR-PUBLIC-001 Verification Check ===
Target phase: recovery
Active entries count: 9 (expected: 9)
R01 reproduced (exit 35 on direct A record): False
R29 reproduced (stale URL 404, active lyo6ra57fq healthy): True
Diagnosis reproduction passed: False
Recovery acceptance passed: True
Retired domains clean NXDOMAIN: True
All Cloud Run active healthy: True
Status: PASS (Recovery acceptance verified: all 9 entries healthy on DNS/TLS/HTTP with bounded redirects; retired domains clean)
```
Exit Code: `0`

#### C. 即時 Live 探測觀測記錄（2026-09-08 實測）
```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode table
```
實測觀測真值：
1. **Public DNS & TLS (R01)**：全部 9 個公開子網域在 GoDaddy 權威 NS 仍指向過期 A 紀錄 `8.233.119.14`，curl 直連 100% 重現 exit 35（`SSL_ERROR_SYSCALL`）。
2. **GHS SNI 憑證**：透過 Google Anycast IP 握手，全部 9 個子網域皆取得 Google Trust Services 簽發之有效 TLS 憑證，GFE 回傳 HTTP 404（domain mapping 待 live 配置）。
3. **防污染邊界**：`book`, `ride`, `concierge` 實測皆為 clean `NXDOMAIN`。
4. **Cloud Run Fallback (R29)**：舊文件 `4t7rg6fmeq` 實測 HTTP 404；目前 dev 部署環境（`lyo6ra57fq`）在公網目前亦回傳 HTTP 404（待環境啟用／部署後生效）。
5. **Live Gate**：公網 DNS 紀錄變更與 Cloud Run mapping 配置交由具備授權帳號的 `SR-LIVE-ENTRY-001` 執行，不冒充公網真機已上線。

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
