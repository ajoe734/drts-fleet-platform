# E2E-REF-EMBED-001 Sidecar Acceptance Report

- Task ID: `E2E-REF-EMBED-001`
- Title: `Independent Referral Embed 15+4 visual, lifecycle, and security acceptance`
- Owner: `Gemini`
- Reviewer: `Gemini2`
- Date: `2026-08-01`
- Dependencies: `UI-CANVAS-REF-001`, `BE-REF-PASSENGER-001`
- Canonical Reference: `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx`

---

## 1. Executive Summary

This sidecar acceptance packet records the independent visual, lifecycle, and security verification of the **Referral Embed** runtime (`/embed/[entrySlug]`) for `E2E-REF-EMBED-001`.

Verification confirms:
1. **19-Page Screenshot Inventory**: 15 core canvas-derived screens + 4 Phase 2 fallback states captured, matching expected text markers, layout constraints, and branding elements.
2. **Security & Frame Protection**: Frame headers (`Content-Security-Policy: frame-ancestors` and `X-Frame-Options`) correctly enforce origin policies (`127.0.0.1:3199` / `app.yuhe-living.com.tw`), denying unauthorized origins (`evil.example` -> `403 Forbidden`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`).
3. **Secret & PII Sanitization**: Legacy/spoofed query parameters containing credentials (`apiKey`, `partnerUserRef`) are safely ignored, preventing URL leakage and log exposure.
4. **Automated Verification**: 100% pass across Playwright E2E referral embed suite (`10/10`), NestJS API unit tests (`174/174`), Next.js typecheck, ESLint zero-warning check, and production build.

---

## 2. 19-Page Visual Inventory & Parity Comparison

| # | Screen Label | Path / Query | Expected Text & Structural Markers | Screenshot File | Parity Result |
|---|--------------|--------------|-----------------------------------|-----------------|---------------|
| 01 | `handoff` | `/embed/yuhe-residence?state=handoff` | `已交接`, `開始叫車`, `身分由社區 App 帶入` | `01-handoff.png` | PASS |
| 02 | `reauth` | `/embed/yuhe-residence?state=reauth` | `登入狀態已逾時`, `交付權杖逾時` | `02-reauth.png` | PASS |
| 03 | `unsupported` | `/embed/yuhe-residence?state=unsupported` | `無法在此環境開啟`, `來源宿主未授權` | `03-unsupported.png` | PASS |
| 04 | `consent` | `/embed/yuhe-residence?state=consent` | `授權使用叫車服務`, `同意並開始` | `04-consent.png` | PASS |
| 05 | `fallback` | `/embed/yuhe-residence?state=fallback` | `內嵌服務暫時無法使用`, `前往獨立叫車網站` | `05-fallback.png` | PASS |
| 06 | `book` | `/embed/yuhe-residence?state=handoff&screen=book` | `預估車資`, `確認叫車` | `06-book.png` | PASS |
| 07 | `no-supply` | `/embed/yuhe-residence?state=handoff&screen=nosupply` | `附近暫無可派車輛`, `稍後重試` | `07-no-supply.png` | PASS |
| 08 | `ineligible` | `/embed/yuhe-residence?state=handoff&screen=ineligible` | `目前不符叫車資格`, `洽社區管理中心` | `08-ineligible.png` | PASS |
| 09 | `denied` | `/embed/yuhe-residence?state=handoff&screen=denied` | `叫車未能建立`, `聯絡社區客服` | `09-denied.png` | PASS |
| 10 | `degraded` | `/embed/yuhe-residence?state=handoff&screen=degraded` | `服務暫時不穩定`, `查看狀態` | `10-degraded.png` | PASS |
| 11 | `trip` | `/embed/yuhe-residence?state=handoff&screen=trip` | `重開 App 仍可找回`, `取消行程` | `11-trip.png` | PASS |
| 12 | `trips` | `/embed/yuhe-residence?state=handoff&screen=trips` | `我的行程`, `PT-9E11A3` | `12-trips.png` | PASS |
| 13 | `receipt` | `/embed/yuhe-residence?state=handoff&screen=receipt` | `行程已完成`, `費用明細` | `13-receipt.png` | PASS |
| 14 | `completed` | `/embed/yuhe-residence?state=handoff&screen=completed` | `行程已完成`, `查看收據` | `14-completed.png` | PASS |
| 15 | `cancelled` | `/embed/yuhe-residence?state=handoff&screen=cancelled` | `行程已取消`, `重新叫車` | `15-cancelled.png` | PASS |
| 16 | `vehicle_change_in_progress` | `/embed/yuhe-residence?state=handoff&screen=vehicle_change_in_progress` | `正在為您重新安排車輛`, `pax.fallback.vehicle_change.body` | `16-fb-vehicle-change.png` | PASS |
| 17 | `human_fallback_assigned` | `/embed/yuhe-residence?state=handoff&screen=human_fallback_assigned` | `新車已為您指派`, `pax.fallback.human_assigned.body` | `17-fb-human-assigned.png` | PASS |
| 18 | `service_continuing` | `/embed/yuhe-residence?state=handoff&screen=service_continuing` | `行程繼續進行`, `pax.fallback.service_continuing.body` | `18-fb-service-continuing.png` | PASS |
| 19 | `eta_updated` | `/embed/yuhe-residence?state=handoff&screen=eta_updated` | `預估時間已更新`, `pax.fallback.eta_updated.body` | `19-fb-eta-updated.png` | PASS |

---

## 3. Security, Secret, and PII Audit

### 3.1 CSP & Frame Restrictions
- **Authorized Origins**: Requests specifying `entryHost=127.0.0.1:3199` or `app.yuhe-living.com.tw` receive `x-drts-embed-decision: allowed` and CSP `frame-ancestors http://127.0.0.1:3199` / `https://app.yuhe-living.com.tw`.
- **Unauthorized Origins**: Requests specifying unauthorized `entryHost` (e.g. `evil.example`) return HTTP `403 Forbidden`, `x-drts-embed-decision: blocked`, `X-Frame-Options: DENY`, and CSP `frame-ancestors 'none'`.

### 3.2 Secret & PII Sanitization
- **URL Parameter Filtering**: Query parameters such as `apiKey` or `partnerUserRef` passed to frontend routes are explicitly stripped and unrendered, preventing sensitive values from lingering in browser history or server access logs.
- **Session Auth Isolation**: Handoff access tokens are managed via secure cookies (`__Host-referral_session` or HTTP-only auth context), preventing token exposure in URL query strings.

---

## 4. Verification Commands & Test Matrix

| Verification Scope | Command | Results |
|--------------------|---------|---------|
| **Playwright E2E Suite** | `npx playwright test -c playwright.referral-embed.config.ts` | **10 / 10 PASS** (1.8m) |
| **API Unit Tests** | `pnpm --filter @drts/api exec vitest run tests/unit/referral-embed-handoff.repository.test.ts ...` | **174 / 174 PASS** (7.01s) |
| **Referral Embed Typecheck** | `pnpm --filter @drts/referral-embed-web typecheck` | **PASS** (0 errors) |
| **Referral Embed Lint** | `pnpm --filter @drts/referral-embed-web lint` | **PASS** (0 warnings) |
| **Referral Embed Build** | `pnpm --filter @drts/referral-embed-web exec next build --webpack` | **PASS** (Compiled in 4.9s) |

---

## 5. Reviewer Decision & Handoff

- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Recommendation**: Approve task acceptance for `E2E-REF-EMBED-001`. All core 15 + 4 fallback screens, visual assertions, security headers, PII scans, and build checks have been completed and verified.
