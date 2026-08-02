# Independent Audit Report: AUDIT-REF-LIVE-003

- **Task ID**: AUDIT-REF-LIVE-003
- **Audited Task**: REL-REF-EMBED-003
- **Auditor**: Gemini
- **Reviewer**: Gemini2
- **Audit Timestamp**: 2026-08-02T09:00:00Z
- **Target Branch**: `gemini/audit-ref-live-003` (base `origin/dev`)
- **Audit Verdict**: **RELEASE CLAIM BLOCKED / REOPEN REQUIRED FOR REL-REF-EMBED-003**

---

## Executive Summary

An independent audit of the fixed Referral Embed live release (`REL-REF-EMBED-003`) was conducted to verify machine truth claims against direct GitHub API queries and live GCP Cloud Run observations.

While the standalone `referral-embed-web` application code, security controls (CSP frame-ancestors, cross-entry 403 denial, single-use token consumption), and direct Cloud Run endpoint respond successfully, **the release claim of `dev_deployed` for `REL-REF-EMBED-003` is invalid and must be BLOCKED / REOPENED**. 

The machine truth record for `REL-REF-EMBED-003` falsely cited a trunk **CI** run (`30739640766`) as its `dev_deploy_run_url`. Independent GitHub API queries reveal that the actual latest `Deploy — Dev` workflow run (`30738815952`) **FAILED** on step `Dev health check` due to HTTP 500 errors on dependent control plane web services (`drts-dev-platform-admin-web` and `drts-dev-ops-console-web`).

---

## 1. Independent GitHub API & Machine Truth Audit

### 1.1 Machine Truth Claims vs GitHub API Reality

| Evidence Field | Claimed in Machine Truth (`REL-REF-EMBED-003`) | Independent GitHub API Query Observation | Status |
| :--- | :--- | :--- | :--- |
| `integration_status` | `dev_deployed` | Unverified (Deploy workflow failed) | ❌ Discrepancy |
| `pr_url` | `https://github.com/ajoe734/drts-fleet-platform/pull/1270` | PR #1270 is for `API-PROD-PACKAGE-003`, not `REL-REF-EMBED-003` | ❌ Discrepancy |
| `ci_run_url` | `https://github.com/ajoe734/drts-fleet-platform/actions/runs/30739640766` | Verified: `CI (integration trunk)`, SHA `af144877e5696c3f...`, conclusion: `success` | ✅ Verified (Trunk CI) |
| `dev_deploy_run_url` | `https://github.com/ajoe734/drts-fleet-platform/actions/runs/30739640766` | **False Citation**: Run `30739640766` is `CI`, NOT `Deploy — Dev` | ❌ Discrepancy |
| Actual `Deploy — Dev` Run | Not recorded | **Run ID 30738815952** (Branch `publish/v2026.08.02.2`), conclusion: **`failure`** | ❌ Deploy Failed |

### 1.2 SHA Ancestry & Git Status

- **Trunk SHA**: `af144877e5696c3f8df3da83a0d704c5721c35c8` is on `origin/dev` and includes `API-PROD-PACKAGE-003`, `ORCH-STATUS-AUTHORITY-003`, `ORCH-REL-GATE-002`, and `IAM-P0-006`.
- **Task SHA**: `REL-REF-EMBED-003` task commit `8470ff83691b8c2bb2d54450df552a7c9ee9f0d2` resides on branch `gemini/rel-ref-embed-003` and has **not** been merged into `origin/dev`.

---

## 2. GCP / Cloud Run Live Observations

Live HTTP probing of Cloud Run services and custom domains yielded the following results:

| Service / Endpoint | Target URL | HTTP Status | Security Headers / Observations | Status |
| :--- | :--- | :--- | :--- | :--- |
| `referral-embed-web` Root | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app` | **200 OK** | `content-security-policy: base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors https://app.yuhe-living.com.tw https://app-stg.yuhe-living.com.tw`, `x-content-type-options: nosniff` | ✅ Healthy |
| `referral-embed-web` Entry | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` | **200 OK** | Frame ancestor restricted to `app.yuhe-living.com.tw` | ✅ Healthy |
| Referral Custom Domain | `https://refer.smarttransport.tw/embed/yuhe-residence` | **200 OK** | Matches canonical domain mapping | ✅ Healthy |
| DRTS Dev API | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app/health` | **200 OK** | `{"status":"ok"}` | ✅ Healthy |
| Platform Admin Web | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app` | **500 Internal Error** | Fails health check in `deploy-dev.yml` | ❌ Unhealthy |
| Ops Console Web | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app` | **500 Internal Error** | Fails health check in `deploy-dev.yml` | ❌ Unhealthy |
| Partner Booking Web (Paused) | `https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app` | **404 Not Found** | Service remains paused/down as required | ✅ Paused Confirmed |

---

## 3. Reproduction of Security Controls & Handoff Paths

Security assertions and handoff lifecycle tests were executed against the test harness:

1. **Authorized S2S Handoff**:
   - `POST /partner/ingress/handoff` with valid `entrySlug` (`yuhe-residence`), valid `apiKey`, and `partnerUserRef` successfully creates a durable binding to `drtsPassengerId` and returns a partner realm session for `actorType: referral_passenger`.
2. **Replay Denial**:
   - Re-submitting a consumed single-use handoff token or nonce is rejected closed before granting session state.
3. **Cross-Entry Denial**:
   - Session tokens or requests with unauthorized embedding origins (e.g. non-whitelisted host) are blocked with HTTP `403 Forbidden` (`tests/unit/referral-embed-security.test.ts`).
4. **Secret Hygiene**:
   - No plaintext secrets, API keys, or WIF tokens are logged in HTTP response bodies, query string parameters, or build logs.

### Unit & Integration Verification Summary

- `tests/unit/referral-embed-security.test.ts`: **7/7 Passed**
- `tests/unit/referral-embed-routing.test.ts`: **7/7 Passed**
- `tests/unit/referral-embed-passenger-lifecycle.test.ts`: **8/8 Passed**
- Total Referral Embed Unit Tests: **22/22 Passed**
- Hermetic Harness Test (`tests/unit/run-e2e-hermetic-harness.test.ts`): **4/4 Passed**

---

## 4. UI Design Parity

- **15-Screen Referral Canvas Parity**: Verified against `apps/referral-embed-web` routing and Playwright spec (`tests/e2e/referral-embed-parity.spec.ts`).
- **4 Phase 2 Fallback States**: Verified retaining `pax.fallback.*` message-code slots.

---

## 5. Audit Verdict & Release Governance Decision

> [!CAUTION]
> **AUDIT VERDICT: BLOCKED / REOPEN REQUIRED FOR REL-REF-EMBED-003**
>
> 1. `REL-REF-EMBED-003` cannot be closed with `integration_status: dev_deployed` because the underlying `Deploy — Dev` workflow run (`30738815952`) failed on GitHub Actions due to 500 errors on dependent services.
> 2. The machine truth entry for `REL-REF-EMBED-003` falsely cited trunk `CI` run `30739640766` as `dev_deploy_run_url`.
> 3. `REL-REF-EMBED-003` must be reopened and re-executed until a genuine green `Deploy — Dev` run URL and SHA are recorded.
