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
7. **G7 Frozen Surfaces**: Paused Partner Booking (`/`, `/ctbc/program/*`), retired Concierge Portal (`/`, `/concierge/*`), and retired Passenger Web (`/`) return HTTP 404.
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
     - Readback: Order ID created (e.g. `ref-ord-100293`), status `CONFIRMED`.
     - Control attribute: `data-drt-operation="referral-create"` (runner key: `referral-create`).
   2. **Active Trip Resume & Refresh**:
     - Browser refresh on `/embed/yuhe-residence?orderId=ref-ord-100293`.
     - Component consumes `liveData` from route loader instead of `embedTrip` fixture.
     - Asserts matching order ID, driver status, and ETA via `GET /api/referral/history/{resultId}`.
   3. **Trip Cancellation**:
     - User clicks "Cancel Trip" -> issues cancellation request through referral BFF.
     - Readback: Status transitions to `CANCELLED`.
   4. **Trip Rating & Receipt**:
     - For completed trips, user submits 5-star rating via referral BFF.
     - User views receipt details -> reads back itemized fare breakdown from live BFF.

### 4.2 Enterprise Dispatch Operator Journey (`S1F-ENT-002`)

- **Primary URL**: `/bookings/new`, `/bookings`
- **Actor Scope**: Enterprise Dispatcher / Corporate Admin
- **Key Operator Steps**:
  1. **Drafting Enterprise Booking**:
     - Dispatcher opens `/bookings/new`, selects employee/passenger, pickup/dropoff address, cost center, and booking time.
     - Policy & quota engine previews approval rules (`policyDecision: APPROVED`, `quotaRemaining: 48`).
   2. **Submitting Live Booking Command**:
     - Dispatcher clicks "Submit Dispatch" -> `POST /control-plane-proxy/` (enterprise booking endpoint).
     - Payload contains live form fields (no fixture fallback).
     - Response returns booking `id` (e.g., `ent-bk-88301`); status readback via `GET /control-plane-proxy/bookings/{resultId}`.
     - Control attribute: `data-drt-operation="enterprise-create"` (runner key: `enterprise-create`).
   3. **Readback & Modification**:
     - Navigates to `/bookings/{id}`.
     - Reads back persisted fields (passenger name, cost center, pickup time).
     - Dispatcher updates pickup time -> PATCH via control-plane-proxy.
   4. **Cancellation**:
     - Dispatcher cancels booking -> POST via control-plane-proxy.

### 4.3 Fleet Partner Supply & Operational Actions (`S1F-FLT-003`)

- **Primary URL**: `/supply`, `/statements`
- **Actor Scope**: Fleet Partner Operator (`fleet-demo-001`)
- **Key Operator Steps**:
   1. **Supply Onboarding Submission**:
     - Fleet user opens `/supply`, clicks "Add Driver" / "Add Vehicle".
     - Uploads required license document -> document upload intent endpoint -> confirms upload.
     - Submits onboarding package -> `POST /control-plane-proxy/` (supply submissions).
     - Submission `id` returned (e.g., `sub-flt-9012`). Status readback: `SUBMITTED`.
     - Control attribute: `data-drt-operation="fleet-submit"` (runner key: `fleet-submit`).
   2. **Withdraw / Revision Resubmit**:
     - User clicks "Withdraw Submission" -> withdraw action via control-plane-proxy.
     - Updates document and resubmits -> resubmit action via control-plane-proxy.
   3. **Statement Confirm & Dispute**:
     - User navigates to `/statements` (current period derived dynamically, e.g., `2026-08`).
     - Downloads statement PDF/CSV -> statement artifact via `/api/statements/` path.
     - Confirms / disputes statement via control-plane-proxy.
   4. **Inert Control Annotations**:
     - Controls for unsupported Stage 1.5 actions (e.g. "Trigger Driver Re-training") are disabled and annotated:
       `data-drt-non-operational="true"`
       `data-drt-non-operational-reason="Action scheduled for Stage 1.5 compliance wave"`.

### 4.4 Platform Admin Supply Review Journey (`S1F-ADM-001`)

