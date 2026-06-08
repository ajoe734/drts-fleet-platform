# Phase 1 完整系統分析文件（SA）— 給系統開發團隊執行用

**文件版本**：v3.0
**日期**：2026-06-04
**適用專案**：智慧運輸科技股份有限公司 Phase 1
**適用 repos**：

- `drts-fleet-platform`
- `tenant-commute-hub`

**文件目的**：

本文件是 Phase 1 的完整系統分析文件，目標是把目前已確認的商業模式、服務對象、業務流程、角色、資料責任與缺口一次收斂，供系統開發團隊直接接任務執行。

本輪不再把系統定義成一般之客叫車平台，也不再定義成單純直賣系統服務。Phase 1 的正確定位是：

> **多平台調車調度、整合派車履約、企業 / 金融 / 保險 / 旅行社合作方租用管理、司機多平台工作台、車行合作及分潤平台的集合監管系統。**

---

## 0. Executive Summary

### 0.1 Phase 1 必須完成的核心能力

Phase 1 必須完成下列 10 條核心主線：

1. **Tenant Business Operations Portal**
   - 企業、銀行、信用卡、保險代步、旅行社等 tenant 不只需要訂車頁，也需要管理履約。
   - 必須能查訂單、使用者、帳單生成、應付金額、發票、對帳、報表、異常與申訴。

2. **Partner / Tenant Booking**
   - 支援企業派車、信用卡機場接送、保險代步車、旅行社接送等 partner / tenant 預約入口。
   - 這不是一般乘客 App。

3. **Service Product / Vehicle Eligibility Matrix**
   - 計程車即時叫車、計程車預約、企業派車、機場接送、保險代步、旅行社接送、第三方平台落地是不同 service product。
   - 系統必須依服務產品檢查車輛牌照、司機資格、車型、機場接送資格、是否可固定價、是否可即時/預約。

4. **Driver Multi-Platform Workbench**
   - Driver App 必須支援不同平台任務、平台別上線/下線、平台別收益。
   - 第三方平台單一隻派、不隻算路線、不要蓋掉來源平台規則。

5. **Forwarder / Third-party Platform Integration**
   - 外部平台是 passenger / dispatch / route / payment 的 native authority。
   - 我方做 mirror、relay、sync、earnings aggregation、settlement mirror。

6. **Tenant Governance**
   - 成本中心、審批規則、quota / usage、approval workflow 必須支援大型企業及合派車治理。

7. **Fleet Partner / 車行合作及分潤與責任管理**
   - 車行協助招募並管理司機，需要分潤、管理費、車行對帳與責任歸屬。
   - 系統需管理車行、司機歸屬、車輛歸屬、服務來源、分潤規則、品質指標、申訴與事故責任。

8. **Ops / Call Center / Complaint / Evidence**
   - 監管人員需要派遣看板、例外處理、客服、申訴、錄音索引、證據與監理 filing support。

9. **Billing / Settlement / Reporting**
   - 對 tenant、partner、driver、fleet partner、platform 都要能算帳。
   - 必須支援 tenant payable、driver earnings、platform earnings、fleet partner revenue share、partner settlement、成本中心切割報表。

10. **Platform Admin / Control Plane**
    - 管理 tenant、partner、service product、eligibility matrix、fleet partner、pricing、split、feature flags、audit、rollout、external adapters。

### 0.2 Phase 1 明確不做

Phase 1 不做：

- 一般消費者與第三方 Passenger App / Web。
- 乘客客服中心。
- 乘客客訴中心。
- 替第三方平台重寫派單規則。
- 替第三方平台重算路線。
- 完整自駕載客 runtime。
- 自駕拋接 / 自駕保證可派。
- 讓 Lovable / tenant frontend 自行決定 production schema 或 business authority。

---

# 1. 商業模式與服務對象

## 1.1 商業模式定位

智慧運輸科技股份有限公司的 Phase 1 商業模式不是「賣系統」或「做乘客叫車 App」，而是：

1. **整合多來源訂單**
   - 第三方平台落地
   - 企業派車
   - 信用卡 / 銀行機場接送
   - 保險代步車
   - 旅行社 / 禮賓接送

2. **提供司機任務入口**
   - 司機用同一隻 App 接不同平台/不同產品的任務。
   - 司機可平台別上線/下線。
   - 司機可查看平台別收益與總收益。

