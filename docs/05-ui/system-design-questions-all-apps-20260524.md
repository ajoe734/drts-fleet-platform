# System Design Questions — All Four Apps (DRTS Platform)

**Date:** 2026-05-24
**Apps in scope:** `ops-console-web`, `platform-admin-web`, `tenant-console-web`, `driver-app`
**Recipient team:** 系統設計規劃團隊 (含產品設計、產品規劃、系統架構)
**Status:** Open questions — answers feed back into `docs/01-product/*` and `docs/02-architecture/*`, then trigger visual design hand-off packets.
**Author lane:** Claude (`SYS-DESIGN-Q-001`)

---

## 0. Why this document exists

The product specs at `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md` (1621 lines, three admin apps) and `docs/01-product/driver-app-multi-platform-product-spec-20260507.md` (1008 lines, driver app) capture **business intent, modules, personas, data, actions, and key workflows**. They explicitly say (admin spec §14, driver spec §9) that visual design + IA + state design are to be produced separately.

While preparing the visual-design hand-off packets (one per app), it became clear that **some open questions are not visual at all** — they are product-spec gaps, system-architecture decisions, or new functional contracts the system does not yet provide. Asking the visual design team to answer them would force them to invent product / system behavior, which is out of scope for design.

This document collects those questions in one place so the system-design-planning team can resolve them in a single sweep, **before** any visual-design hand-off is started. After resolution, the answers either:

- Amend `docs/01-product/*.md` (product change), or
- Amend `docs/02-architecture/*.md` (system architecture change), or
- Become a new functional contract (new endpoints, new state machine, new event model).

Only after these are resolved do the visual-design hand-off packets get written and given to the visual design team.

**Order of operations:**

1. (now) System design team answers questions in this document
2. Resolutions land in product / architecture docs
3. Claude writes visual-design hand-off packets (4 documents, one per app), incorporating the answers
4. Visual design team produces wireframes, component system, design tokens
5. Engineering implements

**This document is not a redesign proposal.** It is a list of questions whose answers shape what gets designed.

---

## 1. Source documents

| Document                                                                                                                                                       | Role                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md](../01-product/platform-admin-ops-tenant-console-product-spec-20260508.md)         | Product spec for 3 admin apps (§7 Platform Admin / §8 Ops Console / §9 Tenant Console)      |
| [docs/01-product/driver-app-multi-platform-product-spec-20260507.md](../01-product/driver-app-multi-platform-product-spec-20260507.md)                         | Product spec for driver app + multi-platform forwarder management surfaces                  |
| [docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md](../01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md) | Tenant console productization topology decision                                             |
| [docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md](../01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md)               | UI surface topology decision                                                                |
| `apps/{ops-console-web,platform-admin-web,tenant-console-web,driver-app}/app/**`                                                                               | Current implementation surface — used to confirm "this exists today" vs "this is spec only" |
| `packages/api-client/src/index.ts`                                                                                                                             | Current method surface                                                                      |
| `packages/contracts/src/index.ts`                                                                                                                              | Current record / payload types                                                              |

---

## 2. Cross-cutting questions (affect ≥ 2 apps)

These must be resolved once and applied consistently across apps, otherwise each app will diverge and visual design will hide the divergence.

### 2.1 Realtime data model

**Q-X01.** What is the canonical realtime data model? Pick one or define per-surface:

- (a) Server push via Server-Sent Events
- (b) Server push via WebSockets
- (c) Client polling at fixed cadence
- (d) Manual refresh only
- (e) Mixed (per surface — and if so, name the rule that decides)

**Why system design:** changes the API contract, requires backend support, changes performance profile, affects every "live" surface in every app.

**Affects:** ops-console `/dashboard` `/dispatch` `/callcenter` `/incidents` `/complaints` `/approval-requests`; platform-admin `/health` `/payments` (reconciliation queue); tenant-console `/bookings` (status), `/webhooks` (delivery logs); driver-app `/jobs` `/trip` `/platform-presence`.

**Blocks visual:** stale-data treatment, refresh affordance design, banner/notification timing.

---

**Q-X02.** What is the per-surface refresh cadence target if polling is the chosen model? Need a number per "speed tier":

- (a) Driver-facing trip operation (driver-app `/trip`) — likely fastest tier
- (b) Ops dispatch board (ops-console `/dispatch`) — fast
- (c) Ops dashboard KPIs (ops-console `/dashboard`) — medium
- (d) Admin health / reconciliation (platform-admin `/health` `/payments`) — medium-slow
- (e) Tenant booking list (tenant-console `/bookings`) — slow
- (f) Reports / audit — manual refresh only?

