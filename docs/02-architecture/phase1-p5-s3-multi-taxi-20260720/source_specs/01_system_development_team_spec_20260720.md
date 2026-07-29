# DRTS Phase 1 P-5／S-3 系統開發團隊規格書

**文件版本**：v2.0  
**日期**：2026-07-20  
**適用團隊**：Backend、Web Frontend、React Native、Platform／DevOps、QA Automation、Security  
**Repo / Branch**：`ajoe734/drts-fleet-platform` / `dev`  
**對應視覺文件**：`02_ui_visual_design_team_brief_20260720.md`

---

# 0. 文件邊界

本文件只定義可執行的系統開發規格：

- domain authority
- contracts
- API
- database
- transactional boundary
- state machine
- RBAC
- data masking
- offline / retry / idempotency
- events / notification outbox
- retention / audit
- observability
- migration
- automated tests
- device UAT
- release gate

本文件**不決定**：

- 字體、色彩、間距、陰影、圖示風格
- 畫面排版、artboard 尺寸、Figma component 結構
- 視覺稿及截圖構圖

上述內容由 UI／UX 視覺設計文件負責。

---

# 1. 開發現況與本次增量

## 1.1 `dev` 已存在，不得重做

目前 `dev` 已有：

- Fleet Partner supply submission／review／readiness。
- exact Service Product eligibility、candidate evaluation、assignment recheck。
- driver heartbeat、batch、去重、tracking status。
- daily dispatch record、dispatchable supply snapshot、monthly／six-month summary。
- generic Incident、timeline、service recovery、complaint linkage。
- Android／iOS 真機 evidence pack 基礎。
- Geo route provider、fare／pricing authority、billing settlement。
- audit notification、evidence governance、controlled download。

本次增量應使用既有 authority，不可另建平行派遣、平行 registry、平行 incident 或平行 reporting 系統。

## 1.2 真正缺口

### P-5

- canonical 車輛資料缺 `make/model/modelYear/doorCount/color` 的正式 passenger disclosure profile。
- canonical 駕駛資料缺可對乘客顯示的執業登記 credential。
- 無正式 passenger trip rating authority。
- eligibility 未包含 P-5 disclosure completeness hard gate。
- assignment 未同交易建立 immutable disclosure snapshot。
- 無 direct passenger ride token／API／SSE。
- 無 consumer notification outbox。
- 無 masked-calling port。
- route／fare／fare-change rule 未形成乘客可確認且可稽核的 snapshot。
- 無完整 electronic ride certificate。
- 現有日報不足以形成第 91 條要求的二年 operational record。
- 無 multi-taxi reservation-only runtime profile guard。
- 無 seatbelt reminder event。
- 無公開 fare version authority。

### S-3

- 現有 Driver App SOS 仍是 generic multi-platform Incident form。
- 無 dedicated `DriverSosEvent` aggregate／API／DB。
- 無 110／119 native dial action。
- 無 server-authoritative trip／vehicle／GPS context resolver。
- 無 SQLite durable SOS outbox。
- 無 photo／voice attachment workflow。
- 無 false-alarm lifecycle。
- 無 urgent duty alert transactional outbox。
- 無 Ops acknowledgment／SLO metrics。

---

# 2. Phase 1 Runtime Profile

新增：

```ts
export type PassengerServiceRuntimeProfileCode = "multi_taxi_direct";
```

Canonical config：

```yaml
code: multi_taxi_direct
displayName: 智行叫車
orderDomains:
  - owned
allowedServiceProducts:
  - taxi_reservation
reservationOnly: true
passengerSurface: direct_ride
driverSurface: multi_taxi_driver
opsSurface: multi_taxi_ops
forbiddenCapabilities:
  - forwarded_order_ui
  - external_platform_badge
  - sandbox_disclosure
  - av_fulfillment
  - safety_operator
  - remote_takeover
```

## 2.1 Enforcement

Profile 必須由 backend 回傳並在以下位置 enforce：

- booking create
- candidate evaluation
- assignment
- passenger read model
- Driver App task projection
- SOS context
- Ops read model

