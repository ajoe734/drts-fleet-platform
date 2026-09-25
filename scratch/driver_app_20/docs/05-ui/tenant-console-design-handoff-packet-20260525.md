# Tenant Console — Visual Design Hand-off Packet

**Date:** 2026-05-25
**App:** `apps/tenant-console-web` (canonical per Q-TEN01)
**Recipient team:** 視覺設計團隊 (含 UX)
**Status:** Hand-off input. **No visual decisions in this document.**
**Author lane:** Claude (`TEN-DH-PKT-002`)
**Predecessors:**

- [`system-design-questions-all-apps-20260524.md`](./system-design-questions-all-apps-20260524.md)
- [`system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md) — **authority**
- [`ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md) — established shape
- [`platform-admin-design-handoff-packet-20260525.md`](./platform-admin-design-handoff-packet-20260525.md) — companion

---

## 0. How to read this document

Same shape as ops-console and platform-admin packets. Captures every Tenant Console screen at the level a visual designer needs to begin producing wireframes / IA / component system / design tokens. **No visual decisions.**

What it does contain: §2 personas + role codes, §3 operating context, §4 sitemap, §5 per-page functional briefs, §6 API mapping, §7 purely visual open questions.

What it does NOT contain: wireframes, comps, layout, grid, spacing, color, typography, iconography, density, component system, design tokens.

**Topology context (Q-TEN01 resolution):**

- `apps/tenant-console-web` is the **canonical** tenant admin console — the visual design target.
- `tenant-commute-hub` (external, out-of-repo) remains the **live production** tenant UI until cutover. Visual design produced from this packet ships to `tenant-console-web` and supersedes the external hub at cutover. Designer should design as if `tenant-console-web` is the production target.
- `apps/tenant-portal-web` is the **sunset reference shell** only — not a design target.
- **Partner Booking Mode** moves out of tenant-console to a separate app `apps/partner-booking-web` (Q-TEN03). It is **not** in this packet. The legacy `tenant-console-web/app/partner/*` route is compatibility / rollback only and not in scope here.

If the visual team hits product / system / contract ambiguity: flag back to system design team. Never invent.

---

## 1. Source documents

| Document                                                                                                                                                  | Role                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [system-design-answers-all-apps-20260524.md](./system-design-answers-all-apps-20260524.md)                                                                | **Authority.** Every decision binding.                                                                                                         |
| [01-product/platform-admin-ops-tenant-console-product-spec-20260508.md §9](../01-product/platform-admin-ops-tenant-console-product-spec-20260508.md)      | Tenant Console business intent: §9.1 goal, §9.2 baseline, §9.3 personas, §9.4 modes, §9.5 routes, §9.6 modules, §9.7 workflows, §9.8 non-goals |
| [01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md](../01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md) | Topology decision predecessor                                                                                                                  |
| `apps/tenant-console-web/app/**/page.tsx`                                                                                                                 | Current route surface — partial; many routes per spec §9.5 + Q-TEN02 not yet implemented                                                       |
| `packages/api-client/src/index.ts`                                                                                                                        | Available method surface (most tenant methods exist; aggregated readiness endpoint Q-TEN10 needs adding)                                       |

When this packet and a source document disagree, the source document wins.

---

## 2. Personas

From spec §9.3. Partner booking user is **NOT** in this packet (moved to partner-booking-web per Q-TEN03).

| Persona                    | Primary concerns                        | Role code            | Primary screens                                                                                                                      |
| -------------------------- | --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant Admin               | 使用者、角色、整合設定、SLA、通知、帳務 | `tc_admin`           | `/`, `/users`, `/sla`, `/notifications`, `/billing`, `/api-keys`, `/webhooks`, `/integration-governance`, `/feature-flags`, `/audit` |
| Tenant Operator            | booking 建立、查單、乘客與地址資料      | `tc_operator`        | `/bookings`, `/bookings/new`, `/bookings/[id]`, `/passengers`, `/addresses`                                                          |
| Tenant Finance / Analyst   | invoice、reports、audit、cost centers   | `tc_finance`         | `/billing`, `/invoices`, `/reports`, `/audit`, `/cost-centers`                                                                       |
| Tenant Integration Manager | API keys、webhooks、delivery visibility | `tc_integration_mgr` | `/api-keys`, `/webhooks`, `/notifications`, `/integration-governance`                                                                |
| Viewer                     | 只讀查詢                                | `tc_viewer`          | Read-only access to most pages                                                                                                       |

`tc_admin` is the most powerful tenant-scoped role per spec §9.6.5 ("只有 tenant admin 可操作"). The visual must NOT hard-code; CTAs come from `availableActions` per resource (Q-X13).

**Important:** All roles are scoped within the tenant — there is no cross-tenant authority at this level (cross-tenant operations live in ops-console or platform-admin). This is enforced by backend; visual designer just respects the principle.

---

## 3. Operating context (binding on every screen)

Same shape as ops-console and platform-admin packets. Tenant-console specifics noted inline.

### 3.1 Locale (Q-X17)

zh-TW primary, en secondary. Domain codes only via translation maps; never as primary user-facing label.

Tenant-specific state codes needing translation: booking statuses (`draft`, `submitted`, `confirmed`, `assigned`, `in_progress`, `completed`, `cancelled`, etc.), webhook delivery states, API key status, invoice statuses, SLA threshold types (`wait`, `arrival`, `completion`).

### 3.2 Refresh model (Q-X01, Q-X02)

