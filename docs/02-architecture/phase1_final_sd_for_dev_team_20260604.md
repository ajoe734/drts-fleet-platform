# Phase 1 完整系統設計文件（SD）— 給系統開發團隊執行用

**文件版本**：v4.0
**日期**：2026-06-04
**適用專案**：智慧運輸科技股份有限公司 Phase 1
**適用 repos**：

- `drts-fleet-platform`
- `tenant-commute-hub`

**文件目的**：

本文件是 Phase 1 的完整系統設計文件，目標是把 SA 所定義的服務框架轉成可實作的 domain、API、資料模型、前端調整、workflow gate、E2E、部署與驗收標準。

---

## 0. 設計總原則

### 0.1 Authority 原則

| repo / module | authority |
|---|---|
| `drts-fleet-platform` | canonical backend / BFF / contracts / API / auth / audit / billing / dispatch / partner / fleet authority |
| `tenant-commute-hub` | Tenant Portal frontend consumer |
| Driver App | mobile runtime，consumes `/api/driver/*` |
| Partner Booking Web | partner-specific booking frontend，consumes partner / tenant APIs |
| Platform Admin | platform control plane |
| Ops Console | operations / dispatch / incident / review console |

### 0.2 Phase 1 不允許的設計

- 前端自行定 production schema。
- Lovable 自行定 contracts。
- Tenant Portal 直接寫 production DB。
- 第三方平台實隻 owned dispatch engine 重派。
- Driver App 重算外部平台路線。
- Tenant frontend 承諾自駕載客或自駕可派。
- 系統只以 booking table 反向拼湊服務，而不使用 service product。

---

# 1. 模組架構

## 1.1 新增 / 強化 domain modules

```text
apps/api/src/modules/
  service-product/
  vehicle-eligibility/
  tenant-partner/
  fleet-partner/
  billing-settlement/
  platform-presence/
  platform-earnings/
  forwarder/
  owned-mobility/
  platform-admin/
  ops-console/
```

### Module Responsibility

| Module | Responsibility |
|---|---|
| `service-product` | service product registry、service timing、product attributes |
| `vehicle-eligibility` | vehicle license type、driver qualification、service eligibility matrix |
| `tenant-partner` | tenant directory、service programs、cost centers、approval、quota、users |
| `fleet-partner` | 車行/車隊合作夥伴、司機歸屬、分潤規則、車行 statement |
| `owned-mobility` | owned booking/order/dispatch/trip lifecycle |
| `forwarder` | third-party platform order mirror / relay / sync |
| `platform-presence` | driver platform online/offline |
| `platform-earnings` | platform-specific driver earnings |
| `billing-settlement` | tenant payable、driver statement、fleet partner statement、partner settlement |
| `platform-admin` | control-plane CRUD / rollout / pricing / audit |
| `ops-console` | dispatch board、manual review、incident、filing operations |

---

# 2. Service Product / Eligibility Matrix 設計

## 2.1 Types

```ts
export type ServiceProductType =
  | "taxi_realtime"
  | "taxi_reservation"
  | "enterprise_dispatch"
  | "credit_card_airport_transfer"
  | "insurance_replacement_vehicle"
  | "travel_agency_transfer"
  | "third_party_forwarded_order";

export type ServiceTiming =
  | "realtime"
  | "reservation"
  | "external_defined";

export type VehicleLicenseType =
  | "taxi"
  | "multi_purpose_taxi"
  | "rental_car"
  | "business_vehicle"
  | "airport_transfer_vehicle";

export interface ServiceProductRecord {
  serviceProductId: string;
  serviceProductType: ServiceProductType;
  displayName: string;
  description: string | null;
  timing: ServiceTiming;
  active: boolean;
  defaultBillingMode:
    | "meter"
    | "fixed_fare"
    | "tenant_invoice"
    | "partner_settlement"
    | "external_platform_settlement";
  defaultProofRequirements: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleServiceCapabilityRecord {
  capabilityId: string;
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
  active: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
}
```

