# Ops Console Body Parity Audit

**Date:** 2026-06-02
**Auditor:** Claude
**Target app:** `apps/ops-console-web`
**Runtime baseline:** `origin/dev` at `3996828a` (working tree, branch `codex/platform-admin-body-parity-audit-20260602`)
**Companion doc:** [`platform-admin-body-parity-audit-20260602.md`](./platform-admin-body-parity-audit-20260602.md) (sister app, same method)

## 1. Authority

The implementation target is the visual + functional pair below:

- Visual authority: `docs/05-ui/drts-design-canvas/Ops Console.html` (coral accent, v0.6)
- Canvas JSX reference: `docs/05-ui/drts-design-canvas/ops-screens-1.jsx`, `ops-screens-2.jsx`, `ops-screens-3.jsx` (all 20 screen functions `OC_*`)
- Functional authority: `docs/05-ui/ops-console-design-handoff-packet-20260525.md`
- Behavior/data/API overrides: `docs/05-ui/system-design-answers-all-apps-20260524.md`

`UI-FE-OPS` acceptance is **all 20 routes per Ops Console canvas**, rendered with the **single Canvas primitive family**, descriptor-driven (`availableActions[]`) CTAs with risk-tiered confirmation, and the empty/stale/degraded state contracts. The shell is already canvas; this does **not** by itself complete body parity.

> **Per packet §4.1 the canonical Ops Console sitemap is 20 routes** (the §4.1 prose header still says "18" but is stale — the v0.6 canvas note and the route table both enumerate 20, including the 3 NEW detail routes `/complaints/[caseNo]`, `/vehicles/[vehicleId]`, `/contracts/[contractId]`).

## 2. Audit Method

- Read the handoff packet (§2–§7) and all 20 `OC_*` canvas screen functions.
- Inspected every runtime route file under `apps/ops-console-web/app/**/page.tsx` plus co-located components.
- Mapped the actual `@drts/ui-web` export surface to determine which primitives are "Canvas" vs older families.
- Compared, per route: route presence, page title, tabs/sub-boards, primary cards/tables/columns, state machines (stepper), timelines, high-risk action affordances, descriptor wiring, and empty/stale/degraded states.
- Measured per-page size and primitive mix as a structural divergence signal.

## 3. Executive Summary

The Ops Console is **further along than Platform Admin on chrome, but not body-parity complete, and it has a systemic primitive-mixing problem.**

What is now correct:

- **No legacy CSS.** There are **zero** `.admin-*` / `.ops-page` / `.ops-card` / `.ops-table` / `.ops-toggle` classes anywhere in `app/` or `components/`. This is the one thing Platform Admin still had to clean up; Ops Console does not.
- **Shell is canvas.** `components/ops-shell.tsx` wraps `CanvasShell` from `@drts/ui-web` with `buildCanvasTheme({ surface: "ops", dark: true, density: "compact" })`. `lib/ops-shell-nav.ts` builds the exact 5-section nav (工作面 / 即時派遣 / 案件處理 / 營運監控 / 主資料) matching the canvas `OPS_NAV`. There is no nested shell and no `AppSidebar`.
- **Most route bodies already use Canvas primitives** (`CanvasCard`, `CanvasTable`, `CanvasPill`, `CanvasBanner`, `CanvasKPI`, `CanvasDL`, `CanvasField`, `CanvasPageHeader`, `CanvasBtn`, `CanvasIcon`).
- `/dispatch` already implements the **six first-class sub-boards** (ready / assigned / exception / no_supply / governance / forwarded).
- `/approval-requests` exists (was a worry — it is present and canvas-built).

Still missing or incomplete (this is the backlog):

