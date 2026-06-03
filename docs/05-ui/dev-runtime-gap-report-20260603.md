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
- **One confirmed regression with a known fix:** `/revenue` calls the browser client `getOpsClient()` (which dereferences `window`) inside an async server component → guaranteed SSR crash. Root cause confirmed; fix is a one-line client swap.

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

### 4.2 `/drivers`, `/vehicles` — list pages crash, last touched by #500
Both list pages were last modified by #500 (ASSIST-INTEGRATION), which embedded `<PublishAssistantScope>` (`refs=2`) into them; the working detail pages (`/drivers/[driverId]`, `/vehicles/[vehicleId]`) do **not** embed it (`refs=0`). The embedded hook `useOpsAssistantContextActions()` itself is NOOP-safe (defaults to `NOOP_ACTIONS`, does not throw), so the crash is **not** the hook alone — it is an unguarded server-render error in these 845–915-line pages. **Definitive root cause needs the SSR error (Cloud Run logs / local prod render);** gcloud in the audit session could not refresh auth non-interactively.

### 4.3 `/contracts` — list page crash, pre-existing
`/contracts` (`page.tsx`) was last modified by **#486** (2026-05, before any of this session's work) and imports **no** ops-assistant code (`refs=0`). It uses the correct `getServerOpsClient()` with `loadWithError` guards. Its `500` therefore predates #500/#504 and has a distinct cause. **Needs the SSR error to pin down.**

> All four `500`s are **server-render** failures, not data-availability: the dev API is healthy (`/api/health` 200), and data endpoints returning `401` to unauthenticated SSR are caught by each page's `loadWithError`.

## 5. Feature / parity gaps (code audit, post-#504)

- **callcenter** — body is now Canvas (23 `CanvasCard`), but its action buttons are still the **imperative** `ActionButton` (12 uses), **not** the descriptor-driven `CanvasActionButton` with risk-tiered confirmation that the canvas authority specifies. Functional parity, not yet interaction parity. (Known/accepted at #504 merge.)
- **Primitive de-mixing — done** on `dispatch/[dispatchId]`, `incidents/[incidentId]`, `complaints`, `drivers/[driverId]`, `vehicles/[vehicleId]` (0 residual `Stepper`/`Timeline`/`WorkflowEmptyState`/`ManagementTone`).
- **Descriptor `ActionButton` adoption** — partial across the app; pages that hand-roll CTAs should migrate to `CanvasActionButton descriptor={…}` for uniform low/medium/high confirmation.
- **Inline forms** — incidents/maintenance/reports were refactored by #504; re-verify they use the modal/drawer-behind-action pattern rather than list-embedded forms once a logged-in pass is possible.

## 6. Recommended next steps (priority order)

1. **P0 — fix `/revenue`** (one-line `getServerOpsClient()` swap). Quick, confirmed.
2. **P0 — get the SSR error for `/drivers`, `/vehicles`, `/contracts`** (re-auth gcloud → `gcloud logging read` on the ops-console Cloud Run revision, or `pnpm --filter @drts/ops-console-web build && start` and request the route). Then fix.
3. **P1 — logged-in Playwright pass** over all 21 ops-console + 18 platform-admin routes to exercise feature-level interactions (the part this report could not runtime-test).
4. **P1 — callcenter descriptor-button migration** for interaction parity.

## 7. Scoreboard

| App | Routes | Runtime OK | Runtime BROKEN | Notes |
| --- | ---: | ---: | ---: | --- |
| Platform Admin | 18 | 18 | 0 | clean |
| Ops Console | 21 | 17 | 4 | `/revenue` `/drivers` `/vehicles` `/contracts` = 500 |
