# Phase 1 正式系統分析文件 v1.0

## 文件定位

本文件為 **Phase 1 車隊管理與派遣合規核心** 的正式系統分析文件（System Analysis, SA）。

本文件目的在於：

1. 統一定義 Phase 1 的商業模式、系統範圍、角色責任與核心流程。
2. 明確區分 Phase 1 與 Phase 2 的邊界，避免過早進入 Tesla / AV 控制設計。
3. 把既有前後台骨架、合規需求、營運需求整合成單一分析母文件。
4. 作為後續 PRD、SD、OpenAPI、資料表設計、畫面設計與測試案例的上游文件。

本文件**不處理**下列設計層內容：

- OpenAPI 細節
- 資料表 DDL
- microservice 實作切分
- UI wireframe 細節
- Tesla / AV 監控與接管設計

---

## 1. 專案背景與分析前提

### 1.1 專案背景

本專案採兩階段方式推動：

- **Phase 1：車隊管理與派遣合規核心**
- **Phase 2：自駕管理疊加層**

DRTS 既有文件本身也採分階段推動，第一階段先針對 12 公里路段試辦運轉，第二階段再視情況擴至 44 公里或其他場域；而且第一階段已採 **固定班次 + 預約班次並行** 的方式規劃，顯示「分段上線、逐步擴充」是合理的整體方法。fileciteturn43file4

### 1.2 系統分析前提

本次分析不是從零開始，而是建立在既有四套介面骨架與一份 DRTS 方案書之上：

- 企業 / 社區租戶 Portal：已具備預約、報表、API/Webhook、Billing、Notifications、Roles、Audit 等頁面定義。
- PlatformCo Admin：已具備 Tenants、Fleet & Devices、Switchboard、Pricing、Payments、Health、Audit、Flags 等平台級治理頁面。
- Driver / Safety Operator App：已具備任務清單、前往上車、行車、事件上報、收尾、班表、收益、教學等頁面。
- Host / OpCo / ROC 後台：已具備 Dashboard、Revenue、Dispatch、Maintenance、Incident、Reports 等營運模組。
- DRTS 文件：已明確包含分階段營運、固定與預約班次、監控中心、預約平台、V2X / CCTV、資訊安全與備援等規劃。

因此 Phase 1 的分析任務不是重新發明產品，而是：

1. 把既有頁面骨架重新定位為 Phase 1 可營運、可派遣、可監理查核的核心平台。
2. 補齊原骨架未涵蓋但法規上必須存在的合規 domain。
3. 先把人駕車隊營運做完整，再預留自駕 Phase 2 接點。

---

## 2. Phase 1 的正式定位

### 2.1 系統名稱

**Fleet Management Core + Dispatch Compliance Core**

### 2.2 定位說明

Phase 1 不是單純的叫車 App、預約頁面或單一車隊後台，而是一套：

- 能夠接收乘車需求
- 能夠派遣同營業區域內合法可派車輛
- 能夠對外回覆 ETA
- 能夠管理車輛、駕駛、契約、保險與排他委託
- 能夠保留電話話務、派遣、定位與客服申訴留痕
- 能夠執行租戶、駕駛、合作方財務與對帳
- 能夠產出主管機關查核與立案所需資料

的正式營運底座。

### 2.3 Phase 1 的核心價值

Phase 1 的核心價值不在於「賣系統」，而在於讓平台具備：

1. **接單能力**：能持續取得來自一般乘客、商務合作與第三方平台的訂單。
2. **履約能力**：能把訂單穩定分配到合法且合格的供給池。
3. **合規能力**：能支撐派遣立案、月報、查核與申訴處理。
4. **擴充能力**：日後 Phase 2 疊上 AV 管理時，不需要重做主交易與營運底座。

---

## 3. Phase 1 / Phase 2 分期邊界

### 3.1 Phase 1 範圍

Phase 1 包含：

