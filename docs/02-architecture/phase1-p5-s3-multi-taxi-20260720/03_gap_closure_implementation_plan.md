# P-5 / S-3 與一般／多元化計程車雙軌營運 Gap-Closure Implementation Plan

**文件版本：** v2.1

**日期：** 2026-07-23  
**Repository：** `ajoe734/drts-fleet-platform`  
**基準分支：** `dev`  
**已驗證基準 Commit：** `ff16b7131bee4594ec56b195d43539a8d65ce379`  
**文件性質：** 現行程式盤點、系統設計裁決、依賴排序與開發執行計畫  
**上位分析：** `04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md`  
**外部審查對照：** `05_external_review_reconciliation_20260722.md`  
**執行工作表：** `06_multi_taxi_runtime_execution_register_20260723.md`

---

# 0. 本版取代範圍

## 0.1 法規 MVP 實用性裁決

2026-07-23 重新盤點後，UI 與營運工具只保留法規明文結果或現場必要入口。
以下項目不屬本期法規 MVP，不得阻擋其他功能：

- rating moderation console；
- payment exception console；
- fare anomaly triage console；
- legal hold；
- export job orchestration；
- 指定 Figma、全畫面 PNG 或獨立 Design QA package。

最小 UI delta 與重新啟動條件以
`08_multi_taxi_operations_ui_design_requirements_20260723.md` v1.1 為準。

## 0.2 基準取代範圍

本文件取代 2026-07-20 版本中已被後續合併結果淘汰的「目前不存在」判定，但保留其可重用 spine 與 P-5 / S-3 原始 work-package 語意。

截至本版基準：

- P-5 / S-3 contract 與初始 DB anchors 已合併。
- 車輛揭露資料、駕駛公開執登 credential 與 backfill 已合併。
- S-3 backend、Driver UI、Ops UI 已合併。
- P-5 Passenger UI 與 Platform Admin UI 已合併。
- 乾淨 UTF-8 source specs 與 canonical design canvas 已合併。

但以下**尚未形成可宣稱營運完成的閉環**：

- `multi_taxi_direct` 可成功建單的 typed intake。
- Server-authoritative runtime profile 與營運授權 authority。
- 虛擬媒合 queue 與實體招呼站／排班 queue 的語意分離。
- P-5 rating authority、hard gate、assignment atomic snapshot。
- Passenger live API / SSE / token / notification。
- Fare / route / payment / receipt / 730-day operational record。
- Production S-3 SLO、真機離線補送與附件安全驗證。

---

# 1. 已驗證 Repository Baseline

## 1.1 Branch truth

```text
origin/dev = ff16b7131bee4594ec56b195d43539a8d65ce379
```

本次不再使用已落後的：

```text
781258283c75904d94817ff8ee1dc659683a44aa
```

作為現況判斷。

## 1.2 已合併能力

| PR    | 已落地能力                                                                           | 本計畫判定                   |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------- |
| #1108 | P-5 / S-3 contracts、V0051 / V0052 anchors                                           | Foundation landed            |
| #1111 | Dedicated Driver SOS backend、Incident correlation、urgent outbox                    | Backend landed               |
| #1112 | Clean UTF-8 source specs、P-5 / S-3 design canvas                                    | Source / visual truth landed |
| #1114 | Standalone Driver SOS UI、2s hold、dial、offline outbox、attachments                 | Driver UI landed             |
| #1116 | Ops SOS queue / detail / map / ack / SSE                                             | Ops UI landed                |
| #1117 | doorCount / color、canonical vehicle disclosure、driver credential masking、backfill | Supply / registry landed     |
| #1119 | Passenger P-5 screen set                                                             | UI landed, fixture-backed    |
| #1121 | Platform Admin disclosure / correction / fare screens                                | UI landed                    |

## 1.3 已存在且應重用的 spine