- **2 of 20 canvas routes do not exist** (will 404): `/complaints/[caseNo]`, `/contracts/[contractId]` — both are NEW detail routes the canvas requires (Q-OPS01, Q-OPS03).
- **Primitive-generation mixing (the headline problem).** `@drts/ui-web` ships **three** primitive families — `Canvas*` (current authority), the older **`Management*`** family, and an intermediate **`Workflow*`** family. The Canvas family has **no `Stepper`, no `Timeline`, no `EmptyState`, and no `ActionButton`**. So every ops page that needs a state-machine stepper, a timeline, an empty state, or a descriptor-driven CTA currently **reaches into the old Management/Workflow families** — i.e. exactly the "混用 / 舊程式碼" the goal says to eliminate. Pages mixing in `Stepper` / `Timeline` / `WorkflowEmptyState` / `ManagementTone` / `TimelineItem`: `dispatch/[dispatchId]`, `incidents/[incidentId]`, `complaints`, `drivers/[driverId]`, `vehicles/[vehicleId]`, `dispatch/dispatch-workflow.tsx`, `dispatch/page.tsx`.
- **`/callcenter` is essentially bespoke, not canvas.** At 3,373 lines it imports **only** `CanvasPageHeader` from the canvas set; every panel/queue/field is hand-rolled raw `<div>` / `<Input>` / `<Select>` (38 form/state hits, 0 `CanvasCard`, 0 `CanvasTable`). This is the single largest non-canvas body in the app.
- **No descriptor-driven `ActionButton` primitive.** The canvas renders every state-changing CTA through `ActionButton descriptor={{action, enabled, disabledReasonCode, requiresReason, riskLevel}}` with built-in low/medium/high confirmation. No such shared component exists; pages hand-roll buttons. Some honor `ResourceActionDescriptor` partially (`feature-flags`, `maintenance`, `dashboard`); most do not.
- **Inline forms crammed into list pages** instead of the canvas modal/drawer-behind-action pattern: `incidents` (34 form hits), `maintenance` (25), `complaints` (29), `reports` (20), `callcenter` (38).
- **Page bodies are 15–50× the canvas reference size** (canvas screens ~50–120 lines; implementations 1,200–3,400 lines), indicating heavy accumulated bespoke logic to fold back into canvas structure.
- **Title-wording drift** on several pages (see census).
- `/dispatch/[dispatchId]` uses the param name `dispatchId`; canvas route id is `[workItemId]` and the screen handles both `owned` and `forwarded` via a `domain` flag.

## 4. Route Census

Captured 2026-06-02 from runtime route files (local truth; remote dev verification is a P2 step).

| Route                            | File present | Canvas screen | Audit result                                                                       |
| -------------------------------- | -----------: | ------------- | ---------------------------------------------------------------------------------- |
| `/` → `/dashboard`               |          yes | redirect      | `app/page.tsx` redirects to `/dashboard`. OK.                                      |
| `/dashboard`                     |          yes | `OC_Dashboard` | Exists, canvas primitives; title/KPI/section parity needs work.                   |
| `/dispatch`                      |          yes | `OC_Dispatch`  | Exists; 6 sub-boards present; mixes `WorkflowEmptyState`.                          |
| `/dispatch/[dispatchId]`         |          yes | `OC_DispatchDetail` | Exists; param name ≠ canvas `[workItemId]`; uses Management `Stepper`/`Timeline`. |
| `/callcenter`                    |          yes | `OC_Callcenter` | Exists but **bespoke** (only `CanvasPageHeader`); full rebuild to canvas.         |
| `/complaints`                    |          yes | `OC_Complaints` | Exists; canvas primitives + inline forms + Management `Timeline`.                 |
| `/complaints/[caseNo]`           |       **no** | `OC_ComplaintDetail` | **Missing route (NEW Q-OPS01).**                                            |
| `/incidents`                     |          yes | `OC_Incidents` | Exists; heavy inline forms; title is a count string.                              |
| `/incidents/[incidentId]`        |          yes | `OC_IncidentDetail` | Exists; uses Management `Timeline`; PageHeader title needs check.            |
| `/approval-requests`             |          yes | `OC_Approvals` | Exists; canvas table. Verify cross-tenant chip + role-gated nav.                  |
| `/reports`                       |          yes | `OC_Reports`   | Exists; canvas tabs (Report jobs/Filing/Schedules) + inline forms.                |
| `/revenue`                       |          yes | `OC_Revenue`   | Exists; canvas primitives; verify mismatch drawer + cross-app deep link.          |
| `/attendance`                    |          yes | `OC_Attendance` | Exists; canvas KPIs; verify gantt vs canvas.                                      |
| `/maintenance`                   |          yes | `OC_Maintenance` | Exists; canvas table + inline create/edit forms.                                 |
| `/drivers`                       |          yes | `OC_Drivers`   | Exists; canvas table.                                                              |
| `/drivers/[driverId]`            |          yes | `OC_DriverDetail` | Exists; uses Management `Timeline`/`TimelineType`; verify SOS chrome + tabs.    |
| `/vehicles`                      |          yes | `OC_Vehicles`  | Exists; canvas table.                                                              |
| `/vehicles/[vehicleId]`          |          yes | `OC_VehicleDetail` | Exists (NEW Q-OPS02); uses Management `Timeline` + `WorkflowEmptyState`.       |
| `/contracts`                     |          yes | `OC_Contracts` | Exists; canvas table.                                                              |
| `/contracts/[contractId]`        |       **no** | `OC_ContractDetail` | **Missing route (NEW Q-OPS03).**                                           |
| `/feature-flags`                 |          yes | `OC_FeatureFlags` | Exists; closest to canvas; descriptor-aware. Title uses subtitle key.          |

