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

This document provides the canonical design handoff and evidence manifest for **Wave 0 Design Gates** (`MTX-DESIGN-WAVE0` / `P5-S3-DESIGN-QA-001`). All design components, interactive frames, token mappings, copy matrices, accessibility annotations, clickable prototypes, and required PNG evidence screenshots have been verified and placed in canonical repository paths.

Completion of this handoff officially unlocks the visual implementation tasks for downstream fleets:
- **Fleet B:** Operating Authorization (`MTX-AUTH-UI-001`)
- **Fleet C:** Queue Semantics (`MTX-QUEUE-003`)
- **Fleet D:** Rating Governance (`P5-RATE-003`)
- **Fleet F:** Commerce & Records Retention (`P5-COM-UI-01..05`)
- **Fleet H:** Design QA Handoff & Acceptance (`P5-S3-DESIGN-QA-001`)

---

## 2. Frame-to-Screen-ID Handoff Matrix

As specified in `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` (§19 & §22), all implementation fleets must bind to these exact Screen IDs and Frame Names.

| Screen ID | Canonical Frame Name | Design Canvas File & Artboard ID | React Component | Viewport / Format | Screenshot Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MTX-AUTH-UI-01** | `MTX-AUTH-UI-01_Registry_1440x900` | `Platform Admin.html` (`mtx-auth-registry`) | `PA_MTX_AuthRegistry` | Desktop 1440x900 | [`MTX_authorization_registry.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/MTX_authorization_registry.png) |
| **MTX-AUTH-UI-01_Narrow** | `MTX-AUTH-UI-01_Registry_Narrow_390x844` | `Platform Admin.html` (`mtx-auth-registry-narrow`) | `PA_MTX_AuthRegistry` (isNarrow) | Mobile 390x844 | Canvas Artboard `mtx-auth-registry-narrow` |
| **MTX-AUTH-UI-02** | `MTX-AUTH-UI-02_Detail_Approved_1440x900` | `Platform Admin.html` (`mtx-auth-detail`) | `PA_MTX_AuthDetail` | Desktop 1440x900 | [`MTX_authorization_detail_approved.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/MTX_authorization_detail_approved.png) |
| **MTX-AUTH-UI-03** | `MTX-AUTH-UI-03_Draft_Editor_1280x800` | `Platform Admin.html` (`mtx-auth-draft`) | `PA_MTX_AuthDraftEditor` | Desktop 1280x800 | Canvas Artboard `mtx-auth-draft` |
| **MTX-AUTH-UI-04** | `MTX-AUTH-UI-04_Lifecycle_Confirm_1440x900` | `Platform Admin.html` (`mtx-auth-confirm`) | `PA_MTX_AuthLifecycleConfirm` | Desktop 1440x900 | Canvas Artboard `mtx-auth-confirm` |
| **MTX-AUTH-UI-05** | `MTX-AUTH-UI-05_Vehicles_1440x900` | `Platform Admin.html` (`mtx-auth-vehicles`) | `PA_MTX_AuthVehicles` | Desktop 1440x900 | [`MTX_authorization_vehicle_membership.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/MTX_authorization_vehicle_membership.png) |
| **MTX-AUTH-UI-06** | `MTX-AUTH-UI-06_Conflict_403_1440x900` | `Platform Admin.html` (`mtx-auth-conflict`) | `PA_MTX_AuthConflictState` | Desktop 1440x900 | Canvas Artboard `mtx-auth-conflict` |
| **MTX-QUEUE-UI-01** | `MTX-QUEUE-UI-01_Overview_1440x900` | `Ops Console.html` (`mtx-queue-overview`) | `OPS_MTX_QueueOverview` | Desktop 1440x900 | [`MTX_queue_virtual_matching.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/MTX_queue_virtual_matching.png) |
| **MTX-QUEUE-UI-01_Narrow** | `MTX-QUEUE-UI-01_Overview_Narrow_390x844` | `Ops Console.html` (`mtx-queue-overview-narrow`) | `OPS_MTX_QueueOverview` (isNarrow) | Mobile 390x844 | Canvas Artboard `mtx-queue-overview-narrow` |
| **MTX-QUEUE-UI-02** | `MTX-QUEUE-UI-02_Detail_1440x900` | `Ops Console.html` (`mtx-queue-detail`) | `OPS_MTX_QueueEntryDetail` | Desktop 1440x900 | Canvas Artboard `mtx-queue-detail` |
| **MTX-QUEUE-UI-03** | `MTX-QUEUE-UI-03_TaxiStandDenied_1440x900` | `Ops Console.html` (`mtx-queue-legal-denial`) | `OPS_MTX_LegalDenialState` | Desktop 1440x900 | [`MTX_queue_physical_rank_denied.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/MTX_queue_physical_rank_denied.png) |
| **P5-RATE-UI-01** | `P5-RATE-UI-01_Queue_1440x900` | `Platform Admin.html` (`p5-rating-queue`) | `PA_P5_RatingQueue` | Desktop 1440x900 | [`P5_rating_moderation.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/P5_rating_moderation.png) |
| **P5-RATE-UI-01_Narrow** | `P5-RATE-UI-01_Queue_Narrow_390x844` | `Platform Admin.html` (`p5-rating-queue-narrow`) | `PA_P5_RatingQueue` (isNarrow) | Mobile 390x844 | Canvas Artboard `p5-rating-queue-narrow` |
| **P5-RATE-UI-02** | `P5-RATE-UI-02_InvalidationConfirm_1280x800` | `Platform Admin.html` (`p5-rating-detail`) | `PA_P5_RatingDetail` | Desktop 1280x800 | Canvas Artboard `p5-rating-detail` |
| **P5-RATE-UI-03** | `P5-RATE-UI-03_Authority_1440x900` | `Platform Admin.html` (`p5-rating-authority`) | `PA_P5_DriverRatingAuthority` | Desktop 1440x900 | Canvas Artboard `p5-rating-authority` |
| **P5-COM-UI-01** | `P5-COM-UI-01_FareAnomaly_1440x900` | `Platform Admin.html` (`p5-fare-anomaly`) | `PA_P5_FareAnomalyQueue` | Desktop 1440x900 | [`P5_fare_anomaly.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/P5_fare_anomaly.png) |
| **P5-COM-UI-01_Narrow** | `P5-COM-UI-01_FareAnomaly_Narrow_390x844` | `Platform Admin.html` (`p5-fare-anomaly-narrow`) | `PA_P5_FareAnomalyQueue` (isNarrow) | Mobile 390x844 | Canvas Artboard `p5-fare-anomaly-narrow` |
| **P5-COM-UI-02** | `P5-COM-UI-02_PaymentException_1440x900` | `Platform Admin.html` (`p5-payment-exception`) | `PA_P5_PaymentExceptionDetail` | Desktop 1440x900 | [`P5_payment_exception.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/P5_payment_exception.png) |
| **P5-COM-UI-03** | `P5-COM-UI-03_CertificateSupport_1440x900` | `Platform Admin.html` (`p5-certificate`) | `PA_P5_CertificateSupport` | Desktop 1440x900 | Canvas Artboard `p5-certificate` |
| **P5-COM-UI-04** | `P5-COM-UI-04_RecordsQuery_1440x900` | `Platform Admin.html` (`p5-records-query`) | `PA_P5_RecordsQuery` | Desktop 1440x900 | Canvas Artboard `p5-records-query` |
| **P5-COM-UI-04_Narrow** | `P5-COM-UI-04_RecordsQuery_Narrow_390x844` | `Platform Admin.html` (`p5-records-query-narrow`) | `PA_P5_RecordsQuery` (isNarrow) | Mobile 390x844 | Canvas Artboard `p5-records-query-narrow` |
| **P5-COM-UI-05** | `P5-COM-UI-05_ControlledExport_1440x900` | `Platform Admin.html` (`p5-export-retention`) | `PA_P5_ExportRetention` | Desktop 1440x900 | [`P5_operational_record_export.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/P5_operational_record_export.png) |
| **P5-DISCLOSURE** | `P5_dispatch_disclosure_frame` | `p5-screens.jsx` | `P5_DispatchDisclosure` | Mobile 390x844 | [`P5_dispatch_disclosure.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/P5_dispatch_disclosure.png) |
| **S3-SOS** | `S3_sos_fullscreen_frame` | `p5-screens.jsx` / `ops-sos.jsx` | `S3_SOSFullscreen` | Mobile 390x844 | [`S3_sos_fullscreen.png`](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-design-wave0/docs/05-ui/screenshots/S3_sos_fullscreen.png) |