只用 CSS 或 feature flag 隱藏外部平台 UI，不算完成。

## 2.2 Reservation-only

當 profile = `multi_taxi_direct`：

```text
serviceProductType = taxi_reservation
reservationTime != null
orderDomain = owned
```

不符時：

```http
409 MULTI_TAXI_RESERVATION_ONLY
```

---

# 3. P-5 Canonical Data

## 3.1 Vehicle Passenger Disclosure Profile

```ts
export type VehiclePassengerDisclosureStatus =
  | "complete"
  | "incomplete"
  | "suspended";

export interface VehiclePassengerDisclosureProfile {
  vehicleId: string;
  make: string;
  model: string;
  modelYear: number;
  doorCount: number;
  color: string | null;

  status: VehiclePassengerDisclosureStatus;
  missingFieldCodes: string[];

  verifiedByActorId: string | null;
  verifiedAt: string | null;
  sourceSubmissionId: string | null;
  version: number;
  updatedAt: string;
}
```

Validation：

```text
make: required, trim, max 80
model: required, trim, max 80
modelYear: integer, 1980..currentYear+1
doorCount: integer, 3..6
color: optional under central minimum; configurable required for Taipei application profile
```

修改 `VehicleSupplyDraft`：

```ts
doorCount: number;
color: string | null;
```

核准 submission 時，與 canonical vehicle 同一 DB transaction 建立／更新 profile。

---

## 3.2 Driver Public Registration Credential

```ts
export type TaxiDriverRegistrationStatus =
  | "verified_active"
  | "expired"
  | "suspended"
  | "revoked"
  | "unverified"
  | "missing";

export interface DriverPublicRegistrationCredential {
  driverId: string;
  registrationNo: string;
  registrationArea: string;
  effectiveFrom: string | null;
  effectiveUntil: string;
  status: TaxiDriverRegistrationStatus;
  maskedDisplay: string;

  verifiedByActorId: string | null;
  verifiedAt: string | null;
  sourceSubmissionId: string | null;
  version: number;
  updatedAt: string;
}
```

Rules：

- `licensesValid = true` 不可直接視為 `verified_active`。
- 沒有外部官方 API 時，以人工審核、效期與 lifecycle 共同判定。
- 完整證號不得進 passenger API 或 audit。
- masked display 由 server 產生，不接受 client 自行遮碼。

---

# 4. Driver Rating Authority

## 4.1 Rating Event

```ts
export interface PassengerTripRatingRecord {
  ratingId: string;
  orderId: string;
  tripId: string;
  driverId: string;
  passengerSubjectRef: string;
  score: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  comment: string | null;
  status: "active" | "invalidated" | "under_review";
  submittedAt: string;
  updatedAt: string;
}
```

Unique：

```text
(tripId, passengerSubjectRef)
```

## 4.2 Summary

```ts
export type DriverRatingDisplayState =
  | "rated"
  | "new_driver"
  | "unavailable";

export interface DriverRatingSummary {
  driverId: string;
  displayState: DriverRatingDisplayState;
  averageRating: number | null;
  ratingCount: number;
  lastRatedAt: string | null;
  aggregateVersion: number;
  calculatedAt: string;
}
```

Rules：

- 0 筆有效評價 = `new_driver`。
- aggregate 未初始化／失敗 = `unavailable`，不得顯示假星等。
- 平均顯示一位小數；DB 聚合保留較高精度。
- 只有 completed trip 可評價。
- invalidation 必須 audit 並重建 aggregate。

---

# 5. P-5 Eligibility Hard Gate

新增 hard reasons：

```ts
export type PassengerDisclosureBlockReason =
  | "P5_VEHICLE_MAKE_MISSING"
  | "P5_VEHICLE_MODEL_MISSING"
  | "P5_VEHICLE_YEAR_MISSING"
  | "P5_VEHICLE_DOOR_COUNT_MISSING"
  | "P5_DRIVER_REGISTRATION_MISSING"
  | "P5_DRIVER_REGISTRATION_EXPIRED"
  | "P5_DRIVER_REGISTRATION_UNVERIFIED"
  | "P5_RATING_STATE_UNINITIALIZED"
  | "P5_RUNTIME_PROFILE_MISMATCH";
```