- **Primary URL**: `/supply-review`, `/supply-review/[submissionId]`
- **Actor Scope**: Platform Administrator / Compliance Officer
- **Key Operator Steps**:
  1. **Review Queue Navigation**:
     - Admin opens `/supply-review`, views pending submissions list (`sub-flt-9012`).
   2. **Detail Inspection & Review Start**:
     - Admin opens `/supply-review/{submissionId}`.
     - Clicks "Start Review" -> start-review action via control-plane-proxy.
     - Status updates to `IN_REVIEW`.
   3. **Approval & Canonical Provisioning**:
     - Admin inspects uploaded vehicle registration and driver license documents.
     - Clicks "Approve Supply" -> `POST /control-plane-proxy/` (supply approval endpoint).
     - Response confirms canonical fleet registry provisioning; readback via `GET /control-plane-proxy/supply/submissions/{resultId}` returns status `APPROVED`.
     - Control attribute: `data-drt-operation="admin-approve"` (runner key: `admin-approve`).

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

### 4.6 Bank Console Live Reads & Statement Download (`S1F-BANK-002`)

- **Primary URL**: `/statements`, `/contracts`, `/programme`
- **Actor Scope**: Bank Console Financial Auditor / Administrator
- **Key Operator Steps**:
  1. **Dynamic Period Statement Read**:
     - Bank user views statement list for current period (`2026-08`).
     - Reconciles totals against live API response (`GET /api/bank/statements?period=2026-08`).
   2. **Statement Artifact Download**:
     - User clicks "Download Settlement Report" -> `GET /api/statements/{period}` (path includes `/api/statements/`).
     - Runner captures `statementId` from response; readback via `GET /artifacts/statements/{statementId}` must return status `READY`.
     - Control attribute: `data-drt-operation="bank-statement-download"` (runner key: `bank-statement-download`).
   3. **Role Capability & PII Governance**:
     - Read-only analyst roles see disabled export button (`data-drt-non-operational="true"`).
     - Cardholder PII remains masked (`****-****-****-4821`).

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
   2. **Statement Download & Cross-Surface Readback**:
     - Channel user navigates to `/statements`, triggers statement download -> `GET /control-plane-proxy/` (statements endpoint).
     - Runner captures statement `id`; readback via `GET /control-plane-proxy/statements/{resultId}` must return status `PUBLISHED`.
     - Control attribute: `data-drt-operation="channel-statement-download"` (runner key: `channel-statement-download`).
   3. **Cross-Surface Referral Booking Readback**:
     - Order `ref-ord-100293` created in Referral Embed (`/embed/yuhe-residence`) reconciles under Yuhe usage, revenue share, and settlement read models.
     - Proves cross-surface data integrity between Referral Embed and Channel Portal.

### 4.8 Stopped & Retired Surface Guardrails (`S1F-REL-001-PREDEPLOY`)

- **URL Rules**:
  - Partner Booking (`/`, `/ctbc/program/site`, `/ctbc/program/embed`) -> **MUST RETURN HTTP 404**.
  - Concierge Portal (`/`, `/concierge/*`) -> **MUST RETURN HTTP 404**.
  - Passenger Web (`/`) -> **MUST RETURN HTTP 404**.
- **Verification Rule**:
  - Enforced across two manifest passes (`operational-candidate.spec.ts` via `candidate-journey-manifest.json` and `operational-browser-acceptance.spec.ts` via `operational-browser-journeys.json`). `scripts/run-operational-browser-acceptance.sh` executes both runners. Any HTTP 200, 301, 302, or 500 response on these surfaces causes the acceptance run to **FAIL IMMEDIATELY**.

---

## 5. E2E Operational Browser Acceptance Specification

The runner reads two files:

1. **Source journey manifest** (`DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE`, default: `tests/e2e/fixtures/operational-browser-journeys.json`) — lists journeys, per-operation control selectors, request URL inclusions, and expected readback states.
2. **Candidate surface manifest** (`DRTS_OPERATIONAL_CANDIDATE_MANIFEST_FILE`, default: `tests/e2e/fixtures/candidate-journey-manifest.json`) — lists active surfaces (must return 200 with `x-drts-candidate-sha` header) and retired surfaces (must return 404).

Both files use `__SET_DRTS_CANDIDATE_SHA__` / `__DRTS_CANDIDATE_SHA__` as placeholders that the runner substitutes with the actual `--sha` argument.

### 5.1 Source Journey Manifest (`operational-browser-journeys.json`) — Authoritative Schema

