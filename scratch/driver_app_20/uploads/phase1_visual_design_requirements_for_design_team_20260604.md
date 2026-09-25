# Phase 1 視覺設計需求規格書

**文件版本**：v1.0  
**日期**：2026-06-04  
**公司名稱**：智慧運輸科技股份有限公司  
**文件對象**：視覺設計團隊、UX/UI 設計團隊、產品設計、前端開發、Lovable / Claude Design 產圖團隊  
**文件目的**：依最新 Phase 1 商業模式修正，明確定義公開網站、Tenant Portal、Partner Booking、Driver App、Fleet Partner Portal、Platform Admin、Ops Console 的視覺設計範圍、畫面清單、資訊優先順序與設計驗收標準。

---

## 0. 這次設計的核心修正

本次設計不能再只做「公開官網 + 簡單訂車頁」。  
最新商業模式已明確補上三個 Phase 1 P0 缺口：

1. **Tenant 不只需要訂車頁，也需要管理後台**
   - 企業、銀行、信用卡、保險代步、旅行社、禮賓合作方，需要看訂單、使用者、完成狀態、應付金額、月結、發票、報表、對帳、異常與申訴。

2. **計程車即時叫車與商務派車 / 機場接送 / 保險代步 / 旅行社接送是不同服務產品**
   - 前端必須顯示 service product、時態、服務限制、可用車型、車輛牌照 / 服務資格。
   - 不可用一個 generic booking form 表示全部服務。

3. **車行 / 車隊合作夥伴需要分潤與管理責任工具**
   - 車行協助招募與管理司機，需要 Fleet Partner Portal、司機歸屬、車輛狀態、分潤、對帳單、品質責任、文件與訓練狀態。

因此，這次視覺設計必須從「叫車前端」升級為：

# 多角色車隊營運與商務派車平台設計

---

## 1. 設計總原則

## 1.1 品牌定位

品牌名稱：

# 智慧運輸科技股份有限公司

公開對外簡稱：

# 智慧運輸科技

英文可暫用：

# Smart Transport Technology

網站與系統定位：

# 多平台計程車營運與商務派車合作平台

一句話說明：

> 智慧運輸科技協助司機整合多平台訂單，並為企業、金融機構、保險公司、旅行社、合作平台與車行提供穩定的計程車、商務派車與合作派車營運服務。

---

## 1.2 設計不應該長成什麼

請明確避免：

- 不要設計成一般乘客叫車平台。
- 不要在公開網站放「立即叫車」。
- 不要主打乘客 App。
- 不要主打自駕車載客。
- 不要用 DRTS、公車、固定班次、大眾運輸語意。
- 不要把所有系統功能攤在公開首頁。
- 不要把 Platform Admin、Ops Console、CTI、filing、feature flags、switchboard 等內部功能放在公開網站主內容。
- 不要把第三方平台合作寫成我們要接管對方平台或改寫對方派單規則。

---

## 1.3 視覺風格

整體風格：

- B2B SaaS
- Mobility Operations
- 專業、穩定、可信任
- 有科技感但不科幻
- 有交通營運感但不是叫車 App 廣告
- 適合台灣企業、金融機構、車行、司機與合作平台

建議主色：

- 深藍 / 靛藍：穩定、企業、科技
- 藍綠 / 青綠：狀態、通路、營運流動
- 淺灰 / 白：乾淨、企業系統感

避免：

- 過度霓虹
- 大量未來城市科幻圖
- 無人車作為主視覺
- 卡通風格
- 過度消費者 App 風格

---

## 2. 設計範圍總覽

本次視覺設計分成七個產品面：

| 產品面                  | 目標使用者                                | 設計重點                                           |
| ----------------------- | ----------------------------------------- | -------------------------------------------------- |
| Public Website          | 司機、企業、金融合作方、平台、車行        | 清楚說明合作價值，不做大雜燴                       |
| Tenant / Partner Portal | 企業、銀行、保險、旅行社、禮賓合作方      | 訂車 + 管理後台 + 應付帳款 + 報表                  |
| Partner Booking Web     | 信用卡/銀行/保險/旅行社終端使用者或合作方 | Program-specific booking                           |
| Driver App              | 司機 / 未來安全員                         | 多平台任務、服務產品、平台別收益                   |
| Fleet Partner Portal    | 車行、車隊合作夥伴                        | 司機、車輛、分潤、品質責任                         |
| Platform Admin          | 智慧運輸科技內部平台管理                  | service product、車輛資格、車行、租戶、方案        |
| Ops Console             | 營運、客服、派遣、行控                    | service-aware dispatch、eligibility、manual review |