Tenant-console is mostly **T5 Tenant slow** tier (30s) per Q-X02. Reports and audit are **T6 manual**.

| Tier               | Cadence | Where it applies in tenant-console                                                                                                                                                                                             |
| ------------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T5 Tenant slow** |     30s | `/`, `/bookings`, `/bookings/[id]`, `/webhooks`, `/notifications`, `/integration-governance`, `/users`, `/sla`, `/api-keys`, `/billing`, `/invoices`, `/passengers`, `/addresses`, `/cost-centers`, `/rules`, `/feature-flags` |
| **T6 Manual**      |  manual | `/reports`, `/audit`                                                                                                                                                                                                           |

`UiRefreshMetadata` envelope present on every response. Stale + refresh affordance required.

**Booking status nuance:** While the list is T5 cadence, booking state changes are triggered by ops/dispatch upstream and surface here on the next poll. The visual should not pretend booking state is instant; the lag is expected and the freshness indicator should help users understand "the dispatcher already acted, you'll see it shortly."

### 3.3 Identity / health context bar (Q-X11, Q-X12)

Every screen surfaces:

- **Top header chip:** actor / realm / **tenant** / environment (e.g. `tenant / production / acme-corp / SA-01`). Tenant chip is critical for tenant-scoped users with cross-tenant access (e.g. consultancy admin managing multiple tenants).
- **Sidebar footer:** API health (`healthy` / `degraded` / `down`) + `lastCheckedAt`
- **Page content top:** degraded banner when page-critical dependency degraded

### 3.4 Confirmation pattern (Q-X09, Q-X10)

Risk-classified per `ResourceActionDescriptor`:

| Risk       | Examples in tenant-console                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Low**    | refresh, filter, search, mark notification read                                                                                                                                                                              |
| **Medium** | create booking, update booking (when allowed), create passenger, create address, invite user, update SLA threshold, create webhook endpoint, create cost center, create approval rule, create report job                     |
| **High**   | cancel booking, deactivate passenger/address (soft per Q-TEN06), revoke API key, rotate API key (followed by once-only secret modal per Q-TEN09), suspend user, delete webhook endpoint, disable cost center / approval rule |

Receipt with `auditId` on every write. Audit view link in receipt opens audit page filtered (in-app).

### 3.5 Authority boundaries (Q-X13)

CTAs from `data.availableActions[]` — never hard-coded by role. Per Q-TEN05, **booking editability is also via availableActions + `editableUntil`** — visual must NOT compute editability from status alone:

```ts
// booking read model includes:
{
  editableUntil: string | null;
  readOnlyReasonCode: string | null;
  availableActions: ResourceActionDescriptor[];
}
```

### 3.6 Empty / not-ready states (Q-X15)

```ts
type EmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty";
```

Tenant-specific examples:

- `/bookings` empty for a brand-new tenant: `no_data` vs `not_provisioned` (tenant not configured)
- `/webhooks` empty when delivery engine not active: `not_provisioned` (per Q-TEN08 — must distinguish, not fake mock data)
- `/integration-governance` aggregated readiness state may surface `not_provisioned` per sub-system

### 3.7 Audit (admin spec §3.3 + Q-TEN13)

Every state-changing action is audit-logged. Per Q-TEN13, **tenant audit visibility includes all actions on tenant-owned resources regardless of actor realm** — so a tenant admin can see:

- Tenant user actions on tenant resources
- Ops actions on this tenant's bookings/complaints
- Platform admin actions affecting this tenant's config
- System actions affecting tenant resources

Sensitive fields are masked by policy. Visual must convey actor realm clearly (tenant chip vs ops chip vs platform chip vs system chip on each audit row).

### 3.8 Search (Q-X07)

Header search is app-scoped cross-entity. Tenant-console searches across: bookings, passengers, addresses, cost centers, invoices. Results grouped by category.

### 3.9 Notifications (Q-X05, Q-X06)

Backend per-user inbox + bell icon. Tenant-relevant events:

```text
booking.created
booking.confirmed
booking.cancelled
booking.approval_required
booking.approval_approved
booking.approval_rejected
invoice.ready
webhook.delivery_failed
quota.threshold_warning
```

Plus cross-app notices from platform-admin (Q-ADM15 — critical / maintenance severity push to tenant audience).

### 3.10 Cross-app navigation (Q-X03)

Deep links open in new tab. Tenant-console cross-app targets:

- Tenant admin clicking on a complaint reference might deep-link to ops-console `/complaints/[caseNo]` (read-scoped for that tenant) — **new tab**
- Tenant audit entries from ops/platform actions can deep-link back to ops-console / platform-admin (read-scoped) — **new tab**
- Webhook delivery details might deep-link to platform-admin in degenerate cases — **new tab**

### 3.11 Command semantics (Q-TEN04)

Per Q-TEN04, tenant booking endpoints use **synchronous command pattern**, not async queue:

```http
POST /api/tenant/bookings/commands/create
POST /api/tenant/bookings/{bookingId}/commands/update
POST /api/tenant/bookings/{bookingId}/commands/cancel
```

Each command returns either immediate result OR `accepted` state with `commandId` if external dependency is pending. Visual designer must accommodate the `accepted+pending` state (a brief "we received it, awaiting confirmation" UI moment) — not pretend everything is synchronous.

---

## 4. Sitemap

### 4.1 Top-level structure

Per spec §9.5 + Q-TEN02 (ship all missing routes in tenant-console-web).

