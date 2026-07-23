# P5-DESIGN-002 Design Handoff Packet
**Fare, Payment, Receipt, and Retention Operations**

**Task ID:** `P5-DESIGN-002`  
**Owner:** Product Design / Platform Admin and Passenger Design  
**Blocks:** Operational UI portions of `P5-FARE-ANOM-001`, `P5-PAY-001`, `P5-RCT-001`, and `P5-RET-003`  
**Requirement Source:** `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §9, §10  
**Canvas Component:** `docs/05-ui/drts-design-canvas/mtx-operations-screens.jsx` (`PA_P5_FareAnomalyQueue`, `PA_P5_PaymentExceptionDetail`, `PA_P5_CertificateSupport`, `PA_P5_RecordsQuery`, `PA_P5_ExportRetention`)

---

## 1. Screen Inventory

| Screen ID | Screen Name | Canvas Component | Viewport Artboards | Purpose |
| --------- | ----------- | ---------------- | ------------------ | ------- |
| `P5-COM-UI-01` | Fare Anomaly Queue / Detail | `PA_P5_FareAnomalyQueue` | Desktop 1440px + Narrow 390px (`p5-fare-anomaly-narrow`) | Triage fail-closed quote anomalies and route resolution failures |
| `P5-COM-UI-02` | Payment Exception Detail | `PA_P5_PaymentExceptionDetail` | Desktop 1440px + Narrow 390px (`p5-payment-exception-narrow`) | Explain failed, manual-recovery, or reversed payment states |
| `P5-COM-UI-03` | Certificate Support | `PA_P5_CertificateSupport` | Desktop 1440px | Locate, preview, and download electronic ride certificates |
| `P5-COM-UI-04` | Operational Record Query | `PA_P5_RecordsQuery` | Desktop 1440px + Narrow 390px (`p5-records-query-narrow`) | Query 730-day (2-year) complete operational ride records |
| `P5-COM-UI-05` | Controlled Export / Retention | `PA_P5_ExportRetention` | Desktop 1440px Modal | Create controlled exports and manage Legal Hold retention freezes |

---

## 1.5 Editable Figma Source & Component Spec

- **Figma Source Structure:** `docs/05-ui/drts-design-canvas/figma-source-tree.json` (`05_P5_Fare_Payment`, `06_P5_Records_Retention`).
- **Figma Pages & Component Variants:**
  - Page `05_P5_Fare_Payment`: `P5-COM-UI-01_FareAnomaly_1440x900`, `P5-COM-UI-01_FareAnomaly_Narrow_390x844`, `P5-COM-UI-02_PaymentException_1440x900`, `P5-COM-UI-02_PaymentException_Narrow_390x844`, `P5-COM-UI-03_CertificateSupport_1440x900`.
  - Page `06_P5_Records_Retention`: `P5-COM-UI-04_RecordsQuery_1440x900`, `P5-COM-UI-04_RecordsQuery_Narrow_390x844`, `P5-COM-UI-05_ControlledExport_1440x900`.
  - Component Tokens: Bound to `@drts/ui-tokens` (Platform & Commerce realm).

---

## 2. Complete State Matrix

| State Name | Visual Presentation | Behavior & Constraints |
| ---------- | ------------------- | ---------------------- |
| **Fare Anomaly: Quote Unavailable** | Red banner (`quote_provider_unavailable` / 暫時無法取得預估車資) | Fail-closed state; booking blocked; no manual quote override permitted |
| **Fare Anomaly: Out of Range** | Red banner (`quote_out_of_range` / 預估車資超出可接受範圍) | High-fare discrepancy flagged for triage |
| **Payment: Captured** | Green badge (`captured` / 已完成) | Successful payment settlement |
| **Payment: Failed** | Red badge (`failed` / 付款失敗) | **NEVER** present failed payment as paid or hide PSP error details |
| **Payment: Manual Recovery** | Yellow badge (`manual_recovery` / 人工處理中) | Requires explicit operational review |
| **Certificate: Available** | Green pill (`available`) + Download PDF button | Valid electronic ride certificate ready for download |
| **Record Retention** | 730-day floor label + `retainUntil` date | Minimum 730-day retention floor mandatory for all completed trips |
| **Legal Hold** | Red lock pill (`held` / 法律凍結中) | Prevents purge even after 730 days until legal release |

---

## 3. Frozen Chinese Error & Status Copy

- `quote_provider_unavailable`: 暫時無法取得預估車資
- `quote_out_of_range`: 預估車資超出可接受範圍
- `route_unresolved`: 尚無法確認預估路線
- `fare_policy_missing`: 目前沒有可用的生效費率
- `calculation_mismatch`: 車資計算結果需要重新確認
- `captured`: 已完成
- `failed`: 付款失敗
- `manual_recovery`: 人工處理中
- `held`: 法律凍結中 (Legal Hold)

---

## 4. Accessibility (a11y) Annotations

- Fail-closed quote anomaly alerts use `role="alert"` and `aria-live="assertive"`.
- Controlled export modal explicitly states data sensitivity and requires a typed audit purpose.
- Legal hold indicators use lock iconography combined with clear text status.

---

## 5. Prototype Interaction Flow

1. Admin opens `/p5-fare-anomalies` (`P5-COM-UI-01`) to triage fail-closed quote issues.
2. Navigates to `/payments` (`P5-COM-UI-02`) to inspect PSP decline reason (`Card Declined`).
3. Support agent opens `/p5-certificate-support` (`P5-COM-UI-03`), searches by order ID `ZX-240720-0186`, and downloads official PDF certificate.
4. Auditor opens `/multi-taxi-records` (`P5-COM-UI-04` / `05`), previews query scope (1,420 records), enters audit purpose `2026 Q3 交通局定期抽查`, and triggers audited controlled export.

---

## 6. Developer & API Handoff Map

- **Realm Theme:** Platform & Commerce Realm (`@drts/ui-tokens`).
- **Required Capabilities:**
  - `fare_publication:manage`
  - `multi_taxi_records:read`
  - `multi_taxi_records:export`
- **API Seams:**
  - `GET /api/v1/p5-fares/anomalies`
  - `GET /api/v1/payments/exceptions`
  - `GET /api/v1/p5-certificates/{orderId}`
  - `GET /api/v1/multi-taxi-records`
  - `POST /api/v1/multi-taxi-records/export`
---

## 7. §19 Per-Frame Annotations Evidence Matrix

| Frame Name | Screen ID | Viewport | User Capability | Data State | Source Status | Component Variants | Focus Order | API & Field Mapping | Empty / Error / Conflict Behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `P5-COM-UI-01_FareAnomaly_1440x900` | `P5-COM-UI-01` | Desktop (1440x900) | `fare_publication:manage` | `Fare Anomaly Fail-Closed` | `live-contract` | `AdminShell`, `FareAnomalyFailClosedTable`, `FareAnomalyBanner` | 1. Anomaly Reason Filter -> 2. Order/Trip Search -> 3. Anomaly Table Rows -> 4. Detail Drawer -> 5. Retry Action Button | `GET /api/v1/p5-fares/anomalies` -> `quote_provider_unavailable`, `quote_out_of_range`, `route_unresolved`, `fare_policy_missing` | Fail-closed triage view. High-fare discrepancies & missing quote providers block booking. No manual override field. |
| `P5-COM-UI-01_FareAnomaly_Narrow_390x844` | `P5-COM-UI-01_Narrow` | Narrow Mobile (390x844) | `fare_publication:manage` | `Fare Anomaly Mobile` | `live-contract` | `MobileShell`, `FareAnomalyCardList`, `FareAnomalyBanner` | 1. Mobile Filter Toggle -> 2. Anomaly Card List -> 3. Detail Action Trigger | `GET /api/v1/p5-fares/anomalies` -> mobile anomaly card projection | Stacked mobile card layout; human error copy presented clearly without raw internal error codes. |
| `P5-COM-UI-02_PaymentException_1440x900` | `P5-COM-UI-02` | Desktop (1440x900) | `multi_taxi_records:read` | `Payment Exception Failed` | `live-contract` | `AdminShell`, `PaymentExceptionDetailCard`, `PaymentStatusChip` | 1. Payment Status Filter -> 2. Exception Table -> 3. Exception Detail Card -> 4. PSP Recovery Command | `GET /api/v1/payments/exceptions` -> `not_selected`, `authorized`, `captured`, `failed`, `refunded`, `manual_recovery` | Displays explicit payment failure reason (Card Declined). NEVER presents failed or manual-recovery states as paid. |
| `P5-COM-UI-02_PaymentException_Narrow_390x844` | `P5-COM-UI-02_Narrow` | Narrow Mobile (390x844) | `multi_taxi_records:read` | `Payment Exception Mobile` | `live-contract` | `MobileShell`, `PaymentExceptionCard_Compact`, `PaymentStatusChip` | 1. Status Filter Drawer -> 2. Payment Exception Mobile Cards -> 3. Card Action Trigger | `GET /api/v1/payments/exceptions` -> mobile payment card projection | Compact responsive card stack with distinct failure badges. |
| `P5-COM-UI-03_CertificateSupport_1440x900` | `P5-COM-UI-03` | Desktop (1440x900) | `multi_taxi_records:read` | `Certificate Available` | `live-contract` | `AdminShell`, `CertificateSearchCard`, `PdfDownloadButton` | 1. Order ID Search Input -> 2. Search Button -> 3. Certificate Preview Card -> 4. Download PDF Action Button | `GET /api/v1/p5-certificates/{orderId}` -> `certificateId`, `plateNo`, `pickupAt`, `dropoffAt`, `fareMinor`, `issuedAt` | If generating: skeletal loading state. If unavailable or invalid token: clear error alert banner. |
| `P5-COM-UI-04_RecordsQuery_1440x900` | `P5-COM-UI-04` | Desktop (1440x900) | `multi_taxi_records:read` | `Records Query 730-day` | `live-contract` | `AdminShell`, `OperationalRecordsTable`, `RetentionFloorBanner`, `LegalHoldBadge` | 1. Date Range Picker -> 2. Vehicle/Plate Search -> 3. Retention Filter -> 4. Records Table -> 5. Export Action Button | `GET /api/v1/multi-taxi-records` -> `orderId`, `plateNo`, `reservedAt`, `pickupAt`, `dropoffAt`, `payableFare`, `retainUntil` | Displays mandatory 730-day retention floor notice banner. Missing pickup/dropoff shows 未取得 or 未完成, not 0. |
| `P5-COM-UI-04_RecordsQuery_Narrow_390x844` | `P5-COM-UI-04_Narrow` | Narrow Mobile (390x844) | `multi_taxi_records:read` | `Records Query Mobile` | `live-contract` | `MobileShell`, `RecordsCardList`, `RetentionFloorBanner` | 1. Mobile Filter Toggle -> 2. Record Mobile Cards -> 3. Card Expand Action | `GET /api/v1/multi-taxi-records` -> mobile record card projection | Touch-optimised mobile list card layout; responsive at 200% zoom. |
| `P5-COM-UI-05_ControlledExport_1440x900` | `P5-COM-UI-05` | Desktop (1440x900) | `multi_taxi_records:export` | `Controlled Export Modal` | `live-contract` | `AdminShell`, `ControlledExportModal`, `LegalHoldBadge` | 1. Export Modal Container (Focus trapped) -> 2. Scope & Count Summary -> 3. Audit Purpose Input -> 4. Cancel -> 5. Create Export Job Button | `POST /api/v1/multi-taxi-records/export` -> `jobId`, `recordCount`, `purpose`, `auditActor` | Requires typed audit purpose before job creation. Browser-side raw export prohibited. Legal Hold badge freezes purge. |
