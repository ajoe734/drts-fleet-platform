# Phase 1 產品需求文件（PRD）v1.0

## 文件屬性

- 文件名稱：Phase 1 車隊管理與派遣合規核心 PRD
- 文件版本：v1.0
- 對應分析文件：Phase 1 正式系統分析文件 v1.0
- 適用範圍：Phase 1
- 文件目的：將已確認之 SA 展開為產品需求定義，作為 UI/UX、SD、測試案例、專案排程與驗收依據
- 本文件刻意停留在「產品需求」層，不定義 OpenAPI、資料表 DDL、服務拆分與技術框架

---

# 1. 文件目的與使用方式

## 1.1 文件目的

本文件用來把 Phase 1 的系統分析內容展開成可執行的產品需求，以避免下列常見誤會：

1. 把第三方平台單誤當成自有派單單
2. 把商務派車誤當成一般即時叫車
3. 把車輛分類誤用為燃油 / 電動，而非依商業產品與法規資格分類
4. 把通知、incident、audit log 誤當成正式申訴與查核體系
5. 把 Driver App 當成只有接單工具，而忽略班表、事件、收尾存證、收益與扣補差
6. 把既有頁面骨架直接拿來用，而沒有先重新定義它們在 Phase 1 的責任

## 1.2 文件使用方式

本文件應被視為：

- 產品需求的唯一基準文件
- 需求評審與範疇控管的依據
- Wireframe、SD、API、測試案例的上游文件

若後續設計、開發、測試文件與本文件衝突，原則上以本 PRD 為準；若需變更，必須先修訂本文件。

## 1.3 文件不處理內容

本文件不處理：

- API request/response 格式
- 資料表 DDL
- Kafka / MQ topic 設計
- Web / App component 細節
- 頁面 pixel-level UI
- Tesla / AV runtime 控制

---

# 2. 專案背景與產品定位

## 2.1 專案背景

本專案採兩階段：

- Phase 1：車隊管理與派遣合規核心
- Phase 2：自駕管理疊加層

Phase 1 先讓平台具備：

- 接單
- 派單
- ETA 回覆
- 履約
- 對帳
- 申訴
- 合規留痕
- 監理輸出

Phase 2 再加：

- AV eligibility
- Tesla integration
- Safety takeover
- ROC live operations
- AV evidence / analytics

## 2.2 Product Statement

Phase 1 的產品定位如下：

> 一套可營運、可派遣、可監理查核的車隊管理核心平台，能同時支援一般計程車派遣、商務派車預約、第三方平台轉送整合、電話叫車與申訴處理。

## 2.3 Product Vision

平台的目標不是賣派遣軟體，而是建立一個可以持續承接訂單來源、穩定分配供給、完成履約並留存法定證據鏈的營運底座。

## 2.4 Product Principles

### P1. 產品分類優先於車種分類

先看訂單來源、服務產品、派單語意與法規資格，再看車型與能源別。

### P2. 自有單與轉送單嚴格分域

`owned` 與 `forwarded` 必須分開建模、分開狀態機、分開結算語意。

### P3. 合規不是報表附屬功能

契約、保險、排他委託、錄音、申訴、揭示與立案輸出都是核心功能，不是後補功能。

### P4. Driver App 是履約終端，不只是接單頁

它同時承載任務、班表、事件、收尾、收益、扣補差、訓練與裝置權限管理。

### P5. Phase 1 可獨立營運

Phase 1 不依賴 Phase 2 才能上線。

---

# 3. 範疇定義

## 3.1 In Scope

### 3.1.1 接單入口

- Passenger App / Web
- Business / Partner Portal
- Call Point / Concierge Portal
- Call Center / CTI Console
- Complaint Hotline Console
- External Forwarder Adapters

### 3.1.2 訂單與派遣

- 訂單建立
- ETA 試算
- 產品分類
- SLA / contract rule 套用
- realtime / reservation / queue / forwarder 四種派單語意
- redispatch
- 派遣留痕

### 3.1.3 履約

- Driver App 接單與履約
- 上車 / 到場 / 開始 / 完成
- 收尾存證
- 事件上報
- 出勤與班表
- 收益與扣補差查詢

### 3.1.4 合規主資料

- 車輛主檔
- 駕駛主檔
- 契約主檔
- 保險主檔
- 單車單派遣排他控制
- 車身與椅背揭示版本

### 3.1.5 話務與申訴

- 叫車電話
- 申訴電話
- 通話錄音
- 錄音綁單
- 客服案件中心
- 消費爭議流程

### 3.1.6 財務與報表

- 乘客收據
- 租戶 Billing / Invoicing
- Driver service fee
- Driver reimbursement
- Regulatory reports
- Filing package

### 3.1.7 平台治理

- Tenant / role / flag / audit / pricing / switchboard / health

## 3.2 Out of Scope

- Tesla Fleet API 正式接入
- AV mode、ODD runtime、takeover reporting 正式啟用
- 影像與遙測 evidence pipeline
- ROC live remote mission board
- 自駕車控制權切換
- AV telemetry / V2X runtime

---

# 4. 名詞定義

## 4.1 訂單域

### `owned`

平台擁有需求來源與履約控制權之訂單。