**Route totals:** 20 canonical · 18 present · **2 missing**.

## 5. Priority Model

- **P0:** Missing route, or canvas-acceptance blocker (primitive family decision that everything else depends on).
- **P1:** Existing route body must be rebuilt / de-mixed to match canvas.
- **P2:** Title wording, contract wiring polish, test coverage, remote visual verification.

## 6. Cross-Route Work Items

### P0-A. Resolve the Canvas primitive gap (blocks all "no mixing" work)

This is the root cause of the mixing and must be decided **before** large body rebuilds, because every detail page needs it.

The Canvas family (`packages/ui-web/src/canvas-primitives`) currently exports only: `Banner`, `Btn`, `Card`, `DL`, `Field`, `Input`, `KPI`, `PageHeader`, `Pill`, `Select`, `Shell`, `Table`, `TrafficLights`, `WindowChrome`, `CanvasIcon`. It is **missing** the primitives the canvas mock uses freely:

- `CanvasStepper` (state machine) — canvas uses it on dispatch detail; today pages use Management `Stepper`.
- `CanvasTimeline` — canvas uses it on every detail screen; today pages use Management `Timeline` + `TimelineItem`.
- `CanvasEmptyState` (the 6 `EmptyReason` variants) — today pages use `WorkflowEmptyState`.
- `CanvasActionButton` (descriptor-driven, risk-tiered confirm) — today hand-rolled.
- `CanvasHealthBanner` / `CanvasStaleBanner` — canvas mock uses `HealthBanner` / `StaleBanner`.
- `CanvasBiLabel` (zh · en bilingual label) — canvas mock uses `BiLabel`.

**Deliverable:** add these to `canvas-primitives` and re-export as `Canvas*` from the `@drts/ui-web` barrel, then migrate every ops page off Management `Stepper`/`Timeline`, `WorkflowEmptyState`, and the `Management*`/`TimelineItem` types. Acceptance: `grep -rn "\bStepper\b\|\bTimeline\b\|WorkflowEmptyState\|ManagementTone\|TimelineItem" apps/ops-console-web` returns **zero** matches (only `Canvas*` equivalents remain). Coordinate with platform-admin/tenant-console so the new canvas primitives are shared, not ops-local.

### P0-B. Create the two missing canvas routes

- `apps/ops-console-web/app/complaints/[caseNo]/page.tsx` per `OC_ComplaintDetail` (case summary DL, cross-actor timeline, PII-masked recording card, linked-entities, recovery notes; actions note/assign/resolve/escalate with escalate = high+reason).
- `apps/ops-console-web/app/contracts/[contractId]/page.tsx` per `OC_ContractDetail` (operational-terms DL, authority-redirect banner to Platform Admin, linked tenant/partner, version-history timeline; read-only at ops).

Acceptance: both routes return 200, row links from `/complaints` and `/contracts` navigate to them.

### P0-C. Rebuild `/callcenter` on canvas primitives

Replace the bespoke raw-`<div>` body with the canvas 3-column layout from `OC_Callcenter` (Waiting list `CanvasCard` + active-session `CanvasCard` with `CanvasDL`/`CanvasField`/`CanvasInput`/`CanvasSelect` + right-rail callback/recording `CanvasCard`s). One-active-session rule per Q-OPS04. Actions (`new_session`, `close_session`, `create_callback`, `create_booking`, transfer-to-complaint) become `CanvasActionButton` descriptors. Empty states use `CanvasEmptyState` reasons (`no_data`, `external_unavailable`).

### P1-A. De-mix and right-size the remaining bodies

For each page below, convert Management/Workflow primitives to Canvas equivalents and move inline create/edit forms into modal/drawer behind descriptor actions:

