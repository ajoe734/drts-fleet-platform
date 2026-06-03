# Dev Runtime + Functional Gap Report — Ops Console & Platform Admin

- **Date:** 2026-06-03
- **Auditor:** Claude
- **Environment audited:** dev Cloud Run (live), `dev` branch HEAD `64021a3a` (after #496 PA parity, #500 ops-assistant, #504 ops-parity, all deployed via Deploy — Dev run 26887531434, health-check green)
- **Services:** API `https://drts-dev-api-…run.app` · Ops Console `https://drts-dev-ops-console-web-…run.app` · Platform Admin `https://drts-dev-platform-admin-web-…run.app`

## 0. Method & limitations

- **Runtime load test:** every route GET'd on the live dev URL; HTTP status recorded. Dynamic detail routes tested with a placeholder id (a `404` there means "no such record", which is correct behaviour, **not** a bug).
- **Code/parity audit:** each route's `page.tsx` on `dev` compared against the canvas authority (`docs/05-ui/drts-design-canvas/*`) and the 2026-06-02 body-parity audits.
- **Limitation — feature-level interaction NOT runtime-tested:** both consoles are auth-gated (API returns `401` to unauthenticated calls; `/api/health` is `200`). Without a dev login session, individual buttons/forms/flows cannot be driven from here. Feature gaps below are therefore from **code audit**, not click-through. A logged-in Playwright pass is the recommended complement (see §6).

## 1. Executive summary

- **Platform Admin: healthy.** All **18/18** routes return `200`, including all detail routes. No runtime breakage found.
- **Ops Console: 4 list pages are hard-broken (`500`).** `/revenue`, `/drivers`, `/vehicles`, `/contracts` return HTTP 500 (server render crash) on dev right now. These are the top-priority gaps.
- **Ops Console parity (from #504) verified landed:** the two previously-404 routes now resolve, callcenter is on Canvas primitives, and the Management/Workflow primitive-mixing is gone from the detail pages (0 residual `Stepper`/`Timeline`/`WorkflowEmptyState` refs).
- **All four `500`s root-caused (reproduced locally):**
  - `/revenue` — async server component calls the browser client `getOpsClient()` (derefs `window`). One-line fix (use `getServerOpsClient()`); **fixed in PR #506**.
  - `/drivers`, `/vehicles`, `/contracts` — async server components pass table columns whose cells are **render functions** to the client `<Table>`; React Server Components forbid function props across the boundary, so they 500 on the data-present render path. Fix = extract the table into a `"use client"` child (3 pages).

## 2. Ops Console — runtime status (21 routes)

| Route | HTTP | Verdict |
| --- | --- | --- |
| `/` → `/dashboard` | 200 | OK |
| `/dashboard` | 200 | OK |
| `/dispatch` | 200 | OK |
| `/dispatch/[dispatchId]` | 404* | OK (no sample record) |
| `/callcenter` | 200 | OK (Canvas rebuild landed) |
| `/complaints` | 200 | OK |
| `/complaints/[caseNo]` | 200 | OK (new route landed) |
| `/incidents` | 200 | OK |
| `/incidents/[incidentId]` | 404* | OK (no sample record) |
| `/approval-requests` | 200 | OK |
| `/reports` | 200 | OK |
| **`/revenue`** | **500** | **BROKEN — confirmed cause (§4.1)** |
| `/attendance` | 200 | OK |
| **`/drivers`** | **500** | **BROKEN (§4.2)** |
| `/drivers/[driverId]` | 404* | OK (no sample record) |
| **`/vehicles`** | **500** | **BROKEN (§4.2)** |
| `/vehicles/[vehicleId]` | 200 | OK |
| **`/contracts`** | **500** | **BROKEN (§4.3)** |
| `/contracts/[contractId]` | 404* | OK (no sample record) |
| `/maintenance` | 200 | OK |
| `/feature-flags` | 200 | OK |

\* `404` on a `[param]` route with a placeholder id is expected (record-not-found), not a defect.

## 3. Platform Admin — runtime status (18 routes)

All `200`: `/`, `/fleet`, `/tenants`, `/tenants/[tenantId]`, `/partners`, `/partners/[entrySlug]`, `/payments`, `/payments/reimbursements`, `/payments/reimbursements/[batchId]`, `/pricing`, `/switchboard`, `/tenant-governance`, `/adapter-registry`, `/health`, `/notices`, `/audit`, `/feature-flags`, `/users`. **No runtime gaps.**

## 4. Critical bugs (the four `500`s)

### 4.1 `/revenue` — CONFIRMED, regression, fix ready
`apps/ops-console-web/app/revenue/page.tsx:895` calls `const client = getOpsClient();` inside `export default async function RevenuePage` (a server component). `getOpsClient()` (`lib/api-client.tsx:32`) builds its base URL from `window.location.origin` (lines 58/62). `window` is undefined during SSR → `ReferenceError` → 500. Every other ops server page uses `getServerOpsClient()` (`lib/api-client.server`). Landed via #504 (source branch `codex/ops-parity-rev`). **Fix:** swap to `getServerOpsClient()` and `await` it like the sibling pages.

### 4.2 `/drivers`, `/vehicles`, `/contracts` — CONFIRMED: server component passes function props to a client `<Table>`
**Root cause reproduced locally** (ran `next dev` for ops-console with `DRTS_API_URL` pointed at the dev API; all three returned 500 with an identical error):

```
Error: Functions cannot be passed directly to Client Components unless you
explicitly expose it by marking it with "use server".
  {h: "操作", w: 230, r: function r}   ← table column: header / width / RENDER FN
```

All three pages are **async server components** that build table column arrays whose cells are render functions (`r: ({ row }) => <JSX/>`) and pass them to the client `<Table>` (CanvasTable):
- `/drivers` `page.tsx:1528` — `<Table columns={tableColumns} …/>`, ~7 render-fn columns (defs `:1003–1205`)
- `/vehicles` `page.tsx:2130` — `<Table columns={columns} …/>`, ~7 render-fn columns
- `/contracts` `page.tsx:1962` — `<Table columns={columns} …/>`, ~11 render-fn columns

RSC forbids passing functions across the server→client boundary, so the render crashes. The sibling list pages that work (`/complaints`, `/incidents`) use the **same `<Table>` but are `"use client"` pages**, so the functions never cross the boundary.

**Why 200 locally-without-API but 500 on dev:** the `<Table>` only renders on the data-present path; with the API unreachable (`ECONNREFUSED`) the page falls to an empty/error branch that never mounts the table, so the function-prop serialization never happens. As soon as the API responds (dev: reachable; even a `401` envelope), the table renders and the page 500s.

**Fix:** extract each page's table (column defs + `<Table>`) into a small `"use client"` child component that takes serializable rows and owns its render functions — mirroring how `/complaints` and `/incidents` already work. Same mechanical change × 3 pages. (Likely surfaced/hardened by the Next.js 16 RSC serializer.)

> All four `500`s are **server-render** failures, not data-availability (dev API `/api/health` is 200). §4.1 = `window` deref; §4.2 = RSC function-prop serialization on the data-present render path.

## 5. Feature / parity gaps (code audit, post-#504)

- **callcenter** — body is now Canvas (23 `CanvasCard`), but its action buttons are still the **imperative** `ActionButton` (12 uses), **not** the descriptor-driven `CanvasActionButton` with risk-tiered confirmation that the canvas authority specifies. Functional parity, not yet interaction parity. (Known/accepted at #504 merge.)
- **Primitive de-mixing — done** on `dispatch/[dispatchId]`, `incidents/[incidentId]`, `complaints`, `drivers/[driverId]`, `vehicles/[vehicleId]` (0 residual `Stepper`/`Timeline`/`WorkflowEmptyState`/`ManagementTone`).
- **Descriptor `ActionButton` adoption** — partial across the app; pages that hand-roll CTAs should migrate to `CanvasActionButton descriptor={…}` for uniform low/medium/high confirmation.
- **Inline forms** — incidents/maintenance/reports were refactored by #504; re-verify they use the modal/drawer-behind-action pattern rather than list-embedded forms once a logged-in pass is possible.

## 6. Recommended next steps (priority order)

1. **P0 — `/revenue`** `getServerOpsClient()` swap. **Done — PR #506.**
2. **P0 — `/drivers`, `/vehicles`, `/contracts`** extract each table into a `"use client"` child component so the column render functions no longer cross the server→client boundary (root cause confirmed §4.2). 3 pages, same change.
3. **P1 — logged-in Playwright pass** over all 21 ops-console + 18 platform-admin routes to exercise feature-level interactions (the part this report could not runtime-test). Note: the existing `tests/e2e/*.spec.ts` suite covers assistant + parity smoke only, not every page/function.
4. **P1 — callcenter descriptor-button migration** for interaction parity.

## 7. Scoreboard

| App | Routes | Runtime OK | Runtime BROKEN | Notes |
| --- | ---: | ---: | ---: | --- |
| Platform Admin | 18 | 18 | 0 | clean |
| Ops Console | 21 | 17 | 4 | `/revenue` `/drivers` `/vehicles` `/contracts` = 500 |