**Why system design:** infrastructure cost, backend rate limits, defines what "now" means in the UI.

**Affects:** same surfaces as Q-X01.

---

### 2.2 Cross-app navigation

**Q-X03.** When an ops user clicks a reconciliation row in `/revenue` whose target lives in platform-admin (`/payments`), what is the cross-app mechanism?

- (a) Browser navigation to the platform-admin deployed URL with the resource ID in path/query (separate tab? same tab?)
- (b) Inline read-only embed of the reconciliation issue inside ops-console
- (c) Mirror the read-only view in ops-console with its own route
- (d) A unified shell across all admin apps so cross-app navigation is just intra-shell routing

**Why system design:** affects auth (cross-app session reuse), routing model, deployment topology, and whether new "read-only mirror" pages need to exist in non-owner apps.

**Affects:** ops-console → platform-admin (revenue ↔ reconciliation, dispatch forwarded ↔ adapter registry, dispatch override ↔ approval-requests cross-tenant); ops-console → tenant-console (tenant context lookup); platform-admin → ops-console (when admin reviewer wants to see operational impact); driver-app → none for now.

**Blocks visual:** sidebar inclusion of cross-app links, breadcrumb model across apps, identity chip behavior on cross-app jumps.

---

**Q-X04.** Is there a unified shell or are the four apps fully separate Next.js deployments? Current state: four separate apps on four different Cloud Run URLs. Decisions:

