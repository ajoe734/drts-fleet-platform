# Stage 1 Dev Deployment Execution Analysis & Blocker Evidence (`S1F-REL-FIN-DEP-001`)

- **Task ID:** `S1F-REL-FIN-DEP-001`
- **Task Title:** Deploy the locked Stage 1 candidate to Dev
- **Owner:** `Gemini2`
- **Reviewer:** `Claude`
- **Base Branch:** `dev`
- **Task Branch:** `gemini2/s1f-rel-fin-dep-001`
- **Locked Candidate SHA:** `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`
- **Planning Ref:** [`docs/02-architecture/s1f-release-finalization-gap-20260821.md`](../02-architecture/s1f-release-finalization-gap-20260821.md) (§F4 Dev deployment)
- **System Design Ref:** [`docs/02-architecture/s1f-release-finalization-system-design-20260821.md`](../02-architecture/s1f-release-finalization-system-design-20260821.md) (§Deployment lane)
- **Execution Runbook Ref:** [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md) (§S1F-REL-FIN-DEP-001)
- **Status:** `blocked` (External GCP billing gate closed on project #952590575714)

---

## 1. Executive Summary & Posture

Task `S1F-REL-FIN-DEP-001` is responsible for dispatching the production-grade `Deploy — Dev` workflow (`.github/workflows/deploy-dev.yml`) for the locked Stage 1 release candidate, applying database migrations, deploying the 9 active Cloud Run services, verifying health checks, enforcing the paused state of Partner Booking, and capturing all workflow/job URLs and service revisions for downstream same-SHA operational acceptance (`S1F-REL-FIN-UAT-001`).

### Dependency Posture

1. **`S1F-REL-FIN-PRE-001` (Candidate Preflight & Lock):**
   - **Status:** Completed (`done`).
   - **Candidate Lock File:** [`docs/04-uat/s1f-rel-fin-pre-001-candidate-lock-20260821.json`](s1f-rel-fin-pre-001-candidate-lock-20260821.json).
   - **Locked SHA:** `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (PR #1451 merge commit on `dev`).
   - **CI Evidence:** PR CI run `31997270480` (22/22 checks passing); trunk CI run `31997773400` (14/14 check-runs success).
   - **Deployability:** Verified workflow syntax, manifest validity, and hermetic local gates.

2. **`S1F-REL-FIN-GCP-001` (GCP Billing / Artifact Registry Gate):**
   - **Status:** Verified (`done` for evidence recording, gate outcome is **CLOSED / non-complete**).
   - **Evidence File:** [`docs/04-uat/s1f-rel-fin-gcp-001-billing-artifact-registry-gate-evidence-20260821.md`](s1f-rel-fin-gcp-001-billing-artifact-registry-gate-evidence-20260821.md).
   - **Gate Outcome:** Cloud Billing is disabled on Dev project `drts-dev-ray-tw-20260730` (`952590575714`). Artifact Registry push operations fail with permission denied due to billing.

---

## 2. Empirical Verification of External Blocker

### 2.1 GCP Cloud Billing Status Inspection

Direct inspection using Google Cloud SDK against the configured Dev project confirmed that billing remains disabled:

```bash
$ gcloud beta billing projects describe drts-dev-ray-tw-20260730
billingAccountName: ''
billingEnabled: false
name: projects/drts-dev-ray-tw-20260730/billingInfo
projectId: drts-dev-ray-tw-20260730

$ gcloud projects describe drts-dev-ray-tw-20260730
createTime: '2026-07-30T16:54:12.611Z'
lifecycleState: ACTIVE
name: DRTS Dev Ray TW 20260730
parent:
  id: '225414480785'
  type: organization
projectId: drts-dev-ray-tw-20260730
projectNumber: '952590575714'
```

### 2.2 Historical GitHub Actions Deploy Runs

Every recent invocation of `.github/workflows/deploy-dev.yml` failed identically at the `Build & push images` step when attempting to push container images to `asia-east1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts`:

| Run ID | Timestamp (UTC) | Source Ref | Failing Job | Failure Reason |
| :--- | :--- | :--- | :--- | :--- |
| `32444483620` | 2026-08-21T03:45:02Z | `publish/v2026.08.21.0` | `Build & push images` (ID 96661427636) | `denied: This API method requires billing to be enabled. Please enable billing on project #952590575714` |
| `32329127021` | 2026-08-20T03:41:21Z | `publish/v2026.08.20.0` | `Build & push images` | `denied: billing required on project #952590575714` |
| `32213010214` | 2026-08-19T03:40:59Z | `publish/v2026.08.19.0` | `Build & push images` | `denied: billing required on project #952590575714` |
| `32096235996` | 2026-08-18T03:38:58Z | `publish/v2026.08.18.0` | `Build & push images` | `denied: billing required on project #952590575714` |
| `31992102746` | 2026-08-17T03:44:10Z | `publish/v2026.08.17.0` | `Build & push images` | `denied: billing required on project #952590575714` |

### 2.3 System Design Compliance & No-Auto-Retry Policy

Per `docs/02-architecture/s1f-release-finalization-system-design-20260821.md` §Failure behaviour and `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md` §Supervisor rules:
- **Rule 1:** "Do not dispatch `DEP-001` while `GCP-001` is non-complete."
- **Rule 2:** "Do not auto-retry a billing-denied deploy."
- **Rule 3:** "Billing unavailability is an external gate. It must remain explicit and must not be converted into a passing acceptance record."
- **Rule 4:** "Never use the legacy project as fallback."

In adherence to these explicit rules, `S1F-REL-FIN-DEP-001` **does not trigger repetitive failing workflow runs** or attempt insecure workarounds. Instead, the task records complete machine-readable verification evidence and holds in `blocked` state awaiting external billing remediation.

---

## 3. Dev Deployment Technical Specifications

When Cloud Billing is enabled for GCP project #952590575714, the following deployment parameters and jobs will execute:

### 3.1 Target Configuration Matrix

| Parameter | Configuration / Value | Source / Determination |
| :--- | :--- | :--- |
| **Workflow** | `.github/workflows/deploy-dev.yml` | Canonical Dev deploy workflow |
| **Source Ref** | `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` | Immutable locked candidate SHA |
| **Target Profile** | `current` | Standard Dev environment profile |
| **Skip Migration** | `false` | Apply pending database schema migrations |
| **GCP Project** | `drts-dev-ray-tw-20260730` (`952590575714`) | `vars.DEV_GCP_PROJECT_ID` |
| **Region** | `asia-east1` | `vars.DEV_GCP_REGION` |
| **Cloud SQL Instance** | `drts-dev-ray-tw-20260730:asia-east1:drts-dev-db` | `vars.DEV_GCP_CLOUDSQL_INSTANCE` |
| **Artifact Registry** | `asia-east1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts` | `DEV_ARTIFACT_*` variables |
| **Runtime Service Account** | `drts-dev-runtime@drts-dev-ray-tw-20260730.iam.gserviceaccount.com` | `vars.DEV_GCP_RUNTIME_SERVICE_ACCOUNT` |
| **Workload Identity Provider** | `projects/952590575714/locations/global/workloadIdentityPools/github-pool/providers/github-provider` | `secrets.DEV_WIF_PROVIDER` |

### 3.2 Service Catalog & Inventory (9 Active Services + 1 Migration Job + 1 Paused Service)

| # | Service Name | Surface / Component | Exposure | Health Check Endpoint |
| :- | :--- | :--- | :--- | :--- |
| 1 | `drts-dev-api` | Core Fleet Management API & BFF | `--allow-unauthenticated` | `/healthz`, `/api/v1/health` |
| 2 | `drts-dev-platform-admin-web` | Platform Admin Console | `--allow-unauthenticated` | `/` |
| 3 | `drts-dev-ops-console-web` | Operations Console | `--allow-unauthenticated` | `/` |
| 4 | `drts-dev-fleet-partner-portal-web` | Fleet Partner Portal | `--allow-unauthenticated` | `/` |
| 5 | `drts-dev-tenant-console-web` | Tenant Console | `--allow-unauthenticated` | `/` |
| 6 | `drts-dev-bank-console-web` | Bank Console | `--allow-unauthenticated` | `/` |
| 7 | `drts-dev-referral-embed-web` | Referral Embed Booking | `--allow-unauthenticated` | `/embed/yuhe-residence` |
| 8 | `drts-dev-enterprise-dispatch-web` | Enterprise Dispatch Portal | `--allow-unauthenticated` | `/` |
| 9 | `drts-channel-partner-portal-web` | Channel Partner Portal | `--allow-unauthenticated` | `/` |
| 10 | `drts-migrate` | Database Migration Job | Cloud Run Job | Exit code 0 |
| 11 | `drts-dev-partner-booking-web` | Partner Booking (**PAUSED**) | Inactive / 404 | Enforce paused state (scaled to 0 / ingress restricted) |

---

## 4. Post-Unblock Execution Runbook

Once an authorized GCP Administrator enables billing on Project #952590575714, the owner of `S1F-REL-FIN-DEP-001` or supervisor will execute the following standard sequence:

```bash
# 1. Re-verify that Cloud Billing is active (read-only verification)
gcloud beta billing projects describe drts-dev-ray-tw-20260730
# Expected output: billingEnabled: true

# 2. Dispatch the Dev deployment workflow targeting the locked SHA
gh workflow run deploy-dev.yml \
  --ref=dev \
  -f source_ref=4012b10c0cd4990bd238eaed6ddc23252bc0c8d4 \
  -f target_profile=current \
  -f skip_migration=false

# 3. Monitor workflow run until all jobs succeed
gh run watch <run-id>

# 4. Record deployment acceptance evidence in machine truth
AI_NAME=Gemini2 /home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-fb69a857b/tools/development-orchestrator/bin/ai-status.sh record-acceptance S1F-REL-FIN-DEP-001 \
  dev_deploy_run_url="https://github.com/ajoe734/drts-fleet-platform/actions/runs/<run-id>" \
  dev_deploy_sha="4012b10c0cd4990bd238eaed6ddc23252bc0c8d4" \
  dev_service_urls="<api-url>,<platform-admin-url>,<ops-console-url>,..."

# 5. Hand off to Reviewer (Claude) to proceed to Wave C (S1F-REL-FIN-UAT-001)
```

---

## 5. Required Remediation Link

To enable Cloud Billing on GCP project #952590575714:
[Enable Billing for Project 952590575714](https://console.developers.google.com/billing/enable?project=952590575714)