```
工作面 (Workspace)
└── /                                工作面          Workspace home (spec §9.6.1)

訂單 (Bookings)
├── /bookings                        訂單           Booking list (spec §9.6.2)
├── /bookings/new                    新增訂單        Booking create (spec §9.5 — Q-TEN02 explicit route, not modal-only)
└── /bookings/[id]                   訂單詳情        Booking detail (with editableUntil + readOnlyReasonCode per Q-TEN05)

資料維護 (Directory)
├── /passengers                      乘客           Passenger directory (spec §9.6.3 — soft deactivate per Q-TEN06)
└── /addresses                       地址           Address book (spec §9.6.4 — NEW per Q-TEN02)

帳號與權限 (Access)
└── /users                           使用者          Tenant users (spec §9.6.5)

整合 (Integration)
├── /api-keys                        API 金鑰        API keys (spec §9.6.9 — plaintext-once issuance per Q-TEN09)
├── /webhooks                        Webhooks       Webhook endpoints + delivery logs (spec §9.6.8 — real engine per Q-TEN08)
├── /notifications                   通知            Notification preferences (spec §9.6.6 — NEW per Q-TEN02)
└── /integration-governance          整合就緒度      Integration governance (spec §9.6.13 — NEW per Q-TEN02 + Q-TEN10 aggregated endpoint)

服務水準 (SLA)
└── /sla                             SLA            SLA profile (spec §9.6.7 — NEW per Q-TEN02; minutes per Q-TEN07)

財務 (Finance)
├── /billing                         帳務概覽        Billing overview (NEW per Q-TEN02)
├── /invoices                        發票           Invoice list / detail (existing)
├── /cost-centers                    成本中心        Cost centers (per Q-TEN11; Tenant Governance / Enterprise Finance module)
└── /rules                           審批規則        Approval rules (per Q-TEN12; Tenant Governance Approval Rules module)

報表與稽核 (Reports & Audit)
├── /reports                         報表           Tenant reports (NEW per Q-TEN02)
└── /audit                           稽核           Audit trail with cross-actor visibility (spec §9.6.12 + Q-TEN13)

系統 (System, read-only / config)
├── /feature-flags                   功能旗標        Feature visibility (NEW per Q-TEN02; read-scoped per Q-X16)
└── /settings                        設定           Tenant settings (existing; not in spec §9.5 — see §7 open question)
```

20 routes total. Routes in spec §9.5 not in current implementation are listed as NEW (per Q-TEN02 they ship in tenant-console-web).

### 4.2 Inter-page navigation flows

First-class transitions:

- `/` workspace home → quick links to `/bookings/new`, `/integration-governance`, `/billing`
- `/bookings` row → `/bookings/[id]`
- `/bookings/new` form → submit (command per Q-TEN04) → redirect to `/bookings/[id]` on completed, or stay on form with `accepted+pending` state
- `/bookings/[id]` passenger reference → `/passengers` filtered or detail
- `/bookings/[id]` address reference → `/addresses` filtered or detail
- `/bookings/[id]` complaint reference → cross-app to ops-console `/complaints/[caseNo]` — new tab
- `/passengers` → `/bookings/new` with passenger pre-filled
- `/addresses` → `/bookings/new` with address pre-filled
- `/integration-governance` aggregated tiles → drill to `/api-keys`, `/webhooks`, `/notifications`, `/sla`, `/reports`
- `/api-keys` issue → modal (Q-TEN09; secret shown once)
- `/webhooks` row → delivery log subpanel (per spec §9.6.8 delivery logs)
- `/billing` → `/invoices` for specific invoice
- `/audit` row → resource detail (in-app for tenant resources; cross-app new tab if owner is another app)

---

## 5. Per-page functional briefs

Schema per page (same as previous packets): spec ref / refresh tier / primary persona / primary task / must-show data / must-support actions / decision points / state variants / entry-exit.

---

### 5.1 `/` — Workspace Home

- **Spec ref:** §9.6.1 + workflow §9.7.1
- **Refresh tier:** T5
- **Primary persona / roles:** any tenant role at session start
- **Primary task:** See tenant identity context, current module capabilities, integration health, and quick actions.
- **Must-show data:**
  - tenant identity context (name, code, status, environment)
  - module enablement summary (per spec §9.6.1)
  - integration health summary (from aggregated `/api/tenant/integration-governance/readiness` per Q-TEN10)
  - pending bookings count / recent updates
  - quick action tiles
  - module / feature flag aware visible-modules nav (per workflow §9.7.1)
- **Must-support actions:**
  - Quick CTAs: "New booking", "View today's bookings", "Open integration governance"
- **Decision points:**
  - Anything urgent to handle today?
  - Are integrations healthy?
- **State variants:**
  - Brand-new tenant `not_provisioned` — onboarding state (empty cards with provisioning prompts)
  - Established tenant with normal state
  - Tenant in degraded state (integration unhealthy)
  - Tenant in suspended state (banner)
- **Entry:** Session start landing
- **Exit:** Any module

---

### 5.2 `/bookings` — Booking List