3. **提供企業 / 合作方履約管理**
   - 預約
   - 成本中心
   - 審批
   - 額度
   - 月結
   - 報表
   - 發票
   - 對帳

4. **提供平台的監管與監理**
   - 派遣
   - 異常
   - 申訴
   - 錄音
   - 證據
   - 報表
   - filing
   - audit

5. **透過車行/車隊合作擴大司機供給**
   - 車行協助招募、管理、訓練。
   - 平台提供分潤、管理費、對帳與責任工具。

---

## 1.2 服務對象總表

| 服務對象 | Phase 1 要服務什麼 | 對應系統 |
|---|---|---|
| 司機 | 多平台任務、平台別上線/下線、平台別收益、各別任務履約 | Driver App |
| 第三方叫車平台 | 落地、mirror、accept relay、status sync、settlement mirror | Forwarder / Adapter |
| 大型企業 | 預約、使用者、成本中心、審批、額度、報表、月結 | Tenant Portal |
| 銀行/信用卡 | 機場接送本欄、資格驗證、履約追蹤、對帳 | Partner Booking / Tenant Portal |
| 保險公司 | 保險代步、案件/保單、車主用車、理賠對帳 | Partner Booking / Tenant Portal |
| 旅行社/禮賓 | 接客接送、航班、行李、多點、司導、報表 | Partner Booking / Tenant Portal |
| 車行/車隊 | 招募司機、管理車輛、分潤、品質責任、對帳 | Fleet Partner Portal |
| 平台監管 | 派遣、例外、客服、申訴、manual review、監管報表 | Ops Console |
| 平台管理 | tenant、partner、pricing、fleet、service product、eligibility、audit、rollout | Platform Admin |
| 監理 / 稽核 | 車輛、駕駛、保險、契約、錄音、申訴、派遣記錄、消費證據 | Regulatory / Filing / Audit |

---

# 2. 角色與權限分析

## 2.1 Tenant 角色

| 角色 | 權限摘要 |
|---|---|
| `tenant_admin` | 租戶全權管理：使用者、服務方案、成本中心、審批、額度、報表、發票、審計 |
| `tenant_ops_admin` | 建單、派單、處理異常、管理乘客/使用者/地址簿 |
| `tenant_finance_admin` | 應付帳款、發票、對帳、成本中心、報表 |
| `tenant_approver` | 對自己負責的 approval requests 核可/月結 |
| `tenant_viewer` | 只讀查詢 |
| `partner_operator` | 合作方監管建單/派單 |
| `partner_finance` | 合作方報表/對帳 |

## 2.2 Driver / Fleet 角色

| 角色 | 權限摘要 |
|---|---|
| `driver` | 上線/下線、接任務、回報證明、收尾、查看收益 |
| `driver_supervisor` | 未來可用於安全員/督導員 |
| `fleet_partner_admin` | 車行管理員，可管理旗下司機/車輛/文件/收益/品質 |
| `fleet_partner_finance` | 查車行分潤、statement、付款生成 |
| `fleet_partner_ops` | 司機文件、訓練、事件/申訴協調 |

## 2.3 Platform / Ops 角色

| 角色 | 權限摘要 |
|---|---|
| `platform_admin` | 平台最高管理：tenant/partner/fleet/service product/pricing/audit |
| `platform_ops` | 監管派遣、例外處理、任務監控 |
| `platform_finance` | 收費、對帳、發票、分潤、付款 |
| `platform_compliance` | 監理資料、錄音、申訴、audit、filing |
| `call_center_agent` | 話務建單、客服、申訴受理 |
| `roc_operator` | 行控/事件/高風險監管監理 |

---

# 3. Service Product 分析

## 3.1 為什麼要有 Service Product

台灣計程車即時叫車、計程車預約、企業派車、機場接送、保險代步、旅行社接送，本質上不是同一種服務。差異變因有：

- 是否即時
- 是否預約
- 費率/固定價/表價
- 乘客關係由誰擁有
- 車輛牌照/營業類別要求
- 司機資格
- proof requirement
- billing / settlement 對象
- 是否需要審批
- 是否需要 partner eligibility
- 是否能由第三方平台規則主導

因此 Phase 1 必須正式引入 `ServiceProduct`。

## 3.2 Service Product 清單

