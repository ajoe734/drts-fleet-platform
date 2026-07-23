# Multi-Taxi Operations UI Design Requirements

**Document version:** v1.0  
**Date:** 2026-07-23  
**Status:** Ready for Design  
**Audience:** Product Design, UX, Visual Design, Content Design, Prototype,
Design QA  
**System baseline:** `dev@b8f1f56b20a77c8abeabf0ac3c51b8443d5616af`  
**Execution mapping:** `07_fleets_execution_tasks_20260723.md`

---

# 0. Purpose and Boundary

This is the handoff requirement for the missing multi-taxi operational UI. It
defines:

- users and permissions;
- information architecture;
- required screens;
- fields and status presentation;
- actions and confirmation flows;
- loading, empty, conflict, unavailable, and permission states;
- content rules;
- responsive and accessibility requirements;
- prototype and Design QA deliverables.

This document does not define database tables, new API behavior, backend
lifecycle transitions, legal-policy overrides, production deployment, or
implementation technology.

Design must consume canonical field and status names from the system spec. It
must not create a second business vocabulary.

---

# 1. Product Decision

General taxi and multi-taxi use a shared dispatch spine but are different
runtime profiles:

```text
ordinary_taxi
multi_taxi_direct
business_dispatch
```

The operational UI must make these multi-taxi rules understandable:

```text
acquisitionMode = platform_reserved
timingMode = on_demand | scheduled
queueMode = virtual_matching
operating authorization = required
authorized vehicle membership = required
active fare version = required
```

For `multi_taxi_direct`, `street_hail`, `physical_rank`, and `taxi_stand` are
forbidden.

The UI is not runtime authority. It displays server decisions and submits
permitted commands. It must never provide a visual override for a non-bypassable
legal gate.

---

# 2. Existing Visual Sources to Reuse

Do not redesign the completed P-5/S-3 visual hierarchy.

| Existing surface     | Canonical source                                               | Coverage                               |
| -------------------- | -------------------------------------------------------------- | -------------------------------------- |
| P-5 Passenger        | `docs/05-ui/drts-design-canvas/p5-ui.jsx` and `p5-screens.jsx` | P5-01..12, P5-A03, P5-A04              |
| P-5 Back Office      | `docs/05-ui/drts-design-canvas/platform-p5.jsx`                | P5-A01, P5-A02, P5-A03, P5-A05         |
| S-3 Driver           | `docs/05-ui/drts-design-canvas/driver-sos.jsx`                 | S3-01..11                              |
| S-3 Ops              | `docs/05-ui/drts-design-canvas/ops-sos.jsx`                    | S3-O01..O06                            |
| Platform Admin shell | `docs/05-ui/drts-design-canvas/Platform Admin.html`            | navigation, tables, forms, banners     |
| Ops shell            | `docs/05-ui/drts-design-canvas/Ops Console.html`               | navigation, operational tables, alerts |

New work must extend these tokens and components. It must not introduce a
separate multi-taxi design system.

---

# 3. Users and Capabilities

The UI must be capability-driven. Hidden or disabled actions do not replace
server authorization.

| User                       | Required capability                 | UI responsibility                                         |
| -------------------------- | ----------------------------------- | --------------------------------------------------------- |
| Platform compliance viewer | `multi_taxi_authorization:read`     | Read authorization and vehicle membership                 |
| Authorization editor       | `multi_taxi_authorization:write`    | Create/edit draft and maintain vehicle membership         |
| Authorization activator    | `multi_taxi_authorization:activate` | Activate or suspend with confirmation                     |
| Rating moderator           | `rating:moderate`                   | Review and invalidate ratings with reason/audit context   |
| Fare manager               | `fare_publication:manage`           | Manage fare versions and anomaly workflow                 |
| Records viewer             | `multi_taxi_records:read`           | Query operational records                                 |
| Records exporter           | `multi_taxi_records:export`         | Create and download controlled exports                    |
| Ops dispatcher             | Existing dispatch capabilities      | Understand queue mode and legal denial; no legal override |

Required permission states:

- read denied;
- read allowed but mutation denied;
- mutation allowed but activation denied;
- export denied;
- session expired;
- capability changed while the screen is open.