### `forwarded`

平台僅做代理與整合，不擁有需求來源與最終狀態權威的訂單。

## 4.2 產品桶

### `standard_taxi`

一般即時 / 預約 / 定點一般單。

### `business_dispatch`

信用卡機場接送、大型公司派車、禮賓型預約單。

### `av_pilot`

保留，不於 Phase 1 啟用。

## 4.3 派單語意

- `realtime`：即時派單
- `reservation`：預約預派
- `queue`：站點排隊
- `forwarder_broadcast`：第三方平台轉送廣播

## 4.4 供給資格

依下列項目共同判斷：

- `license_class`
- `vehicle_form`
- `service_tags`
- `operating_area`
- `platform_binding`
- `tenant_whitelist`
- `dispatch_exclusive_status`
- `insurance_valid`
- `driver_certification_valid`

## 4.5 角色術語

- PlatformCo：平台營運主體
- Tenant：商務合作租戶
- Partner：合作方 / 外部來源 / 車行 / 車主等商業對象
- Host：車主角色
- OpCo：車隊營運角色
- ROC：Phase 2 行控角色，Phase 1 只保留後台骨架

---

# 5. 成功指標

## 5.1 業務成功指標

- 一般派遣單可穩定建立、派遣、履約與結案
- 商務派車可支援預約、鎖車、存證、月結
- 第三方平台單可經單一司機端承接，不需多裝多個 driver app
- 電話叫車與申訴專線可進入正式工作流
- 監理查核清冊與月報可一鍵輸出

## 5.2 產品成功指標

- 所有 owned 訂單均可追蹤到 order → dispatch → trip → settlement
- 所有 phone 訂單均可回查 call_id / recording_id
- 所有 complaint 均有 case_no / timeline / resolution
- 所有可派車均可證明具備有效契約、保險與排他狀態
- 所有 driver statement 可回查至原訂單與計費規則版本

---

# 6. 使用者與角色需求

## 6.1 一般乘客

### 目標

- 叫車
- 看 ETA
- 知道是否有派到車
- 可取消
- 可申訴
- 可下載收據

### 需求摘要

- 叫車流程必須簡單、地址清楚、結果透明
- 不能要求理解複雜的車隊邏輯
- 若不可服務，需直接回覆原因，而不是停在 loading

## 6.2 商務合作方

### 目標

- 建立與管理預約
- 管理乘客與地址
- 追蹤 SLA
- 取得報表與發票
- 管理 API / Webhook

### 需求摘要

- 必須支援組織型資料，如成本中心、部門、窗口
- 對機場接送需支援航班資訊與等候規則
- 對企業派車需支援簽收、窗口與固定月結

## 6.3 定點代叫據點

### 目標

- 幫現場民眾快速叫車
- 立即知道 ETA
- 異常時可轉客服

## 6.4 Call Center Agent

### 目標

- 接電話
- 報身份
- 建單
- 回 ETA
- 綁錄音
- 必要時轉申訴

## 6.5 Complaint Specialist

### 目標

- 收案
- 查訂單與錄音
- 管 SLA
- 提出處置與結案
- 匯出供查核

## 6.6 Dispatcher / OpCo

### 目標

- 看待派任務
- 快速選車 / 改派
- 看候選車、距離、ETA
- 處理衝突與異常

## 6.7 Driver

### 目標

- 收任務
- 完成履約
- 上報事件
- 看班表
- 看收益與扣補差

## 6.8 PlatformCo Admin

### 目標

- 管租戶、角色、價格、分帳、外部整合、平台審計與功能開關

## 6.9 Finance / Compliance

### 目標

- 管租戶發票
- 管司機服務費與補差
- 匯出查核與立案包

---

# 7. 產品資訊架構

## 7.1 通路層

- Passenger App / Web
- Business / Partner Portal
- Call Point / Concierge Portal
- Call Center Console
- Complaint Hotline Console
- External Forwarder Adapters

## 7.2 核心層

- Product Mapping
- Contract / SLA
- Central Order Router
- ETA Engine
- Dispatch Core
- Forwarder Hub

## 7.3 合規層

- Vehicle Registry
- Driver Registry
- Contract Registry
- Insurance Registry
- Exclusivity Control
- Call Recording Index
- Complaint Case Center
- Public Disclosure / Placard
- Regulatory Reports / Filing Package

## 7.4 履約層

- Driver App
- Dispatch Scheduling Board
- Incident Center
- Revenue / Reports

---

# 8. 需求總表（Epic Level）

## EPIC-01 接單入口整合

平台必須能從乘客、企業、定點、電話與第三方平台接收乘車需求。

## EPIC-02 產品分類與派單控制

平台必須能根據來源與規則，把需求送到正確的派單語意。

## EPIC-03 一般計程車派遣

平台必須能完成即時叫車與一般預約的指派與履約。

## EPIC-04 商務派車預約

平台必須能支援信用卡機場接送與大型公司派車。

## EPIC-05 第三方平台轉送整合

平台必須作為 forwarder，讓司機用一個入口接多平台單。

## EPIC-06 合規主資料

平台必須管理車輛、駕駛、契約、保險與排他委託。

## EPIC-07 話務與錄音留痕

