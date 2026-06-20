# Phase 1 修正系統設計文件（SD）

## 車行供給自主建檔、精確服務資格、Driver App 真機驗證、營運紀錄與半年摘要

**文件版本**：v1.0
**日期**：2026-06-19
**設計基準**：`ajoe734/drts-fleet-platform` `dev` branch
**對應 SA**：`phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md`

**本文件不含 CTI provider integration。**

---

# 0. 設計摘要

本次不新增另一套大型平行系統，而是延伸現有的四個 authority：

| Authority                                          | 本次責任                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `FleetPartnerModule`                               | submission、portal write flow、review orchestration、affiliation     |
| `RegulatoryRegistryModule`                         | 核可後 canonical driver / vehicle / policy / contract                |
| `OwnedMobilityModule` + `VehicleEligibilityModule` | exact product propagation、candidate eligibility、assignment recheck |
| Driver App + `RegulatoryRegistryModule`            | mobile heartbeat durability、freshness、work-state continuity        |
| `ReportingFilingModule`                            | daily dispatch record、supply snapshots、six-month summary           |

核心架構：

```text
Fleet Partner Portal
  → Supply Submission
  → Platform Review
  → Regulatory Registry
  → Supply Readiness
  → Exact Product Eligibility
  → Dispatch / Driver Task
  → Mobile State / Location
  → Daily Record / Six-Month Summary
```

---

# 1. 元件與模組變更

## 1.1 FleetPartnerModule

新增：

```text
SupplySubmissionService
SupplySubmissionRepository
SupplyReviewService
SupplyReadinessService
SupplyDocumentService
```

不另開 top-level `SupplyOnboardingModule`，避免重複 authority。
`FleetPartnerModule` 現在已 import `RegulatoryRegistryModule`，核可時由 orchestration service 呼叫 registry internal service。

---

## 1.2 RegulatoryRegistryModule

新增 internal methods：

```ts
provisionDriverFromSubmission(...)
provisionVehicleFromSubmission(...)
provisionInsuranceFromSubmission(...)
provisionContractFromSubmission(...)
createVehicleFleetAffiliation(...)
recomputeSupplyReadiness(...)
```

原有 public registry APIs 保留，但 Fleet Partner Portal 不可直接呼叫。

---

## 1.3 VehicleEligibilityModule

新增：

```text
EligibilityContextResolver
RuntimeEligibilityEvaluator
EligibilityDecisionSerializer
EligibilityReasonCatalog
```

`VehicleEligibilityMatrix` 保留為 policy source。

---

## 1.4 OwnedMobilityModule

修改：

- Booking / Order 保存 exact service product。
- DispatchJob 保存 exact product / policy version。
- `listDispatchCandidates` 呼叫 runtime evaluator。
- `assignDispatch` 在 transaction 中重新 evaluate。
- DriverTask 保存 exact product context。
- Settlement / reporting 不再由 broad bucket 推論 product。

---

## 1.5 Driver App

修改：

- Heartbeat 由 active-task-only 擴充為 online-available + active task。
- 新增 persistent offline queue。
- 新增 device event ID / sequence。
- 新增 tracking diagnostic state。
- 新增 app restart resume。
- 新增 mobile UAT evidence hooks。

---

## 1.6 ReportingFilingModule

新增 job types：

```text
daily_dispatch_record
six_month_operations_summary
```

新增 scheduler / aggregation service：

```text
DispatchDailyRecordBuilder
DispatchableSupplySnapshotService
OperationsSummaryAggregator
```

---

# 2. Contracts 設計

## 2.1 Supply Submission

```ts
export type SupplySubmissionType =
  | "driver_onboarding"
  | "vehicle_onboarding"
  | "insurance_update"
  | "contract_update"
  | "driver_affiliation"
  | "vehicle_affiliation";

export type SupplySubmissionStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "needs_revision"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface SupplySubmissionRecord {
  submissionId: string;
  fleetPartnerId: string;
  submissionType: SupplySubmissionType;
  status: SupplySubmissionStatus;
  revisionNo: number;

  subjectDriverId: string | null;
  subjectVehicleId: string | null;

  submittedBy: string | null;
  submittedAt: string | null;
  reviewStartedBy: string | null;
  reviewStartedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;

  reviewReasonCode: string | null;
  reviewComment: string | null;

  canonicalDriverId: string | null;
  canonicalVehicleId: string | null;
  canonicalContractId: string | null;
  canonicalPolicyId: string | null;

  createdAt: string;
  updatedAt: string;
}
```

---

## 2.2 Driver Submission

