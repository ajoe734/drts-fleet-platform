# Design Handoff 20260525 — Implementation Plan & Gap Analysis

- **Date:** 2026-06-06
- **Source bundle:** `driver app-handoff.zip` (claude.ai/design export; packets dated 20260525, phase-1 visual requirements 20260604)
- **Archive:** `~/workspace/design-handoffs/driver-app-handoff-20260525/` (zip + extracted)
- **Canvas landed by:** PR #536 (`docs/05-ui/drts-design-canvas/` refresh + `fleet-partner-portal-design-handoff-20260604.md`)
- **Scope:** Implement Parts B–H. **Part A (Public Website / 官網) is explicitly OUT of scope** per owner instruction.

This document is the canonical execution plan for turning the handoff into shipped UI. It records the
design-vs-repo gap per app, the Fleet Partner Portal topology decision, and the agreed execution order.

---

## 1. Official scope map (phase-1 visual requirements 20260604)

| Part | Surface | Repo target | Status |
|------|---------|-------------|--------|
| A | Public Website 官網 | `site/` (handoff) | **EXCLUDED** |
| B | Tenant / Partner Portal | `apps/tenant-console-web` | routes complete — deepen only |
| C | Partner Booking Web | `apps/partner-booking-web` | generic flow exists — program-branding build-out |
| D | Driver App | `apps/driver-app` (Expo) | 8 screens complete — state deepening only |
| E | Fleet Partner Portal | **NEW `apps/fleet-partner-portal-web`** | **brand-new app, 10 routes — the only true net-new surface** |
| F | Platform Admin | `apps/platform-admin-web` | **already built on dev (#534)** — conformance only |
| G | Ops Console | `apps/ops-console-web` | 2 detail routes already on dev — conformance only (PR #539) |
| H | Design System | `packages/ui-web`, `packages/ui-tokens` | tokens refresh (`mgmt-tokens.jsx`) |

> **Correction (2026-06-06):** an earlier draft of this plan listed Part F as "6 net-new pages". That was
> read from a **stale local `dev` working tree** that lagged `origin/dev`. Verified against `origin/dev`,
> Part F is **already built** (PR #534). Always check `origin/dev`, not the working tree. The only genuine
> net-new build is the Fleet Partner Portal (Part E / batch A).

---

## 2. Fleet Partner Portal topology decision (Part E)

**Decision: build a new standalone app `apps/fleet-partner-portal-web` (Next.js).**

Rationale, from `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §6.2, which splits the API into two surfaces:

- `/api/admin/fleet-partners/*` — **internal** Platform Admin management of fleet partners → lives in `apps/platform-admin-web` (Part F4).
- `/api/fleet-partner/*` (`dashboard`, `drivers`, `vehicles`, `trips`, `statements`, `quality-metrics`) — **external, partner-scoped self-service** → a separate auth boundary, cannot share the internal admin shell.

The design canvas (`fleet-screens.jsx`) renders the portal as a desktop Shell + side-nav (10 routes per spec §E2),
matching the other web consoles. Backend (`/api/fleet-partner/*`, `fleet-partner` / `service-product` /
`vehicle-eligibility` modules) is already on `dev` (PR #534). The portal was previously blocked by
`FLEET-PORTAL-HANDOFF` ("全新 app 且無 design canvas → 禁止 LLM 自創"); this bundle supplies the missing canvas.

**10 routes (§E2):** dashboard 營運總覽 · drivers 司機 · vehicles 車輛 · trips 趟次 · revenue 分潤 · statements 對帳單 · documents 文件 · training 訓練 · cases 事故/申訴 · quality 品質指標.

---

## 3. Per-app gap

### Part F — Platform Admin: ALREADY BUILT on dev (#534) — conformance only

Verified on `origin/dev` (all use `@drts/ui-web` canvas primitives + central `t()`):

| Surface | Route on dev | Notes |
|---------|--------------|-------|
| Service Products | `service-products/page.tsx` (852L) | F2 fields present (timing / proof / meter / fixed-fare / active) |
| Vehicle Eligibility Matrix | `vehicle-eligibility/page.tsx` (942L) | F3 matrix; **candidate gap:** conditionally-allowed / required-documents / training-required cell states thin |
| Fleet Partners | `fleet-partners/page.tsx` (451L) + `[fleetPartnerId]/page.tsx` (850L) | detail has driver / affiliation / statement tabs |
| Driver Affiliations / Revenue Share Rules / Fleet Statements | tabs inside the fleet-partner detail | not separate routes |

Backend (`admin/service-products`, `admin/vehicle-eligibility-matrix`, `admin/fleet-partners/*`) all on dev.
Remaining work = a **focused conformance pass** against this canvas, not a rebuild. Extensions (not new pages):
Partner Programs → extend `/partners`; Tenant Service Programs → tenant-governance.

### Part G — Ops Console: conformance only

`/complaints/[caseNo]` and `/contracts/[contractId]` are **already on dev** (substantive: ~10KB / ~20KB) and
cover most of packet §5.6 / §5.19. Remaining: conformance pass for the not-yet-covered must-show / must-support
items (availableActions surface, recovery notes, PII-masked recording playback, manual SLA waiver; contract
version history + cross-app deep-link). No new routes.

### Part C — Partner Booking Web: program-branding build-out

`apps/partner-booking-web` has the generic flow. Design (`pb-screens.jsx`) needs 3 program-branded entries
(中信銀行 機場接送 / 富邦產險 保險代步 / 雄獅旅遊 團體接送) with per-program theme + program-specific forms (C3) +
review + tracking screens. Build-out, not a new app.

### Part D — Driver App / Part B — Tenant Console: routes complete

All 8 Driver App Expo screens and all 20 Tenant Console routes exist. Work is state-deepening to spec
(Driver: relay/forwarded, sync_failed, lost_race, SOS protected, offline; Tenant: dashboard cards/charts,
booking detail tabs, new-booking program fields, payables/statements B6). No new routes.

---

## 4. Execution order (agreed C→B→A; revised after origin/dev verification)

1. **C — Ops conformance** — ✅ **done, PR #539**. `/complaints/[caseNo]` brought to §5.6; `/contracts/[contractId]` already met §5.19.
2. **B — Platform Admin Part F conformance** — pages already built (#534); focused gap-fix only (primary candidate: vehicle-eligibility F3 cell states). Not a rebuild.
3. **A — Fleet Partner Portal** (the only true net-new): scaffold `apps/fleet-partner-portal-web`, 10 routes, partner-scoped auth, `/api/fleet-partner/*`. **Backend caveat:** only `fleet-partner/statements` exists on dev today; dashboard/drivers/vehicles/trips/quality-metrics portal endpoints are not yet built — UI uses graceful fallback (matching the ops-detail pattern) and the missing endpoints are a backend follow-up.

Later (deepening, not new build): Part C program-branding, Part D / Part B state deepening, Part H token sync.

## 5. House-style constraints (carry forward)

- Use central `translations.ts` `t()` — no inline `locale===` ternaries or per-page copy objects (i18n remediation, PR #517).
- Reuse `@drts/ui-web` canvas-primitives (CanvasTable, Stepper, Timeline, EmptyState, ActionButton); do not reinvent (ops-parity remediation).
- Match the human design canvas pixel-for-pixel; do NOT redesign (no-llm-ui-design rule).
- Branch from `origin/dev` → commit → push → PR per surface.