平台必須具備 24h 話務錄音與數據派遣留痕能力。

## EPIC-08 申訴與消費爭議

平台必須具備申訴流水號、處理流程、SLA 與查核輸出能力。

## EPIC-09 財務與對帳

平台必須同時支援 tenant billing 與 driver commercial settlement。

## EPIC-10 監理輸出

平台必須產出月報、清冊、收費歷程、錄音索引與立案文件包。

---

# 9. 詳細產品需求

# 9.1 接單入口需求

## 9.1.1 Passenger App / Web

### 功能目標

讓一般乘客可直接建立一般叫車需求，並得到 ETA 與派遣狀態。

### 功能需求

1. 乘客可建立即時訂單
2. 乘客可建立預約訂單
3. 乘客可查詢 ETA
4. 乘客可查詢派遣狀態
5. 乘客可取消訂單
6. 乘客可查歷史訂單
7. 乘客可下載收據
8. 乘客可發起客服 / 申訴

### 必填資料

- 上車地
- 下車地（可選，但商務場景多為必填）
- 用車時間
- 聯絡方式
- 特殊需求

### 產品規則

- 地址需可解析
- 若不在可服務區域，直接回 `not_serviceable`
- ETA 需明確顯示為「預估到達時間」，不是保證時間
- 取消若已進入收費時窗，需提示後果

### 驗收標準

- 可成功建立 owned / standard_taxi 訂單
- 可顯示 ETA 與狀態更新
- 可取消且留下 dispatch trace

---

## 9.1.2 Business / Partner Portal

### 功能目標

讓企業與合作方可管理商務派車預約、名單、報表與對帳。

### 功能需求

1. 可建立單趟 / 往返 / 週期性預約
2. 可指定乘客、地址、部門、成本中心
3. 可選擇服務產品與車型需求
4. 可查詢派遣與履約狀態
5. 可修改與取消預約
6. 可管理乘客名單與地址簿
7. 可下載報表
8. 可管理 API keys / Webhooks
9. 可管理 billing profile / invoice 收件
10. 可管理通知與 SLA 設定
11. 可管理租戶內使用者與角色
12. 可查詢租戶域 audit trail

### 商務子產品擴充需求

#### 信用卡機場接送

- 方案代碼
- 航班號
- 航廈
- 接機 / 送機
- 免費等候規則
- 停車 / 過路費憑證要求

#### 大型公司派車

- 下單人
- 實際乘客
- 現場窗口
- 簽收要求
- 指定司機 / 車型（若合約允許）
- 成本中心 / 部門 / 月結設定

### 產品規則

- 一般租戶用戶不可見 API / Webhook / Billing / Audit 高敏感模組
- 週期性預約必須有結束日
- 修改 / 取消規則依 SLA 決定
- API Key / Secret 僅完整顯示一次

### 驗收標準

- 可建立 `business_dispatch` 預約
- 可依租戶角色差異顯示正確權限
- 報表、通知、Billing 與 Audit 可正常運作

---

## 9.1.3 Call Point / Concierge Portal

### 功能目標

提供櫃台、警衛、飯店、醫院、社區等現場代叫入口。

### 功能需求

1. 可用據點身份登入
2. 可選擇固定站點
3. 可代乘客建單
4. 可取得 ETA
5. 可查看派車結果
6. 可在失敗時轉客服處理

### 產品規則

- 每個 call point 必須綁定 site
- 僅能代叫授權服務區與商品
- 所有代叫行為需留 audit 與 dispatch trace

---

## 9.1.4 Call Center / CTI Console

### 功能目標

使電話叫車正式進入主交易流程，並滿足錄音與客服識別規則。

### 功能需求

1. 顯示來電隊列與來電彈屏
2. 顯示客服員識別播報提示
3. 可從通話中建立叫車訂單
4. 可回覆 ETA
5. 可查看派遣結果
6. 可將通話與訂單綁定
7. 可建立 callback task
8. 可把通話轉為 complaint case

### 必填資料

- `call_type`
- `agent_id`
- `agent_identity_announced`
- `caller_phone`（若可取得）
- `recording_id`（通話結束後補綁可接受）

### 通話類型

- booking
- complaint
- callback
- general_inquiry
- lost_and_found

### 產品規則

- 客服員接通後需先播報員工編號或真實姓名
- Booking 類來電若完成建單，必須可追到 `call_id` 與 `recording_id`
- CTI 失敗時不可讓訂單靜默遺失

### 驗收標準

- 可從電話建立叫車訂單
- 錄音可回查到訂單
- complaint 類通話可直接轉案件

---

## 9.1.5 Complaint Hotline Console

### 功能目標

提供正式申訴專線處理能力。

### 功能需求

1. 接收申訴來電
2. 建立 case no
3. 關聯派遣單
4. 指派處理人
5. 設定 SLA
6. 紀錄處理歷程
7. 關閉案件並輸出查核資料

---

# 9.2 產品分類與控單需求

## 9.2.1 Product Mapping Engine

### 目標

把外部來源商品映射成內部產品桶與派單語意。

### 功能需求

1. 維護來源商品字典
2. 維護對應 `service_bucket`
3. 維護對應 `dispatch_semantics`
4. 維護 qualification / pricing / settlement 對應
5. 支援版本控管與灰度發佈

