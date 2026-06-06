# DH-FLP-E2E — Acceptance Packet & Dependency Map (Sidecar)

- **Sidecar task:** `DH-FLP-E2E-SIDECAR-ACCEPTANCE`
- **Parent task:** `DH-FLP-E2E` (owner `Codex`, reviewer `Claude2`)
- **Helper kind:** `acceptance_packet`
- **Author:** Claude · **Reviewer:** Codex
- **Generated:** 2026-06-06
- **Class:** support-only sidecar — **does not mutate canonical truth**, contracts, runtime, or the parent's test code. This is a planning/handoff aid for the parent owner and reviewer to absorb at their discretion.

> Authority note: where this packet and the canonical SA/SD or the parent task brief disagree, **the canonical docs and the parent owner win**. This file proposes and maps; it does not decide.

---

## 1. Parent task at a glance

**Title:** Fleet Portal — Playwright 10-route smoke + screenshots vs design.

**Acceptance (verbatim from board):**
> 10 routes pass smoke; single portal shell; screenshot set vs design; remote dev smoke clean after deploy.

**Decomposed assertion families (from the parent `summary_zh`):**

1. every target route is **non-404**
2. all routes render a **single, consistent portal shell** (one nav/chrome, not per-app drift)
3. each route shows the **correct page title**
4. each route shows its **required tabs / tables / cards** (minimum data blocks)
5. **high-risk CTA** elements carry a **reason** (explainability), e.g. revenue-share rule / penalty / clawback context
6. **1440×950 screenshots** captured per route as a visual record
7. **remote dev smoke** re-run is clean **after the portal is deployed to dev**

Artifacts the parent owns: `tests/e2e/fleet-partner-portal-*.spec.ts`, `docs/05-ui/`.

---

## 2. Dependency map

```
DH-FLP-BE-CLIENT ──► DH-FLP-UI-WIRE ──► DH-FLP-DEPLOY ──┐
                          │                              ├──► DH-FLP-E2E (parent)
                          └──────────────────────────────┘
                                  (parent depends on UI-WIRE + DEPLOY)
```

| Task | Role for E2E | Status | Integration | Commit / branch |
| --- | --- | --- | --- | --- |
| `DH-FLP-UI-WIRE` | Pages render live partner-scoped data (with graceful fixture fallback). Provides the DOM the smoke asserts on. | `done` | **`branch_pushed`** (not merged to dev) | `bf7dc31a` · `origin/claude/dh-flp-ui-wire` |
| `DH-FLP-DEPLOY` | Dockerfile (standalone, port **3007**) + `deploy-dev.yml` Cloud Run service `drts-fleet-partner-portal-web` + cross-app link. Provides the **remote dev** environment. | `done` | **`branch_pushed`** (not merged to dev) | `6e6e1d9f` · `origin/claude2/dh-flp-deploy` |
| `DH-FLP-E2E` | This packet's parent. | `in_progress` | — | owner `Codex` |

### 2.1 Readiness gate (the one thing to watch)

Both prerequisites report `done` but **both are only `branch_pushed`** — neither `bf7dc31a` nor `6e6e1d9f` is reachable from `origin/dev` yet. Consequence for the parent's acceptance legs:

- **Local smoke (legs 1–6)** can be authored and run **now** against the portal built from the merged result of the two prereq branches (or against each branch locally). This is the unblocked half.
- **Remote dev smoke (leg 7)** is **gated**: there is no deployed `drts-fleet-partner-portal-web` Cloud Run service on dev until **both branches merge to `dev`** *and* a successful `Deploy - Dev` run includes the portal. Until then, leg 7 is **not satisfiable from a worker** and should be recorded as an integration follow-up, not a parent-owner defect.

**Recommended parent closeout shape:** finalize the local 10-route smoke + screenshots on branch evidence; record the remote-dev smoke leg with `INTEGRATION_STATUS` reflecting reality (`branch_pushed` / `deploy_blocked`) and re-run it once `dev_deployed`. This mirrors the established E2E pattern (E2E-012/013/014: staging/deploy acceptance treated as an integration-layer gap on a healthy lane, not a per-task failure).

---

## 3. Route inventory (authoritative — from `DH-FLP-UI-WIRE` @ `bf7dc31a`)

Root `/` → `redirect("/dashboard")`. The smoke target set is the **10 nav routes** below (matches `lib/fleet-portal-nav.ts`). SA §7.5 lists **9 P0 pages**; the count reconciles because **Revenue Share / Statements is split into two routes** (`/revenue` + `/statements`).

| # | Route | SA §7.5 P0 page | Backing endpoint | Contract status |
| --- | --- | --- | --- | --- |
| 0 | `/` | (redirect → `/dashboard`) | — | n/a |
| 1 | `/dashboard` | Dashboard | `GET /api/fleet-partner/dashboard` (+ `quality-metrics`) | defined |
| 2 | `/drivers` | Drivers | `GET /api/fleet-partner/drivers` | defined |
| 3 | `/vehicles` | Vehicles | `GET /api/fleet-partner/vehicles` | defined; **vehicle-affiliation model gap (SD §9 Q1)** |
| 4 | `/trips` | Trips | `GET /api/fleet-partner/trips` | defined |
| 5 | `/revenue` | Revenue Share / Statements | `GET /api/fleet-partner/statements` | defined; rule explainability required |
| 6 | `/statements` | Revenue Share / Statements | `GET /api/fleet-partner/statements` | defined; statement-detail payload shape gap (Q3) |
| 7 | `/documents` | Documents | **none in SD §6.2** | **contract-not-ready** → graceful fallback expected |
| 8 | `/training` | Training | **none in SD §6.2** | **contract-not-ready** → graceful fallback expected |
| 9 | `/cases` | Incidents / Complaints | **none in SD §6.2** | **contract-not-ready** → graceful fallback expected |
| 10 | `/quality` | Quality Metrics | `GET /api/fleet-partner/quality-metrics` | defined; responsibility-vocab gap (Q4) |