## 2.2 API

```http
GET  /api/admin/service-products
POST /api/admin/service-products
PUT  /api/admin/service-products/{serviceProductId}

GET  /api/admin/vehicle-eligibility-matrix
PUT  /api/admin/vehicle-eligibility-matrix

GET  /api/ops/dispatch/eligible-supply?serviceProduct=...
GET  /api/driver/eligible-products
```

## 2.3 Dispatch enforcement

所有 dispatch / reservation / forwarder driver matching 前必須執行：

```text
serviceProduct
→ tenantServiceProgram
→ vehicle license type
→ driver qualification
→ vehicle capacity
→ airport permit
→ fixed fare allowed
→ platform forwarding eligibility
→ proof requirements
→ final eligible supply
```

## 2.4 Error Codes

```text
SERVICE_PRODUCT_INACTIVE
VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT
DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT
AIRPORT_PERMIT_REQUIRED
FIXED_FARE_NOT_ALLOWED
NO_ELIGIBLE_SUPPLY_FOR_SERVICE_PRODUCT
```

---

# 3. Tenant Business Operations Portal 設計

## 3.1 Tenant Dashboard API

```http
GET /api/tenant/dashboard
```

Response:

```ts
interface TenantDashboardSummary {
  tenantId: string;
  periodMonth: string;
  bookingCount: number;
  completedTripCount: number;
  cancelledTripCount: number;
  noShowTripCount: number;
  pendingApprovalCount: number;
  pendingExceptionCount: number;
  estimatedPayableAmountMinor: number;
  issuedInvoiceAmountMinor: number;
  unpaidInvoiceAmountMinor: number;
  costCenterWarnings: TenantCostCenterQuotaWarning[];
  upcomingBookings: TenantBookingSummary[];
}
```

## 3.2 Orders / Trips API

```http
GET /api/tenant/orders
GET /api/tenant/orders/{id}
GET /api/tenant/trips
```

Filters:

```ts
interface TenantOrderListQuery {
  from?: string;
  to?: string;
  serviceProduct?: ServiceProductType;
  status?: string;
  costCenterCode?: string;
  tenantServiceProgramId?: string;
  riderId?: string;
  sourcePlatform?: string;
  invoiceStatus?: string;
}
```

## 3.3 Payables API

```http
GET /api/tenant/payables/summary
GET /api/tenant/payables/line-items
GET /api/tenant/statements
GET /api/tenant/invoices
```

Phase 1 routing note for `WF-TEN-BIZ-001`:

- tenant business reporting reuses the existing report-job families
  `monthly_trip_report` and `revenue_summary`
- required tenant filters for this workflow are `tenantId`, `orderId`,
  `userId`, `costCenterCode`, and `serviceProduct`
- do not introduce a separate `tenant_business_operations` report job type or
  a JSON-only export contract in Phase 1
- if a dedicated tenant-business row schema is still needed later, treat it as
  follow-up execution work; it does not block the accepted Phase 1 summary /
  payable / statement contracts above

Types:

```ts
interface TenantPayableSummary {
  tenantId: string;
  periodMonth: string;
  totalTrips: number;
  completedTrips: number;
  cancelledTrips: number;
  noShowTrips: number;
  grossAmountMinor: number;
  adjustmentAmountMinor: number;
  taxAmountMinor: number;
  payableAmountMinor: number;
  invoiceStatus: "draft" | "issued" | "paid" | "overdue";
}

interface TenantPayableLineItem {
  lineItemId: string;
  orderId: string;
  tripId: string | null;
  serviceProduct: ServiceProductType;
  costCenterCode: string | null;
  tenantServiceProgramId: string | null;
  riderId: string | null;
  baseAmountMinor: number;
  extraAmountMinor: number;
  discountAmountMinor: number;
  taxAmountMinor: number;
  payableAmountMinor: number;
}
```