Do not show an enabled control and wait for the API to reject it when the
capability is already known.

---

# 4. Information Architecture

## 4.1 Platform Admin

```text
Fleet Programs
  └─ Multi-Taxi Operating Authorizations
       ├─ Authorization Registry
       ├─ Authorization Detail
       ├─ Draft Editor
       └─ Authorized Vehicles

Platform & Commerce
  ├─ Rating Governance
  ├─ Public Fare Versions
  ├─ Fare Anomalies
  ├─ Payment Exceptions
  └─ Multi-Taxi Records and Exports
```

## 4.2 Ops Console

```text
Dispatch
  └─ Queue Operations
       ├─ Queue Overview
       ├─ Queue Entry Detail
       └─ Legal Denial State
```

## 4.3 Recommended Implementation Routes

Routes are handoff recommendations, not a license to change backend APIs:

```text
/multi-taxi-authorizations
/multi-taxi-authorizations/{authorizationId}
/p5-ratings
/p5-fares
/p5-fare-anomalies
/payments
/multi-taxi-records

/dispatch/queue
```

---

# 5. Screen Inventory

## 5.1 Operating Authorization

| Screen ID        | Name                        | Primary purpose                                  |
| ---------------- | --------------------------- | ------------------------------------------------ |
| `MTX-AUTH-UI-01` | Authorization Registry      | Search, filter, compare status/effective window  |
| `MTX-AUTH-UI-02` | Authorization Detail        | Read canonical authorization and lifecycle       |
| `MTX-AUTH-UI-03` | Draft Editor                | Create or edit a draft                           |
| `MTX-AUTH-UI-04` | Lifecycle Confirmation      | Confirm activate or suspend                      |
| `MTX-AUTH-UI-05` | Authorized Vehicles         | Maintain vehicle membership                      |
| `MTX-AUTH-UI-06` | Conflict / Permission State | Handle stale, forbidden, and unavailable actions |

## 5.2 Queue Semantics

| Screen ID         | Name                        | Primary purpose                                |
| ----------------- | --------------------------- | ---------------------------------------------- |
| `MTX-QUEUE-UI-01` | Queue Overview              | Show queue entries with explicit queue mode    |
| `MTX-QUEUE-UI-02` | Queue Entry Detail          | Explain runtime profile, site, and eligibility |
| `MTX-QUEUE-UI-03` | Non-Bypassable Legal Denial | Explain why physical rank/stand is denied      |

## 5.3 Rating Governance

| Screen ID       | Name                    | Primary purpose                                      |
| --------------- | ----------------------- | ---------------------------------------------------- |
| `P5-RATE-UI-01` | Rating Review Queue     | Filter active, under-review, and invalidated ratings |
| `P5-RATE-UI-02` | Rating Review Detail    | Review trip-linked rating and moderation history     |
| `P5-RATE-UI-03` | Driver Rating Authority | Show aggregate state without editable/fake values    |

## 5.4 Fare, Payment, Certificate, and Retention

| Screen ID      | Name                          | Primary purpose                                       |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| `P5-COM-UI-01` | Fare Anomaly Queue / Detail   | Triage fail-closed quote anomalies                    |
| `P5-COM-UI-02` | Payment Exception Detail      | Explain failed/manual-recovery payment state          |
| `P5-COM-UI-03` | Certificate Support           | Locate and re-open available ride certificates        |
| `P5-COM-UI-04` | Operational Record Query      | Query the two-year trip record                        |
| `P5-COM-UI-05` | Controlled Export / Retention | Create export, show job status, retention, legal hold |

---

# 6. Operating Authorization Requirements

## 6.1 Canonical Fields