- `incidents` (34 form hits), `maintenance` (25), `complaints` (29), `reports` (20) — table-first canvas bodies; forms become actions.
- `dispatch/[dispatchId]`, `incidents/[incidentId]`, `drivers/[driverId]`, `vehicles/[vehicleId]`, `complaints` — migrate `Timeline`/`Stepper` to `CanvasTimeline`/`CanvasStepper`.
- `dispatch/page.tsx`, `dispatch/dispatch-workflow.tsx`, `vehicles/[vehicleId]`, `drivers/[driverId]` — migrate `WorkflowEmptyState` to `CanvasEmptyState`.

### P1-B. Make every state-changing CTA descriptor-driven

After P0-A delivers `CanvasActionButton`, route every mutate CTA through `availableActions[]` with risk-tiered confirmation:

- **Medium** (modal confirm + receipt): release driver, redispatch, cancel order, complete callback, close incident, create/edit maintenance, create complaint, resolve, assign, request re-auth.
- **High** (modal + required reason + receipt + audit link): force driver offline per platform, suppress/lift matching, fare override, escalate complaint→incident, reopen closed case, close incident (per canvas), approve/reject/escalate approval requests, notify police.

Disabled actions must show `disabledReasonCode` (e.g. `sos_in_response`, `on_trip`, `incident_open`, `recovery_required`, `active_session_exists`) as a hint, not a dead button.

### P1-C. Standardize empty / stale / degraded states

Use `CanvasEmptyState` with all six `EmptyReason` variants distinctly, `CanvasStaleBanner` on every live surface per `UiRefreshMetadata.dataFreshness`, and the page-top degraded banner per `UiHealthEnvelope` where the page-critical dependency is degraded (dashboard, dispatch forwarded board, callcenter recording ingest).

### P2-A. Title parity

Align visible PageHeader titles to canvas wording:

| Route | Canvas title | Current (zh) |
| --- | --- | --- |
| `/dashboard` | 營運總覽 | 儀表板 |
| `/complaints` | 客訴中心 | 客訴管理 |
| `/incidents` | 事故中心 | `{count} 筆事故顯示中` (count string used as title) |
| `/reports` | 報表 | 報表中心 |
| `/revenue` | 收益審視 | 收益審視 ✓ |
| `/vehicles` | 車輛 | 車輛登記 |
| `/contracts` | 合約 | 合約管理 |
| `/maintenance` | 車輛保修 | 維修保養 |
| `/feature-flags` | 功能旗標 · read only | uses `flags.subtitleReadOnly` as title |
| `/drivers` | 司機 | uses `drivers.pageSubtitle` as title |

(`/dispatch` 派車調度, `/callcenter` 客服中心, `/attendance` 班次與出勤 already match.) Confirm detail-page PageHeader titles render the entity id + state pills (not a card title like 時間軸).

### P2-B. Route-level parity verification

Add Playwright smoke for all 20 routes: non-404, single Ops Console shell, correct title, required tabs/sub-boards visible, required tables/cards present, high-risk CTAs present where canvas requires, **no Management/Workflow primitive in the DOM tree**. Screenshot set at 1440×950 against `Ops Console.html`.

## 7. Route-by-Route Audit

> Convention: "Canvas target" summarizes the `OC_*` function; "Current" states what the runtime file does; "Required" is the work. Priority per item.

### 1. `/dashboard` — `OC_Dashboard`
- **Canvas target:** title `營運總覽`; subtitle shift/handover; actions `值班手冊` + `開新 call session`; 6-KPI row (進行中訂單 / 派遣佇列 / 可派司機 / 位置失聯 / 客訴未結 / 事故進行中); two-column `今日待處理` banner stack (SOS critical / no_supply / gocab sync_failed) + `健康訊號` pill list; `當前 dispatch 隊列 · top 5` table.
- **Current:** exists, canvas primitives, `CanvasKPI`, a `getActionButtonLabel` helper (hand-rolled CTAs), title resolves to `儀表板`.
- **Required:** retitle to `營運總覽`; match KPI set/order; rebuild today's-to-do banner stack + health-signal card to canvas; top-5 dispatch table columns/state pills; CTAs via `CanvasActionButton`.
- **Priority:** P1 (title P2).

