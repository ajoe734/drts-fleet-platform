# Stage 1 Operational Acceptance Evidence & Verification Pack (`S1F-REL-FIN-UAT-001`)

- **Task ID:** `S1F-REL-FIN-UAT-001`
- **Task Title:** Run same-SHA Stage 1 operational acceptance
- **Owner:** `Codex`
- **Reviewer:** `Gemini`
- **Base Branch:** `dev`
- **Task Branch:** `codex/s1f-rel-fin-uat-001`
- **Planning Ref:** [`docs/02-architecture/s1f-release-finalization-gap-20260821.md`](../02-architecture/s1f-release-finalization-gap-20260821.md) (§F5 Same-SHA operational acceptance)
- **System Design Ref:** [`docs/02-architecture/s1f-release-finalization-system-design-20260821.md`](../02-architecture/s1f-release-finalization-system-design-20260821.md) (§Acceptance lane)
- **Execution Runbook Ref:** [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md) (§S1F-REL-FIN-UAT-001)
- **Status:** `ready_for_review`

---

## 1. Executive Summary & Acceptance Posture

Task `S1F-REL-FIN-UAT-001` executes and verifies the canonical Stage 1 operational browser and HTTP acceptance test suites ([`tests/e2e/operational-candidate.spec.ts`](../../tests/e2e/operational-candidate.spec.ts) and [`tests/e2e/operational-browser-acceptance.spec.ts`](../../tests/e2e/operational-browser-acceptance.spec.ts)) executed against live Google Cloud Run Dev endpoints.

In GitHub Actions workflow run **`32616137960`** (`Deploy — Dev`), job **`97139160397`** ("Candidate SHA operational acceptance") completed with a conclusion of **`SUCCESS`** across all 30 test assertions (14 candidate surface checks + 16 operational browser journey & readback specs). The entire workflow run succeeded and evaluated `deployed=yes; all stages passed`.

The operational evidence artifact `operational-browser-evidence-0d97e92fff563d32e0b33676edc3442ad32cd2e7` (Artifact ID `9487248654`) was generated and preserved in GitHub Actions storage.

---

## 2. Operational Acceptance Workflow Evidence

### 2.1 Workflow & Job Details

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Workflow Name** | `Deploy — Dev` | Canonical Dev Cloud Run pipeline |
| **Workflow Run ID** | `32616137960` | Execution on release snapshot `0d97e92fff563d32e0b33676edc3442ad32cd2e7` |
| **Workflow Run URL** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960) | Full pipeline execution |
| **Operational Acceptance Job ID** | `97139160397` | Candidate SHA operational acceptance |
| **Job URL** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960/job/97139160397](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960/job/97139160397) | Job execution log |
| **Job Duration** | `2m 20s` | Completed without retries |
| **Operational Evidence Artifact** | `operational-browser-evidence-0d97e92fff563d32e0b33676edc3442ad32cd2e7` | Artifact ID `9487248654` (Size: 6198 bytes) |
| **Artifact Download URL** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960/artifacts/9487248654](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960/artifacts/9487248654) | Direct download link |

---

## 3. Surface Verification & Candidate SHA Header Audit

Every active Cloud Run service serves the immutable candidate SHA in response headers (`x-drts-candidate-sha`), and all paused/retired services return 404:

| # | Surface ID | Role / Component | Deployed URL | HTTP Status | `x-drts-candidate-sha` Header |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | `api` | Core API & BFF | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app/api/health` | 200 OK | Verified |
| 2 | `platform-admin-web` | Platform Admin Console | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app/` | 200 OK | Verified |
| 3 | `ops-console-web` | Operations Console | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app/` | 200 OK / 307 Auth | Verified |
| 4 | `fleet-partner-portal-web` | Fleet Partner Portal | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app/` | 200 OK / 307 Auth | Verified |
| 5 | `tenant-console-web` | Tenant Console | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app/` | 200 OK / 307 Auth | Verified |
| 6 | `bank-console-web` | Bank Console | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app/` | 200 OK | Verified |
| 7 | `referral-embed-web` | Referral Embed | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` | 200 OK | Verified |
| 8 | `enterprise-dispatch-web` | Enterprise Dispatch | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app/` | 200 OK | Verified |
| 9 | `channel-partner-portal-web` | Channel Partner Portal | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app/dashboard` | 200 OK | Verified |
| 10 | `partner-booking-web` | Partner Booking | `https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app/` | **404 Not Found** | N/A (Paused) |
| 11 | `concierge-portal-web` | Concierge Portal | `https://drts-dev-concierge-portal-web-4t7rg6fmeq-uc.a.run.app/` | **404 Not Found** | N/A (Retired) |
| 12 | `passenger-web` | Passenger Web | `https://drts-dev-passenger-web-4t7rg6fmeq-uc.a.run.app/` | **404 Not Found** | N/A (Retired) |

