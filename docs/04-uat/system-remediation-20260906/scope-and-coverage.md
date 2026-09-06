# 系統缺口整改 — 排除範圍與全能力追溯驗收表 (SR-SCOPE-001)

**文件版本**：2026-09-06 | **Owner**：Gemini2 | **Reviewer**：Gemini
**工作分支**：`gemini2/sr-scope-001` | **執行工作區**：`/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-scope-001`
**當前 Base SHA**：`a4876ac529abfb634c2b96f237116202abf3d87d`（origin/dev 最新提交）
**歷史 Audit SHA**：`08b7a32f6fdaa00d8d1894f91569a7d72860cec2`（2026-09-03/06 歷史觀察基準，非當前程式碼真值）

---

## 1. 導言與系統整改治理原則

本文件為 DRTS 2026-09-06 系統修復波（`system-remediation-20260906`）之全能力追溯驗收總表，嚴格覆蓋：
- **原 30 項系統審計問題**（R01–R30，來源 `docs/04-uat/system-remediation-20260906/source/findings.json`）
- **新增 14 項產品缺口**（N01–N14，來源 `docs/04-uat/system-remediation-20260906/source/new-gaps.json`）
- **全 134 項業務能力**（C001–C134，來源 `docs/04-uat/system-remediation-20260906/source/capabilities.json` 及 `coverage.json`）
- **71 個平行整改任務**（定義於 `tools/task-dispatch/manifests/system-remediation-20260906.json`）

### 核心執行紀律 (Machine Truth Discipline)
1. **嚴禁假造完成**：沿用權威 API 與關聯式資料模型，不以 fixture 假造成功、不以固定百分比（例如假 100% 覆蓋率）掩蓋空資料、不以假憑證密碼學簽章或假郵件/簡訊/推播送達代替真實交付。
2. **歷史 Audit SHA 界線**：歷史 audit SHA `08b7a32f6fdaa00d8d1894f91569a7d72860cec2` 僅為初次盤點之歷史快照；後續已由其他修復任務落地者（如 FIX-P5-RECORDS-001、SR-ADMIN-VERIFY-001、DRV 8 項等），均在當前 base 提交回歸與重驗證據，嚴禁回退或重造既有成果。
3. **共用檔案單一寫入邊界**：共用 contracts 僅由 `SR-CONTRACT`、依賴與 lockfile 僅由 `SR-DEPS`、根模組與新功能導航僅由 `SR-WIRE` 整合。各任務僅修改各自 declared 之 `write_scopes`，嚴禁平行修改中央 test config、lockfile、shared exports 或全域 routes。
4. **外部 Live 隔離邊界**：9 個外部 Live 驗收任務保持 `blocked`，未獲正式雲端/金融/商標/電信授權前不得解鎖；`SR-RELEASE-001` 僅代表隔離 local/dev 閉環通過，絕不因 dev 閉環通過而誤關外部 live 驗收或冒充正式上線。`SR-ACCEPT-001` 必須等待所有 9 個 live 任務與 `UV-EXEC-028` 外部真 PSTN 電話驗證完備。

---

## 2. 七項明確範圍排除項 (Seven Scope Exclusions — Kept Undeveloped)

依據 Phase 1 產品架構決議及邊界定義，以下 7 項能力列為**範圍排除（維持不開發）**。其 `implementation_tasks` 維持為空 `[]`，驗收統一由 `SR-SCOPE-001` 鎖定邊界，任何整改任務均不得擅自重開或建構產品實作：

### 1. C126 — 獨立 Partner Booking 網站
- **領域／角色**：範圍邊界 ／ 銀行卡友自助預約
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：repo-classification 標註為 `paused`。404 為站點暫停之已知狀態，不列為現行商用交付缺陷。
- **邊界與承接**：Phase 1 不重啟 Partner Booking 獨立前台；若未來需要重啟，需經由新的渠道切換機制與獨立身份授權架構決策。銀行合作之商務預約需求由 Enterprise Portal 或專屬白牌合作對接承接。

### 2. C127 — 舊 Passenger／Concierge／Assisted 入口
- **領域／角色**：範圍邊界 ／ 一般乘客／現場代叫者
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：目前分類為 `retired`。歷史系統拓撲已變更，DRTS Phase 1 部署架構明確排除舊版大眾 B2C Passenger APP 及現場 Concierge Web。
- **邊界與承接**：不可把舊 app 源碼留在 repository 中當成可用商用產品，亦不得重啟舊端點。大眾預約需求由企業入口、無人語音（UV-EXEC 系列）或調度台現場人工代叫承接。

### 3. C128 — AV／ODD／Tesla 接管與遠端營運
- **領域／角色**：範圍邊界 ／ ROC／安全操作員
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：`ROC candidate` 與 `Phase 2` 規劃。repo 中雖有部分實驗性遠端控制與遙測程式，但明確歸入 Phase 2。
- **邊界與承接**：保留獨立 Phase 2 驗收矩陣，嚴禁將其列為 Phase 1 漏做之正式商用功能缺陷。Phase 1 專注於合法真人計程車與車隊之調度履約。

### 4. C129 — Phase 1 filing PDF 主報告與 ZIP 送件包
- **領域／角色**：範圍邊界 ／ 監理送件承辦
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：架構決策 `SD-DP-20260820-012` 明確核定採 `metadata-only` 申報機制；filing 不產出實體 ZIP 送件包或單一合併 PDF 主報告。
- **邊界與承接**：此排除完全不影響 9 項監理法定資料報表（C091–C099 由 `SR-REPORT-001` 實體產生 CSV/XLSX/PDF 及資料匯出）；維持人工與外部主管機關之送件責任人流程，嚴禁假造「ZIP 包下載」按鈕或冒稱已有實體包可下載。

### 5. C130 — 獨立 regulator realm 與正式監理入口
- **領域／角色**：範圍邊界 ／ 監理機關使用者
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：架構決策 `SD-DP-20260820-012` 同一決議接受由平臺內部授權管理人員依權限匯出法定資料，不另建獨立 `regulator realm` 或監理機關專用登入站點。
- **邊界與承接**：監理稽核資料由 Platform Admin 依內部角色授權交付主管機關。不得以「缺乏獨立監理機關網站」作為系統缺陷。

### 6. C131 — 獨立事件匯流排與 13 態轉單模型
- **領域／角色**：範圍邊界 ／ 背景事件消費者
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：架構決策 `SD-DP-20260820-009`、`SD-DP-20260820-010` 接受 Phase 1 不引入獨立分散式 Event Bus（如額外 Kafka 集群），沿用關聯式資料庫交易事務（Postgres UoW / transactional outbox）與已核定之標準 8 態生命週期模型。
- **邊界與承接**：轉態測試必須依核定之 8 態契約執行，禁止沿用舊架構 13 態草案差異作為未實現功能之缺陷回報。

### 7. C132 — 逾時自動升級
- **領域／角色**：範圍邊界 ／ 租戶簽核管理員
- **狀態**：`範圍排除`（維持不開發）
- **決策依據**：API 與 OpenAPI 規格已明確標註為 `Phase 2 deferred`。
- **邊界與承接**：Phase 1 簽核流程僅支援租戶管理員手動人工升級（manual escalation）；逾時自動升級背景排程維持不開發。而接近逾時之提醒郵件與 UI 警示則由缺口 N07 及 `SR-MAIL-002` 具體實作。

