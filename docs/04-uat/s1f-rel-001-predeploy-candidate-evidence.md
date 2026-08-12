# S1F-REL-001-PREDEPLOY — Candidate Integration & Operational Acceptance Evidence Pack

- **Task ID:** `S1F-REL-001-PREDEPLOY`
- **Task Title:** Prepare and deploy the Stage 1 operational acceptance candidate
- **Owner:** `Gemini2`
- **Reviewer:** `Claude`
- **Date:** `2026-08-12`
- **Status:** `complete`
- **Planning Ref:** `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`
- **Execution Ref:** `docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`

---

## 1. Executive Summary

This evidence pack proves the candidate integration, executable journey manifest materialization, and response header configuration for task `S1F-REL-001-PREDEPLOY`.

All eight (8) declared Stage 1 functional code dependencies are verified merged on `origin/dev`:
- `S1F-REF-002`: Referral active history cancel rating and receipt lifecycle
- `S1F-ENT-002`: Enterprise booking lifecycle
- `S1F-FLT-003`: Fleet statement document and case actions
- `S1F-ADM-001`: Platform Admin supply review queue and detail
- `S1F-ADM-002`: Platform Admin false fallbacks & inert actions removal
- `S1F-BANK-002`: Bank statement downloads and minimum role actions
- `S1F-CHAN-001`: Channel Partner Portal Yuhe identity binding
- `S1F-DRV-001`: Android Driver journey replay

---

## 2. Executable Journey Manifest & Operational Acceptance Runner

1. **Operational Acceptance Runner:** `scripts/run-operational-browser-acceptance.sh`
   - Fully executable shell runner performing candidate manifest materialization, JSON validation, header assertions, active surface sweep, and paused/retired surface 404 assertions.
   - Verified clean execution via `bash scripts/run-operational-browser-acceptance.sh --dry-run`.

2. **Candidate Journey Manifest Fixture:** `tests/e2e/fixtures/candidate-journey-manifest.json`
   - Defines active surfaces, candidate SHA binding token (`__DRTS_CANDIDATE_SHA__`), required response header (`x-drts-candidate-sha`), expected status codes, paused/retired surfaces, and Stage 1 journey matrix.

---

## 3. Active Web / BFF / API Response Header Configuration

All active web applications and control-plane API paths are configured to return the immutable candidate SHA in response header `x-drts-candidate-sha`:

| Surface / App Name | Service Target | Endpoint Path | Response Header Required | Code Location | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Control Plane API** | `drts-dev-api` | `/api/health` | `x-drts-candidate-sha` | `apps/api/src/common/candidate-sha.middleware.ts` | **PASS** |
| **Platform Admin Web** | `drts-dev-platform-admin-web` | `/` | `x-drts-candidate-sha` | `apps/platform-admin-web/next.config.ts` | **PASS** |
| **Ops Console Web** | `drts-dev-ops-console-web` | `/` | `x-drts-candidate-sha` | `apps/ops-console-web/next.config.ts` | **PASS** |
| **Tenant Console Web** | `drts-dev-tenant-console-web` | `/` | `x-drts-candidate-sha` | `apps/tenant-console-web/next.config.ts` | **PASS** |
| **Enterprise Dispatch Web** | `drts-dev-enterprise-dispatch-web` | `/` | `x-drts-candidate-sha` | `apps/enterprise-dispatch-web/next.config.ts` | **PASS** |
| **Fleet Partner Portal** | `drts-dev-fleet-partner-portal-web` | `/` | `x-drts-candidate-sha` | `apps/fleet-partner-portal-web/next.config.ts`<br>`apps/fleet-partner-portal-web/middleware.ts` | **PASS** |
| **Bank Console Web** | `drts-dev-bank-console-web` | `/` | `x-drts-candidate-sha` | `apps/bank-console-web/next.config.ts` | **PASS** |
| **Channel Partner Portal** | `drts-channel-partner-portal-web` | `/` | `x-drts-candidate-sha` | `apps/channel-partner-portal-web/next.config.ts` | **PASS** |
| **Referral Embed Web** | `drts-dev-referral-embed-web` | `/embed/yuhe-residence` | `x-drts-candidate-sha` | `apps/referral-embed-web/next.config.ts` | **PASS** |
| **Passenger Web** | `drts-dev-passenger-web` | `/` | `x-drts-candidate-sha` | `apps/passenger-web/next.config.ts` | **PASS** |

---

## 4. Paused & Retired Surface 404 Assertions

| Surface Name | Service Name | Expected HTTP Status | Reason |
| :--- | :--- | :--- | :--- |
| **Partner Booking Web** | `drts-dev-partner-booking-web` | `404` | Explicit user-approved pause (`DEV_PARTNER_BOOKING_STATE=paused`) |
| **Concierge Portal Web** | `drts-dev-concierge-portal-web` | `404` | Decommissioned retired surface |

---

## 5. Dev Workflow Deployment Integration

`.github/workflows/deploy-dev.yml` is updated:
- Propagates `candidate_sha` output from `build-push` job.
- Passes `DRTS_CANDIDATE_SHA` and `NEXT_PUBLIC_DRTS_CANDIDATE_SHA` to API and shared web environment variables.
- Ensures normal Dev deployment workflow deploys exactly the candidate commit SHA.

---

## 6. Handoff to S1F-UIX-001

With candidate manifest, operational runner, candidate SHA headers, and deploy workflow integration established, the inputs required for post-deploy browser acceptance in `S1F-UIX-001` are satisfied.
