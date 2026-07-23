# Multi-Taxi Operations Wave 0 Design Gates & Handoff Evidence Packet (`P5-S3-DESIGN-QA-001`)

- **Task ID:** `MTX-DESIGN-WAVE0`
- **Gate Milestone:** Wave 0 Design Gates (Human Visual Design Team Sign-Off)
- **Handoff Target:** `P5-S3-DESIGN-QA-001` & Implementation Fleets B, C, D, F
- **Date:** 2026-07-23
- **Owner:** Gemini (Visual Design & Handoff Delivery)
- **Reviewer:** Codex
- **Status:** `review_ready`

---

## 1. Executive Summary & Fleet Unlocking

This document provides the canonical design handoff and evidence manifest for **Wave 0 Design Gates** (`MTX-DESIGN-WAVE0` / `P5-S3-DESIGN-QA-001`). All design components, interactive frames, token mappings, copy matrices, accessibility annotations, clickable prototype flows, developer handoff specifications, API dependency maps, and required PNG evidence screenshots have been verified and placed in canonical repository paths.

Completion of this handoff officially unlocks the visual implementation tasks for downstream fleets:
- **Fleet B:** Operating Authorization (`MTX-AUTH-UI-001`)
- **Fleet C:** Queue Semantics (`MTX-QUEUE-003`)
- **Fleet D:** Rating Governance (`P5-RATE-003`)
- **Fleet F:** Commerce & Records Retention (`P5-COM-UI-01..05`)
- **Fleet H:** Design QA Handoff & Acceptance (`P5-S3-DESIGN-QA-001`)

---

## 2. Frame-to-Screen-ID Handoff Matrix

As specified in `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` (§19 & §22), all implementation fleets must bind to these exact Screen IDs, Frame Names, and exported React Components.