- **Spec ref:** §9.6.2 + workflow §9.7.3
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_operator`, `tc_admin`, `tc_viewer`
- **Primary task:** Find a booking, see status at a glance, work on it if action is needed.
- **Must-show data:**
  - bookings with: booking id / order id, service bucket / subtype, status, pickup, dropoff, reservation window, passenger, age, last update
  - `editableUntil` indicator if approaching deadline (visual urgency)
  - `slaStatus` if SLA computed (likely backend-computed per ops-console Q-OPS13 analogy, but verify in spec)
- **Must-support actions:**
  - Filter by status, service bucket, date range
  - Search by booking id, order id, passenger
  - Open detail
  - Create booking (medium) — navigates to `/bookings/new`
- **Decision points:**
  - Triage: which booking needs my attention next
  - Are there cancellations or approval-required bookings to handle?
- **State variants:**
  - Empty `no_data` (brand-new tenant) vs `not_provisioned` (tenant not configured) vs `filtered_empty`
  - Approval-required bookings highlighted
- **Entry:** Sidebar, dashboard quick link, notification deep link
- **Exit:** `/bookings/[id]`, `/bookings/new`

---

### 5.3 `/bookings/new` — Booking Create

- **Spec ref:** §9.6.2 + workflow §9.7.2 + Q-TEN04 (synchronous command)
- **Refresh tier:** N/A (form page; no list to refresh)
- **Primary persona / roles:** `tc_operator`, `tc_admin`
- **Primary task:** Create a new booking with all the right context.
- **Must-show data:**
  - Form fields per spec §9.7.2: subtype, pickup, dropoff, reservation window, passenger picker (from `/passengers` directory), flight / terminal / luggage / notes / cost center, vehicle preference, onsite contact
  - Address picker (from `/addresses`)
  - Approval rule preview (if any approval rule matches based on `/rules`)
- **Must-support actions:**
  - Submit (medium) — uses `POST /api/tenant/bookings/commands/create` per Q-TEN04
  - Cancel form (low)
  - Save as draft (low — if drafts are supported; verify in spec)
- **Decision points:**
  - Right passenger? Right address? Right time window?
- **State variants:**
  - Empty form
  - Pre-filled from passenger / address shortcut
  - Validation errors (per field)
  - Submitting (synchronous wait)
  - `accepted+pending` state (command accepted but external dependency confirming — per Q-TEN04)
  - Completed → redirect to `/bookings/[id]`
- **Entry:** From `/bookings` button, from `/passengers` row, from `/addresses` row, from `/` quick action
- **Exit:** Booking detail on success; back to list on cancel

---

### 5.4 `/bookings/[id]` — Booking Detail

- **Spec ref:** §9.6.2 + workflow §9.7.3 + Q-TEN05 backend-driven editability
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_operator`, `tc_admin`, `tc_viewer`
- **Primary task:** See full booking context, update if allowed, cancel if needed, follow up if exception.
- **Must-show data:**
  - All booking fields from spec §9.6.2
  - Current status with timeline
  - `editableUntil` countdown (if editable, when does that window close)
  - `readOnlyReasonCode` (if read-only, why)
  - Linked passenger, address, cost center
  - Approval state if approval rule applied (per `/rules`)
  - Driver / vehicle assignment (if assigned)
  - ETA if active
  - Recent updates (audit subset for this booking)
- **Must-support actions** per `availableActions`:
  - Update (medium) — uses `POST /api/tenant/bookings/{id}/commands/update`
  - Cancel (high — requires reason) — uses `POST /api/tenant/bookings/{id}/commands/cancel`
  - Resubmit approval if applicable
- **Decision points:**
  - Can I still edit this? (driven by `availableActions` not status)
  - Should I cancel vs let it run?
- **State variants:**
  - Not found
  - Loading
  - Editable (CTAs available)
  - Read-only with reason (no editable CTAs)
  - In `accepted+pending` (command pending external confirmation)
  - In approval-required state
  - In active driver assignment
  - Completed / cancelled (terminal)
- **Entry:** Row on `/bookings`, create-redirect, notification deep link
- **Exit:** Back to list

---

### 5.5 `/passengers` — Passenger Directory

- **Spec ref:** §9.6.3 + workflow §9.7.4 + Q-TEN06 (soft deactivate)
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_operator`, `tc_admin`
- **Primary task:** Maintain frequent passenger records for fast booking creation.
- **Must-show data:**
  - passenger list: full name, employee no, department, mobile, email, active flag
  - Filter by active/inactive, department; search by name / employee no / mobile
- **Must-support actions** per `availableActions`:
  - Create passenger (medium)
  - Edit passenger (medium)
  - Soft deactivate (high — requires reason per Q-TEN06; existing bookings retain snapshot; deactivated records hidden from pickers but visible in historical detail)
  - Reactivate (medium)
  - **No hard delete in normal UI** per Q-TEN06; privacy deletion is a separate compliance workflow
- **State variants:**
  - Empty `no_data`
  - With inactive records visible if filter includes them
  - With duplicate-name warning (if backend detects)
- **Entry:** Sidebar
- **Exit:** `/bookings/new` with pre-fill; passenger detail (drawer or inline edit — §7)

---

### 5.6 `/addresses` — Address Book (NEW per Q-TEN02)

- **Spec ref:** §9.6.4 + workflow §9.7.4 + Q-TEN06
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_operator`, `tc_admin`
- **Primary task:** Maintain frequent addresses for fast booking creation.
- **Must-show data:**
  - address list: address name, address text, lat/lng, tags, owner passenger reference, active flag
  - Filter by tag, by owner passenger; search by name / text
- **Must-support actions** per `availableActions`:
  - Create address (medium)
  - Update address (medium)
  - Soft deactivate (high — requires reason per Q-TEN06)
  - Reactivate (medium)
  - Export view (low — per spec §9.6.4)
- **State variants:**
  - Empty `no_data`
  - With inactive records if filter includes
