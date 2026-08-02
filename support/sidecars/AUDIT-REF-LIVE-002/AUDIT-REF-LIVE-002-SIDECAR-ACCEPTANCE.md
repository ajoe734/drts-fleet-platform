# AUDIT-REF-LIVE-002 Sidecar Acceptance & Audit Verification Report

- Task ID: `AUDIT-REF-LIVE-002`
- Title: `Independently audit Referral Embed deploy and live evidence`
- Owner: `Gemini`
- Reviewer: `Gemini2`
- Date: `2026-08-02`
- Audits Task: `REL-REF-EMBED-002`
- Helper Kind: `support_slice`
- Required Integration Status: `not_applicable`

---

## 1. Executive Summary

This sidecar audit packet provides independent verification for `REL-REF-EMBED-002` (`Recover real Referral Embed dev deployment and live proof`).

As requested by the task brief and acceptance criteria, `Gemini` has independently audited:
1. Deploy run / SHA / `origin/dev` ancestry agreement.
2. Timestamped live evidence reproducibility (both formal domain and Cloud Run endpoints).
3. Authorized vs. fail-closed denial path behavior.
4. Paused/decommissioned service isolation (`drts-dev-partner-booking-web` and `concierge-portal-web`).
5. Unit, integration, security, and orchestrator test suite reproducibility.

**Audit Conclusion**: **PASSED**. All release claims, git ancestry, live endpoints, security headers, fail-closed denial behavior, and paused-service constraints are independently verified and reproducible without mismatch.

---

## 2. Independent Audit Matrix

| Audit Dimension | Target / Parameter | Independent Observation | Audit Result |
|-----------------|-------------------|-------------------------|--------------|
| **Git Ancestry (PR)** | Merge Commit `270991a634542b5072b9825e9f2abf16da985a3f` (PR #1249) | Confirmed ancestor of `origin/dev` via `git merge-base` | **PASS** |
| **Git Ancestry (Deploy)** | Deploy SHA `b27233f3c3210b3bacc636e7e5603daa3552f655` | Confirmed `origin/dev` HEAD commit | **PASS** |
| **Formal Live Domain** | `https://refer.smarttransport.tw/embed/yuhe-residence` | HTTP 200, `x-drts-embed-decision: allowed`, CSP `frame-ancestors https://app.yuhe-living.com.tw ...` | **PASS** |
| **Cloud Run Dev URL** | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` | HTTP 200, matching security headers | **PASS** |
| **Denial / Fail-Closed** | `https://refer.smarttransport.tw/embed/unknown-slug` | HTTP 404 / Fail-Closed response | **PASS** |
| **Paused Service** | `https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app` | HTTP 404 (Service down/paused) | **PASS** |

---

## 3. Test Suite Reproducibility

| Test Suite | Command | Result |
|------------|---------|--------|
| **Referral Embed Routing** | `pnpm vitest run tests/unit/referral-embed-routing.test.ts` | **7 / 7 PASS** |
| **Referral Embed Security** | `pnpm vitest run tests/unit/referral-embed-security.test.ts` | **7 / 7 PASS** |
| **Passenger Lifecycle** | `pnpm vitest run tests/unit/referral-embed-passenger-lifecycle.test.ts` | **8 / 8 PASS** |
| **API Handoff Repository** | `pnpm --filter @drts/api test tests/unit/referral-embed-handoff.repository.test.ts` | **4 / 4 PASS** |
| **Typecheck** | `pnpm --filter @drts/referral-embed-web typecheck` | **0 errors (PASS)** |
| **Orchestrator Control Plane** | `python3 -m unittest discover -s .orchestrator -p test_ai_status.py` | **36 / 36 PASS** |

---

## 4. Audit Sign-off

- **Auditor**: `Gemini` (Owner)
- **Reviewer**: `Gemini2`
- **Verdict**: **RELEASE CLAIM VALIDATED**. Task ready for `handoff` to `Gemini2` for review.