## 5.1 Candidate Evaluation

當 profile = `multi_taxi_direct`：

```text
existing supply readiness
AND exact service-product eligibility
AND P-5 disclosure completeness
AND reservation-only policy
```

`new_driver` 是合法狀態；`unavailable` 是 hard block。

## 5.2 Assignment Recheck

Assignment transaction 必須重新讀取：

- vehicle disclosure profile version
- driver credential version
- rating aggregate version
- exact service product
- current driver / vehicle availability
- profile code

資料已變更時：

```http
409 PASSENGER_DISCLOSURE_CHANGED_BEFORE_ASSIGNMENT
```

---

# 6. Immutable Assignment Disclosure Snapshot

```ts
export interface PassengerDispatchDisclosureSnapshot {
  snapshotId: string;
  runtimeProfileCode: "multi_taxi_direct";

  orderId: string;
  bookingId: string | null;
  dispatchJobId: string;
  assignmentId: string;
  assignmentVersion: number;

  vehicle: {
    vehicleId: string;
    make: string;
    model: string;
    plateNo: string;
    modelYear: number;
    doorCount: number;
    color: string | null;
    profileVersion: number;
  };

  driver: {
    driverId: string;
    displayName: string | null;
    registrationMaskedDisplay: string;
    registrationStatus: "verified_active";
    registrationEffectiveUntil: string;
    credentialVersion: number;
  };

  rating: {
    displayState: "rated" | "new_driver";
    averageRating: number | null;
    ratingCount: number;
    aggregateVersion: number;
  };

  eta: {
    minutes: number | null;
    calculatedAt: string | null;
    locationFreshness: "fresh" | "stale" | "low_accuracy" | "missing";
  };

  routeFare: RouteFareDisclosureSnapshot;

  createdAt: string;
  supersededAt: string | null;
}
```

## 6.1 Transaction

初次 assignment：

```text
lock order / dispatch job
→ re-evaluate
→ create assignment
→ assignmentVersion + 1
→ create disclosure snapshot
→ create passenger notification outbox
→ commit
```

Redispatch：

```text
lock active assignment
→ create new assignment
→ supersede old snapshot
→ create version N+1 snapshot
→ create assignment_replaced outbox
→ commit
```

禁止：

- assignment commit 後再 best-effort 建 snapshot。
- passenger read 時即時 join 最新主檔代替歷史 snapshot。
- 舊 version event 覆蓋新 version。

---

# 7. Route／Fare Disclosure

```ts
export interface RouteFareDisclosureSnapshot {
  routeSnapshotId: string;
  quoteSnapshotId: string;
  orderId: string;

  pickup: ResolvedAddressPayload;
  dropoff: ResolvedAddressPayload;

  estimatedDistanceMeters: number | null;
  estimatedDurationSeconds: number | null;
  encodedPolyline: string | null;

  chargingMode: "meter_estimate" | "fixed_quote";
  estimatedFareMinor: number | null;
  payableFareMinor: number | null;
  currency: "NTD";

  farePolicyId: string;
  farePolicyVersion: string;
  fareChangeRuleId: string;
  fareChangeRuleVersion: string;
  fareChangeRuleDisplayText: string;

  passengerConfirmedAt: string | null;
  generatedAt: string;
}
```

Booking confirmation 前必須完成 snapshot，並保存 policy version 與 confirm timestamp。

Quote anomaly：

```text
quote_provider_unavailable
quote_out_of_range
route_unresolved
fare_policy_missing
calculation_mismatch
```

異常不可自動確認固定車資。

---

# 8. Passenger Ride Authority

## 8.1 Opaque Token

```ts
export interface PassengerRideAccessToken {
  tokenId: string;
  orderId: string;
  passengerSubjectRef: string;
  scopes: Array<
    | "ride:read"
    | "ride:cancel"
    | "ride:rate"
    | "ride:contact"
    | "receipt:read"
  >;
  expiresAt: string;
  revokedAt: string | null;
}
```