## 3.4 Service Programs API

```http
GET /api/tenant/service-programs
GET /api/tenant/service-programs/{programId}
```

Type:

```ts
interface TenantServiceProgramRecord {
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
  eligibilityRuleId: string | null;
  serviceRuleSetId: string;
  allowedServiceProducts: ServiceProductType[];
}
```

---

# 4. Partner Booking 設計

## 4.1 Program-specific forms

Partner Booking Web 必須依 program type 決定表單。

### Credit Card Airport Transfer

Fields:

```ts
interface CreditCardAirportTransferForm {
  partnerEntrySlug: string;
  programId: string;
  eligibilityVerificationId: string;
  cardLast4?: string;
  referenceToken?: string;
  direction: "pickup" | "dropoff";
  flightNo: string;
  terminal: string;
  luggageCount: number;
  passengerName: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
}
```

### Insurance Replacement Vehicle

```ts
interface InsuranceReplacementVehicleForm {
  partnerEntrySlug: string;
  programId: string;
  policyNo: string;
  claimNo: string;
  insuredName: string;
  contactPhone: string;
  replacementStartAt: string;
  replacementEndAt: string;
  vehicleClassRequested: string;
  caseHandlerName: string;
}
```

### Travel Agency Transfer

```ts
interface TravelAgencyTransferForm {
  partnerEntrySlug: string;
  programId: string;
  groupCode: string;
  passengerCount: number;
  luggageCount: number;
  tourLeaderName: string;
  tourLeaderPhone: string;
  flightNo?: string;
  stops: TravelTransferStop[];
  signboardRequired: boolean;
  vehicleClassRequested: string;
}
```

## 4.2 APIs

```http
GET  /api/partner-booking/entries/{entrySlug}
POST /api/partner-booking/eligibility/verify
POST /api/partner-booking/bookings
GET  /api/partner-booking/bookings/{bookingRef}
```

## 4.3 Cutover

Partner Booking live cutover unit:

```text
partnerEntry / entrySlug
```

Not whole tenant.

Required:

- cutoverOwner
- rollbackOwner
- oldRoute
- newRoute
- supportHotline
- monitoringDashboard
- negative path evidence

---

# 5. Driver App 設計

## 5.1 Job Card payload

```ts
interface DriverTaskCard {
  taskId: string;
  serviceProduct: ServiceProductType;
  sourceType: "owned" | "forwarded" | "partner";
  sourcePlatform: string | null;
  tenantName: string | null;
  tenantServiceProgramName: string | null;
  reservationTime: string | null;
  pickup: LocationSummary;
  dropoff: LocationSummary;
  routeAuthority: "internal" | "external" | "partner";
  fareAuthority: "internal" | "external" | "partner_fixed";
  routeLocked: boolean;
  fixedPrice: boolean;
  proofRequired: boolean;
  vehicleEligibilitySummary: string;
  fleetPartnerAttribution: FleetPartnerAttribution | null;
  acceptedActions: string[];
}
```

## 5.2 Platform Presence

```http
GET  /api/driver/platforms
POST /api/driver/platforms/{platformId}/online
POST /api/driver/platforms/{platformId}/offline
GET  /api/driver/eligible-products
```

## 5.3 Earnings

```http
GET /api/driver/earnings?groupBy=platform
GET /api/driver/earnings?groupBy=serviceProduct
GET /api/driver/statements?platform=&serviceProduct=&from=&to=
```

UI grouping:

- by sourcePlatform
- by serviceProduct
- by tenant / partner
- by fleet partner attribution
- total

---

# 6. Fleet Partner 設計

## 6.1 Models