### 2. `/dispatch` — `OC_Dispatch`
- **Canvas target:** title `派車調度`; degraded adapter banner; **6 peer sub-boards** with count badges (Ready/Assigned/Exception hold/No eligible supply/Governance blocked/Forwarded mirror), each with its specified columns (see packet §5.2.B); per-row `ActionButton` actions.
- **Current:** exists; all 6 board ids present; uses `CanvasTable`/`CanvasBanner`; pulls in `WorkflowEmptyState`; CTAs partly hand-rolled; `dispatch/dispatch-workflow.tsx` + `forwarded-order-board.tsx` co-located.
- **Required:** swap `WorkflowEmptyState` → `CanvasEmptyState`; verify each board's columns match canvas; CTAs → `CanvasActionButton`; forwarded board "inspect adapter" opens platform-admin `/adapter-registry` in new tab.
- **Priority:** P1.

### 3. `/dispatch/[dispatchId]` — `OC_DispatchDetail`
- **Canvas target:** route `[workItemId]`, one screen for `owned` + `forwarded` (domain badge); header actions call/fare-override(high)/assign; left col: forwarded-mirror info banner (forwarded only) + ranked candidate table + compliance-gates `DL`; right col: **state-machine `Stepper`** + activity `Timeline`.
- **Current:** exists; uses `CanvasDL`/`CanvasTable`/`CanvasBanner`; uses **Management `Stepper` + `Timeline`** (mixing); param dir `[dispatchId]`.
- **Required:** migrate `Stepper`/`Timeline` → `CanvasStepper`/`CanvasTimeline`; align candidate columns + gate DL; CTAs via `CanvasActionButton` (fare override = high+reason); decide param rename to `[workItemId]` (or document the alias).
- **Priority:** P1.

### 4. `/callcenter` — `OC_Callcenter`
- **Canvas target:** title `客服中心`; tabs Sessions/Callback queue/Recordings with badges; 3-column grid (Waiting / active session card with DL + field grid + booking actions / right rail callback + recording queues); one active session per agent.
- **Current:** **bespoke** — only `CanvasPageHeader` imported; entire body is raw `<div>`/`<Input>`/`<Select>` (3,373 lines, 38 form/state hits, 0 `CanvasCard`/`CanvasTable`).
- **Required:** full rebuild on canvas primitives per P0-C; actions → `CanvasActionButton`; empty states → `CanvasEmptyState`.
- **Priority:** **P0** (largest non-canvas body).

### 5. `/complaints` — `OC_Complaints`
- **Canvas target:** title `客訴中心`; tabs 全部/我負責/SLA breach/已升級事故 with badges; 4-KPI row; single case table with backend-computed SLA pill, severity pill, status pill.
- **Current:** exists; `CanvasKPI`/`CanvasTable`/`CanvasPill`; custom `<span>` title; **Management `Timeline`** present (9 hits) and 29 form/state hits (inline create/assign forms).
- **Required:** retitle `客訴中心`; move create/assign into modal/drawer behind `CanvasActionButton`; migrate `Timeline`→`CanvasTimeline` (or remove from list page — timeline belongs on detail); SLA pill `within_sla`/`warning`/`breached` distinct.
- **Priority:** P1.

### 6. `/complaints/[caseNo]` — `OC_ComplaintDetail`
- **Canvas target:** header `caseNo` + SLA breached pill + severity pill; actions note/assign/resolve/escalate(high+reason); left col Case-summary `DL` (3-col) + cross-actor `Timeline`; right col PII-masked recording card + linked-entities `DL` + recovery-notes banner.
- **Current:** **route does not exist (404).**
- **Required:** create route per P0-B; all primitives Canvas; SLA states; escalate high+reason; `notFound()` + closed/resolved read-only variants.
- **Priority:** **P0**.

### 7. `/incidents` — `OC_Incidents`
- **Canvas target:** title `事故中心`; tabs Active/Resolved/Closed; SOS critical banner; `Governance guardrail · 三條鐵律` info card; full incident table (id/title/cat/sev/status/driver/occurred/recovery-count).
- **Current:** exists; `CanvasKPI`/`CanvasTable`/`CanvasDL`/`CanvasField`; **34 form/state hits** (inline create) + Management `Timeline` (13 hits); title renders the `{count} 筆事故顯示中` string, not `事故中心`.
- **Required:** retitle `事故中心`; render the 3-rule guardrail card; move create into modal behind `CanvasActionButton`; migrate `Timeline`→`CanvasTimeline`; SOS banner.
- **Priority:** P1.

