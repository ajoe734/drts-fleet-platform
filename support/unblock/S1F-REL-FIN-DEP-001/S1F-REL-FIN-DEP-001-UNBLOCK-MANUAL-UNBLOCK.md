# S1F-REL-FIN-DEP-001 Manual Unblock

- Task: `S1F-REL-FIN-DEP-001-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `S1F-REL-FIN-DEP-001`
- Owner: `Gemini2`
- Reviewer: `Claude`
- Date: `2026-08-21`
- Status: `documented remaining external blocker (GCP Cloud Billing)`

## 1. Diagnosis

`S1F-REL-FIN-DEP-001` ("Deploy the locked Stage 1 candidate to Dev") is declared with two dependencies:
1. `S1F-REL-FIN-PRE-001` (Candidate Preflight & Lock)
2. `S1F-REL-FIN-GCP-001` (Verify the external GCP billing and Artifact Registry gate)

Both dependencies are currently in status `done` in `ai-status.json`:
- **`S1F-REL-FIN-PRE-001` (`done`):** Successfully locked the immutable candidate SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (PR #1451 merge commit on `dev`), verified PR CI 22/22 and trunk CI 14/14 green, verified deploy workflow syntax and manifests.
- **`S1F-REL-FIN-GCP-001` (`done`):** Successfully performed the read-only audit and verification of the external GCP billing gate. The audit verified that Cloud Billing on Dev GCP project `drts-dev-ray-tw-20260730` (`952590575714`) is **disabled** (`billingEnabled: false`), and that Artifact Registry operations fail with authentication/billing denial.

### Why Parent `S1F-REL-FIN-DEP-001` Remains Blocked

Although `S1F-REL-FIN-GCP-001` is marked `done` as a verification task, the underlying external gate itself is **CLOSED**:
- Deploying to Dev requires building container images and pushing them to Google Artifact Registry (`asia-east1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts`), and executing Cloud Run services and jobs in project `drts-dev-ray-tw-20260730`.
- Because billing is disabled on project #`952590575714`, Artifact Registry rejects push tokens with:
  `ERROR: failed to build: failed to solve: failed to fetch oauth token: denied: This API method requires billing to be enabled. Please enable billing on project #952590575714 by visiting https://console.developers.google.com/billing/enable?project=952590575714 then retry.`

Per canonical system design and execution rules:
- `docs/02-architecture/s1f-release-finalization-system-design-20260821.md` §Failure behaviour:
  *"Billing unavailable: keep `GCP-GATE` non-complete with the current failing run URL and provider error. Do not repeatedly dispatch deploy runs."*
- `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md` §Supervisor rules:
  *"Do not dispatch `DEP-001` while `GCP-001` is non-complete. Do not auto-retry a billing-denied deploy. Treat GitHub Actions and GCP responses as external evidence, not code defects."*
- **No legacy GCP project fallback:** Never substitute legacy projects (`vars.GCP_PROJECT_ID`) or weaken IAM authentication.

Therefore, `S1F-REL-FIN-DEP-001` cannot proceed with workflow dispatch until Cloud Billing is enabled externally on GCP project #`952590575714`.

---

## 2. Empirical Verification of Remaining Blocker

### 2.1 GCP Cloud Billing Status (Live Probe)

Direct inspection using the Google Cloud SDK against Dev project `drts-dev-ray-tw-20260730` confirms billing is disabled:

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

Every recent run of `.github/workflows/deploy-dev.yml` failed identically at the `Build & push images` step:

| Run ID | Timestamp (UTC) | Source Ref | Failing Job | Failure Reason |
| :--- | :--- | :--- | :--- | :--- |
| `32444483620` | 2026-08-21T03:45:02Z | `publish/v2026.08.21.0` | `Build & push images` | `denied: This API method requires billing to be enabled. Please enable billing on project #952590575714` |
| `32329127021` | 2026-08-20T03:41:21Z | `publish/v2026.08.20.0` | `Build & push images` | `denied: billing required on project #952590575714` |
| `32213010214` | 2026-08-19T03:40:59Z | `publish/v2026.08.19.0` | `Build & push images` | `denied: billing required on project #952590575714` |
| `32096235996` | 2026-08-18T03:38:58Z | `publish/v2026.08.18.0` | `Build & push images` | `denied: billing required on project #952590575714` |
| `31992102746` | 2026-08-17T03:44:10Z | `publish/v2026.08.17.0` | `Build & push images` | `denied: billing required on project #952590575714` |

---