---

# Part A — Public Website 視覺需求

## A1. 網站資訊架構

公開網站主選單：

```text
首頁
司機合作
企業與機場接送合作
平台導單合作
車行／車隊合作
關於我們
```

右上角：

```text
登入
聯絡合作
```

登入分流：

```text
企業／合作方 Portal
平台管理後台
營運後台
車行合作夥伴 Portal
司機 App 入口
```

---

## A2. 首頁設計

### 目的

首頁只能讓人看懂三件事：

1. 司機可以用同一個 App 接更多平台訂單。
2. 企業 / 金融 / 保險 / 旅行社可以取得穩定車隊履約、報表、月結與治理能力。
3. 第三方平台可以導單與同步狀態，但原平台規則不被改寫。

### Hero 文案

主標題：

> 多平台訂單整合，讓司機接更多單，讓企業有穩定車隊履約

副標題：

> 智慧運輸科技股份有限公司整合第三方叫車平台、企業派車、機場接送、保險代步、旅行社接送與車行供給，透過統一司機工作台與營運平台，協助合作方提升派車履約效率與對帳透明度。

CTA：

- 司機合作申請
- 企業合作洽詢
- 平台導單合作

### 首頁三大主卡

#### 卡片 1：我是司機

標題：

> 用同一個 App 接更多平台訂單

內容：

- 接收不同合作平台任務
- 對各平台上線／下線
- 查看平台別與服務別收益
- 接收商務派車、機場接送與合作方案任務

CTA：

> 了解司機合作

---

#### 卡片 2：我是企業／金融／合作方

標題：

> 商務派車、機場接送與月結對帳

內容：

- 企業用車預約
- 信用卡 / 銀行機場接送
- 保險代步與旅行社接送
- 成本中心、審批、額度與月結報表

CTA：

> 洽詢合作方案

---

#### 卡片 3：我是叫車平台／車行合作方

標題：

> 串接司機供給、任務狀態與分潤對帳

內容：

- 第三方平台導單
- 車行招募與管理司機
- 任務 mirror 與狀態同步
- 平台別 / 車行別收益與對帳

CTA：

> 洽詢平台或車隊合作

---

## A3. 司機合作頁

### 主要訊息

> 一個 App，接更多平台訂單。

### 必要區塊

1. Hero
2. 多平台任務說明
3. 平台別上線 / 下線
4. 服務產品任務卡示意
5. 收益與對帳
6. 加入條件
7. 加入流程
8. FAQ
9. CTA

### App 任務卡視覺需求

請設計 Driver App 任務卡 mockup，包含：

- service product badge
- source platform badge
- tenant / partner program name
- reservation time or realtime countdown
- pickup / dropoff
- vehicle eligibility / license requirement
- route locked / route provided
- proof required
- estimated earnings
- accept / reject action

### 任務卡範例

```text
[信用卡機場接送] 國泰世華機場接送
預約時間：06/08 07:30
航班：BR198
車型：商務車 / 機場接送資格
來源：Partner Booking
Proof：停車費憑證、完成照片
```

```text
[第三方平台] LINE GO
接單期限：25 秒
路線：由來源平台提供
規則：依來源平台派單
收益：平台別統計
```

---

## A4. 企業與機場接送合作頁

### 頁面定位

這一頁服務：

- 大型企業
- 銀行 / 信用卡
- 保險公司
- 旅行社 / 禮賓服務

### 必要區塊

1. Hero
2. 企業派車
3. 信用卡 / 銀行機場接送
4. 保險代步
5. 旅行社 / 禮賓接送
6. 管理後台能力
7. 報表與對帳
8. 合作方式
9. CTA

### 企業管理後台能力展示

請設計一張 dashboard preview，包含：

- 本月完成趟次
- 本月應付金額
- 待審批訂單
- 異常 / no-show
- 成本中心用量
- 月結 / 發票狀態

---

## A5. 平台導單合作頁

### 核心訊息

> 智慧運輸科技協助合作平台將任務導入司機工作台，並同步接單、狀態與對帳資訊；原平台的派單規則、乘客流程與付款邏輯不被改寫。