```ts
export interface DriverSupplyDraft {
  submissionId: string;
  name: string;
  mobile: string;

  professionalDriverLicenseNo: string;
  professionalDriverLicenseExpiry: string;

  taxiDriverRegistrationNo: string;
  taxiDriverRegistrationArea: string;
  taxiDriverRegistrationExpiry: string;

  supportedServiceProductCodes: string[];
  preferredVehicleSubmissionId: string | null;
}
```

---

## 2.3 Vehicle Submission

```ts
export interface VehicleSupplyDraft {
  submissionId: string;
  plateNo: string;
  licenseType: string;

  brand: string | null;
  model: string | null;
  modelYear: number | null;

  seatCount: number;
  luggageCapacity: number;
  businessArea: string;

  supportedServiceProductCodes: string[];
  airportTransferEligible: boolean;
  fixedFareAllowed: boolean;

  currentDriverSubmissionId: string | null;
}
```

---

## 2.4 Document

```ts
export type SupplyDocumentType =
  | "professional_driver_license"
  | "taxi_driver_registration"
  | "vehicle_registration"
  | "insurance_policy"
  | "fleet_participation_contract"
  | "driver_management_contract"
  | "vehicle_management_contract"
  | "other";

export type SupplyDocumentReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface SupplyDocumentRecord {
  documentId: string;
  fleetPartnerId: string;
  submissionId: string;

  documentType: SupplyDocumentType;
  fileObjectKey: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  checksumSha256: string;

  effectiveFrom: string | null;
  effectiveUntil: string | null;

  reviewStatus: SupplyDocumentReviewStatus;
  reviewComment: string | null;

  uploadedBy: string;
  uploadedAt: string;
}
```

---

## 2.5 Vehicle Fleet Affiliation

```ts
export type VehicleFleetAffiliationType =
  | "owned_by"
  | "managed_by"
  | "contracted_under";

export interface VehicleFleetAffiliationRecord {
  affiliationId: string;
  vehicleId: string;
  fleetPartnerId: string;
  affiliationType: VehicleFleetAffiliationType;

  effectiveFrom: string;
  effectiveUntil: string | null;
  status: "active" | "inactive";

  sourceSubmissionId: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 2.6 Readiness

```ts
export type SupplyReadinessState = "ready" | "not_ready" | "suspended";

export type SupplyReadinessReasonCode =
  | "DRIVER_LICENSE_MISSING"
  | "DRIVER_LICENSE_EXPIRED"
  | "DRIVER_REGISTRATION_MISSING"
  | "DRIVER_REGISTRATION_EXPIRED"
  | "VEHICLE_DOCUMENT_MISSING"
  | "INSURANCE_MISSING"
  | "INSURANCE_EXPIRED"
  | "CONTRACT_MISSING"
  | "CONTRACT_INACTIVE"
  | "DRIVER_AFFILIATION_MISSING"
  | "VEHICLE_AFFILIATION_MISSING"
  | "SERVICE_PRODUCT_NOT_SUPPORTED"
  | "TRAINING_REQUIRED"
  | "FLEET_PARTNER_INACTIVE"
  | "MANUALLY_SUSPENDED";

export interface SupplyReadinessRecord {
  subjectType: "driver" | "vehicle" | "driver_vehicle_pair";
  subjectId: string;
  state: SupplyReadinessState;
  reasonCodes: SupplyReadinessReasonCode[];
  evaluatedAt: string;
  policyVersion: string;
}
```

---

## 2.7 Exact Service Product Context

```ts
export interface ExactServiceProductContext {
  serviceProductId: string;
  serviceProductCode: string;
  serviceProductVersion: string;
  serviceBucket: "standard_taxi" | "business_dispatch";
  resolvedBy:
    | "tenant_program"
    | "partner_program"
    | "ops_selection"
    | "external_adapter";
  sourceProgramId: string | null;
  sourcePlatform: string | null;
}
```

加入：

```text
CreateTenantBookingCommand
CreateCallCenterOrderCommand
OwnedOrderRecord
DispatchJobRecord
DispatchCandidateRecord
AssignmentRecord
DriverTaskRecord
SettlementTripRecord
```

---

## 2.8 Eligibility Decision

```ts
export type EligibilityDecision =
  | "eligible"
  | "conditionally_eligible"
  | "ineligible";

export interface RuntimeEligibilityDecisionRecord {
  decisionId: string;
  orderId: string;
  dispatchJobId: string;
  driverId: string;
  vehicleId: string;

  serviceProductId: string;
  serviceProductCode: string;
  policyVersion: string;

  decision: EligibilityDecision;
  hardReasonCodes: string[];
  softReasonCodes: string[];
  missingRequirements: string[];

  locationState: "fresh" | "stale" | "low_accuracy" | "missing";
  evaluatedAt: string;
}
```

---

## 2.9 Mobile Heartbeat

```ts
export interface DriverLocationHeartbeatEnvelope {
  eventId: string;
  deviceId: string;
  driverId: string;
  vehicleId: string | null;
  taskId: string | null;