### 產品規則

- 第三方平台商品不可直接視為自有商品
- 同一來源商品變更映射時，舊單不回寫新規則
- 每個映射版本需可追 audit

---

## 9.2.2 Contract / SLA Engine

### 目標

將合約條款轉為可執行產品規則。

### 功能需求

1. 維護 contract rule
2. 維護等待規則
3. 維護 no-show 規則
4. 維護修改 / 取消規則
5. 維護簽收 / 存證需求
6. 維護白名單車輛 / 司機條件

### 產品規則

- `standard_taxi` 預設採簡化規則
- `business_dispatch` 可有專屬 SLA 與存證要求
- 所有規則需版本化，不允許直接覆寫既有生效版本

---

## 9.2.3 Central Order Router

### 目標

針對 `owned` 訂單決定其派單模式與執行規則。

### 功能需求

1. 識別來源
2. 判斷 service bucket
3. 套用 contract / SLA
4. 套用 pricing / split / qualification
5. 決定 dispatch mode
6. 決定 fallback policy

### 路由規則

- `standard_taxi` → 預設 `realtime`
- `business_dispatch` → 預設 `reservation`
- 定點特殊站點 → 可進 `queue`

### 產品規則

- `forwarded` 單不得進 central order router 主派單流程
- 無法分類之商品不得自動派單，必須進 exception queue

---

## 9.2.4 ETA Engine

### 目標

提供所有入口與派單端一致的 ETA 能力。

### 功能需求

1. 候選車 ETA
2. 指派車 ETA
3. 到場 ETA 動態更新
4. 商務預派出車預估
5. SLA 超時告警

### 產品規則

- ETA 是估計值，不是 SLA 承諾值
- 無法服務時應回 `not_serviceable`，不可偽造 ETA
- 每次 ETA 更新都應留下 snapshot / trace

---

# 9.3 派單與履約需求

## 9.3.1 Realtime Matcher

### 適用範圍

`owned / standard_taxi`

### 功能需求

1. 查找可派車輛與司機
2. 依 ETA / 距離排序
3. 過濾離線、維修、無效保險、證照失效等不可派車
4. 進行 assign / offer
5. 失敗時可 redispatch

### 產品規則

- 不得派離線車、維修車、契約失效車
- 不得派非同營業區可服務車輛
- 不得派排他審核未通過車輛

---

## 9.3.2 Reservation Scheduler

### 適用範圍

`owned / business_dispatch`

### 功能需求

1. 預派
2. 鎖車 / 鎖司機
3. T-24h / T-2h / T-30m 確認
4. 失敗改派
5. 異常升級人工處理

### 子產品規則

#### 機場接送

- 需支援航班追蹤資訊欄位
- 可延後接機時窗
- 停車 / 過路費可能需存證

#### 企業派車

- 需支援窗口、簽收、成本中心
- 可能限制改單時間

### 驗收標準

- 商務單可進入 preassign → assigned → confirmed 流程
- 異常時可執行 redispatch 或改派人工單

---

## 9.3.3 Queue / Rank Manager

### 適用範圍

定點合作與站點型服務。

### 功能需求

1. 車輛 check-in
2. 車輛 check-out
3. skip / 過號
4. priority rules
5. queue 視圖

### 產品規則

- queue 只用於明確定義之站點
- 非站點單不可進 queue
- queue event 需寫 dispatch trace

---

## 9.3.4 Qualification Engine

### 目標

定義可派供給。

### 必須考慮條件

- 牌照類型
- 車型形式
- 服務標籤
- 營業區域
- tenant 白名單
- platform 綁定
- 保險有效性
- 駕駛資格
- 排他委託狀態

### 產品規則

- 供給資格判斷不可由前台手動略過
- 人工 override 必須留 audit 並受角色限制

---

## 9.3.5 Forwarder Hub

### 目標

整合第三方平台單，讓司機端單一化。

### 功能需求

1. 接收 external inbound orders
2. 映射 external service code
3. 過濾可接資格司機
4. 廣播給司機
5. 接單結果回傳平台
6. 同步外部狀態
7. 財務結果鏡像與對帳

### 產品規則

- 外部平台才是接單結果權威
- 平台不可把 forwarded 單改寫成自有 assigned 單
- forwarded 單僅可做 mirror 與 reconciliation，不可篡改原生狀態

### 驗收標準

- 司機可在單一 app 看到平台 A/B/C 任務來源 badge
- 外部平台 accept / lost race / cancel 可同步顯示

---

# 9.4 Driver App 需求

## 9.4.1 Phase 1 啟用模組

- Onboarding & Auth
- Jobs Inbox
- Job Detail & Go-to-Pickup
- Drive Console（人駕模式）
- SOS & Incident Report
- Handover & Proof
- Shift & Attendance
- Earnings & Wallet
- Settings & Academy

## 9.4.2 Jobs Inbox

### 功能需求

1. 顯示待接 / 今日 / 歷史
2. 顯示來源 badge
3. 顯示時間、起訖、ETA、產品類型
4. 可 accept / reject
5. reject 必須有 reason

### 產品規則