- 乘客 / 租戶 / Call Center / Concierge 接單入口
- 中央控單、產品分類、ETA 與派單引擎
- 一般計程車與商務派車產品
- 第三方平台 forwarder 整合
- 車輛 / 駕駛 / 契約 / 保險主檔
- 單車單派遣排他控制
- 話務錄音與派遣留痕
- 客服申訴與消費爭議處理
- 對租戶 / 對駕駛財務與對帳
- 監理報表與立案輸出包

### 3.2 Phase 2 範圍

Phase 2 才納入：

- Tesla 串接
- 車端遙測與 AV telemetry pipeline
- ODD 規則 runtime
- AV eligibility
- AV mission lifecycle
- 安全員接管
- ROC 行控即時監看與任務控制
- Evidence bundle / takeover analytics

### 3.3 邊界原則

Phase 1 必須能**獨立上線、獨立營運、獨立接受監理查核**。  
Phase 2 只能作為 overlay 疊加，不得倒逼 Phase 1 先實作 AV 才能開站營運。

---

## 4. 商業模式與產品定義

### 4.1 訂單域

Phase 1 先把訂單切成兩大域：

#### A. `owned`

平台擁有需求來源與履約控制權的訂單：

- 一般乘客自有單
- 商務派車單
- 定點代叫單
- 企業 / 信用卡合作單

#### B. `forwarded`

平台不擁有需求來源，只做代理與司機端整合：

- 第三方叫車平台單

### 4.2 產品桶

Phase 1 正式產品桶只有兩個：

#### A. `standard_taxi`

適用於：

- 一般即時單
- 一般預約單
- 定點一般單
- 自有標準 taxi 服務

#### B. `business_dispatch`

適用於：

- 信用卡機場接送
- 大型公司派車
- 禮賓 / VIP / 窗口型預約接送

#### C. `av_pilot`

保留欄位，但 Phase 1 不啟用。

### 4.3 供給資格邏輯

供給池不以燃油 / 電動為第一層分類，而以以下條件決定是否可派：

- `license_class`：taxi / rental / multi_taxi
- `vehicle_form`：sedan / wagon / mpv / accessible
- `service_tags`：airport / vip / luggage / english / accessible / child_seat
- `operating_area`
- `platform_binding`
- `tenant_whitelist`
- `dispatch_exclusive_status`
- `insurance_valid`
- `driver_certification_valid`

### 4.4 商務子產品

#### 4.4.1 信用卡機場接送

特徵：

- 預約型任務
- 航班資訊
- 接機 / 送機模式
- 停車 / 過路費存證
- 合作方案代碼
- 與信用卡 / 禮賓方月結

#### 4.4.2 大型公司派車

特徵：

- 預約 / 窗口型任務
- 成本中心
- 現場聯絡窗口
- 指定乘客 / 指定車型 / 指定司機可能存在
- 簽收 / SLA / 月結要求較強

---

## 5. 利害關係人與角色責任

### 5.1 外部角色

#### 一般乘客

- App / Web / 電話叫車
- 查 ETA、取消、收據、申訴

#### 商務合作方

- 建立與管理商務預約
- 查詢 SLA、報表、發票、月結
- 管理 API / Webhook

#### 定點合作據點

- 協助現場代叫
- 管理 call point 與現場任務

#### 第三方叫車平台

- 提供外部需求來源
- 保留外部商品與接單語意

### 5.2 內部角色

#### PlatformCo Admin

管理平台級高敏感設定：

- Tenants
- Users & Roles
- Fleet & Devices
- Switchboard
- Split & Pricing
- Payments
- Audit / Health / Flags

#### Tenant / Partner Admin

管理租戶域：

- 預約
- 乘客名單
- 地址簿
- Billing
- API / Webhook
- Notifications / SLA
- 租戶內 Audit

#### Dispatcher / OpCo

管理營運派單：

- 待派任務
- 候選車 / 候選司機
- 指派 / 改派 / 排程
- 異常處理

#### Call Center Agent

處理：

- 叫車電話
- ETA 回覆
- 錄音留痕
- 建立電話訂單
- 回撥
- 轉申訴案件

#### Complaint Specialist