URL：

```text
/ride/{opaqueToken}
```

## 8.2 API

```http
GET  /api/passenger-rides/{token}/disclosure
GET  /api/passenger-rides/{token}/events
POST /api/passenger-rides/{token}/cancel
POST /api/passenger-rides/{token}/ratings
GET  /api/passenger-rides/{token}/receipt
POST /api/passenger-rides/{token}/driver-contact-session
```

Response 不得包含：

- raw driver phone
- full registration number
- external platform code
- mirror / forwarded status
- sandbox／AV fields

## 8.3 SSE

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

每個事件帶 `assignmentVersion` 與 `eventVersion`。

---

# 9. Consumer Notification Outbox

```ts
export interface ConsumerNotificationOutboxRecord {
  outboxId: string;
  orderId: string;
  passengerSubjectRef: string;
  eventType:
    | "assignment_disclosure_ready"
    | "assignment_replaced"
    | "eta_changed"
    | "driver_arrived"
    | "receipt_ready";
  assignmentVersion: number | null;
  payload: Record<string, unknown>;
  status: "pending" | "sending" | "delivered" | "failed";
  attemptCount: number;
  nextAttemptAt: string;
  createdAt: string;
  deliveredAt: string | null;
}
```

Provider 未選定時只完成 port / outbox；mock delivery 不得作 production closure evidence。

---

# 10. Masked Calling

```ts
export interface PassengerDriverContactPort {
  createSession(input: {
    orderId: string;
    passengerRef: string;
    driverId: string;
    expiresAt: string;
  }): Promise<{
    sessionId: string;
    dialUri: string;
    provider: string;
  }>;
}
```

未 provision 時，API 回：

```text
not_provisioned
supportPhoneFallback
```

不得 fallback 成直接顯示電話。

---

# 11. Seatbelt Reminder

```ts
export interface SeatbeltReminderEvent {
  reminderId: string;
  orderId: string;
  channel: "passenger_ui" | "audio_prompt";
  messageVersion: string;
  displayedAt: string;
  acknowledgedAt: string | null;
}
```

Trigger：`arrived_pickup` 或 `trip_started`。

---

# 12. Electronic Payment

```ts
export type PassengerPaymentStatus =
  | "not_selected"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "manual_recovery";
```

要求：

- provider tokenization。
- 不保存 raw card number。
- trip completion capture。
- failed payment 有 retry / alternative / ops exception。
- provider 選定前可先完成 state machine、port、audit。

---

# 13. Electronic Ride Certificate

```ts
export interface ElectronicRideCertificate {
  certificateId: string;
  orderId: string;
  tripId: string;
  plateNo: string;

  pickupAt: string;
  dropoffAt: string;
  travelDurationSeconds: number;

  routeSummary: string;
  distanceMeters: number;

  fareMinor: number;
  tollMinor: number;
  currency: "NTD";

  consumerServicePhone: string;
  authorityComplaintPhone: string;

  issuedAt: string;
  certificateVersion: string;
}
```

Formats：

- responsive HTML
- PDF
- share / download

---

# 14. Two-Year Multi-Taxi Operational Record

```ts
export interface MultiTaxiTripOperationalRecord {
  recordId: string;
  orderId: string;
  tripId: string;

  vehicleId: string;
  plateNo: string;

  reservedAt: string;
  pickupAt: string | null;
  dropoffAt: string | null;

  route: {
    encodedPolyline: string | null;
    pointCount: number;
    distanceMeters: number | null;
    durationSeconds: number | null;
    source: "driver_gps" | "provider_route" | "mixed";
  };

  payableFareMinor: number;
  actualFareMinor: number;
  tollMinor: number;
  currency: "NTD";

  farePolicyVersion: string;
  chargingMode: "meter" | "platform_quote";

  generatedAt: string;
  retainUntil: string;
}
```

新增 evidence family：

```text
multi_taxi_trip_record
```

最低 retention：

```text
730 days after trip completion
```

Admin APIs：

