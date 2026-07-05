# Dev Runtime + Functional Gap Report (browser-verified)

- **Last re-run:** 2026-06-06T08:42:11Z
- **Auditor:** Claude2 (reassigned owner; prior re-runs by Codex2)
- **Environment:** live dev Cloud Run
  - Platform Admin: `https://drts-dev-platform-admin-web-ne55h7sy3a-uc.a.run.app`
  - Ops Console: `https://drts-dev-ops-console-web-ne55h7sy3a-uc.a.run.app`
- **Method:** headless Chromium route census over all 39 routes (Platform Admin 18 + Ops Console 21), fixed `1440x950` screenshots, shell-count checks, and manual tab round-trip checks for `/pricing`, `/payments`, `/attendance`.
- **Artifacts:** `.artifacts/func-audit/dev-gap-audit-results.json`, `.artifacts/func-audit/dev-gap-audit-summary.md`, and route screenshots under `.artifacts/func-audit/*.png`.

## 1. Scoreboard (2026-06-06T08:42:11Z re-run)

| App            | Routes | Fully working | Broken                            |
| -------------- | -----: | ------------: | --------------------------------- |
| Platform Admin |     18 |            18 | none                              |
| Ops Console    |     21 |            20 | `/vehicles/veh-demo-001` HTTP 500 |

**Current total (live dev, pre-fix-deploy):** 38 / 39 routes fully working.  
**Acceptance target (`0 broken`, `0 HTTP 500`) is not yet met on the deployed dev revision.**