- **Entry:** Sidebar
- **Exit:** `/bookings/new` with pre-fill; address detail (drawer or inline — §7)

---

### 5.7 `/users` — Tenant Users

- **Spec ref:** §9.6.5 + workflow §9.7.5
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin` only ("只有 tenant admin 可操作" per spec)
- **Primary task:** Manage tenant internal users and their roles.
- **Must-show data:**
  - user list: user id, display name, email, role, status, invited at, last login
  - Filter by role, by status
- **Must-support actions** per `availableActions`:
  - Invite user (medium)
  - Update role (medium)
  - Suspend (high — requires reason)
  - Resend invitation (medium)
- **Decision points:**
  - What role is correct?
  - Should this user be suspended pending investigation?
- **State variants:**
  - Empty (only the admin themselves)
  - Pending invitations visible
  - Suspended users visible (separate filter)
- **Entry:** Sidebar
- **Exit:** None terminal

---

### 5.8 `/notifications` — Notification Preferences (NEW per Q-TEN02)

- **Spec ref:** §9.6.6
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`, `tc_integration_mgr`
- **Primary task:** Decide which event types get sent to which channels.
- **Must-show data:**
  - Per event type × channel matrix: event type (e.g. `booking.created`, `booking.cancelled`, `invoice.ready`, `webhook.delivery_failed`, `quota.threshold_warning`), channel (`email` / `webhook` / `ops_console`), enabled flag
  - Per-event explanation (when fires, who receives by default)
- **Must-support actions** per `availableActions`:
  - Update subscription (medium)
- **State variants:**
  - All defaults
  - Custom configuration
  - Channel not yet provisioned (e.g. webhook channel disabled because no endpoint yet — `not_provisioned`)
- **Entry:** Sidebar, link from `/integration-governance`
- **Exit:** None terminal

---

### 5.9 `/sla` — SLA Profile (NEW per Q-TEN02)

- **Spec ref:** §9.6.7 + Q-TEN07 (unit = minutes)
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`
- **Primary task:** Set wait / arrival / completion threshold minutes that govern SLA computation for this tenant.
- **Must-show data:**
  - `waitThresholdMin` (current value, unit clearly = minutes per Q-TEN07)
  - `arrivalThresholdMin`
  - `completionThresholdMin`
  - `updatedAt`, updated by
  - Effect note: "Threshold changes affect new bookings and newly computed SLA events. Existing bookings keep SLA profile snapshot at creation unless explicitly recalculated by admin command." (Q-TEN07)
- **Must-support actions** per `availableActions`:
  - Update SLA profile (high — requires reason because affects all future bookings)
  - Recalculate existing bookings (high — admin command, requires reason)
- **Decision points:**
  - Are these thresholds realistic given current operational reality?
- **State variants:**
  - First-time (no previous values — `not_provisioned`)
  - With set values
  - Mid-recalculation
- **Entry:** Sidebar, link from `/integration-governance`
- **Exit:** None terminal

---

### 5.10 `/webhooks` — Webhook Management (with delivery logs)

- **Spec ref:** §9.6.8 + workflow §9.7.7 + Q-TEN08 (real delivery engine, not mock)
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_integration_mgr`, `tc_admin`
- **Primary task:** Manage webhook endpoints; observe delivery health; debug failures.
- **Must-show data:**
  - Endpoint list: webhook URL, event list (subscribed events), secret metadata (masked), status (active / disabled), delivery health summary
  - Per-endpoint delivery logs: timestamp, event type, status (delivered / failed / queued), HTTP response code, retry count
  - **If webhook delivery engine not active** (per Q-TEN08): page shows `not_provisioned` empty state with explanation — never fake mock logs
- **Must-support actions** per `availableActions`:
  - Create endpoint (medium)
  - Update endpoint (medium)
  - Disable endpoint (high — requires reason)
  - Delete endpoint (high — requires reason)
  - Rotate webhook secret (high — secret shown once like Q-ADM07 pattern; modal with copy/download)
  - View delivery log (low)
  - Retry failed delivery (medium)
- **Decision points:**
  - Is this endpoint healthy? Should retries be increased / decreased?
  - Should this endpoint be temporarily disabled while we fix the receiver?
- **State variants:**
  - Empty `no_data` (no endpoints) vs `not_provisioned` (engine not active per Q-TEN08)
  - With failure cluster (visual urgency)
  - With recent successful deliveries
  - With queued (pending retry) deliveries
- **Entry:** Sidebar, notification `webhook.delivery_failed`, link from `/integration-governance`
- **Exit:** None terminal

---

### 5.11 `/api-keys` — API Key Management

- **Spec ref:** §9.6.9 + workflow §9.7.6 + Q-TEN09 (plaintext once)
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_integration_mgr`, `tc_admin`
- **Primary task:** Issue, rotate, and revoke API keys safely.
- **Must-show data:**
  - Key list: key name, key prefix + masked suffix, scopes, last used, expiresAt, revokedAt
  - Filter by status (active / expired / revoked), search by name
- **Must-support actions** per `availableActions`:
  - Issue key (high — modal-once secret display per Q-TEN09: show full key once with copy button + optional download `.txt` + "I stored this key" confirmation; later display masked suffix only)
  - Rotate key (high — same secret-once modal)
  - Revoke key (high — requires reason)
- **Decision points:**
  - What scopes does this integration need (least-privilege)?
  - When should this key expire?
- **State variants:**
  - Empty `no_data`
  - Key just issued (secret modal open on issuance success)
  - Expiring-soon keys highlighted
  - Revoked keys (separate filter / visible)
- **Entry:** Sidebar, link from `/integration-governance`
- **Exit:** None terminal

---

### 5.12 `/billing` — Billing Overview (NEW per Q-TEN02)

- **Spec ref:** §9.6.10 (note: §9.6.10 spec covers "Billing & Invoices" — Q-TEN02 clarifies `/billing` is overview, `/invoices` is detail)
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`, `tc_finance`
- **Primary task:** See tenant billing profile and current period billing snapshot.
- **Must-show data:**
  - Billing profile (payment method, billing contact, billing address)
  - Current period billing snapshot (period, accrued amount, projected close)
  - Recent invoices summary (links to `/invoices`)
  - Quota / usage relative to plan if applicable