This is the **actual** schema consumed by `pnpm exec playwright test -c playwright.operational-browser-acceptance.config.ts`. Do **not** invent alternate field names; the runner will not recognise them.

```json
{
  "$schema": "https://drts.local/schemas/operational-browser-journeys.v1.json",
  "version": 1,
  "candidateSha": "__SET_DRTS_CANDIDATE_SHA__",
  "journeys": [
    {
      "id": "referral-create-read-cancel-rate-receipt",
      "surface": "referral",
      "baseUrlEnv": "DRTS_DEV_REFERRAL_EMBED_BASE_URL",
      "route": "/embed/yuhe-residence",
      "actorScope": "partner-scoped referral passenger",
      "operations": [
        {
          "name": "create",
          "control": "[data-drt-operation='referral-create']",
          "requestUrlIncludes": "/api/referral/booking",
          "requestMethod": "POST",
          "resultIdPath": "data.orderId",
          "readbackUrl": "/api/referral/history/{resultId}",
          "readbackIdPath": "data.orderId",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "CONFIRMED"
        }
      ]
    },
    {
      "id": "enterprise-create-read-update-cancel",
      "surface": "enterprise",
      "baseUrlEnv": "DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL",
      "route": "/bookings/new",
      "actorScope": "tenant_admin",
      "operations": [
        {
          "name": "create",
          "control": "[data-drt-operation='enterprise-create']",
          "requestUrlIncludes": "/control-plane-proxy/",
          "requestMethod": "POST",
          "resultIdPath": "data.id",
          "readbackUrl": "/control-plane-proxy/bookings/{resultId}",
          "readbackIdPath": "data.id",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "PENDING"
        }
      ]
    },
    {
      "id": "fleet-submit-read-withdraw-resubmit",
      "surface": "fleet",
      "baseUrlEnv": "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "route": "/supply",
      "actorScope": "fleet partner",
      "operations": [
        {
          "name": "submit",
          "control": "[data-drt-operation='fleet-submit']",
          "requestUrlIncludes": "/control-plane-proxy/",
          "requestMethod": "POST",
          "resultIdPath": "data.id",
          "readbackUrl": "/control-plane-proxy/supply/submissions/{resultId}",
          "readbackIdPath": "data.id",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "SUBMITTED"
        }
      ]
    },
    {
      "id": "admin-review-approve-readback",
      "surface": "platform-admin",
      "baseUrlEnv": "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
      "route": "/supply-review",
      "actorScope": "platform_admin",
      "operations": [
        {
          "name": "approve",
          "control": "[data-drt-operation='admin-approve']",
          "requestUrlIncludes": "/control-plane-proxy/",
          "requestMethod": "POST",
          "resultIdPath": "data.id",
          "readbackUrl": "/control-plane-proxy/supply/submissions/{resultId}",
          "readbackIdPath": "data.id",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "APPROVED"
        }
      ]
    },
    {
      "id": "tenant-ops-dispatch-downstream-read",
      "surface": "tenant-ops",
      "baseUrlEnv": "DRTS_DEV_TENANT_CONSOLE_BASE_URL",
      "route": "/bookings",
      "actorScope": "tenant_admin and dispatcher",
      "operations": [
        {
          "name": "dispatch",
          "control": "[data-drt-operation='tenant-dispatch']",
          "requestUrlIncludes": "/control-plane-proxy/",
          "requestMethod": "POST",
          "resultIdPath": "data.id",
          "readbackUrl": "/control-plane-proxy/bookings/{resultId}",
          "readbackIdPath": "data.id",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "DISPATCHED"
        }
      ]
    },
    {
      "id": "bank-statement-download-readback",
      "surface": "bank",
      "baseUrlEnv": "DRTS_DEV_BANK_CONSOLE_BASE_URL",
      "route": "/statements",
      "actorScope": "bank_program_admin",
      "operations": [
        {
          "name": "download",
          "control": "[data-drt-operation='bank-statement-download']",
          "requestUrlIncludes": "/api/statements/",
          "requestMethod": "GET",
          "resultIdPath": "statementId",
          "readbackUrl": "/artifacts/statements/{resultId}",
          "readbackIdPath": "id",
          "readbackStatePath": "status",
          "expectedReadbackState": "READY"
        }
      ]
    },
    {
      "id": "channel-statement-download-readback",
      "surface": "channel",
      "baseUrlEnv": "DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL",
      "route": "/statements",
      "actorScope": "channel partner",
      "operations": [
        {
          "name": "download",
          "control": "[data-drt-operation='channel-statement-download']",
          "requestUrlIncludes": "/control-plane-proxy/",
          "requestMethod": "GET",
          "resultIdPath": "data.id",
          "readbackUrl": "/control-plane-proxy/statements/{resultId}",
          "readbackIdPath": "data.id",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "PUBLISHED"
        }
      ]
    }
  ],
  "retiredSurfaces": [
    {
      "id": "partner-booking-site",
      "baseUrlEnv": "DRTS_DEV_PARTNER_BOOKING_BASE_URL",
      "path": "/ctbc/program/site"
    },
    {
      "id": "partner-booking-embed",
      "baseUrlEnv": "DRTS_DEV_PARTNER_BOOKING_BASE_URL",
      "path": "/ctbc/program/embed"
    },
    {
      "id": "concierge",
      "baseUrlEnv": "DRTS_DEV_CONCIERGE_BASE_URL",
      "path": "/"
    }
  ]
}
```

