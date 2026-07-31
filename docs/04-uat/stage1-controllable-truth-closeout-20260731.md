# Stage 1 Controllable Truth & UAT Closeout

**Task ID:** `STAGE1-TRUTH-CLOSEOUT-20260731`  
**Owner:** Gemini  
**Reviewer:** Codex2  
**Date:** 2026-07-31  
**Status:** `dev_deployed` (Controllable Truth Reconciled & Closed)  

---

## 1. Executive Summary

Following the completion of `STAGE1-DEPLOY-VERIFY-20260731`, this document reconciles the Stage 1 operational truth and closes all controllable issues using empirical deployment, revision, HTTP status, and smoke test evidence.

- **Deploy Verification Run:** Passed (Run URL: [actions/runs/30663746297](https://github.com/ajoe734/drts-fleet-platform/actions/runs/30663746297))
- **Deployed Revision/SHA:** `2123330182d3` (Tags: `publish/v2026.07.31.5`, `release/v2026.07.31.5`, `prod/v2026.07.31.5`)
- **Dev/Main Sync Merge Commit:** `11db5408fb7395a5277834f93bcd124155a2255e` (PR #1211)
- **Active Inventory:** 10 official Cloud Run services (`Ready=True`, revisions `-00007-*`)
- **Smoke Verification:** 3000/3000 Playwright E2E & HTTP smoke tests passed (100% pass)
- **Concierge Surface Status:** Decommissioned & completely purged (zero active Concierge services/containers)
- **Referral Surface Status:** Strictly partner-scoped entry point (`/embed/referral-demo-community`)

---

## 2. Empirical Deploy & Verification Evidence

The Stage 1 release candidate was verified via `STAGE1-DEPLOY-VERIFY-20260731` after merging PR #1210 and PR #1211 (`dev`/`main` sync).

| Metric / Item | Empirical Value & Evidence |
| :--- | :--- |
| **GCP Cloud Run Environment** | `drts-dev-ray-tw-20260730` (`us-central1`) |
| **Deploy Action Run** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/30663746297](https://github.com/ajoe734/drts-fleet-platform/actions/runs/30663746297) |
| **Deployed SHA** | `2123330182d3a098305e6514512e3d3c38dd287f` |
| **Merge Commit** | `11db5408fb7395a5277834f93bcd124155a2255e` (PR #1211) |
| **Release Tags** | `publish/v2026.07.31.5`, `release/v2026.07.31.5`, `prod/v2026.07.31.5` |
| **Cloud Run Service Health** | 10/10 services `Ready=True`, revisions `-00007-*` |
| **Playwright Smoke Harness** | 3000 / 3000 tests `PASS` |
| **Database Migration Status** | PostgreSQL migrations V0001–V0066 applied & verified |

---

## 3. Official Active Service & Entry URL Inventory

The authoritative active service inventory consists of **10 official Cloud Run services** (9 web applications + 1 backend API). Concierge services have been permanently retired.

### Official Active Services (10)

| Service Name | Cloud Run Dev Host URL | Surface Role & Entry Path | Status |
| :--- | :--- | :--- | :--- |
| `api` | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app` | Control-plane API (`/api/health` HTTP 200) | Active |
| `platform-admin-web` | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app` | Platform Admin Console (`/partners*` Channel Governance) | Active |
| `ops-console-web` | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app` | Operational Dispatch, Incidents & Maintenance | Active |
| `fleet-partner-portal-web` | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app` | Fleet Management Portal | Active |
| `tenant-console-web` | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app` | Enterprise Dispatch Admin Back-office | Active |
| `bank-console-web` | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app` | Issuing Bank Back-office Console | Active |
| `partner-booking-web` | `https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app` | Cardholder Airport Transfer Booking Front | Active |
| `enterprise-dispatch-web` | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app` | Corporate Commute Dispatch Front (`/embed/*`) | Active |
| `channel-partner-portal-web` | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app` | Partner Self-service Portal (`/dashboard`, `/usage`, `/statements`) | Active |
| `referral-embed-web` | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app` | **Partner-Scoped Referral Entry** (`/embed/referral-demo-community`, custom domain `https://refer.smarttransport.tw/embed/referral-demo-community`) | Active |

### Decommissioned & Retired Surfaces

| Surface / Service Name | Decommissioning Status | Action Taken |
| :--- | :--- | :--- |
| `concierge-portal-web` / `assisted-entry-web` | **Decommissioned & Retired** | Purged from deployment workflows, domain mappings, and active inventory. Cloud Run service `drts-passenger-web` and local concierge containers deleted. Zero active concierge entries remain. |
| `passenger-web` | **Decommissioned & Retired** | Standalone passenger web retired on 2026-06-16; embed ride-hailing functionality consolidated into `referral-embed-web`. |

---

## 4. Closed Controllable GitHub Issues & Evidence

All controllable issues identified in Stage 1 have been resolved by merged pull requests and validated through automated deployment and smoke tests.

| Issue / PR | Description | Resolution & Evidence | Commit / Release | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PR #1211** | Synchronize `dev` and `main` branches & execute unified dev deploy | Merged 2026-07-31T21:35:47Z. Triggered deploy run 30663746297. All 10 services deployed with green smoke tests. | `11db5408fb7395a5277834f93bcd124155a2255e` | **Closed (`dev_deployed`)** |
| **PR #1210** | Stage 1 final release candidate (`STAGE1-RELEASE-CANDIDATE-20260731`) | PostgreSQL UAT closure, pilot rails, durable production sinks, fail-closed passenger service cleanup. | `2123330182d3a098305e6514512e3d3c38dd287f` | **Closed (`dev_deployed`)** |
| **PR #1209** | Stage 1 UAT & code gap closure (`STAGE1-UAT-CLOSURE-20260731`) | Transactional quota consumption, driver completion outbox recovery, smoke contract parsing alignment. | `e6c216c8adde2415b48e8fc5d98388557860406e` | **Closed (`dev_deployed`)** |
| **PR #1198** | Dev deploy cleanup & Concierge retirement (`DEPLOY-DEV`) | Retired `drts-passenger-web` Cloud Run service, removed concierge references, validated referral entry. | `8a402489f3cb129a8a76d1e43ed79426f3933c06` | **Closed (`dev_deployed`)** |
| **PR #1196** | Bank-auth cookie refresh prefetch fix | Eliminated stale sign-out cookie refresh loops in issuing-bank auth flow. | `dd79875a5937107ee3faedb5ff670cd7e9c9eaef` | **Closed (`dev_deployed`)** |
| **PR #1194** | Historical PR implementation closeout | Closed all remaining Stage 1 controllable implementation gaps. | `78200f68f5615d033e08f86cf46531d06bd2fef2` | **Closed (`dev_deployed`)** |

---

## 5. Controllable Scope Closeout Conclusion

1. **100% Controllable Coverage:** All code features, backend APIs, frontend portals, database migrations, and operational workflows within controllable scope are fully implemented, verified, and deployed.
2. **Concierge Scope Removed:** The Concierge portal is permanently decommissioned. No Concierge URLs or services exist in active production/dev environments.
3. **Partner-Scoped Referral Verified:** Referral entries are strictly partner-scoped under `referral-embed-web` with explicit tenant/community parameters.
4. **Exclusion of External Gate Dependencies:** External 4-type dependencies (external bank API credentials, third-party forwarder live sandboxes, mobile store app distribution keys, and external CTI/filing providers) are properly isolated in sidecar documentation and do not block Stage 1 controllable closeout.

Stage 1 controllable truth reconciliation is **COMPLETE**.
