# Dev Runtime + Functional Gap Report (browser-verified)

- **Date:** 2026-06-03
- **Auditor:** Claude
- **Environment:** live dev Cloud Run, `dev` HEAD `64021a3a` (after #496 / #500 / #504, deployed).
- **Method:** (1) HTTP status of every route; (2) **headless-Chromium functional pass** (Playwright) over all 29 list routes — render, JS `pageerror`/console errors, interactive-element inventory, tab clicks, button clicks; (3) **visual confirmation by reading the captured screenshots** (`.artifacts/func-audit/*.png`); (4) code root-cause for every confirmed bug. **No login needed** — neither web app has auth middleware; dev Cloud Run is `--allow-unauthenticated`.
- **Honesty note on method:** the *automated* interaction detectors (double-shell by brand-count, tab-switch by aria-state) proved **flaky/hydration-timing dependent** — they both over-reported (e.g. `/adapter-registry` falsely flagged double-shell; many disabled-by-design buttons flagged as "failures") and under-reported (tab-strip detection silently found nothing on a later run). **Confirmed bugs below are grounded in screenshots + first-hand user reports + code, not in the flaky detector output.** Building a real, deterministic per-page/per-function e2e suite is itself a tracked gap (see GAP-E2E-SUITE).

## 1. Scoreboard (confirmed)

| App | Routes | Fully working | **Broken** |
| --- | ---: | ---: | ---: |
| Platform Admin | 18 | 16 | **2** ( `/fleet`, `/pricing` ) |
| Ops Console | 21 | 17 | **4** ( `/revenue`, `/drivers`, `/vehicles`, `/contracts` — all HTTP 500 ) |

## 2. Confirmed bugs + root cause

### P0 — HTTP 500 (page completely dead)
1. **OPS `/revenue`** — async **server** component calls the **browser** client `getOpsClient()` (`lib/api-client.tsx`), which derefs `window.location.origin` → SSR `ReferenceError`. **Fixed — PR #506** (swap to `getServerOpsClient()`).
2. **OPS `/drivers`, `/vehicles`, `/contracts`** — async **server** components build table column arrays whose cells are **render functions** (`r: ({row}) => <JSX/>`) and pass them to the client `<Table>` (`drivers:1528`, `vehicles:2130`, `contracts:1962`). React Server Components forbid function props across the server→client boundary → 500 on the data-present render path (200 only when the API is unreachable and the table branch never mounts). Sibling list pages that work (`/complaints`, `/incidents`) use the **same `<Table>` but are `"use client"` pages**. **Fix:** extract each page's table (columns + `<Table>`) into a `"use client"` child that takes serializable rows.

### P1 — loads but structurally/interaction broken
3. **PA `/fleet` — double shell (殼中殼).** Screenshot shows **two nested "DRTS PLATFORM ADMIN" sidebars**. Cause: `app/layout.tsx` already wraps every page in `<AdminShell>`, but **only** `fleet/page.tsx` *also* wraps its body in `<CanvasShell>` (`fleet/page.tsx:1715`) — it is the single page in the app that double-wraps. **Fix:** remove the inner `<CanvasShell>` (render the body directly, like every other PA page).
4. **PA `/pricing` — tab switching broken (user-reported first-hand).** After landing on `/pricing?tab=passenger`, clicking another tab does not switch. Cause is the `activeTab` ↔ URL `?tab=` sync: `useState("passenger")` (`:615`) + a `useEffect` that writes `params.set("tab", activeTab)` (`:644–650`) interacting with the tab buttons' `onClick={() => setActiveTab(tab.id)}` (`:1063–1067`) and the URL-read path (`~:636–641`). **Fix:** make the URL the single source of truth (derive `activeTab` from `useSearchParams`, navigate on click) or drop the conflicting write-back effect. (Note: the earlier "stuck on *Loading pricing workspace…*" was a **screenshot-timing artifact** — `setLoading(false)` *is* in a `finally`; not a real permanent hang.)

## 3. To re-verify (automated signal was flaky — needs a manual click-through)
- **PA `/payments`** and **OPS `/attendance`** tab strips: the noisy pass flagged a tab that didn't switch / couldn't return, but a later run found nothing. Re-confirm by hand. Folded into GAP-E2E-SUITE.

## 4. Not bugs (graceful empty-data states)
`/adapter-registry`, `/fleet`→Vehicles, and several lists render a clean "資料暫時不可用 / no_data" empty state when the backend has no rows / returns 401 to the SSR fetch. These are handled states, **not** crashes — lower priority (seed dev data to exercise the populated path).

## 5. Test-infrastructure gap
There is **no comprehensive e2e suite**. `tests/e2e/*.spec.ts` covers only assistant + parity smoke. The user's requirement — *every page, every function tested* — needs a deterministic Playwright suite with explicit per-route, per-control assertions (tab switch + round-trip, every enabled button, form submit, modal open/close, single-shell assertion, no-pageerror). Tracked as **GAP-E2E-SUITE**.

## 6. Execution plan (dispatched to the orchestrator)
See `scripts/dispatch-dev-runtime-gap-fixes.py`. Tasks registered for supervisor/auto-worker pickup:

| Task | Scope |
| --- | --- |
| `GAP-OPS-LIST-RSC` | Extract `<Table>` into a `"use client"` child for `/drivers`, `/vehicles`, `/contracts` (fix the RSC 500s) |
| `GAP-PA-FLEET-SHELL` | Remove the inner `<CanvasShell>` from `/fleet` (kill the double shell) |
| `GAP-PA-PRICING-TABS` | Make `/pricing` tabs URL-driven so switching works |
| `GAP-E2E-SUITE` | Deterministic per-page/per-function Playwright suite across all 39 routes + wire into CI |
| `GAP-VERIFY` | After fixes deploy to dev, re-run the browser pass; confirm 0 broken routes |

(`/revenue` is already addressed by PR #506 and is excluded from the wave.)