```http
GET  /api/platform-admin/multi-taxi-trip-records
POST /api/platform-admin/multi-taxi-trip-records/export
GET  /api/platform-admin/multi-taxi-trip-records/exports/{exportId}
```

---

# 15. Public Fare Version

```ts
export interface MultiTaxiPublicFareVersion {
  fareVersionId: string;
  displayName: string;
  status: "draft" | "filed" | "active" | "retired";
  effectiveFrom: string;
  effectiveUntil: string | null;
  publicSummary: string;
  authorityFilingRef: string | null;
}
```

Rules：

- booking 只使用 `active`。
- public route `/fares` 顯示 active version。
- activation / retirement audit。
- future effective version 不可提前套用。

---

# 16. S-3 Domain

## 16.1 Contract

```ts
export type DriverSosStatus =
  | "local_triggered"
  | "queued_offline"
  | "submitted"
  | "duty_alerted"
  | "acknowledged"
  | "false_alarm_dismissed"
  | "investigating"
  | "resolved"
  | "closed";

export type DriverSosEventType =
  | "traffic_accident"
  | "security_incident"
  | "passenger_medical"
  | "other";

export type DriverSosSeverity = "major" | "normal";

export interface DriverSosEventRecord {
  sosEventId: string;
  eventNo: string;
  incidentId: string | null;

  driverId: string;
  vehicleId: string | null;
  plateNo: string | null;
  orderId: string | null;
  taskId: string | null;

  status: DriverSosStatus;
  eventType: DriverSosEventType | null;
  severity: DriverSosSeverity | null;
  description: string | null;

  location: {
    lat: number;
    lng: number;
    accuracyM: number | null;
    recordedAt: string;
    reverseGeocodedAddress: string | null;
    geocodeProvider: string | null;
  } | null;

  originalTriggeredAt: string;
  serverReceivedAt: string | null;
  offlineAtTrigger: boolean;

  falseAlarm: {
    dismissed: boolean;
    dismissedAt: string | null;
    dismissedByDriverId: string | null;
    note: string | null;
  };

  dutyAcknowledgement: {
    acknowledgedAt: string | null;
    acknowledgedByActorId: string | null;
  };

  createdAt: string;
  updatedAt: string;
}
```

---

# 17. S-3 Driver Security

Client 可傳：

```text
clientEventId
originalTriggeredAt
eventType
severity
description
latestDeviceLocation
```

Server 必須從 driver bearer 決定：

- driverId
- active task
- current vehicle
- plate
- order
- latest server location
- fallback device location
- runtime profile

拒絕 client 指定其他 driver／vehicle／order。

Unique：

```text
(driverId, clientEventId)
```

---

# 18. S-3 API

```http
POST /api/driver/sos-events
GET  /api/driver/sos-events/{sosEventId}

POST /api/driver/sos-events/{sosEventId}/attachments/upload-url
POST /api/driver/sos-events/{sosEventId}/attachments/confirm
POST /api/driver/sos-events/{sosEventId}/supplements
POST /api/driver/sos-events/{sosEventId}/false-alarm-dismiss

GET  /api/ops/sos-events
GET  /api/ops/sos-events/stream
GET  /api/ops/sos-events/{sosEventId}
POST /api/ops/sos-events/{sosEventId}/acknowledge
POST /api/ops/sos-events/{sosEventId}/investigate
POST /api/ops/sos-events/{sosEventId}/resolve
POST /api/ops/sos-events/{sosEventId}/close
```

---

# 19. S-3 Native Dial

Driver App actions：

```text
tel:110
tel:119
```

只記錄 `dial_action_invoked`，不得宣稱電話一定接通。

撥號不依賴 data network。

---

# 20. S-3 Offline Outbox

```ts
export interface PendingSosOutboxItem {
  clientEventId: string;
  originalTriggeredAt: string;
  payload: Record<string, unknown>;
  attachmentLocalUris: string[];
  state:
    | "pending"
    | "sending"
    | "submitted"
    | "attachment_pending"
    | "complete"
    | "failed_retryable";
  attemptCount: number;
  nextAttemptAt: string;
}
```

