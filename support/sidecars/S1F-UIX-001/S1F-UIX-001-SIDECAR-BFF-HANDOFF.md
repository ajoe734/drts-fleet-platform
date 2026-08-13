# S1F-UIX-001-SIDECAR-BFF-HANDOFF

- Task ID: `S1F-UIX-001-SIDECAR-BFF-HANDOFF`
- Parent Task: `S1F-UIX-001` (Release-blocking cross-surface operational browser suite)
- Helper Kind: `bff_handoff_packet`
- Owner: `Gemini2`
- Reviewer: `Codex`
- Date: `2026-08-13`
- Status: `in_progress` -> Ready for Review Handoff

---

## 1. Executive Summary & Purpose

This sidecar handoff packet consolidates the **BFF Query Gap Analysis**, **Operator Journey Specifications**, and **Frontend Handoff Materials** to support `S1F-UIX-001` (the Stage 1 release-blocking cross-surface operational browser acceptance suite).

In accordance with repo guardrails:
- This is a **sidecar support document** (`support/sidecars/S1F-UIX-001/S1F-UIX-001-SIDECAR-BFF-HANDOFF.md`).
- It does **NOT mutate L1 canonical truth** or core business contract definitions.
- It prepares the frontend and BFF integration surfaces across all seven (7) upstream dependencies (`S1F-REF-002`, `S1F-ENT-002`, `S1F-FLT-003`, `S1F-ADM-001`, `S1F-ADM-002`, `S1F-BANK-002`, `S1F-CHAN-001`) plus `S1F-REL-001-PREDEPLOY` so that `S1F-UIX-001` can deterministically verify full end-to-end operational browser journeys against a deployed candidate SHA.

---

## 2. Dependency Handoff Matrix & Completion Gates

`S1F-UIX-001` verifies that real business operations succeed end-to-end across active web surfaces while verifying that stopped surfaces return 404.

### 2.1 Dependency Overview

| Dependency Task | Surface / Scope | Primary BFF / API Boundaries | Key Handoff Objective |
| :--- | :--- | :--- | :--- |
| `S1F-REF-002` | `referral-embed-web` | `apps/referral-embed-web/app/api/referral/*` | Connect controlled booking form, active trip resume, history, cancel, rating, and receipt to live BFF endpoints (`yuhe-residence`). |
| `S1F-ENT-002` | `enterprise-dispatch-web` | `apps/enterprise-dispatch-web/app/bookings/new/` | Replace static inputs with real semantic controls; submit live draft commands; CRUD-C list/detail/edit/cancel lifecycle. |
| `S1F-FLT-003` | `fleet-partner-portal-web` | `apps/fleet-partner-portal-web/lib/api-client.server.ts` | Wire dynamic period fees, supply onboarding submit/withdraw, statement download/confirm/dispute, and document/case actions. |
| `S1F-ADM-001` | `platform-admin-web` | `apps/platform-admin-web/app/supply-review/` | Build supply review queue & detail; execute start review, revision, approval (canonical registry provisioning), and rejection. |
| `S1F-ADM-002` | `platform-admin-web` | `apps/platform-admin-web/` operational pages | Remove false route-local fixture fallbacks; render truthful loading/empty/forbidden/degraded states; disable unwired alert buttons. |
| `S1F-BANK-002` | `bank-console-web` | `apps/bank-console-web/lib/*-data.ts` | Connect current-period live read models; enable non-fixture statement download; enforce role export capability and PII masking. |
| `S1F-CHAN-001` | `channel-partner-portal-web` | `apps/channel-partner-portal-web/lib/referral-bootstrap-identity.ts` | Inject formal Yuhe identity env vars (`yuhe-residence`); reconcile Referral booking usage/statement in Channel Portal. |
| `S1F-REL-001-PREDEPLOY` | E2E Acceptance Harness | `scripts/run-operational-browser-acceptance.sh` | Validate exact candidate SHA (`x-drts-candidate-sha`); assert control annotations; enforce strict HTTP 404 on frozen surfaces. |

### 2.2 Functional Completion Gates (G1 – G8 Alignment)