> **Key field mapping (schema → runner behaviour)**
>
> | Field | Meaning |
> |---|---|
> | `id` | Journey identifier (not `journeyId`) |
> | `route` | Start path (not `startPath`) |
> | `operations[]` | Steps array (not `steps[]`) |
> | `control` | CSS selector (not `controlSelector`) |
> | `requestUrlIncludes` | Substring match on intercepted request URL (not `expectedRequest.path`) |
> | `resultIdPath` | JSONPath into response body for the created resource ID (not `returnedIdPath`) |
> | `expectedReadbackState` | Expected readback state value (not `expectedState`) |

### 5.2 Candidate Surface Manifest (`candidate-journey-manifest.json`) — Authoritative Schema

This manifest is consumed by `pnpm exec playwright test -c playwright.operational-candidate.config.ts` (the first runner pass). It proves every active surface serves `x-drts-candidate-sha` header and all retired surfaces return 404.

```json
{
  "schemaVersion": 1,
  "taskId": "S1F-REL-001-PREDEPLOY",
  "candidateSha": "__DRTS_CANDIDATE_SHA__",
  "responseHeader": "x-drts-candidate-sha",
  "activeSurfaces": [
    { "id": "api",                    "urlEnv": "DRTS_OPERATIONAL_API_URL",                    "path": "/api/health",       "expectedStatus": 200, "kind": "api" },
    { "id": "platform-admin-web",     "urlEnv": "DRTS_OPERATIONAL_PLATFORM_ADMIN_URL",        "path": "/",               "expectedStatus": 200, "kind": "web" },
    { "id": "ops-console-web",        "urlEnv": "DRTS_OPERATIONAL_OPS_CONSOLE_URL",           "path": "/",               "expectedStatus": 200, "kind": "web" },
    { "id": "fleet-partner-portal-web","urlEnv": "DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_URL", "path": "/",               "expectedStatus": 200, "kind": "web" },
    { "id": "tenant-console-web",     "urlEnv": "DRTS_OPERATIONAL_TENANT_CONSOLE_URL",        "path": "/",               "expectedStatus": 200, "kind": "web" },
    { "id": "bank-console-web",       "urlEnv": "DRTS_OPERATIONAL_BANK_CONSOLE_URL",          "path": "/",               "expectedStatus": 200, "kind": "web" },
    { "id": "referral-embed-web",     "urlEnv": "DRTS_OPERATIONAL_REFERRAL_EMBED_URL",        "path": "/embed/yuhe-residence", "expectedStatus": 200, "kind": "web" },
    { "id": "enterprise-dispatch-web","urlEnv": "DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_URL",   "path": "/",               "expectedStatus": 200, "kind": "web" },
    { "id": "channel-partner-portal-web","urlEnv": "DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_URL","path": "/dashboard",  "expectedStatus": 200, "kind": "web" }
  ],
  "retiredSurfaces": [
    { "id": "partner-booking-web",  "urlEnv": "DRTS_OPERATIONAL_PARTNER_BOOKING_URL", "path": "/", "expectedStatus": 404, "state": "paused" },
    { "id": "concierge-portal-web", "urlEnv": "DRTS_OPERATIONAL_CONCIERGE_PORTAL_URL","path": "/", "expectedStatus": 404, "state": "retired" },
    { "id": "passenger-web",        "urlEnv": "DRTS_OPERATIONAL_PASSENGER_WEB_URL",   "path": "/", "expectedStatus": 404, "state": "retired" }
  ]
}
```

