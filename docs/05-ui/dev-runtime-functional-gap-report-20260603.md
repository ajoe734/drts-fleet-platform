# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-04 09:19:54Z
- **Auditor:** Codex
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, single-shell count, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-04 09:19:54Z re-run)

| App            | Routes | Fully working | Broken                            |
| -------------- | -----: | ------------: | --------------------------------- |
| Platform Admin |     18 |            18 | none                              |
| Ops Console    |     21 |            20 | `/vehicles/veh-demo-001` HTTP 500 |

**Current total:** 38 / 39 routes fully working.  
**Acceptance target (`0 broken`, `0 HTTP 500`) is not met.**

Raw route-census output written to `.artifacts/func-audit/dev-gap-audit-results.json` now shows `PA 18/18` and `Ops 20/21`. The audit detector still correctly ignores incidental `404` substrings inside UUID-like screen text, so **PA `/audit`** remains healthy. After this 2026-06-04 09:19:54Z re-run, the effective remaining gaps are still `1` live `500` plus `2` tab-strip regressions.

## 2. What is now confirmed good

- **OPS list-route 500 wave is cleared except vehicle detail.**
  - `/drivers` is now `200` on dev.
  - `/contracts` is now `200` on dev.
  - `/revenue` is now `200` on dev.
- **PA `/fleet` single-shell fix is live.**
  - Browser census counted exactly **one** Platform Admin shell on `/fleet`.
  - Evidence: `.artifacts/func-audit/pa-fleet.png`
- **PA `/audit` is healthy; prior red was audit-tool false positive.**
  - Route returns `200` with a single shell.
  - Updated detector now ignores incidental `404` substrings inside UUIDs on this screen.
  - Evidence: `.artifacts/func-audit/pa-audit.png`
- **PA `/pricing` route itself is healthy, but its tab strip is still broken.**
  - Route `/pricing` returns `200` with a single shell in the census.
  - The remaining problem is only the tab-state interaction described below.
  - Evidence: `.artifacts/func-audit/pa-pricing.png`
- **PA `/payments` tab strip round-trip works.**
  - `租戶發票` → `司機結算單` → `對帳問題佇列` all switch active tab correctly.
  - Evidence: `.artifacts/func-audit/payments-tab-roundtrip.png`
- **OPS `/attendance` route itself is healthy, but its tab strip is still broken.**
  - Route `/attendance` returns `200` with a single shell in the census.
  - The remaining problem is only the `view` query-param round-trip described below.
  - Evidence: `.artifacts/func-audit/ops-attendance.png`
- **PA route map is present.**
  - `/tenants/[tenantId]`, `/payments/reimbursements`, and `/payments/reimbursements/[batchId]` all returned `200` in this re-run.

## 3. Confirmed remaining gaps after the 2026-06-04 09:19:54Z re-run

### P0 — still broken on live dev

1. **OPS vehicle detail with a real seeded id still returns HTTP 500.**
   - Path verified: `/vehicles/veh-demo-001`
   - Evidence: `.artifacts/func-audit/ops-vehicle-detail.png`
   - Important: this is **not** a fake-sample 404. The list page shows `veh-demo-001`, and that real id reproduces the failure.

### P1 — interaction regression still present

2. **PA `/pricing` tab switching is still broken.**
   - Clicking `Driver Fee Plans` leaves the URL at `/pricing` and does not reveal the driver-tab marker.
   - Clicking `Published Versions` also leaves the URL unchanged and does not reveal the history-tab marker.
   - Evidence:
     - `.artifacts/func-audit/pa-pricing.png`
     - `.artifacts/func-audit/pricing-tab-driver.png`
     - `.artifacts/func-audit/pricing-tab-history.png`

3. **OPS `/attendance` tab strip is still broken.**
   - Clicking `本週` and `異常` leaves the URL pinned at `/attendance`; query param round-trip never happens.
   - Evidence:
     - `.artifacts/func-audit/ops-attendance.png`
     - `.artifacts/func-audit/attendance-tab-roundtrip.png`

## 4. Notes from the re-run

- The regenerated audit JSON at `2026-06-04T09:19:54.811Z` still does not flag **PA `/audit`** after tightening the hard-error detector. The route returns `200` with a single shell and is not a live gap.
- Several pages emitted asset/API console noise (`404`/`429`) without breaking route render. These were not counted as scoreboard failures unless they produced a dead route, nested shell, or failed manual interaction.
- Compared with the prior `2026-06-04 08:42:48Z` re-run, there is still no further improvement on live dev. The remaining live gaps are unchanged in kind: `/pricing` and `/attendance` tab routing are still broken, and OPS `/vehicles/veh-demo-001` still returns `500`.

## 5. Closeout status for `GAP-VERIFY`

This task cannot be closed as `done` yet.

- **Why:** the 2026-06-04 09:19:54Z re-run still shows 1 confirmed HTTP 500 route and 2 confirmed tab-strip regressions on live dev.
- **Next required fixes:**
  - fix ops vehicle detail `/vehicles/[vehicleId]`
  - re-fix platform-admin `/pricing` tab state sync
  - fix ops `/attendance` view-tab routing