1. **G1 Active Data Truth**: No active surface renders plausible static sample data when backend APIs are healthy.
2. **G2 Action Truth**: Every enabled control executes a valid request/navigation and renders explicit result or error states.
3. **G3 Lifecycle Truth**: Operations (create, edit, cancel, submit, approve) persist and survive browser refresh/API readback.
4. **G4 Cross-Surface Truth**: Referral bookings and Fleet supply approvals created in one surface immediately appear in downstream scoped surfaces (Channel Portal, Platform Registry).
5. **G5 Native Truth**: Android emulator replay validates driver task lifecycle and SOS on candidate SHA.
6. **G6 Runtime Truth**: All active services pass `/healthz` and operational journeys on the exact deployed candidate SHA.
7. **G7 Frozen Surfaces**: Paused `/ctbc/program/*` (Partner Booking) and retired Concierge Portal return HTTP 404.
8. **G8 Regression Truth**: Existing unit, integration, API E2E (22/22), and route smoke (39/39) remain 100% green.

---

## 3. BFF Query Gap Analysis & Surface Resolution

### 3.1 Gap Analysis Summary

| Surface | Static / Fixture Gap | Live BFF Resolution | Target Handoff Contract |
| :--- | :--- | :--- | :--- |
| **Referral Embed** | Static `embedTrip` / `embedResident` fixtures; form submit only toggles query string (`?screen=trip`). | Route supplies `liveData`; BFF routes (`POST /api/referral/booking`, `POST /api/referral/cancel`, `POST /api/referral/rating`) handle mutations. | Form binds inputs; refresh restores active booking from `liveData`; cancel/rating issue real HTTP requests and return readback state. |
| **Enterprise Dispatch** | Inputs were non-form `div`s (`EInput`); submit POSTed static `getEnterpriseBookingCommandFixture()`. | Form binds to React state; address/passenger/cost-centre loaded from scoped BFF endpoints; POSTs real draft payload. | Full CRUD-C journey: form edit -> submit -> history list -> detail readback -> edit -> cancel. |
| **Fleet Partner Portal** | Defaulted to hardcoded `flp_002` (404 in Dev) and fixed period `2026-06`; actions used un-wired `CanvasActionButton`. | Injects valid Dev partner `fleet-demo-001`; derives active period dynamically; maps statement confirm/dispute & document actions. | Supply onboarding UI (create/upload/submit/withdraw); statement confirm/dispute API execution; unwired actions marked `data-drt-non-operational`. |
| **Platform Admin** | Lacked `/supply-review` routes; partner detail substituted route-local fixtures on API error; buttons alert()'d unwired endpoints. | Implement `/supply-review` queue & detail; execute backend supply review machine; render explicit error boundaries on API failure. | Supply review approval provisions canonical registry; revision request notifies fleet; unwired buttons disabled with explicit reasons. |
| **Bank Console** | Hardcoded June 2026 static arrays (`home-data.ts`, `statements.ts`); no live API read or download. | Connects to scoped server-side Dev API client; derives current period; statement export returns generated artifact stream. | Dynamic period read models; statement download returns non-fixture CSV/PDF artifact; unauthorized role exports blocked. |
| **Channel Partner Portal** | Identity defaulted to demo `partner-referral-demo-001` / `referral-demo-community`. | Injects `DRTS_PARTNER_ID`, `DRTS_TENANT_ID`, `DRTS_PARTNER_PROGRAM_ID`, `DRTS_PARTNER_ENTRY_SLUG` (`yuhe-residence`). | Bookings created at `/embed/yuhe-residence` immediately reconcile under Yuhe usage and settlement read models. |

---

## 4. Detailed Operator Journeys & BFF Integration Specifications

### 4.1 Referral Embed Operator Journey (`S1F-REF-002`)

- **Primary URL**: `/embed/yuhe-residence`
- **Actor Scope**: Passenger / Resident (`yuhe-residence`)
- **Key Operator Steps**:
  1. **Form Entry & Booking Creation**:
     - User selects pickup point, dropoff destination, and vehicle option from live partner-scoped options.
     - Submits form -> `POST /api/referral/booking`.
     - Readback: Booking ID created (e.g. `ref-bk-100293`), status `REQUESTED` or `DISPATCHING`.
     - Control attribute: `data-drt-operation="referral-create-booking"`.
  2. **Active Trip Resume & Refresh**:
     - Browser refresh on `/embed/yuhe-residence?bookingId=ref-bk-100293`.
     - Component consumes `liveData` from route loader instead of `embedTrip` fixture.
     - Asserts matching booking ID, driver status, and ETA.
  3. **Trip Cancellation**:
     - User clicks "Cancel Booking" -> `POST /api/referral/cancel` with `{ bookingId, reason: "CHANGE_OF_PLANS" }`.
     - Readback: Status transitions to `CANCELLED`.
     - Control attribute: `data-drt-operation="referral-cancel-trip"`.
  4. **Trip Rating & Receipt**:
     - For completed trips, user submits 5-star rating -> `POST /api/referral/rating`.
     - User views receipt details -> reads back itemized fare breakdown from live BFF.
     - Control attribute: `data-drt-operation="referral-submit-rating"`.