處理：

- 申訴案件
- 消費爭議
- SLA 追蹤
- 結案與查核輸出

#### Driver

執行：

- 接單
- 前往上車
- 到場 / 開始 / 完成
- 事件上報
- 收尾存證
- 出勤與收益查詢

#### Host

車主視角：

- 自車收益
- 自車維保
- 自車任務與申訴唯讀

#### Finance / Compliance / Audit

處理：

- 發票 / 收據
- 租戶對帳
- 司機服務費 / 補差
- 監理輸出
- 稽核與立案文件包

---

## 6. 現況系統骨架與 Phase 1 重定位

### 6.1 Tenant Portal

現有骨架可直接承接：

- Tenant Login & Home
- New Booking Wizard
- Booking List
- Passengers & Address Book
- Reports
- API Keys & Webhooks
- Billing & Invoicing
- Notifications & SLA
- Tenant Admin & Roles
- Audit Trail

Phase 1 中，這套系統重新定位為：

- 商務派車入口
- 企業 / 社區合作方入口
- 信用卡機場接送合作入口
- 租戶對帳與 SLA 管理入口

### 6.2 PlatformCo Admin

現有骨架可直接承接：

- Tenants
- Users & Roles
- Fleet & Devices
- Switchboard & External APIs
- Split & Pricing Engine
- Payments & Acquiring
- System Health & Quotas
- Audit & Compliance
- Notices / Maintenance
- Feature Flags

Phase 1 中，這套系統重新定位為：

- 平台級治理後台
- 產品映射 / 分帳 / 金流 / 外部平台 / 配額 / 審計中心
- 同時再補監理主檔與立案輸出管理

### 6.3 Driver App

現有骨架可直接承接：

- Onboarding & Auth
- Jobs Inbox
- Job Detail & Go-to-Pickup
- Drive Console
- SOS & Incident Report
- Handover & Proof
- Shift & Attendance
- Earnings & Wallet
- Settings & Academy

Phase 1 中，這套 App 只啟用人駕履約能力，不啟用 FSD / Takeover Quick-Report。

### 6.4 Host / OpCo / ROC 後台

現有骨架可直接承接：

- Dashboard
- Revenue Management
- Dispatch Scheduling
- Maintenance Logs
- Incident Reporting
- Energy & Charging
- Notifications
- Reports Center

Phase 1 中：

- 啟用營運、派單、維保、事件、報表模組
- 關閉 FSD Takeover Logs、ODD Capability Rules、Tesla Fleet Integrations 等 AV 專屬模組

---

## 7. Phase 1 功能需求總表

### 7.1 接單入口需求

系統需支援以下入口：

- Passenger App / Web
- Business / Partner Portal
- Call Point / Concierge Portal
- Call Center / CTI Console
- 第三方平台 Forwarder Adapters

所有入口都必須滿足：

- 正式建立訂單
- 執行產品分類
- 計算 ETA
- 寫入派遣留痕
- 關聯通知與後續結算

### 7.2 派單與履約需求

系統需支援：

- 即時派單（realtime）
- 預約派單（reservation）
- 站點排隊（queue）
- 第三方轉送（forwarder）

### 7.3 合規主檔需求

系統需支援：

- 車輛主檔
- 駕駛主檔
- 契約主檔
- 保險主檔
- 車輛排他委託狀態
- 車身識別與椅背揭示版本

### 7.4 電話話務與留痕需求

系統需支援：

- 叫車電話
- 申訴電話
- 24 小時錄音索引管理
- 錄音與訂單 / 案件雙向關聯
- 派遣過程不可變更留痕
- 車牌 / 時間 / 載客狀態 / 座標紀錄

### 7.5 客服申訴需求

系統需支援：

- 正式案件編號
- 案由分類
- SLA 與逾時告警
- 處理歷程
- 結案原因
- 匯出監理查核格式

### 7.6 財務與對帳需求

系統需支援：

- 乘客收據
- 租戶 Billing / Invoicing
- 司機服務費方案
- 司機月對帳單
- 優惠補差 / 匯款證明
- 收費版本管理