| System field          | UI label     | Required display rule                         |
| --------------------- | ------------ | --------------------------------------------- |
| `authorizationId`     | 許可 ID      | Detail/audit only; monospace; copy control    |
| `operatorId`          | 業者         | Registry and detail                           |
| `authorityCode`       | 許可代碼     | Primary human identifier                      |
| `businessPlanVersion` | 營業計畫版本 | Registry and detail                           |
| `status`              | 狀態         | Text + semantic color; never color-only       |
| `serviceAreaCodes[]`  | 營運區域     | Named chips where labels exist; code fallback |
| `activeFareVersionId` | 生效費率版本 | Link to fare detail when permitted            |
| `effectiveFrom`       | 生效時間     | Display timezone explicitly                   |
| `effectiveUntil`      | 失效時間     | `null` = 無預定失效日                         |
| `createdAt`           | 建立時間     | Detail/audit section                          |
| `updatedAt`           | 最後更新     | Registry and detail                           |

Status copy:

```text
draft      草稿
approved   已核准
suspended  已暫停
expired    已失效
revoked    已撤銷
```

## 6.2 Registry

Required columns:

```text
許可代碼
業者
營業計畫版本
狀態
營運區域
生效費率版本
有效期間
最後更新
```

Required filters:

```text
業者
狀態
營運區域
有效日期
許可代碼／版本關鍵字
```

Default sorting:

1. active/approved;
2. nearest effective boundary;
3. most recently updated.

Rows with an upcoming expiry need a text warning and date. Do not infer
regulatory invalidity beyond the backend status/effective window.

## 6.3 Detail

Required sections:

1. identity and status;
2. operator and business-plan authority;
3. service areas;
4. active fare version;
5. effective window;
6. authorized vehicles summary;
7. lifecycle/audit timestamps;
8. available actions.

Action availability:

| Current status | Edit | Activate        | Suspend         |
| -------------- | ---- | --------------- | --------------- |
| `draft`        | Yes  | With capability | No              |
| `approved`     | No   | No              | With capability |
| `suspended`    | No   | With capability | No              |
| `expired`      | No   | No              | No              |
| `revoked`      | No   | No              | No              |

`expired` and `revoked` must be read-only. Do not add revoke, restore, or delete
controls until a system command is approved.

## 6.4 Draft Editor

Fields:

```text
operatorId
authorityCode
businessPlanVersion
serviceAreaCodes
activeFareVersionId
effectiveFrom
effectiveUntil
```

Validation:

- all fields except `effectiveUntil` are required;
- at least one service area is required;
- `effectiveUntil` must be later than `effectiveFrom`;
- timestamps must show timezone;
- fare version selection must show status and effective window;
- errors appear at field and summary level;
- unsaved changes require navigation confirmation.

The form creates a draft. Activation is always a separate controlled action.

## 6.5 Lifecycle Confirmation

Activation confirmation shows:

- authorization code;
- operator;
- business-plan version;
- service areas;
- active fare version;
- effective window;
- authorized vehicle count supplied by the backend;
- consequence copy: future multi-taxi eligibility may use this authority.

Suspension confirmation shows the same identity summary and consequence copy:
new eligibility checks will no longer use this authority.

Do not fabricate affected-order counts. Show an impact count only when returned
by a server-owned preview.

## 6.6 Authorized Vehicles

Canonical fields:

| System field             | UI label    |
| ------------------------ | ----------- |
| `authorizationVehicleId` | 名單紀錄 ID |
| `vehicleId`              | 車輛        |
| `status`                 | 名單狀態    |
| `effectiveFrom`          | 生效時間    |
| `effectiveUntil`         | 失效時間    |

Membership status copy:

```text
active     生效中
suspended 已暫停
removed    已移除
```

Required functions:

- search by vehicle ID or plate when the backend supplies plate projection;
- add vehicle with effective window;
- show current and historical membership;
- remove with confirmation when the command is available;
- prevent the UI from implying that vehicle type alone equals authorization.

Do not add a vehicle-suspend action until a corresponding command is approved.

---

# 7. Queue Semantics Requirements

## 7.1 Queue Mode Presentation

Canonical values and copy:

```text
virtual_matching  虛擬媒合
physical_rank     實體排班
taxi_stand        計程車招呼站
```

Every queue row and detail must display queue mode as text. Icons/colors may
support but cannot replace the label.

## 7.2 Queue Overview

Required data:

```text
driverId
vehicleId / plate projection
runtimeProfileCode
queueMode
siteId
serviceAreaCode
operatingAuthorizationId
eligibility decision
check-in time
last update
```