---

### 4.2 Enterprise Dispatch Operator Journey (`S1F-ENT-002`)

- **Primary URL**: `/bookings/new`, `/bookings`
- **Actor Scope**: Enterprise Dispatcher / Corporate Admin
- **Key Operator Steps**:
  1. **Drafting Enterprise Booking**:
     - Dispatcher opens `/bookings/new`, selects employee/passenger, pickup/dropoff address, cost center, and booking time.
     - Policy & quota engine previews approval rules (`policyDecision: APPROVED`, `quotaRemaining: 48`).
  2. **Submitting Live Booking Command**:
     - Dispatcher clicks "Submit Dispatch" -> `POST /api/enterprise/bookings`.
     - Payload contains live form fields (no fixture fallback).
     - Response returns `enterpriseBookingId` (e.g., `ent-bk-88301`).
     - Control attribute: `data-drt-operation="ent-create-booking"`.
  3. **Readback & Modification**:
     - Navigates to `/bookings/ent-bk-88301`.
     - Reads back persisted fields (passenger name, cost center, pickup time).
     - Dispatcher updates pickup time -> `PATCH /api/enterprise/bookings/ent-bk-88301`.
     - Control attribute: `data-drt-operation="ent-update-booking"`.
  4. **Cancellation**:
     - Dispatcher cancels booking -> `POST /api/enterprise/bookings/ent-bk-88301/cancel`.
     - Control attribute: `data-drt-operation="ent-cancel-booking"`.

---

### 4.3 Fleet Partner Supply & Operational Actions (`S1F-FLT-003`)

- **Primary URL**: `/supply`, `/statements`
- **Actor Scope**: Fleet Partner Operator (`fleet-demo-001`)
- **Key Operator Steps**:
  1. **Supply Onboarding Submission**:
     - Fleet user opens `/supply`, clicks "Add Driver" / "Add Vehicle".
     - Uploads required license document -> `POST /api/fleet/documents/upload-intent` -> confirms upload.
     - Submits onboarding package -> `POST /api/fleet/supply-submissions`.
     - Submission ID returned (e.g., `sub-flt-9012`). Status: `PENDING_REVIEW`.
     - Control attribute: `data-drt-operation="fleet-submit-supply"`.
  2. **Withdraw / Revision Resubmit**:
     - User clicks "Withdraw Submission" -> `POST /api/fleet/supply-submissions/sub-flt-9012/withdraw`.
     - Updates document and resubmits -> `POST /api/fleet/supply-submissions/sub-flt-9012/resubmit`.
     - Control attribute: `data-drt-operation="fleet-resubmit-supply"`.
  3. **Statement Confirm & Dispute**:
     - User navigates to `/statements` (current period derived dynamically, e.g., `2026-08`).
     - Downloads statement PDF/CSV -> `GET /api/fleet/statements/2026-08/download`.
     - Confirms statement -> `POST /api/fleet/statements/2026-08/confirm`.
     - Control attribute: `data-drt-operation="fleet-statement-confirm"`.
  4. **Inert Control Annotations**:
     - Controls for unsupported Stage 1.5 actions (e.g. "Trigger Driver Re-training") are disabled and annotated:
       `data-drt-non-operational="true"`
       `data-drt-non-operational-reason="Action scheduled for Stage 1.5 compliance wave"`.

---

### 4.4 Platform Admin Supply Review Journey (`S1F-ADM-001`)