### 7.7 監理輸出需求

系統需支援：

- 車輛清冊
- 駕駛清冊
- 契約清冊
- 保險清冊
- 每月車輛增減月報
- 六個月營運統計
- 收費標準版本歷程
- 申訴案件明細
- 派遣紀錄與錄音索引
- 立案輸出包

---

## 8. 主要業務流程

### 8.1 一般乘客即時 / 預約派遣流程

1. 乘客於 App / Web / 電話 / 定點建立訂單
2. 系統完成地址解析
3. Product Mapping 判斷為 `standard_taxi`
4. Service Area Eligibility 檢查是否可派
5. ETA Engine 計算 ETA
6. Central Order Router 導入 Realtime Matcher
7. 系統指派車輛與司機
8. Driver App 接單、出發、到場、開始、完成
9. Dispatch Log Writer 保留全程留痕
10. 產出收據與對帳資料
11. 如有爭議，導入 Complaint Case

### 8.2 商務派車流程

1. 企業 / 信用卡合作方建立預約
2. Product Mapping 判斷為 `business_dispatch`
3. Contract / SLA Engine 套用規則
4. Reservation Scheduler 執行預派 / 鎖車
5. Qualification Engine 過濾符合商務資格之車 / 司機
6. 任務進 Driver App
7. 司機履約並執行商務存證
8. 系統產出月結、發票、SLA 與對帳資料

### 8.3 第三方平台 Forwarder 流程

1. 外部平台送入訂單
2. Mapping 判斷 `forwarded`
3. Forwarder Hub 依平台綁定與資格過濾可接單司機
4. 系統廣播給司機
5. 司機決定是否接受
6. 平台回寫成功 / 失敗
7. 外部狀態與結算鏡像同步

### 8.4 電話叫車流程

1. Call Center 收到來電
2. 客服員播報識別資訊
3. 系統開始錄音並建立 call session
4. 客服員建單並回 ETA
5. 錄音與訂單綁定
6. 訂單進入派單核心
7. 如需申訴，轉案件中心

### 8.5 申訴案件流程

1. 申訴來電 / App / Portal 建案
2. 產生正式案件編號
3. 關聯訂單、錄音與附件
4. 指派處理人與 SLA
5. 追蹤與紀錄處理歷程
6. 結案並輸出查核紀錄

---

## 9. 業務規則與狀態機需求

### 9.1 Owned 訂單狀態

- Draft
- Created
- Classified
- Ready for Dispatch
- Preassigned（商務預約）
- Assigned
- Driver Accepted
- Enroute Pickup
- Arrived Pickup
- Trip Started
- Trip In Progress
- Proof Pending
- Completed
- Cancelled
- No Show
- Redispatch Required
- Exception Hold

### 9.2 Forwarded 訂單狀態

- Received
- Mapped
- Eligible
- Broadcasted
- Accept Pending
- Confirmed by Platform
- Native In Progress
- Completed Synced
- Rejected
- Expired
- Lost Race
- Cancelled by Platform
- Sync Error

### 9.3 司機狀態

- Logged Out
- Ready Offline
- Available Standard
- Available Business
- Available Hybrid
- Reserved
- Enroute
- On Trip
- Paused
- Incident Hold
- Suspended

### 9.4 商務派車子流程差異

#### 機場接送

須額外包含：

- 航班資訊
- 接機 / 送機模式
- 等候起算規則
- 停車費 / 過路費憑證
- 航廈與窗口資訊

#### 大型公司派車

須額外包含：

- 現場窗口
- 成本中心
- 改乘客規則
- 簽收要求
- SLA 與月結條件

---

## 10. 合規需求清單

### 10.1 派遣入口與 ETA

系統需能正式接收乘車需求，並指派至同一營業區域內的可派車輛，且能於乘客端 / 話務端回覆 ETA。

### 10.2 車輛、駕駛、契約、保險主檔

系統需完整管理：