| Service Product | 說明 | 時機 | 需求入口 |
|---|---|---|---|
| `taxi_realtime` | 計程車即時叫車 / 第三方平台即時單 | realtime | third-party / operator |
| `taxi_reservation` | 計程車預約 | reservation | tenant / operator |
| `enterprise_dispatch` | 企業合派車 | reservation | tenant |
| `credit_card_airport_transfer` | 信用卡/銀行機場接送 | reservation | partner / tenant |
| `insurance_replacement_vehicle` | 保險代步車 | reservation / case-based | partner |
| `travel_agency_transfer` | 旅行社/禮賓接送 | reservation | partner |
| `third_party_forwarded_order` | 第三方平台落地 | external-platform-defined | third-party platform |

## 3.3 Vehicle Eligibility Matrix

| Service Product | 可用車輛類型 | 備註 |
|---|---|---|
| `taxi_realtime` | taxi / multi_purpose_taxi | 依計程車/平台資格 |
| `taxi_reservation` | taxi / multi_purpose_taxi | 預約計程車 |
| `enterprise_dispatch` | rental_car / business_vehicle / multi_purpose_taxi / contract allowed taxi | 依合約與牌照 |
| `credit_card_airport_transfer` | rental_car / airport_transfer_vehicle / business_vehicle / multi_purpose_taxi | 須機場接送資格與服務規格 |
| `insurance_replacement_vehicle` | rental_car / business_vehicle / multi_purpose_taxi | 依保險方案 |
| `travel_agency_transfer` | rental_car / business_vehicle / airport_transfer_vehicle | 依團體/禮賓需求 |
| `third_party_forwarded_order` | 依來源平台 eligibility | 不由我方重寫平台資格 |

---

# 4. Business Flow 分析

## 4.1 Flow A：企業派車與月結

```text
tenant_admin 建立使用者
→ 設成本中心
→ 設審批規則與 quota
→ 使用者/行政代訂人建立 booking
→ 系統驗證 service product 與 vehicle eligibility
→ 顯示 quota impact
→ 評估 approval rules
→ 主管核可或系統放行
→ booking 進入 dispatch / reservation
→ 符合資格車輛與司機履約
→ trip completed
→ cost center 入帳
→ tenant payable summary
→ invoice / statement / report
→ audit trail
```

## 4.2 Flow B：信用卡/銀行機場接送

```text
partner entry
→ eligibility verify
→ 乘客輸入航班/航廈/行李/接送方向
→ create airport transfer booking
→ system checks service product + vehicle eligibility
→ reservation dispatch
→ driver task with airport-specific proof requirements
→ trip completed
→ partner report
→ settlement / reconciliation
→ audit
```

## 4.3 Flow C：保險代步

```text
insurance partner entry
→ policy / claim reference validation
→ vehicle replacement booking
→ case owner / insured person linkage
→ dispatch eligible vehicle
→ trip / rental period tracking
→ insurer payable summary
→ case-based report
→ audit
```

## 4.4 Flow D：旅行社/禮賓接送

```text
travel agency partner entry
→ group / passenger / flight / luggage data
→ create transfer booking
→ multi-stop / vehicle capacity requirement
→ dispatch eligible vehicle
→ driver proof and completion
→ agency report / statement
→ audit
```

## 4.5 Flow E：第三方平台落地

```text
external platform sends order
→ adapter verifies request
→ task mirror created
→ driver sees sourcePlatform task
→ driver accepts
→ accept relay to external platform
→ platform confirms / lost race / cancels
→ status sync
→ platform earnings ledger
→ settlement mirror
```

## 4.6 Flow F：車行招募與分潤

```text
fleet partner recruits driver
→ platform reviews driver and vehicle
→ driver affiliated with fleet partner
→ driver completes trips
→ system computes driver earning
→ system computes fleet partner revenue share / management fee / bonus / penalty
→ fleet partner statement
→ platform payout
→ quality metrics and responsibility tracking
```

---

# 5. 現有系統缺口分析

## 5.1 Tenant Portal 缺口

Tenant Portal 不可只停留在訂車頁。必須補成 Tenant Business Operations Portal。

### 必補能力

1. Tenant Dashboard Payable Summary
2. Orders / Trips Management
3. Users / Riders / Eligible Members
4. Payable / Invoice Statement
5. Service Programs
6. Insurance Replacement View
7. Travel Agency Transfer View
8. Partner Program Usage
9. Cost-center-aware reporting
10. Approval / quota audit trace