`siteId` is relevant to physical rank/stand contexts. A blank `siteId` must not
make a physical queue look like virtual matching.

Filters:

```text
queue mode
runtime profile
service area
site
eligibility
driver / vehicle
```

## 7.3 Multi-Taxi Denial

For `multi_taxi_direct`:

```text
virtual_matching = allowed when all other gates pass
physical_rank = denied
taxi_stand = denied
```

Human copy:

```text
此車輛屬多元化計程車服務，不得進入實體排班候客。

此車輛屬多元化計程車服務，不得於計程車招呼站排班候客。
```

Required denial UI:

- queue mode and site;
- affected driver/vehicle;
- multi-taxi runtime profile;
- authorization reference where available;
- human explanation;
- safe next step: return to virtual matching or contact the responsible
  administrator;
- no `override`, `force check-in`, or equivalent action.

Do not expose raw reason code as the primary message.

---

# 8. Rating Governance Requirements

## 8.1 Rating Record

Required fields:

```text
ratingId
orderId
tripId
driverId
score (1..5)
tags
comment
status
submittedAt
updatedAt
```

`passengerSubjectRef` is sensitive internal data. It may be shown only in a
masked form when moderation requires correlation.

Status copy:

```text
active        有效
under_review  審查中
invalidated   已作廢
```

## 8.2 Review Queue

Required filters:

```text
status
score
tag
driver
trip/order
submission date
```

Queue rows:

```text
score
tag summary
comment excerpt
driver
trip/order reference
status
submitted time
last update
```

## 8.3 Moderation Detail

Required sections:

1. rating content;
2. completed-trip reference;
3. driver identity;
4. current aggregate summary;
5. moderation status/history;
6. audit actor/time;
7. permitted action.

Invalidation requires explicit confirmation, a required reason, notice that the
aggregate will be rebuilt, and the resulting server-owned state.

Do not provide direct editing of score, rating count, or average. Do not provide
an action that makes a rating active again until a restore command is approved.

## 8.4 Driver Rating Authority

Canonical display states:

```text
rated       show average to one decimal and rating count
new_driver  show 新加入駕駛
unavailable show 評價資料目前無法使用
```

Admin detail may show:

```text
averageRating
ratingCount
lastRatedAt
aggregateVersion
calculatedAt
```

`unavailable` must never render as `5.0`, `0.0`, or `new_driver`.

---

# 9. Fare and Commerce Requirements

## 9.1 Fare Version

Reuse P5-A03. Canonical lifecycle:

```text
draft → filed → active → retired
```

Required fields:

```text
fareVersionId
displayName
status
effectiveFrom
effectiveUntil
publicSummary
authorityFilingRef
```

Only `active` is represented as usable for booking. Future-effective versions
must not appear active before their effective time.

## 9.2 Fare Anomaly

| System reason                | Human copy               |
| ---------------------------- | ------------------------ |
| `quote_provider_unavailable` | 暫時無法取得預估車資     |
| `quote_out_of_range`         | 預估車資超出可接受範圍   |
| `route_unresolved`           | 尚無法確認預估路線       |
| `fare_policy_missing`        | 目前沒有可用的生效費率   |
| `calculation_mismatch`       | 車資計算結果需要重新確認 |

Required display:

- order/request reference;
- pickup/dropoff summary;
- route state;
- fare version;
- estimated/payable fare when available;
- anomaly reason as human copy;
- occurred/last-updated time;
- retryability returned by the backend.

This is fail closed. Do not provide a manual number field that bypasses fare
authority.

## 9.3 Payment Exception

Canonical statuses:

```text
not_selected    尚未選擇
authorized      已授權
captured        已完成
failed          付款失敗
refunded        已退款
manual_recovery 人工處理中
```

Required detail:

- order/trip;
- payable amount and currency;
- status;
- provider reference only when safe;
- attempt/update time;
- available recovery command returned by the backend;
- audit timeline.

Never display raw card data. Never present `failed` or `manual_recovery` as
paid. Do not invent a `mark paid` control.

## 9.4 Electronic Ride Certificate Support

Required fields:

```text
certificateId
orderId
tripId
plateNo
pickupAt
dropoffAt
travelDurationSeconds
routeSummary
distanceMeters
fareMinor
tollMinor
currency
consumerServicePhone
authorityComplaintPhone
issuedAt
certificateVersion
```

Support states:

- available HTML/PDF;
- generating;
- unavailable;
- failed generation;
- access denied;
- superseded version.

The support UI may locate and open an existing certificate. Regeneration must
not be actionable until a server command is approved.

---

# 10. Operational Record, Export, and Retention

## 10.1 Query

Required filters:

```text
orderId / tripId
vehicleId / plateNo
reserved date range
pickup/dropoff date range
fare policy version
charging mode
retention state
legal hold state
```

Required columns:

```text
order/trip
plate
reservedAt
pickupAt
dropoffAt
distance
payable fare
actual fare
toll
fare policy version
charging mode
retainUntil
record status
```

Missing pickup/dropoff/route values must show `未取得` or `未完成`, not zero.

## 10.2 Record Detail

Display trip identity, vehicle/plate, reservation/pickup/dropoff timeline,
route source/point count/distance/duration, payable/actual/toll amounts, fare
policy version, charging mode, generated time, `retainUntil`, and audit
references when available.

The UI must state that the minimum retention floor is 730 days after trip
completion. It must not promise deletion exactly at `retainUntil` when a legal
hold exists.

## 10.3 Controlled Export

Flow:

```text
query/filter
→ preview scope and record count
→ confirm export purpose
→ create export job
→ pending/running/completed/failed
→ controlled download when completed
```

Confirmation must show filter scope, server-owned record count, export purpose,
data sensitivity, requesting actor, and audit notice.

Do not generate an export solely in the browser.

## 10.4 Legal Hold

Required states:

```text
not held
held
hold release pending
released
```

The UI may display or filter legal-hold state. Hold/create/release actions remain
design-only until evidence-governance commands and permissions are approved.

---

# 11. Global State Requirements

Every screen must include:

## Loading

- skeleton matching final hierarchy;
- no fake status/count;
- mutation controls disabled.

## Empty

- distinguish `no records`, `no filter results`, and `not yet initialized`;
- provide a safe next action only when permitted.

## Error

- human title and recovery action;
- request/trace ID in a secondary technical-details area;
- no raw stack, SQL, phone, payment token, or full passenger identifier.

## Stale / Conflict

- explain that data changed;
- preserve unsaved input where safe;
- offer reload/compare;
- never silently overwrite a newer lifecycle state.

## Unavailable Authority

- show the unavailable authority explicitly;
- do not substitute fixture/default values;
- disable dependent mutations.

## Permission Denied

- identify the unavailable capability in human terms;
- do not reveal data the actor cannot read;
- retain navigation to other permitted areas.

---

# 12. Error-to-Copy Mapping

Raw codes are for logs/audit details only.

| Error code                               | Primary UI copy                              |
| ---------------------------------------- | -------------------------------------------- |
| `MULTI_TAXI_AUTHORIZATION_NOT_FOUND`     | 找不到此營運許可                             |
| `AUTHORIZATION_NOT_EDITABLE`             | 此許可已不是草稿，無法編輯                   |
| `AUTHORIZATION_CANNOT_ACTIVATE`          | 目前狀態無法啟用此許可                       |
| `AUTHORIZATION_NOT_ACTIVE`               | 只有已核准的許可可以暫停                     |
| `AUTHORIZATION_OUTSIDE_EFFECTIVE_WINDOW` | 此許可不在有效期間內                         |
| `MULTI_TAXI_FIELD_REQUIRED`              | 請完成所有必填欄位                           |
| `MULTI_TAXI_TIMESTAMP_INVALID`           | 日期或時間格式不正確                         |
| `MULTI_TAXI_EFFECTIVE_WINDOW_INVALID`    | 失效時間必須晚於生效時間                     |
| `MULTI_TAXI_AUTHORIZATION_AMBIGUOUS`     | 找到多筆可用許可，請由系統管理員確認服務對應 |
| `MULTI_TAXI_AUTHORIZATION_UNAVAILABLE`   | 目前沒有可用的多元計程車營運許可             |
| `MULTI_TAXI_VEHICLE_NOT_AUTHORIZED`      | 此車輛未列入目前生效的營運許可               |
| `P5_OPERATING_AUTHORIZATION_MISSING`     | 缺少多元計程車營運許可                       |
| `P5_OPERATING_AUTHORIZATION_INACTIVE`    | 多元計程車營運許可未生效                     |
| `P5_VEHICLE_NOT_IN_AUTHORIZATION`        | 車輛未列入核准名單                           |
| `P5_AUTHORIZATION_SERVICE_AREA_MISMATCH` | 此許可不適用於目前營運區域                   |
| `P5_FARE_VERSION_NOT_ACTIVE`             | 目前費率版本尚未生效                         |
| `P5_RATING_STATE_UNINITIALIZED`          | 駕駛評價資料尚未完成                         |