- `FleetPartnerModule` submission / review / provisioning。
- `RegulatoryRegistryModule` canonical vehicle / driver / location。
- `VehicleEligibilityModule` exact service-product decision。
- `OwnedMobilityModule` order / dispatch / assignment / redispatch / task。
- `ops.dispatch_assignments.version_no`。
- owned-mobility Driver / Ops SSE plumbing。
- Geo provider abstraction。
- Billing / settlement primitives。
- Reporting / evidence governance。
- Generic Incident domain。
- Audit / notification infrastructure。

不得另建平行派遣引擎、平行 registry、平行 Incident 或平行 reporting 平臺。

---

# 2. 必須固定的系統設計裁決

以下不是待開發團隊討論事項；本文件直接作出設計決定。

## 2.1 車種、營運授權與訂單行為分離

禁止再以單一 `licenseType`、`serviceBucket` 或 `businessDispatchSubtype` 同時表達：

- 車輛物理／牌照分類。
- 是否已列入核准多元化營業計畫。
- 乘客需求如何取得。
- 是即時出發或未來排程。
- 使用哪個產品與費率。

目標模型：

```ts
export type RuntimeProfileCode =
  | "ordinary_taxi"
  | "multi_taxi_direct"
  | "business_dispatch";

export type PassengerAcquisitionMode =
  | "platform_reserved"
  | "street_hail"
  | "physical_rank";

export type RideTimingMode = "on_demand" | "scheduled";

export type DispatchQueueMode =
  | "virtual_matching"
  | "physical_rank"
  | "taxi_stand";
```

每筆 order 必須持久化：

```ts
runtimeProfileCode: RuntimeProfileCode;
serviceProductCode: ServiceProductType;
acquisitionMode: PassengerAcquisitionMode;
timingMode: RideTimingMode;
operatingAuthorizationId: string | null;
```

## 2.2 多元化計程車的「預約載客」

多元化計程車 hard rule 是：

```text
acquisitionMode = platform_reserved
```

不是：

```text
reservationWindowStart 一定要在未來
```

時間模式可為：

```text
on_demand
scheduled
```

只要需求先經核准平臺形成正式 booking / order，且不屬街頭攬客或實體排班候客。

## 2.3 Queue 語意分離

可共用：

```text
virtual_matching
```

禁止多元化 profile 使用：

```text
physical_rank
taxi_stand
street_hail
```

既有 `/dispatch/queue/check-in`、`check-out` 必須補 `queueMode` 與 authorization gate；不得以 route 名稱直接推論所有 queue 都是法定招呼站。

## 2.4 Runtime profile 必須由 Server 決定

目前 `x-runtime-profile-code` 不得繼續作 public authority。

Resolution order：

```text
route / BFF product identity
→ authenticated channel config
→ approved tenant / consumer program
→ operating authorization
→ server-resolved RuntimeProfile
→ persist on order
```

Header 只允許 trusted internal client 使用，且必須：

- 身分 allowlist。
- profile 與 route 一致性檢查。
- 寫入 audit。
- 不可覆寫既有 order profile。

## 2.5 Dedicated typed intake

移除目前錯誤的：

```ts
businessDispatchSubtype === "taxi_reservation";
```

`taxi_reservation` 是 Service Product，不是 Business Dispatch Subtype。

新增：

```ts
export interface CreateMultiTaxiRideCommand {
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passenger: PassengerProfile;

  requestedPickupAt: string;
  timingMode: "on_demand" | "scheduled";

  paymentMethodTokenRef: string | null;
  servicePreferences?: Partial<ServicePreferences>;
}
```

API：

```http
POST /api/multi-taxi/rides
POST /api/call-center/multi-taxi/rides
```

Server 固定：

```text
runtimeProfileCode = multi_taxi_direct
serviceProductCode = taxi_reservation
acquisitionMode = platform_reserved
orderDomain = owned
```

## 2.6 多元化計程車營運授權 Authority

新增 operator-level authorization 與 vehicle membership：

