# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-05T08:30:59Z
- **Auditor:** Claude2 (reassigned owner; prior re-runs by Codex2)
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, shell-count checks, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-05T08:30:59Z re-run)

| App            | Routes | Fully working | Broken                            |
| -------------- | -----: | ------------: | --------------------------------- |
| Platform Admin |     18 |            18 | none                              |
| Ops Console    |     21 |            20 | `/vehicles/veh-demo-001` HTTP 500 |

**Current total:** 38 / 39 routes fully working.  
**Acceptance target (`0 broken`, `0 HTTP 500`) is still not met.**

This 2026-06-05T08:30:59Z re-run (Claude2, full 39-route Playwright census + manual tab checks) reconfirms the current dev state: every Platform Admin shell count is exactly one, single-shell holds on every route, and `/payments` + `/attendance` tab strips round-trip. Acceptance is still blocked by one HTTP 500 and one tab-strip regression:

- OPS `/vehicles/veh-demo-001` still returns HTTP 500 (`checks` census `httpStatus=500`).
- PA `/pricing` tab clicking still fails to push `/pricing?tab=driver` (`checks.pricingTabs=fail`).

### 1a. Deploy-currency check (this re-run, NEW)

These are **not** deploy-lag against `origin/dev` — the running dev revision already contains the merged fixes, so the two failures are genuine code defects on current source:

- **PA `/pricing` is running the merged `<Link>`-based fix (#514).** A live DOM probe shows the tab renders as `<a href="/pricing?tab=driver">` (not the pre-#514 `<button>`). So the deployed build is current; the fix is simply **insufficient**. See §3.2.
- **OPS `/vehicles/[vehicleId]`** continues to throw a server-render exception on `origin/dev` source as well (the suspect `r:`-render column theory is **disproven** — see §3.1).

## 2. What is now confirmed good

- **PA `/fleet` single-shell fix is still live.**
  - Browser census counted exactly **one** Platform Admin shell on `/fleet`.
  - Evidence: `.artifacts/func-audit/platform-admin-fleet.png`
- **OPS `/revenue` still no longer returns HTTP 500.**
  - The 39-route census now records `/revenue` as non-broken on dev.
  - Evidence: `.artifacts/func-audit/dev-gap-audit-results.json`
- **OPS `/attendance` tab strip round-trip still works.**
  - `今日` ↔ `本週` ↔ `異常` correctly updated `?view=` and returned to `/attendance`.
  - Evidence: `.artifacts/func-audit/attendance-tab-roundtrip.png`
- **PA `/payments` tab strip still round-trips correctly on dev.**
  - The 2026-06-05T07:15:24Z re-run recorded `checks.paymentsTabs=pass`.
  - `發票` / `司機結算單` local selection works, and clicking `報銷` now hands off into `/payments/reimbursements`.
  - Evidence:
    - `.artifacts/func-audit/payments-tab-roundtrip.png`
    - `.artifacts/func-audit/dev-gap-audit-results.json` (`checks.paymentsTabs`)
- **All 18 Platform Admin routes still return HTTP 200 with a single shell.**
- **PA `/pricing` and `/payments` still load cleanly as routes.**
  - The 39-route census recorded `/pricing`, `/payments`, `/payments/reimbursements`, and `/payments/reimbursements/batch-99` as non-500 with one shell each.
  - The only remaining Platform Admin issue is `/pricing` interaction/state sync, not route availability.
  - Includes `/tenants/[tenantId]`, `/payments/reimbursements`, and `/payments/reimbursements/[batchId]`.
- **Most prior OPS route 500s remain cleared on dev.**
  - `/revenue`, `/drivers`, `/contracts`, and the rest of the 21-route census except vehicle detail returned non-500 in this re-run.

## 3. Confirmed remaining gaps

### 3.1 P0 — OPS vehicle detail still returns HTTP 500

- Path verified: `/vehicles/veh-demo-001`
- Evidence: `.artifacts/func-audit/ops-console-vehicles-veh-demo-001.png`, `.artifacts/func-audit/dev-gap-audit-results.json` (`httpStatus=500`)
- Live console capture: `Error: An error occurred in the Server Components render. The specific message is omitted in production builds … A digest property is included` (digest observed in a curl of the RSC stream: `863528574`). The production build masks the real message, so the exact throwing line needs either the dev Cloud Run log for that digest or a local non-production render to surface.
- **Diagnosis notes for the fixing owner:**
  - The page (`apps/ops-console-web/app/vehicles/[vehicleId]/page.tsx`) is an async **server component**; it renders almost the entire tree (curl of the 500 response returns the full regulatory/maintenance/contract/driver/incident/audit layout), so the throw is late in the stream, not an early data failure.
  - **Disproven hypothesis:** that passing `r:`-render functions in `CanvasTableColumn` from a server component to the `"use client"` `CanvasTable` is the cause. `/contracts` (list) is also a server component, also passes `r:` columns to the same client `CanvasTable`, also renders rows — and returns **HTTP 200** with zero error placeholders. So `r:`-columns are fine; the `$NN:E` placeholder seen in the RSC stream is a benign pattern that also appears on healthy 404 pages.
  - The 500 is therefore **data-specific to `veh-demo-001`'s seeded payload** (the only rendered table on this page is the contracts card, which has one seeded row). Likely candidates worth checking first: an `Intl.DateTimeFormat(...).format(new Date(value))` on an invalid/edge date in a seeded contract/maintenance/audit field, or a non-null field the render path assumes. Requires the digest log or local repro to confirm.

### 3.2 P1 — PA `/pricing` tab switching: merged fix (#514) is insufficient

- Playwright re-run at `2026-06-05T08:30:59Z` recorded `checks.pricingTabs=fail`.
- **The deployed build already has the `<Link>` fix (#514).** Live DOM: the tab is `<a href="/pricing?tab=driver">`, correctly styled.
- **Isolated root cause (live probes):**
  - **Direct URL navigation works:** loading `https://…/pricing?tab=driver` ends on `/pricing?tab=driver` and highlights the `Driver Fee Plans` tab. So server-side `searchParams`-driven `activeTab` is correct.
  - **Client-side tab click does NOT:** clicking the `<a href="/pricing?tab=driver">` (replace, scroll:false) fires a `framenavigated` event but lands back on `/pricing` with the `?tab=` **query stripped** — with **no console/page errors** (hydration is healthy). The App Router soft-navigation for a same-pathname, query-only change is dropping the search params.
  - Both prior approaches hit this: #510 (`router.replace(pathname?tab=…)`) and #514 (`<Link href=…?tab= replace>`) rely on the same App Router client navigation, so neither updates the URL on click.
- **Recommended fix (for the fixing owner, unverifiable here — no local app/backend, cannot deploy):** drive `activeTab` from local state seeded from the URL and update the address bar on click via the History API directly (`window.history.replaceState`) instead of `Link`/`router.replace`, bypassing the App Router same-route soft-nav that drops the query. Must be verified by re-running this audit against dev after redeploy.
- Evidence: `.artifacts/func-audit/dev-gap-audit-results.json` (`checks.pricingTabs`), live probe transcript summarized above.

## 4. Raw audit outputs

- Summary markdown: `.artifacts/func-audit/dev-gap-audit-summary.md`
- Machine-readable route census: `.artifacts/func-audit/dev-gap-audit-results.json`
- Route screenshots:
  - Platform Admin: `.artifacts/func-audit/platform-admin-*.png`
  - Ops Console: `.artifacts/func-audit/ops-console-*.png`

## 5. Closeout status for `GAP-VERIFY`

This task cannot be closed as `done` yet.

- **Why:** live dev still has 1 confirmed HTTP 500 route and 1 confirmed tab-strip regression in the 2026-06-05T08:30:59Z re-run. Both are confirmed (§1a) to be **genuine code defects on the currently-deployed/`origin/dev` source**, not deploy lag.
- **Acceptance not met:**
  - all 39 routes verified on dev `0 HTTP 500`: **failed** (`1` HTTP 500 remains — `/vehicles/veh-demo-001`)
  - single shell everywhere: **passed**
  - all tab strips round-trip: **failed** (`/pricing` click does not sync `?tab=`)
- **Why this verification task is blocked rather than fixed here:**
  - The two remaining defects are app-code fixes (server-render exception + App-Router query-sync), not verification work.
  - This worktree has no local app/backend run path (`output: "standalone"`, no pricing tests) and no dev-deploy capability, so any code fix would be **unverifiable** before the acceptance gate (the audit) re-runs against dev. Shipping a blind fix through a verification task is out of scope.
- **Next required fixes (need dedicated fix task + merge + `Deploy - Dev`, then re-run this audit):**
  - OPS `/vehicles/[vehicleId]` 500 — resolve via the digest log / local repro (§3.1).
  - PA `/pricing` tab `?tab=` sync — History-API approach (§3.2); note the merged #514/#510 fixes are insufficient.
