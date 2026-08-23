# Stage 1 Dev Deployment Execution Evidence & Verification Pack (`S1F-REL-FIN-DEP-001`)

- **Task ID:** `S1F-REL-FIN-DEP-001`
- **Task Title:** Deploy the locked Stage 1 candidate to Dev
- **Owner:** `Gemini2`
- **Reviewer:** `Claude`
- **Base Branch:** `dev`
- **Task Branch:** `gemini2/s1f-rel-fin-dep-001`
- **Locked Candidate SHA:** `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`
- **Deployed Workflow Source Ref / SHA:** `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (Strict same-SHA match with PRE-001 candidate lock)
- **Planning Ref:** [`docs/02-architecture/s1f-release-finalization-gap-20260821.md`](../02-architecture/s1f-release-finalization-gap-20260821.md) (§F4 Dev deployment)
- **System Design Ref:** [`docs/02-architecture/s1f-release-finalization-system-design-20260821.md`](../02-architecture/s1f-release-finalization-system-design-20260821.md) (§Deployment lane)
- **Execution Runbook Ref:** [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md) (§S1F-REL-FIN-DEP-001)
- **Status:** `dev_deployed` / `ready_for_review`

---

## 1. Executive Summary & Verification Posture

Task `S1F-REL-FIN-DEP-001` has executed and verified the production-grade `Deploy — Dev` workflow ([`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml)) pinned strictly to the immutable Stage 1 candidate SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` on Dev project `drts-dev-ray-tw-20260730` (`952590575714`).

In GitHub Actions run **`32616532316`**, the overall workflow run conclusion is `failure` due to downstream job `97141872207` ("Candidate SHA operational acceptance", which failed on 3 Playwright tests and belongs to Wave C `S1F-REL-FIN-UAT-001` scope per [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md)). All DEP-001-scoped deployment phases—container image build and push to Google Artifact Registry, database migration job execution, Cloud Run service deployments, paused Partner Booking enforcement, fail-closed retired service verification, post-deploy Dev health checks, and Deploy outcome evaluation—completed with a status of `SUCCESS`, with the workflow's own `Deploy outcome` job explicitly evaluating `deployed=yes`.

### 1.1 Dependency Verification Summary

1. **`S1F-REL-FIN-PRE-001` (Candidate Preflight & Lock):**
   - **Status:** `done`
   - **Candidate Lock:** Immutable candidate SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` locked with green PR CI `31997270480` and trunk CI `31997773400`.
   - **Deployed Ref Match:** `source_ref=4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (100% same-SHA identity match).

2. **`S1F-REL-FIN-GCP-001` & Unblock Planning Decision:**
   - **Status:** Resolved / Gate Open
   - **Unblock Decision Ref:** `support/unblock/S1F-REL-FIN-DEP-001/S1F-REL-FIN-DEP-001-UNBLOCK-PLANNING-DECISION.md` (PR [#1548](https://github.com/ajoe734/drts-fleet-platform/pull/1548)).
   - **GCP Gate Outcome:** Cloud Billing and Artifact Registry push authorized on Dev project `drts-dev-ray-tw-20260730` (`952590575714`), unblocking container push and Cloud Run service rollout.

---

## 2. Dev Deployment Workflow Evidence

### 2.1 Workflow Run Details

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Workflow Name** | `Deploy — Dev` | Canonical Dev Cloud Run deploy workflow |
| **Workflow File** | `.github/workflows/deploy-dev.yml` | Declarative multi-service deployment pipeline |
| **Run ID** | `32616532316` | GitHub Actions Run ID |
| **Run URL** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316) | Canonical workflow run URL |
| **Trigger Event** | `workflow_dispatch` | Manual dispatch on `dev` targeting locked candidate SHA |
| **Status / Conclusion** | `completed` / `failure` | Overall run conclusion is `failure` due to Wave C `S1F-REL-FIN-UAT-001` operational acceptance job `97141872207`; all DEP-001 deployment jobs succeeded and `Deploy outcome` evaluated `deployed=yes` |
| **Execution Timestamp** | `2026-08-23T03:54:50Z` – `2026-08-23T04:33:38Z` (UTC) | Completed in 38m 48s (queued behind nightly publish run 32616137960) |
| **Target Profile** | `current` | `drts-dev-ray-tw-20260730` |
| **Source Ref** | `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` | Pinned immutable candidate SHA locked in PRE-001 |
| **Artifact Registry Tag** | `4012b10c0cd4` | Short SHA image tag for candidate |

---

### 2.2 Job-Level Audit & Verification URLs

Every DEP-001 deployment-scoped job in `.github/workflows/deploy-dev.yml` succeeded:

| Job Name | Job ID | Job URL | Duration | Outcome / Verification Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Prepare dev deploy** | `97139436633` | [Job 97139436633](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97139436633) | 3s | **SUCCESS:** Resolved environment configuration and pinned `source_ref` to `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`. |
| **Build & push images** | `97139447891` | [Job 97139447891](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97139447891) | 14m 11s | **SUCCESS:** Pushed 10 container images to Artifact Registry `us-central1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts:*` tagged `4012b10c0cd4`. |
| **DB migration** | `97140945310` | [Job 97140945310](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97140945310) | 3m 5s | **SUCCESS:** Executed Cloud Run job `drts-dev-migrate` against Cloud SQL instance with exit code 0. |
| **Deploy services** | `97141263816` | [Job 97141263816](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97141263816) | 3m 37s | **SUCCESS:** Deployed all 9 active Cloud Run services with 100% traffic allocation. |
| **Enforce Partner Booking paused state** | `97141634306` | [Job 97141634306](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97141634306) | 27s | **SUCCESS:** Verified `drts-dev-partner-booking-web` Cloud Run service is absent / removed. |
| **Dev health check** | `97141682677` | [Job 97141682677](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97141682677) | 1m 9s | **SUCCESS:** Verified healthy HTTP responses and referral handoff session lifecycle across all active services. |
| **Fail-closed retired service cleanup** | `97141811137` | [Job 97141811137](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97141811137) | 30s | **SUCCESS:** Verified retired services adhere to fail-closed configuration. |
| **Candidate SHA operational acceptance** | `97141872207` | [Job 97141872207](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97141872207) | 2m 4s | **FAILURE (Wave C `S1F-REL-FIN-UAT-001` Scope):** 3 Playwright journeys failed on referral/booking readback against live endpoints. Causes overall workflow run conclusion to be `failure`. Does not affect DEP-001 deployment rails or image rollout. |
| **Deploy outcome** | `97142086670` | [Job 97142086670](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316/job/97142086670) | 5s | **SUCCESS:** Evaluated deploy outcome: `deployed=yes`. |

*(Note: While overall GitHub Actions workflow run conclusion is `failure` due to job `97141872207` 'Candidate SHA operational acceptance', that job belongs to Wave C `S1F-REL-FIN-UAT-001` scope per [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md). All DEP-001 deployment jobs succeeded, all 9 active Cloud Run services are running revision-pinned candidate containers with 100% traffic, health checks passed, and the Deploy outcome job explicitly evaluated `deployed=yes`).*

---

## 3. Deployed Service Revisions & Resolved URLs

### 3.1 Service Inventory & Revision Matrix

| # | Service Component | Cloud Run Service Name | Deployed Revision | Traffic | Service URL |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Core API & BFF** | `drts-dev-api` | `drts-dev-api-00059-np2` | 100% | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app` |
| 2 | **Platform Admin Console** | `drts-dev-platform-admin-web` | `drts-dev-platform-admin-web-00053-7dq` | 100% | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app` |
| 3 | **Operations Console** | `drts-dev-ops-console-web` | `drts-dev-ops-console-web-00053-zzb` | 100% | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app` |
| 4 | **Fleet Partner Portal** | `drts-dev-fleet-partner-portal-web` | `drts-dev-fleet-partner-portal-web-00053-946` | 100% | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app` |
| 5 | **Tenant Console** | `drts-dev-tenant-console-web` | `drts-dev-tenant-console-web-00053-82v` | 100% | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app` |
| 6 | **Bank Console** | `drts-dev-bank-console-web` | `drts-dev-bank-console-web-00053-r24` | 100% | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app` |
| 7 | **Referral Embed** | `drts-dev-referral-embed-web` | `drts-dev-referral-embed-web-00053-8wq` | 100% | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` |
| 8 | **Enterprise Dispatch** | `drts-dev-enterprise-dispatch-web` | `drts-dev-enterprise-dispatch-web-00053-p7d` | 100% | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app` |
| 9 | **Channel Partner Portal** | `drts-channel-partner-portal-web` | `drts-channel-partner-portal-web-00053-pjh` | 100% | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app` |
| 10 | **Partner Booking** | `drts-dev-partner-booking-web` | *N/A (Paused)* | 0% | **PAUSED** (Cloud Run service removed; code preserved) |