### 必要區塊

1. 我們提供什麼
2. 我們不做什麼
3. 技術合作方式
4. 串接流程
5. 對帳與收益
6. CTA

### 必須視覺強調

「合作邊界清楚」：

- 不改寫第三方平台派單規則
- 不重算第三方平台路線
- 不取代第三方平台乘客流程
- 不擁有第三方平台乘客關係
- 不把 forwarded 單變成自家 owned dispatch 單

---

## A6. 車行／車隊合作頁

### 頁面目的

讓車行與車隊知道：協助招募與管理司機，可以取得分潤與管理工具。

### 必要區塊

1. Hero
2. 車行可以得到什麼
3. 分潤與管理責任
4. 司機 / 車輛管理
5. 對帳單與品質指標
6. 合作流程
7. CTA

### 車行 dashboard preview

請設計 Fleet Partner Portal dashboard mockup：

- 旗下司機數
- 可接單司機
- 本月完成趟次
- 本月車行分潤
- 缺件司機
- 申訴 / 事故
- 訓練完成率

---

# Part B — Tenant / Partner Portal 視覺需求

## B1. 定位

Tenant Portal 不是單純訂車頁，而是：

# Tenant Business Operations Portal

它要讓企業 / 銀行 / 保險 / 旅行社 / 合作方知道：

- 誰叫車
- 叫了哪些車
- 完成狀況
- 異常狀況
- 總共要付多少錢
- 依什麼成本中心 / 保單 / 團號 / 合作方案分攤
- 哪些訂單需要審批
- 哪些訂單已入帳或開票

---

## B2. IA / Side Navigation

建議側邊欄：

```text
Dashboard
Bookings / Trips
New Booking
Users / Riders
Passengers
Address Book
Cost Centers
Approval Rules
Quota / Usage
Service Programs
Payables
Invoices / Statements
Reports
API Keys / Webhooks
Notifications / SLA
Audit Trail
Settings
```

依租戶類型顯示不同用語：

| 租戶類型      | Users 命名                     |
| ------------- | ------------------------------ |
| 企業          | Employees / Riders             |
| 銀行 / 信用卡 | Eligible Members / Cardholders |
| 保險          | Claimants / Policy Cases       |
| 旅行社        | Travelers / Groups             |

---

## B3. Dashboard

### 必要卡片

- 本月完成趟次
- 本月應付金額
- 待審批訂單
- 異常 / 申訴
- 成本中心用量
- 方案用量
- 已開發票金額
- 未付款金額

### 圖表

- 每日 / 每週趟次趨勢
- 成本中心費用分布
- 服務產品分布
- 完成 / 取消 / no-show 比例

---

## B4. Bookings / Trips Management

### 表格欄位

- order id
- service product
- source channel
- passenger / user
- requester
- pickup time
- pickup / dropoff
- driver / vehicle
- status
- fare
- cost center / program / case no / group no
- invoice status
- complaint / incident status

### Detail 頁必須有 tabs

```text
Overview
Passenger / User
Route / Time
Driver / Vehicle
Approval / Quota
Billing
Proof / Attachments
Audit
```

---

## B5. New Booking

New Booking 必須依 service product 改變表單。

### 基本欄位

- service product
- service timing：realtime / reservation
- passenger / user
- requester
- pickup
- dropoff
- reservation time
- cost center
- program
- proof requirement

### 企業派車欄位

- cost center
- approver
- quota impact
- approval result
- department
- onsite contact

### 信用卡 / 銀行機場接送欄位

- partner program
- eligibility verification
- card last4 / reference token
- airport direction
- flight number
- terminal
- luggage count
- pickup sign

### 保險代步欄位

- insurance company
- policy number
- claim number
- claimant
- replacement period
- service entitlement
- case handler

### 旅行社 / 禮賓欄位

- travel agency
- group number
- traveler count
- luggage count
- guide / tour leader contact
- flight number
- multi-stop
- signage requirement

---

## B6. Payables / Billing / Statements

### 必要內容

- 本月應付總額
- 已完成趟次金額
- 取消費
- no-show 費
- 停車費 / 過路費 / 等候費 / 舉牌費
- 折扣 / 補貼
- 稅額
- 發票狀態
- 已付款 / 未付款
- 對帳差異