- 待接單必須有回應時限
- `forwarded` 與 `owned` 單都可在此呈現，但 badge 與狀態語意不同

---

## 9.4.3 Job Detail & Go-to-Pickup

### 功能需求

1. 顯示上車點地圖
2. 顯示匿名撥號
3. 顯示 ETA / 距離
4. 可操作 depart / arrived_pickup
5. 顯示特殊需求

### 商務單額外需求

- 顯示企業 / 機場接送來源
- 顯示航班 / 航廈 / 窗口 / 簽收需求

---

## 9.4.4 Drive Console

### 功能需求

1. 顯示路線
2. 顯示剩餘時間 / 距離
3. 可操作 start / complete
4. 顯示網路差、低電量等運行提示

### Phase 1 限制

- 不啟用 FSD / ODD / takeover 互動
- 若既有骨架含相關 UI，需以 flag 隱藏

---

## 9.4.5 SOS & Incident Report

### 功能需求

1. 一鍵 SOS
2. 可快速撥客服 / 緊急通報
3. 可上報 incident
4. 可附照片 / 語音 / 位置

### 產品規則

- 防誤觸
- 至少描述或照片其一必填
- 事件建立後應回事件編號

---

## 9.4.6 Handover & Proof

### 功能需求

1. 顯示里程與金額摘要
2. 支援照片存證
3. 支援簽名
4. 支援滿意度或補充備註

### 產品規則

- 企業固定價不可被司機改價
- 若租戶規則要求照片，未上傳不得完成
- 若需要簽收，未完成不得完成結案

---

## 9.4.7 Shift & Attendance

### 功能需求

1. 上線 / 下線
2. 查看班表
3. 請假申請
4. 出勤計時

### 產品規則

- 車輛不可用時不得上線
- 被 suspend 司機不得切成可接單狀態

---

## 9.4.8 Earnings & Wallet

### 功能需求

1. 查詢日 / 週 / 月收益
2. 查詢 service fee 扣款
3. 查詢 subsidy reimbursement
4. 下載對帳單 / 收據
5. 可提領（若平台開放）

### 產品規則

- 收益與扣補差必須可回查來源訂單與計費版本
- 司機僅可查看自己的 statement

---

## 9.4.9 Settings & Academy

### 功能需求

1. 個資與通知偏好
2. 裝置檢測
3. 教學影片 / SOP / 小測驗
4. 證照到期提醒

### Phase 1 要求

- 加入服務品質 / 合規 / 申訴應對訓練
- AV 監督訓練在 Phase 1 不作為正式開通條件

---

# 9.5 營運後台需求

## 9.5.1 Dashboard

### 目標

讓 Host / OpCo 看到 KPI、趨勢與異常。

### 功能需求

1. 今日 KPI
2. 近 7 日趨勢
3. 異常 / 待辦清單
4. 快速入口

### Phase 1 範圍

- 行程
- 收益
- 離線車
- 未結案件
- 可派車數

---

## 9.5.2 Dispatch Scheduling

### 目標

讓營運人員可以從待派清單選車派遣、改派、處理衝突。

### 功能需求

1. 顯示待派任務
2. 顯示候選車 / 候選司機
3. 顯示地圖位置與 ETA
4. 可 assign / redispatch
5. 可看派單失敗原因

### 產品規則

- ROC 在 Phase 1 僅能唯讀，不做 AV live control
- OpCo 可做派單操作

---

## 9.5.3 Revenue Management

### 功能需求

1. 依日期 / 車輛 / 產品查收益
2. 顯示總收入、平均單趟、完成數
3. 匯出報表
4. 查看分潤與結算狀態

### 角色差異

- Host：僅可看自車
- OpCo：可看全車隊

---

## 9.5.4 Maintenance Logs

### 功能需求

1. 建立維保紀錄
2. 管理下次保養日期
3. 上傳附件
4. 匯出維保紀錄

### 產品規則

- 維修中車輛不得被派遣
- 維保資料須可被 Host 唯讀查詢

---

## 9.5.5 Incident Reporting

### 功能需求

1. 建立 incident
2. 指派負責人
3. 維護 timeline
4. 結案
5. 可與 complaint / order / vehicle 關聯

### 產品規則

- incident 不等於 complaint
- 兩者可互相關聯，但生命周期分開

---

## 9.5.6 Reports Center

### 功能需求

1. 產生收益、行程、事件、能源等報表
2. 下載 CSV / XLSX / PDF
3. 支援排程寄送

### 產品規則

- 大報表走背景 job
- Host 僅可看受限範圍報表

---

# 9.6 合規主資料需求

## 9.6.1 Vehicle Regulatory Registry

### 功能目標

支援立案、查核、可派控制。

### 必需資料

- 車牌
- VIN
- 營業區域
- 牌照類別
- 車主 / 車行 / 派遣合作夥伴
- 可派狀態
- 契約起訖
- 排他聲明狀態
- 保險資訊
- 品牌版本
- placard version

### 產品規則

- 車牌與 VIN 唯一
- 未完成合規審核不得切為 dispatchable

---

## 9.6.2 Driver Regulatory Registry

### 必需資料