---

## 4. Acceptance checklist (proposed)

### 4.1 Per-route smoke matrix (legs 1–5)

For **each** of the 10 routes:

- [ ] **non-404** — route resolves with HTTP 200 and renders (no Next error boundary, no empty body).
- [ ] **single portal shell** — exactly one portal chrome present: brand mark + nav from `buildFleetPortalNav` with all 10 links; no second app's shell, no nav drift between routes.
- [ ] **correct title** — page heading matches the route's intent (Dashboard / Drivers / Vehicles / Trips / Revenue / Statements / Documents / Training / Cases / Quality), and document `<title>` resolves under the "Fleet Partner Portal" brand. Verify against central `t()` keys, not hardcoded strings.
- [ ] **required tabs/tables/cards present** — the page's minimum data blocks render (see §4.2). Counts/KPIs derive from loaded seam rows, not literals.
- [ ] **high-risk CTA carries a reason** — any destructive / financially-significant / penalty / clawback / dispute affordance is accompanied by an explanatory reason string (rule type: `percent_of_gross` / `fixed_per_trip` / `monthly_fixed` / `tiered_bonus`, or responsibility context). Read-first surface: if no write CTA exists yet, assert the explainability text on revenue/quality rows instead.

### 4.2 Minimum data blocks per route (from design handoff §5)

- **/dashboard** — KPI summary (active drivers, active vehicles, completed trips, current-period gross, fleet share, open incidents, quality-risk count); recent-statement snapshot; operational watchlist.
- **/drivers** — affiliated driver registry table + performance/quality rollups.
- **/vehicles** — vehicle registry with eligibility / utilization / compliance columns; keep vehicle-affiliation gap visible.
- **/trips** — attributed trip ledger with drilldown.
- **/revenue** — revenue-share breakdown with rule explainability per formula type.
- **/statements** — period statement list, payout status, line-item review; period switching (current vs historical).
- **/documents**, **/training**, **/cases** — content shown via **graceful fallback** (fixtures + "contract-not-ready / dependency unavailable" indicator), since no portal endpoint exists yet. Smoke should assert the page is non-404 and shows the fallback affordance rather than a crash.
- **/quality** — quality KPI + responsibility-tracking view.

### 4.3 Screenshot leg (leg 6)

- [ ] 1440×950 screenshot captured for each of the 10 routes.
- [ ] **⚠ No canonical design canvas exists for this surface.** The design handoff (`docs/05-ui/fleet-partner-portal-design-handoff-20260604.md` §0) states this is a *brand-new surface with no design canvas* and defines no `Fleet Partner Portal.html`. A repo search finds no such file. Therefore the screenshot leg is a **visual record / self-consistency artifact**, **not** a pixel-diff against a canonical HTML. Recommend the parent capture this explicitly so "screenshots vs design" is not read as a comparison that cannot be performed. If a canvas is later produced, re-baseline.

### 4.4 Remote dev smoke (leg 7) — gated

- [ ] Re-run the 10-route smoke against the deployed dev service `drts-fleet-partner-portal-web` (port 3007 via control-plane-web-proxy).
- [ ] **Precondition:** `DH-FLP-UI-WIRE` **and** `DH-FLP-DEPLOY` merged to `dev` + a successful `Deploy - Dev` run includes the portal. **Not satisfiable until then** (see §2.1). Record with honest `INTEGRATION_STATUS`.

---

## 5. Contract gaps to keep visible (do not paper over in the smoke)

From handoff §6/§9 — the smoke must **assert the gap is surfaced**, not assume the data exists:

1. **Vehicle affiliation** — SA requires it; SD defines only driver affiliation. `/vehicles` ownership seam is incomplete.
2. **Missing portal contracts** — Documents / Training / Incidents-Complaints are P0 pages with **no** SD §6.2 endpoint → `/documents`, `/training`, `/cases` rely on graceful fallback.
3. **Statement detail shape** — line-item explainability payload not fully specified.
4. **Responsibility vocabulary** — penalty / clawback enum/status taxonomy not finalized.
5. **Portal write authority** — docs define read endpoints only; do not invent write CTAs.

---

## 6. Handoff to reviewer (Codex)

**What this packet delivers:**
- Dependency map with the live integration-status reality (both prereqs `branch_pushed`, not merged to dev).
- Authoritative 10-route inventory reconciled against SA's 9 P0 pages, with endpoint + contract status per route.
- A per-route acceptance checklist decomposing the parent's terse acceptance line into testable assertions.
- Two surfaced risks the parent owner should decide on explicitly:
  - **(a)** the **remote-dev smoke leg is gated** on merge+deploy and is not worker-satisfiable yet;
  - **(b)** the **"screenshots vs design" leg has no canonical canvas** to diff against.

**What it deliberately does *not* do:** write or edit `tests/e2e/fleet-partner-portal-*.spec.ts`, change any canonical doc, or transition the parent task. Absorption into the parent's mainline is the parent owner's call.

**Suggested next step for the parent owner (`Codex`):** author the local 10-route smoke + 1440×950 screenshots now; finalize on branch evidence with `INTEGRATION_STATUS=branch_pushed`; track leg 7 (remote dev smoke) as an integration follow-up to re-run once the portal is `dev_deployed`.