- **Must-support actions:**
  - Edit billing profile (medium)
  - Open `/invoices` for detail
- **State variants:**
  - First-time `not_provisioned`
  - Active with current period
  - Past-due / suspended state
- **Entry:** Sidebar
- **Exit:** `/invoices`

---

### 5.13 `/invoices` — Invoices

- **Spec ref:** §9.6.10
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_finance`, `tc_admin`
- **Primary task:** See invoice history, download artifacts.
- **Must-show data:**
  - Invoice list: invoice id, status (draft / issued / paid / overdue), amount, billing period, issued date, due date, artifact URL, expiresAt
  - Filter by status, by period; search by id
- **Must-support actions:**
  - Download signed artifact (low)
  - View detail (drawer or new route — §7)
- **State variants:**
  - Empty
  - With overdue (urgency)
  - Artifact expired
- **Entry:** `/billing`, sidebar
- **Exit:** Artifact download

---

### 5.14 `/cost-centers` — Cost Centers (Q-TEN11)

- **Spec ref:** Q-TEN11 maps this to Tenant Governance / Enterprise Finance module
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_finance`, `tc_admin`
- **Primary task:** Maintain cost center directory; understand quota allocation.
- **Must-show data per Q-TEN11:**
  - cost center directory: code, name, owner (linked tenant user), active/disabled state, quota summary (used vs allocated)
  - approval linkage (does this cost center trigger approval rules per `/rules`)
  - reporting attribution (which reports include this cost center)
- **Must-support actions** per `availableActions`:
  - Create cost center (medium)
  - Update (medium)
  - Disable cost center (high — requires reason)
  - Reactivate (medium)
- **Decision points:**
  - Should a new cost center be created or existing one expanded?
  - Is quota allocation appropriate?
- **State variants:**
  - Empty `no_data`
  - Disabled cost centers visible (separate filter)
  - Over-quota highlighted
- **Entry:** Sidebar
- **Exit:** `/rules` for approval linkage; `/reports` for attribution

---

### 5.15 `/rules` — Approval Rules (Q-TEN12)

- **Spec ref:** Q-TEN12 maps this to Tenant Governance Approval Rules module
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`
- **Primary task:** Define approval rules that gate booking creation; test dry-run; reorder for precedence.
- **Must-show data per Q-TEN12:**
  - rule list: name, conditions (quota-aware), approval mode (single / sequential / parallel), approvers (linked users), active/disabled, order/precedence
  - Per-rule: dry-run evaluator (test against synthetic booking)
- **Must-support actions** per `availableActions`:
  - Create rule (medium)
  - Update (medium)
  - Disable rule (high — requires reason; rule no longer applies but historical bookings preserved)
  - Reorder precedence (medium)
  - Dry-run evaluate against test booking (low)
- **Decision points:**
  - Does this rule actually fire when intended? (dry-run)
  - What precedence vs other rules?
- **State variants:**
  - Empty `no_data`
  - With conflicting rules (warning)
  - Disabled rules visible
- **Entry:** Sidebar, link from `/cost-centers`
- **Exit:** None terminal

---

### 5.16 `/integration-governance` — Integration Governance (NEW per Q-TEN02 + Q-TEN10 aggregated endpoint)

- **Spec ref:** §9.6.13 + Q-TEN10 aggregated readiness endpoint
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`, `tc_integration_mgr`
- **Primary task:** See tenant integration readiness across all sub-systems in one view; act on gaps.
- **Must-show data from `GET /api/tenant/integration-governance/readiness` (Q-TEN10 — NOT 6+ orchestrated queries):**
  - API key readiness (count active, expiring, missing scopes)
  - Webhook endpoint readiness (count active, failure rate, engine availability)
  - Notification routing readiness (channels configured)
  - SLA profile completeness (thresholds set / unset)
  - Report availability (jobs runnable, artifacts available)
  - Module enablement (which modules turned on)
  - Partner entries readiness if any
- **Must-support actions:**
  - Quick CTAs: "Set up webhook", "Issue API key", "Configure SLA", "Configure notifications" → navigate to specific module
- **Decision points:**
  - What's blocking us from being fully ready?
- **State variants:**
  - Fully ready (all green)
  - Partial readiness (some yellow / red)
  - First-time (`not_provisioned` across the board)
- **Entry:** Sidebar, link from `/` workspace home
- **Exit:** Drill targets

---

### 5.17 `/reports` — Reports (NEW per Q-TEN02)

