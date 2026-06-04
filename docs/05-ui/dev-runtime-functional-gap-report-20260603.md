# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-04 03:40:29Z
- **Auditor:** Codex
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, single-shell count, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-04 03:40:29Z re-run)

| App            | Routes | Fully working | Broken                                                                                       |
| -------------- | -----: | ------------: | -------------------------------------------------------------------------------------------- |
| Platform Admin |     18 |            17 | `/pricing` tab interaction broken                                                            |
| Ops Console    |     21 |            18 | `/revenue` HTTP 500, `/vehicles/veh-demo-001` HTTP 500, `/attendance` tab interaction broken |

**Current total:** 35 / 39 routes fully working.  
**Acceptance target (`0 broken`, `0 HTTP 500`) is not met.**

Raw route-census output written to `.artifacts/func-audit/dev-gap-audit-results.json` still shows `PA 17/18` and `Ops 19/21` because the generic hard-error detector false-flags **PA `/audit`** while the route itself still returns `200` with a single shell. After this 2026-06-04 03:40:29Z re-run, the effective remaining gaps are unchanged: `2` live `500`s plus `2` tab-strip regressions.

## 2. What is now confirmed good

- **OPS list-route 500 wave is only partially cleared.**
  - `/drivers` is now `200` on dev.
  - `/contracts` is now `200` on dev.
- **PA `/fleet` single-shell fix is live.**
  - Browser census counted exactly **one** Platform Admin shell on `/fleet`.
  - Evidence: `.artifacts/func-audit/pa-fleet.png`
- **PA `/payments` tab strip round-trip works.**
  - `租戶發票` → `司機結算單` → `對帳問題佇列` all switch active tab correctly.
  - Evidence: `.artifacts/func-audit/payments-tab-roundtrip.png`
- **PA route map is present.**
  - `/tenants/[tenantId]`, `/payments/reimbursements`, and `/payments/reimbursements/[batchId]` all returned `200` in this re-run.

## 3. Confirmed remaining gaps

### P0 — still broken on live dev

1. **OPS `/revenue` still returns HTTP 500.**
   - Evidence: `.artifacts/func-audit/ops-revenue.png`
   - Census result: `httpStatus=500`

2. **OPS vehicle detail with a real seeded id still returns HTTP 500.**
   - Path verified: `/vehicles/veh-demo-001`
   - Evidence: `.artifacts/func-audit/ops-vehicle-detail.png`
   - Important: this is **not** a fake-sample 404. The list page shows `veh-demo-001`, and that real id reproduces the failure.

### P1 — interaction regression still present

3. **PA `/pricing` tab switching is still broken.**
   - Clicking `Driver Fee Plans` leaves the URL at `/pricing` and does not reveal the driver-tab marker.
   - Clicking `Published Versions` also leaves the URL unchanged and does not reveal the history-tab marker.
   - Evidence:
     - `.artifacts/func-audit/pa-pricing.png`
     - `.artifacts/func-audit/pricing-tab-driver.png`
     - `.artifacts/func-audit/pricing-tab-history.png`

4. **OPS `/attendance` tab strip is still broken.**
   - Clicking `本週` and `異常` leaves the URL pinned at `/attendance`; query param round-trip never happens.
   - Evidence:
     - `.artifacts/func-audit/ops-attendance.png`
     - `.artifacts/func-audit/attendance-tab-roundtrip.png`

## 4. Notes from the re-run

- The regenerated audit JSON at `2026-06-04T03:40:29.685Z` still flagged **PA `/audit`** because of the generic hard-error text detector, but the route again returned `200` with a single shell. The refreshed screenshot shows a populated `Audit & Evidence Governance` table, so treat that JSON flag as a detector false positive, not a confirmed gap.
- Several pages emitted asset/API console noise (`404`/`429`) without breaking route render. These were not counted as scoreboard failures unless they produced a dead route, nested shell, or failed manual interaction.
- Compared with the prior `2026-06-04 03:35:13Z` run, there was no functional delta on live dev: `/pricing` and `/attendance` tab routing are still broken, and OPS `/revenue` plus `/vehicles/veh-demo-001` still return `500`.

## 5. Closeout status for `GAP-VERIFY`

This task cannot be closed as `done` yet.

- **Why:** the 2026-06-04 03:40:29Z re-run still shows 2 confirmed HTTP 500 routes and 2 confirmed tab-strip regressions on live dev.
- **Next required fixes:**
  - re-open / continue ops `/revenue`
  - fix ops vehicle detail `/vehicles/[vehicleId]`
  - re-fix platform-admin `/pricing` tab state sync
  - fix ops `/attendance` view-tab routing