### 8. `/incidents/[incidentId]` — `OC_IncidentDetail`
- **Canvas target:** header `inc_id` + critical + in_response pills; actions notify_police(high+reason)/notify_tenant(med)/lift_suppression(high, disabled while open)/resolve(disabled until recovery); left col incident-summary `DL` + `Timeline`; right col service-recovery action list (completed/pending states) + linked-entities `DL` (incl matching suppression TTL).
- **Current:** exists; `CanvasDL`/`CanvasField`/`CanvasBanner` + Management `Timeline` (7 hits); co-located `incident-detail-action-panel.tsx` + `refresh-tier.tsx`; first `title=` resolves to `時間軸` (likely a card title — confirm PageHeader shows id+pills).
- **Required:** migrate `Timeline`→`CanvasTimeline`; CTAs via `CanvasActionButton` with the canvas disable reasons; confirm header title is id + state pills.
- **Priority:** P1.

### 9. `/approval-requests` — `OC_Approvals`
- **Canvas target:** title `審批佇列 · 跨租戶`; tabs Pending/Approved/Rejected; table with request id, type pill, **tenant chip**, requester, order link, justification, age, timeout-warning pill, approve/reject/escalate (all high+reason); role-gated nav (Q-OPS10).
- **Current:** exists; `CanvasTable`/`CanvasBanner`/`CanvasPill`; co-located `approval-actions.tsx`. (Earlier listing initially omitted this file; it is present.)
- **Required:** confirm tenant chip tone, timeout-warning state, approve/reject/escalate as high+reason `CanvasActionButton`; confirm sidebar item hides for non-scoped roles.
- **Priority:** P1 (verify) / P2 (role-gating mechanism).

### 10. `/reports` — `OC_Reports`
- **Canvas target:** title `報表`; tabs Report jobs/Filing packages/Schedules; job table (job/kind/period/format/status/expires/created/actions) with download (enabled only when ready) + retry on failed.
- **Current:** exists; canvas tabs present (`Report jobs`/`Filing packages`/`Schedules`); `CanvasDL`/`CanvasField`/`CanvasKPI`; **20 form/state hits** (inline create-job form); title `報表中心`.
- **Required:** retitle `報表`; create-job form → modal behind `CanvasActionButton`; download/retry as descriptor actions with `disabledReasonCode` (`still_running`/`expired`); expired-artifact visual.
- **Priority:** P1 (title P2).

### 11. `/revenue` — `OC_Revenue`
- **Canvas target:** title `收益審視`; tabs Insight/Channel mix/Settlement matrix/Mismatch review(3); stale banner; 4-KPI row; read-only-mirror info banner with new-tab deep link to Platform Admin `/payments`; settlement matrix table; mismatch drawer (read-only) → platform-admin `/payments/reconciliation/{issueId}` new tab.
- **Current:** exists; `CanvasKPI`/`CanvasTable`/`CanvasBanner`; title matches.
- **Required:** verify mismatch drawer + cross-app new-tab deep link; `CanvasStaleBanner` on this T3 surface; ensure mutation never happens in-app.
- **Priority:** P1 (verify).

### 12. `/attendance` — `OC_Attendance`
- **Canvas target:** title `班次與出勤`; tabs 今日/本週/異常(3); 4-KPI row (排班/活躍/完成/異常); 0–24h shift gantt card with anomaly pills.
- **Current:** exists; `CanvasKPI`/`CanvasBanner`; title matches.
- **Required:** verify the gantt rendering matches canvas; anomaly tab + KPI parity; empty/`not_provisioned` states.
- **Priority:** P1 (verify) / P2.

### 13. `/maintenance` — `OC_Maintenance`
- **Canvas target:** title `車輛保修`; tabs 全部/排程中/進行中/逾期 with badges; work-order table (wo/vehicle/kind/status/sched/tech/cost/actions) with edit + complete descriptor actions (disabled when completed / not in_progress).
- **Current:** exists; `CanvasField`/`CanvasKPI`/`CanvasTable`; **25 form/state hits** (inline create/edit); title `維修保養`.
- **Required:** retitle `車輛保修`; create/edit → modal behind `CanvasActionButton`; edit/complete as descriptor actions with disable reasons; overdue highlight.
- **Priority:** P1 (title P2).