- 姓名
- 手機
- 職業駕照效期
- 執業登記證效期
- 所屬車輛
- 教育訓練紀錄
- 服務品質評分
- 申訴紀錄

### 產品規則

- 任一必要證照失效即不得上線接單
- 特定商務產品可要求額外 training completed

---

## 9.6.3 Contract Registry

### 功能需求

1. 建立車輛委託契約
2. 分辨個人車主代辦與公司型合作車行
3. 管理附件與佐證
4. 管理生效、終止與變更

### partner 類型

- individual_owner
- fleet_company_partner
- dispatch_partner

### 產品規則

- 不可把 `fleet_company_partner` 與 `individual_owner` 用同一流程對待
- 契約終止應觸發車輛停派與 offboarding 流程

---

## 9.6.4 Insurance Registry

### 功能需求

1. 記錄旅客責任險
2. 記錄保額與有效期
3. 上傳證明文件
4. 到期提醒

### 產品規則

- 低於門檻或已過期不得 dispatchable

---

## 9.6.5 Dispatch Exclusivity Control

### 功能需求

1. 蒐集排他聲明 / 佐證
2. 啟用前審核
3. 核准後方可上線
4. 終止委託後下架
5. 建立 debranding 任務

### 產品規則

- 每車僅能有一筆有效派遣委託狀態
- 所有審核需留下 reviewer / time / result

---

## 9.6.6 Branding / Placard Registry

### 功能需求

1. 管理車身品牌版本
2. 管理椅背揭示版本
3. 支援依品牌 / 車隊輸出揭示卡

### 產品規則

- 版本不可覆寫
- 每台車都必須可追蹤到當前生效版本

---

# 9.7 話務、錄音與申訴需求

## 9.7.1 Telephony & Recording

### 功能需求

1. 叫車電話與申訴電話接入
2. IVR / queue / agent assignment
3. 錄音保存
4. 錄音與 call session、order、case 關聯

### 產品規則

- 錄音不可刪改
- 錄音與 call session 必須有唯一識別
- 通話失敗需留 call fail log

---

## 9.7.2 Dispatch Trace

### 功能需求

1. 記錄建單、ETA、派遣、到場、開始、完成、取消等事件
2. 記錄車牌、時間、定位、載客狀態
3. 可供每日彙整與查核使用

### 產品規則

- Trace 為 append-only
- 不允許 UI 修改歷史 trace

---

## 9.7.3 Complaint Case Center

### 功能需求

1. 產生流水號
2. 建立案件分類
3. 關聯訂單與電話
4. SLA 管理
5. Timeline 管理
6. Resolution / closure
7. 可重開案件

### 案件分類

- 未準時到達
- 未到達
- 駕駛服務
- 車況
- 路線問題
- 收費爭議
- 安全疑慮
- 遺失物
- 其他

### 產品規則

- 每案必須有處理人與結案原因
- SLA breach 需告警，但不自動結案

---

# 9.8 財務需求

## 9.8.1 Passenger Billing

### 功能需求

1. 產生乘客收據
2. 依訂單與價格模板計費
3. 保留可回查的計費快照

---

## 9.8.2 Tenant Billing & Invoicing

### 功能需求

1. 維護 billing profile
2. 產生發票 / 月結單
3. 支援成本中心對映
4. 支援 PDF 下載與寄送

### 產品規則

- 歷史發票至少長期留存
- 抬頭 / 統編格式需校驗

---

## 9.8.3 Driver Service Fee Billing

### 功能需求

1. 建立 driver fee plan version
2. 根據版本計算司機服務費
3. 產生 driver statement
4. 產生 receipt / invoice（依營運模式）

### 產品規則

- 方案版本不可直接覆寫
- 生效需核准

---

## 9.8.4 Driver Reimbursement

### 功能需求

1. 記錄優惠補差
2. 產生補差批次
3. 上傳匯款證明
4. 供司機查詢已補差 / 未補差

### 產品規則

- 平台優惠不得直接轉嫁司機
- 補差需可回查原始訂單與補貼政策版本

---

# 9.9 公開資訊與揭示需求

## 9.9.1 Public Info CMS

### 功能需求

1. 管理叫車電話
2. 管理申訴電話
3. 管理通話費率
4. 管理車資收費標準
5. 管理收費方式
6. 管理版本歷程與生效日

### 產品規則

- 所有公開資訊版本化
- 不得覆寫已生效歷史版本

---

## 9.9.2 Seat-back Placard Generator

### 功能需求

1. 依品牌 / 車隊 / 車輛輸出座椅背卡
2. 顯示叫車電話、申訴電話、收費資訊
3. 管理 placard version

### 產品規則

- 每次輸出需可回溯版本與內容

---

# 9.10 監理報表與立案輸出需求

## 9.10.1 Regulatory Reports

### 必備報表

1. 車輛清冊
2. 駕駛清冊
3. 契約清冊
4. 保險清冊
5. 每月車輛增減月報
6. 最近六個月統計
7. 收費標準版本歷程
8. 申訴案件明細
9. 派遣紀錄與錄音索引

### 六個月統計內容

- 乘客要求派車次數
- 派遣次數
- 平均可派車輛數
- 申訴次數

---

## 9.10.2 Filing Package

### 功能需求