使用 SQLite／durable storage。

Rules：

- metadata first, attachments later。
- network restore auto-retry。
- app restart resume。
- original timestamp preserved。
- same event never duplicates Incident。
- UI 可查 queue state。

---

# 21. S-3 Attachments

Types：

```text
image/jpeg
image/png
audio/m4a
audio/aac
```

Limits：

- photo ≤10 MB，最多 10 張。
- audio ≤5 minutes / 25 MB。
- pre-signed upload。
- checksum。
- malware scan。
- attachment access audit。
- 位置／時間不可由補充表單覆蓋。

---

# 22. False Alarm

- 滑動解除 + confirm。
- 不刪除 event。
- online：新增 `false_alarm_dismissed` timeline。
- offline：trigger 與 dismissal 都在恢復後同步。
- Ops 仍需 acknowledge。

---

# 23. SOS Transaction / Incident Correlation

SOS create transaction：

```text
create DriverSosEvent
→ resolve/create exactly one canonical Incident
→ create SOS timeline
→ create urgent alert outbox
→ commit
```

Generic Incident 負責：

- case
- severity
- related order / driver / vehicle
- investigation
- service recovery
- complaint link

DriverSosEvent 負責：

- mobile trigger
- offline delivery
- event number
- attachments
- false alarm
- duty acknowledgment
- SLO timestamps

---

# 24. Ops Urgent Alert

## 24.1 Outbox

```text
pending → sending → delivered → acknowledged
```

Worker：

- SSE / WebSocket。
- browser notification 可作 adapter。
- retry / idempotency。

## 24.2 First Acknowledgment Wins

```ts
export interface SosDutyAcknowledgement {
  sosEventId: string;
  acknowledgedByActorId: string;
  acknowledgedAt: string;
  note: string | null;
}
```

Concurrent ack：

- first writer wins。
- 其他人收到 current owner。
- 不重複 timeline。

## 24.3 SLO

起算點：

```text
fleetReportConfirmedAt
```

終點：

```text
opsAlertRenderedAt
```

線上 p95 ≤ 5 秒。

---

# 25. SOS Timeline

```text
sos_local_triggered
fleet_report_confirmed
server_received
incident_created
duty_alert_dispatched
duty_acknowledged
supplement_added
attachment_uploaded
false_alarm_dismissed
investigation_started
resolved
closed
```

每筆有：

```text
occurredAt
recordedAt
actor
source
clientEventId / requestId
payload
```

---

# 26. Database DDL

## 26.1 Vehicle Disclosure

```sql
CREATE TABLE registry.vehicle_passenger_disclosure_profiles (
  vehicle_id text PRIMARY KEY,
  make text NOT NULL,
  model text NOT NULL,
  model_year integer NOT NULL,
  door_count integer NOT NULL,
  color text NULL,
  status text NOT NULL,
  missing_field_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_by_actor_id text NULL,
  verified_at timestamptz NULL,
  source_submission_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (door_count BETWEEN 3 AND 6)
);
```

## 26.2 Driver Credential

```sql
CREATE TABLE registry.driver_public_registration_credentials (
  driver_id text PRIMARY KEY,
  registration_no text NOT NULL,
  registration_area text NOT NULL,
  effective_from date NULL,
  effective_until date NOT NULL,
  status text NOT NULL,
  masked_display text NOT NULL,
  verified_by_actor_id text NULL,
  verified_at timestamptz NULL,
  source_submission_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## 26.3 Rating

```sql
CREATE TABLE mobility.passenger_trip_ratings (
  rating_id uuid PRIMARY KEY,
  order_id text NOT NULL,
  trip_id text NOT NULL,
  driver_id text NOT NULL,
  passenger_subject_ref text NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text NULL,
  status text NOT NULL DEFAULT 'active',
  submitted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (trip_id, passenger_subject_ref)
);