- **Spec ref:** §9.6.11 + workflow §9.7.8
- **Refresh tier:** T6 (manual)
- **Primary persona / roles:** `tc_finance`, `tc_admin`
- **Primary task:** Create report jobs; monitor; download artifacts.
- **Must-show data:**
  - Job list: id, type, parameters summary, status (queued / running / done / failed), createdAt, completedAt, format, artifact URL, expiresAt
  - Filter by type, status, period
- **Must-support actions:**
  - Create report job (low) — with type / period / scope params (e.g. by cost center, by passenger, by period)
  - Download artifact (low)
  - Refresh job list (low — manual per T6)
  - Re-run failed job (medium)
- **State variants:**
  - Empty `no_data`
  - Job queued / running
  - Job failed (with error reason + re-run)
  - Artifact expired
- **Entry:** Sidebar, link from `/integration-governance`
- **Exit:** Artifact download

---

### 5.18 `/audit` — Audit Trail (with cross-actor visibility per Q-TEN13)

- **Spec ref:** §9.6.12 + Q-TEN13 (cross-actor scope)
- **Refresh tier:** T6 (manual)
- **Primary persona / roles:** `tc_admin`, `tc_finance`
- **Primary task:** Investigate actions on tenant resources, regardless of actor realm.
- **Must-show data per Q-TEN13 (sensitive fields masked by policy):**
  - audit records: createdAt, **actor type chip** (`tenant` / `ops` / `platform` / `system`), actorId (masked if sensitive), moduleName, actionName, resourceType, resourceId, requestId
  - Filter by actor type, by module, by action, by time range
  - Per-record expand for detail
- **Must-support actions:**
  - Filter (low)
  - Refresh (low — manual T6)
  - Export filtered subset (low — produces signed artifact)
- **Decision points:**
  - Who did what to my data?
  - Is there an unexpected ops/platform action that needs follow-up?
- **State variants:**
  - Empty per `EmptyReason`
  - Cross-actor records (each actor type visually distinct)
  - With masked sensitive fields (clearly indicated)
- **Entry:** Sidebar; action receipt deep link from any state-changing action
- **Exit:** Resource detail (in-app for tenant resources; cross-app new tab for ops/platform-owned resources)

---

### 5.19 `/feature-flags` — Feature Visibility (NEW per Q-TEN02; read-scoped per Q-X16)

- **Spec ref:** §9.6 implied + Q-X16 per-realm filtered endpoint
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`, any tenant role for visibility
- **Primary task:** Confirm which features are on/off for THIS tenant so a perceived gap can be explained as gated rather than broken.
- **Must-show data from `GET /api/tenant/feature-flags` (Q-X16 per-realm read-scoped):**
  - flag list: flag key, current value for this tenant, scope (global default vs tenant override), last changed at, last changed by (platform user reference), description
  - Filter by scope, search by key
- **Must-support actions:** read-only
  - Search (low)
  - View change history (low)
- **State variants:**
  - With tenant overrides visible
  - Mid-rollout flags (partial value across tenants — surfaced as "rolling out")
- **Entry:** Sidebar
- **Exit:** None terminal

---

### 5.20 `/settings` — Tenant Settings

- **Spec ref:** Not in spec §9.5 (carry-over from existing implementation; see §7 open question)
- **Refresh tier:** T5
- **Primary persona / roles:** `tc_admin`
- **Primary task:** Manage tenant-level settings not covered by other modules.
- **Must-show data:** TBD — what scope does this page actually cover?
- **Open question:** does `/settings` need to be its own route, or fold into `/integration-governance` / `/billing` / `/sla` / `/users`? See §7.

---

## 6. API mapping

| Page                      | Read methods                                                                                     | Write methods                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/`                       | identity, module enablement, `getTenantIntegrationReadinessSummary` (Q-TEN10), recent updates    | (none direct)                                                                                                           |
| `/bookings`               | `listTenantBookings`                                                                             | (none direct; navigation to `/bookings/new`)                                                                            |
| `/bookings/new`           | passengers, addresses, cost centers, rules (for preview)                                         | `createTenantBooking` (uses `POST /api/tenant/bookings/commands/create` per Q-TEN04)                                    |
| `/bookings/[id]`          | booking detail with `availableActions` + `editableUntil` (Q-TEN05), audit subset                 | update command, cancel command (per Q-TEN04)                                                                            |
| `/passengers`             | passenger list (TBD)                                                                             | create, update, soft deactivate (Q-TEN06)                                                                               |
| `/addresses`              | address list (TBD)                                                                               | create, update, soft deactivate (Q-TEN06)                                                                               |
| `/users`                  | `createTenantUser` reads, role catalog                                                           | `createTenantUser`, update role, suspend                                                                                |
| `/notifications`          | subscription matrix (TBD)                                                                        | update subscriptions                                                                                                    |
| `/sla`                    | SLA profile read (TBD)                                                                           | update SLA (Q-TEN07 minutes), recalculate existing bookings (admin command)                                             |
| `/webhooks`               | webhook endpoints + delivery logs (real engine per Q-TEN08)                                      | `createWebhookEndpoint` (note "test_pending" status per existing memory), update, disable, delete, rotate secret, retry |
| `/api-keys`               | API key list with masked suffix                                                                  | issue (plaintext returned once per Q-TEN09), rotate (same), revoke                                                      |
| `/billing`                | billing profile, current period snapshot                                                         | update billing profile                                                                                                  |
| `/invoices`               | invoice list + detail                                                                            | (download artifact)                                                                                                     |
| `/cost-centers`           | cost center list with quota summary                                                              | create, update, disable, reactivate                                                                                     |
| `/rules`                  | approval rule list + dry-run evaluator                                                           | create, update, disable, reorder, dry-run                                                                               |
| `/integration-governance` | `GET /api/tenant/integration-governance/readiness` (Q-TEN10 aggregated; NOT 6+ separate queries) | (none direct; CTAs link to specific modules)                                                                            |
| `/reports`                | `listTenantReportJobs`                                                                           | `createTenantReportJob`                                                                                                 |
| `/audit`                  | `listAuditLogs` (tenant-scoped per Q-TEN13; cross-actor visibility)                              | (read-only; export)                                                                                                     |
| `/feature-flags`          | `GET /api/tenant/feature-flags` (Q-X16 per-realm read-scoped)                                    | (none — no write)                                                                                                       |
| `/settings`               | TBD                                                                                              | TBD                                                                                                                     |

