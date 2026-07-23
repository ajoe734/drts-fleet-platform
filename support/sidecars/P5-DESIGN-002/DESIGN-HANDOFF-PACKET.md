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