```ts
export interface MultiTaxiOperatingAuthorizationRecord {
  authorizationId: string;
  operatorId: string;
  authorityCode: string;
  businessPlanVersion: string;
  status: "draft" | "approved" | "suspended" | "expired" | "revoked";
  serviceAreaCodes: string[];
  activeFareVersionId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MultiTaxiAuthorizedVehicleRecord {
  authorizationVehicleId: string;
  authorizationId: string;
  vehicleId: string;
  status: "active" | "suspended" | "removed";
  effectiveFrom: string;
  effectiveUntil: string | null;
}
```

Eligibility 必須同時確認：

- authorization approved 且在效期。
- vehicle membership active。
- service area 符合。
- fare version active。
- vehicle / driver disclosure 完整。
- driver / vehicle readiness 與 service-product eligibility。

---

# 3. 現況分類：已落地、部分落地、仍缺

| 能力                    | 現況                          | 本輪動作                                         |
| ----------------------- | ----------------------------- | ------------------------------------------------ |
| P-5 contracts           | 已落地                        | 補 command / authority / response contracts      |
| Vehicle disclosure      | 已落地                        | 串 eligibility / assignment                      |
| Driver credential       | 已落地                        | 串 eligibility / assignment                      |
| Runtime profile         | Contract + 錯誤 partial guard | 重構為 server authority                          |
| Multi-taxi intake       | 不可用                        | 新增 dedicated typed routes                      |
| Operating authorization | 無                            | 新增 authority                                   |
| Queue semantics         | 未分離                        | 新增 enum / gate / route rules                   |
| Driver rating           | Contract only                 | 新增 DB / service / API / aggregation            |
| P-5 hard gate           | 無 runtime wiring             | 接入 evaluator，列 non-bypassable                |
| Disclosure snapshot     | Contract only                 | 新增 persistence + assignment txn                |
| Passenger UI            | 已落地，fixture-backed        | 接 live token/API/SSE；prod 禁 fixture           |
| Admin UI                | 已落地                        | 沿用既有頁面；只補許可、queue 標示與紀錄查詢下載 |
| Route / fare snapshot   | Contract only                 | 新增 booking confirmation authority              |
| Public fare version     | UI / contract                 | 新增 DB / service / activation                   |
| Seatbelt                | UI / contract                 | 新增 runtime event                               |
| Payment                 | State contract                | 新增 provider port / state / recovery            |
| Ride certificate        | Contract / UI                 | 新增 generation / PDF / API                      |
| 730-day record          | Contract                      | 新增 builder / retention / query-download        |
| S-3 backend             | 已落地                        | 做 current-head E2E / SLO hardening              |
| S-3 Driver UI           | 已落地                        | 真機離線 / dial / attachments UAT                |
| S-3 Ops UI              | 已落地                        | SSE / first-ack / sound / SLO UAT                |

---

# 4. Wave 0 — 立即修正錯誤 Runtime Model

## `MTX-CORE-001` Order Runtime Fields

**修改：**

- `OwnedOrderRecord`
- booking / order persistence
- reporting snapshot
- webhook payload
- trace log

新增：

```text
runtimeProfileCode
acquisitionMode
timingMode
operatingAuthorizationId
```

**Migration：** next available migration number。  
**DoD：** 每一筆新 order 都有 server-resolved profile；不得為 null。

## `MTX-CORE-002` Dedicated Intake Commands / Routes

新增：

```http
POST /api/multi-taxi/rides
POST /api/call-center/multi-taxi/rides
```

禁止 public caller 傳入：

```text
runtimeProfileCode
orderDomain
acquisitionMode
operatingAuthorizationId
```

上述欄位由 server resolve。

**DoD：**

- on-demand platform reservation 可建立。
- scheduled platform reservation 可建立。
- street-hail / physical-rank payload 無法偽裝成 multi-taxi。
- 原一般計程車 `POST /orders` 不被破壞。

## `MTX-CORE-003` 移除錯誤 subtype guard

刪除：

```ts
command.businessDispatchSubtype !== "taxi_reservation";
```

用 typed context 取代：

```ts
assertRuntimeProfileAllowances({
  runtimeProfileCode,
  serviceProductCode,
  acquisitionMode,
  timingMode,
  orderDomain,
  authorization,
});
```