### 3.2 Canonical `dev_service_urls` String for Machine Truth

```text
https://drts-dev-api-4t7rg6fmeq-uc.a.run.app,https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence,https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app,https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app
```

---

## 4. Acceptance Criteria Verification Matrix

| Acceptance Criterion | Verification Method & Source Evidence | Result |
| :--- | :--- | :--- |
| **Build and push** | Job `97139447891` built and pushed 10 container images to Artifact Registry `us-central1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts` tagged `4012b10c0cd4`. | **PASS** |
| **Migration** | Job `97140945310` executed Cloud Run job `drts-dev-migrate` against Cloud SQL with exit code 0; database schema compatibility validated across active Cloud Run services. | **PASS** |
| **Deployment** | Job `97141263816` deployed all 9 active Cloud Run services to region `us-central1` serving 100% traffic. | **PASS** |
| **Health checks succeed** | Job `97141682677` executed HTTP health check and referral handoff session suite against all active Dev service endpoints with 200 OK responses. | **PASS** |
| **Workflow and required job URLs are recorded** | Workflow run URL `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316` and all required job URLs recorded in Section 2.2. | **PASS** |
| **Deployed revisions identify the locked SHA** | Workflow was dispatched with `source_ref=4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (locked in PRE-001). Active services serve revision-pinned containers built from this SHA. | **PASS** |
| **Paused Partner Booking enforcement succeeds** | Job `97141634306` verified that `drts-dev-partner-booking-web` is absent from Cloud Run inventory while preserved in codebase. | **PASS** |

---

## 5. Handoff & Acceptance Evidence Parameters

The following parameters are prepared for handoff and downstream acceptance recording:

- **`dev_deploy_run_url`**: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616532316`
- **`dev_deploy_sha`**: `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`
- **`dev_service_urls`**: `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app,https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence,https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app,https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app`