```ts
interface FleetPartnerRecord {
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

interface DriverFleetAffiliationRecord {
  affiliationId: string;
  driverId: string;
  fleetPartnerId: string;
  affiliationType:
    | "recruited_by"
    | "managed_by"
    | "vehicle_owned_by"
    | "contracted_under";
  effectiveFrom: string;
  effectiveUntil: string | null;
}

interface FleetPartnerRevenueShareRuleRecord {
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

## 6.2 APIs

### Platform Admin

```http
GET  /api/admin/fleet-partners
POST /api/admin/fleet-partners
GET  /api/admin/fleet-partners/{id}
PUT  /api/admin/fleet-partners/{id}

GET  /api/admin/fleet-partners/{id}/drivers
POST /api/admin/drivers/{driverId}/fleet-affiliations

GET  /api/admin/fleet-partners/{id}/revenue-share-rules
POST /api/admin/fleet-partners/{id}/revenue-share-rules

GET  /api/admin/fleet-partners/{id}/statements
```

### Fleet Partner Portal

```http
GET /api/fleet-partner/dashboard
GET /api/fleet-partner/drivers
GET /api/fleet-partner/vehicles
GET /api/fleet-partner/trips
GET /api/fleet-partner/statements
GET /api/fleet-partner/quality-metrics
```

## 6.3 Statement calculation

Fleet partner settlement calculation:

```text
completed trip
→ driver earning calculated
→ fleet affiliation resolved
→ revenue share rule matched
→ fleet partner line item generated
→ statement generated monthly
→ payout status tracked
```

---

# 7. Ops Console 設計

## 7.1 Dispatch Board additions

Filters:

- serviceProduct
- tenant
- partner program
- sourcePlatform
- reservation / realtime
- vehicle license type
- fleet partner
- approvalState
- eligibility failed reason

Panels:

- eligible supply count
- no eligible supply reason
- approval blocked bookings
- quota blocked bookings
- manual review queue
- platform task monitor

## 7.2 Manual Review Queue

Queue types:

- eligibility manual review
- approval timeout
- quota insufficient
- no qualified vehicle
- partner exception
- driver document issue
- fleet partner responsibility issue

## 7.3 Incident / Complaint attribution

Incident / complaint must show:

- driver
- vehicle
- fleet partner
- tenant
- service product
- source platform
- financial responsibility
- penalty / clawback impact

---

# 8. Platform Admin 設計

## 8.1 New pages

```text
Service Products
Vehicle Eligibility Matrix
Fleet Partners
Fleet Partner Detail
Driver Affiliations
Revenue Share Rules
Fleet Statements
Tenant Service Programs
Partner Programs
```

## 8.2 Service Product Admin API

```http
GET  /api/admin/service-products
POST /api/admin/service-products
PUT  /api/admin/service-products/{id}
```

## 8.3 Eligibility Matrix Admin API

```http
GET /api/admin/vehicle-eligibility-matrix
PUT /api/admin/vehicle-eligibility-matrix
```

## 8.4 Audit

All changes must audit:

- service product create/update
- eligibility matrix update
- fleet partner create/update
- driver affiliation create/end
- revenue share rule create/update/disable
- tenant service program change

---

# 9. E2E / Workflow Gates

新增 / 更新 workflow families：

| Workflow ID | E2E |
|---|---|
| `WF-TEN-BIZ-001` | `E2E-012-tenant-business-operations.sh` |
| `WF-SVC-ELIG-001` | `E2E-013-service-product-eligibility.sh` |
| `WF-FLEET-001` | `E2E-014-fleet-partner-revenue-share.sh` |
| `WF-DRV-MP-001` | existing / enhanced driver multi-platform E2E |
| `WF-PBK-001` | partner booking pilot E2E |
| `WF-FIN-GOV-001` | governance-aware billing/reporting E2E |

## Required E2E flows

### E2E-012 Tenant Business Operations

```text
tenant login
→ create booking
→ trip completed
→ tenant dashboard shows counts
→ payable summary updates
→ statement generated
→ monthly trip report / revenue summary preserve tenantId + orderId + userId +
  costCenterCode + serviceProduct filters