## 3. Remaining External Blocker Specification

- **GCP Project ID:** `drts-dev-ray-tw-20260730`
- **GCP Project Number:** `952590575714`
- **Current State:** `billingEnabled: false`
- **Required External Action:** An authorized GCP Billing Administrator must associate an active Cloud Billing Account with project `drts-dev-ray-tw-20260730` (`952590575714`).
- **Remediation URL:** [https://console.developers.google.com/billing/enable?project=952590575714](https://console.developers.google.com/billing/enable?project=952590575714)

---

## 4. Concrete Parent Next Step (Post-Unblock Execution Plan)

Once Cloud Billing is enabled for GCP project #`952590575714`, `S1F-REL-FIN-DEP-001` will proceed immediately through the following execution sequence:

1. **Verify Billing Enablement (Read-Only):**
   ```bash
   gcloud beta billing projects describe drts-dev-ray-tw-20260730
   # Verify billingEnabled: true
   ```

2. **Transition Parent State in Orchestrator:**
   ```bash
   AI_NAME=Gemini2 /home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-fb69a857b/tools/development-orchestrator/bin/ai-status.sh start S1F-REL-FIN-DEP-001 "GCP billing enabled; dispatching Dev deploy workflow for locked SHA 4012b10c0cd4"
   ```

3. **Dispatch Dev Deploy Workflow:**
   ```bash
   gh workflow run deploy-dev.yml \
     --ref=dev \
     -f source_ref=4012b10c0cd4990bd238eaed6ddc23252bc0c8d4 \
     -f target_profile=current \
     -f skip_migration=false
   ```

4. **Monitor Workflow Run to Green Completion:**
   ```bash
   gh run watch <run-id>
   ```

5. **Capture Acceptance Evidence in Machine Truth:**
   - Record `dev_deploy_run_url`: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/<run-id>`
   - Record `dev_deploy_sha`: `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`
   - Record `dev_service_urls`: Cloud Run service endpoints for the 9 active services:
     1. `drts-dev-api`
     2. `drts-dev-platform-admin-web`
     3. `drts-dev-ops-console-web`
     4. `drts-dev-fleet-partner-portal-web`
     5. `drts-dev-tenant-console-web`
     6. `drts-dev-bank-console-web`
     7. `drts-dev-referral-embed-web`
     8. `drts-dev-enterprise-dispatch-web`
     9. `drts-channel-partner-portal-web`
   - Verify migration job `drts-migrate` succeeded with exit code 0.
   - Verify Paused Partner Booking (`drts-dev-partner-booking-web`) enforcement.

6. **Hand Off for Review:**
   Hand off to Reviewer (`Claude`) to verify evidence and transition to Wave C (`S1F-REL-FIN-UAT-001`).

---

## 5. Recommended Parent Machine-Truth Note

> `S1F-REL-FIN-DEP-001` remains blocked by external GCP Cloud Billing on project #952590575714 (`billingEnabled: false`). Diagnosis and post-unblock runbook documented in `support/unblock/S1F-REL-FIN-DEP-001/S1F-REL-FIN-DEP-001-UNBLOCK-MANUAL-UNBLOCK.md`. Once billing is enabled at https://console.developers.google.com/billing/enable?project=952590575714, re-probe billing and dispatch `.github/workflows/deploy-dev.yml` for locked SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`.

---

## 6. Why No Canonical Code Change Was Needed

- **Root Cause:** The blocker is strictly external cloud infrastructure configuration (GCP billing account linkage on project `952590575714`), not repository code, schema, workflow definition, or build script defect.
- **Workflow & Candidate Integrity:** The locked candidate SHA (`4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`) and deploy workflow (`.github/workflows/deploy-dev.yml`) are verified valid and ready.
- **Policy Compliance:** System design rules strictly prohibit falling back to legacy projects or bypassing external gates. Creating this unblock diagnostic document captures the exact failure mode and concrete resume runbook without introducing improper workarounds.

---

## 7. Source Pointers

- `ai-status.json` entries for `S1F-REL-FIN-DEP-001`, `S1F-REL-FIN-PRE-001`, `S1F-REL-FIN-GCP-001`, `S1F-REL-FIN-DEP-001-UNBLOCK-MANUAL-UNBLOCK`
- `docs/02-architecture/s1f-release-finalization-system-design-20260821.md`
- `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`
- `.github/workflows/deploy-dev.yml`
- `docs/04-uat/s1f-rel-fin-gcp-001-billing-artifact-registry-gate-evidence-20260821.md`