---

## 3. 外部門禁項目 (External Gate Item — C133)

### C133 — 司機／發行管理員：提領、商店公開上架與商用簽章
- **狀態**：`外部待完成`（External Gate）
- **驗收責任**：`SR-READINESS-001` (Gemini2), `SR-SCOPE-001` (Gemini2), `SR-LIVE-DRIVER-001` (Codex)
- **邊界與說明**：
  - 司機「提領」功能為「若平臺開放」之條件功能，需金融收單與出金渠道正式開通。
  - Apple App Store 及 Google Play Store 之公開商店上架與商用 Production 簽章，明確列為外部 Gate。
  - 嚴禁以本機模擬或假簽章冒充通過；若未開通，則保持 Gate 阻擋，不視為 Phase 1 程式功能之內部缺失。

---

## 4. 特殊業務驗收約束：旅行社／保險等「只 enum 不得 pass」(C032)

### C032 — 旅行社／保險代步服務：非核心產品的獨立業務閉環
- **驗收任務**：`SR-QA-BOOKING-001`（責任 Owner: Codex2）
- **核心約束鐵律**：**「旅行社/保險等只 enum 不得 pass！」**
- **驗收要求**：
  1. **禁止 Enum 假通過**：TypeScript 定義中雖然存在 `travel_agency_transfer` 與 `insurance_replacement` 等 enum 字符串，但單純型別存在**絕不等於**業務功能完成。
  2. **必填欄位核對**：
     - 旅行社接送：必須包含團號（tour code）、旅客名冊（roster）、旅客人數、行李件數、多點接送、舉牌資訊。
     - 保險理賠代步：必須包含出險案號（claim number）、保單號碼（insurance policy）、代步期間、指定維修廠或醫療院所。
  3. **完整業務閉環**：必須核對資格檢核（eligibility verification）、專屬計價模型（非一般跳錶計費，含包車/保險理賠額度扣抵）、調度指派（車型與行李相符）、對帳月結（旅行社團費結算、保險公司批次對帳）。若缺少後端具體修復 child 任務，應如實記錄缺口，嚴禁直接宣告驗收通過。

---

## 5. 已合併修復項目之 Source 與 Recheck 對照表 (R03, R04, DRV 8 項)

在 2026-09-06 基準版本前，已有部分重大審計問題與司機端改善完成合併。以下明列其修復來源（Source Commit / PR）以及在整改波中的重驗任務（Recheck Task），確保不因歷史審計記錄而重做，亦不因 dev 閉環通過而遺漏實機/回歸驗證：