1. 匯出立案 / 查核包
2. 支援 PDF 主報告與 ZIP 附件包
3. 內含設備、設置地點、營業方式、人員編制、品牌識別、揭示資訊、供應商證明

### 產品規則

- 匯出行為需進 audit
- 每個 package 要有 artifact id 與 manifest

---

# 10. 主要業務流程需求

## 10.1 一般叫車流程

1. 建單
2. 地址解析
3. 服務區判斷
4. ETA 試算
5. product mapping → `standard_taxi`
6. central route → realtime
7. dispatch assign
8. driver accept
9. depart / arrive / start / complete
10. receipt / trace / settlement
11. 如有爭議，可轉 complaint

## 10.2 商務派車流程

1. tenant / partner 建立預約
2. product mapping → `business_dispatch`
3. contract / SLA 套用
4. reservation scheduler 預派
5. qualification 過濾商務資格供給
6. 鎖車 / 鎖司機
7. 任務確認
8. 出車
9. 存證 / 簽收 / 費用憑證
10. 月結 / 發票 / 報表

## 10.3 Forwarder 流程

1. external adapter inbound
2. mapping
3. eligibility filtering
4. broadcast to qualified drivers
5. driver attempts accept
6. platform confirms or lost race
7. status sync
8. settlement mirror

## 10.4 電話叫車流程

1. 來電
2. agent identity announcement
3. 通話錄音
4. 建單
5. ETA 回覆
6. 派車
7. 綁定錄音
8. 如需，轉 complaint

## 10.5 申訴案件流程

1. 受理
2. 產生 case no
3. 關聯 order / call
4. 指派處理人
5. SLA 追蹤
6. timeline 更新
7. resolution
8. close / reopen

---

# 11. 狀態機需求

## 11.1 owned 訂單狀態

- DRAFT
- CREATED
- CLASSIFIED
- READY_FOR_DISPATCH
- PREASSIGNED（business only）
- ASSIGNED
- DRIVER_ACCEPTED
- ENROUTE_PICKUP
- ARRIVED_PICKUP
- TRIP_STARTED
- TRIP_IN_PROGRESS
- PROOF_PENDING
- COMPLETED
- CANCELLED
- NO_SHOW
- REDISPATCH_REQUIRED
- EXCEPTION_HOLD

## 11.2 forwarded 訂單狀態

- RECEIVED
- MAPPED
- ELIGIBLE
- BROADCASTED
- ACCEPT_PENDING
- CONFIRMED_BY_PLATFORM
- NATIVE_IN_PROGRESS
- COMPLETED_SYNCED
- REJECTED
- LOST_RACE
- EXPIRED
- CANCELLED_BY_PLATFORM
- SYNC_ERROR

## 11.3 派單執行狀態

- PENDING
- MATCHING
- OFFERED / RESERVED / QUEUED
- ASSIGNED
- ACCEPTED
- FAILED
- REDISPATCHING
- CLOSED

## 11.4 司機狀態

- LOGGED_OUT
- READY_OFFLINE
- AVAILABLE_STANDARD
- AVAILABLE_BUSINESS
- AVAILABLE_HYBRID
- RESERVED
- ENROUTE
- ON_TRIP
- PAUSED
- INCIDENT_HOLD
- SUSPENDED

## 11.5 申訴案件狀態

- NEW
- ACCEPTED
- UNDER_INVESTIGATION
- WAITING_EXTERNAL_REPLY
- PROPOSED_RESOLUTION
- RESOLVED
- CLOSED
- REOPENED
- SLA_BREACH

## 11.6 車輛 onboarding 狀態

- DRAFT
- DOCS_PENDING
- UNDER_REVIEW
- APPROVED
- ACTIVE
- SUSPENDED
- TERMINATED
- DEBRANDING_PENDING
- CLOSED

---

# 12. 角色權限需求（PRD 版）

## 12.1 PlatformCo Admin

可管理：

- tenants
- platform users / roles
- pricing / split / payments
- switchboard / integrations
- audit / health / flags
- regulatory filing package

不可直接作：

- 日常電話接單
- 日常派遣
- 司機任務履約操作

## 12.2 Tenant Admin

可管理：

- bookings
- passengers / addresses
- reports
- api keys / webhooks
- billing profile
- notifications / sla
- tenant users / roles
- tenant audit

## 12.3 Dispatcher / OpCo

可管理：

- dispatch scheduling
- candidate selection
- redispatch
- vehicle availability
- incident coordination

## 12.4 Call Center Agent

可管理：

- call queue
- phone booking
- ETA reply
- callback
- complaint transfer

## 12.5 Complaint Specialist

可管理：

- complaint case lifecycle
- resolution notes
- sla tracking
- export for compliance

## 12.6 Host

可查看：

- 自車收益
- 自車維保
- 自車任務
- 自車相關案件

## 12.7 Driver

可管理：

- 自己的任務
- 自己的出勤
- 自己的收益與 statement
- 自己的教學與設定

## 12.8 Finance / Compliance

可管理：

- invoices
- driver fee plans
- driver reimbursements
- reports
- filing package
- audit export

---

# 13. 非功能產品需求

## 13.1 可用性