```

### E2E-013 Service Product Eligibility

```text
create service product
→ configure vehicle eligibility
→ create booking requiring airport transfer
→ ineligible taxi rejected
→ eligible airport vehicle accepted
→ dispatch eligible supply returned
```

### E2E-014 Fleet Partner Revenue Share

```text
create fleet partner
→ affiliate driver
→ create revenue share rule
→ driver completes trip
→ driver earnings calculated
→ fleet partner share calculated
→ fleet partner statement generated
```

---

# 10. Implementation Worklist

## P0 Backend

```text
BE-SVC-001 ServiceProduct contract
BE-SVC-002 VehicleLicenseType / VehicleServiceCapability
BE-SVC-003 Eligibility matrix admin API
BE-SVC-004 Dispatch eligibility enforcement

BE-FLEET-001 FleetPartner model
BE-FLEET-002 DriverFleetAffiliation model
BE-FLEET-003 FleetPartnerRevenueShareRule
BE-FLEET-004 FleetPartnerStatement

BE-TEN-BIZ-001 Tenant payable summary
BE-TEN-BIZ-002 Tenant orders/trips management API
BE-TEN-BIZ-003 Tenant service programs API
```

## P0 Frontend

```text
TEN-BIZ-001 Tenant Dashboard Payable Summary
TEN-BIZ-002 Orders / Trips Management
TEN-BIZ-003 Users / Eligible Riders
TEN-BIZ-004 Payable / Invoice Statement
TEN-BIZ-005 Service Programs

DRV-SVC-001 Service product badges
DRV-SVC-002 Vehicle eligibility display
DRV-SVC-003 Service-specific task detail
DRV-SVC-004 Service-specific proof collection
DRV-SVC-005 Product/platform/tenant grouped earnings

ADM-SVC-001 Service Products
ADM-SVC-002 Vehicle Eligibility Matrix
ADM-FLEET-001 Fleet Partners
ADM-FLEET-002 Driver Affiliations
ADM-FLEET-003 Revenue Share Rules

OPS-SVC-001 Dispatch Board service product filter
OPS-SVC-002 Eligibility failed reason panel
OPS-REVIEW-001 Manual Review Queue
OPS-FLEET-001 Fleet partner responsibility view
```

## P1 Frontend

```text
FLEET-PORTAL-001 Dashboard
FLEET-PORTAL-002 Drivers
FLEET-PORTAL-003 Vehicles
FLEET-PORTAL-004 Trips
FLEET-PORTAL-005 Revenue Share / Statements
FLEET-PORTAL-006 Documents / Training / Quality

PBK-PROG-001 Program-specific booking forms
PBK-PROG-002 Credit-card airport transfer fields
PBK-PROG-003 Insurance replacement vehicle fields
PBK-PROG-004 Travel agency transfer fields
```

---

# 11. Acceptance Criteria

Phase 1 completion requires:

1. Tenant can see payable total and completed trips.
2. Tenant can see which users created which orders.
3. Tenant can export payable / invoice / cost center / service product report.
4. Booking service product determines vehicle eligibility.
5. Dispatch rejects ineligible vehicles with explicit reason.
6. Driver app shows service product and source platform.
7. Fleet partner can be linked to drivers.
8. Fleet partner revenue share is calculated.
9. Fleet partner statement is generated.
10. Platform admin can manage service products, eligibility matrix, fleet partners.
11. Ops can filter dispatch by service product and eligibility.
12. E2E-012 / E2E-013 / E2E-014 pass at least in staging.

---

# 12. SD 結論

系統設計正式補入三個 Phase 1 P0 areas：

1. **Tenant Business Operations**
2. **Service Product / Vehicle Eligibility**
3. **Fleet Partner / Revenue Share**

這三個 areas 必須與既有 Tenant Governance、Driver Multi-Platform、Forwarder、Billing / Reporting、Platform Admin、Ops Console 整合，否則 Phase 1 不能稱為完整商業流程。