### 14. `/drivers` — `OC_Drivers`
- **Canvas target:** title `司機`; tabs 全部/可派/行程中/下班/License 30天到期/matching suppression with badges; driver table (driver+id+phone / vehicle / status pill / per-platform online pills / shift / license pill / exclusivity pill / rating).
- **Current:** exists; `CanvasCard`/`CanvasTable`/`CanvasPill`; title uses `drivers.pageSubtitle`.
- **Required:** confirm header title is `司機`; per-platform online pills + suppression-badge tab; license/exclusivity pills.
- **Priority:** P1 (title P2).

### 15. `/drivers/[driverId]` — `OC_DriverDetail`
- **Canvas target:** header name + id; **SOS banner chrome** when SOS active (disables dispatch actions); tabs Overview/Platform bindings/Active tasks/Earnings/Shifts/Incidents; actions force_offline(high+reason, disabled during SOS)/request_reauth(med)/suppress(high); left col platform-binding table + active-tasks table; right col manual-override `Timeline` + failed-relay empty state.
- **Current:** exists; `CanvasTable`/`CanvasBanner` + **Management `Timeline`/`TimelineItem`/`ManagementTone`** + `WorkflowEmptyState` (mixing); 6 tables.
- **Required:** migrate `Timeline`→`CanvasTimeline`, `WorkflowEmptyState`→`CanvasEmptyState`, drop `ManagementTone`; SOS chrome state; force_offline/suppress as high+reason `CanvasActionButton` with `sos_in_response`/`already_active` disable reasons.
- **Priority:** P1.

### 16. `/vehicles` — `OC_Vehicles`
- **Canvas target:** title `車輛`; tabs 全部/可派/Offboarding with badges; vehicle table (plate/model/year/dispatchable pill/current driver/contract/insurance/debrand-due).
- **Current:** exists; `CanvasTable`/`CanvasPill`; title `車輛登記`.
- **Required:** retitle `車輛`; dispatchable pill + offboarding tab; column parity.
- **Priority:** P1 (title P2).

### 17. `/vehicles/[vehicleId]` — `OC_VehicleDetail` (NEW Q-OPS02)
- **Canvas target:** header plate + not_dispatchable + offboarding pills; offboarding banner with cross-app to Platform Admin `/fleet · Offboarding`; regulatory-profile `DL`; maintenance-records table; right col current-driver-binding empty state + linked-incidents empty + audit `Timeline`.
- **Current:** exists; `CanvasDL`/`CanvasTable`/`CanvasBanner` + **Management `Timeline`/`TimelineItem`/`ManagementTone`** + `WorkflowEmptyState` (mixing).
- **Required:** migrate `Timeline`/`WorkflowEmptyState`/`ManagementTone` to canvas; read-only at ops; cross-app new-tab links.
- **Priority:** P1.

### 18. `/contracts` — `OC_Contracts`
- **Canvas target:** title `合約`; subtitle "ops 只讀"; contract table (contract/counterparty/kind/term/revenue-share/status pill).
- **Current:** exists; `CanvasTable`/`CanvasPill`; title `合約管理`.
- **Required:** retitle `合約`; column parity; rows link to `/contracts/[contractId]`.
- **Priority:** P1 (title P2).

### 19. `/contracts/[contractId]` — `OC_ContractDetail` (NEW Q-OPS03)
- **Canvas target:** header contract id + active + `read-only · ops scope` pills; operational-terms `DL` (modifiable window, proof, waiting/no-show rules, SLA profile, effective version, partner program, auth mode); authority-redirect banner (mutation in Platform Admin `/partners`); linked tenant/partner `DL`; version-history `Timeline`.
- **Current:** **route does not exist (404).**
- **Required:** create route per P0-B; all Canvas primitives; read-only at ops; cross-app new-tab to Platform Admin.
- **Priority:** **P0**.

### 20. `/feature-flags` — `OC_FeatureFlags`
- **Canvas target:** title `功能旗標 · read only`; subtitle + action `前往 Platform Admin /feature-flags`; flag table (key/scope/state pill/updated-by/at); read-only (no toggle at ops); filtered to operational flags.
- **Current:** exists; closest to canvas; already uses `ResourceActionDescriptor` and `actionTone(riskLevel)`; title uses `flags.subtitleReadOnly`.
- **Required:** confirm header title `功能旗標 · read only`; ensure read-only (history view only); cross-app action present.
- **Priority:** P2.

## 8. Suggested Implementation Slices