---

## 4. Operational Browser Journeys & Mutation Readbacks

All 7 required Stage 1 browser journeys execute their declared lifecycle contracts and verify database state via readbacks:

1. **`referral-create-read-cancel-receipt`**
   - **Surface:** Referral Embed (`/embed/yuhe-residence?screen=book`)
   - **Actor Scope:** Partner-scoped referral passenger
   - **Operations & Readbacks:**
     - `create`: POST `/api/referral/booking` -> Readback `/api/referral/history/{orderId}` reports status `created`
     - `cancel`: POST `/api/referral/cancel` -> Readback `/api/referral/history/{orderId}` reports status `cancelled`
     - `cancelled-trip-rating`: Verified absence of rating control for cancelled trips
     - `receipt`: Navigation to `/embed/yuhe-residence?screen=receipt&orderId={orderId}` -> Readback `/api/referral/receipt/{orderId}` reports status `cancelled`

2. **`enterprise-create-read-update-cancel`**
   - **Surface:** Enterprise Dispatch (`/bookings/new`)
   - **Actor Scope:** Tenant Admin
   - **Operations & Readbacks:**
     - `create`: POST `/control-plane-proxy/` -> Readback `/control-plane-proxy/tenant/bookings/{booking_id}` reports status `created`
     - `update`: PUT `/control-plane-proxy/` -> Readback reports status `created`
     - `cancel`: POST `/control-plane-proxy/` -> Readback reports status `cancelled`

3. **`fleet-submit-read-withdraw-resubmit`**
   - **Surface:** Fleet Partner Portal (`/supply/submissions/{submission_id}`)
   - **Actor Scope:** Fleet Partner
   - **Operations & Readbacks:**
     - `submit`: POST submission -> Readback reports status `submitted`
     - `withdraw`: POST withdrawal -> Readback reports status `withdrawn`
     - `resubmit`: POST resubmission -> Readback reports status `submitted`

4. **`admin-review-approve-readback`**
   - **Surface:** Platform Admin Console (`/supply-review/{submission_id}`)
   - **Actor Scope:** Platform Admin
   - **Operations & Readbacks:**
     - `approve`: Start review and POST approval -> Readback `/control-plane-proxy/admin/supply-review/submissions/{submission_id}` reports status `approved`

5. **`tenant-ops-dispatch-intent`**
   - **Surface:** Tenant Console (`/bookings?q={tenantBookingId}`)
   - **Actor Scope:** Tenant Admin
   - **Operations & Readbacks:**
     - `open-ops-dispatch`: Cross-app intent link targets Ops Console with pattern `^/dispatch/[^/?#]+$`

6. **`bank-statement-download`**
   - **Surface:** Bank Console (`/statements?bank=ctbc&locale=zh&role=bank_program_admin`)
   - **Actor Scope:** Bank Program Admin
   - **Operations & Readbacks:**
     - `download`: GET statement artifact stream verified with `content-type: text/plain` and attachment disposition

7. **`channel-statement-download`**
   - **Surface:** Channel Partner Portal (`/statements`)
   - **Actor Scope:** Channel Partner
   - **Operations & Readbacks:**
     - `download`: GET statement artifact stream verified with `content-type: text/csv` and attachment disposition

---

## 5. Acceptance Criteria Verification Matrix

| Acceptance Criterion | Verification Method & Source Evidence | Result |
| :--- | :--- | :--- |
| **Operational acceptance succeeds against deployed Dev URLs** | Run `32616137960` Job `97139160397` executed `run-operational-browser-acceptance.sh` with 30/30 tests passing on live Dev Cloud Run endpoints. | **PASS** |
| **Every active API or BFF surface reports the deployed SHA** | Header audit in Job `97139160397` and live HTTP inspection confirm all 9 active services emit `x-drts-candidate-sha`. | **PASS** |
| **Required browser journeys pass with backend readback** | All 7 multi-step browser journeys passed with backend mutation readbacks validating expected states (`created`, `submitted`, `approved`, `cancelled`). | **PASS** |
| **Partner Booking, Concierge, and Passenger retired surfaces return 404** | Direct HTTP probes and automated Playwright assertions confirm `drts-dev-partner-booking-web` (paused), `drts-dev-concierge-portal-web` (retired), and `drts-dev-passenger-web` (retired) return HTTP 404. | **PASS** |

---

## 6. Handoff & Acceptance Evidence Parameters

The following parameters are prepared for machine truth recording:

- **`operational_acceptance_run_url`**: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960`
- **`operational_acceptance_sha`**: `0d97e92fff563d32e0b33676edc3442ad32cd2e7`
- **`retired_surface_404_evidence`**: `drts-dev-partner-booking-web (404), drts-dev-concierge-portal-web (404), drts-dev-passenger-web (404)`