- **Primary URL**: `/supply-review`, `/supply-review/[submissionId]`
- **Actor Scope**: Platform Administrator / Compliance Officer
- **Key Operator Steps**:
  1. **Review Queue Navigation**:
     - Admin opens `/supply-review`, views pending submissions list (`sub-flt-9012`).
  2. **Detail Inspection & Review Start**:
     - Admin opens `/supply-review/sub-flt-9012`.
     - Clicks "Start Review" -> `POST /api/admin/supply-review/sub-flt-9012/start-review`.
     - Status updates to `IN_REVIEW`.
     - Control attribute: `data-drt-operation="admin-start-supply-review"`.
  3. **Approval & Canonical Provisioning**:
     - Admin inspects uploaded vehicle registration and driver license documents.
     - Clicks "Approve Supply" -> `POST /api/admin/supply-review/sub-flt-9012/approve` with `{ note: "Documents verified" }`.
     - Response confirms canonical fleet registry provisioning (`driverId: drv-8810`, `vehicleId: veh-4402`).
     - Control attribute: `data-drt-operation="admin-approve-supply"`.

---

### 4.5 Platform Admin Operational Truthfulness (`S1F-ADM-002`)

- **Primary URL**: `/partners`, `/reimbursements`, `/fleet`
- **Actor Scope**: Platform Operator
- **Key Operator Steps**:
  1. **Honest Failure States**:
     - When backend endpoints fail or return empty datasets, page renders explicit `<DegradedState />` or `<EmptyState />` banner.
     - Never substitutes route-local plausible mock data.
  2. **Action Binding & Disabling**:
     - Every operational button maps to a real backend capability handler.
     - Unsupported buttons with no underlying API endpoint must NOT fire Javascript `alert()` or show fake toasts. They must be disabled and tagged with `data-drt-non-operational`.

---

### 4.6 Bank Console Live Reads & Statement Download (`S1F-BANK-002`)

- **Primary URL**: `/statements`, `/contracts`, `/programme`
- **Actor Scope**: Bank Console Financial Auditor / Administrator
- **Key Operator Steps**:
  1. **Dynamic Period Statement Read**:
     - Bank user views statement list for current period (`2026-08`).
     - Reconciles totals against live API response (`GET /api/bank/statements?period=2026-08`).
  2. **Statement Artifact Download**:
     - User clicks "Download Settlement Report" -> `GET /api/bank/statements/2026-08/export`.
     - Browser receives non-fixture CSV/PDF artifact stream with proper headers (`Content-Disposition: attachment; filename=bank-settlement-2026-08.csv`).
     - Control attribute: `data-drt-operation="bank-download-statement"`.
  3. **Role Capability & PII Governance**:
     - Read-only analyst roles see disabled export button (`data-drt-non-operational="true"`).
     - Cardholder PII remains masked (`****-****-****-4821`).

---

### 4.7 Channel Partner Portal Identity Binding (`S1F-CHAN-001`)

- **Primary URL**: `/usage`, `/statements`
- **Actor Scope**: Channel Partner Manager (`yuhe-residence`)
- **Key Operator Steps**:
  1. **Identity Verification**:
     - Channel Portal bootstraps with environment configuration:
       - `DRTS_PARTNER_ID=partner-yuhe-001`
       - `DRTS_TENANT_ID=tenant-yuhe-001`
       - `DRTS_PARTNER_PROGRAM_ID=prog-yuhe-referral`
       - `DRTS_PARTNER_ENTRY_SLUG=yuhe-residence`
  2. **Cross-Surface Referral Booking Readback**:
     - Booking `ref-bk-100293` created in Referral Embed (`/embed/yuhe-residence`) is queried via `GET /api/channel/usage`.
     - Confirms that booking `ref-bk-100293` appears under Yuhe partner usage, revenue share, and settlement read models.
     - Proves cross-surface data integrity between Referral Embed and Channel Portal.

---

### 4.8 Stopped & Retired Surface Guardrails (`S1F-REL-001-PREDEPLOY`)

- **URL Rules**:
  - Partner Booking (`/ctbc/program/site`, `/ctbc/program/embed`) -> **MUST RETURN HTTP 404**.
  - Concierge Portal (`/concierge`, `/concierge/*`) -> **MUST RETURN HTTP 404**.
- **Verification Rule**:
  - `scripts/run-operational-browser-acceptance.sh` will issue GET requests to these paths. Any HTTP 200, 301, 302, or 500 response will cause the acceptance run to **FAIL IMMEDIATELY**.

---

## 5. E2E Operational Browser Acceptance Specification

To execute `S1F-UIX-001`, the test runner requires a structured candidate journey manifest (`DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE`). Below is the complete specification of candidate manifest schema and test evidence schema.

### 5.1 Candidate Journey Manifest Schema (`candidate-journeys.json`)