### 分組 filter

- service product
- cost center
- department
- user
- partner program
- insurance claim
- travel group
- invoice status

---

# Part C — Partner Booking Web 視覺需求

## C1. 定位

Partner Booking Web 是白牌 / 合作入口，不是完整 Tenant Portal。

它服務：

- 信用卡持卡人 / 禮賓代訂
- 保險代步使用者 / 理賠承辦人
- 旅行社 / 團體接送窗口
- 企業外部 booking link

---

## C2. 必要畫面

1. Partner Entry Landing
2. Eligibility Verification
3. Program-specific Booking Form
4. Review & Confirm
5. Booking Success
6. Booking Tracking
7. Error / Ineligible / Manual Review

---

## C3. Program-specific forms

### Credit Card Airport Transfer

視覺重點：金融 / 權益 / 機場接送。

欄位：

- card last4 / reference token
- eligibility result
- airport direction
- flight number
- terminal
- luggage
- passenger contact
- pickup / dropoff

### Insurance Replacement Vehicle

視覺重點：案件、保單、代步期間。

欄位：

- policy number
- claim number
- claimant
- replacement period
- case handler
- vehicle class
- entitlement status

### Travel Agency Transfer

視覺重點：團體、旅客、航班、接送。

欄位：

- group number
- traveler count
- luggage count
- guide contact
- flight number
- multi-stop
- signage requirement

---

# Part D — Driver App 視覺需求

## D1. 定位

Driver App 是：

# 多平台司機工作台

不是單一自家派遣 App。

---

## D2. Bottom Tab 建議

```text
首頁
任務
平台
收益
設定
```

---

## D3. Driver Home

顯示：

- 今日狀態
- 平台上線摘要
- 今日任務
- 今日收益
- 文件 / 訓練提醒
- 目前可接服務產品

---

## D4. Jobs Inbox

任務卡必須顯示：

- service product badge
- source platform / tenant / partner
- realtime or reservation
- pickup / dropoff
- reservation time or accept countdown
- required license / vehicle eligibility
- route locked
- fixed fare / fare authority
- proof requirement
- fleet partner attribution if applicable

---

## D5. Platform / Eligibility Center

顯示：

- LINE GO / external platform online/offline
- enterprise dispatch eligibility
- airport transfer eligibility
- insurance replacement eligibility
- travel agency transfer eligibility
- document missing
- training required
- vehicle not eligible reason

---

## D6. Earnings

必須分組：

- total earnings
- by platform
- by service product
- by tenant / partner
- gross / fee / subsidy / net
- fleet partner commission if applicable
- payout status

---

# Part E — Fleet Partner Portal 視覺需求

## E1. 定位

Fleet Partner Portal 是給車行 / 車隊合作夥伴使用。

目的：

- 管理旗下司機
- 管理車輛
- 看趟次
- 看分潤
- 看缺件與品質
- 承擔部分管理責任

---

## E2. Side Navigation

```text
Dashboard
Drivers
Vehicles
Trips
Revenue Share
Statements
Documents
Training
Incidents / Complaints
Quality Metrics
```

---

## E3. Dashboard

卡片：

- 旗下司機數
- 可接單司機
- 本月完成趟次
- 本月總營收
- 本月車行分潤
- 缺件司機
- 事故 / 申訴
- 訓練完成率

---

## E4. Revenue Share / Statement

顯示：

- per-trip commission
- recruitment bonus
- monthly management fee
- performance bonus
- penalty / clawback
- payable amount
- statement download

---

# Part F — Platform Admin 視覺需求

## F1. 必補管理面

新增或強化：

```text
Service Products
Vehicle Eligibility Matrix
Fleet Partners
Driver Affiliations
Revenue Share Rules
Fleet Statements
Tenant Service Programs
Partner Programs
```

---

## F2. Service Products

表格欄位：

- service product name
- timing：realtime / reservation
- allowed license types
- fixed fare allowed
- meter required
- proof requirements
- active

---

## F3. Vehicle Eligibility Matrix

設計成 matrix：

rows：service products  
columns：vehicle license types / capabilities

每格顯示：

- allowed / not allowed
- conditionally allowed
- required documents
- training required
- permit required

---

## F4. Fleet Partners

顯示：

- 車行名稱
- 司機數
- 車輛數
- active drivers
- monthly trips
- revenue share amount
- quality score
- missing documents