錯誤碼統一：

```text
MULTI_TAXI_ACQUISITION_NOT_ALLOWED
MULTI_TAXI_AUTHORIZATION_REQUIRED
MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED
MULTI_TAXI_SERVICE_AREA_NOT_ALLOWED
```

## `MTX-CORE-004` Profile-Scoped Service Product Activation

`taxi_reservation` 不得直接 global activate 後供所有 channel 使用。

新增 policy：

```ts
RuntimeProfileServiceProductPolicy {
  runtimeProfileCode;
  serviceProductCode;
  active;
  effectiveFrom;
  effectiveUntil;
}
```

---

# 5. Wave 1 — Operating Authorization 與 Queue Policy

## `MTX-AUTH-001` Contract / DB / Admin API

API：

```http
GET  /api/platform-admin/multi-taxi/authorizations
POST /api/platform-admin/multi-taxi/authorizations
PUT  /api/platform-admin/multi-taxi/authorizations/{id}
POST /api/platform-admin/multi-taxi/authorizations/{id}/activate
POST /api/platform-admin/multi-taxi/authorizations/{id}/suspend

GET  /api/platform-admin/multi-taxi/authorizations/{id}/vehicles
POST /api/platform-admin/multi-taxi/authorizations/{id}/vehicles
DELETE /api/platform-admin/multi-taxi/authorizations/{id}/vehicles/{vehicleId}
```

RBAC：

```text
multi_taxi_authorization:read
multi_taxi_authorization:write
multi_taxi_authorization:activate
```

## `MTX-AUTH-002` Eligibility Integration

新增 hard reasons：

```text
P5_OPERATING_AUTHORIZATION_MISSING
P5_OPERATING_AUTHORIZATION_INACTIVE
P5_VEHICLE_NOT_IN_AUTHORIZATION
P5_AUTHORIZATION_SERVICE_AREA_MISMATCH
P5_FARE_VERSION_NOT_ACTIVE
```

全部列入 non-bypassable。

## `MTX-QUEUE-001` Queue Mode Contract / Persistence

`QueueCheckInCommand` 新增：

```ts
queueMode: "virtual_matching" | "physical_rank" | "taxi_stand";
siteId: string | null;
```

## `MTX-QUEUE-002` Profile Gate

- `multi_taxi_direct + virtual_matching`：允許。
- `multi_taxi_direct + physical_rank`：拒絕。
- `multi_taxi_direct + taxi_stand`：拒絕。
- `ordinary_taxi`：仍須依場站與服務區域 policy。

---

# 6. Wave 2 — Rating、P-5 Hard Gate 與 Assignment Atomicity

## `P5-RATE-001..004`

建立：

```text
mobility.passenger_trip_ratings
mobility.driver_rating_summaries
```

功能：

- completed trip only。
- `(tripId, passengerSubjectRef)` unique。
- score 1–5。
- tags / comment。
- invalidation + audit。
- aggregate rebuild。
- 0 ratings = `new_driver`。
- aggregate error = `unavailable`，不可假裝 5.0。

## `P5-GATE-001` Runtime Evaluator

現有 P-5 reason codes加上 `MTX-AUTH-*` reasons，並納入：

```text
NON_BYPASSABLE_HARD_REASON_CODES
```

Scarcity fallback 不得重新放行。

## `P5-GATE-002` Assignment Recheck

Assignment transaction 重新讀取：

- Runtime profile。
- Operating authorization。
- Vehicle membership。
- Vehicle disclosure profile version。
- Driver credential version。
- Rating aggregate version。
- Fare version。
- Current availability。

Drift：

```http
409 PASSENGER_DISCLOSURE_CHANGED_BEFORE_ASSIGNMENT
```

## `P5-SNAP-001` Snapshot Persistence

建立：

```text
mobility.passenger_dispatch_disclosure_snapshots
```

唯一鍵：

```text
(order_id, assignment_version)
```

## `P5-ASSIGN-001` Atomic Assignment

同一 transaction：

```text
assignment
+ driver task
+ disclosure snapshot
+ consumer notification outbox
```