- (a) Keep four separate apps; cross-app jumps are full page loads
- (b) Mount apps as sub-paths of a single shell domain
- (c) Module federation / multi-app SPA
- (d) Mixed (e.g. admin apps unified, driver-app separate as it's React Native)

**Why system design:** architectural — affects deploy pipeline, auth session reuse, search / notification scope.

**Affects:** all four apps' shell / chrome.

---

### 2.3 Notifications & inbox

**Q-X05.** What is the platform notification model? Currently each app has a bell icon placeholder but no notification source.

- (a) Per-user inbox stored in backend, polled by each app
- (b) Push to active session (web push API, native push for driver)
- (c) Per-app local-only (each app has its own inbox semantics)
- (d) Cross-app unified inbox (one inbox spans all admin apps for the same user)
- (e) No notification model in Phase 1 — bell icon is removed

**Why system design:** new contract (no current notification record in `contracts`), affects backend, affects every app shell.

**Affects:** all four apps' shell. Driver app especially needs push for SOS / new task arrival.

---

**Q-X06.** What events constitute a notification?

- Admin app candidates: new critical incident, new SLA breach, new approval request, recon issue assigned to me, tenant rollout gate ready
- Driver app candidates: new task offered, accept-pending timeout warning, re-auth required, shift end reminder, SOS acknowledged by ops
- Tenant app candidates: booking confirmed, booking cancelled, invoice ready, webhook delivery failure

**Why system design:** defines the event taxonomy; backend must emit these.

---

### 2.4 Search

**Q-X07.** What does the header search bar search per app? Currently every app shows a search placeholder; none has a real search backend.

- ops-console: orders? drivers? vehicles? cross-entity? by what fields?
- platform-admin: tenants? partners? users? audit records?
- tenant-console: bookings? passengers? addresses?
- driver-app: tasks? not searchable?

**Why system design:** requires search backend (Elasticsearch / Postgres FTS / per-table queries), defines the data scope.

---

**Q-X08.** Should search be cross-entity (one search bar, multiple result categories) or per-page (search bar contextual to current list)?

---

### 2.5 Confirmation, audit, receipts

**Q-X09.** All state-changing actions are audit-logged per admin spec §3.3. What is the standard confirmation pattern?

- (a) Modal confirm → action → toast receipt with audit ID link
- (b) Inline confirm (action button changes to "confirm?" state) → action → toast
- (c) No-confirm for low-risk actions, modal confirm for high-risk — and if so, where is the risk classification?

**Why system design:** defines the UX-action contract, needs an audit-ID-back-to-record API surface for the receipt link.

**Affects:** every state-changing screen in every app.

---

**Q-X10.** Should the audit ID returned by a write action be exposed in the UI receipt? If yes, what does clicking it do (navigates to `/audit` filtered to that record)?

---

### 2.6 Identity / health context bar

**Q-X11.** Every app must surface "you are session X, in realm Y, as actor type Z" and "backend is healthy / degraded / down" on every screen. Where does this live structurally?

- (a) Top header chip
- (b) Bottom status bar
- (c) Sidebar footer
- (d) Combination

**Why system design:** defines the data the chrome must consume (identity, health), and where it cannot be hidden by per-page content.

---

**Q-X12.** Health-degraded state — what is the system contract for "the backend is partially down"? Today each page does its own try/catch and falls back to empty. Should there be a backend-emitted health envelope every page consumes?

---

### 2.7 Authority boundaries

**Q-X13.** UI must not surface CTAs for actions the user cannot perform (admin spec §3.5, §8.6, §9.8). Is there an authoritative "actions-I-can-do" endpoint the UI can query per session, or does each page hard-code role-to-action mapping?

**Why system design:** centralized authority vs distributed client-side enforcement is an architectural decision.

---

**Q-X14.** Does ops console get cross-tenant authority on certain actions (approval-requests is cross-tenant per its current implementation), and if so, what is the cross-tenant scope contract?

---

### 2.8 Empty / not-ready states

**Q-X15.** Empty state semantics — distinguish "no data legitimately" vs "system not yet provisioned" vs "data fetch failed":

- ops-console `/attendance` empty on a holiday vs schedule not loaded
- tenant-console `/bookings` empty for new tenant vs API misconfig
- driver-app `/jobs` empty (no work right now) vs (driver not eligible)

**Why system design:** backend must distinguish these (current `try/catch → []` collapses all three to the same state).

---

### 2.9 Feature flag visibility

**Q-X16.** Feature flags appear in three apps:

- platform-admin `/feature-flags` — write authority
- ops-console `/feature-flags` — read-only "what's on for whom"
- tenant-console `/feature-flags` — read-only "what's on for me"

What is the per-app filter contract? Does each app get a different flag-list endpoint, or one endpoint with per-actor filtering?

---

### 2.10 Internationalization

**Q-X17.** Spec says zh-TW primary, en secondary. Many domain codes (`accept_pending`, `sync_failed`, `override_pending`) are surfaced raw to users alongside Chinese labels — is that the final answer, or are these codes meant to be eventually replaced with translated labels? Affects every state-pill and filter chip.

---

## 3. Per-app questions

### 3.1 ops-console-web

#### Missing routes the spec implies but no route exists

**Q-OPS01.** `/complaints/[caseNo]` — spec §8.4.4 describes case detail (timeline, recovery, export). Current implementation has list only. Does the case-detail screen exist as its own route, or as inline panel on the list?

**Q-OPS02.** `/vehicles/[vehicleId]` — spec §8.4.10 implies detail (current driver binding, maintenance, contracts, dispatchable state). No route today. Does this screen need to exist? If yes, what is its functional scope?

**Q-OPS03.** `/contracts/[contractId]` — spec §8.4.10 implies contract detail. No route today. Same question as Q-OPS02.

#### Workflow / system contract gaps

**Q-OPS04.** Concurrent call sessions per agent — does one call-center agent handle one call at a time, or multiple simultaneously? Affects `/callcenter` IA fundamentally.

**Q-OPS05.** "Transfer to complaint" from `/callcenter` (spec §8.4.3 action) — does this synchronously create a complaint case and redirect, or queue an escalation handled async by complaint analysts?

**Q-OPS06.** "Override governance" and "No-supply" — spec §8.4.2 treats these as filter dimensions of owned dispatch; current implementation surfaces them as filter chips. Should they be first-class boards (peer of owned / forwarded) or stay as filter chips?

**Q-OPS07.** Forwarded order detail — does `/dispatch/[id]` work for forwarded orders (mirror id), or is there a separate `/forwarded-orders/[mirrorId]` flow? Spec is silent.

**Q-OPS08.** Driver "take offline per platform" (driver-spec §6.3 action) — is this an ops authority, or only available in platform-admin? Currently no UI for it anywhere.

**Q-OPS09.** Driver "suppress matching during incident" (driver-spec §6.3 action) — what is the system contract? Time-bound? Until incident closes? Manual reset?

**Q-OPS10.** Cross-tenant approval queue — `/approval-requests` is cross-tenant by current implementation. Is this a separate ops authority (only some ops users), or every ops user sees all tenants' approval queues?

**Q-OPS11.** Phone booking creation (spec §8.4.3 action `create phone booking`) — does the call-center agent reuse the tenant booking creation flow, or is there a separate ops-side order creation endpoint with different validation?

**Q-OPS12.** Recording / callback attach model — recordings exist as separate records; when does an ops agent "attach" them and when do they auto-attach? Affects `/callcenter` workflow design.

**Q-OPS13.** SLA breach for complaints — is "SLA breach" computed backend (with a watermark on the case record) or computed client-side from createdAt + threshold? Affects whether the filter chip "SLA breach" is reliable across users.

**Q-OPS14.** Mismatch detail in revenue — when an ops financial reviewer clicks a mismatch, what surfaces? See Q-X03 cross-app navigation.

---

### 3.2 platform-admin-web

#### Route inconsistencies between spec and implementation

**Q-ADM01.** Implementation has `/tenant-governance` AND `/tenants` AND `/tenants/[id]` routes; spec §7.3 only lists `/tenants`. What does `/tenant-governance` cover that `/tenants` doesn't? Should they be one route?

**Q-ADM02.** Spec §7.4.12 groups "Feature Flags & Adapter Registry" as one module but implementation splits them into `/feature-flags` and `/adapter-registry`. Keep split or unify?

**Q-ADM03.** Spec §7.4.10 groups "Notices & Maintenance"; implementation has only `/notices`. Where does maintenance-mode toggle live? Inside `/notices` or its own route?

**Q-ADM04.** `/switchboard` route covers spec §7.4.6 "Public Info & Placard Governance" — does the name "switchboard" stay, or rename to match the spec module name?

#### Workflow / system contract gaps

**Q-ADM05.** Tenant rollout gate state machine — spec §7.4.2 lists `pending / ready / approved / blocked` for gates, and tenant statuses `sandbox / pilot / production / rollback_hold`. Is there a single state-diagram-as-source-of-truth doc (architecture or domain doc)? Visual design needs the full state list.

**Q-ADM06.** Cutover owner / rollback owner — spec §7.4.2 names these roles. Are they user records (links to /users), free-text fields, or roles assigned via a separate workflow?

**Q-ADM07.** Partner entry credentials (`issue / revoke` per spec §7.4.3) — does issuing a credential return the secret to the admin once (for hand-off to partner), or is it sent to partner via separate channel? Affects UI: secret-display modal vs no-secret-shown.

**Q-ADM08.** Driver exclusivity review (spec §7.4.5 action `submit / approve / reject exclusivity`) — what is the trigger (admin creates a review? or driver-submitted via some channel?), and what is the queue location? `/fleet` covers vehicles + drivers + contracts; is exclusivity inside `/fleet` or its own queue?

**Q-ADM09.** Driver / vehicle offboarding workflow (`initiate offboarding`, `complete debranding` per spec §7.4.5) — multi-step? Single form? Is there a state machine for offboarding?

**Q-ADM10.** Pricing rule publish (spec §7.4.7 action `publish pricing rule`) — does publish replace prior version atomically, or co-exist (draft / published / retired versions)? Affects whether `/pricing` lists versions or just the active one.

**Q-ADM11.** Driver fee plan vs pricing rule — same module per spec §7.4.7 — are they sibling concepts on `/pricing` or do they need separate UI affordance?

**Q-ADM12.** Reimbursement batch flow (spec §7.4.8 actions `approve reimbursement batch`, `mark reimbursement paid`) — is there a queue, a batch detail page, an export step? Spec implies workflow but no batch route exists.

**Q-ADM13.** Reconciliation issue ownership — spec §7.4.8 says owner is assigned. Owner can be ops, finance, or admin. Where does the issue live: `/payments` (admin) or cross-app under ops? See Q-X03.

**Q-ADM14.** Public info versioning vs placard generation (spec §7.4.6) — is placard generation 1-to-1 with a public info version, or many-to-1? Affects route nesting.

**Q-ADM15.** Notice severity model (spec §7.4.10) — does a critical notice push to other apps (cross-app banner in ops-console / tenant-console)? Currently no such mechanism.

**Q-ADM16.** Legal hold and deletion exception (spec §7.4.11) — admin can grant these; how does the audit trail UI surface that a record is held vs deletable? Is "hold" a record state visible in the audit list?

**Q-ADM17.** Adapter registry — spec §7.4.12 says "編輯 adapter" but does not say what's editable at admin level vs ops level (per driver-spec §6.4 ops can also act on adapters). Decide the write-authority split.

---

### 3.3 tenant-console-web

#### Massive topology question first

**Q-TEN01.** **Most important.** Spec §9.2 says "live production tenant UI 目前仍是外部 `tenant-commute-hub`" and "本 repo 的正式 tenant-console landing zone 是規劃中的 `apps/tenant-console-web`". Current state:

- `tenant-commute-hub` is external (out of repo, Lovable-built per project memory)
- `apps/tenant-portal-web` exists in repo and has more spec'd pages (addresses, billing, booking-list, feature-flags, notifications, reports, sla) but is marked "sunset reference shell"
- `apps/tenant-console-web` exists in repo with a partial route set (bookings, passengers, users, webhooks, api-keys, cost-centers, rules, settings, audit, invoices, partner) — missing many spec'd pages
- Spec §9.5 lists 15 routes that should exist

What is the canonical migration plan?

- (a) `tenant-console-web` becomes canonical, port missing routes from `tenant-portal-web`, retire external hub
- (b) `tenant-console-web` is a subset (admin only), tenant-commute-hub stays for operator daily use
- (c) Other

Visual design cannot start on tenant-console until this is resolved.

#### Missing routes the spec demands

**Q-TEN02.** Routes missing in current `apps/tenant-console-web` that spec §9.5 demands: `/addresses`, `/sla`, `/notifications`, `/reports`, `/feature-flags`, `/integration-governance`, `/billing` (current implementation has `/invoices` which may or may not match), `/bookings/new` (separate route or modal?). For each: ship it in tenant-console-web, or rely on external hub?

#### Mode and route group questions

**Q-TEN03.** Partner Booking Mode vs Tenant Admin Mode (spec §9.4) live in the same Next.js app but must have a strict nav boundary. Mechanism:

- (a) Next.js route groups (`(admin)` vs `(partner)`) + middleware
- (b) Subdomain split (`tenant.x.com` vs `partner.x.com`)
- (c) Different app entirely (move partner mode out of tenant-console)
- (d) Other

#### Workflow / system contract gaps

**Q-TEN04.** Booking command vs direct REST — spec §9.6.2 says "狀態變更只能透過 command endpoint". Is the create / update / cancel API a true command-bus pattern (queue + async result), or just synchronous endpoints? Affects whether the booking-creation UI shows a "pending command" state.

**Q-TEN05.** "已進入不可編輯狀態的 booking 應切換為唯讀追蹤" — what is the rule? Backend-flagged on the booking record, or client-derived from status? If client-derived, what are the editable-vs-readonly statuses?

**Q-TEN06.** Passenger / address `deactivate / delete by allowed command semantics` (spec §9.6.3, §9.6.4) — what does the command semantics actually look like? Soft delete? Tombstone? Cascade rules?

**Q-TEN07.** SLA profile threshold semantics — wait / arrival / completion thresholds (§9.6.7) are tenant-controlled. What is the unit (minutes? seconds?), and what happens to in-flight bookings when threshold changes?

**Q-TEN08.** Webhook delivery log — spec §9.6.8 says "delivery log 可先是 visibility layer，但最終應對齊真實 delivery engine". What's the Phase-1 commitment? Mock visibility or real engine?

**Q-TEN09.** API key issuance — when issuing, when is the full key shown to the admin? Once at creation? Never? If once, what's the modal / download model?

**Q-TEN10.** Integration Governance aggregation (spec §9.6.13, "recommended new page") — is there an aggregated readiness endpoint, or must the UI individually query API key + webhook + notification + SLA + report + module enablement? If individual, the UI orchestrates 6+ parallel queries — performance / UX question.

**Q-TEN11.** Cost centers route exists in implementation (`/cost-centers`) but spec doesn't mention. What does it cover and which spec module does it map to?

**Q-TEN12.** `/rules` route exists in implementation, not in spec §9.5. What does it cover?

**Q-TEN13.** Tenant audit visibility scope (spec §9.6.12) — backend filters audit list to "tenant's own scope"; what is "own scope" — only actions where actorId matches a tenant user, or also actions by ops/admin on tenant's data?

---

### 3.4 driver-app

#### Forwarded order operations

**Q-DRV01.** Forwarded order accept / reject relay (spec §5.4, §5.5, driver-spec §4.1) — for which external platforms is the relay actually supported? Spec §4.2 lists adapter endpoints exist; production readiness per platform unspecified. Until adapter is production-ready per platform, what does the driver UI show? Accept button disabled with reason? Hidden?

**Q-DRV02.** "Accept-pending" race state — what is the timeout? What does the driver see when timeout hits without confirmation? Auto-revert? Manual cancel button?

**Q-DRV03.** "Lost race" vs "Cancelled by platform" — driver-safe copy needed. Are these distinct states with different actions, or just informational terminal states?

**Q-DRV04.** Manual fallback — driver-spec §5.5 says show "派車台正在處理平台同步，請依派車台指示操作。" Is this purely a label, or does the driver app receive an ops-issued instruction (push notification, in-app message) that's the actual instruction?

#### Platform binding & auth

**Q-DRV05.** Re-authentication flow per platform — OAuth handoff in a native app. What is the mechanism?

- (a) In-app webview to platform's OAuth
- (b) Deep link out to platform's native app
- (c) Manual credential re-entry
  Different platforms may need different mechanisms. Spec §5.10 says "re-auth from settings or platform presence" but not the mechanism.

**Q-DRV06.** Platform account bind / unbind — admin-side or driver-side authority? Spec §5.10 says "bind/unbind where allowed". Who decides "where allowed"?

**Q-DRV07.** "Eligibility per service bucket" per platform (spec §6.3 driver-spec) — what determines eligibility (admin config, driver attributes, certifications)? Affects what driver sees and what ops can change.

#### Shift, attendance, offline operation

**Q-DRV08.** Shift state affects platform availability (spec §5.8) — automatically off all platforms when clocked-out? Configurable per platform? Or does the driver explicitly take each platform offline?

**Q-DRV09.** Odometer validation — spec §5.8 says "integer only". Is there an upper-bound sanity check? Required-vs-optional? Affects clock-in/out form.

**Q-DRV10.** Offline operation / replay — driver-spec §5.5 mentions "preserve pending completion replay". What is the offline model?

- (a) Optimistic local action, replay on reconnect
- (b) Block actions when offline
- (c) Partial — proof upload deferred, status changes blocked

#### SOS

**Q-DRV11.** Two-step SOS confirmation (spec §5.9) — what specifically is the two-step? "Press and hold" vs "modal confirm" vs "slider"? Could go either system or visual; goes here because the underlying contract (what counts as confirmed) is a product decision.

**Q-DRV12.** SOS ACK back to driver — when ops acknowledges, does the driver get a push notification, in-app banner, both? See Q-X05.

#### Settings

**Q-DRV13.** Auto-accept — spec §5.10 says "should clarify whether they apply globally or per platform". The decision is global vs per-platform; this is a product decision before any UI.

**Q-DRV14.** Preference: max accept radius — unit (km / mi)? Default? Per-platform or global?

---

## 4. How to answer

For each question, the answer goes back into one of:

| Question type                                   | Answer destination                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Product behavior change                         | Amend the relevant spec section in `docs/01-product/*.md`                                                    |
| Architecture / cross-cutting infrastructure     | New or amended doc in `docs/02-architecture/*.md` (e.g. `realtime-data-model.md`, `cross-app-navigation.md`) |
| New functional contract                         | Spec section + new contract entries in `packages/contracts/src/` (eventual implementation)                   |
| Resolved via current implementation (no change) | A short reply in this document's "Resolved" appendix below                                                   |
| Defer to a later phase (decision-not-yet)       | A short reply in this document's "Deferred" appendix below, with target phase                                |

When answering, please use the question ID (Q-X01, Q-OPS04, Q-TEN02, etc.) so the visual-design hand-off packets can reference the resolution.

---

## 5. What gets unblocked once answered

Once §2 + §3 are resolved, four visual-design hand-off packets are written:

| Packet                                      | Blocked-by section                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ops-console-design-handoff-packet-*.md`    | §2 all + §3.1 all                                                                                                 |
| `platform-admin-design-handoff-packet-*.md` | §2 all + §3.2 all                                                                                                 |
| `tenant-console-design-handoff-packet-*.md` | §2 all + §3.3 all (**§3.3 Q-TEN01 is hardest blocker** — without canonical app decision, no visual design starts) |
| `driver-app-design-handoff-packet-*.md`     | §2 all + §3.4 all                                                                                                 |

Each packet will include sitemap, per-page functional brief (persona / task / data / actions / states / nav), API mapping, and any remaining purely-visual open questions — for the visual design team to consume and produce wireframes + component system + design tokens.

---

## 6. Out of scope for this document

- Visual design choices
- Implementation backlog
- Wireframes, comps, design tokens
- Color, typography, spacing, density decisions
- Component system specifics

These are all downstream of the answers in §2 and §3.

---

## 7. Appendix — Resolved (to be filled by system design team)

> Move questions here when the answer is "current implementation is correct" or "no change needed", with a one-line rationale.

(empty)

## 8. Appendix — Deferred (to be filled by system design team)

> Move questions here when the answer is "decide later", with target phase / quarter / wave.

(empty)