CREATE TABLE mobility.driver_rating_summaries (
  driver_id text PRIMARY KEY,
  display_state text NOT NULL,
  average_rating numeric(3,2) NULL,
  rating_count integer NOT NULL DEFAULT 0,
  last_rated_at timestamptz NULL,
  aggregate_version integer NOT NULL DEFAULT 1,
  calculated_at timestamptz NOT NULL
);
```

## 26.4 Disclosure Snapshot

```sql
CREATE TABLE mobility.passenger_dispatch_disclosure_snapshots (
  snapshot_id uuid PRIMARY KEY,
  order_id text NOT NULL,
  booking_id text NULL,
  dispatch_job_id text NOT NULL,
  assignment_id text NOT NULL,
  assignment_version integer NOT NULL,
  runtime_profile_code text NOT NULL,
  vehicle_snapshot jsonb NOT NULL,
  driver_snapshot jsonb NOT NULL,
  rating_snapshot jsonb NOT NULL,
  eta_snapshot jsonb NOT NULL,
  route_fare_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  superseded_at timestamptz NULL,
  UNIQUE (order_id, assignment_version)
);
```

## 26.5 SOS

```sql
CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE safety.driver_sos_events (
  sos_event_id uuid PRIMARY KEY,
  client_event_id uuid NOT NULL,
  event_no text NOT NULL UNIQUE,
  incident_id text NULL,
  driver_id text NOT NULL,
  vehicle_id text NULL,
  plate_no text NULL,
  order_id text NULL,
  task_id text NULL,
  status text NOT NULL,
  event_type text NULL,
  severity text NULL,
  description text NULL,
  location_snapshot jsonb NULL,
  original_triggered_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL,
  offline_at_trigger boolean NOT NULL,
  false_alarm_snapshot jsonb NOT NULL,
  duty_ack_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (driver_id, client_event_id)
);

