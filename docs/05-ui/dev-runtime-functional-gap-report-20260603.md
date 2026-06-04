# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-04T06:01:30Z
- **Auditor:** Codex2
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, shell-count checks, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-04T06:01:30Z re-run)

| App            | Routes | Fully working | Broken                            |
| -------------- | -----: | ------------: | --------------------------------- |
| Platform Admin |     18 |            18 | none                              |
| Ops Console    |     21 |            20 | `/vehicles/veh-demo-001` HTTP 500 |

**Current total:** 38 / 39 routes fully working.  
**Acceptance target (`0 broken`, `0 HTTP 500`) is still not met.**

This 2026-06-04T06:01:30Z re-run reconfirms the current dev state: the prior shell/payments/attendance fixes remain live, but acceptance is still blocked by one remaining HTTP 500 and one manual tab-strip regression:

- OPS `/vehicles/veh-demo-001` still returns HTTP 500.
- PA `/pricing` tab switching still fails to push `/pricing?tab=driver`.

## 2. What is now confirmed good

- **PA `/fleet` single-shell fix is still live.**
  - Browser census counted exactly **one** Platform Admin shell on `/fleet`.
  - Evidence: `.artifacts/func-audit/platform-admin-fleet.png`
- **OPS `/revenue` still no longer returns HTTP 500.**
  - The 39-route census now records `/revenue` as non-broken on dev.
  - Evidence: `.artifacts/func-audit/dev-gap-audit-results.json`
- **PA `/payments` tab strip round-trip still works.**
  - `發票` → `司機結算單` → `報銷` switched correctly; `報銷` routed into `/payments/reimbursements`.
  - Evidence: `.artifacts/func-audit/payments-tab-roundtrip.png`
- **OPS `/attendance` tab strip round-trip still works.**
  - `今日` ↔ `本週` ↔ `異常` correctly updated `?view=` and returned to `/attendance`.
  - Evidence: `.artifacts/func-audit/attendance-tab-roundtrip.png`
- **All 18 Platform Admin routes still return HTTP 200 with a single shell.**
  - Includes `/tenants/[tenantId]`, `/payments/reimbursements`, and `/payments/reimbursements/[batchId]`.
- **Most prior OPS route 500s remain cleared on dev.**
  - `/revenue`, `/drivers`, `/contracts`, and the rest of the 21-route census except vehicle detail returned non-500 in this re-run.

## 3. Confirmed remaining gaps

### P0 — still broken on live dev

1. **OPS vehicle detail with a real seeded id still returns HTTP 500.**
   - Path verified: `/vehicles/veh-demo-001`
   - Evidence: `.artifacts/func-audit/ops-console-vehicles-veh-demo-001.png`
   - Census result: `httpStatus=500`

### P1 — interaction regression still present

2. **PA `/pricing` tab switching is still broken.**
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

- **Why:** live dev still has 1 confirmed HTTP 500 route and 1 confirmed tab-strip regression in the 2026-06-04T06:01:30Z rerun.
- **Acceptance not met:**
  - all 39 routes verified on dev: **failed** (`1` HTTP 500 remains)
  - single shell everywhere: **passed**
  - all tab strips round-trip: **failed** (`/pricing`)
- **Next required fixes:**
  - fix ops vehicle detail `/vehicles/[vehicleId]`
  - re-fix platform-admin `/pricing` tab state sync
