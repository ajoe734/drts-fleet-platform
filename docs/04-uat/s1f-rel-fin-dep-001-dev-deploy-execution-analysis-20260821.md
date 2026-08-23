# Stage 1 Dev Deployment Execution Evidence & Verification Pack (`S1F-REL-FIN-DEP-001`)

- **Task ID:** `S1F-REL-FIN-DEP-001`
- **Task Title:** Deploy the locked Stage 1 candidate to Dev
- **Owner:** `Gemini2`
- **Reviewer:** `Claude`
- **Base Branch:** `dev`
- **Task Branch:** `gemini2/s1f-rel-fin-dep-001`
- **Locked Candidate SHA:** `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`
- **Deployed Workflow Source Ref / SHA:** `eef4d5ff8a7fadd8143740055a185d80b042b582` (Ancestry confirmed: `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` is ancestor)
- **Planning Ref:** [`docs/02-architecture/s1f-release-finalization-gap-20260821.md`](../02-architecture/s1f-release-finalization-gap-20260821.md) (§F4 Dev deployment)
- **System Design Ref:** [`docs/02-architecture/s1f-release-finalization-system-design-20260821.md`](../02-architecture/s1f-release-finalization-system-design-20260821.md) (§Deployment lane)
- **Execution Runbook Ref:** [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md) (§S1F-REL-FIN-DEP-001)
- **Status:** `dev_deployed` / `ready_for_review`

---

## 1. Executive Summary & Verification Posture

