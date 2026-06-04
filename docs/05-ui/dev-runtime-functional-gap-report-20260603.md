# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-04
- **Auditor:** Codex2
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, shell-count checks, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-04 re-run)

| App | Routes | Fully working | Broken |
| --- | ---: | ---: | --- |
| Platform Admin | 18 | 18 | none |
| Ops Console | 21 | 19 | `/revenue` HTTP 500, `/vehicles/veh-demo-001` HTTP 500 |

**Current total:** 37 / 39 routes fully working.  
**Acceptance target (`0 broken`, `0 HTTP 500`) is not met.**

## 2. What is now confirmed good

- **PA `/fleet` single-shell fix is live.**
  - Browser census counted exactly **one** Platform Admin shell on `/fleet`.
  - Evidence: `.artifacts/func-audit/platform-admin-fleet.png`
- **PA `/payments` tab strip round-trip works.**
  - `發票` → `司機結算單` → `報銷` switched correctly; `報銷` routed into `/payments/reimbursements`.
  - Evidence: `.artifacts/func-audit/payments-tab-roundtrip.png`
- **OPS `/attendance` tab strip round-trip works.**
  - `今日` ↔ `本週` ↔ `異常` correctly updated `?view=` and returned to `/attendance`.
  - Evidence: `.artifacts/func-audit/attendance-tab-roundtrip.png`
- **All 18 Platform Admin routes return HTTP 200 with a single shell.**
  - Includes `/tenants/[tenantId]`, `/payments/reimbursements`, and `/payments/reimbursements/[batchId]`.
- **Most prior OPS route 500s are cleared on dev.**
  - `/drivers`, `/contracts`, and the rest of the 21-route census returned non-500 in this re-run.

## 3. Confirmed remaining gaps

### P0 — still broken on live dev

1. **OPS `/revenue` still returns HTTP 500.**
   - Evidence: `.artifacts/func-audit/ops-console-revenue.png`
   - Census result: `httpStatus=500`

2. **OPS vehicle detail with a real seeded id still returns HTTP 500.**
   - Path verified: `/vehicles/veh-demo-001`
   - Evidence: `.artifacts/func-audit/ops-console-vehicles-veh-demo-001.png`
   - Census result: `httpStatus=500`

### P1 — interaction regression still present

3. **PA `/pricing` tab switching is still broken.**
   - Clicking `Driver Fee Plans` left the URL pinned at `/pricing`; expected `/pricing?tab=driver`.
   - The browser never reached the driver-tab state, so the remainder of the pricing round-trip is still blocked on the same regression.
   - Evidence:
     - `.artifacts/func-audit/platform-admin-pricing.png`
     - `.artifacts/func-audit/dev-gap-audit-results.json` (`checks.pricingTabs`)

## 4. Raw audit outputs

- Summary markdown: `.artifacts/func-audit/dev-gap-audit-summary.md`
- Machine-readable route census: `.artifacts/func-audit/dev-gap-audit-results.json`
- Route screenshots:
  - Platform Admin: `.artifacts/func-audit/platform-admin-*.png`
  - Ops Console: `.artifacts/func-audit/ops-console-*.png`

## 5. Closeout status for `GAP-VERIFY`

This task cannot be closed as `done` yet.

- **Why:** live dev still has 2 confirmed HTTP 500 routes and 1 confirmed tab-strip regression.
- **Acceptance not met:**
  - all 39 routes verified on dev: **failed** (`2` HTTP 500 remain)
  - single shell everywhere: **passed**
  - all tab strips round-trip: **failed** (`/pricing`)
- **Next required fixes:**
  - re-open / continue ops `/revenue`
  - fix ops vehicle detail `/vehicles/[vehicleId]`
  - re-fix platform-admin `/pricing` tab state sync