任一失敗全部 rollback。

## `P5-REDISPATCH-001`

- assignment version N+1。
- old snapshot `supersededAt`。
- new snapshot。
- `assignment_replaced` event。
- stale version不可覆蓋 passenger UI。

---

# 7. Wave 3 — Live Passenger Authority

## `P5-PAX-001` Opaque Token

- one order。
- scopes。
- revocable。
- no PII。
- rate-limit。
- expires after trip + configured retention window。

## `P5-PAX-002` API

```http
GET  /api/passenger-rides/{token}/disclosure
GET  /api/passenger-rides/{token}/events
POST /api/passenger-rides/{token}/cancel
POST /api/passenger-rides/{token}/ratings
GET  /api/passenger-rides/{token}/receipt
POST /api/passenger-rides/{token}/driver-contact-session
```

## `P5-PAX-003` Passenger SSE

事件：

```text
assignment_disclosure_ready
assignment_replaced
driver_location_updated
eta_changed
driver_arrived
trip_started
trip_completed
trip_cancelled
receipt_ready
```

每筆帶：

```text
assignmentVersion
eventVersion
occurredAt
```

## `P5-PAX-004` Production Fixture Ban

Production build gate：

- `apps/passenger-web` production path 不得 import `passenger-fixtures`。
- `live` mode不可呼叫 `resolvePassengerRideFixture()`。
- API 未回資料時顯示 fail-closed state，不得回 fixture。
- CI static test + runtime smoke。

## `P5-PUSH-001`

Consumer notification outbox + provider port。

Provider 未選定：

- 可以 `not_provisioned`。
- 不得把 mock delivery列 production closure。

## `P5-CALL-001`

Masked calling port。未 provision 時只回客服 fallback，不得顯示 raw phone。

---

# 8. Wave 4 — 第 91 條營運閉環

## `P5-ROUTE-001`

Booking confirmation前建立：

```text
RouteFareDisclosureSnapshot
```

包括：

- pickup / dropoff。
- route。
- distance / duration。
- fare mode。
- estimated / payable fare。
- fare policy version。
- fare-change rule。
- passenger confirmation time。

## `P5-FARE-001`

建立 public fare authority：

```text
draft → filed → active → retired
```

只有 `active` 可被 booking 使用。  
公開 `/fares`。

## `P5-FARE-ANOM-001`

Quote anomaly fail closed：

```text
quote_provider_unavailable
quote_out_of_range
route_unresolved
fare_policy_missing
calculation_mismatch
```

## `P5-SEAT-001`

`arrived_pickup` 或 `trip_started` 產生 seatbelt reminder event。

## `P5-PAY-001`

Internal state：

```text
not_selected
authorized
captured
failed
refunded
manual_recovery
```

Provider tokenization；不得保存 raw card。

## `P5-RCT-001`

電子乘車證明：

- plate。
- pickup / dropoff time。
- duration。
- route / mileage。
- fare / toll。
- customer service phone。
- authority complaint phone。
- HTML / PDF。

## `P5-RET-001..005`

`MultiTaxiTripOperationalRecord`：

- 車號。
- 預約時間。
- 上下車時間。
- 實際路線。
- 里程。
- 應付／實收／通行費。
- retainUntil >= completedAt + 730 days。

提供：

- Admin query。
- 主管機關所需範圍下載。
- 沿用既有 access control / audit primitive。
- coverage metric = 100% for post-rollout completed trips。

本期不建立 legal hold、export job queue 或 retention policy editor；如法務、
資料量或主管機關格式另有明確需求，再獨立立項。

---

# 9. Wave 5 — S-3 Production Closure

S-3 功能已大量落地，本輪不重做 UI／domain。

## `S3-VERIFY-001` Current-Head E2E

基於 `ff16...` 重新跑：

- create SOS。
- exactly one Incident。
- event number。
- outbox。
- Ops stream。
- first-ack wins。
- resolve / close。

## `S3-VERIFY-002` 真機離線

Android / iOS：