Content Design may refine wording but may not change meaning or make a hard
denial sound retryable.

---

# 13. Component Requirements

Reuse existing DRTS primitives and add variants where needed:

```text
AuthorizationStatusChip
EffectiveWindow
ServiceAreaList
FareVersionLink
AuthorizationActionBar
AuthorizedVehicleTable
QueueModeChip
LegalDenialBanner
RatingStatusChip
DriverRatingAuthorityCard
ModerationHistory
FareAnomalyBanner
PaymentStatusChip
OperationalRecordTable
RetentionStatus
LegalHoldBadge
ControlledExportDialog
AuditMetadata
PermissionBoundary
StaleDataBanner
```

Required component states:

```text
default
hover
focus-visible
disabled
loading
error
read-only
permission-denied
stale/conflict
```

---

# 14. Visual and Responsive Requirements

## Platform Admin

Primary frames:

```text
1440 × 900
1280 × 800
1024 × 768
```

At narrow widths:

- forms become one column;
- tables use a designed horizontal-scroll or card strategy;
- status and primary identity remain visible;
- actions do not detach from record identity;
- confirmation dialogs fit at 200% browser zoom.

## Ops Console

Primary frames:

```text
1440 × 900
1280 × 800
```

The legal-denial message and absence of override must remain visible without
opening a secondary panel.

Use existing semantic tokens. Status must not rely on color alone.

---

# 15. Accessibility

Target WCAG 2.1 AA.

Required:

- complete keyboard operation and visible focus;
- semantic heading order;
- table headers and accessible row actions;
- status announced as text;
- dialogs trap focus and return it on close;
- validation summary links to fields;
- date/time includes timezone in accessible name;
- confirmation actions use explicit verbs;
- live mutation result announced;
- no auto-dismiss for legal denial or destructive-action result;
- 200% zoom without losing controls or content;
- motion-reduction support.

---

# 16. Content and Localization

Primary locale is Traditional Chinese (Taiwan). English must use translation
keys, not inline copy.

| Concept                 | Required Traditional Chinese |
| ----------------------- | ---------------------------- |
| operating authorization | 多元計程車營運許可           |
| business plan version   | 營業計畫版本                 |
| authorized vehicle      | 授權車輛                     |
| virtual matching        | 虛擬媒合                     |
| physical rank           | 實體排班                     |
| taxi stand              | 計程車招呼站                 |
| active fare version     | 生效費率版本                 |
| rating moderation       | 評價治理                     |
| controlled export       | 受控匯出                     |
| legal hold              | 法律保留                     |
| retention               | 保存期限                     |

Forbidden:

- raw error code as primary copy;
- internal table/column names;
- fake rating or fake fare/payment success;
- full passenger subject reference;
- raw card/provider token, driver phone, or personal data;
- wording that implies Ops may bypass a legal gate.

---

# 17. Prototype Flows

Required clickable flows:

## Authorization

```text
registry
→ create draft
→ field validation
→ save
→ add authorized vehicle
→ activate confirmation
→ approved detail
→ suspend confirmation
→ suspended detail
```

## Queue

```text
queue overview
→ virtual matching detail
→ physical rank denial
→ safe next action
```

## Rating

```text
review queue
→ under-review detail
→ invalidate confirmation
→ aggregate rebuilding
→ updated authority state
```