---

## 3. Required Screenshot Evidence Manifest (11 Files)

All 11 required PNG evidence files are tracked in git and placed under canonical paths:
- `docs/05-ui/screenshots/`
- `docs/05-ui/drts-design-canvas/screenshots/`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/screenshots/`

### Screenshots Overview

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

## 4. Visual Design Tokens & Realm Palette Alignment

As mandated by the canonical UI Design Contract:
- **No Raw Hex Palettes:** All components in `mtx-operations-screens.jsx`, `p5-screens.jsx`, `Platform Admin.html`, `Ops Console.html` strictly reference `@drts/ui-tokens` realm color tokens.
- **Tenant & Platform Admin Realm:** Teal `#0F766E` / `#5EEAD4`.
- **Ops Console Realm:** Indigo `#3730A3` / `#818CF8`.
- **Driver App Realm:** Amber `#D97706` / `#FCD34D`.
- **Warning & Fail-Closed Alerts:** Coral `#DC2626` / `#FCA5A5`.

---

## 5. Accessibility (A11y) & Localization (i18n) Annotations

1. **Contrast & Hierarchy:** All text-to-background contrast ratios exceed **4.5:1** (WCAG AA).
2. **Keyboard Navigation & ARIA:**
   - Modals incorporate focus trap, `role="dialog"`, `aria-modal="true"`, and `Escape` key handlers.
   - Non-bypassable legal denial warnings require explicit acknowledgment before focus returns to underlying queue lists.