### Slice 0 — Canvas primitive foundation (gate)
- Add `CanvasStepper`, `CanvasTimeline`, `CanvasEmptyState`, `CanvasActionButton`, `CanvasHealthBanner`, `CanvasStaleBanner`, `CanvasBiLabel` to `packages/ui-web/src/canvas-primitives` + barrel.
- Acceptance: exported from `@drts/ui-web`; storybook/visual check; shared with platform-admin & tenant-console.

### Slice A — Missing routes
- `/complaints/[caseNo]`, `/contracts/[contractId]`.
- Acceptance: both 200; row links work.

### Slice B — Callcenter rebuild
- `/callcenter` rebuilt entirely on canvas primitives.
- Acceptance: 0 raw bespoke panels; uses `CanvasCard`/`CanvasTable`/`CanvasActionButton`/`CanvasEmptyState`.

### Slice C — De-mix detail pages
- Migrate `dispatch/[dispatchId]`, `incidents/[incidentId]`, `drivers/[driverId]`, `vehicles/[vehicleId]`, `complaints`, `dispatch/dispatch-workflow.tsx` off Management `Stepper`/`Timeline` + `WorkflowEmptyState` + `Management*` types.
- Acceptance: `grep` for those identifiers in `apps/ops-console-web` returns zero.

### Slice D — Forms-to-actions on list pages
- `incidents`, `maintenance`, `reports`, `complaints`: inline forms → modal/drawer behind `CanvasActionButton`.
- Acceptance: list pages are table-first; create/edit live in dialogs.

### Slice E — Descriptor CTAs + state contracts everywhere
- All mutate CTAs via `availableActions[]` + risk-tiered confirm; `CanvasEmptyState` six reasons; `CanvasStaleBanner` on live surfaces; degraded banners.
- Acceptance: screen tests cover enabled/disabled/high-risk; six empty reasons render distinctly.

### Slice F — Titles + verification
- Title parity table (§6 P2-A); Playwright 20-route smoke + screenshots; remote dev verify.

## 9. Verification Checklist for Completion

Before claiming UI-FE-OPS complete:

- `pnpm --filter @drts/ops-console-web lint`
- `pnpm --filter @drts/ops-console-web typecheck`
- `pnpm --filter @drts/ops-console-web build`
- Playwright route smoke for all 20 routes (non-404, single shell, correct title, required tabs/sub-boards, required tables/cards, high-risk CTAs present).
- **Anti-mixing assertion:** no Management/Workflow primitive (`Stepper`/`Timeline`/`WorkflowEmptyState`/`Management*`) imported anywhere in `apps/ops-console-web`.
- **Anti-legacy-CSS assertion:** no `.admin-*`/`.ops-*` global classes (currently already clean — keep it clean).
- Screenshot set for all 20 routes at 1440×950; visual review against `Ops Console.html`.
- Remote dev deploy + remote smoke after deploy.

## 10. Open Decisions

- **Where do the new canvas primitives live?** Recommendation: in shared `@drts/ui-web/canvas-primitives` so platform-admin and tenant-console reuse them — not ops-local. This is the cleanest way to kill mixing platform-wide.
- **Param rename `/dispatch/[dispatchId]` → `[workItemId]`?** Canvas uses `[workItemId]` and the screen serves both owned + forwarded. Recommendation: rename for parity, or document the alias and keep the `domain` flag.
- **Keep operational inline forms or move to modals?** Recommendation: modals/drawers behind canvas actions unless design explicitly approves an inline form for a specific page.
- **Bilingual labels:** resolved for the 2026-06-04 i18n remediation wave via `docs/05-ui/i18n-remediation-implementation-20260604.md`: touched ops body surfaces remain single-locale output, with `zh` locale rendered as zh-primary. `CanvasBiLabel` stays a separate parity/design follow-up rather than a blocker for the current driver i18n centralization slice.

## 11. Current Status

- Shell/menu/CSS: **already canvas, no legacy CSS** (better than Platform Admin's starting point).
- Route parity: **incomplete** — 2 of 20 routes missing.
- Body parity: **incomplete** — systemic primitive-generation mixing, one bespoke page (`/callcenter`), inline forms, no descriptor `ActionButton`.
- This document is the implementation backlog for completing Ops Console UI-FE-OPS body parity, suitable for supervisor / auto-worker slicing (Slice 0 → A → B → C → D → E → F).