## Payment / Certificate

```text
payment failed
→ permitted recovery action
→ captured
→ certificate available
```

## Record Export

```text
record query
→ scope preview
→ export confirmation
→ running
→ completed
→ controlled download
```

Prototype actions not backed by an approved command must be labeled
`design-only / command pending`.

---

# 18. Sample Data

Use fictional data only:

```text
Operator: 智行示範車隊
Authority code: MTX-TPE-2026-001
Business plan version: BP-2026.07
Service areas: TPE, NWT
Fare version: FARE-MTX-2026-07
Vehicle: VEH-DEMO-0186 / BKR-2208
Driver: 吳明翰
Trip: ZX-240720-0186
Export: EXP-MTX-20260723-001
```

No real personal, vehicle, payment, or authority data.

---

# 19. Figma and Handoff Structure

Required pages:

```text
00_Cover
01_Foundations_Reuse
02_MTX_Authorization
03_MTX_Queue
04_P5_Rating
05_P5_Fare_Payment
06_P5_Records_Retention
07_Components
08_Prototype
09_Accessibility
10_Handoff
```

Frame naming:

```text
MTX-AUTH-UI-01_Registry_1440x900
MTX-AUTH-UI-03_Draft_Error_1280x800
MTX-QUEUE-UI-03_TaxiStandDenied_1440x900
P5-RATE-UI-02_InvalidationConfirm_1280x800
P5-COM-UI-05_ExportRunning_1440x900
```

Every frame must annotate Screen ID, viewport, user capability, data state,
source status (`live-contract`, `design-only`, or `command-pending`), component
variants, focus order, API/field mapping, and empty/error/conflict behavior.

---

# 20. Required Deliverables

1. Editable Figma source.
2. Component variants and token mapping.
3. All required desktop/narrow frames.
4. Clickable prototype flows.
5. Traditional Chinese and English copy deck.
6. Screen/state/permission matrix.
7. Accessibility annotations.
8. Developer handoff annotations.
9. PNG screenshots for every primary screen and critical state.
10. Design QA checklist.
11. Forbidden-content scan.
12. Open command/API dependency list.

Required screenshot names:

```text
MTX_authorization_registry.png
MTX_authorization_detail_approved.png
MTX_authorization_vehicle_membership.png
MTX_queue_virtual_matching.png
MTX_queue_physical_rank_denied.png
P5_rating_moderation.png
P5_fare_anomaly.png
P5_payment_exception.png
P5_operational_record_export.png
```

---

# 21. Design Definition of Done

The operational UI is Design Ready for Implementation only when:

1. all screen IDs in section 5 are present;
2. all canonical fields and statuses are mapped;
3. permission variants are complete;
4. lifecycle actions match approved commands;
5. unsupported actions are not presented as live;
6. queue legal denials are explicit and non-bypassable;
7. rating aggregates cannot be edited or fabricated;
8. fare/payment unavailable states fail closed;
9. retention and legal hold are distinct;
10. responsive frames pass at target sizes and 200% zoom;
11. accessibility annotations are complete;
12. prototype flows are connected;
13. copy is frozen;
14. PNG and Design QA evidence exist;
15. Product, System, Content, Accessibility, and Design QA sign off.

Until all 15 conditions are met:

```text
designReadyForImplementation = false
```

---

# 22. Handoff to Fleets

| Design output                                 | Unblocks                          |
| --------------------------------------------- | --------------------------------- |
| Authorization screens `MTX-AUTH-UI-01..06`    | `MTX-AUTH-UI-001`                 |
| Queue screens `MTX-QUEUE-UI-01..03`           | `MTX-QUEUE-003`                   |
| Rating governance screens `P5-RATE-UI-01..03` | `P5-RATE-003`                     |
| Commerce/record screens `P5-COM-UI-01..05`    | UI portions of Fleet F            |
| Final Design QA evidence                      | `P5-S3-DESIGN-QA-001` and Fleet H |

Implementation Fleets must link the exact Figma frame and Screen ID in every UI
PR. They must not substitute a locally invented layout for a missing signed-off
frame.