---

# Part G — Ops Console 視覺需求

## G1. Dispatch Board

新增 filter：

- service product
- realtime / reservation
- vehicle license type
- eligibility failed reason
- tenant
- partner program
- fleet partner
- source platform

---

## G2. Task Cards

任務卡顯示：

- service product
- tenant / partner
- cost center / program
- approval state
- eligibility state
- qualified supply count
- assigned driver / vehicle
- exception state

---

## G3. Manual Review Queue

Queue 類型：

- eligibility manual review
- approval timeout
- quota blocked
- no qualified vehicle
- partner exception
- driver document issue
- fleet partner responsibility

---

# Part H — Design System 補充

## H1. 必備 badge

- service product badge
- source platform badge
- tenant / partner badge
- realtime / reservation badge
- route locked badge
- fixed fare badge
- proof required badge
- eligibility failed badge
- approval pending badge
- quota warning badge
- fleet partner badge

---

## H2. 狀態色

| 狀態                          | 色彩建議 |
| ----------------------------- | -------- |
| active / eligible / completed | green    |
| pending / waiting / scheduled | blue     |
| warning / quota low           | amber    |
| blocked / failed / rejected   | red      |
| draft / inactive              | gray     |
| external / forwarded          | indigo   |

---

## H3. 表格必備能力

- filter chips
- bulk export
- saved view
- status pill
- grouped summary row
- expandable detail drawer
- audit icon
- download icon

---

# Part I — 設計交付清單

視覺設計團隊需交付：

## Public Website

- Home desktop/mobile
- Driver Cooperation desktop/mobile
- Enterprise & Airport Cooperation desktop/mobile
- Platform Integration desktop/mobile
- Fleet Partner Cooperation desktop/mobile
- About desktop/mobile
- Contact form
- Login split

## Tenant Portal

- Dashboard
- Orders / Trips
- Booking Detail
- New Booking service-product variants
- Cost Centers
- Approval Rules
- Quota / Usage
- Payables
- Invoices / Statements
- Service Programs
- Users / Eligible Riders

## Partner Booking

- Credit-card airport transfer flow
- Insurance replacement flow
- Travel agency flow
- Review / Confirm
- Tracking
- Error / Manual Review

## Driver App

- Home
- Jobs Inbox
- Task Detail variants
- Platform / Eligibility Center
- Earnings
- Settings / Documents

## Fleet Partner Portal

- Dashboard
- Drivers
- Vehicles
- Trips
- Revenue Share
- Statements
- Quality Metrics

## Platform Admin

- Service Products
- Vehicle Eligibility Matrix
- Fleet Partners
- Revenue Share Rules
- Tenant Service Programs

## Ops Console

- Dispatch Board
- Eligibility Failed Panel
- Manual Review Queue
- Fleet Partner Responsibility View
- Incident / Complaint responsibility panel

---

# Part J — 設計驗收標準

設計稿必須通過以下驗收：

1. 公開網站不混淆成一般乘客叫車平台。
2. Tenant Portal 清楚呈現「管理後台」價值，而不是只有訂車。
3. Partner Booking 依信用卡、保險、旅行社不同方案顯示不同表單。
4. Driver App 任務卡能一眼看出 service product / source platform / eligibility / proof。
5. Fleet Partner Portal 能讓車行看懂司機、車輛、分潤、責任。
6. Platform Admin 能管理 service product 與車輛資格矩陣。
7. Ops Console 能看見為何某車可派或不可派。
8. 所有金額、趟次、對帳、報表畫面要清楚，不可只做空洞 dashboard。
9. 不可在前端承諾自駕可用或自駕優惠。
10. 不可讓第三方平台合作頁看起來像我們要改寫對方規則。

---

# 最終裁決

本次前端視覺設計不只是網站改版，而是 Phase 1 商業模式補強後的完整產品面設計。

視覺設計團隊必須一次納入：

1. Tenant Business Operations Portal
2. Service Product / Vehicle Eligibility Matrix
3. Program-specific Partner Booking
4. Service-aware Driver App
5. Fleet Partner Portal
6. Fleet Partner revenue share / quality responsibility
7. Service-aware Platform Admin
8. Eligibility-aware Ops Console

這些是 Phase 1 商業化營運必要畫面，不是 Phase 2，也不是可選補充功能。
