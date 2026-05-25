# Ops Console — Visual Design Hand-off Packet

**Date:** 2026-05-25
**App:** `apps/ops-console-web`
**Recipient team:** 視覺設計團隊 (含 UX)
**Status:** Hand-off input. **No visual decisions in this document.**
**Author lane:** Claude (`OPS-DH-PKT-002`)
**Predecessors:**

- [`system-design-questions-all-apps-20260524.md`](./system-design-questions-all-apps-20260524.md) — questions raised to 系統設計規劃領域
- [`system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md) — answers received; **decisions in that document are the authority** and override anything ambiguous here

> **🎨 2026-05-25 update — visual design has landed.**
> The visual design team produced [`drts-design-canvas/`](./drts-design-canvas/) v0.6 against this packet + the system design answers. The visual specification for Ops Console screens is now [`drts-design-canvas/Ops Console.html`](./drts-design-canvas/Ops%20Console.html) (coral accent, 20 routes incl. 3 new detail routes and the 6 first-class dispatch sub-boards). Many of the §7 purely-visual open questions below are now answered by the canvas — see §7 inline annotations. The implementation lane that picks up `apps/ops-console-web` should treat the canvas as authority for visual decisions, and this packet as authority for behavior / data / API contracts.

---

## 0. How to read this document

This document captures every screen the ops-console needs, at the level a visual designer needs to begin producing wireframes / IA / component system / design tokens. It does **not** contain visual decisions.

What it **does** contain:

- §2 — Personas and the roles that gate which CTAs they see
- §3 — Operating context every screen must respect (i18n, refresh cadence, identity bar, confirmation patterns, etc.) — most pulled from system design answers §1
- §4 — Sitemap with the new detail routes the system design team confirmed
- §5 — Per-page functional briefs with refresh tier, must-show data, must-support actions, decision points, state variants, and entry/exit
- §6 — API mapping per page
- §7 — Purely visual open questions (much smaller than v1; system answers covered most)

What it **does NOT** contain:

- Wireframes, comps, layout, grid, spacing, color, typography, iconography
- Component system or design tokens
- Density choices
- Specific empty / loading / error visual treatment beyond "this state must be designed"

If the visual team hits any product, system, or contract ambiguity while designing against this packet, treat it as either:

1. A miss in the system design answers — flag back so we resolve at the product/architecture layer (no inventing in the design layer);
2. A purely visual question — answer it within the design team and surface in §7 if generally applicable.

---

## 1. Source documents

| Document                                                                                                                                             | Role                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [system-design-answers-all-apps-20260524.md](./system-design-answers-all-apps-20260524.md)                                                           | **Authority.** Every decision in §0-§5 of that doc is binding for this packet.                           |
| [01-product/platform-admin-ops-tenant-console-product-spec-20260508.md §8](../01-product/platform-admin-ops-tenant-console-product-spec-20260508.md) | Ops Console business intent: §8.1 goal, §8.2 personas, §8.4 module specs, §8.5 workflows, §8.6 non-goals |
| [01-product/driver-app-multi-platform-product-spec-20260507.md §6.1 – §6.3](../01-product/driver-app-multi-platform-product-spec-20260507.md)        | Multi-platform ops surfaces (forwarded board, adapter health, driver eligibility)                        |
| `apps/ops-console-web/app/**/page.tsx`                                                                                                               | Current route surface — used to confirm what exists today, not to constrain design                       |
| `packages/api-client/src/index.ts`                                                                                                                   | Available method surface                                                                                 |
| `packages/contracts/src/index.ts`                                                                                                                    | Record / payload types                                                                                   |

When this packet and a source document disagree, the source document wins.

---

## 2. Personas

Carried from product spec §8.2 with the **role codes** from system-design answers Q-X14 added. Each persona maps to one or more role codes, and the role codes drive which `availableActions` the backend exposes on each resource (Q-X13).

| Persona                      | Primary concerns                                             | Role codes                                                           | Primary screens                                                      |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 派車員 (Dispatcher)          | queue、ETA、candidate、redispatch、例外單                    | `ops_dispatcher`                                                     | `/dashboard`, `/dispatch`, `/dispatch/[id]`, `/drivers`, `/vehicles` |
| 客服人員 (Call center agent) | call session、電話建單、callback、錄音、客訴轉案             | `ops_dispatcher` (with call-center scope)                            | `/callcenter`, `/complaints`                                         |
| 客訴專員 (Complaint analyst) | assign、timeline、resolution、SLA breach、reopen             | `ops_compliance`                                                     | `/complaints`, `/complaints/[caseNo]`, `/incidents` (escalations)    |
| 安全主管 / Incident reviewer | safety、critical queue、service recovery                     | `ops_compliance`                                                     | `/incidents`, `/incidents/[id]`, `/dashboard` (top banners)          |
| 營運財務 reviewer            | revenue、settlement matrix、forwarder mismatch、recon issues | `ops_finance_reviewer`                                               | `/revenue`, `/reports`, `/dispatch` (forwarded view), `/contracts`   |
| 出勤 / 車隊主管              | shift、attendance、driver availability、maintenance impact   | `ops_manager`                                                        | `/attendance`, `/maintenance`, `/drivers`, `/drivers/[id]`           |
| Approval triage              | cross-tenant approval queue (fare override, exception holds) | `ops_approval_triage`, `ops_manager`, `ops_compliance` (per Q-OPS10) | `/approval-requests`                                                 |
| Operations manager           | wears any hat; uses force-offline / suppression authority    | `ops_manager`                                                        | All screens with elevated authority                                  |
| Flag-visibility user         | view-only feature flag exposure                              | any ops role                                                         | `/feature-flags`                                                     |

A single human may hold multiple role codes. The visual design must NOT hard-code persona-to-CTA mapping; CTAs are driven by `availableActions` on each resource. See §3.5.

---

## 3. Operating context (binding on every screen)

These are pulled directly from system design answers. Every screen must respect them. Each is followed by the answer ID for traceability.

### 3.1 Locale (Q-X17)

- zh-TW primary, en secondary
- Filter chips, state pills, status badges **must** use translation maps
- Domain codes (`accept_pending`, `sync_failed`, `override_pending`, etc.) may appear in developer tooltips / detail drawers but **never** as the only user-facing label
- API returns codes; frontend renders labels via shared dictionary

### 3.2 Refresh model (Q-X01, Q-X02)

Tiered polling + push for urgent. Per-screen tier is given in §5 next to each page.

| Tier              | Cadence | Where it applies in ops-console                  |
| ----------------- | ------: | ------------------------------------------------ |
| **T2 Dispatch**   |      5s | `/dispatch`, `/callcenter`, `/approval-requests` |
| **T3 Ops medium** |     15s | `/dashboard`, `/incidents`, `/complaints`        |
| **T6 Manual**     |  manual | `/reports`, `/audit` (if added)                  |

Every list / detail API response includes a `UiRefreshMetadata` envelope (`generatedAt`, `staleAfterMs`, `dataFreshness`, `source`). The visual design must give the user a **stale** affordance (banner / tint / icon) and a **refresh** affordance on every live surface; treatment is the design team's call, but it must exist.

### 3.3 Identity / health context bar (Q-X11, Q-X12)

Every screen must surface:

- **Top header chip:** actor / realm / tenant / environment (e.g. `ops / production / OC`)
- **Sidebar footer:** API health (`healthy` / `degraded` / `down`) + `lastCheckedAt` from `UiHealthEnvelope`
- **Page content top:** degraded banner _only when_ a page-critical dependency is degraded (per page; see each brief)

`UiHealthEnvelope` is a backend-emitted contract; visual designer doesn't compute it.

### 3.4 Confirmation pattern (Q-X09, Q-X10)

Risk-classified, baked into the action descriptor on every CTA:

| Risk       | Pattern                                                                       | Examples in ops-console                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Low**    | direct action + toast receipt with audit reference                            | refresh, mark notification read, acknowledge non-critical alert                                                                                |
| **Medium** | modal confirm + toast receipt with audit reference                            | release driver, redispatch, cancel order, complete callback, close incident                                                                    |
| **High**   | modal confirm + **required reason text** + toast receipt with audit reference | force driver offline per platform, suppress matching during incident, fare override, escalation to incident from complaint, reopen closed case |

The `ResourceActionDescriptor` returned by the backend includes `riskLevel` and `requiresReason`. The visual designer chooses the confirmation pattern visuals (modal shape, reason input shape, toast shape) but **cannot** decide which actions get which risk — that comes from backend.

Action receipts include `actionId` and `auditId`. If the current user has audit read scope, the toast must offer a "View audit" deep link to `/audit?auditId=<auditId>` (note: `/audit` may live in platform-admin per Q-X10 cross-app navigation — deep link to platform-admin URL in a new tab).

### 3.5 Authority boundaries (Q-X13)

Visual design must NOT hard-code `if (role === 'ops_dispatcher') show button`. CTAs come from `data.availableActions[]` on each resource. Each descriptor includes:

```ts
{
  action: string;            // "release_driver", "redispatch", "force_offline", etc.
  enabled: boolean;
  disabledReasonCode?: string;  // surface as tooltip / hint when disabled
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
}
```

Design must accommodate the case where 0, 1, or N actions are available per row. A row with 0 available actions is read-only.

### 3.6 Empty / not-ready states (Q-X15)

Backend distinguishes empty reasons. Visual designer treats each reason with appropriate copy and affordance:

```ts
type EmptyReason =
  | "no_data" // legitimate (no incidents today)
  | "not_provisioned" // feature not turned on
  | "fetch_failed" // backend errored
  | "permission_denied" // user lacks scope
  | "external_unavailable" // adapter down
  | "filtered_empty"; // filters too narrow
```

Each list response that returns 0 items also returns `{ emptyState: { reason, messageCode, nextAction? } }`. Visual must render a different illustration / copy / CTA per reason — collapsing them all to "No data" defeats the contract.

### 3.7 Audit (admin spec §3.3)

Every state-changing action produces an audit record. The receipt (§3.4) gives `auditId`. Pre-action confirmation (modal for medium/high) and post-action receipt (toast for all) are the two visual moments. Both must be designed.

### 3.8 Search (Q-X07, Q-X08)

Header search is app-scoped cross-entity. For ops-console:

- Searches across: orders, dispatch items, drivers, vehicles, complaints, incidents
- Results MUST be grouped by category, not mixed in one list
- Per-page filters remain on list pages (header search is for jump/lookup, not page filter)

Visual designer decides result drawer shape, category grouping treatment, keyboard nav.

### 3.9 Notifications (Q-X05, Q-X06)

Backend per-user inbox, polled (T3 cadence is fine for this). Bell icon in top header.

Ops-relevant event types:

```text
incident.critical.created
complaint.sla_breached
approval_request.created
approval_request.timeout_warning
approval_request.escalated
reconciliation_issue.assigned
adapter.health.degraded
```

`UserNotificationRecord` includes `severity`, `eventType`, `title`, `message`, `resourceLink` (a `CrossAppResourceLink`). Click on notification with `resourceLink` opens new tab if cross-app, same tab if in-app.

### 3.10 Cross-app navigation (Q-X03)

Deep links to other apps open in **new tab** by default. Cross-app targets used by ops-console:

- `/revenue` mismatch row → platform-admin `/payments/reconciliation/{issueId}` — new tab
- `/dispatch` forwarded view → platform-admin `/adapter-registry` for adapter inspection — new tab
- Notification with `resourceLink.openMode === "new_tab"` — new tab

Read-only mirror drawers (e.g. mismatch summary inline in ops-console) are allowed where ops triage benefits, but **mutation** is always at the owner app.

---

## 4. Sitemap

### 4.1 Top-level structure

Five sections, 18 routes (3 new detail routes added per Q-OPS01-03):

```
工作面 (Workspaces)
└── /dashboard                       儀表板           Operations Dashboard

即時派遣 (Live Ops)
├── /dispatch                        派車調度          Dispatch (multiple first-class sub-boards)
│   └── /dispatch/[workItemId]       派車詳情          Per-work-item workspace (owned + forwarded; domain flag in payload)
└── /callcenter                      客服中心          Call center workspace (one active session per agent)

案件處理 (Casework)
├── /complaints                      客訴管理          Complaint center
│   └── /complaints/[caseNo]         客訴詳情          NEW — case detail (Q-OPS01)
├── /incidents                       事故管理          Incident center
│   └── /incidents/[incidentId]      事故詳情          Incident detail / timeline / recovery
└── /approval-requests               審批佇列          Cross-tenant approval queue (scoped roles only — Q-OPS10)

營運監控 (Monitoring)
├── /reports                         報表              Report jobs + filing packages
├── /revenue                         收益              Revenue review / settlement / mismatch (mismatch row → platform-admin)
├── /attendance                      出勤              Shift + attendance monitoring
└── /maintenance                     維修保養          Maintenance work orders

主資料 (Registry)
├── /drivers                         司機              Driver registry
│   └── /drivers/[driverId]          司機詳情          Driver detail / earnings / platform binding
├── /vehicles                        車輛              Vehicle registry
│   └── /vehicles/[vehicleId]        車輛詳情          NEW — vehicle detail (Q-OPS02)
├── /contracts                       合約              Contract + partner relation
│   └── /contracts/[contractId]      合約詳情          NEW — ops read-only operational view (Q-OPS03)
└── /feature-flags                   功能旗標          Feature flag read-only visibility
```

Root `/` redirects to `/dashboard` (default; visual team can propose an alternative landing tile board but should default to redirect).

### 4.2 Inter-page navigation flows

First-class transitions the design must make obvious (not buried links):

- `/dashboard` "今日待處理" banner → `/dispatch?board=exception_hold` / `/dispatch?board=no_eligible_supply` / `/incidents` (per banner type)
- `/dispatch` board row → `/dispatch/[workItemId]`
- `/dispatch/[workItemId]` candidate row → `/drivers/[driverId]` (driver lookup mid-decision; see §7 for modal vs new tab)
- `/callcenter` active session → `/complaints/[caseNo]` (transfer to complaint; redirects synchronously per Q-OPS05)
- `/complaints/[caseNo]` → `/incidents/[incidentId]` (escalate)
- `/incidents/[incidentId]` related-order link → `/dispatch/[workItemId]`
- `/incidents/[incidentId]` linked-driver → `/drivers/[driverId]`
- `/revenue` mismatch row → **new tab** to platform-admin `/payments/reconciliation/{issueId}` (Q-OPS14)
- `/dispatch` forwarded board adapter info → **new tab** to platform-admin `/adapter-registry`
- `/drivers/[driverId]` active task row → `/dispatch/[workItemId]`
- `/vehicles/[vehicleId]` current driver → `/drivers/[driverId]`; maintenance entry → `/maintenance`
- `/maintenance` row → `/vehicles/[vehicleId]`
- `/contracts/[contractId]` tenant / partner reference → **new tab** to platform-admin or tenant-console depending on owner

---

## 5. Per-page functional briefs

Schema per page:

- **Spec ref** — product spec section to read first
- **Refresh tier** — from §3.2
- **Primary persona / roles** — from §2
- **Primary task** — one sentence
- **Must-show data** — backend exposes; designer cannot drop
- **Must-support actions** — driven by `availableActions`; designer must surface affordance when descriptor is enabled
- **Decision points** — what judgment the user is making here
- **State variants** — every variant listed must have a designed treatment (loading, the listed empty reasons, degraded, etc.)
- **Entry / exit** — typical navigation flows in and out

---

### 5.1 `/dashboard` — Operations Dashboard

- **Spec ref:** §8.4.1 + cross-system signals from §6.5
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** all personas at session start; `ops_dispatcher` for early-shift handover; `ops_compliance` for incident scan
- **Primary task:** In under 30 seconds, decide whether the shift is normal or there is something I must handle right now.
- **Must-show data:**
  - `UiHealthEnvelope` (top-of-page degraded banner if dependency-critical)
  - Identity summary chip (realm / actor type)
  - Active order count, dispatch queue depth, broadcasting count
  - Online drivers, dispatch-eligible drivers, stale-location count
  - Dispatchable vehicles, offline vehicles
  - Open incidents, critical incidents
  - Overdue maintenance
  - Today's revenue (minor units) + completed trips
  - Top operational alerts (from `OperationalObservabilitySnapshot.alerts` filtered to `route="ops"`, sorted critical → warning → healthy)
  - Top 5 rows of dispatch queue (prioritized: override_pending > no_supply > exception_hold > broadcasting > queued > assigned)
  - Adapter degradation summary (degraded count + at least one example platform)
- **Must-support actions:**
  - "Open call session" CTA — opens new call session in `/callcenter` (medium-risk; modal confirm not needed because the act itself is just opening a session, but downstream actions inside callcenter are risk-classified)
  - "Open duty handbook" — external link
  - Jump CTAs to `/dispatch`, `/incidents`, `/dispatch?view=forwarded`
- **Decision points:**
  - "Is queue normal vs spiking?" — visual needs absolute number AND relative-to-recent signal
  - "Is there a critical incident I missed?" — banner must demand attention, not blend in
  - "Are drivers / vehicles available for the queue?" — supply vs demand comparison at-a-glance
  - "Is an external adapter degraded enough to change how I read forwarded queues?" — visible here, not only on `/dispatch`
- **State variants:**
  - Loading (multiple sources, partial loads possible)
  - All-healthy (no alerts, no critical incidents) — must NOT feel empty or broken
  - Partial-degradation (some warnings, others healthy)
  - Full-degradation (API down → `UiHealthEnvelope.status = "down"`)
  - Per emptyReason on each list response (e.g. "no incidents today" `no_data` vs "incidents service unreachable" `fetch_failed`)
- **Entry:** Sidebar, session-start landing (root redirect)
- **Exit:** Banner CTAs, sidebar to specific module, "前往派遣" link in queue card, "Open call session" → `/callcenter`

---

### 5.2 `/dispatch` — Dispatch (multi-board)

Per Q-OPS06, dispatch is now **multiple first-class sub-boards**, not just owned vs forwarded tabs.

- **Spec ref:** §8.4.2, §8.5.1, §8.5.2 + driver-spec §6.1
- **Refresh tier:** T2 (5s)
- **Primary persona / roles:** `ops_dispatcher`; `ops_finance_reviewer` for forwarded mismatch context

#### 5.2.A Sub-board structure

```
/dispatch
├── Ready queue                 owned, queued / broadcasting / assigned base flow
├── Assigned                    owned, currently driver-assigned, on-trip / proof / completion
├── Exception hold              owned, exception_hold state — must clear before re-queuing
├── No eligible supply          owned, no_supply state — needs supply intervention
├── Governance blocked          owned, override_pending — needs approval-requests action
└── Forwarded mirror            forwarded orders only
```

Each sub-board is a peer (tab or pill-nav — design's call) with its own count badge. Filter chips inside each sub-board are allowed for sub-states (service bucket, source platform, etc.) but the boards themselves are not chips.

#### 5.2.B Must-show data per board

| Board              | Columns                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Ready queue        | order id / no, tenant, pickup → drop, window, service bucket, ETA, candidate count, gate summary               |
| Assigned           | order id / no, tenant, driver / vehicle, current driver-task state, ETA, gate summary                          |
| Exception hold     | order id / no, tenant, hold reason, hold owner, age, related complaint / incident                              |
| No eligible supply | order id / no, tenant, attempted candidate count, reason code, time in state                                   |
| Governance blocked | order id / no, tenant, override type, requester, age, link to approval request                                 |
| Forwarded mirror   | mirror id, source platform, external order id, pickup → drop, window, status, adapter health, mismatch summary |

#### 5.2.C Must-support actions

Per `availableActions` on each row. Likely actions:

- Ready queue: assign, redispatch, fare override request (high-risk → reason required)
- Assigned: release driver (medium), redispatch, cancel
- Exception hold: resolve hold, escalate to incident, redispatch
- No eligible supply: extend search, resolve manually, escalate
- Governance blocked: jump to `/approval-requests` for the related request
- Forwarded mirror: trigger reconciliation, engage manual fallback (medium), force refresh, inspect adapter (jumps to platform-admin)

#### 5.2.D Decision points

- Triage: which row to act on next (state priority + window-time + ETA)
- Whether a no-supply order can be saved by extending search vs needs cancellation
- Whether to escalate an override request vs work around it
- (Forwarded) Whether the problem is DRTS-side or external-platform-side

#### 5.2.E State variants

- Loading per board
- Each board empty per `emptyReason`
- Stale-data banner per `UiRefreshMetadata.dataFreshness`
- Page-level degraded banner per `UiHealthEnvelope`
- Single adapter degraded vs multiple adapters degraded (forwarded board)

#### 5.2.F Entry / exit

- **Entry:** Sidebar, dashboard `今日待處理` banner (per board), dashboard adapter banner (forwarded), notification click
- **Exit:** Per-work-item detail, switch board, cross-app jump to platform-admin (forwarded adapter inspection)

---

### 5.3 `/dispatch/[workItemId]` — Per-work-item Workspace

One route handles both owned and forwarded (Q-OPS07). Backend returns `domain: "owned" | "forwarded"` and the relevant payload shape.

- **Spec ref:** §8.4.2 + driver-spec §6.1
- **Refresh tier:** T2 (5s)
- **Primary persona / roles:** `ops_dispatcher`
- **Primary task:** Take this work item from its current state to its next correct state without leaving the screen.
- **Must-show data:**
  - Domain badge: `owned` or `forwarded`
  - Order / mirror header: id, no / mirror id + external id, tenant or source platform, service bucket, window, pickup, drop, current state, ETA
  - Compliance gates with blocking / clear status
  - Exception hold / override request state (requester, reason, current resolution)
  - No-supply escalation state
  - Dispatch timeout reason if any
  - Candidate list (ranked) with per-candidate driver name + id, vehicle id, ETA, gate summary, score
  - Current driver task state (acceptance, on-trip, proof, completion)
  - Forwarded-only: sourcePlatform, externalOrderId, routeLocked, waypoints, status sync state, last callback, "no-owned-assignment" assertion
  - Linked recordings, callbacks (if owned with phone source)
- **Must-support actions:** driven by `availableActions`:
  - Owned: assign (per candidate), release, cancel, fare override (high), redispatch, resolve no-supply, escalate to incident
  - Forwarded: trigger reconciliation completion (medium), engage manual fallback (medium), force refresh, broadcast to eligible drivers (where adapter allows), report sync failure
- **Decision points:**
  - Which candidate to assign (rank vs ETA vs gate status)
  - Whether current driver should be released vs given more time
  - Whether to escalate override vs work around
  - (Forwarded) Whether to engage manual fallback vs wait for sync
- **State variants:**
  - Work item not found (`notFound()`)
  - Terminal state — read-only mode (no dead CTAs)
  - Candidates loading separately from main metadata
  - No candidates (no-supply)
  - Forwarded with adapter degraded
- **Entry:** Row click on `/dispatch`, dashboard queue card row, `/drivers/[driverId]` active task link, `/incidents/[incidentId]` related-order link, notification deep link
- **Exit:** Back to relevant board, jump to driver detail, escalate to incident

---

### 5.4 `/callcenter` — Call Center Workspace

Per Q-OPS04, **one active session per agent**. Visual IA can show a waiting queue and history, but at most one session is "active" at any time.

- **Spec ref:** §8.4.3, §8.5.3
- **Refresh tier:** T2 (5s)
- **Primary persona / roles:** `ops_dispatcher` with call-center scope
- **Primary task:** Handle the current call from greeting to resolution (book / link / callback / transfer) with the right context and recording attached.
- **Must-show data:**
  - Active session panel: call type, caller phone, agent identity, linked order (if any), recording state, dispatch trace
  - Waiting / queued calls list
  - Callback queue (across sessions — pending callbacks needing follow-up)
  - Recording queue (recordings awaiting auto-link or manual attach)
  - Session history list
- **Must-support actions:**
  - Open new call session (only when no active session OR after closing current)
  - Announce agent identity
  - Close session (low-risk)
  - Quote ETA (live API call during the call)
  - Create callback task (low)
  - Complete callback task (low)
  - Create phone booking (medium — uses ops-side `POST /api/ops/callcenter/bookings` per Q-OPS11)
  - Link existing order to current session (low)
  - Transfer to complaint — synchronously creates complaint case and redirects to `/complaints/[caseNo]` (Q-OPS05) (medium)
  - Manual attach recording — restricted to `ops_compliance`, requires reason (high per Q-OPS12)
- **Decision points:**
  - Is this a new booking or a follow-up on an existing order?
  - Should this become a complaint / incident or stay a callback?
- **State variants:**
  - Idle (no active session) — show "open new session" CTA + waiting queue + callback queue
  - Active session
  - Recording attach failure (one recording cannot be matched by call_id)
  - Phone booking validation errors
  - Transfer in progress (waiting for complaint case creation)
- **Entry:** Sidebar, dashboard "開新 call session" CTA, callback queue ping
- **Exit:** Transfer to complaint → redirect (Q-OPS05); close session → back to idle

---

### 5.5 `/complaints` — Complaint Center

- **Spec ref:** §8.4.4, §8.5.4
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_compliance` (complaint analyst)
- **Primary task:** Triage incoming complaint cases by SLA priority and severity, work assigned cases, escalate when needed.
- **Must-show data:**
  - Case list with: case no, source (tenant / phone / ops), category, severity, description summary, related order, related call, assignee, **`slaStatus`** (`within_sla` / `warning` / `breached` per Q-OPS13, backend-computed — not client-derived), **`slaDueAt`** countdown, reopen count, status, last update
  - Filters: assignee (me / unassigned / all), status, severity, sla state (within / warning / breached)
- **Must-support actions:** per `availableActions`:
  - Create complaint (medium)
  - Assign / reassign (medium)
  - Add note / timeline entry (low)
  - Resolve (medium)
  - Close (medium)
  - Reopen (high — requires reason)
  - Escalate to incident (high — requires reason; creates incident case with linkage)
  - Export case view (low — produces PII-masked artifact per export discipline)
- **Decision points:**
  - Triage: which case next (severity × SLA × reopen-count)
  - Whether to escalate vs resolve in place
  - Whether reopen pattern indicates systemic issue
- **State variants:**
  - Loading
  - Empty `no_data` ("no open cases for me") vs `permission_denied` vs `filtered_empty` vs `fetch_failed`
  - SLA warning (countdown approaching `slaDueAt`) — distinct urgency
  - SLA breached (`slaStatus = "breached"`, `slaBreachedAt` set) — visual urgency above warning
  - Reopened case — visually distinct from never-resolved
- **Entry:** Sidebar, dashboard banner, callcenter "transfer to complaint" (redirect to detail)
- **Exit:** `/complaints/[caseNo]` detail; escalation → `/incidents/[incidentId]`

---

### 5.6 `/complaints/[caseNo]` — Complaint Detail (NEW per Q-OPS01)

- **Spec ref:** §8.4.4 detail
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_compliance`
- **Primary task:** Work this case end-to-end: read context, manage timeline, decide resolution, manage SLA.
- **Must-show data:**
  - Case header: case no, source, category, severity, status, slaStatus, slaDueAt / slaBreachedAt, created / updated, assignee
  - Description and reporter
  - Linked entities: related order (→ `/dispatch/[id]`), related call session, related recording (with PII-masked playback control), related incident (if escalated)
  - Timeline: chronological event log (status changes, notes, reassignments, recovery actions, SLA marks, reopens)
  - Recovery notes
  - Export view button (low) — produces signed artifact link
  - Audit trail subset filtered to this case
- **Must-support actions:** per `availableActions`:
  - Add note (low)
  - Assign / reassign (medium)
  - Resolve (medium)
  - Close (medium)
  - Reopen (high)
  - Escalate to incident (high)
  - Export (low)
  - Manual SLA waiver (high, restricted role)
- **Decision points:**
  - Whether SLA breach is real or attribution issue
  - Whether to escalate vs continue resolution
  - Whether the resolution addresses root cause or only surface
- **State variants:**
  - Loading
  - Case not found (`notFound()`)
  - Closed / resolved (read-only with audit visibility)
  - Pre-resolution (no recovery notes)
  - Post-resolution (resolved but not closed)
  - SLA-warning vs SLA-breached visual state
  - With escalation badge if linked to incident
- **Entry:** Row on `/complaints`, redirect from callcenter transfer, notification deep link
- **Exit:** Back to list; escalate → `/incidents/[incidentId]`; related-order → `/dispatch/[id]`

---

### 5.7 `/incidents` — Incident Center

- **Spec ref:** §8.4.5, §8.5.5 + driver-spec §6.2
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_compliance` (incident reviewer / safety officer)
- **Primary task:** See what is happening, decide critical priority, ensure each incident has an owner and recovery action.
- **Must-show data:**
  - Workspace strip: pending-major count, unrecorded-recovery count, linked-entity count
  - KPI strip: active (open + investigating), major (critical + high severity), resolved last 30 days
  - Governance guardrail panel (functional text from spec, design treats as info card):
    - Driver SOS + dispatch-exception incidents remain ops-owned even after order/complaint linkage
    - Service recovery action ≠ timeline update ≠ formal resolution
    - Escalation target ≠ owner transfer (requires acknowledgment)
  - Priority queue: major + SOS only (focused list separate from full)
  - Full incident list: id, title, category, severity, status, related order / vehicle / driver / complaint, reportedBy, occurredAt, age
  - Filters: status, severity, category, free-text search
- **Must-support actions:** per `availableActions`:
  - Create incident (medium — manual create) or `createIncidentFromDispatchException` (medium — from a dispatch exception)
  - Refresh (low — explicit affordance per spec "重新整理")
- **Decision points:**
  - Priority: which incident to coordinate next
  - Whether incident needs service recovery action
- **State variants:**
  - All-clear (no major, no SOS) — peaceful messaging ("目前沒有重大事故，現況正常。")
  - No incidents at all — empty `no_data`
  - Critical-in-progress — page chrome conveys heightened state
- **Entry:** Sidebar, dashboard critical banner, complaint escalation, driver SOS push notification (cross-app from driver-app)
- **Exit:** `/incidents/[incidentId]`

---

### 5.8 `/incidents/[incidentId]` — Incident Detail / Coordination

- **Spec ref:** §8.4.5 (data fields, timeline, recovery)
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_compliance` primary, `ops_dispatcher` when related-order action needed
- **Primary task:** Coordinate response: understand context, run timeline, log recovery action, resolve / close when done.
- **Must-show data:**
  - Header: id, title, category, severity, status, created / occurred time, age
  - Assigned-to (with acknowledgment state)
  - Linked entities: order, vehicle, driver, complaint (all click-through)
  - Timeline: chronological event log
  - Service recovery action list
  - Audit log subset filtered to this incident
  - Suppression state on linked driver (per Q-OPS09 — `DriverMatchingSuppression`): active, reasonCode, expiresAt
- **Must-support actions:** per `availableActions`:
  - Update incident (severity, category, status — medium)
  - Resolve (medium)
  - Close (high — requires reason)
  - Add service recovery action (medium)
  - Escalation acknowledgment (medium — by escalation target)
  - Lift driver matching suppression manually (high) — note `ops_manager` can extend the 24h max TTL
- **Decision points:**
  - Whether to escalate severity
  - Whether to hand off to a different owner (requires acknowledgment, not silent transfer)
  - Whether enough recovery has been done to resolve
- **State variants:**
  - Loading
  - Not-found
  - Closed / resolved (read-only with audit)
  - Pre-recovery
  - Post-recovery, pre-resolution
  - With active driver matching suppression (visible state)
- **Entry:** Row click on `/incidents`, dashboard banner, driver SOS notification deep link, complaint escalation
- **Exit:** Back to list, jump to related `/dispatch/[id]`, `/drivers/[driverId]`, `/complaints/[caseNo]`

---

### 5.9 `/approval-requests` — Cross-tenant Approval Queue

Per Q-OPS10, **only `ops_approval_triage`, `ops_manager`, `ops_compliance`** see this. Sidebar nav must hide the item for other roles (driven by `availableActions` on a feature flag or by separate role-aware nav contract — see §7).

- **Spec ref:** §8.4.2 owned dispatch action "approve / reject override" promoted to a queue + cross-tenant
- **Refresh tier:** T2 (5s)
- **Primary persona / roles:** `ops_approval_triage`, `ops_manager`, `ops_compliance`
- **Primary task:** Triage pending approval requests across tenants and decide approve / reject / escalate.
- **Must-show data:**
  - Pending list with: request id, type (fare override / exception hold / no-supply override / etc.), **tenant chip** (per Q-X14 cross-tenant queue contract), requester, requested at, related order (`/dispatch/[id]`), justification, timeout warning if approaching `approval_request.timeout_warning` threshold, status
  - Filters: status (pending / approved / rejected), tenant, type
- **Must-support actions:** per `availableActions`:
  - Approve (high — requires reason)
  - Reject (high — requires reason)
  - Escalate (high — requires reason)
- **Decision points:**
  - Whether requested override is policy-acceptable
- **State variants:**
  - Empty `no_data` (current live state — "目前範圍內沒有待審批項目。") — distinct from `permission_denied`
  - Single tenant view vs cross-tenant view (filter dependent)
  - Timeout-warning state per request (per notification taxonomy `approval_request.timeout_warning`)
- **Entry:** Sidebar (role-gated), dashboard pending badge if any, notification click
- **Exit:** Action receipts; back to dispatch context (if request came from dispatch)

---

### 5.10 `/reports` — Reporting

- **Spec ref:** §8.4.6
- **Refresh tier:** T6 (manual)
- **Primary persona / roles:** `ops_finance_reviewer`, `ops_compliance` (case exports), all (operational reports)
- **Primary task:** Kick off a report or filing package, monitor progress, download artifact when ready.
- **Must-show data:**
  - Report job list: id, type, parameters summary, status (queued / running / done / failed), submitted-by, submitted-at, completed-at, artifact link, expiresAt
  - Filing package list: id, scope (tenant / period), status, artifact link, expiresAt
  - Per-job / per-package detail
- **Must-support actions:** per `availableActions`:
  - Create report job (low) — with type / period / scope params
  - Generate filing package (low)
  - Download signed artifact (low) — link with expiry; show TTL
  - Re-run failed job (medium)
- **Decision points:**
  - Whether an existing report can be reused or new one needed
- **State variants:**
  - Empty `no_data` (no jobs run)
  - Job queued / running (progress indicator?)
  - Job failed — must show error reason + re-run affordance
  - Artifact expired — visual must convey, not silently 404
- **Entry:** Sidebar
- **Exit:** Artifact download

---

### 5.11 `/revenue` — Revenue Review

- **Spec ref:** §8.4.7, §8.5.6
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_finance_reviewer`
- **Primary task:** Confirm period revenue, spot mismatch, follow each mismatch to its reconciliation issue (cross-app).
- **Must-show data:**
  - Period revenue insights (today / yesterday / last 7 / last 30 — picker shape §7)
  - Service bucket breakdown
  - Vehicle breakdown
  - Channel mix: platform / partner / phone / tenant
  - Forwarded sync-failed count for period
  - Settlement matrix
  - Reconciliation issues list (read-only mirror per Q-OPS14): issue id, platform, mirror order, external order, reason, owner, status
- **Must-support actions:** per `availableActions`:
  - Filter by period (low)
  - Filter by service bucket (low)
  - Filter by vehicle (low)
  - Open mismatch drawer (read-only) — drawer includes deep link to platform-admin `/payments/reconciliation/{issueId}` (opens new tab per Q-X03)
- **Decision points:**
  - Is period revenue tracking expectation?
  - Is a mismatch within owner's authority or needs platform-admin escalation?
- **State variants:**
  - Zero-revenue period — distinguish `no_data` (legit no trips) vs `fetch_failed` vs `not_provisioned`
  - Mismatch backlog (sorted by owner / age)
- **Entry:** Sidebar
- **Exit:** Mismatch row → drawer → new-tab cross-app to platform-admin

---

### 5.12 `/attendance` — Attendance & Shifts

- **Spec ref:** §8.4.8, §8.5.7
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_manager`, `ops_dispatcher` (when supply seems off)
- **Primary task:** Verify supply: who is on shift, who is anomalous, what's coming up.
- **Must-show data:**
  - Shift list: shift id, driver, vehicle, scheduled start / end, actual start / end, status, anomaly flag
  - Attendance records linked to shifts
  - KPIs: active shifts, completed today, anomalies
- **Must-support actions:**
  - Filter by date, by driver, by anomaly (low)
  - Drill into driver detail (low — navigation)
- **State variants:**
  - No shifts today: `no_data` (off-day) vs `not_provisioned` (schedule not loaded)
  - Anomaly spike (multiple no-shows) — visual urgency
- **Entry:** Sidebar, dispatch's "為什麼派不出去" supply concern
- **Exit:** `/drivers/[driverId]`

---

### 5.13 `/maintenance` — Maintenance

- **Spec ref:** §8.4.9, §8.5.7
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_manager`
- **Primary task:** Track maintenance commitments and flag overdue ones that impact dispatchable supply.
- **Must-show data:**
  - Records: id, vehicle, type, status (scheduled / in-progress / completed / overdue), scheduled time, completed time, technician, cost
  - Filters: status, vehicle, date range
  - Overdue highlight
- **Must-support actions:** per `availableActions`:
  - Create record (medium)
  - Edit record (medium)
  - Filter (low)
  - Search (low)
- **Decision points:**
  - Whether overdue maintenance should remove a vehicle from dispatchable pool
- **State variants:**
  - No records `no_data`
  - Overdue cluster (visual urgency)
- **Entry:** Sidebar, dashboard "overdue maintenance" KPI, `/vehicles/[id]` link
- **Exit:** `/vehicles/[id]`

---

### 5.14 `/drivers` — Driver Registry

- **Spec ref:** §8.4.10 + driver-spec §6.3
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_manager` (registry), `ops_dispatcher` (mid-dispatch lookup)
- **Primary task:** Find a driver and assess current state (shift, platform binding, eligibility, active orders).
- **Must-show data:**
  - List: id, name, current shift state, **platform online status per platform**, platform account binding state, eligibility per service bucket, current active order per platform, stale-location indicator, suppression badge if `DriverMatchingSuppression.active`
  - Filters: shift state, platform, eligibility, search by id / name / phone
- **Must-support actions:**
  - Search (low)
  - Open driver detail (navigation)
- **State variants:**
  - Many drivers (pagination / virtualization §7)
  - Stale-location surge — visual signal
- **Entry:** Sidebar, dispatch candidate row, attendance row, incident linked-driver
- **Exit:** `/drivers/[driverId]`

---

### 5.15 `/drivers/[driverId]` — Driver Detail / Earnings / Platform Binding

- **Spec ref:** §8.4.10 + driver-spec §6.3
- **Refresh tier:** T3 (15s); urgent-events push via notification
- **Primary persona / roles:** `ops_manager`, `ops_compliance` (during incident), `ops_dispatcher` (during call)
- **Primary task:** Get full picture of one driver: identity, status, today, current orders, earnings, platform bindings, re-auth needs.
- **Must-show data:**
  - Header: id, name, phone, status, shift state
  - **Active SOS banner** if driver has SOS in flight (page chrome changes — per Q-DRV12 driver-app side)
  - **`DriverMatchingSuppression`** state if active: reasonCode, expiresAt, related incident link
  - Platform binding panel: per platform — bound?, account id, last re-auth, status (active / re-auth required / suspended)
  - Active task panel: owned + forwarded tasks currently in flight
  - Recent failed relay attempts (forwarded routing failures)
  - Manual override notes
  - Earnings tab: driver statements with period filter
  - Recent shift / attendance entries
  - Recent incident links
- **Must-support actions:** per `availableActions`:
  - Take driver offline for a platform (high — requires reason, TTL — per Q-OPS08) — endpoint `POST /api/ops/drivers/{driverId}/platforms/{platformCode}/force-offline`
  - Request re-auth (medium)
  - Suppress matching during incident (high — requires reason, TTL up to 24h with `ops_manager` extension)
  - Lift suppression manually (high)
  - Mark unavailable for forwarded orders (medium)
  - Generate driver statement (low)
- **State variants:**
  - Driver not found
  - Re-auth required (urgent surface)
  - Active SOS — page chrome changes per spec
  - Active suppression — visible banner
  - No earnings history
- **Entry:** `/drivers`, `/dispatch/[id]` candidate, `/incidents/[id]` linked driver, `/callcenter` driver lookup
- **Exit:** Linked dispatch, linked incident, back to `/drivers`

---

### 5.16 `/vehicles` — Vehicle Registry

- **Spec ref:** §8.4.10
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_manager`, `ops_dispatcher`
- **Primary task:** Find a vehicle, see whether it's currently dispatchable, see maintenance / driver linkage.
- **Must-show data:**
  - List: id, plate, type, status, current driver binding, **dispatchable flag**, overdue maintenance flag, last seen
  - Filters: status, type, dispatchable, overdue
- **Must-support actions:** per `availableActions`:
  - Search (low)
  - Open vehicle detail (navigation)
- **State variants:**
  - Many vehicles offline (supply emergency)
- **Entry:** Sidebar, `/maintenance` row
- **Exit:** `/vehicles/[vehicleId]`

---

### 5.17 `/vehicles/[vehicleId]` — Vehicle Detail (NEW per Q-OPS02)

- **Spec ref:** §8.4.10 vehicle detail
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_manager`
- **Primary task:** Full picture of one vehicle for dispatch / maintenance / compliance context.
- **Must-show data:**
  - Header: id, plate, type, status, dispatchable flag
  - Current driver binding (click-through to `/drivers/[id]`)
  - Regulatory profile (license, insurance expiry)
  - Maintenance records (recent + scheduled + overdue) with click-through to `/maintenance`
  - Contract references (click-through to `/contracts/[id]`)
  - Offboarding / debranding state if applicable
  - Incident linkage (recent vehicle-tied incidents)
  - Audit events
- **Must-support actions:** mostly read-only at ops level (mutations live in platform-admin for fleet/compliance, in /maintenance for work orders); ops can add operational notes
- **State variants:**
  - Not found
  - In offboarding (banner)
  - Overdue maintenance (urgency)
- **Entry:** `/vehicles`, `/maintenance` row, `/drivers/[id]` current-vehicle link, `/incidents/[id]` linked-vehicle
- **Exit:** Linked driver, linked maintenance, linked contract, linked incident

---

### 5.18 `/contracts` — Contracts & Partner Relations

- **Spec ref:** §8.4.10 contracts piece
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_finance_reviewer`, `ops_manager`
- **Primary task:** Look up a contract to confirm relationship terms feeding dispatch and billing.
- **Must-show data:**
  - List: id, type (vehicle / driver / partner), parties, status, effective from / to, key terms summary
  - Partner relation panel: partner entry slug, program id, status, eligibility mode
- **Must-support actions:**
  - Search (low)
  - Open contract detail (navigation)
- **State variants:**
  - Expiring-soon contracts (visual urgency)
- **Entry:** Sidebar, `/revenue` partner mismatch
- **Exit:** `/contracts/[contractId]`

---

### 5.19 `/contracts/[contractId]` — Contract Detail (NEW per Q-OPS03, ops read-only)

- **Spec ref:** §8.4.10 contracts detail (ops scope only)
- **Refresh tier:** T3 (15s)
- **Primary persona / roles:** `ops_finance_reviewer`, `ops_manager`
- **Primary task:** Read contract context to resolve dispatch / billing / compliance questions.
- **Must-show data:**
  - Modifiable window
  - Proof requirements (e.g. completion proof rules)
  - Waiting / no-show rules
  - SLA profile (linked tenant SLA)
  - Tenant / partner linkage (click-through to platform-admin via new-tab deep link)
  - Current effective version + version history (read-only)
- **Must-support actions:** read-only at ops; mutation deep-links to platform-admin / tenant governance
- **State variants:**
  - Not found
  - In transition (new version pending) — visible
- **Entry:** `/contracts`, `/vehicles/[id]`, `/revenue` mismatch
- **Exit:** Cross-app new-tab to platform-admin for mutation

---

### 5.20 `/feature-flags` — Feature Flags (Read-only)

- **Spec ref:** §8.4 implied + §8.6 non-goal preserved
- **Refresh tier:** T6 (manual)
- **Primary persona / roles:** any ops role
- **Primary task:** Confirm which flags are on for the current scope so a perceived feature gap can be explained as gated rather than broken.
- **Must-show data:**
  - From `GET /api/ops/feature-flags` (per Q-X16 per-realm filtered endpoint): flag key, current value, scope (global / tenant), last changed at, last changed by, description
  - Filter by scope, search by key
- **Must-support actions:** read-only:
  - Search (low)
  - View change history (when available)
- **State variants:**
  - Mid-rollout (partial value across tenants) — visible
- **Entry:** Sidebar
- **Exit:** None (terminal read screen)

---

## 6. API mapping

| Page                      | Read methods                                                                                                                                                                                                                                       | Write methods                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`              | `getIdentityContext`, `getOperationalObservability`, `listOrders`, `listDispatchJobs`, `listDriverTasks`, `listVehicles`, `listDrivers`, `listShifts`, `listIncidents`, `listMaintenance`, `listReportJobs`, `listDriverStatements`, `/api/health` | (none directly; CTAs link out)                                                                                                     |
| `/dispatch` (boards)      | `listOrders`, `listDispatchJobs`, `listDriverTasks`, `listForwarderOrders`, `listForwarderSyncErrors`, `listForwarderReconciliationIssues`, `listDispatchCandidates` (per visible job), adapter health                                             | reconciliation completion (TBD client method), broadcast (TBD)                                                                     |
| `/dispatch/[workItemId]`  | `getOrder` / forwarded mirror getter (TBD), `getOrderDispatchTrace`, `listDispatchCandidates`, driver-task linkage                                                                                                                                 | `assignDispatch`, `assignDispatchCommand`, `cancelOrder`, `approveExceptionOverride`, `enterOrderCommand`, forwarded actions (TBD) |
| `/callcenter`             | `listCallSessions`, `getCallSession`                                                                                                                                                                                                               | `createCallCenterOrder`, `attachRecordingCallback`, `createCallbackTask`, `completeCallbackTask`, `escalateComplaintToIncident`    |
| `/complaints`             | `listComplaints`                                                                                                                                                                                                                                   | `createComplaint`, `assignComplaint`, `escalateComplaintToIncident`                                                                |
| `/complaints/[caseNo]`    | `getComplaint`, `getComplaintTimeline`, `getComplaintExportView`, `listAuditLogs` (filtered)                                                                                                                                                       | add note, assign, resolve, close, reopen, escalate, export (most exist; some new for detail view)                                  |
| `/incidents`              | `listIncidents`                                                                                                                                                                                                                                    | `createIncident`, `createIncidentFromDispatchException`                                                                            |
| `/incidents/[incidentId]` | `getIncident`, `getIncidentTimeline`, `getServiceRecoveryActions`, `getOrder` (linked), `listAuditLogs` (filtered)                                                                                                                                 | update incident, resolve, close, add service recovery action; lift driver suppression                                              |
| `/approval-requests`      | `listApprovalRequests`                                                                                                                                                                                                                             | `approveApprovalRequest`, `rejectApprovalRequest`, `escalateApprovalRequest`                                                       |
| `/reports`                | `listReportJobs`, `listFilingPackages`, per-job / per-package detail                                                                                                                                                                               | `createReportJob`, `generateFilingPackage`                                                                                         |
| `/revenue`                | revenue insights over `listOrders` + `listDriverTasks` + `listDriverStatements`, `listReconciliationIssues`                                                                                                                                        | (read-only mirror; cross-app for mutation)                                                                                         |
| `/attendance`             | `listShifts`                                                                                                                                                                                                                                       | (none direct)                                                                                                                      |
| `/maintenance`            | `listMaintenance`                                                                                                                                                                                                                                  | `createMaintenance`, edit                                                                                                          |
| `/drivers`                | `listDrivers`                                                                                                                                                                                                                                      | (none direct)                                                                                                                      |
| `/drivers/[driverId]`     | driver detail (TBD), `listDriverStatements`, `listShifts(driverId)`, platform binding (TBD), suppression state (TBD)                                                                                                                               | take driver offline per platform (new endpoint per Q-OPS08), request re-auth, suppress / lift matching, `generateDriverStatements` |
| `/vehicles`               | `listVehicles`                                                                                                                                                                                                                                     | (none direct)                                                                                                                      |
| `/vehicles/[vehicleId]`   | vehicle detail (TBD — new endpoint), maintenance list (filtered), contracts list (filtered), audit                                                                                                                                                 | (mostly read-only; ops notes)                                                                                                      |
| `/contracts`              | `listContracts`                                                                                                                                                                                                                                    | (none direct)                                                                                                                      |
| `/contracts/[contractId]` | contract detail (TBD — new endpoint)                                                                                                                                                                                                               | (read-only at ops)                                                                                                                 |
| `/feature-flags`          | `GET /api/ops/feature-flags` (new per Q-X16)                                                                                                                                                                                                       | (none — non-goal)                                                                                                                  |

Methods marked TBD need to be added to `packages/api-client/src/index.ts` as part of the engineering follow-up that produces the 12 new contracts in answers §7.

---

## 7. Purely visual open questions

> **🎨 2026-05-25 status:** the visual design team has answered most of these in [`drts-design-canvas/Ops Console.html`](./drts-design-canvas/Ops%20Console.html) (v0.6). The implementer should consult the canvas first; remaining "still open" items are ones the canvas explicitly did not address (e.g. items requiring product / system decisions, items deferred to Phase 2, or items the design team flagged as needing operator validation). Treat any apparent mismatch between this packet's items and the canvas as **canvas wins for visual; this packet wins for behavior/data/API**.

Most cross-cutting and structural decisions are now baked into §3 and §5 from the answers document. The remaining questions below are visual / interaction choices that belonged to the design team's authority — most have been answered.

### 7.1 Cross-cutting (apply across many screens)

1. **Density target.** Compact / comfortable / spacious. Spec is silent. Affects every list and table.
2. **Stale-data visual treatment.** Banner? Faded data? Refresh prompt? Icon? Choice is design's; the data freshness state from `UiRefreshMetadata` is given.
3. **Identity context chip shape.** Top header chip placement, content density (full realm/actor/tenant/env vs abbreviated), interaction (click → identity drawer?).
4. **Health context placement.** Sidebar footer per §3.3 — but exact treatment (color dot only? text? mini-spark history of last 5 checks?).
5. **Degraded banner pattern.** Top of page, when `UiHealthEnvelope.status !== "healthy"` AND page-critical. Visual designer chooses sticky vs scroll-with-content, dismissibility, severity-to-tone mapping.
6. **Empty-state illustration set.** Per `EmptyReason` enum (`no_data` / `not_provisioned` / `fetch_failed` / `permission_denied` / `external_unavailable` / `filtered_empty`). Six distinct treatments needed.
7. **Confirmation modal shape per risk tier.** Low (toast only), medium (modal confirm + receipt toast), high (modal + required reason + receipt toast + audit link). Shape, animation, copy convention.
8. **State pill color system.** Map domain state codes (dispatch, complaint sla, incident severity, adapter health, etc.) to a coherent tone system. The codes are given; the tones are design's.
9. **Loading skeleton vs spinner choice.** Per surface type.
10. **Search drawer / overlay shape.** Header search results grouped by entity category per Q-X08.
11. **Notification bell + inbox panel shape.** Per Q-X05/X06; severity → visual treatment.
12. **Cross-app deep-link affordance.** When clicking a link opens a new tab (cross-app per Q-X03), how does the user know in advance? Icon? Tooltip?

### 7.2 Per-screen

13. **`/dashboard` "今日待處理" banner stacking.** Multiple alerts at once: carousel? stacked banners? prioritized single + "view all"?
14. **`/dashboard` KPI density.** 6 KPIs across one row currently; visual may regroup.
15. **`/dispatch` board IA.** Six first-class sub-boards (Ready / Assigned / Exception hold / No supply / Governance blocked / Forwarded). Tab pair? Pill nav? Vertical secondary nav? Each board has a count badge.
16. **`/dispatch/[id]` open driver detail mid-decision.** Modal? Side panel? New tab? Full navigation? (§3 lists this as one of the few that didn't get a system answer — visual designer picks.)
17. **`/callcenter` IA.** One active session per agent (Q-OPS04). Layout: active session left + queues right? Top active + bottom queues? Other?
18. **`/complaints` SLA breach visual urgency.** Three states (`within_sla` / `warning` / `breached`); design must distinguish warning from breach.
19. **`/complaints/[caseNo]` page structure.** Header / timeline / linked-entities / actions arrangement.
20. **`/incidents/[incidentId]` page structure.** Standalone page (not modal — system answers no longer require the `position: fixed` overlay).
21. **`/approval-requests` empty vs all-pending visual.** Sparse current state vs urgent pending pile — design must convey scale.
22. **`/reports` per-job detail.** Drawer? Modal? New route?
23. **`/revenue` period picker shape.** Dropdown? Segmented? Date range picker?
24. **`/revenue` mismatch drawer shape.** Inline read-only drawer with deep link to platform-admin; drawer width / persistence.
25. **`/drivers` list density.** Many drivers — pagination? Virtualization? Search-first?
26. **`/drivers/[driverId]` active-SOS chrome change.** What changes when SOS active (color? sticky banner? page overlay?).
27. **`/drivers/[driverId]` platform binding panel.** Per platform — collapsed by default vs expanded? Re-auth-required treatment.
28. **`/vehicles/[vehicleId]` and `/contracts/[contractId]` structure.** New routes — design from scratch.
29. **`/feature-flags` rollout state visualization.** "Mid-rollout" partial-value visualization.

### 7.3 Shell

30. **Sidebar grouping verification.** Current 5 sections (工作面 / 即時派遣 / 案件處理 / 營運監控 / 主資料). Verify these groupings serve §2 personas; new detail routes nest under their parents.
31. **Sidebar role-aware visibility.** `/approval-requests` only visible to scoped roles (Q-OPS10). Mechanism: hide entirely vs disabled-with-tooltip.
32. **Sidebar count badges.** System answers don't mandate them, but the old implementation had them. Decision: include or omit in v1.
33. **Header search bar placement and prominence.**
34. **Avatar / OC chip behavior.** Identity drawer? Logout? Settings?

---

## 8. Out of scope for this packet

- Visual design choices (per §0)
- Other apps (separate packets to follow: platform-admin, tenant-console, driver-app)
- API contract additions (engineering follow-up per answers §7)
- Implementation backlog (separate doc after design lands)
- Migration plan from current implementation to designed implementation

---

## 9. Hand-off process

1. Visual team reads this packet + answers doc + spec §8.
2. Visual team flags every §7 question with a proposed answer or a request for clarification.
3. Where §7 questions need product/system clarification (rare since answers cover most), they get sent back to the system design team — never invented in visual.
4. Visual team produces:
   - IA sitemap (this packet's §4 is a draft for them to confirm or amend)
   - Per-screen wireframes covering all state variants listed in §5
   - Component system (state pills, banners, queue rows, KPI tiles, action confirmations, etc.)
   - Design tokens (colors, type, spacing, radius, elevation, density)
5. Engineering picks up the wireframes + component system + tokens, plus this packet's §6 API mapping (and the new contracts from answers §7 once they exist), and produces the implementation backlog.

This packet is the input to step 1. It is not a design.