| 編號 / 項目 | 問題與修復說明 | 歷史 Audit 狀態 | Source Commit / PR | Current Dev Recheck 任務與證據 |
|---|---|---|---|---|
| **R03 / C093** | P5 行程紀錄查詢缺少 `multi_taxi_records:read` scope 導致 403 拒絕 | 故障（403 缺權限） | `4675ff47a` (PR #1617 / FIX-P5-RECORDS-001) | `SR-ADMIN-VERIFY-001` (PR #1638 / `feaf5c7f2`)：配置合法 scope，修正覆蓋率計算（非空才顯示），重跑 root vitest 與 browser-check 通過 |
| **R04 / C101** | 車隊夥伴清單重新整理時 `.map is not a function` 崩潰 | 故障（.map 崩潰） | `4675ff47a` (PR #1617 / FIX-P5-RECORDS-001) | `SR-ADMIN-VERIFY-001` (PR #1638 / `feaf5c7f2`)：解析 ApiClient 列表封套，失敗狀態與空清單分開，防止將 403/503 吞為空陣列 |
| **DRV-AUTH-001** | 單一 Token 生命週期：儲存、恢復、單飛刷新、全域 401/403 攔截 | 待重構 | `332db5119` (PR #1586) | `SR-DRIVER-WEB-001` / `SR-QA-DRIVER-001`：驗證 token 輪替與過期登出，不回退既有成果 |
| **DRV-NAV-001** | 根導航器底部 Tab 欄與 Route Shell 持久化 | 待改進 | `1d4f34d92` (PR #1587) | `SR-DRIVER-WEB-001` / `SR-WIRE-001`：整合新模組導航，保留 DriverBottomTabBar 成果 |
| **DRV-SOS-001** | SOS 緊急通報回報至平臺後端，絕不誤撥手機 110/119 dialer | 安全缺口 | `6f5d34510` (PR #1588) | `SR-DRIVER-WEB-001` / `SR-QA-DRIVER-001`：Web 與 Native 均驗證 SOS 事件向後端派發 |
| **DRV-KBD-001** | 共用 Keyboard-Avoiding 容器，支援 iOS 與 Android 鍵盤避讓 | 佈局缺口 | `a095698a6` (PR #1589) | `SR-DRIVER-WEB-001` / `SR-QA-DRIVER-001`：表單輸入不被虛擬鍵盤遮擋 |
| **DRV-TEXT-001** | 司機端 UI 清理內部系統代碼與整合技術術語，統一為司機專用文案 | 文案缺口 | `f6875dd23` (PR #1590) | `SR-ENV-COPY-001` / `SR-QA-DRIVER-001`：使用者友善提示，去除 debug 專用字樣 |
| **BE-DRV-AUTHZ-001** | 後端 API 服務端嚴格校驗司機身份與操作授權 | 權限缺口 | `bdc4d8658` (PR #1591) | `SR-IAM-001` / `SR-QA-IDENTITY-001`：驗證跨司機存取 403 阻擋與 Session binding |
| **DRV-AUTH-002** | 單一 Session 權限路由守衛與離線敏感資料清除 | 安全缺口 | `42d06673f` (PR #1592) | `SR-DRIVER-WEB-001` / `SR-QA-DRIVER-001`：多裝置登入踢除與敏感快取清除 |
| **DRV-RWD-001** | 響應式佈局與溢出修正（Code-level RWD） | 顯示缺口 | `bdd7af68b` (PR #1593) | `SR-DRIVER-WEB-001` / `SR-QA-UX-001`：小螢幕與摺疊機型元件自適應 |

---

## 6. 外部 Live 任務與 Dev 閉環隔離清單 (9 External Live Tasks + UV-EXEC-028)

9 個外部 Live 驗收任務在整改波中均設定為 `initial_status: "blocked"` 且 `external_gate: true`。其依賴關係受嚴密保護：
- `SR-RELEASE-001` **絕不依賴**任何 Live 任務，僅負責本機與 dev 環境之自動化測試閉環。
- `SR-ACCEPT-001` **必須等待** `SR-RELEASE-001`、全部 9 個 Live 任務及 `UV-EXEC-028` 完成，才能宣告全系統上線完成。

| 任務 ID | 任務標題 | 責任 Owner | 獨立 Reviewer | 初始狀態 | 外部 Gate 依賴與封鎖原因 |
|---|---|---|---|---|---|
| **SR-LIVE-ENTRY-001** | 公開入口和正式角色登入驗收 | Codex | Codex2 | blocked | 正式外部公開網址 DNS/TLS 憑證、真實企業 IdP/OIDC/MFA 帳號 |
| **SR-LIVE-MAIL-001** | 邀請與簽核真郵件驗收 | Claude | Claude2 | blocked | 外部真實 SMTP/SES 郵件傳輸伺服器與真實收件匣驗收 |
| **SR-LIVE-PUSH-001** | 真裝置乘客通知驗收 | Gemini | Gemini2 | blocked | Apple APNs / Google FCM 伺服器金鑰與已註冊真手機推播 |
| **SR-LIVE-DOC-001** | 正式受控檔案與銀行密碼學驗證驗收 | Codex2 | Codex | blocked | 外部雲端受控存儲桶（Cloud Storage）與銀行專用 RSA/ECDSA 密碼學金鑰 |
| **SR-LIVE-FINANCE-001** | 金流／issuer／ERP sandbox整合驗收 | Claude2 | Claude | blocked | 銀行發卡行 API Sandbox、真金流閘道與企業 ERP 對接環境 |
| **SR-LIVE-MAP-001** | 真地圖／定位／ETA驗收 | Gemini2 | Gemini | blocked | Google Maps / Mapbox 商業授權金鑰與真車輛 GPS 定位訊號 |
| **SR-LIVE-DRIVER-001** | Android／iOS native生命周期驗收 | Codex | Codex2 | blocked | 實體 iOS (TestFlight) / Android 實機、真後台背景運行與權限 |
| **SR-LIVE-FORWARD-001** | 第三方轉單正式sandbox回執驗收 | Claude | Claude2 | blocked | 第三方平台（如 Grab / 合作叫車方）正式 Sandbox 契約與驗簽回執 |
| **SR-LIVE-OPS-001** | 部署排程／備份還原與容量驗收 | Gemini | Gemini2 | blocked | 真 GCP 雲端權限、跨區備份還原災難復原演練、多節點壓力容量負載 |
| **UV-EXEC-028** | 真實 PSTN、逐語言、轉接與容量驗證 | Gemini | Codex | blocked | 外部電信線路 PSTN 專線接入、SIP trunk、多國語音轉發與容量 |

---

## 7. 全 134 項能力追溯與最終驗收擁有者矩陣 (Complete 134 Capabilities Traceability Matrix)

本表為 134 項業務能力之權威追溯矩陣。每個非排除項均明確指派具體之實作任務、驗收任務以及**最終驗收擁有者（Final Verification Owner Agent）**：

| ID | 領域 | 角色 | 能力／應完成工作 | 狀態 (state_at_audit) | 來源問題/缺口 | 實作任務 | 驗收任務與最終擁有者 | 驗收條件／排除理由 |
|---|---|---|---|---|---|---|---|---|
| C001 | 入口與身份 | 所有外部使用者 | 從正式公開網址進入服務 | 故障 | R01, R29 | SR-READINESS-001, SR-PUBLIC-001 | SR-QA-IDENTITY-001 (Claude), SR-LIVE-ENTRY-001 (Codex) | 恢復公開域名後從外網重跑登入和主要工作；定位 DNS／TLS／路由原因 |
| C002 | 入口與身份 | 租戶管理員 | OIDC 登入及返回業務頁 | 故障 | R02 | SR-TENANT-LOGIN-001 | SR-QA-IDENTITY-001 (Claude) | 修正環境 callback；真實租戶帳號登入、登出、重登入 |
| C003 | 入口與身份 | 平臺／營運人員 | IAP／SSO 與 MFA 正式登入 | 待驗證 | IAM | — | SR-QA-IDENTITY-001 (Claude), SR-LIVE-ENTRY-001 (Codex) | 以正式身份驗證 realm、MFA、未授權拒絕；不以 demo 成功替代 |
| C004 | 入口與身份 | 銀行三種角色 | 登入後進入正確首頁 | 故障 | R06 | SR-BANK-001 | SR-QA-IDENTITY-001 (Claude) | 各 persona 從登入入口到業務頁全程成功 |
| C005 | 入口與身份 | 銀行營運檢視／財務 | 金額欄位依角色隔離 | 故障 | R15 | SR-BANK-002, SR-IAM-001 | SR-QA-IDENTITY-001 (Claude) | 固定政策後驗證頁面、API、匯出三層遮罩 |
| C006 | 入口與身份 | 租戶人員管理者 | 邀請→收到信→啟用→重寄／撤銷 | 實作缺口 | N06 | SR-NOTIFY-001, SR-MAIL-001 | SR-QA-IDENTITY-001 (Claude), SR-LIVE-MAIL-001 (Claude) | 接真正郵件 transport，記送達／失敗／重試；測過期、撤銷與單次使用 |
| C007 | 入口與身份 | 平臺人員管理者 | 人員查詢與工作階段管理 | 故障 | R05 | SR-IAM-001 | SR-QA-IDENTITY-001 (Claude) | 修正角色 scope 及失敗重試；以自己的 session 驗證撤銷 |
| C008 | 入口與身份 | 租戶營運／財務／技術／唯讀 | 角色最小權限與選單／API 一致 | 待驗證 | IAM,TEN | — | SR-QA-IDENTITY-001 (Claude) | 分開帳號驗證各角色允許與拒絕、唯讀不可寫 |
| C009 | 入口與身份 | 跨租戶／跨車行使用者 | 資源歸屬隔離與匯出隔離 | 待驗證 | IAM | — | SR-QA-IDENTITY-001 (Claude) | A、B 租戶與車行交叉查 ID、列表、檔案、搜索、通知均隔離 |
| C010 | 入口與身份 | 平臺安全管理員 | 停權／離職立即失效與金鑰輪替 | 待驗證 | IAM | — | SR-QA-IDENTITY-001 (Claude) | 驗證舊 session、refresh token、API key 在跨實例立即拒絕 |
| C011 | 入口與身份 | 特權申請／核准人 | 臨時角色、四眼核准、到期回收 | 待驗證 | IAM | — | SR-QA-IDENTITY-001 (Claude) | 兩位不同身份、拒絕自批、到期收回、失敗告警；依 Stage 1.5 驗收 |
| C012 | 入口與身份 | 車主 Host | 只看自有車輛收益／維保／任務／案件 | 未完整落地 | N03 | SR-DESIGN-001, SR-CONTRACT-001, SR-HOST-BE-001, SR-HOST-FE-001, SR-WIRE-001 | SR-QA-NEWFEATURES-001 (Gemini) | 確認 Host 登入與所有權授權落點，補受限 read model 和操作驗收 |
| C013 | 預約與乘客 | 企業員工／行政代訂 | 查看歷史與既有預約詳情 | 已測片段 | R08, R24 | SR-FLEET-DATA-001, SR-ENTERPRISE-DATA-001, SR-ENTERPRISE-SEARCH-001 | SR-QA-BOOKING-001 (Codex2) | 補查詢條件與大量資料分頁；未等同建立到結算完成 |
| C014 | 預約與乘客 | 企業預約者 | 填寫預約、必填檢核、最後確認 | 已測片段 | ENT | — | SR-QA-BOOKING-001 (Codex2) | 提交至獨立測試租戶後回讀，確認只建立一筆 |
| C015 | 預約與乘客 | 自己預約／代訂者 | 乘客資料、聯絡人與舉牌同步 | 故障 | R20 | SR-ENTERPRISE-FORM-001 | SR-QA-BOOKING-001 (Codex2) | 檢查自訂／代訂、語系與 review／訂單快照一致 |
| C016 | 預約與乘客 | 企業預約者 | 過去日期、最短提前時間與改期限制 | 故障 | R21 | SR-ENTERPRISE-FORM-001 | SR-QA-BOOKING-001 (Codex2) | 企業與 multi-taxi 各通道分開驗證 UI/API 邊界；勿宣稱 backend 完全缺檢核 |
| C017 | 預約與乘客 | 企業乘客 | 首頁／行程／詳情與實際訂單一致 | 故障 | R08 | SR-ENTERPRISE-DATA-001 | SR-QA-BOOKING-001 (Codex2) | 同一 booking ID 跨頁回讀；無資料呈空狀態 |
| C018 | 預約與乘客 | 行程中乘客 | 聯絡司機、企業客服及求助 | 故障 | R09 | SR-ENTERPRISE-DATA-001 | SR-QA-BOOKING-001 (Codex2) | 有效電話／支援入口，未派司機時有合理狀態 |
| C019 | 預約與乘客 | 手機企業使用者 | 手機填單、確認與可讀排版 | 故障 | R22 | SR-ENTERPRISE-FORM-001 | SR-QA-BOOKING-001 (Codex2) | 手機真機、鍵盤、長姓名和錯誤訊息不溢出 |
| C020 | 預約與乘客 | 社區住戶 | 合法 signed handoff 進入嵌入叫車 | 故障 | R07 | SR-REFERRAL-001 | SR-QA-BOOKING-001 (Codex2) | 由真實合作方產生 handoff，在正式容器完成；無合法 token 案例不宣稱已驗證 |
| C021 | 預約與乘客 | 社區住戶 | 嵌入失敗的獨立叫車 fallback | 故障 | R07 | SR-REFERRAL-001 | SR-QA-BOOKING-001 (Codex2) | 設定可用獨立入口，保存來源與返回脈絡 |
| C022 | 預約與乘客 | 轉介乘客 | 即時報價→送單→續接→取消→評分／收據 | 待驗證 | REF | — | SR-QA-BOOKING-001 (Codex2) | 以同一 order 跑完整流程、重整續接及取消時點 |
| C023 | 預約與乘客 | 乘客通知接收者 | 派車／到達／異動通知實際送達 | 外部待完成 | N10 | SR-PUSH-001, SR-READINESS-001 | SR-QA-BOOKING-001 (Codex2), SR-LIVE-PUSH-001 (Gemini) | 接供應商憑證與 adapter，驗證裝置收信、去重、失敗重試 |
| C024 | 預約與乘客 | 租戶預約管理員 | 租戶建單／修改／取消與歷程 | 待驗證 | TEN,OWN | — | SR-QA-BOOKING-001 (Codex2) | 分別驗證 cutoff、不可改狀態、並發修改、取消補償 |
| C025 | 預約與乘客 | 租戶簽核人 | 送審→核准／駁回→人工升級 | 待驗證 | TEN,OWN | — | SR-QA-BOOKING-001 (Codex2) | 不同角色核准與拒絕後，訂單／額度／稽核一致 |
| C026 | 預約與乘客 | 簽核通知接收者 | 收到新申請／接近逾時／決定 Email | 實作缺口 | N07 | SR-NOTIFY-001, SR-MAIL-002 | SR-QA-BOOKING-001 (Codex2), SR-LIVE-MAIL-001 (Claude) | 接真正寄信服務及送達證據；in-app 與 Email 状態分開 |
| C027 | 預約與乘客 | 租戶營運管理員 | 預約乘客、常用地址與成本中心 | 待驗證 | TEN | — | SR-QA-BOOKING-001 (Codex2) | 新建、更新、引用、刪除中資料、權限與配額連動 |
| C028 | 預約與乘客 | 租戶管理員 | 額度、用車規則、服務方案、SLA | 待驗證 | TEN | — | SR-QA-BOOKING-001 (Codex2) | 跨月／時區／不足額度／取消返還與違規申請 |
| C029 | 預約與乘客 | 銀行方案管理員 | 卡友資格／權益／人工審查 | 外部待完成 | BANK,GATE | — | SR-QA-BOOKING-001 (Codex2), SR-LIVE-FINANCE-001 (Claude2) | issuer sandbox 的有效／無效／逾時／重送與授權引用 |
| C030 | 預約與乘客 | 銀行營運 | 卡友預約列表與狀態篩選 | 已測片段 | BANK | — | SR-QA-BOOKING-001 (Codex2) | 正式角色與真資料的大量分頁、PII遮罩、詳情 |
| C031 | 預約與乘客 | 機場接送乘客／客服 | 航班異動、等待、加價與取消規則 | 待驗證 | PRD,ENT | — | SR-QA-BOOKING-001 (Codex2) | 確認航班資料來源、延誤重排與等待費用回算，無來源時明確人工流程 |
| C032 | 預約與乘客 | 旅行社／保險代步服務 | 非核心產品的獨立業務閉環 | 待驗證 | PRD,PRODUCT | — | SR-QA-BOOKING-001 (Codex2) | 按產品核對必填、eligibility、計價、調度、對帳；不能以 enum 代表完成 |
| C033 | 預約與乘客 | 第三方平臺方 | 轉派單接入／接受／拒絕／完成回傳 | 外部待完成 | FORWARD,GATE | — | SR-QA-BOOKING-001 (Codex2), SR-LIVE-FORWARD-001 (Claude) | 真合作契約、驗簽、sandbox 消息與回執閉環 |
| C034 | 預約與乘客 | 第三方平臺方 | 取消競態、失去搶單與第三方收據歸屬 | 待驗證 | FORWARD,DECISION | — | SR-QA-BOOKING-001 (Codex2), SR-LIVE-FORWARD-001 (Claude) | 重複 webhook、先取消後完成、多平臺競態與外部 receipt reference |
| C035 | 調度與營運 | 調度員 | 任務清單→詳情→候選車查詢 | 已測片段 | OPS | — | SR-QA-DISPATCH-001 (Claude2) | 測可派／不可派候選與新單到達更新 |
| C036 | 調度與營運 | 調度員 | 人工派車、改派、撤回及並發占用 | 待驗證 | OWN,OPS | — | SR-QA-DISPATCH-001 (Claude2) | 同一車不能雙派；重派舊任務失效並保留原因 |
| C037 | 調度與營運 | 排班／預約 scheduler | 時間到自動釋放預約／提醒／升級 | 驗收缺口 | OWN | — | SR-QA-DISPATCH-001 (Claude2) | 保存 scheduler 配置、兩個到期批次、重啟／多實例去重與失敗告警 |
| C038 | 調度與營運 | 即時 matcher／SLA monitor | 自動匹配、超時、無供給與恢復 | 驗收缺口 | OWN,OPS | — | SR-QA-DISPATCH-001 (Claude2) | 不用人工點 API 等待一次超時；恢復供給後一致收斂 |
| C039 | 調度與營運 | 排班站點／調度員 | 排班佇列 check-in／out、順序與例外 | 待驗證 | OWN,OPS | — | SR-QA-DISPATCH-001 (Claude2) | 多車排隊、公平順序、離線剔除、重複簽入和手動覆寫 |
| C040 | 調度與營運 | 地圖調度員 | 可讀地圖、位置與車輛態勢 | 故障 | R17 | SR-OPS-MAP-001 | SR-QA-DISPATCH-001 (Claude2) | 修正圖磚並驗證有效／逾時 GPS、圖列表同步 |
| C041 | 調度與營運 | 多平臺司機／調度員 | presence 占用與回復可派狀態 | 待驗證 | PRESENCE | — | SR-QA-DISPATCH-001 (Claude2) | 他平臺接單、斷線與過期 heartbeat 不會重複派車 |
| C042 | 調度與營運 | 營運主管 | 出勤、營收、維保看板 | 已測片段 | EXPANDED | — | SR-QA-DISPATCH-001 (Claude2) | 逐筆回連來源、篩選／匯出及空值與0區別 |
| C043 | 調度與營運 | 客服話務人員 | 通話建檔、caller 查找、轉訂單／客訴 | 待驗證 | CALL | — | SR-QA-CALL-001 (Gemini2) | 用同一 call ID 走建單和案件關聯、防重複建單 |
| C044 | 調度與營運 | CTI／錄音 callback 來源 | 真電話接入、排隊、錄音與補件 | 外部待完成 | CALL,GATE | — | SR-QA-CALL-001 (Gemini2), UV-EXEC-028 (Gemini) | 真來電／失敗／延遲錄音／補件／保存與授權播放 |
| C045 | 調度與營運 | 客訴專員 | 分類→指派→調查→回覆→結案／重開 | 待驗證 | COMPLAINT,OPS | — | SR-QA-CALL-001 (Gemini2) | 完成與重開同一案件，依角色驗證時間、責任和通知 |
| C046 | 調度與營運 | 事故處理員 | 事故→責任／附件→限制派車→恢復 | 待驗證 | INCIDENT | — | SR-QA-CALL-001 (Gemini2) | 實際附件、處置、供給鎖定與解除同步，保留版本 |
| C047 | 調度與營運 | SOS 值班人員 | 收警→認領→處置→解除與回執 | 待驗證 | SOS | — | SR-QA-CALL-001 (Gemini2) | 真機到值班臺延遲、重送去重、背景斷線與未處置升級 |
| C048 | 調度與營運 | 營運使用者 | 跨應用追查與助理工作協作 | 故障 | R18, R19 | SR-OPS-SHELL-001 | SR-QA-DISPATCH-001 (Claude2) | 保持角色、ID和來源跨 app 連結；助理可關不遮操作 |
| C049 | 司機 | 新司機 | 文件建檔、送審與核准後開通 | 待驗證 | R30 | SR-DRIVER-WEB-001 | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 真機上傳、退件補件、身份與駕駛資格一致 |
| C050 | 司機 | 換機／遺失裝置司機 | 裝置綁定、解綁、復原與 session 更新 | 待驗證 | DRIVER,IAM | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 真機單裝置政策、撤銷、跨裝置與離線恢復 |
| C051 | 司機 | 值勤司機 | 上／下線、班次歷史與出勤計時 | 待驗證 | SHIFT | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 真機跨日、重複上線、停權、維保禁派與漏傳車輛條件 |
| C052 | 司機 | 司機／排班主管 | 請假申請、審核與班表聯動 | 實作缺口 | N01 | SR-DESIGN-001, SR-CONTRACT-001, SR-LEAVE-BE-001, SR-LEAVE-FE-001, SR-WIRE-001 | SR-QA-NEWFEATURES-001 (Gemini) | 補申請、撤回、核准／駁回、重疊班次與可派狀態 |
| C053 | 司機 | 接單司機 | 收新任務、接受／拒絕與逾時 | 待驗證 | DRIVER,OWN | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 真機背景接單、拒單理由、過期任務與雙派防護 |
| C054 | 司機 | 執行行程司機 | 出發→到達→開始→完成／取消 | 待驗證 | DRIVER,OWN | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 相同 trip ID 各端同步；非法跳步、重按和失聯恢復 |
| C055 | 司機 | 司機／乘客簽收者 | 照片／簽收證明與完成條件 | 待驗證 | DRIVER,OWN | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 必要照片缺漏不得完成，離線補傳與檔案授權回讀 |
| C056 | 司機 | 司機 | 背景定位、導航、離線排隊與重連 | 待驗證 | DRIVER | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | Android/iOS 真機權限、殺程序、弱網、時間序列去重 |
| C057 | 司機 | 司機 | 收益日週月、服務費與補助追溯 | 待驗證 | DRIVER,BILL | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 完成單與計價版本、跨月彙總及本人限定存取 |
| C058 | 司機 | 司機 | 下載自己的 statement／收據 | 驗收缺口 | N04 | SR-ARTIFACT-001, SR-INVOICE-001 | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 確認實際 bytes、有效下載連結與他人拒絕，逐種檔案驗收 |
| C059 | 司機 | 司機 | 教學影片、SOP、測驗與完訓紀錄 | 實作缺口 | N02 | SR-DESIGN-001, SR-CONTRACT-001, SR-ACADEMY-BE-001, SR-ACADEMY-FE-001, SR-WIRE-001 | SR-QA-NEWFEATURES-001 (Gemini) | 課程／作答／成績／重考／到期重訓與服務資格連動 |
| C060 | 司機 | 司機 | 個資、通知偏好與裝置自檢 | 待驗證 | DRIVER | — | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 真機保存與重啟回讀，偏好真實影響通知 |
| C061 | 司機 | 證照到期司機／主管 | 到期提醒與禁止接單 | 待驗證 | N07 | SR-NOTIFY-001, SR-MAIL-002 | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | T-30／T-7／到期通知真正送達；到期自動禁派 |
| C062 | 司機 | 開發驗證人員 | Web 預覽作為基本巡檢入口 | 故障 | R30 | SR-DRIVER-WEB-001 | SR-QA-DRIVER-001 (Codex), SR-LIVE-DRIVER-001 (Codex) | 修正平臺載入分流後重跑；不能當作 native 崩潰證據 |
| C063 | 車行與供給 | 車行營運主管 | 總覽 KPI 與司機／車輛清單一致 | 故障 | R10 | SR-FLEET-DATA-001 | SR-QA-SUPPLY-001 (Claude) | 統一來源、明確資料時間、錯誤與空資料展示 |
| C064 | 車行與供給 | 供給建檔人員 | 新增司機／車輛與主要操作入口 | 故障 | R11 | SR-FLEET-DATA-001 | SR-QA-SUPPLY-001 (Claude) | 各入口導向同一有效表單和回讀 |
| C065 | 車行與供給 | 供給建檔人員 | 文件上傳→檢查→送件→退補／重送 | 待驗證 | SUPPLY | — | SR-QA-SUPPLY-001 (Claude) | 真檔案 bytes、掃描狀態、覆蓋版本與過期補件 |
| C066 | 車行與供給 | 平臺供給審核員 | 受理／核可／駁回／revision 衝突 | 已測片段 | EXPANDED,SUPPLY | — | SR-QA-SUPPLY-001 (Claude) | 不同審核人競態、舊 revision 拒絕、核可寫 canonical registry |
| C067 | 車行與供給 | 車行案件人員 | 回覆事故／申訴與 SLA | 實作缺口 | R12 | SR-FLEET-CASE-001 | SR-QA-SUPPLY-001 (Claude) | 補對指定案件回覆與附件，Ops timeline 即時回讀 |
| C068 | 車行與供給 | 車行財務 | statement 查詢／確認／爭議處理 | 故障 | R13 | SR-FLEET-SETTLE-001 | SR-QA-FINANCE-001 (Gemini) | 對帳來源一致；可下載、確認與爭議寫入後回讀 |
| C069 | 車行與供給 | 車行查詢使用者 | 有效狀態／趟次篩選與匯出 | 故障 | R24, R11 | SR-FLEET-DATA-001, SR-ENTERPRISE-SEARCH-001 | SR-QA-SUPPLY-001 (Claude) | 篩選 query、總數、分頁與 CSV 同條件 |
| C070 | 車行與供給 | 手機／低視力建檔者 | 可讀表單、欄位標籤與離頁保護 | 故障 | R23, R25 | SR-FLEET-FORM-001 | SR-QA-SUPPLY-001 (Claude) | 鍵盤、焦點、對比與草稿／未存提示 |
| C071 | 車行與供給 | 車行訓練管理員 | 看真完訓率與逾期名單 | 實作缺口 | N02 | SR-DESIGN-001, SR-CONTRACT-001, SR-ACADEMY-BE-001, SR-ACADEMY-FE-001, SR-WIRE-001 | SR-QA-NEWFEATURES-001 (Gemini) | 串課程／學員資料，能下鑽到單一人員證據 |
| C072 | 車行與供給 | 車隊／法遵管理員 | 保險、證照、委託合約與排他性 | 待驗證 | REGISTRY | — | SR-QA-SUPPLY-001 (Claude) | 過期、重複有效委託、退場與文件缺漏均阻擋派車 |
| C073 | 車行與供給 | 退場管理員 | 終止委託、下架與 debranding 閉環 | 待驗證 | REGISTRY | — | SR-QA-SUPPLY-001 (Claude) | 保存工單與完成證據，退場車不得重新出現在候選 |
| C074 | 帳務與金流 | 平臺財務 | 支付訂單與 reconciliation 案件查詢 | 已測片段 | EXPANDED,BILL | — | SR-QA-FINANCE-001 (Gemini) | 按同一來源單驗證計算與結案；未實際提交 |
| C075 | 帳務與金流 | 平臺財務 | 重新收款／退款／作廢真實執行 | 外部待完成 | BILL | — | SR-QA-FINANCE-001 (Gemini), SR-LIVE-FINANCE-001 (Claude2) | 真金流 sandbox 的成功／失败／重復callback、衝正與查詢 |
| C076 | 帳務與金流 | 定價／費用管理者 | 費率草稿、比較、發布與不可變快照 | 已測片段 | EXPANDED,BILL | — | SR-QA-FINANCE-001 (Gemini) | 新版本只影響新單；併發發布原子性和原因稽核 |
| C077 | 帳務與金流 | 租戶財務 | 抬頭、統編、請款設定及期間結算 | 待驗證 | TEN,BILL | — | SR-QA-FINANCE-001 (Gemini) | 設定回讀、閉帳期、來源 trips 與金額復算 |
| C078 | 帳務與金流 | 租戶財務 | 可下載真正的帳單 PDF | 實作缺口 | N04 | SR-ARTIFACT-001, SR-INVOICE-001 | SR-QA-FINANCE-001 (Gemini), SR-LIVE-DOC-001 (Codex2) | 保存可讀 PDF bytes 與金額校驗；過期後可換發 |
| C079 | 帳務與金流 | 租戶財務 | 月結帳單寄送與失敗追蹤 | 驗收缺口 | N04, N07 | SR-NOTIFY-001, SR-ARTIFACT-001, SR-MAIL-002, SR-INVOICE-001 | SR-QA-FINANCE-001 (Gemini), SR-LIVE-MAIL-001 (Claude) | 串帳單附件／安全連結與寄信，依收件人確認回執 |
| C080 | 帳務與金流 | 平臺出納 | 代墊批次、核准、匯出與付款狀態 | 待驗證 | BILL,EXPANDED | — | SR-QA-FINANCE-001 (Gemini) | 用測試批次驗證完整状態；不可自己批准受限動作 |
| C081 | 帳務與金流 | 出納／覆核人 | 上傳與查驗匯款證明原檔 | 實作缺口 | N09 | SR-PROOF-001 | SR-QA-FINANCE-001 (Gemini) | 受控上傳、類型與掃描、歸屬、存在性、可回讀再標已付 |
| C082 | 帳務與金流 | 銀行財務 | 真 statement CSV 下載與資料一致 | 已測片段 | BANK | — | SR-QA-FINANCE-001 (Gemini) | 正式角色、來源期間與批次總額校驗 |
| C083 | 帳務與金流 | 銀行財務／稽核 | 摘要／簽章真實可驗證 | 故障 | R14 | SR-BANK-003 | SR-QA-FINANCE-001 (Gemini), SR-LIVE-DOC-001 (Codex2) | 使用真 SHA-256 與可驗公鑰簽章或停止宣稱；獨立驗證 bytes |
| C084 | 帳務與金流 | 銀行財務 | 正確開立日、到期日與帳期 | 故障 | R28 | SR-BANK-001 | SR-QA-FINANCE-001 (Gemini) | 以後端 immutable 日期與帳期，不取頁面當日 |
| C085 | 帳務與金流 | 銀行方案管理員 | 合約、使用量、方案與人員管理 | 故障 | R06 | SR-BANK-001 | SR-QA-FINANCE-001 (Gemini) | 從首頁到合約、變更、角色回讀全程有效 |
| C086 | 帳務與金流 | 通路財務 | 用量→分潤→對帳明細→CSV | 已測片段 | CHANNEL | — | SR-QA-FINANCE-001 (Gemini) | 增加真實期間與爭議／衝正對照 |
| C087 | 帳務與金流 | 通路營運主管 | 總覽匯出 | 故障 | R26 | SR-CHANNEL-001 | SR-QA-FINANCE-001 (Gemini) | 總覽按鈕連真正報表並傳當前篩選 |
| C088 | 帳務與金流 | 平臺／車行／通路財務 | 取消、退款、爭議的跨帳一致性 | 待驗證 | BILL | — | SR-QA-FINANCE-001 (Gemini) | 同一訂單跨平臺、租戶、司機、夥伴總額守恆 |
| C089 | 帳務與金流 | billing_job | 批次跨月、重跑、失敗續跑與對帳 | 驗收缺口 | BILL | — | SR-QA-CONCURRENCY-001 (Codex) | 實際排程、重複執行同結果、部分失敗續跑、月界與時區 |
| C090 | 報表與法遵 | 營運報表使用者 | 營運報表查詢、產生與 CSV 下載 | 待驗證 | REPORT | — | SR-QA-REPORTS-001 (Codex2) | 以已完成 job 下載 CSV 與資料回算；job 未完成不得下載 |
| C091 | 報表與法遵 | 營運／租戶財務 | 一般報表 PDF／Excel 輸出 | 實作缺口 | N05 | SR-REPORT-001, SR-DEPS-001 | SR-QA-REPORTS-001 (Codex2) | 依所需格式補 renderer 或明示 CSV 限制；檢查實際bytes |
| C092 | 報表與法遵 | 監理承辦／法遵 | 九項 PRD 9.10.1 監理資料報表 | 待驗證 | REPORT,PRD | — | SR-QA-REPORTS-001 (Codex2) | 各一份真資料 CSV：車、駕駛、契約、保險、月異動、半年、費率、客訴、錄音索引 |
| C093 | 報表與法遵 | P5 法遵人員 | 行程紀錄、資料保存與查詢 | 故障 | R03, R16 | SR-BANK-001, SR-IAM-001, SR-ADMIN-VERIFY-001, SR-ENTERPRISE-DATA-001 | SR-QA-REPORTS-001 (Codex2) | 合法最小 scope，真來源保存覆蓋率與無資料／拒絕区分 |
| C094 | 報表與法遵 | P5 審查員 | 乘客揭露／公開車資版本審核 | 待驗證 | EXPANDED | — | SR-QA-REPORTS-001 (Codex2) | 用指定 P5 審查身份驗證；若該role應有權限則補 policy，不放寬全員 |
| C095 | 報表與法遵 | 車資異常／評價管理員 | 車資異常處理、評價與補正 | 待驗證 | P5 | — | SR-QA-REPORTS-001 (Codex2) | 從真異常／評價形成處置，修改可追蹤且不能覆寫原交易 |
| C096 | 報表與法遵 | 法遵／公開資訊管理員 | 公開電話、車資、版本與歷史治理 | 已測片段 | EXPANDED,ADMIN | — | SR-QA-REPORTS-001 (Codex2) | 草稿發布後公開端與車輛綁定一致 |
| C097 | 報表與法遵 | 車行／法遵 | 下載可列印車內牌貼 | 實作缺口 | N08 | SR-ARTIFACT-001, SR-PLACARD-001 | SR-QA-REPORTS-001 (Codex2), SR-LIVE-DOC-001 (Codex2) | 產生列印檔、正確刷新有效連結、下載授權與版本一致 |
| C098 | 報表與法遵 | 電子證明使用者 | 多元計程車電子證明 HTML／PDF | 待驗證 | CERT | — | SR-QA-REPORTS-001 (Codex2) | 以有效 certificate 下載可解析 PDF、內容與保存期限一致 |
| C099 | 報表與法遵 | 稽核／調查人員 | 證據清單、匯出授權、法律保留 | 待驗證 | EVIDENCE | — | SR-QA-REPORTS-001 (Codex2) | 逐family区分Phase1與2，驗證具權者回讀、無權者拒絕與保留政策 |
| C100 | 報表與法遵 | 稽核保管／資料庫維運 | 不可變 audit、保存、封存與刪除邊界 | 待驗證 | AUDIT | — | SR-QA-REPORTS-001 (Codex2) | 當前部署DB角色、保留例外與導出恢復演练；勿只看UI百分比 |
| C101 | 平臺治理 | 平臺管理員 | 車隊夥伴主檔列表與管理 | 故障 | R04 | SR-ADMIN-VERIFY-001 | SR-QA-GOVERNANCE-001 (Claude2) | 修正 envelope 解析並驗證新建、编輯、停用及引用 |
| C102 | 平臺治理 | 平臺管理員 | 租戶生命週期與跨租戶治理 | 待驗證 | ADMIN,TEN | — | SR-QA-GOVERNANCE-001 (Claude2) | 新增、停用、配額、功能開通及記錄按合法角色驗證 |
| C103 | 平臺治理 | 合作夥伴管理員 | 方案、入口、價格、來源歸屬 | 待驗證 | ADMIN,REF | — | SR-QA-GOVERNANCE-001 (Claude2) | 變更後的 handoff、報價、渠道歸因與對账一致 |
| C104 | 平臺治理 | 轉接器管理員 | 查詢／註冊／停用／憑證治理 | 故障 | N11 | SR-ADMIN-ADAPTER-001 | SR-QA-GOVERNANCE-001 (Claude2) | 補有效 API 接線；取得真列表後驗證其表單寫入與角色 |
| C105 | 平臺治理 | 轉接器管理員 | 憑證到期提醒正確性 | 故障 | N12 | SR-ADMIN-ADAPTER-001 | SR-QA-GOVERNANCE-001 (Claude2) | 從真到期時間計算，失敗時不得顯示確定到期結論 |
| C106 | 平臺治理 | 服務區管理員 | 區域草稿、審核、發布、停靠規則 | 已測片段 | EXPANDED,AREA | — | SR-QA-GOVERNANCE-001 (Claude2) | 邊界內外、洞、多邊形／圓與版本生效時間驗證 |
| C107 | 平臺治理 | 服務產品管理員 | 產品型別、資格、時間與結算模式 | 待驗證 | PRODUCT,EXPANDED | — | SR-QA-GOVERNANCE-001 (Claude2) | 核對API原始回應與registry；建立後的多端行為一致 |
| C108 | 平臺治理 | 平臺維運 | health、告警、通道與積壓可觀測性 | 已測片段 | R16 | SR-BANK-001, SR-ENTERPRISE-DATA-001 | SR-QA-GOVERNANCE-001 (Claude2) | 實際故障注入、告警送達、未知狀態與0區分 |
| C109 | 平臺治理 | 平臺管理員 | 公告／維護通知與功能旗標 | 待驗證 | ADMIN | — | SR-QA-GOVERNANCE-001 (Claude2) | 分租戶啟停、缓存失效、到期下架與通知送達 |
| C110 | 平臺治理 | 使用者／維運 | 環境、資料來源與文案可信度 | 故障 | R27 | SR-ENV-COPY-001 | SR-QA-GOVERNANCE-001 (Claude2) | 用環境真值與來源時間；清除無用戶意義的內部提示 |
| C111 | 整合與自動化 | 租戶技術管理員 | API keys、輪替、撤銷與使用量 | 待驗證 | TEN,IAM | — | SR-QA-WEBHOOK-001 (Gemini2) | 最小scope、到期、輪替重疊窗、立即撤銷、密钥遮罩 |
| C112 | 整合與自動化 | Webhook 接收平臺 | 簽章、重試、停用、回放與密鑰輪替 | 待驗證 | WEBHOOK | — | SR-QA-WEBHOOK-001 (Gemini2) | 受控接收器驗證 bytes/HMAC、2xx/5xx/timeout、恢復及去重 |
| C113 | 整合與自動化 | 租戶／外部系統 | ERP／企業 SSO／銀行帳本同步 | 外部待完成 | GATE | — | SR-QA-WEBHOOK-001 (Gemini2), SR-LIVE-FINANCE-001 (Claude2) | 連 sandbox、權限、mapping、重送與對帳差異處理 |
| C114 | 整合與自動化 | 地圖／定位資料提供者 | 真地圖、地理编碼、路由／ETA | 外部待完成 | MAP,GATE | — | SR-QA-WEBHOOK-001 (Gemini2), SR-LIVE-MAP-001 (Gemini2) | 正式憑證／配額、臺灣地址、服務區、斷線與過期位置 |
| C115 | 整合與自動化 | 錄音與證照保存作業 | 背景補件、到期掃描與告警回執 | 驗收缺口 | CALL,REGISTRY | — | SR-QA-WEBHOOK-001 (Gemini2) | 保存部署設定、執行紀錄、積壓測例、重啟與補跑 |
| C116 | 整合與自動化 | 背景作業維運 | 排程多實例互斥、重啟恢復與重試 | 驗收缺口 | OWN,WEBHOOK | — | SR-QA-CONCURRENCY-001 (Codex) | 跨兩實例／重啟／任務逾時演练，保留去重與接續證據 |
| C117 | 品質與營運保障 | 所有寫入者 | 同一請求重送不重複建單／扣款／派車 | 待驗證 | IDEMPOTENCY | — | SR-QA-UX-001 (Claude) | 並發同key、不同payload拒絕、timeout後查詢、重啟與跨實例 |
| C118 | 品質與營運保障 | 多端使用者 | 同一訂單跨角色的完整業務閉環 | 驗收缺口 | ALL | — | SR-RELEASE-001 (Codex2) | 測試租戶建單→調度→司機完成→結算→下載→申訴結案，保留共同ID |
| C119 | 品質與營運保障 | 平臺與一線使用者 | 失敗、空清單、過期、429與重試恢復 | 故障 | R05, R08, R16 | SR-BANK-001, SR-IAM-001, SR-ENTERPRISE-DATA-001 | SR-QA-UX-001 (Claude) | 分類不可重試與暫時故障，停止無限重試並給可行下一步 |
| C120 | 品質與營運保障 | 鍵盤／讀屏／行動使用者 | 全域可及性、焦點、對比與響應式 | 驗收缺口 | R22, R23 | SR-FLEET-FORM-001, SR-ENTERPRISE-FORM-001 | SR-QA-UX-001 (Claude) | 主要表單逐一鍵盤與讀屏操作，modal焦點返回與狀態播報 |
| C121 | 品質與營運保障 | 多語系使用者 | 繁中／英文、一致時間與貨幣格式 | 待驗證 | ALL | — | SR-QA-UX-001 (Claude) | 切換後操作保存、時區與帳期一致、無缺key及工程碼 |
| C122 | 品質與營運保障 | 維運／值班人員 | 備份、還原、RPO／RTO及災難演练 | 驗收缺口 | OPS-RUNBOOK | — | SR-OPS-PROOF-001 (Claude2), SR-LIVE-OPS-001 (Gemini) | 取得實際策略、成功備份與隔離環境restore紀錄，驗證業務資料 |
| C123 | 品質與營運保障 | 平臺維運 | 負載、延遲、容量與限流 | 驗收缺口 | PRD | — | SR-OPS-PROOF-001 (Claude2), SR-LIVE-OPS-001 (Gemini) | 按已確認SLO做代表性並發、佇列積壓和報表負載 |
| C124 | 品質與營運保障 | 發布／維運 | 部署版本、health、業務驗收與回滾 | 驗收缺口 | R29 | SR-READINESS-001, SR-PUBLIC-001 | SR-OPS-PROOF-001 (Claude2), SR-LIVE-OPS-001 (Gemini) | 以目前各服務版本與可重跑用戶旅程作發布門檻；记錄rollback演练 |
| C125 | 品質與營運保障 | 上傳文件使用者／稽核 | 檔案 bytes、掃描、歸屬、到期與真下載 | 驗收缺口 | N04, N08, N09 | SR-ARTIFACT-001, SR-INVOICE-001, SR-PLACARD-001, SR-PROOF-001 | SR-QA-UX-001 (Claude), SR-LIVE-DOC-001 (Codex2) | 司機證照／車輛／保險／照片／案件／帳單分别上傳回讀與越權拒絕 |
| C126 | 範圍邊界 | 銀行卡友自助預約 | 獨立 Partner Booking 網站 | 範圍排除 | SCOPE | — | SR-SCOPE-001 (Gemini2) | 若重啟需新渠道切換及身份決策；本輪不重啟 |
| C127 | 範圍邊界 | 一般乘客／現場代叫者 | 舊 Passenger／Concierge／Assisted 入口 | 範圍排除 | SCOPE | — | SR-SCOPE-001 (Gemini2) | 记錄其使用者需求由誰承接；不可把舊app源碼存在當可用產品 |
| C128 | 範圍邊界 | ROC／安全操作員 | AV／ODD／Tesla 接管與远端营运 | 範圍排除 | SCOPE,DECISION | — | SR-SCOPE-001 (Gemini2) | 保留獨立Phase2驗收矩陣，不列本期漏做的正式商用功能 |
| C129 | 範圍邊界 | 監理送件承辦 | Phase1 filing PDF 主報告與ZIP送件包 | 範圍排除 | DECISION | — | SR-SCOPE-001 (Gemini2) | 維持外部送件流程與責任人；不能聲稱有實際包檔可下載 |
| C130 | 範圍邊界 | 監理機關使用者 | 獨立 regulator realm 與正式監理入口 | 範圍排除 | DECISION | — | SR-SCOPE-001 (Gemini2) | 按現行授權交付資料與稽核，非新增監理網站缺陷 |
| C131 | 範圍邊界 | 背景事件消費者 | 獨立事件匯流排與13態轉單模型 | 範圍排除 | DECISION | — | SR-SCOPE-001 (Gemini2) | 依已核定契約測轉態，不沿用舊架構差異作未實現 |
| C132 | 範圍邊界 | 租戶簽核管理員 | 逾時自動升級 | 範圍排除 | TEN | — | SR-SCOPE-001 (Gemini2) | 人工升級仍須可操作；提示與即將逾時Email另列N07 |
| C133 | 範圍邊界 | 司機／發行管理員 | 提領、商店公開上架與商用簽章 | 外部待完成 | PRD,GATE | — | SR-READINESS-001 (Gemini2), SR-SCOPE-001 (Gemini2) | 若啟用再驗證出金與簽章發布；不視為目前已承諾功能完全缺失 |
| C134 | 調度與營運 | 調度員／合約查詢者 | 合約詳情可進入並提供執行條款 | 實作缺口 | N13, N14 | SR-CONTRACT-READ-001, SR-OPS-CONTRACT-001, SR-CONTRACT-001 | SR-QA-DISPATCH-001 (Claude2) | 補列表接線與read model條款映射，不把已有詳情檔案當完整功能 |