```json
{
  "candidateSha": "COMMIT_SHA_HERE",
  "taskId": "S1F-REL-001-PREDEPLOY",
  "environment": "dev",
  "journeys": [
    {
      "journeyId": "J01-REFERRAL-BOOKING-LIFECYCLE",
      "surface": "referral-embed-web",
      "baseUrl": "DRTS_DEV_REFERRAL_EMBED_BASE_URL",
      "startPath": "/embed/yuhe-residence",
      "steps": [
        {
          "stepName": "create_booking",
          "controlSelector": "[data-drt-operation='referral-create-booking']",
          "action": "click",
          "expectedRequest": {
            "method": "POST",
            "path": "/api/referral/booking"
          },
          "returnedIdPath": "data.bookingId",
          "readbackUrl": "/api/referral/booking/{returnedId}",
          "readbackStatePath": "data.status",
          "expectedState": "DISPATCHING"
        },
        {
          "stepName": "cancel_booking",
          "controlSelector": "[data-drt-operation='referral-cancel-trip']",
          "action": "click",
          "expectedRequest": {
            "method": "POST",
            "path": "/api/referral/cancel"
          },
          "returnedIdPath": "data.bookingId",
          "readbackUrl": "/api/referral/booking/{returnedId}",
          "readbackStatePath": "data.status",
          "expectedState": "CANCELLED"
        }
      ]
    },
    {
      "journeyId": "J02-ENTERPRISE-DISPATCH-LIFECYCLE",
      "surface": "enterprise-dispatch-web",
      "baseUrl": "DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL",
      "startPath": "/bookings/new",
      "steps": [
        {
          "stepName": "submit_enterprise_booking",
          "controlSelector": "[data-drt-operation='ent-create-booking']",
          "action": "click",
          "expectedRequest": {
            "method": "POST",
            "path": "/api/enterprise/bookings"
          },
          "returnedIdPath": "data.enterpriseBookingId",
          "readbackUrl": "/api/enterprise/bookings/{returnedId}",
          "readbackStatePath": "data.status",
          "expectedState": "CREATED"
        }
      ]
    },
    {
      "journeyId": "J03-FLEET-SUPPLY-AND-ADMIN-APPROVAL",
      "surface": "fleet-partner-portal-web / platform-admin-web",
      "baseUrl": "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "startPath": "/supply",
      "steps": [
        {
          "stepName": "fleet_submit_supply",
          "controlSelector": "[data-drt-operation='fleet-submit-supply']",
          "action": "click",
          "expectedRequest": {
            "method": "POST",
            "path": "/api/fleet/supply-submissions"
          },
          "returnedIdPath": "data.submissionId",
          "readbackUrl": "/api/admin/supply-review/{returnedId}",
          "readbackStatePath": "data.status",
          "expectedState": "PENDING_REVIEW"
        },
        {
          "stepName": "admin_approve_supply",
          "controlSelector": "[data-drt-operation='admin-approve-supply']",
          "action": "click",
          "expectedRequest": {
            "method": "POST",
            "path": "/api/admin/supply-review/{returnedId}/approve"
          },
          "returnedIdPath": "data.submissionId",
          "readbackUrl": "/api/fleet/registry/drivers/{driverId}",
          "readbackStatePath": "data.provisionStatus",
          "expectedState": "ACTIVE"
        }
      ]
    },
    {
      "journeyId": "J04-BANK-STATEMENT-DOWNLOAD",
      "surface": "bank-console-web",
      "baseUrl": "DRTS_DEV_BANK_CONSOLE_BASE_URL",
      "startPath": "/statements",
      "steps": [
        {
          "stepName": "download_statement",
          "controlSelector": "[data-drt-operation='bank-download-statement']",
          "action": "download",
          "expectedRequest": {
            "method": "GET",
            "path": "/api/bank/statements/2026-08/export"
          },
          "returnedIdPath": "headers.content-disposition",
          "readbackUrl": "/api/bank/statements/2026-08",
          "readbackStatePath": "data.period",
          "expectedState": "2026-08"
        }
      ]
    },
    {
      "journeyId": "J05-CHANNEL-PARTNER-CROSS-READBACK",
      "surface": "channel-partner-portal-web",
      "baseUrl": "DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL",
      "startPath": "/usage",
      "steps": [
        {
          "stepName": "reconcile_referral_booking",
          "controlSelector": "[data-drt-operation='channel-refresh-usage']",
          "action": "click",
          "expectedRequest": {
            "method": "GET",
            "path": "/api/channel/usage"
          },
          "returnedIdPath": "data.records[0].bookingId",
          "readbackUrl": "/api/channel/usage",
          "readbackStatePath": "data.partnerSlug",
          "expectedState": "yuhe-residence"
        }
      ]
    }
  ]
}
```