  sequenceNo: number;
  recordedAt: string;

  lat: number;
  lng: number;
  accuracyM: number | null;

  workState:
    | "offline"
    | "available"
    | "assigned"
    | "enroute"
    | "arrived"
    | "on_trip"
    | "incident";

  appState: "foreground" | "background";
  transportMode: "foreground" | "background";
  networkType: "wifi" | "cellular" | "offline" | "unknown";
}

export interface DriverLocationHeartbeatAck {
  eventId: string;
  accepted: boolean;
  duplicate: boolean;
  currentLocationUpdated: boolean;
  serverReceivedAt: string;
}
```

---

## 2.10 Reporting Types

```ts
export interface DispatchDailyRecord {
  serviceDate: string;
  orderId: string;
  orderNo: string;

  orderSource: string;
  tenantId: string | null;
  partnerId: string | null;

  serviceProductCode: string;
  requestedAt: string;
  reservationTime: string | null;

  pickupAddressSnapshot: string;
  dropoffAddressSnapshot: string | null;

  firstDispatchAt: string | null;
  firstAssignedAt: string | null;

  finalDriverId: string | null;
  finalVehicleId: string | null;
  finalPlateNo: string | null;

  etaSecondsAtAssignment: number | null;
  arrivedPickupAt: string | null;
  tripStartedAt: string | null;
  tripCompletedAt: string | null;

  finalStatus: string;
  redispatchCount: number;
  cancellationReason: string | null;
  complaintCount: number;

  generatedAt: string;
}
```

```ts
export interface SixMonthOperationsSummary {
  from: string;
  to: string;

  businessArea: string | null;
  serviceProductCode: string | null;

  demandRequestCount: number;
  actualDispatchCount: number;
  completedTripCount: number;
  cancelledOrderCount: number;

  averageDispatchableVehicleCount: number;
  validSnapshotCount: number;
  expectedSnapshotCount: number;
  snapshotCoverageRate: number;

  complaintCount: number;
  complaintsByCategory: Record<string, number>;

  generatedAt: string;
}
```

---

# 3. API 設計

## 3.1 Fleet Partner Submission APIs

### List

```http
GET /api/fleet-partner/supply-submissions
```

Filters：

```text
status
submissionType
subjectDriverId
subjectVehicleId
```

### Detail

```http
GET /api/fleet-partner/supply-submissions/{submissionId}
```

### Create Driver Draft

```http
POST /api/fleet-partner/supply-submissions/drivers
```

### Update Driver Draft

```http
PUT /api/fleet-partner/supply-submissions/{submissionId}/driver
```

### Create Vehicle Draft

```http
POST /api/fleet-partner/supply-submissions/vehicles
```

### Update Vehicle Draft

```http
PUT /api/fleet-partner/supply-submissions/{submissionId}/vehicle
```

### Upload Document

```http
POST /api/fleet-partner/supply-submissions/{submissionId}/documents/upload-url
POST /api/fleet-partner/supply-submissions/{submissionId}/documents/confirm
DELETE /api/fleet-partner/supply-submissions/{submissionId}/documents/{documentId}
```

採 pre-signed upload，API 不直接接大檔 binary。

### Submit / Withdraw

```http
POST /api/fleet-partner/supply-submissions/{submissionId}/submit
POST /api/fleet-partner/supply-submissions/{submissionId}/withdraw
```

### Readiness

```http
GET /api/fleet-partner/readiness
GET /api/fleet-partner/readiness/drivers/{driverId}
GET /api/fleet-partner/readiness/vehicles/{vehicleId}
```

---

## 3.2 Platform Review APIs

```http
GET  /api/admin/supply-review/submissions
GET  /api/admin/supply-review/submissions/{submissionId}
POST /api/admin/supply-review/submissions/{submissionId}/start
POST /api/admin/supply-review/submissions/{submissionId}/request-revision
POST /api/admin/supply-review/submissions/{submissionId}/approve
POST /api/admin/supply-review/submissions/{submissionId}/reject
```

Command 必須帶：

```text
expectedRevisionNo
reasonCode
comment
```

Approve 使用 optimistic concurrency。

---

## 3.3 Eligibility APIs

### Candidate Query

既有：

```http
GET /api/dispatch/tasks/{dispatchJobId}/candidates
```

Response 增加：

```text
serviceProductContext
eligibilityDecision
hardReasonCodes
softReasonCodes
missingRequirements
locationState
```

預設只回 eligible / conditionally eligible。Ops 加 query：

```text
includeIneligible=true
```

可查看被排除供給與原因。

### Explicit Evaluate

```http
POST /api/ops/dispatch/eligibility/evaluate
```

用途：

- Ops debug
- Platform Admin matrix preview
- E2E

### Assignment

既有：

```http
POST /api/dispatch/assign
```

內部重新 evaluate。若失敗：

```text
409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT
```

並回最新 reasons。

---

## 3.4 Driver Heartbeat APIs

保留單筆：

```http
POST /api/regulatory-registry/driver-location
```

新增批次：

```http
POST /api/driver/location-heartbeats/batch
```

Request：

```ts
{
  items: DriverLocationHeartbeatEnvelope[];
}
```

Response：

```ts
{
  items: DriverLocationHeartbeatAck[];
}
```

單次最多 100 筆。

### Tracking Status

```http
GET /api/driver/tracking-status
GET /api/ops/drivers/{driverId}/tracking-status
```

---

## 3.5 Reporting APIs

沿用：

```http
POST /api/reports/jobs
GET  /api/reports/jobs
GET  /api/reports/{jobId}
```

新增 `jobType`：

```text
daily_dispatch_record
six_month_operations_summary
```

新增 preview：

```http
GET /api/ops/reports/operations-summary/preview
```

---

# 4. Database DDL 草稿

## 4.1 Supply Submission

```sql
CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.supply_submissions (
  submission_id uuid PRIMARY KEY,
  fleet_partner_id uuid NOT NULL,
  submission_type text NOT NULL,
  status text NOT NULL,
  revision_no integer NOT NULL DEFAULT 1,

  subject_driver_id uuid NULL,
  subject_vehicle_id uuid NULL,

  submitted_by text NULL,
  submitted_at timestamptz NULL,
  review_started_by text NULL,
  review_started_at timestamptz NULL,
  reviewed_by text NULL,
  reviewed_at timestamptz NULL,

  review_reason_code text NULL,
  review_comment text NULL,

  canonical_driver_id uuid NULL,
  canonical_vehicle_id uuid NULL,
  canonical_contract_id uuid NULL,
  canonical_policy_id uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    status IN (
      'draft',
      'submitted',
      'in_review',
      'needs_revision',
      'approved',
      'rejected',
      'withdrawn'
    )
  )
);