## 5.2 Partner Booking 缺口

Partner Booking 需要依 program type 呈現不同欄位，不可只有 generic booking form。

### 必補 program-specific forms

1. Credit-card airport transfer
2. Insurance replacement vehicle
3. Travel agency transfer
4. Enterprise dispatch
5. Generic partner reservation

## 5.3 Driver App 缺口

Driver App 必須 service-aware。

### 必補

1. service product badge
2. source platform badge
3. tenant / partner program display
4. vehicle eligibility requirement display
5. route authority display
6. fare authority display
7. proof requirement display
8. platform earnings grouped view
9. service-product grouped earnings
10. fleet partner attribution display where applicable

## 5.4 Fleet Partner 缺口

目前 Phase 1 必須新增 Fleet Partner capability。

### 必補

1. Fleet Partner model
2. Driver affiliation
3. Vehicle affiliation
4. Revenue share rules
5. Fleet partner statements
6. Fleet partner quality metrics
7. Fleet Partner Portal
8. Platform Admin Fleet Partner Management

## 5.5 Ops Console 缺口

Ops Console 必須 service-product aware。

### 必補

1. dispatch board service product filter
2. vehicle license / eligibility failed reason
3. reservation vs realtime indicator
4. partner program indicator
5. fleet partner attribution
6. manual review queue
7. eligibility exception queue
8. approval timeout / quota block queue
9. incident responsibility attribution

## 5.6 Platform Admin 缺口

Platform Admin 必須補三個控制面：

1. Service Products
2. Vehicle Eligibility Matrix
3. Fleet Partners / Revenue Share

---

# 6. Domain Model 分析

## 6.1 ServiceProduct

```ts
type ServiceProductType =
  | "taxi_realtime"
  | "taxi_reservation"
  | "enterprise_dispatch"
  | "credit_card_airport_transfer"
  | "insurance_replacement_vehicle"
  | "travel_agency_transfer"
  | "third_party_forwarded_order";

interface ServiceProduct {
  serviceProductId: string;
  serviceProductType: ServiceProductType;
  displayName: string;
  description?: string;
  timing: "realtime" | "reservation" | "external_defined";
  active: boolean;
  defaultBillingMode: "meter" | "fixed_fare" | "tenant_invoice" | "partner_settlement";
  defaultProofRequirements: string[];
}
```

## 6.2 VehicleServiceCapability

```ts
type VehicleLicenseType =
  | "taxi"
  | "multi_purpose_taxi"
  | "rental_car"
  | "business_vehicle"
  | "airport_transfer_vehicle";

interface VehicleServiceCapability {
  vehicleId: string;
  licenseType: VehicleLicenseType;
  supportedProducts: ServiceProductType[];
  seatCount: number;
  luggageCapacity: number;
  airportPermit: boolean;
  businessDispatchEligible: boolean;
  taxiMeterRequired: boolean;
  fixedFareAllowed: boolean;
  platformForwardingAllowed: boolean;
}
```

## 6.3 TenantServiceProgram

```ts
interface TenantServiceProgram {
  programId: string;
  tenantId: string;
  programType:
    | "enterprise_dispatch"
    | "credit_card_airport_transfer"
    | "insurance_replacement_vehicle"
    | "travel_agency_transfer"
    | "taxi_platform_forwarding";
  displayName: string;
  active: boolean;
  billingMode: "monthly_invoice" | "per_trip_invoice" | "partner_settlement";
  pricingPlanId: string;
  eligibilityRuleId?: string;
  serviceRuleSetId: string;
}
```

## 6.4 FleetPartner

```ts
interface FleetPartner {
  fleetPartnerId: string;
  legalName: string;
  displayName: string;
  businessRegistrationNo: string;
  contactName: string;
  contactPhone: string;
  active: boolean;
  partnershipType:
    | "driver_recruitment"
    | "fleet_management"
    | "vehicle_owner_group"
    | "business_dispatch_fleet";
}
```

## 6.5 DriverFleetAffiliation

```ts
interface DriverFleetAffiliation {
  affiliationId: string;
  driverId: string;
  fleetPartnerId: string;
  affiliationType:
    | "recruited_by"
    | "managed_by"
    | "vehicle_owned_by"
    | "contracted_under";
  effectiveFrom: string;
  effectiveUntil?: string;
}
```

