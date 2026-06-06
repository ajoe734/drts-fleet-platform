# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-06T10:51:30Z
- **Auditor:** Claude (reassigned owner; prior re-runs by Claude2 / Codex2)
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, shell-count checks, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-06T10:51:30Z re-run — ✅ acceptance met)

| App            | Routes | Fully working | Broken |
| -------------- | -----: | ------------: | ------ |
| Platform Admin |     18 |            18 | none   |
| Ops Console    |     21 |            21 | none   |

**Current total (live dev): 39 / 39 routes fully working.**
**Acceptance target (`0 broken`, `0 HTTP 500`, single shell everywhere, all tab strips round-trip) is now MET on the deployed dev revision.** ✅

> **The final remaining defect is now fixed on deployed dev.** This 10:51:30Z
> re-run (Claude, full 39-route Playwright census + manual tab checks) records the
> first **0 / 39 broken** scoreboard. The previously-failing OPS
> `/vehicles/veh-demo-001` route now returns **HTTP 200** after the vehicle-detail
> RSC-safety fix was deployed to the live ops-console-web revision. Single-shell
> holds on all 39 routes, and `checks.{pricingTabs,paymentsTabs,attendanceTabs}`
> are all `pass`.

> **Root cause of the vehicle-detail 500, corrected.** The 10:30:30Z re-run
> attributed the residual 500 to deploy lag of #549 (sort-key hardening). That was
> only partly right: **#549 alone did not clear the 500.** A follow-up hotfix
> **#551 (`4a3213ba`, current `dev` tip), "make vehicle detail tables RSC-safe",**
> was required and merged. Once a `Deploy — Dev` run published `4a3213ba` (which
> contains both #549 and #551) to ops-console-web, the route recovered. The
> earlier "deploy-lag of #549" framing is superseded by this entry.

This 2026-06-06T10:51:30Z re-run (Claude, full 39-route Playwright census + manual tab checks) was executed directly against live dev Cloud Run via the committed harness `scripts/dev-gap-audit.spec.js` + `scripts/playwright.dev-gap.config.js`. Every Platform Admin shell count is exactly one, single-shell holds on every route, `/pricing` + `/payments` + `/attendance` tab strips all round-trip (`checks.{pricingTabs,paymentsTabs,attendanceTabs}=pass`), and no route returns HTTP 500. A live `curl` of `/vehicles/veh-demo-001` taken immediately before this census returned HTTP 200 (it had returned 500 with digest `863528574` before the deploy), confirming the fix is current deployed-dev state, not transient.

### 1a. Deploy-currency check (this re-run)

- **Deploy that closed the gap:** `Deploy — Dev` run [`27060118907`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/27060118907), branch `dev`, head `4a3213ba`, **completed/success at 2026-06-06T10:48:57Z**. This run published current `dev` (incl. #549 + #551) to both web apps.
- **PA `/pricing`** — fixed on deployed dev (since the #548 deploy). `checks.pricingTabs=pass`: clicking `Driver Fee Plans` / `Published Versions` / `Passenger Pricing` correctly pushes `?tab=driver` / `?tab=history` / `?tab=passenger`. See §3.2.
- **OPS `/vehicles/[vehicleId]`** — **now HTTP 200 on deployed dev.** Pre-deploy the live revision returned the masked `digest=863528574` 500; after run `27060118907` published `4a3213ba`, a fresh `curl` and the full Playwright census both return HTTP 200 with a single shell. The render path is now RSC-safe (#551) on top of the formatter NaN-guards (#548) and sort-key hardening (#549). See §3.1.

## 2. What is now confirmed good

- **PA `/fleet` single-shell fix is still live.**
  - Browser census counted exactly **one** Platform Admin shell on `/fleet`.
  - Evidence: `.artifacts/func-audit/platform-admin-fleet.png`
- **OPS `/vehicles/veh-demo-001` now returns HTTP 200 (newly fixed).**
  - The 39-route census records `/vehicles/veh-demo-001` as non-broken on dev after the #551 deploy.
  - Evidence: `.artifacts/func-audit/ops-console-vehicles-veh-demo-001.png`, `.artifacts/func-audit/dev-gap-audit-results.json`
- **OPS `/revenue` still no longer returns HTTP 500.**
  - The 39-route census records `/revenue` as non-broken on dev.
  - Evidence: `.artifacts/func-audit/dev-gap-audit-results.json`
- **OPS `/attendance` tab strip round-trip still works.**
  - `今日` ↔ `本週` ↔ `異常` correctly updated `?view=` and returned to `/attendance`.
  - Evidence: `.artifacts/func-audit/attendance-tab-roundtrip.png`
- **PA `/payments` tab strip still round-trips correctly on dev.**
  - `checks.paymentsTabs=pass`. `發票` / `司機結算單` local selection works, and clicking `報銷` hands off into `/payments/reimbursements`.
  - Evidence: `.artifacts/func-audit/payments-tab-roundtrip.png`, `.artifacts/func-audit/dev-gap-audit-results.json` (`checks.paymentsTabs`)
- **PA `/pricing` tab strip round-trips correctly on dev.**
  - `checks.pricingTabs=pass`: `Passenger Pricing` ↔ `Driver Fee Plans` ↔ `Published Versions` correctly drive `?tab=` and the active tab. See §3.2.
  - Evidence: `.artifacts/func-audit/pricing-tab-driver.png`, `pricing-tab-history.png`, `.artifacts/func-audit/dev-gap-audit-results.json` (`checks.pricingTabs`)
- **All 18 Platform Admin routes return HTTP 200 with a single shell.**
- **All 21 Ops Console routes return non-500 with a single shell.**

## 3. Resolved gaps (previously open)

### 3.1 P0 — OPS vehicle detail HTTP 500: ✅ RESOLVED on deployed dev (2026-06-06T10:51:30Z)

- Path verified: `/vehicles/veh-demo-001` → **HTTP 200** (was HTTP 500, masked `digest=863528574`).
- Evidence: `.artifacts/func-audit/ops-console-vehicles-veh-demo-001.png`, `.artifacts/func-audit/dev-gap-audit-results.json` (`httpStatus=200`), pre/post `curl` (500 → 200 across the `4a3213ba` deploy).
- **Root cause + fix sequence (three merged commits, deployed via run `27060118907`):**
  1. **Formatter NaN-guards (#548).** `formatDateTime` / `formatDateOnly` return `"—"` when `Number.isNaN(new Date(value).getTime())`, so a present-but-unparseable date can no longer raise `RangeError: Invalid time value` mid-render.
  2. **Sort-key hardening (#549, `84fa18a8`).** Render-path sorts previously called `.localeCompare` directly on possibly-null keys (`latestTaskTimestamp(...)`, `clockedInAt`, `updatedAt` / `scheduledAt` on related task / shift / contract / incident / maintenance lists). A null key throws `TypeError`, crashing the server render. #549 routes every sort key through `sortKey(value) = value ?? ""` (time-based sorts through a `Number.isFinite`-guarded `timeKey`).
  3. **RSC-safe vehicle detail tables (#551, `4a3213ba`, current `dev` tip).** #548 + #549 were **necessary but not sufficient** — the route still 500'd after #549 reached `dev`. #551 was the commit that actually cleared the masked Server-Components render error; once it deployed, the route returned HTTP 200.
- **Diagnosis correction:** the 10:30:30Z re-run hypothesised the residual 500 was pure deploy lag of #549. In fact #549 deployed without clearing the 500; the additional RSC-safety work in #551 was required. The throw site was in the vehicle-detail tables' RSC render path rather than the sort/formatter code alone.
- **Verification:** post-deploy live `curl` returns HTTP 200; the full Playwright census records `/vehicles/veh-demo-001` non-broken with `shellOk` and `bodyOk` true and no console/page errors.

### 3.2 P1 — PA `/pricing` tab switching: ✅ RESOLVED on deployed dev (2026-06-06T10:30:30Z)

- **Passing live.** `checks.pricingTabs=pass`: clicking `Driver Fee Plans` → `?tab=driver`, `Published Versions` → `?tab=history`, `Passenger Pricing` → `?tab=passenger`, each correctly reflected in the address bar. Evidence: `.artifacts/func-audit/pricing-tab-driver.png`, `pricing-tab-history.png`, `dev-gap-audit-results.json` (`checks.pricingTabs`).
- The local-state + `history.replaceState` fix (originally on `claude2/gap-verify`) reached `dev` via #548 and is live on the deployed platform-admin-web revision. History retained below for the record.
- **Isolated root cause (live probes):** direct URL navigation to `?tab=…` worked server-side, but the App Router same-pathname soft-navigation dropped the query on click; both #510 (`router.replace`) and #514 (`<Link replace>`) relied on that same client navigation, so neither updated the URL.
- **Fix (`apps/platform-admin-web/app/pricing/page.tsx`):** `activeTab` is local React state seeded from `?tab=`, a `useEffect` re-syncs on external URL changes (direct nav, back/forward), and the tab strip is `<button onClick={handleTabChange}>` that updates local state **and** the address bar via `window.history.replaceState(...)`, bypassing the soft-nav that dropped the query.

## 4. Raw audit outputs

- Summary markdown: `.artifacts/func-audit/dev-gap-audit-summary.md`
- Machine-readable route census: `.artifacts/func-audit/dev-gap-audit-results.json`
- Route screenshots:
  - Platform Admin: `.artifacts/func-audit/platform-admin-*.png`
  - Ops Console: `.artifacts/func-audit/ops-console-*.png`

## 5. Closeout status for `GAP-VERIFY`

Per `GAP-VERIFY-UNBLOCK-PLANNING-DECISION` (Codex, approved 2026-06-05T07:06Z),
the parent task was unblocked to **resume execution** — fix the defects inline,
deploy to dev, and re-run this audit. **All fixes are now merged to `dev` and
published to the dev test environment**, and this 10:51:30Z re-audit confirms the
full acceptance bar is met.

- **Fixes implemented, merged to `dev`, and LIVE on deployed dev:**
  - PA `/pricing` `?tab=` sync → local tab state + History API (§3.2) — merged (#548), **LIVE: `checks.pricingTabs=pass`.** ✅
  - OPS `/vehicles/[vehicleId]` 500 → formatter NaN-guards (#548) + sort-key hardening (#549) + **RSC-safe tables (#551, `4a3213ba`)** — merged to `dev` and **LIVE: HTTP 200.** ✅
- **Acceptance status — all criteria PASSED:**
  - all 39 routes `0 HTTP 500` on dev: **PASSED** ✅ (39/39 non-500; broken total 0/39).
  - single shell everywhere: **PASSED** ✅ (census shell count == 1 on all 39 routes).
  - all tab strips round-trip: **PASSED** ✅ (`pricingTabs` + `paymentsTabs` + `attendanceTabs` all `pass`).
- **Integration evidence:**
  - Delivered code is `origin/dev` tip `4a3213ba` (contains #548 / #549 / #551).
  - Published to dev via `Deploy — Dev` run [`27060118907`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/27060118907), head `4a3213ba`, completed/success 2026-06-06T10:48:57Z.
  - Post-deploy re-audit (`npx playwright test --config=scripts/playwright.dev-gap.config.js`) passed with 0 broken routes.
- **Conclusion:** `GAP-VERIFY` acceptance is satisfied on deployed dev. The branch closeout records the updated scoreboard + audit artifacts; the underlying fixes are already `dev_deployed`.