CREATE TABLE safety.driver_sos_timeline (
  timeline_id uuid PRIMARY KEY,
  sos_event_id uuid NOT NULL REFERENCES safety.driver_sos_events(sos_event_id),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE safety.driver_sos_attachments (
  attachment_id uuid PRIMARY KEY,
  sos_event_id uuid NOT NULL REFERENCES safety.driver_sos_events(sos_event_id),
  attachment_type text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL,
  checksum_sha256 text NOT NULL,
  scan_status text NOT NULL,
  uploaded_at timestamptz NOT NULL
);
```

## 26.6 Two-Year Record

```sql
CREATE TABLE reporting.multi_taxi_trip_operational_records (
  record_id uuid PRIMARY KEY,
  order_id text NOT NULL UNIQUE,
  trip_id text NOT NULL,
  vehicle_id text NOT NULL,
  plate_no text NOT NULL,
  reserved_at timestamptz NOT NULL,
  pickup_at timestamptz NULL,
  dropoff_at timestamptz NULL,
  route_snapshot jsonb NOT NULL,
  payable_fare_minor bigint NOT NULL,
  actual_fare_minor bigint NOT NULL,
  toll_minor bigint NOT NULL,
  currency text NOT NULL,
  fare_policy_version text NOT NULL,
  charging_mode text NOT NULL,
  generated_at timestamptz NOT NULL,
  retain_until timestamptz NOT NULL
);
```

---

# 27. RBAC / Security

## Passenger Token

- one order
- explicit scopes
- revocable
- rate limited
- no PII in token

## Driver

```text
driver:sos:create_self
driver:sos:read_self
driver:sos:supplement_self
driver:sos:false_alarm_self
```

## Ops

```text
ops:sos:read
ops:sos:acknowledge
ops:sos:investigate
ops:sos:resolve
multi_taxi_records:read
```

## Platform Admin

```text
multi_taxi_profile:manage
fare_publication:manage
multi_taxi_records:export
rating:moderate
```

---

# 28. Audit

P-5：

```text
vehicle_disclosure_profile_verified
driver_registration_credential_verified
p5_candidate_blocked
passenger_disclosure_snapshot_created
passenger_disclosure_snapshot_superseded
passenger_disclosure_viewed
passenger_rating_submitted
passenger_rating_invalidated
fare_quote_confirmed
seatbelt_reminder_displayed
electronic_ride_certificate_issued
multi_taxi_record_exported
```

S-3：

```text
sos_created
sos_duty_alert_dispatched
sos_duty_acknowledged
sos_attachment_uploaded
sos_false_alarm_dismissed
sos_resolved
```

Audit 禁止：

- full registration number
- raw phone
- payment token
- raw attachment URL

---

# 29. Observability

## P-5

```text
p5_assignment_snapshot_latency_ms
p5_disclosure_missing_block_total
p5_redispatch_update_latency_ms
p5_push_delivery_success_rate
p5_passenger_page_load_ms
p5_rating_submit_success_rate
multi_taxi_record_coverage_rate
```

## S-3

```text
sos_online_alert_latency_ms
sos_outbox_pending_count
sos_duty_ack_latency_ms
sos_attachment_failure_total
sos_offline_replay_success_rate
```

Alerts：

- assignment without snapshot = critical
- two-year record coverage < 100% post-rollout = critical
- online SOS p95 > 5 sec = critical
- unacknowledged SOS > threshold = critical

---

# 30. Migration

## Vehicle

- backfill make/model/year from approved submissions。
- doorCount/color 缺值進 correction queue。
- no fake defaults。

## Driver

- backfill registration no/area/expiry。
- existing `licensesValid` 不等於 verified。
- 未有審核證據 → `unverified`。

## Rating

- no historical rating → `new_driver`。
- 不得預設 5.0。

## Completed Orders

- best-effort backfill two-year record。
- rollout date 後 100% mandatory。

---

# 31. Work Packages

## P-5

```text
P1-MTX-PROFILE-001
P5-CON-001
P5-CAN-001
P5-DRV-001
P5-SUP-001
P5-BACKFILL-001
P5-RATE-001..004
P5-GATE-001..002
P5-SNAP-001
P5-ASSIGN-001
P5-REDISPATCH-001
P5-ROUTE-001
P5-FARE-001
P5-FARE-PUB-001
P5-FARE-ANOM-001
P5-PAX-001..003
P5-PUSH-001
P5-CALL-001
P5-SEAT-001
P5-PAY-001
P5-RCT-001
P5-RET-001..005
```

## S-3

```text
S3-CON-001
S3-DB-001
S3-CTX-001
S3-BE-001
S3-INC-001
S3-ALERT-001
S3-OPS-001
S3-METRIC-001
S3-MOB-001..003
S3-DIAL-001
S3-OFF-001
S3-ATT-001
S3-FALSE-001
S3-SUPP-001
```

---

# 32. Automated Tests

```text
E2E-023-multi-taxi-passenger-disclosure.sh
E2E-024-multi-taxi-rating-receipt-retention.sh
E2E-025-driver-sos-online-alert.sh
E2E-026-driver-sos-offline-replay.sh
```

Integration：

```text
INT-P5-001-assignment-snapshot-atomicity
INT-P5-002-redispatch-version
INT-P5-003-rating-idempotency
INT-P5-004-trip-record-retention
INT-S3-001-driver-context-spoof-protection
INT-S3-002-sos-incident-correlation
INT-S3-003-alert-outbox-idempotency
INT-S3-004-false-alarm-audit
```

---

# 33. Definition of Done — System

P-5：

1. no assignment without P-5 snapshot。
2. all mandatory fields backed by canonical records。
3. expired/unverified registration blocked。
4. `new_driver` truthful, no fake rating。
5. redispatch version safe。
6. passenger route uses live API, not fixture。
7. route/fare confirmation versioned。
8. rating and receipt work after completed trip。
9. 730-day record generated for all post-rollout completed trips。
10. reservation-only profile enforced。
11. raw phone / full registration never exposed。

S-3：

1. dedicated SOS aggregate and APIs。
2. server resolves authenticated context。
3. 110／119 available without data。
4. online Ops alert p95 ≤5 sec。
5. offline replay idempotent。
6. attachments retry。
7. false alarm retained and audited。
8. exactly one Incident per SOS。
9. no multi-platform / AV data in SOS projection。