> **Fix status (2026-06-06, Claude2 — `claude2/gap-verify`):** both remaining
> defects have code fixes committed on this branch (`6927ad26`) and re-verified
> through `typecheck` for **both** apps after the branch was brought current with
> `origin/dev` (merge `7fc45d97`, incl. #538/#540). They are **still not on the
> deployed dev revision**, so this re-audit scoreboard continues to reflect
> pre-fix-deploy dev. The acceptance gate (live dev re-audit showing `0 broken`)
> can only pass after `claude2/gap-verify` is merged to `dev` and a `Deploy - Dev`
> run publishes it. That merge + deploy is the sole remaining blocker — see §5.
> See §3.1 / §3.2 for the fixes.

This 2026-06-06T08:42:11Z re-run (Claude2, full 39-route Playwright census + manual tab checks) reconfirms the current dev state is materially unchanged from the earlier 2026-06-06T06:48:46Z and 2026-06-05T08:30:59Z runs: every Platform Admin shell count is exactly one, single-shell holds on every route, and `/payments` + `/attendance` tab strips round-trip. A live `curl` taken immediately before this census still returned HTTP 500 for `/vehicles/veh-demo-001`, so the failure is current dev state, not transient lag. The two `origin/dev` commits that landed since (#538 tenant-governance UI, #540 OpenClaw runtime) touch neither `/vehicles/[vehicleId]` nor `/pricing`. Acceptance is still blocked by one HTTP 500 and one tab-strip regression:

- OPS `/vehicles/veh-demo-001` still returns HTTP 500 (`checks` census `httpStatus=500`; live `digest=863528574`, matching the error the §3.1 fix hardens).
- PA `/pricing` tab clicking still fails to push `/pricing?tab=driver` (`checks.pricingTabs=fail`).

### 1a. Deploy-currency check (this re-run)

The two failures are **not** transient lag — the running dev revision is current `origin/dev` source, which genuinely lacks the `claude2/gap-verify` fixes (`6927ad26` is not reachable from `origin/dev`):

- **PA `/pricing`** on dev still runs the merged `<Link>`-based fix (#514), which is insufficient; the superseding local-state + `history.replaceState` fix lives only on `claude2/gap-verify`. See §3.2.
- **OPS `/vehicles/[vehicleId]`** still throws a server-render exception (live `digest=863528574`). Static analysis of the merged page confirms the only `RangeError`-throwing sites in the render path are `formatDateTime`/`formatDateOnly` (`Intl.DateTimeFormat.format(new Date(invalid))`), both now NaN-guarded by `6927ad26`; the other `new Date(...)` sites use `.getTime()` (yields `NaN`, does not throw). See §3.1.

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
  - The 500 is therefore **data-specific to `veh-demo-001`'s rendered payload** (the page renders many date fields — insurance expiry, debranding due, contract terms, maintenance schedule, audit timestamps, driver-binding `boundAt`). The static `VEHICLE_SEED`/`CONTRACT_SEED`/`POLICY_SEED` in `apps/api/.../regulatory-registry.service.ts` are all clean ISO dates, but the deployed dev API hydrates **persisted** state (`regulatoryRegistryRepository.loadState()`), so a runtime-mutated record can carry a present-but-unparseable date.
- **Fix applied (this branch, `apps/ops-console-web/app/vehicles/[vehicleId]/page.tsx`):** `formatDateTime` / `formatDateOnly` previously guarded only `null`/`undefined`, then called `new Intl.DateTimeFormat(...).format(new Date(value))`. For a present-but-unparseable string that raises `RangeError: Invalid time value`, and in a server component an uncaught throw crashes the **entire** render into exactly the masked HTTP 500 we observe. The formatters now also return `"—"` when `Number.isNaN(new Date(value).getTime())` — the same defensive pattern already used by `isContractExpiringSoon`'s `Number.isFinite` guard. This is the highest-coverage fix for the documented top hypothesis (it hardens every date field on the page at once).
  - **Confidence / caveat:** this is **hypothesis-targeted hardening**, not a digest-confirmed root-cause fix — the production digest message is masked and this no-deploy worktree cannot read the dev Cloud Run log. A bad-date throw is the single most likely cause of a data-specific server-render 500 on this page, and the guard cannot regress valid-date behaviour. Confirmation = the post-deploy dev re-audit returning HTTP 200 for `/vehicles/veh-demo-001`. If the 500 persists, the next suspects are the unguarded `.localeCompare` sort keys (`updatedAt` / `scheduledAt`) on the contract/incident/maintenance lists.

### 3.2 P1 — PA `/pricing` tab switching: merged fix (#514) is insufficient

- Playwright re-run at `2026-06-05T08:30:59Z` recorded `checks.pricingTabs=fail`.
- **The deployed build already has the `<Link>` fix (#514).** Live DOM: the tab is `<a href="/pricing?tab=driver">`, correctly styled.
- **Isolated root cause (live probes):**
  - **Direct URL navigation works:** loading `https://…/pricing?tab=driver` ends on `/pricing?tab=driver` and highlights the `Driver Fee Plans` tab. So server-side `searchParams`-driven `activeTab` is correct.
  - **Client-side tab click does NOT:** clicking the `<a href="/pricing?tab=driver">` (replace, scroll:false) fires a `framenavigated` event but lands back on `/pricing` with the `?tab=` **query stripped** — with **no console/page errors** (hydration is healthy). The App Router soft-navigation for a same-pathname, query-only change is dropping the search params.
  - Both prior approaches hit this: #510 (`router.replace(pathname?tab=…)`) and #514 (`<Link href=…?tab= replace>`) rely on the same App Router client navigation, so neither updates the URL on click.
- **Fix applied (this branch, `apps/platform-admin-web/app/pricing/page.tsx`):** `activeTab` is now local React state seeded from the URL (`?tab=`), a `useEffect` re-syncs it when the URL changes outside a click (direct `?tab=` nav, browser back/forward), and the tab strip is now `<button onClick={handleTabChange}>` instead of `<Link replace>`. `handleTabChange` updates local state **and** the address bar with `window.history.replaceState(...)` directly, bypassing the App Router same-pathname soft-nav that dropped the query. Removed the now-unused `Link` / `useRouter` imports. Verified by `typecheck` + `lint` + production `next build`.
  - **Confidence / caveat:** behavioural correctness is confirmed by code review against the isolated root cause (direct `?tab=` already worked server-side; only the client soft-nav dropped the query — local state + History API is the canonical work-around). Full behavioural proof = the post-deploy dev re-audit recording `checks.pricingTabs=pass`; no local browser run was possible in this no-deploy worktree.
- Evidence: `.artifacts/func-audit/dev-gap-audit-results.json` (`checks.pricingTabs`), live probe transcript summarized above.

## 4. Raw audit outputs

- Summary markdown: `.artifacts/func-audit/dev-gap-audit-summary.md`
- Machine-readable route census: `.artifacts/func-audit/dev-gap-audit-results.json`
- Route screenshots:
  - Platform Admin: `.artifacts/func-audit/platform-admin-*.png`
  - Ops Console: `.artifacts/func-audit/ops-console-*.png`

## 5. Closeout status for `GAP-VERIFY`

Per `GAP-VERIFY-UNBLOCK-PLANNING-DECISION` (Codex, approved 2026-06-05T07:06Z),
the parent task was unblocked to **resume execution** — i.e. fix the two
defects inline, deploy to dev, and re-run this audit — rather than route them to
separate fix tasks. Both code fixes are now implemented on `claude2/gap-verify`.

- **Fixes implemented & branch-verified:**
  - OPS `/vehicles/[vehicleId]` 500 → date-formatter invalid-date hardening (§3.1).
  - PA `/pricing` `?tab=` sync → local tab state + History API (§3.2).
  - Gates: `typecheck` ✅, `lint` (`--max-warnings=0`) ✅, production `next build` ✅ for both `@drts/platform-admin-web` and `@drts/ops-console-web`.
  - **Branch brought current with `origin/dev` (2026-06-06):** merge `7fc45d97`
    pulls in #538/#540 with no conflicts; `typecheck` re-run green for both apps
    on the combined tree, so the branch is merge-ready from a current base.
- **Acceptance status (gated on a deploy this worktree cannot perform):**
  - all 39 routes `0 HTTP 500` on dev: **pending re-audit** (fix committed; vehicle fix is hypothesis-targeted — see §3.1 caveat).
  - single shell everywhere: **passed** (already green on current dev).
  - all tab strips round-trip: **pending re-audit** (`/pricing` fix committed).
- **Integration hand-off (cannot be done from this no-deploy worktree):**
  1. Merge `claude2/gap-verify` → `dev` via PR + CI.
  2. Run `Deploy - Dev` and confirm the new revision includes both fixes.
  3. Re-run this browser audit; expect `/vehicles/veh-demo-001` → HTTP 200 and `checks.pricingTabs=pass`; then update §1 scoreboard to 39/39 and close `GAP-VERIFY` as `done` with `INTEGRATION_STATUS=dev_deployed`.
  - If the vehicle 500 persists after deploy, pull the dev digest log for `863528574` and check the unguarded `.localeCompare` sort keys called out in §3.1.