- 車輛清冊
- 駕駛清冊
- 營運契約
- 旅客責任保險
- 每月增減與附件證明

### 10.3 單車單派遣業者控制

系統需管理：

- 契約起訖
- 排他委託聲明與佐證
- 啟用前審核
- 委託終止後下架與識別塗銷任務

### 10.4 24 小時話務錄音與數據派遣留痕

系統需管理：

- 電話錄音索引
- 數據派遣留痕
- 車牌 / 日期時間 / 載客狀態 / 座標
- 上下車地與到場時間
- 法定保存年限

### 10.5 申訴專線與消費爭議

系統需管理：

- 申訴專線
- 專人處理
- 案件流水號
- 處理歷程
- 結案結果

### 10.6 官網公開資訊與車內揭示

系統需管理：

- 叫車電話
- 申訴電話
- 通話費率
- 車資標準
- 收費方式
- 車內椅背揭示版本與產出

### 10.7 收費、司機對帳、發票 / 收據

系統需管理：

- 對駕駛服務費收取
- 發票 / 收據
- 優惠補差與匯款證明
- 成本不可轉嫁之佐證鏈

### 10.8 監理查核報表與立案輸出包

系統需支援：

- 查核報表一鍵產出
- 立案輸出包 PDF / ZIP
- 系統設備、設置地點、營業方式、品牌識別、緊急應變等文件化輸出

---

## 11. 非功能需求

### 11.1 安全

- 平台後台需 SSO + MFA
- PlatformCo Admin 需最小權限、四眼原則、不可變更審計
- 租戶域與平台域權限需隔離
- API Key、Webhook Secret、支付憑證需加密保存

### 11.2 可用性

- 接單 / 派單 / 司機履約為高優先核心服務
- 話務 / 錄音 / 報表採不同 SLA 與容錯設計

### 11.3 稽核

- 敏感操作不可刪改
- 必須可依日期、人員、模組、資源追蹤
- Audit log 長期保存

### 11.4 備份與保存

- 錄音、派遣留痕、附件、報表與立案包需有明確保存策略
- 後續應可無縫銜接 Phase 2 的 3-2-1 備份與證據保留體系

### 11.5 擴充性

- 事件總線與主資料模型需保留 Phase 2 AV 接點
- 不能將人駕 Phase 1 與自駕 Phase 2 綁死於同一套 runtime 邏輯

---

## 12. 主資料與資料主體定義

### 12.1 組織與租戶主體

- Tenant
- Partner
- Site
- Call Point
- Operating Area
- Brand Profile

### 12.2 合規主體

- Vehicle
- Driver
- Vehicle Regulatory Profile
- Driver Regulatory Profile
- Vehicle Contract
- Insurance Policy
- Dispatch Exclusivity
- Placard Version

### 12.3 產品與規則主體

- Service Bucket
- External Service Mapping
- Contract Rule
- SLA Template
- Pricing Template
- Split Template
- Qualification Profile
- Fallback Policy

### 12.4 交易主體

- Order
- Booking
- Passenger Profile
- Quote / ETA Snapshot
- Dispatch Job
- Dispatch Attempt
- Dispatch Assignment
- Trip
- Proof Bundle

### 12.5 話務與客服主體

- Call Session
- Call Recording
- Callback Task
- Complaint Case
- Complaint Timeline

### 12.6 財務主體

- Tenant Invoice
- Passenger Receipt
- Driver Fee Plan
- Driver Statement
- Driver Reimbursement Batch
- Remittance Proof

### 12.7 輸出與稽核主體

- Report Job
- Report Artifact
- Filing Package
- Public Info Version
- Audit Log

---

## 13. 報表與輸出需求

### 13.1 營運報表

- 日 / 週 / 月派單量
- 完成量、取消率、no-show 率
- 平均 ETA、平均到場時間
- 商務派車準時率
- 商務改派率
- 外部平台轉送成功率
- 司機收入 / 扣款 / 補差

### 13.2 合規報表