### 5.2 Test Evidence Output Schema (`operational-browser-evidence.json`)

Execution of `scripts/run-operational-browser-acceptance.sh` outputs standard evidence:

```json
{
  "candidateSha": "COMMIT_SHA_HERE",
  "taskId": "S1F-UIX-001",
  "timestamp": "2026-08-13T14:35:00Z",
  "evidenceId": "ev-uix-20260813-9921",
  "headerValidation": {
    "headerName": "x-drts-candidate-sha",
    "status": "PASS"
  },
  "journeys": [
    {
      "journeyId": "J01-REFERRAL-BOOKING-LIFECYCLE",
      "result": "PASS",
      "stepsExecuted": 2,
      "returnedIds": {
        "bookingId": "ref-bk-100293"
      },
      "readbackState": "CANCELLED"
    },
    {
      "journeyId": "J02-ENTERPRISE-DISPATCH-LIFECYCLE",
      "result": "PASS",
      "stepsExecuted": 1,
      "returnedIds": {
        "enterpriseBookingId": "ent-bk-88301"
      },
      "readbackState": "CREATED"
    },
    {
      "journeyId": "J03-FLEET-SUPPLY-AND-ADMIN-APPROVAL",
      "result": "PASS",
      "stepsExecuted": 2,
      "returnedIds": {
        "submissionId": "sub-flt-9012",
        "driverId": "drv-8810"
      },
      "readbackState": "ACTIVE"
    },
    {
      "journeyId": "J04-BANK-STATEMENT-DOWNLOAD",
      "result": "PASS",
      "stepsExecuted": 1,
      "returnedIds": {
        "statementExport": "bank-settlement-2026-08.csv"
      },
      "readbackState": "2026-08"
    },
    {
      "journeyId": "J05-CHANNEL-PARTNER-CROSS-READBACK",
      "result": "PASS",
      "stepsExecuted": 1,
      "returnedIds": {
        "reconciledBookingId": "ref-bk-100293"
      },
      "readbackState": "yuhe-residence"
    }
  ],
  "frozenSurfaceAudit": {
    "/ctbc/program/site": 404,
    "/ctbc/program/embed": 404,
    "/concierge": 404,
    "status": "PASS"
  },
  "overallResult": "PASS"
}
```

---

## 6. Verification & Reviewer Handoff Protocol

### 6.1 Reviewer Verification Checklist (For Reviewer `Codex`)

When evaluating this handoff packet:
1. [x] **Support-Only Scope**: Document lives in `support/sidecars/S1F-UIX-001/S1F-UIX-001-SIDECAR-BFF-HANDOFF.md`. No L1 canonical files (`phase1_*.md`) were edited.
2. [x] **Upstream Dependency Coverage**: Maps all 7 code dependencies (`S1F-REF-002`, `S1F-ENT-002`, `S1F-FLT-003`, `S1F-ADM-001`, `S1F-ADM-002`, `S1F-BANK-002`, `S1F-CHAN-001`) and `S1F-REL-001-PREDEPLOY`.
3. [x] **BFF Gap Analysis**: Clarifies how fixture data was replaced with live BFF endpoints, identity injection (`yuhe-residence`), dynamic period derivation, and error boundary handling across all active web surfaces.
4. [x] **Operator Journeys**: Details step-by-step user interactions, UI control attributes (`data-drt-operation`), expected request payloads, and API readback assertions.
5. [x] **Frozen Surface Rules**: Enforces strict HTTP 404 checks for Partner Booking and Concierge Portal.
6. [x] **Candidate Propagation**: Enforces candidate SHA header matching (`x-drts-candidate-sha`).

### 6.2 Reviewer Command Signature

To approve this task handoff:
```bash
CANDIDATE_SHA=$(git rev-parse HEAD)
CANDIDATE_BRANCH=$(git branch --show-current)
AI_NAME=Gemini2 scripts/ai-status.sh handoff S1F-UIX-001-SIDECAR-BFF-HANDOFF Codex "Prepared S1F-UIX-001 BFF and frontend handoff packet in support/sidecars/S1F-UIX-001/S1F-UIX-001-SIDECAR-BFF-HANDOFF.md"
```