3. **Frozen Copy Deck:**
   - Dual-language Traditional Chinese (`zh-TW`) and English (`en-US`) copy strings are frozen in `mtx-operations-screens.jsx` and `p5-screens.jsx`.
   - Statutory terms ("預約為限", "不得巡迴攬客", "不得排班候客", "計算基準") are enforced with zero permitted variance.

---

## 6. Design QA & Forbidden Content Scan Verification

- **Forbidden Terms Scan:** PASSED (0 occurrences of autonomous driving placeholders, external AV references, raw driver phone numbers, or unverified rating overrides).
- **Design Ready Flag:**
```text
designReadyForImplementation = true
```

---

## 7. Next Steps for Implementation Fleets

1. **Fleet B (Authorization UI):** Implement `PA_MTX_AuthRegistry`, `PA_MTX_AuthDetail`, `PA_MTX_AuthDraftEditor`, `PA_MTX_AuthLifecycleConfirm`, `PA_MTX_AuthVehicles`, and `PA_MTX_AuthConflictState`.
2. **Fleet C (Queue Semantics UI):** Implement `OPS_MTX_QueueOverview`, `OPS_MTX_QueueEntryDetail`, and `OPS_MTX_LegalDenialState`.
3. **Fleet D (Rating Governance UI):** Implement `PA_P5_RatingQueue`, `PA_P5_RatingDetail`, and `PA_P5_DriverRatingAuthority`.
4. **Fleet F (Commerce & Records Retention UI):** Implement `PA_P5_FareAnomalyQueue`, `PA_P5_PaymentExceptionDetail`, `PA_P5_CertificateSupport`, `PA_P5_RecordsQuery`, and `PA_P5_ExportRetention`.