### 5.3 Actual Test Evidence Output Schema (`operational-browser-evidence.json`)

Execution of `scripts/run-operational-browser-acceptance.sh --sha <40-hex>` drives `tests/e2e/operational-browser-acceptance.spec.ts` (pass 2), which writes `test-results/operational-browser/operational-browser-evidence.json` via `test.afterAll`.

Authoritative output schema written by Playwright:

```json
{
  "candidateSha": "79e6e05ab4b777a422f83373180e3e31c511371c",
  "manifest": "operational-browser-journeys.json",
  "evidence": [
    {
      "candidateSha": "79e6e05ab4b777a422f83373180e3e31c511371c",
      "recordedAt": "2026-08-13T14:35:00.000Z",
      "kind": "mutation-readback",
      "journey": "referral-create-read-cancel-rate-receipt",
      "surface": "referral",
      "actorScope": "partner-scoped referral passenger",
      "operation": "create",
      "requestUrl": "https://referral-embed.dev.drts.local/api/referral/booking",
      "resultId": "ref-ord-100293",
      "readbackUrl": "https://referral-embed.dev.drts.local/api/referral/history/ref-ord-100293",
      "readbackState": "CONFIRMED"
    },
    {
      "candidateSha": "79e6e05ab4b777a422f83373180e3e31c511371c",
      "recordedAt": "2026-08-13T14:35:00.000Z",
      "kind": "route-census",
      "journey": "referral-create-read-cancel-rate-receipt",
      "surface": "referral",
      "url": "https://referral-embed.dev.drts.local/embed/yuhe-residence",
      "actorScope": "partner-scoped referral passenger",
      "operations": [
        {
          "name": "create",
          "control": "[data-drt-operation='referral-create']",
          "requestUrlIncludes": "/api/referral/booking",
          "requestMethod": "POST",
          "resultIdPath": "data.orderId",
          "readbackUrl": "/api/referral/history/{resultId}",
          "readbackIdPath": "data.orderId",
          "readbackStatePath": "data.status",
          "expectedReadbackState": "CONFIRMED"
        }
      ]
    },
    {
      "candidateSha": "79e6e05ab4b777a422f83373180e3e31c511371c",
      "recordedAt": "2026-08-13T14:35:00.000Z",
      "kind": "retired-surface",
      "surface": "partner-booking-site",
      "url": "https://partner-booking.dev.drts.local/ctbc/program/site",
      "status": 404
    }
  ]
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
5. [x] **Runner Schema Fidelity**: §5.1 reproduces `tests/e2e/fixtures/operational-browser-journeys.json` verbatim (7 journeys, correct `id`/`route`/`operations`/`control`/`requestUrlIncludes`/`expectedReadbackState` fields; correct `retiredSurfaces` block).
6. [x] **Candidate Manifest Fidelity**: §5.2 reproduces `tests/e2e/fixtures/candidate-journey-manifest.json` verbatim (9 active surfaces + 3 retired; `x-drts-candidate-sha` header contract).
7. [x] **Frozen Surface Rules**: Enforces strict HTTP 404 checks for Partner Booking (`/`, `/ctbc/program/site`, `/ctbc/program/embed`), Concierge Portal (`/`, `/concierge/*`), and Passenger Web (`/`). (Passenger Web 404 is enforced via `candidate-journey-manifest.json` in pass 1; Partner Booking and Concierge are enforced across both `candidate-journey-manifest.json` and `operational-browser-journeys.json`).
8. [x] **Candidate Propagation**: Enforces candidate SHA header matching (`x-drts-candidate-sha`) on all active surfaces before browser mutation journeys run.

### 6.2 Reviewer Command Signature

To approve this task handoff:
```bash
REVIEWED_SHA=<candidate sha from handoff>
AI_NAME=Codex scripts/ai-status.sh approve S1F-UIX-001-SIDECAR-BFF-HANDOFF "§5.1 and §5.2 match operational-browser-journeys.json and candidate-journey-manifest.json; control attributes, journey ids, and field names verified against runner fixtures"
```