Methods marked TBD need to be added to `packages/api-client/src/index.ts`. The aggregated readiness endpoint (Q-TEN10) is one of the 12 new contracts called for in answers §7.

---

## 7. Purely visual open questions

§3 covers cross-cutting; most decisions baked in. Remaining are visual / interaction / IA choices.

### 7.1 Cross-cutting (shared with ops-console and platform-admin packets)

1. Density target (compact / comfortable / spacious)
2. Stale-data visual treatment
3. Identity context chip shape (including **tenant** segment for tenant-console)
4. Health context placement (sidebar footer)
5. Degraded banner pattern
6. Empty-state illustration set per `EmptyReason`
7. Confirmation modal shape per risk tier
8. State pill color system (tenant codes: booking statuses, webhook delivery, API key state, invoice statuses, SLA thresholds, approval rule states)
9. Loading skeleton vs spinner
10. Search drawer / overlay shape
11. Notification bell + inbox panel shape
12. Cross-app deep-link affordance (especially audit cross-actor records)

### 7.2 Per-screen

13. **`/` workspace home** — tile board vs feed-style cards? What's the priority hierarchy when integration is healthy vs degraded?
14. **`/bookings`** — list density; whether to show approval-required as a separate sub-board or as a chip filter
15. **`/bookings/new`** — single-form vs multi-step wizard? Address/passenger picker shape (inline search? modal? typeahead?)
16. **`/bookings/[id]`** — page IA; how to convey `editableUntil` countdown (banner? side panel? inline?); read-only mode visual treatment
17. **`/bookings/[id]` accepted+pending state** — Q-TEN04 — how to visually convey "we received your command, awaiting external confirmation" without alarming the user
18. **`/passengers` and `/addresses`** — inline edit vs drawer vs dedicated route per record?
19. **`/notifications`** — matrix layout for event × channel grid; channel-not-provisioned visualization
20. **`/sla`** — threshold editor: sliders? number inputs? Side-by-side current vs proposed?
21. **`/webhooks`** — endpoint list density; per-endpoint delivery log expansion (inline vs drawer); failure visualization
22. **`/webhooks` `not_provisioned` state** — Q-TEN08 — when delivery engine is not active, what does the user see? Onboarding prompt? Status banner?
23. **`/api-keys`** — once-only secret modal (Q-TEN09): copy/download affordance; "I stored this key" checkbox UX
24. **`/billing`** — overview layout: KPI tiles vs current-period summary card vs both
25. **`/invoices`** — list density; detail in drawer vs new route
26. **`/cost-centers`** — list density; quota visualization (bar? gauge?); disabled visual treatment
27. **`/rules`** — rule list; dry-run evaluator UI; conflict warning UI
28. **`/integration-governance`** — readiness dashboard layout: tiles? scorecard? checklist? Each sub-system gets a state visualization (per Q-TEN10 aggregated endpoint)
29. **`/reports`** — job-creation form; status visualization for queued/running/done/failed
30. **`/audit`** — cross-actor visual distinction (chip color per realm); masked-field visual treatment
31. **`/feature-flags`** — tenant override visualization; rolling-out state
32. **`/settings`** — does it exist, or fold into other modules?

### 7.3 Shell

33. **Sidebar grouping verification.** Current 9 sections (工作面 / 訂單 / 資料維護 / 帳號與權限 / 整合 / 服務水準 / 財務 / 報表與稽核 / 系統). Visual team confirms or amends.
34. **Sidebar role-aware visibility.** `/users`, `/sla`, `/api-keys`, etc. scoped to `tc_admin`. Hide vs disable.
35. **Header search bar placement and prominence.**
36. **Avatar chip behavior.** Identity drawer? Logout? Settings? Switch tenant (for cross-tenant admin)?
37. **Tenant chip in header.** For users who manage multiple tenants, what's the switcher UX?

---

## 8. Out of scope for this packet

- Visual design choices
- `apps/partner-booking-web` (separate app per Q-TEN03; needs its own packet later when that app is in scope)
- `tenant-commute-hub` external app (out of repo; live until cutover)
- `apps/tenant-portal-web` (sunset reference shell; not a design target)
- API contract additions (engineering follow-up per answers §7)
- Implementation backlog
- Migration plan from current `tenant-console-web` partial state to designed state

---

## 9. Hand-off process

Same as previous packets. Visual team reads this + answers doc + spec §9. Flags any §7 questions; system-level questions go back to system design team. Produces IA sitemap (confirming or amending §4) + per-screen wireframes covering all state variants + component system + design tokens. Engineering picks up wireframes + tokens + §6 API mapping + new contracts (when they exist) and produces implementation backlog.

This packet is input to step 1. Not a design.