- 車輛清冊
- 駕駛清冊
- 契約清冊
- 保險清冊
- 車輛增減月報
- 六個月統計
- 收費版本歷程
- 申訴明細
- 錄音索引與派遣留痕索引

### 13.3 立案文件包

需至少包括：

- 系統設備清單
- 設置地點
- 自有 / 租用 / 共用說明
- 營業方式
- 派遣中心組織與人員編制
- 品牌 / 車身 / 車內揭示
- 緊急應變說明
- 系統供應商證明

---

## 14. 外部系統互動需求

### 14.1 必要整合

- 地圖 / 路徑 / ETA
- CTI / SIP / Cloud PBX
- 通知（Email / SMS / Webhook）
- 金流 / 發票 / 對帳
- SSO / MFA
- 第三方叫車平台 forwarder
- Object Storage / 報表產生服務

### 14.2 Phase 1 不做之整合

- Tesla Fleet API
- AV telemetry gateway
- ODD runtime
- ROC AV Live Board
- Safety takeover pipeline

---

## 15. 假設、限制與風險

### 15.1 假設

- Phase 1 可依既有骨架快速重定位，不需全面重畫 UI。
- 商業上先以一般派遣與商務派車為收入核心。
- 第三方平台整合以 forwarder 模式成立，不改變外部平台 authoritative flow。

### 15.2 限制

- 目前既有骨架偏產品頁與畫面 prompt，不等於正式分析文件。
- 合規法定需求存在明顯補件需求，需新增專門 domain。
- 若先進入 API / DDL 設計，容易導致分析結論被實作假設綁死。

### 15.3 風險

- 電話話務層若未及時補上，無法成為完整派遣立案版本。
- 契約 / 保險 / 排他委託若沒有系統化主檔，監理查核會高度依賴人工彙整。
- 若過早以 Tesla / AV 視角主導設計，會模糊人駕營運與派遣合規核心。

---

## 16. 驗收基準（SA 層級）

本文件驗收不是驗 API 或畫面，而是驗「分析是否完整且可作為後續設計基準」。

驗收條件如下：

1. 已明確定義 Phase 1 正式定位。
2. 已明確定義 Phase 1 / Phase 2 邊界。
3. 已明確定義訂單域、產品桶與供給資格邏輯。
4. 已明確定義角色責任與營運責任歸屬。
5. 已明確定義主要業務流程與例外流程。
6. 已明確列出合規需求、主資料、報表與輸出。
7. 已明確指出哪些既有骨架沿用，哪些需補件。
8. 已明確保留 Phase 2 擴充接點。
9. 尚未落入 OpenAPI / DDL / wireframe 細節。

---

## 17. 與 Phase 2 的接點

Phase 1 必須保留但不啟用下列接點：

- `service_bucket = av_pilot`
- `vehicle.capability_profile`
- `vehicle.automation_mode`
- `incident.domain = av`
- `trip.telemetry_reference`
- `av mission` extension placeholder
- feature flags for ODD / Tesla / Takeover / ROC Live Ops

這些接點只用於保證未來可擴充，不代表 Phase 1 要先做自駕設計。

---

## 18. 本文件結論

Phase 1 的正確定義不是「先做一套派單系統」，而是：

> **先完成一套可營運、可派遣、可合規、可查核、可輸出的車隊管理與派遣核心。**

其本質包含五個同等重要的面向：

1. 接單與派遣
2. 供給與主資料治理
3. 話務與客服申訴
4. 財務與對帳
5. 監理與立案輸出

做完這一層，Phase 2 才有穩定底座可疊上 Tesla、AV 任務、安全員接管、ROC 與證據治理。

---

## 19. 後續文件順序

依本 SA 文件，後續文件應依序展開為：

1. **PRD**：把分析結論轉成功能需求、優先級、驗收情境
2. **SD**：服務切分、事件流、權限實作、整合方式
3. **API / OpenAPI**：request / response / auth / error model
4. **資料設計**：logical model → physical model → migration
5. **UI / Wireframe**：頁面與互動規格
6. **Test Plan**：業務流程、合規流程、回歸與 UAT