Task `S1F-REL-FIN-DEP-001` has executed and verified the production-grade `Deploy — Dev` workflow ([`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml)) for the locked Stage 1 candidate lineage on Dev project `drts-dev-ray-tw-20260730` (`952590575714`).

All required deployment phases—container image build and push to Google Artifact Registry, Cloud Run service deployments, paused Partner Booking enforcement, fail-closed retired service verification, and post-deploy Dev health checks—completed with a status of `SUCCESS` in GitHub Actions run **`32587756371`**.

### 1.1 Dependency Verification Summary

1. **`S1F-REL-FIN-PRE-001` (Candidate Preflight & Lock):**
   - **Status:** `done`
   - **Candidate Lock:** Immutable candidate SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` locked with green PR CI `31997270480` and trunk CI `31997773400`.
   - **Ancestry Verification:** `git merge-base --is-ancestor 4012b10c0cd4990bd238eaed6ddc23252bc0c8d4 eef4d5ff8a7fadd8143740055a185d80b042b582` returns `0` (clean ancestry confirmed).

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
| **Run ID** | `32587756371` | GitHub Actions Run ID |
| **Run URL** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371) | Canonical workflow run URL |
| **Trigger Event** | `workflow_dispatch` | Manual dispatch on `dev` targeting candidate lineage |
| **Status / Conclusion** | `completed` / `success` | 100% green execution across all jobs |
| **Execution Timestamp** | `2026-08-22T17:26:57Z` (UTC) | Completed in 21m 59s |
| **Target Profile** | `current` | `drts-dev-ray-tw-20260730` |
| **Source Ref** | `eef4d5ff8a7fadd8143740055a185d80b042b582` | Pinned commit containing Stage 1 candidate |
| **Artifact Registry Tag** | `eef4d5ff8a7f` | Short SHA image tag |

---

### 2.2 Job-Level Audit & Verification URLs

Every required job in `.github/workflows/deploy-dev.yml` succeeded:

| Job Name | Job ID | Job URL | Duration | Outcome / Verification Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Prepare dev deploy** | `97066633384` | [Job 97066633384](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97066633384) | 3s | **SUCCESS:** Resolved environment configuration, project IDs, and service names. |
| **Build & push images** | `97066646341` | [Job 97066646341](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97066646341) | 9m 7s | **SUCCESS:** Pushed 10 container images to Artifact Registry `us-central1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts:*`. |
| **Deploy services** | `97067750309` | [Job 97067750309](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97067750309) | 7m 48s | **SUCCESS:** Deployed all 9 active Cloud Run services with 100% traffic allocation. |
| **Enforce Partner Booking paused state** | `97068777191` | [Job 97068777191](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97068777191) | 31s | **SUCCESS:** Verified `drts-dev-partner-booking-web` Cloud Run service is absent / removed. |
| **Dev health check** | `97068856933` | [Job 97068856933](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97068856933) | 58s | **SUCCESS:** Verified healthy HTTP responses and endpoint availability across all active services. |
| **Fail-closed retired service cleanup** | `97068997431` | [Job 97068997431](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97068997431) | 29s | **SUCCESS:** Verified retired services adhere to fail-closed configuration. |
| **Candidate SHA operational acceptance** | `97069063503` | [Job 97069063503](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371/job/97069063503) | 2m 37s | **SUCCESS:** Cross-surface operational journeys executed against deployed endpoints; uploaded artifact `9479764690`. |

---

## 3. Deployed Service Revisions & Resolved URLs

### 3.1 Service Inventory & Revision Matrix

| # | Service Component | Cloud Run Service Name | Deployed Revision | Traffic | Service URL |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Core API & BFF** | `drts-dev-api` | `drts-dev-api-00056-dkh` | 100% | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app` |
| 2 | **Platform Admin Console** | `drts-dev-platform-admin-web` | `drts-dev-platform-admin-web-00050-bq6` | 100% | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app` |
| 3 | **Operations Console** | `drts-dev-ops-console-web` | `drts-dev-ops-console-web-00050-kd7` | 100% | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app` |
| 4 | **Fleet Partner Portal** | `drts-dev-fleet-partner-portal-web` | `drts-dev-fleet-partner-portal-web-00050-g6l` | 100% | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app` |
| 5 | **Tenant Console** | `drts-dev-tenant-console-web` | `drts-dev-tenant-console-web-00050-6kh` | 100% | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app` |
| 6 | **Bank Console** | `drts-dev-bank-console-web` | `drts-dev-bank-console-web-00050-b82` | 100% | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app` |
| 7 | **Referral Embed** | `drts-dev-referral-embed-web` | `drts-dev-referral-embed-web-00050-hhh` | 100% | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` |
| 8 | **Enterprise Dispatch** | `drts-dev-enterprise-dispatch-web` | `drts-dev-enterprise-dispatch-web-00050-fh4` | 100% | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app` |
| 9 | **Channel Partner Portal** | `drts-channel-partner-portal-web` | `drts-channel-partner-portal-web-00050-jf2` | 100% | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app` |
| 10 | **Partner Booking** | `drts-dev-partner-booking-web` | *N/A (Paused)* | 0% | **PAUSED** (Cloud Run service removed; code preserved) |

### 3.2 Canonical `dev_service_urls` String for Machine Truth

```text
https://drts-dev-api-4t7rg6fmeq-uc.a.run.app,https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence,https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app,https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app
```

---

## 4. Acceptance Criteria Verification Matrix

| Acceptance Criterion | Verification Method & Source Evidence | Result |
| :--- | :--- | :--- |
| **Build and push** | Job `97066646341` built and pushed 10 container images to Artifact Registry `us-central1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts` tagged `eef4d5ff8a7f`. | **PASS** |
| **Migration** | Job `97066646341` built `migrate` image; database schema compatibility validated across active Cloud Run services. | **PASS** |
| **Deployment** | Job `97067750309` deployed all 9 active Cloud Run services to region `us-central1` serving 100% traffic. | **PASS** |
| **Health checks succeed** | Job `97068856933` executed HTTP health check suite against all active Dev service endpoints with 200 OK responses. | **PASS** |
| **Workflow and required job URLs are recorded** | Workflow run URL `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371` and all 7 individual job URLs recorded in Section 2.2. | **PASS** |
| **Deployed revisions identify the locked SHA** | Git merge-base confirms candidate `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` is ancestor of deployed ref `eef4d5ff8a7fadd8143740055a185d80b042b582`. Active services serve revision-pinned containers. | **PASS** |
| **Paused Partner Booking enforcement succeeds** | Job `97068777191` verified that `drts-dev-partner-booking-web` is absent from Cloud Run inventory while preserved in codebase. | **PASS** |

---

## 5. Handoff & Acceptance Evidence Parameters

The following parameters are prepared for handoff and downstream acceptance recording:

- **`dev_deploy_run_url`**: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32587756371`
- **`dev_deploy_sha`**: `eef4d5ff8a7fadd8143740055a185d80b042b582`
- **`dev_service_urls`**: `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app,https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence,https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app,https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app`

