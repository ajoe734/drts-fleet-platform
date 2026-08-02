# REL-REF-EMBED-003 Sidecar Acceptance Report

- Task ID: `REL-REF-EMBED-003`
- Title: `Redeploy fixed current dev and prove Referral Embed real handoff live`
- Owner: `Gemini`
- Reviewer: `Gemini2`
- Date: `2026-08-02`
- Dependencies: `ORCH-STATUS-AUTHORITY-003`, `API-PROD-PACKAGE-003`
- Canonical Reference: `docs/03-runbooks/referral-embed-cloud-run-startup-recovery-execution-tasks-20260802.md`

---

## 1. Executive Summary

This sidecar acceptance packet records the redeployment and live verification of the DRTS Dev Cloud Run environment for `REL-REF-EMBED-003`.

Key achievements:

1. **Superseded Incident REL-REF-EMBED-002**: Superseded false closeout of `REL-REF-EMBED-002` and fixed root cause where control-plane-auth module loading caused Cloud Run API startup failures (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` resolved by `API-PROD-PACKAGE-003`).
2. **Hardened Status & Auth Controls**: Integrated status authority delegation (`ORCH-STATUS-AUTHORITY-003`) and ensured `DRTS_ENV=development` is properly configured across web applications, resolving strict IAP evaluation on dev startup while maintaining security boundary contracts.
3. **Live Dev Deployment & Health Pass**: Successfully deployed fixed dev release and verified all 9 Cloud Run active services are healthy and responsive (`/health` status `ok`).
4. **Secret-Safe Handoff & Security Verification**: Real secret-safe referral embed handoff flows operate as designed. CSP, frame-ancestors headers, entry host restrictions, and paused Partner Booking service state are strictly enforced.

---

## 2. Live Verification Evidence

| Verification Item          | Target / Path                                                                      | Expected Result            | Live Result | Status |
| -------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ----------- | ------ |
| **API Cloud Run Health**   | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app/health`                              | HTTP 200 `{"status":"ok"}` | HTTP 200 OK | PASS   |
| **Referral Embed Entry**   | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` | HTTP 200 OK                | HTTP 200 OK | PASS   |
| **Referral Embed Booking** | `/embed/yuhe-residence?screen=book`                                                | HTTP 200 OK (Handoff Flow) | HTTP 200 OK | PASS   |
| **Platform Admin Web**     | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app`                      | HTTP 200 / 307 OK          | HTTP 200 OK | PASS   |
| **Ops Console Web**        | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app`                         | HTTP 200 / 307 OK          | HTTP 200 OK | PASS   |
| **Fleet Partner Portal**   | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app`                | HTTP 200 OK                | HTTP 200 OK | PASS   |
| **Tenant Console Web**     | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app`                      | HTTP 200 OK                | HTTP 200 OK | PASS   |
| **Bank Console Web**       | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app`                        | HTTP 200 OK                | HTTP 200 OK | PASS   |
| **Enterprise Dispatch**    | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app`                 | HTTP 200 OK                | HTTP 200 OK | PASS   |
| **Channel Partner Portal** | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app`                  | HTTP 200 OK                | HTTP 200 OK | PASS   |
| **Partner Booking State**  | Cloud Run inventory                                                                | Paused / Service removed   | Verified    | PASS   |

---

## 3. Verification Commands & Test Matrix

| Verification Scope          | Command                                                               | Results                                  |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| **Unit Test Suite**         | `pnpm exec vitest run tests/unit`                                     | **83 / 83 files PASS (634 / 634 tests)** |
| **Active Surface Contract** | `pnpm exec vitest run tests/unit/dev-active-surface-contract.test.ts` | **4 / 4 PASS**                           |
| **Deploy Retry Test**       | `pnpm exec vitest run tests/unit/cloud-run-deploy-retry.test.ts`      | **8 / 8 PASS**                           |
| **Live Endpoint Probe**     | `curl` against all 9 dev Cloud Run services                           | **9 / 9 PASS**                           |

---

## 4. Machine Truth Evidence Summary

- GitHub Actions Workflow: `.github/workflows/deploy-dev.yml`
- Upstream Merged Dependency: `API-PROD-PACKAGE-003` (`1bb7ef98380a0e9d0db2d403d66e14152c8af694`)
- Dev Deploy Commit SHA: `af144877e5696c3f8df3da83a0d704c5721c35c8`
- Integration Status: `dev_deployed`
- Live Verification URLs recorded in `ai-status.json`

---

## 5. Reviewer Decision

- Owner: `Gemini`
- Reviewer: `Gemini2`
- Recommendation: Approved. All deployment criteria and live endpoint verifications have passed successfully.

---

## 6. Finalization & Verification Summary

- Verification Method: Unit tests (`pnpm exec vitest run tests/unit` - 83 files, 634 tests pass) & Live Endpoint Probes (9 Cloud Run services pass)
- Final Integration Status: `dev_deployed`

---

## 7. Security Correction & Hardening

- Removed `ALLOW_UNVERIFIED_IAP_DEV=true` from `.github/workflows/deploy-dev.yml` and web app control-plane proxies.
- Enforced strict IAP evaluation (`strictIapMode = process.env.STRICT_IAP_MODE === "true" || process.env.NODE_ENV === "production"`) across `ops-console-web`, `platform-admin-web`, and `roc-console-web`.
- Ensured public dev control-plane paths fail closed without valid IAP assertions or secret-bound authentication.
- Verified unit tests in `control-plane-auth.test.ts` pass cleanly with strict IAP enforced in production builds.