- data off。
- 110 / 119 dial。
- fleet report queued。
- app restart。
- reconnect replay。
- no duplicate Incident。
- original timestamp preserved。

## `S3-VERIFY-003` Attachments Security

- pre-signed URL。
- checksum。
- content-type allowlist。
- size limits。
- malware scan。
- audit。
- per-file retry。

## `S3-VERIFY-004` SLO

Metric：

```text
fleetReportConfirmedAt → opsAlertRenderedAt
```

Online p95 <= 5 sec。

## `S3-VERIFY-005` Forbidden Vocabulary / Projection

Driver / Ops SOS projection不得出現：

```text
FSD
自駕
Tesla
sandbox
forwarded
mirror
external platform badge
safety operator
```

---

# 10. Migration Plan

截至本版已存在：

```text
V0051 P-5 disclosure anchors
V0052 S-3 SOS
V0053 S-3 urgent alert outbox
V0054 nullable credential correction
V0055 P-5 disclosure IDs as varchar
```

後續在實作 branch 建立前，先由 migration owner保留下一個未使用編號。建議拆成：

```text
V0056 multi-taxi runtime fields + operating authorization
V0057 rating + disclosure snapshot + passenger token/outbox
V0058 fare authority + route/fare snapshot + receipt + 730-day record
```

若 `dev` 已有同號，順延；不得重號。

---

# 11. Automated Test Matrix

## Core

```text
E2E-MTX-001 on-demand platform reservation
E2E-MTX-002 scheduled platform reservation
E2E-MTX-003 street-hail denied
E2E-MTX-004 physical-rank denied
E2E-MTX-005 virtual matching allowed
E2E-MTX-006 inactive authorization denied
```

## P-5

```text
E2E-P5-001 disclosure incomplete fail closed
E2E-P5-002 assignment snapshot atomicity
E2E-P5-003 redispatch version safety
E2E-P5-004 live passenger token / SSE
E2E-P5-005 rating + receipt
E2E-P5-006 730-day operational record
```

## S-3

```text
E2E-S3-001 online SOS / Incident / alert / ack
E2E-S3-002 offline replay / idempotency
E2E-S3-003 attachment retry / scan
E2E-S3-004 false alarm retained
```

## Negative Gates

- Public client spoofing runtime profile。
- Public client spoofing authorization。
- Ineligible vehicle scarcity fallback。
- Expired driver credential。
- Fixture import in production Passenger bundle。
- Old assignment event after redispatch。
- Duplicate rating。
- Duplicate SOS replay。
- Concurrent Ops acknowledgment。

---

# 12. Release Gates

## Multi-Taxi Runtime Gate

- Dedicated typed intake works。
- Order persists runtime profile / acquisition / timing / authorization。
- Street hail / physical rank impossible。
- On-demand and scheduled platform reservations pass。
- Authorization and vehicle membership enforced。

## P-5 Gate

- No assignment without snapshot。
- No incomplete disclosure assignment。
- No expired / unverified credential assignment。
- No fake rating。
- Passenger production route reads live API。
- Route / fare / change rule displayed before confirmation。
- Payment / seatbelt / rating / receipt events complete。
- 730-day record coverage = 100%。

## S-3 Gate

- Online alert p95 <=5s。
- Offline replay idempotent。
- 110 / 119 remains available without data。
- First acknowledgment wins。
- Attachments pass scan。
- False alarm retained。
- No Phase 2 / external platform vocabulary。

---

# 13. 完成定義

本 wave 只有在以下 business workflows 均 closed 時才可宣稱 Phase 1 多元化計程車完成：

```text
WF-MTX-001 Platform reservation intake
WF-MTX-002 Multi-taxi eligibility + authorization
WF-P5-001 Assignment statutory disclosure
WF-P5-002 Redispatch replacement
WF-P5-003 Passenger live ride / rating / receipt
WF-P5-004 Two-year operational evidence
WF-S3-001 Driver emergency SOS
```

Contract、migration、UI 或單一 API 完成，均不得單獨視為 workflow 完成。