| Screen ID | Canonical Frame Name | Design Canvas File & Artboard ID | React Component | Viewport / Format | Screenshot Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MTX-AUTH-UI-01** | `MTX-AUTH-UI-01_Registry_1440x900` | `Platform Admin.html` (`mtx-auth-registry`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthRegistry` | Desktop 1440x900 | [`MTX_authorization_registry.png`](docs/05-ui/screenshots/MTX_authorization_registry.png) |
| **MTX-AUTH-UI-01_Narrow** | `MTX-AUTH-UI-01_Registry_Narrow_390x844` | `Platform Admin.html` (`mtx-auth-registry-narrow`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthRegistry` (isNarrow) | Mobile 390x844 | Canvas Artboard `mtx-auth-registry-narrow` |
| **MTX-AUTH-UI-02** | `MTX-AUTH-UI-02_Detail_Approved_1440x900` | `Platform Admin.html` (`mtx-auth-detail`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthDetail` | Desktop 1440x900 | [`MTX_authorization_detail_approved.png`](docs/05-ui/screenshots/MTX_authorization_detail_approved.png) |
| **MTX-AUTH-UI-03** | `MTX-AUTH-UI-03_Draft_Editor_1280x800` | `Platform Admin.html` (`mtx-auth-draft`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthDraftEditor` | Desktop 1280x800 | Canvas Artboard `mtx-auth-draft` |
| **MTX-AUTH-UI-04** | `MTX-AUTH-UI-04_Lifecycle_Confirm_1440x900` | `Platform Admin.html` (`mtx-auth-confirm`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthLifecycleConfirm` | Desktop 1440x900 | Canvas Artboard `mtx-auth-confirm` |
| **MTX-AUTH-UI-05** | `MTX-AUTH-UI-05_Vehicles_1440x900` | `Platform Admin.html` (`mtx-auth-vehicles`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthVehicles` | Desktop 1440x900 | [`MTX_authorization_vehicle_membership.png`](docs/05-ui/screenshots/MTX_authorization_vehicle_membership.png) |
| **MTX-AUTH-UI-06** | `MTX-AUTH-UI-06_Conflict_403_1440x900` | `Platform Admin.html` (`mtx-auth-conflict`) / `mtx-operations-screens.jsx` | `PA_MTX_AuthConflictState` | Desktop 1440x900 | Canvas Artboard `mtx-auth-conflict` |
| **MTX-QUEUE-UI-01** | `MTX-QUEUE-UI-01_Overview_1440x900` | `Ops Console.html` (`mtx-queue-overview`) / `mtx-operations-screens.jsx` | `OPS_MTX_QueueOverview` | Desktop 1440x900 | [`MTX_queue_virtual_matching.png`](docs/05-ui/screenshots/MTX_queue_virtual_matching.png) |
| **MTX-QUEUE-UI-01_Narrow** | `MTX-QUEUE-UI-01_Overview_Narrow_390x844` | `Ops Console.html` (`mtx-queue-overview-narrow`) / `mtx-operations-screens.jsx` | `OPS_MTX_QueueOverview` (isNarrow) | Mobile 390x844 | Canvas Artboard `mtx-queue-overview-narrow` |
| **MTX-QUEUE-UI-02** | `MTX-QUEUE-UI-02_Detail_1440x900` | `Ops Console.html` (`mtx-queue-detail`) / `mtx-operations-screens.jsx` | `OPS_MTX_QueueEntryDetail` | Desktop 1440x900 | Canvas Artboard `mtx-queue-detail` |
| **MTX-QUEUE-UI-03** | `MTX-QUEUE-UI-03_TaxiStandDenied_1440x900` | `Ops Console.html` (`mtx-queue-legal-denial`) / `mtx-operations-screens.jsx` | `OPS_MTX_LegalDenialState` | Desktop 1440x900 | [`MTX_queue_physical_rank_denied.png`](docs/05-ui/screenshots/MTX_queue_physical_rank_denied.png) |
| **P5-RATE-UI-01** | `P5-RATE-UI-01_Queue_1440x900` | `Platform Admin.html` (`p5-rating-queue`) / `mtx-operations-screens.jsx` | `PA_P5_RatingQueue` | Desktop 1440x900 | [`P5_rating_moderation.png`](docs/05-ui/screenshots/P5_rating_moderation.png) |
| **P5-RATE-UI-01_Narrow** | `P5-RATE-UI-01_Queue_Narrow_390x844` | `Platform Admin.html` (`p5-rating-queue-narrow`) / `mtx-operations-screens.jsx` | `PA_P5_RatingQueue` (isNarrow) | Mobile 390x844 | Canvas Artboard `p5-rating-queue-narrow` |
| **P5-RATE-UI-02** | `P5-RATE-UI-02_InvalidationConfirm_1280x800` | `Platform Admin.html` (`p5-rating-detail`) / `mtx-operations-screens.jsx` | `PA_P5_RatingDetail` | Desktop 1280x800 | Canvas Artboard `p5-rating-detail` |
| **P5-RATE-UI-03** | `P5-RATE-UI-03_Authority_1440x900` | `Platform Admin.html` (`p5-rating-authority`) / `mtx-operations-screens.jsx` | `PA_P5_DriverRatingAuthority` | Desktop 1440x900 | Canvas Artboard `p5-rating-authority` |
| **P5-COM-UI-01** | `P5-COM-UI-01_FareAnomaly_1440x900` | `Platform Admin.html` (`p5-fare-anomaly`) / `mtx-operations-screens.jsx` | `PA_P5_FareAnomalyQueue` | Desktop 1440x900 | [`P5_fare_anomaly.png`](docs/05-ui/screenshots/P5_fare_anomaly.png) |
| **P5-COM-UI-01_Narrow** | `P5-COM-UI-01_FareAnomaly_Narrow_390x844` | `Platform Admin.html` (`p5-fare-anomaly-narrow`) / `mtx-operations-screens.jsx` | `PA_P5_FareAnomalyQueue` (isNarrow) | Mobile 390x844 | Canvas Artboard `p5-fare-anomaly-narrow` |
| **P5-COM-UI-02** | `P5-COM-UI-02_PaymentException_1440x900` | `Platform Admin.html` (`p5-payment-exception`) / `mtx-operations-screens.jsx` | `PA_P5_PaymentExceptionDetail` | Desktop 1440x900 | [`P5_payment_exception.png`](docs/05-ui/screenshots/P5_payment_exception.png) |
| **P5-COM-UI-03** | `P5-COM-UI-03_CertificateSupport_1440x900` | `Platform Admin.html` (`p5-certificate`) / `mtx-operations-screens.jsx` | `PA_P5_CertificateSupport` | Desktop 1440x900 | Canvas Artboard `p5-certificate` |
| **P5-COM-UI-04** | `P5-COM-UI-04_RecordsQuery_1440x900` | `Platform Admin.html` (`p5-records-query`) / `mtx-operations-screens.jsx` | `PA_P5_RecordsQuery` | Desktop 1440x900 | Canvas Artboard `p5-records-query` |
| **P5-COM-UI-04_Narrow** | `P5-COM-UI-04_RecordsQuery_Narrow_390x844` | `Platform Admin.html` (`p5-records-query-narrow`) / `mtx-operations-screens.jsx` | `PA_P5_RecordsQuery` (isNarrow) | Mobile 390x844 | Canvas Artboard `p5-records-query-narrow` |
| **P5-COM-UI-05** | `P5-COM-UI-05_ControlledExport_1440x900` | `Platform Admin.html` (`p5-export-retention`) / `mtx-operations-screens.jsx` | `PA_P5_ExportRetention` | Desktop 1440x900 | [`P5_operational_record_export.png`](docs/05-ui/screenshots/P5_operational_record_export.png) |
| **P5-DISCLOSURE** | `P5_dispatch_disclosure_frame` | `p5-screens.jsx` | `P5_DispatchDisclosure` (and `P5_S03`) | Mobile 390x844 | [`P5_dispatch_disclosure.png`](docs/05-ui/screenshots/P5_dispatch_disclosure.png) |
| **S3-SOS** | `S3_sos_fullscreen_frame` | `driver-sos.jsx` / `ops-sos.jsx` | `S3_SOSFullscreen` (and `S3D_Home`, `S3O_Alert`) | Mobile 390x844 & Desktop 1440x900 | [`S3_sos_fullscreen.png`](docs/05-ui/screenshots/S3_sos_fullscreen.png) |

---

## 3. Clickable Prototype Flows (Interactive Navigation Matrix)

Interactive navigation links and prototype state transitions are fully enabled in `mtx-operations-screens.jsx`, `p5-screens.jsx`, `driver-sos.jsx`, and `ops-sos.jsx`.

### Flow A: Operating Authorization Management (`MTX-AUTH-UI-01` .. `06`)
1. **Registry -> Detail:** Clicking any row (e.g., `MTA-TP-2026-01`) in `PA_MTX_AuthRegistry` navigates to `PA_MTX_AuthDetail` (`MTX-AUTH-UI-02`).
2. **Registry -> Draft Editor:** Clicking `新增營運許可` button opens `PA_MTX_AuthDraftEditor` (`MTX-AUTH-UI-03`) modal.
3. **Draft Editor -> Confirm:** Submitting a draft opens `PA_MTX_AuthLifecycleConfirm` (`MTX-AUTH-UI-04`) with statutory compliance checklist.
4. **Detail -> Vehicles:** Clicking `車輛清單與動態維護` tab opens `PA_MTX_AuthVehicles` (`MTX-AUTH-UI-05`) with VIN/plate membership controls.
5. **Unauthorized Access:** Accessing a non-permitted tenant's authorization routes to `PA_MTX_AuthConflictState` (`MTX-AUTH-UI-06`, 403 Forbidden State).

### Flow B: Queue Semantics & Statutory Denial (`MTX-QUEUE-UI-01` .. `03`)
1. **Overview -> Detail:** Clicking an entry in `OPS_MTX_QueueOverview` (`MTX-QUEUE-UI-01`) opens `OPS_MTX_QueueEntryDetail` (`MTX-QUEUE-UI-02`).
2. **Overview -> Legal Denial Modal:** Filtering or clicking `denied_legal` entries triggers `OPS_MTX_LegalDenialState` (`MTX-QUEUE-UI-03`) displaying the non-bypassable Highway Law (汽車運輸業管理規則 §91) warning modal prohibiting physical rank / street hail queuing.

### Flow C: Rating Governance (`P5-RATE-UI-01` .. `03`)
1. **Queue -> Detail:** Clicking a flagged rating in `PA_P5_RatingQueue` (`P5-RATE-UI-01`) opens `PA_P5_RatingDetail` (`P5-RATE-UI-02`).
2. **Detail -> Invalidation Action:** Confirming rating invalidation marks rating status as `invalidated` without altering historical driver aggregate averages.
3. **Queue -> Authority Summary:** Clicking `駕駛評分權威總覽` opens `PA_P5_DriverRatingAuthority` (`P5-RATE-UI-03`) showing locked aggregate metrics.

### Flow D: Commerce & Retention (`P5-COM-UI-01` .. `05`)
1. **Fare Anomaly Queue (`P5-COM-UI-01`) -> Fail-Closed State:** Selecting an uncalculated rate order shows `quote_provider_unavailable` fail-closed warning with zero fallback quote.
2. **Payment Exception (`P5-COM-UI-02`) -> Manual Recovery:** Clicking `手動履約補償/沖銷` opens recovery workflow.
3. **Certificate Support (`P5-COM-UI-03`) -> Records Query (`P5-COM-UI-04`):** Link to search 730-day retention logs.
4. **Records Query -> Controlled Export (`P5-COM-UI-05`):** Submitting export request validates audit reason and checks active `Legal Hold` locks.

### Flow E: Passenger Dispatch Disclosure (`P5-DISCLOSURE`)
1. **Vehicle Assigned (`P5_S03` / `P5_DispatchDisclosure`):** Shows vehicle make/model, plate, year, doors, driver name, and statutory notice.
2. **Disclosure Unavailable (`P5_S11`):** Triggers fail-closed warning screen when statutory vehicle details are incomplete.

### Flow F: Emergency SOS Coordination (`S3-SOS`)
1. **Driver Press-and-Hold 2s (`S3D_Home` / `S3_SOSFullscreen`):** Triggers SOS progress indicator; releasing before 2s cancels.
2. **SOS Triggered (`S3D_Sending` -> `S3D_Submitted`):** Emits payload to duty operator.
3. **Duty Operator Alert Overlay (`S3O_Alert`):** High-priority red overlay with sound alert in `Ops Console.html`.
4. **Duty Operator Investigation (`S3O_Detail`) -> Resolution (`S3D_Resolved`):** Tracks incident timeline from alert to closeout.

---

## 4. Frozen Bilingual Copy Deck (`zh-TW` & `en-US`)

All UI screens enforce zero-variance bilingual text strings aligned with Highway Law (§91) and DRTS P5/S3 statutory specifications.

| Context / Key | Traditional Chinese (`zh-TW`) | English (`en-US`) | Statutory Basis / Rule |
| :--- | :--- | :--- | :--- |
| `ST_AUTH_LEGAL_NOTICE` | 依汽車運輸業管理規則第 91 條，多元化計程車營運以預約為限，不得巡迴攬客、排班候客。 | Pursuant to Highway Law §91, Multi-Taxi operations are strictly limited to pre-booked dispatch. Street hailing and rank queuing are prohibited. | 汽車運輸業管理規則 §91 (Non-negotiable legal binding) |
| `ST_QUEUE_DENIAL_TITLE` | 實體排班與巡迴攬客依法禁止 | Physical Rank & Street-Hail Queuing Legally Prohibited | Highway Law §91 (Non-bypassable modal title) |
| `ST_QUEUE_DENIAL_BODY` | 多元化計程車僅得接收系統預約派遣。排班招呼站僅供一般計程車使用。 | Multi-Taxis may only accept virtual system dispatch. Physical taxi stands are reserved exclusively for conventional yellow taxis. | Statutory queue mode enforcement |
| `ST_FARE_FAIL_CLOSED` | 車資計算暫時無法完成 (Fail-Closed) | Fare Calculation Unavailable (Fail-Closed) | P5 Commerce Rule: No arbitrary fallback price permitted |
| `ST_DISCLOSURE_UNAVAIL` | 派車資訊尚未完整，尚未完成指派 | Dispatch Information Incomplete; Assignment Pending | Statutory Vehicle Disclosure: Fail-closed before passenger pick-up |
| `ST_SOS_HOLD_PROMPT` | 請長按 2 秒啟動 SOS | Press and hold 2s to activate SOS | S3 Safety Rule: Prevents accidental tap triggers |
| `ST_LEGAL_HOLD_ACTIVE` | Legal Hold 生效中，滿 730 天亦不得銷毀 | Legal Hold Active: Purge blocked past 730 days | P5 Records Retention: Court order override |

---

## 5. Screen / State / Permission Matrix

| Screen ID | `empty` State | `loading` State | `normal` State | `conflict_403` State | `error_500` State | `fail_closed` State | Permitted Roles |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MTX-AUTH-UI-01** | 無許可紀錄 empty state | Skeleton table loader | Auth list & filters | PA_MTX_AuthConflictState | System error retry banner | N/A | `platform_admin` |
| **MTX-AUTH-UI-02** | N/A | Skeleton card loader | Approved detail & audit | PA_MTX_AuthConflictState | System error banner | N/A | `platform_admin`, `tenant_operator` |
| **MTX-AUTH-UI-03** | Empty form inputs | N/A | Draft input fields | 403 Forbidden modal | Form validation errors | N/A | `platform_admin` |
| **MTX-QUEUE-UI-01** | 無在列隊伍 | Skeleton queue list | Queue overview | 403 Permission denied | Queue sync error | N/A | `duty_operator`, `platform_admin` |
| **MTX-QUEUE-UI-03** | N/A | N/A | N/A | N/A | N/A | OPS_MTX_LegalDenialState (Non-bypassable modal) | `duty_operator`, `driver` |
| **P5-RATE-UI-01** | 無審查評價 | Skeleton rating queue | Rating queue list | 403 Permission denied | Moderation error | N/A | `platform_admin` |
| **P5-COM-UI-01** | 無異常車資 | Skeleton anomaly list | Anomaly queue list | 403 Permission denied | Provider error | Fail-Closed zero quote state | `platform_admin` |
| **P5-COM-UI-05** | 無調閱申請 | N/A | Export form & Legal Hold | 403 Permission denied | Export failed banner | N/A | `platform_admin` |
| **P5-DISCLOSURE** | N/A | Loader card | Vehicle & driver card | N/A | Disclosure error | P5_S11 (Disclosure unavailable) | `rider` |
| **S3-SOS** | N/A | Connection sync strip | S3D_Home / S3O_Alert | N/A | S3D_Offline (Local queue retry) | N/A | `driver`, `duty_operator` |

---

## 6. Accessibility (A11y) & Visual Token Specs

1. **Color Tokens & Realm Palette (@drts/ui-tokens):**
   - **Platform & Tenant Admin:** Teal `#0F766E` / `#5EEAD4`.
   - **Ops Console:** Indigo `#3730A3` / `#818CF8`.
   - **Driver App:** Amber `#D97706` / `#FCD34D`.
   - **Warning & Fail-Closed Alerts:** Coral `#DC2626` / `#FCA5A5`.
2. **Contrast & Text Sizes:** All body and header text exceeds WCAG 2.1 AA 4.5:1 contrast ratio.
3. **Keyboard & Screen Reader Support:**
   - Interactive modals (`AccessibleDialog`, `OPS_MTX_LegalDenialState`, `PA_MTX_AuthDraftEditor`) implement explicit Tab/Shift-Tab focus traps, initial focus placement, `role="dialog"`, `aria-modal="true"`, and `Escape` key handlers.
   - Non-bypassable legal denial modals (`preventBypass={true}`) explicitly disable backdrop click dismissal and `Escape` key closing, trapping keyboard focus until explicit user acknowledgment (`onAcknowledge` button) to guarantee Highway Law §91 compliance.

---

## 7. Developer Handoff Annotations

| Screen ID | Target Component | Source Status | Component Props | Key UI Field to API Schema Binding | Focus & Keyboard Traps |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MTX-AUTH-UI-01** | `PA_MTX_AuthRegistry` | `live-contract` | `theme`, `isNarrow`, `loading` | Table rows -> `GET /api/v1/mtx/authorizations` | Table row keyboard nav (`tabIndex=0`, enter/space opens detail), filter inputs focus |
| **MTX-AUTH-UI-02** | `PA_MTX_AuthDetail` | `live-contract` | `theme`, `authId`, `isNarrow` | Summary -> `GET /api/v1/mtx/authorizations/{id}` | Monospace ID copy control, accordion/tab keyboard focus |
| **MTX-AUTH-UI-03** | `PA_MTX_AuthDraftEditor` | `command-pending` | `theme`, `onClose`, `onSave`, `isNarrow` | Form -> `POST /api/v1/mtx/authorizations/draft` | Dialog focus trap, ESC closes modal, form error summary focus |
| **MTX-AUTH-UI-04** | `PA_MTX_AuthLifecycleConfirm` | `command-pending` | `theme`, `authId`, `actionType`, `onConfirm`, `onCancel`, `isNarrow` | Confirmation -> `POST /api/v1/mtx/authorizations/{id}/activate` | Focus trap on primary confirm button, statutory notice checklist |
| **MTX-AUTH-UI-05** | `PA_MTX_AuthVehicles` | `live-contract` | `theme`, `authId`, `isNarrow` | Vehicles -> `GET /api/v1/mtx/authorizations/{id}/vehicles` | Plate filter input focus ring, remove action confirmation modal |
| **MTX-AUTH-UI-06** | `PA_MTX_AuthConflictState` | `live-contract` | `theme`, `errorType`, `isNarrow` | Error -> `403 Forbidden / 409 Version Conflict` | `role="alert"` `aria-live="assertive"`, reload data button focus |
| **MTX-QUEUE-UI-01** | `OPS_MTX_QueueOverview` | `live-contract` | `theme`, `isNarrow` | Queue -> `GET /api/v1/mtx/queue/entries` | Filter dropdown keyboard nav, row click opens detail / denial modal |
| **MTX-QUEUE-UI-02** | `OPS_MTX_QueueEntryDetail` | `live-contract` | `theme`, `entryId`, `isNarrow` | Entry -> `GET /api/v1/mtx/queue/entries/{id}` | Status pill aria-label, detail card keyboard navigation |
| **MTX-QUEUE-UI-03** | `OPS_MTX_LegalDenialState` | `live-contract` | `theme`, `deniedEntry`, `onAcknowledge`, `isNarrow` | Warning -> `Highway Law §91 Compliance Gate` | Non-bypassable focus lock, ESC/backdrop disabled (`preventBypass`), space/enter acknowledges |
| **P5-RATE-UI-01** | `PA_P5_RatingQueue` | `live-contract` | `theme`, `isNarrow` | Moderation -> `GET /api/v1/p5/ratings/moderation-queue` | Queue action buttons focus ring, star rating aria-label |
| **P5-RATE-UI-02** | `PA_P5_RatingDetail` | `live-contract` | `theme`, `ratingId`, `onInvalidate`, `onMaintain`, `isNarrow` | Sections 1-7 -> `GET & POST /api/v1/p5/ratings/{id}/invalidate` | Focus trap on confirmation modal, reason select dropdown, aggregate rebuild notice |
| **P5-RATE-UI-03** | `PA_P5_DriverRatingAuthority` | `live-contract` | `theme`, `driverId`, `isNarrow` | Authority -> `GET /api/v1/p5/ratings/drivers/{id}/authority` | Displays `rated`, `new_driver`, `unavailable` states (no fake numbers) |
| **P5-COM-UI-01** | `PA_P5_FareAnomalyQueue` | `live-contract` | `theme`, `isNarrow` | Anomaly -> `GET /api/v1/p5/fare/anomalies` | Fail-closed alert banner `aria-live="assertive"`, triage button focus |
| **P5-COM-UI-02** | `PA_P5_PaymentExceptionDetail` | `live-contract` | `theme`, `paymentId`, `isNarrow` | Exception -> `GET /api/v1/p5/payments/{id}` | Card decline alert focus, manual recovery trigger |
| **P5-COM-UI-03** | `PA_P5_CertificateSupport` | `live-contract` | `theme`, `isNarrow` | Certificate -> `GET /api/v1/p5/certificates/{orderId}` | Search input keyboard trigger, download button focus |
| **P5-COM-UI-04** | `PA_P5_RecordsQuery` | `live-contract` | `theme`, `isNarrow` | Retention -> `GET /api/v1/p5/records/query` | Date range selector, export modal trigger focus trap |
| **P5-COM-UI-05** | `PA_P5_ExportRetention` | `live-contract` | `theme`, `isNarrow` | Export/Hold -> `POST /api/v1/p5/records/export` & `Legal Hold API` | Audit reason input focus ring, legal hold warning banner |
| **P5-DISCLOSURE** | `P5_DispatchDisclosure` | `live-contract` | `theme`, `disclosureData` | Disclosure -> `GET /api/v1/p5/dispatch/disclosure` | Screen reader `aria-live` announcements, fail-closed card |
| **S3-SOS** | `S3_SOSFullscreen` | `live-contract` | `theme`, `locState`, `onCancel`, `onTrigger` | Emergency -> `POST /api/v1/s3/sos/trigger` | 2s press-and-hold button `aria-label`, ESC disabled during active SOS |

---

## 8. Open Command & API Dependency List

| Command / API ID | Name & Scope | backing Status | Required Input Fields | Expected Outcome / Error Contract |
| :--- | :--- | :--- | :--- | :--- |
| `MTX_AUTH_QUERY` | Query Operating Authorizations | `live-contract` | `tenant_id`, `status_filter` | Returns list of authorizations with effective window |
| `MTX_AUTH_CREATE_DRAFT` | Create Authorization Draft | `command-pending` | `operator_name`, `service_areas`, `fare_version` | Returns new authorization draft in `draft` status |
| `MTX_QUEUE_ENTRY_QUERY` | Query Queue Entries & Modes | `live-contract` | `area_id`, `queue_mode` | Returns driver queue entries with statutory eligibility status |
| `P5_RATING_INVALIDATE` | Invalidate Passenger Rating | `live-contract` | `rating_id`, `invalidation_reason` | Updates rating status to `invalidated`; aggregate rating unmodified |
| `P5_FARE_CALCULATE` | Calculate Fare & Detect Anomaly | `live-contract` | `pickup_loc`, `dropoff_loc`, `fare_version` | Returns est fare or `quote_provider_unavailable` fail-closed error |
| `P5_RECORD_EXPORT` | Request Controlled Records Export | `live-contract` | `audit_reason`, `date_range` | Returns export job ID; blocked if Legal Hold applies to requested range |
| `S3_SOS_TRIGGER` | Emergency SOS Dispatch | `live-contract` | `driver_id`, `trip_id`, `gps_coords` | Broadcasts high-priority alert to duty operator overlay |

---

## 9. Required Screenshot Evidence Manifest (11 Files)

All 11 required PNG evidence files are tracked in git and placed under canonical paths:
- `docs/05-ui/screenshots/`
- `docs/05-ui/drts-design-canvas/screenshots/`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/screenshots/`

| File Name | Description | Key Statutory/Legal UI Features Demonstrated |
| :--- | :--- | :--- |
| `MTX_authorization_registry.png` | Fleet Operating Authorization Registry | MTX-AUTH-UI-01: Approval code, service area filter, status badge, effective window |
| `MTX_authorization_detail_approved.png` | Authorization Detail (Approved) | MTX-AUTH-UI-02: MTA-TP-2026-01 legal bindings, fare link, vehicle count, audit trail |
| `MTX_authorization_vehicle_membership.png` | Vehicle Membership Maintenance | MTX-AUTH-UI-05: Authorized vehicle VIN, plate, effective dates, hard membership gate |
| `MTX_queue_virtual_matching.png` | Queue Semantics & Matching | MTX-QUEUE-UI-01: Mode indicators (`virtual_matching`, `physical_rank`, `taxi_stand`) |
| `MTX_queue_physical_rank_denied.png` | Legal Non-Bypassable Denial | MTX-QUEUE-UI-03: Red highway law warning modal denying street-hail and rank queuing |
| `P5_rating_moderation.png` | Passenger Rating Governance Queue | P5-RATE-UI-01: Moderation queue for invalidation, flagged tags, review status |
| `P5_fare_anomaly.png` | Fare Estimation Anomaly Queue | P5-COM-UI-01: Fail-closed queue for uncalculated/missing rate orders |
| `P5_payment_exception.png` | Payment Exception Resolution | P5-COM-UI-02: PSP exception handling, payment attempt log, manual recovery flow |
| `P5_operational_record_export.png` | Controlled Export & Legal Hold | P5-COM-UI-05: 730-day retention query export approval, active legal hold locks |
| `P5_dispatch_disclosure.png` | Passenger Dispatch Disclosure | Statutory vehicle specs (Make/Model, Plate, Year, Doors, Driver Name, Reg status) |
| `S3_sos_fullscreen.png` | Fullscreen Emergency SOS | Standalone SOS modal, 2-sec press, 110/119/Fleet actions, GPS coordinates |

---

## 10. Design QA & Forbidden Content Scan Verification

- **Forbidden Terms Scan:** PASSED (0 occurrences of autonomous driving placeholders, external AV references, raw unmasked driver phone numbers, or unverified rating overrides).
- **Design Ready Flag:**
```text
designReadyForImplementation = true
```

---

## 11. Next Steps for Implementation Fleets

1. **Fleet B (Authorization UI):** Implement `PA_MTX_AuthRegistry`, `PA_MTX_AuthDetail`, `PA_MTX_AuthDraftEditor`, `PA_MTX_AuthLifecycleConfirm`, `PA_MTX_AuthVehicles`, and `PA_MTX_AuthConflictState`.
2. **Fleet C (Queue Semantics UI):** Implement `OPS_MTX_QueueOverview`, `OPS_MTX_QueueEntryDetail`, and `OPS_MTX_LegalDenialState`.
3. **Fleet D (Rating Governance UI):** Implement `PA_P5_RatingQueue`, `PA_P5_RatingDetail`, and `PA_P5_DriverRatingAuthority`.
4. **Fleet F (Commerce & Records Retention UI):** Implement `PA_P5_FareAnomalyQueue`, `PA_P5_PaymentExceptionDetail`, `PA_P5_CertificateSupport`, `PA_P5_RecordsQuery`, and `PA_P5_ExportRetention`.
