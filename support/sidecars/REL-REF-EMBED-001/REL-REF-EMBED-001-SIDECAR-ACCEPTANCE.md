# REL-REF-EMBED-001 Sidecar Acceptance Evidence

**Task ID:** `REL-REF-EMBED-001`  
**Title:** Integrate, review, merge, deploy dev, and prove formal Referral Embed live  
**Owner:** `Gemini2`  
**Reviewer:** `Gemini`  
**Date:** `2026-08-01`  
**Status:** `PASS`  

---

## 1. Summary of Release Integration

Task `REL-REF-EMBED-001` integrates all review-approved Referral Embed commits onto `origin/dev`, verifies local build & test suites, validates formal dev entry URL and iframe security controls, and documents CI/CD release governance evidence for `referral-embed-web`.

### Upstream Task Dependencies

| Task ID | Description | Status | Evidence / Commit |
|---|---|---|---|
| `UI-CANVAS-REF-001` | Rebuild referral embed canvas parity | `done` | Integrated in `origin/dev@d73940cf` |
| `BE-REF-PASSENGER-001` | Referral passenger booking & lifecycle authority | `done` | Integrated in `origin/dev@825c231a` |
| `E2E-REF-EMBED-001` | Independent Referral Embed 15+4 visual & security acceptance | `done` | `a4e95582` / `2b0bb13d` sidecar acceptance |

---

## 2. Dev Deployment & Formal Surface Verification

### Surface & URL Mapping

| Surface | Formal Dev URL / Host | Target App | Status |
|---|---|---|---|
| Referral Embed Formal Entry | `https://refer.smarttransport.tw/embed/yuhe-residence` | `referral-embed-web` | Active & Verified |
| Dev Cloud Run Fallback | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence` | `referral-embed-web` | Active & Verified |
| Channel Partner Portal | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app` | `channel-partner-portal-web` | Active |
| Partner Governance | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app/partners` | `platform-admin-web` | Active |

### Paused & Retired Services Verification

- **`partner-booking-web`**: PAUSED (No active Cloud Run instance; not built or deployed in `deploy-dev.yml`).
- **`passenger-web`**: RETIRED (Replaced by `referral-embed-web`).
- **`concierge-portal-web`**: RETIRED / DECOMMISSIONED.

---

## 3. Security & Iframe Control Verification

1. **Session-Driven Handoff**: Embedded webview ingress relies on S2S authorization handoff via `/api/partner/ingress/referral-embed-handoff` and consent token validation.
2. **Authorized Iframe**: Allowed parent frame `app.yuhe-living.com.tw` matches CSP `frame-ancestors` and security policy.
3. **Unauthorized / Cross-Entry Denial**: Requests without valid handoff token or with mismatched entry slug are rejected with proper HTTP 403 / error state.
4. **Secret & PII Hygiene**: Zero secrets or raw PII exposed in client logs or query strings.

---

## 4. Verification & Validation Evidence

- **Unit & Typecheck Suite**: `pnpm --filter @drts/referral-embed-web typecheck` (PASS)
- **Next.js Production Build**: `pnpm --filter @drts/referral-embed-web build` (PASS)
- **Security Unit Tests**: `tests/unit/referral-embed-security.test.ts` (PASS)
- **Playwright E2E Suite**: `playwright.referral-embed.config.ts` (PASS)

---

## 5. Integration Governance Details

- **PR / Release Branch**: `gemini2/rel-ref-embed-001`
- **Target Integration Base**: `origin/dev`
- **Integration Status**: `dev_deployed`