CREATE INDEX idx_supply_submissions_partner_status
  ON fleet.supply_submissions(fleet_partner_id, status, updated_at DESC);
```

---

## 4.2 Driver Draft

```sql
CREATE TABLE fleet.driver_supply_drafts (
  submission_id uuid PRIMARY KEY
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,

  name text NOT NULL,
  mobile text NOT NULL,

  professional_driver_license_no text NOT NULL,
  professional_driver_license_expiry date NOT NULL,

  taxi_driver_registration_no text NOT NULL,
  taxi_driver_registration_area text NOT NULL,
  taxi_driver_registration_expiry date NOT NULL,

  supported_service_product_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_vehicle_submission_id uuid NULL,

  payload_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 4.3 Vehicle Draft

```sql
CREATE TABLE fleet.vehicle_supply_drafts (
  submission_id uuid PRIMARY KEY
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,

  plate_no text NOT NULL,
  license_type text NOT NULL,

  brand text NULL,
  model text NULL,
  model_year integer NULL,

  seat_count integer NOT NULL,
  luggage_capacity integer NOT NULL,
  business_area text NOT NULL,

  supported_service_product_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  airport_transfer_eligible boolean NOT NULL DEFAULT false,
  fixed_fare_allowed boolean NOT NULL DEFAULT false,

  current_driver_submission_id uuid NULL,

  payload_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_vehicle_draft_partner_plate_active
  ON fleet.vehicle_supply_drafts(plate_no);
```

實作時改成 partner scope 級別 unique constraint；若 plate 已在 canonical registry，create draft 應轉為 update flow。

---

## 4.4 Supply Documents

```sql
CREATE TABLE fleet.supply_documents (
  document_id uuid PRIMARY KEY,
  fleet_partner_id uuid NOT NULL,
  submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,

  document_type text NOT NULL,
  file_object_key text NOT NULL,
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL,
  checksum_sha256 text NOT NULL,

  effective_from date NULL,
  effective_until date NULL,

  review_status text NOT NULL DEFAULT 'pending',
  review_comment text NULL,

  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  CHECK (review_status IN ('pending', 'approved', 'rejected', 'expired'))
);
```

---

## 4.5 Review Events

```sql
CREATE TABLE fleet.supply_review_events (
  event_id uuid PRIMARY KEY,
  submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id),

  revision_no integer NOT NULL,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  reason_code text NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_supply_review_events_submission
  ON fleet.supply_review_events(submission_id, created_at);
```

---

## 4.6 Vehicle Affiliation

```sql
CREATE TABLE fleet.vehicle_fleet_affiliations (
  affiliation_id uuid PRIMARY KEY,
  vehicle_id uuid NOT NULL,
  fleet_partner_id uuid NOT NULL,

  affiliation_type text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  status text NOT NULL,

  source_submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (affiliation_type IN ('owned_by', 'managed_by', 'contracted_under')),
  CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX idx_vehicle_affiliation_active
  ON fleet.vehicle_fleet_affiliations(vehicle_id, status, effective_from);
```

---

## 4.7 Exact Product Columns

在現有 order / dispatch / task persistence 增加：

```sql
ALTER TABLE mobility.phase1_orders
  ADD COLUMN service_product_id text NULL,
  ADD COLUMN service_product_code text NULL,
  ADD COLUMN service_product_version text NULL,
  ADD COLUMN eligibility_policy_version text NULL;

ALTER TABLE mobility.phase1_dispatch_jobs
  ADD COLUMN service_product_id text NULL,
  ADD COLUMN service_product_code text NULL,
  ADD COLUMN service_product_version text NULL,
  ADD COLUMN eligibility_policy_version text NULL;

ALTER TABLE mobility.phase1_driver_tasks
  ADD COLUMN service_product_id text NULL,
  ADD COLUMN service_product_code text NULL,
  ADD COLUMN service_product_version text NULL,
  ADD COLUMN eligibility_policy_version text NULL;
```

實際 schema 名稱須依現有 migration 對齊。

---

## 4.8 Eligibility Decisions

```sql
CREATE TABLE mobility.runtime_eligibility_decisions (
  decision_id uuid PRIMARY KEY,
  order_id text NOT NULL,
  dispatch_job_id text NOT NULL,
  driver_id text NOT NULL,
  vehicle_id text NOT NULL,

  service_product_id text NOT NULL,
  service_product_code text NOT NULL,
  policy_version text NOT NULL,

  decision text NOT NULL,
  hard_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  soft_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,

  location_state text NOT NULL,
  evaluated_at timestamptz NOT NULL,

  CHECK (decision IN ('eligible', 'conditionally_eligible', 'ineligible'))
);

CREATE INDEX idx_eligibility_dispatch
  ON mobility.runtime_eligibility_decisions(dispatch_job_id, evaluated_at DESC);
```

---

## 4.9 Mobile Heartbeat Events

```sql
CREATE TABLE telemetry.driver_location_events (
  event_id text PRIMARY KEY,
  device_id text NOT NULL,
  driver_id text NOT NULL,
  vehicle_id text NULL,
  task_id text NULL,

  sequence_no bigint NOT NULL,
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),

  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision NULL,

  work_state text NOT NULL,
  app_state text NOT NULL,
  transport_mode text NOT NULL,
  network_type text NOT NULL,

  clock_skew_ms bigint NULL,
  out_of_order boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX idx_driver_device_sequence
  ON telemetry.driver_location_events(device_id, sequence_no);

CREATE INDEX idx_driver_location_time
  ON telemetry.driver_location_events(driver_id, recorded_at DESC);
```

Current location read model 可保留原表，只在新 event 比現有 `recordedAt` 更新時覆寫。

---

## 4.10 Daily Dispatch Records

```sql
CREATE TABLE reporting.dispatch_daily_records (
  service_date date NOT NULL,
  order_id text NOT NULL,
  order_no text NOT NULL,

  order_source text NOT NULL,
  tenant_id text NULL,
  partner_id text NULL,
  service_product_code text NOT NULL,

  requested_at timestamptz NOT NULL,
  reservation_time timestamptz NULL,

  pickup_address_snapshot text NOT NULL,
  dropoff_address_snapshot text NULL,

  first_dispatch_at timestamptz NULL,
  first_assigned_at timestamptz NULL,

  final_driver_id text NULL,
  final_vehicle_id text NULL,
  final_plate_no text NULL,

  eta_seconds_at_assignment integer NULL,
  arrived_pickup_at timestamptz NULL,
  trip_started_at timestamptz NULL,
  trip_completed_at timestamptz NULL,

  final_status text NOT NULL,
  redispatch_count integer NOT NULL DEFAULT 0,
  cancellation_reason text NULL,
  complaint_count integer NOT NULL DEFAULT 0,

  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (service_date, order_id)
);
```

---

## 4.11 Dispatchable Supply Snapshots

```sql
CREATE TABLE reporting.dispatchable_supply_snapshots (
  snapshot_at timestamptz NOT NULL,
  business_area text NOT NULL,
  service_product_code text NOT NULL,

  dispatchable_vehicle_count integer NOT NULL,
  available_driver_count integer NOT NULL,

  source_health text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (snapshot_at, business_area, service_product_code)
);
```

---

## 4.12 Operations Summary

```sql
CREATE TABLE reporting.monthly_operations_summaries (
  period_month text NOT NULL,
  business_area text NOT NULL,
  service_product_code text NOT NULL,

  demand_request_count integer NOT NULL,
  actual_dispatch_count integer NOT NULL,
  completed_trip_count integer NOT NULL,
  cancelled_order_count integer NOT NULL,

  average_dispatchable_vehicle_count numeric(12,2) NOT NULL,
  valid_snapshot_count integer NOT NULL,
  expected_snapshot_count integer NOT NULL,
  snapshot_coverage_rate numeric(6,4) NOT NULL,

  complaint_count integer NOT NULL,
  complaints_by_category jsonb NOT NULL DEFAULT '{}'::jsonb,

  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (period_month, business_area, service_product_code)
);
```

---

# 5. 核心服務流程設計

## 5.1 Approve Submission Transaction

```ts
async function approveSubmission(
  submissionId: string,
  expectedRevisionNo: number,
  reviewer: Identity,
) {
  return db.transaction(async (tx) => {
    const submission = await repo.lockSubmission(tx, submissionId);

    assertStatus(submission, "in_review");
    assertRevision(submission, expectedRevisionNo);
    assertReviewerNotFleetSubmitter(submission, reviewer);

    const validation = await validator.validateCompleteSubmission(
      tx,
      submission,
    );
    if (!validation.ok) {
      throw new SubmissionIncompleteError(validation.errors);
    }

    const canonical = await regulatoryRegistry.provisionFromSubmission(
      tx,
      submission,
    );

    await affiliationService.provisionAffiliations(tx, submission, canonical);

    await repo.markApproved(tx, submission, reviewer, canonical);

    const readiness = await readinessService.evaluateCanonicalSupply(
      tx,
      canonical,
    );

    await audit.record(tx, "approve_supply_submission", {
      submissionId,
      canonical,
      readiness,
    });

    return { submission, canonical, readiness };
  });
}
```

---

## 5.2 Eligibility Evaluation

順序：

```text
1. resolve exact service product
2. load driver + vehicle canonical state
3. load readiness
4. load matrix policy and policy version
5. check hard constraints
6. check product-specific constraints
7. check source-platform constraints
8. classify location freshness
9. check soft constraints
10. return decision
```

Pseudocode：

```ts
function evaluateCandidate(context, driver, vehicle, policy) {
  const hardReasons = [];

  if (!driver.readiness.ready) hardReasons.push("DRIVER_NOT_READY");
  if (!vehicle.readiness.ready) hardReasons.push("VEHICLE_NOT_READY");

  if (!policy.allows(vehicle.licenseType, context.serviceProductCode)) {
    hardReasons.push("VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT");
  }

  if (
    context.serviceProductCode === "credit_card_airport_transfer" &&
    !vehicle.airportTransferEligible
  ) {
    hardReasons.push("MISSING_AIRPORT_ELIGIBILITY");
  }

  if (
    context.sourcePlatform &&
    !driver.platformBindings.includes(context.sourcePlatform)
  ) {
    hardReasons.push("PLATFORM_BINDING_REQUIRED");
  }

  if (hardReasons.length) {
    return ineligible(hardReasons);
  }

  return eligibleOrConditional(...);
}
```

Assignment 必須使用 fresh transaction 再 evaluate 一次。

---

## 5.3 Mobile Offline Queue

裝置端使用 SQLite：

```text
pending_location_events
```

狀態：

```text
pending
sending
acked
failed_retryable
failed_permanent
```

策略：

- online 時每 10 秒 flush
- batch 50 筆
- exponential backoff
- max retention 24 小時
- queue 超過 5,000 筆時保留：
  - 所有 state-change event
  - 每分鐘一筆位置
  - incident 期間所有位置
- 不丟失 arrive/start/complete 關鍵事件

---

## 5.4 Current Location Update Rule

```ts
if (event.recordedAt > current.recordedAt) {
  updateCurrentLocation(event);
} else {
  storeHistoryOnly(event, { outOfOrder: true });
}
```

Server 依 `eventId` 與 `(deviceId, sequenceNo)` 去重。

---

## 5.5 Report Aggregation

### Daily Record

```text
read orders in serviceDate
→ join dispatch trace
→ find first dispatch
→ find first valid assignment
→ resolve final assignment
→ join driver task events
→ count redispatch
→ count complaints
→ upsert daily record
```

### Supply Snapshot

每 5 分鐘：

```text
canonical readiness ready
AND driver online/available
AND location fresh
AND exact product eligible
```

依 business area / product count。

### Six-Month Summary

從 monthly summary 組合，不每次掃原始 raw events。

---

# 6. 前端修改

## 6.1 Fleet Partner Portal

新增 routes：

```text
/supply
/supply/drivers/new
/supply/vehicles/new
/supply/submissions
/supply/submissions/[submissionId]
/documents
```

修改：

- Dashboard 的「供給待機」連到新增待機。
- Drivers 頁新增「新增待機」與 submission status。
- Vehicles 頁新增「新增車輛」與 readiness。
- Documents 不再 fixture fallback。
- Training / Cases 不屬本次核心，可維持 read-only gap。

---

## 6.2 Platform Admin

新增：

```text
/supply-review
/supply-review/[submissionId]
```

功能：

- queue
- filters
- side-by-side diff
- document viewer
- validation warnings
- reason code
- approve / revise / reject
- audit receipt

---

## 6.3 Ops Console

Dispatch candidate panel 增加：

- exact service product
- readiness
- eligibility decision
- reason codes
- location freshness
- policy version

新增「顯示被排除候選」切換。

Reports 增加：

- 每日派遣紀錄
- 半年營運摘要

---

## 6.4 Driver App

新增：

### Tracking Status UI

```text
定位權限
背景定位
上次成功上傳
待送 queue
目前 tracking state
目前 vehicle / task
```

### Permission Gate

上線時上線前檢查：

- foreground location
- background location
- bound device
- valid identity

不符合則擋下並提供設定指引。

### Service Product Context

任何卡著 trip 頁顯示 exact product，不再只顯示 business / realtime broad label。

---

# 7. RBAC

## Fleet Partner

```text
fleet:supply:read
fleet:supply:create
fleet:supply:update
fleet:supply:submit
fleet:documents:upload
fleet:readiness:read
```

## Platform

```text
supply_review:read
supply_review:start
supply_review:request_revision
supply_review:approve
supply_review:reject
```

## Ops

```text
dispatch:read
dispatch:assign
dispatch:eligibility:read
reports:operations:read
reports:operations:generate
```

## Driver

```text
driver:location:write_self
driver:tracking_status:read_self
driver:task:transition_self
```

---

# 8. Audit Events

```text
create_supply_submission
update_supply_submission
upload_supply_document
submit_supply_submission
withdraw_supply_submission
start_supply_review
request_supply_revision
approve_supply_submission
reject_supply_submission
provision_canonical_supply
create_vehicle_fleet_affiliation
evaluate_runtime_eligibility
override_soft_eligibility
ingest_driver_location_batch
generate_daily_dispatch_record
generate_six_month_operations_summary
download_operations_report
```

Heartbeat 每筆不寫 business audit，寫 telemetry log 與 ingestion metrics，避免 audit flood。

---

# 9. Observability

## Supply

- submissions by status
- average review time
- revision count
- rejection reasons
- canonical provisioning failure
- readiness by reason

## Eligibility

- candidates evaluated
- eligible rate
- no eligible supply
- reason code distribution
- assignment recheck failure
- policy version drift

## Mobile

- active tracking devices
- heartbeat success rate
- average upload delay
- stale driver count
- offline queue depth
- duplicate / out-of-order rate
- Android / iOS breakdown

## Reporting

- snapshot coverage
- daily rebuild duration
- report generation success
- source incomplete count
- report row count

---

# 10. Migration 與 Backfill

## 10.1 Existing Fleet Partners

- 現有 fleet partner 維持。
- 現有 driver affiliation 維持。
- 對現有車輛建立 vehicle affiliation backfill：
  - 若只有一個 managed fleet partner，可自動建立。
  - 若多個或不明，建立 manual review item。

## 10.2 Existing Drivers / Vehicles

標記：

```text
source = legacy_admin_created
```

不強迫重新送審。

Readiness 初次計算後：

- ready：維持可派
- not_ready：列 warning，不立即停派
- 由 rollout flag 決定 enforcement

## 10.3 Exact Product Backfill

既有 orders：

- partner airport subtype → `credit_card_airport_transfer`
- enterprise subtype → `enterprise_dispatch`
- standard taxi → `taxi_realtime` 或 `taxi_reservation`，依 reservation time
- 無法確定 → `legacy_unmapped`

新訂單不得為 `legacy_unmapped`。

## 10.4 Rollout

```text
Phase A：shadow evaluation
Phase B：Ops 顯示 reasons，不擋
Phase C：hard constraints enforcement
Phase D：full enforcement
```

---

# 11. 測試規格

## 11.1 Unit Tests

### Supply

- state transitions
- revision conflict
- fleet scope
- duplicate plate
- missing documents
- readiness reasons
- affiliation effective dates

### Eligibility

- exact product preserved
- airport transfer rejection
- source platform binding
- stale location
- assignment recheck
- hard / soft constraints

### Mobile

- queue persistence
- dedupe
- out-of-order
- compression
- restart resume
- permission gate

### Reporting

- demand count
- actual dispatch count
- redispatch de-dup
- average supply formula
- coverage rate
- complaint grouping

---

## 11.2 Integration Tests

```text
INT-SUP-001 approve submission provisions registry
INT-SUP-002 revision does not overwrite approved canonical
INT-ELIG-001 candidate query uses exact product
INT-ELIG-002 assignment rechecks
INT-MOB-001 batch heartbeat idempotency
INT-REP-001 daily record joins dispatch/task data
INT-REP-002 six-month summary aggregates snapshots
```

---

## 11.3 E2E

### `E2E-019-fleet-supply-onboarding.sh`

```text
fleet partner creates driver / vehicle
→ uploads docs metadata
→ submits
→ admin requests revision
→ resubmits
→ admin approves
→ canonical driver/vehicle/affiliations created
→ readiness ready
```

### `E2E-020-service-product-runtime-eligibility.sh`

```text
create airport booking
→ dispatchable but airport-ineligible taxi excluded
→ eligible airport vehicle included
→ assignment recheck
→ driver task exact product
```

### `E2E-021-driver-heartbeat-replay.sh`

API / emulator level：

```text
send batch with duplicate / out-of-order / offline backlog
→ dedupe
→ current location remains newest
→ tracking status correct
```

### `E2E-022-operations-reporting.sh`

```text
multiple source orders
→ assign / redispatch / cancel / complete
→ complaints
→ daily report
→ supply snapshots
→ six-month summary
→ verify counts / coverage
```

---

## 11.4 Physical Device UAT

### `UAT-MOB-ANDROID-001`

- Install signed build
- Permissions
- Online available
- Background tracking
- App killed / reopened
- Network switch
- 5-minute offline
- Full task lifecycle

### `UAT-MOB-IOS-001`

相同流程，另驗：

- Low Power Mode
- iOS background indicator
- OS termination
- user force quit limitation
- reopen recovery

---

# 12. 工作拆解與依賴

## Wave 1 — Supply

```text
SUP-BE-001 Submission contracts
SUP-BE-002 Submission persistence
SUP-BE-003 Partner APIs
SUP-BE-004 Review APIs
SUP-BE-005 Canonical provisioning
SUP-BE-006 Vehicle affiliation
SUP-BE-007 Readiness service
SUP-FE-001 Fleet Portal write flow
SUP-FE-002 Admin review queue
SUP-QA-001 E2E-019
```

依賴：

```text
SUP-BE-001
→ SUP-BE-002
→ SUP-BE-003 / 004
→ SUP-BE-005 / 006 / 007
→ frontend
→ E2E
```

---

## Wave 2 — Eligibility

```text
ELIG-BE-001 Exact product contract
ELIG-BE-002 Order / dispatch / task persistence
ELIG-BE-003 Runtime evaluator
ELIG-BE-004 Candidate reasons
ELIG-BE-005 Assignment recheck
ELIG-FE-001 Ops candidate UI
ELIG-MOB-001 Driver task exact product
ELIG-QA-001 E2E-020
```

---

## Wave 3 — Mobile

```text
MOB-BE-001 Batch heartbeat API
MOB-BE-002 Idempotency / freshness
MOB-APP-001 Online available tracking
MOB-APP-002 SQLite offline queue
MOB-APP-003 Permission gate
MOB-APP-004 Restart recovery
MOB-OPS-001 Tracking diagnostics
MOB-QA-001 E2E-021
MOB-UAT-001 Android
MOB-UAT-002 iOS
```

---

## Wave 4 — Reporting

```text
REP-BE-001 Daily record builder
REP-BE-002 Supply snapshot scheduler
REP-BE-003 Monthly summary
REP-BE-004 Report job types
REP-OPS-001 Reports UI
REP-QA-001 E2E-022
```

---

# 13. Definition of Done

本次修正只有在以下全部完成才能計 Done：

1. 車行可自行送件，平台不用代建。
2. 核可前 submission 不污染 canonical registry。
3. 核可後 driver / vehicle / insurance / contract / affiliation 可追溯。
4. exact service product 從 intake 到 task 不丟失。
5. 機場接送資格負向測試確實生效。
6. Android 與 iOS 真機各有 evidence pack。
7. Heartbeat 斷線後可 durable replay。
8. Ops 可以看 stale / gap / eligibility reason。
9. 每日派遣紀錄可固定重建與下載。
10. 半年摘要口徑、coverage 與客訴統計正確。
11. 所有新增 E2E 經綠。
12. CTI 不在本次 completion claim 內。

---

# 14. 最終 SD 裁決

本次設計不新增第二套派遣、registry、reporting 或 mobile runtime。

正確實作方式是：

```text
FleetPartner submission layer
→ Regulatory Registry canonical layer
→ Exact Service Product Eligibility
→ Existing Dispatch / Driver Task
→ Durable Mobile Telemetry
→ Existing Reporting/Filing extension
```

CTI 等供應商選定後另行設計，不得在本次程式中預埋特定 vendor dependency。