## 6.6 FleetPartnerRevenueShareRule

```ts
interface FleetPartnerRevenueShareRule {
  ruleId: string;
  fleetPartnerId: string;
  appliesTo:
    | "all_trips"
    | "tenant_program"
    | "service_product"
    | "driver_group"
    | "platform_source";
  serviceProduct?: ServiceProductType;
  tenantServiceProgramId?: string;
  sourcePlatform?: string;
  formula:
    | "percent_of_gross"
    | "fixed_per_trip"
    | "monthly_fixed"
    | "tiered_bonus";
  rateBps?: number;
  fixedAmountMinor?: number;
  effectiveFrom: string;
  effectiveUntil?: string;
}
```

---

# 7. 前端產品面分析

## 7.1 Public Website

### P0 頁面

1. 首頁
2. 司機合作
3. 企業與機場接送合作
4. 平台落地合作
5. 車行 / 車隊合作
6. 關於我們
7. 聯絡合作
8. 註冊引流

## 7.2 Tenant Portal

### P0 頁面

1. Dashboard
2. New Booking
3. Booking List
4. Booking Detail
5. Orders / Trips
6. Users / Riders
7. Cost Centers
8. Approval Rules
9. Quota / Usage
10. Payables / Billing
11. Invoices / Statements
12. Service Programs
13. Reports
14. API Keys / Webhooks
15. Audit Trail

## 7.3 Partner Booking Web

### P0 Forms

1. Credit Card Airport Transfer
2. Insurance Replacement Vehicle
3. Travel Agency Transfer
4. Enterprise Dispatch

## 7.4 Driver App

### P0 Screens

1. Multi-platform jobs inbox
2. Platform presence center
3. Service-aware task detail
4. Proof collection
5. Platform / service / tenant grouped earnings
6. Shift
7. Incident / SOS
8. Settings / training / documents

## 7.5 Fleet Partner Portal

### P0 Pages

1. Dashboard
2. Drivers
3. Vehicles
4. Trips
5. Revenue Share / Statements
6. Documents
7. Training
8. Incidents / Complaints
9. Quality Metrics

## 7.6 Platform Admin

### P0 Pages

1. Service Products
2. Vehicle Eligibility Matrix
3. Fleet Partners
4. Driver Affiliations
5. Revenue Share Rules
6. Fleet Statements
7. Tenant Service Programs
8. Partner Programs
9. Pricing / Split
10. Audit / Compliance

## 7.7 Ops Console

### P0 Pages

1. Service-aware Dispatch Board
2. Eligible Supply Panel
3. Manual Review Queue
4. Approval Queue
5. Partner Exception Queue
6. Driver / Fleet Presence
7. Incident / Complaint Responsibility
8. Reports / Filing

---

# 8. Workflow Families

Phase 1 完整 SA 定義以下 workflow families。

| Workflow ID | 名稱 |
|---|---|
| `WF-TEN-BIZ-001` | Tenant Business Operations Flow |
| `WF-SVC-ELIG-001` | Service Product / Vehicle Eligibility Flow |
| `WF-FLEET-001` | Fleet Partner Recruitment / Revenue Share Flow |
| `WF-TGV-001` | Tenant Governance Flow |
| `WF-DRV-MP-001` | Driver Multi-Platform Workbench Flow |
| `WF-FWD-001` | Third-party Forwarder Flow |
| `WF-PBK-001` | Partner Booking Flow |
| `WF-COM-001` | CTI / Recording / Filing Flow |
| `WF-FIN-GOV-001` | Governance-aware Billing / Reporting Flow |
| `WF-PROD-001` | Production Deployment Flow |

---

# 9. SA 結論

本輪 Phase 1 SA 將系統重新定義為：

> **以多平台司機任務工作台為供給核心，以企業/合作方及合派車管理為需求核心，以車行合作擴大司機供給，以 service product / vehicle eligibility matrix 確保正確履約，以 billing / settlement / audit 完成商業閉環的監管平台。**

系統開發團隊必須依此補齊：

1. Tenant Business Operations Portal
2. Service Product / Vehicle Eligibility Matrix
3. Fleet Partner / Revenue Share
4. Service-aware Driver App
5. Service-aware Ops Console
6. Fleet Partner Portal
7. Governance-aware Billing / Reporting
8. Business-flow E2E / release gates