- 接單 / 派單 / Driver task 核心流程需高可用
- CTI / 錄音不可作為單點脆弱元件

## 13.2 追溯性

以下 id 必須可互相追蹤：

- order_id
- dispatch_job_id
- assignment_id
- trip_id
- call_id
- recording_id
- case_no
- invoice_id
- statement_id
- filing_package_id

## 13.3 審計性

- 重要設定與財務操作必須進 audit
- audit 不可編刪

## 13.4 安全性

- Admin / Ops 後台需 SSO + MFA
- 秘密資料需加密保存
- 敏感操作需二次確認 / 四眼原則（若涉及高風險設定）

## 13.5 留存需求

- 錄音與派遣明細需保留至少規定時限
- 申訴、補差、查核文件需長期留存

---

# 14. 驗收基準

## 14.1 必須驗收通過的核心能力

1. 一般乘客可從 Web / App / 電話成功叫車
2. 商務合作方可建立與管理商務預約
3. OpCo 可完成派單與改派
4. 司機可完成接單、履約、事件上報與收尾
5. CTI 錄音可綁訂單與案件
6. 單車單派遣排他流程可核准 / 停用 / 下架
7. 租戶發票與司機對帳可產出
8. 申訴案件具流水號與 SLA
9. 車輛 / 駕駛 / 契約 / 保險清冊可匯出
10. 立案輸出包可生成

## 14.2 不得發生的產品錯誤

1. 第三方 forwarded 單被誤寫成 owned assignment
2. 無錄音電話單無法回查來源
3. 契約或保險失效車仍可派單
4. 被 suspend 司機仍可上線接單
5. complaint 與 incident 混為同一生命周期
6. 歷史價格版本被直接覆寫
7. audit log 可被修改或刪除

---

# 15. 既有頁面骨架重定位

## 15.1 Tenant Portal

既有頁面保留為：

- 租戶首頁
- 建立預約
- 預約清單
- 乘客名單與地址簿
- 報表
- API / Webhooks
- Billing & Invoicing
- Notifications & SLA
- Tenant Admin & Roles
- Audit Trail

在本 PRD 中，它被正式定義為：
**Business / Partner Portal**

## 15.2 PlatformCo Admin

既有頁面保留為平台治理後台，另新增合規模組：

- Vehicle Contracts & Insurance
- Driver Certification Registry
- Dispatch Exclusivity Review
- Public Disclosure CMS
- Placard Generator
- Driver Fee & Reimbursement Plans
- Regulatory Filing Package

## 15.3 Driver App

既有頁面保留，FSD / takeover 相關 UI 在 Phase 1 隱藏。

## 15.4 Host / OpCo / ROC 後台

既有頁面保留，FSD / ODD / Tesla 整合相關頁在 Phase 1 關閉；新增：

- Call Center Dispatch Board
- Recording & Dispatch Trace Search
- Complaint Case Center
- Driver Fee Reconciliation
- Monthly Filing Center
- Regulatory Report Center

---

# 16. 與 Phase 2 的接點

## 16.1 保留但不啟用的產品概念

- `service_bucket = av_pilot`
- `vehicle.automation_mode`
- `vehicle.capability_profile`
- `trip.telemetry reference`
- `incident_domain = av`

## 16.2 後續將由 Phase 2 擴充

- Tesla integration admin
- AV mission manager
- ODD rules runtime
- Safety takeover reporting
- ROC live board
- Evidence bundle

## 16.3 原則

Phase 2 必須疊加在本 PRD 定義的交易與合規底座之上，不得重寫 order / dispatch / billing / complaint 主流程。

---

# 17. 風險、限制與待確認事項

## 17.1 風險

1. CTI / 錄音整合若延後，P0 合規會缺口
2. 契約與保險資料若不制度化蒐集，無法完成監理清冊
3. 若第三方平台 adapter 規格常變，forwarder 維運成本會高
4. 若 driver fee plan 與 subsidy policy 未先定義，對帳爭議會很多

## 17.2 限制

1. Phase 1 不處理 AV runtime
2. 本文件未決定技術實作方案
3. 若主管機關實際申報格式變更，報表模板需同步調整

## 17.3 待確認事項

1. 電話通話費率是否需與 Public Info CMS 綁不同品牌版本
2. 司機收據 / 發票是否因實際商業模式區分不同開立方式
3. Forwarder 對每一家平台是否需要獨立 badge / rule set / adapter team
4. 企業派車是否允許租戶自行指定司機，或只能提交偏好

---

# 18. PRD 收斂結論

本 PRD 的核心目的，是把 Phase 1 定義清楚成：

> 一套以訂單來源、服務產品與合規資格為主軸，而不是以車種能源別為主軸的車隊營運平台。

其中最重要的產品決策有五個：

1. `owned` 與 `forwarded` 嚴格分域
2. `standard_taxi` 與 `business_dispatch` 是 Phase 1 的正式產品桶
3. 商務派車只先聚焦兩類：信用卡機場接送、大型公司派車
4. 合規 domain（契約、保險、排他、錄音、申訴、揭示、立案包）視為主系統，不是外掛
5. Driver App、Tenant Portal、Platform Admin、OpCo 後台全部沿用既有骨架，但要依本 PRD 重新定義責任
