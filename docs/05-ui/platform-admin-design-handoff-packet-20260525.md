# Platform Admin — Visual Design Hand-off Packet

**Date:** 2026-05-25
**App:** `apps/platform-admin-web`
**Recipient team:** 視覺設計團隊 (含 UX)
**Status:** Hand-off input. **No visual decisions in this document.**
**Author lane:** Claude (`ADM-DH-PKT-002`)
**Predecessors:**

- [`system-design-questions-all-apps-20260524.md`](./system-design-questions-all-apps-20260524.md)
- [`system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md) — **authority**
- [`ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md) — companion packet; §3 operating context is shared (with admin-specific tier)

> **🎨 2026-05-25 update — visual design has landed.**
> The visual design team produced [`drts-design-canvas/`](./drts-design-canvas/) v0.6 against this packet + the system design answers. The visual specification for Platform Admin screens is now [`drts-design-canvas/Platform Admin.html`](./drts-design-canvas/Platform%20Admin.html) (indigo accent, 18 routes including the new reimbursement state-machine queue, multi-tab fleet/pricing/notices, legal-hold + deletion-exception badges, and the plaintext-once secret modal). Many of the §7 purely-visual open questions below are now answered by the canvas — see §7 inline annotations. The implementation lane that picks up `apps/platform-admin-web` should treat the canvas as authority for visual decisions, and this packet as authority for behavior / data / API contracts.

---

## 0. How to read this document

Same shape as the ops-console packet. This document captures every Platform Admin screen at the level a visual designer needs to begin producing wireframes / IA / component system / design tokens. It does **not** contain visual decisions.

What it **does** contain: §2 personas + role codes, §3 operating context, §4 sitemap, §5 per-page functional briefs, §6 API mapping, §7 purely visual open questions.

What it **does NOT** contain: wireframes, comps, layout, grid, spacing, color, typography, iconography, density, component system, design tokens.

If the visual team hits product / system / contract ambiguity: treat as either a miss in answers (flag back) or a purely visual question (resolve in design team; add to §7 if generally applicable). Never invent backend behavior.

---

## 1. Source documents

| Document                                                                                                                                             | Role                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [system-design-answers-all-apps-20260524.md](./system-design-answers-all-apps-20260524.md)                                                           | **Authority.** Every decision binding.                                                                                      |
| [01-product/platform-admin-ops-tenant-console-product-spec-20260508.md §7](../01-product/platform-admin-ops-tenant-console-product-spec-20260508.md) | Platform Admin business intent: §7.1 goal, §7.2 personas, §7.3 route map, §7.4 module specs, §7.5 workflows, §7.6 non-goals |
| [01-product/driver-app-multi-platform-product-spec-20260507.md §6.4 – §6.5](../01-product/driver-app-multi-platform-product-spec-20260507.md)        | Platform Admin adapter registry + finance/reconciliation extensions for multi-platform                                      |
| `apps/platform-admin-web/app/**/page.tsx`                                                                                                            | Current route surface — used to confirm what exists today, not to constrain design                                          |
| `packages/api-client/src/index.ts`                                                                                                                   | Available method surface                                                                                                    |
| `packages/contracts/src/index.ts`                                                                                                                    | Record / payload types                                                                                                      |

When this packet and a source document disagree, the source document wins.

---

## 2. Personas

From spec §7.2, with role codes consistent with the authority scoping pattern established in ops-console packet §2 (driven by backend `availableActions` per Q-X13).

| Persona                                 | Primary concerns                                                            | Role code         | Primary screens                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| 平台超管 (Super admin)                  | 全域權限、帳號、feature switch、敏感操作                                    | `pa_super_admin`  | All screens with full authority                                                      |
| 租戶開通經理 (Tenant onboarding)        | tenant 開通、rollout gate、integration package                              | `pa_tenant_mgr`   | `/tenants`, `/tenants/[id]`, `/tenant-governance`                                    |
| 合作夥伴治理經理 (Partner governance)   | partner entry、credential、eligibility mode、branding                       | `pa_partner_mgr`  | `/partners`, `/partners/[entrySlug]`, `/adapter-registry` (read)                     |
| 法遵 / 車隊治理 (Fleet compliance)      | 車輛、司機、保險、exclusivity、offboarding                                  | `pa_fleet_gov`    | `/fleet`                                                                             |
| 平台財務治理 (Platform finance)         | pricing rule、fee plan、invoice / statement / reimbursement、reconciliation | `pa_finance_gov`  | `/pricing`, `/payments`, `/payments/reimbursements`, `/payments/reimbursements/[id]` |
| 平台維運 / 風險治理 (Platform ops/risk) | notice、maintenance mode、health、audit、evidence governance                | `pa_ops_risk_gov` | `/notices`, `/health`, `/audit`, `/adapter-registry` (operational pause)             |

`pa_super_admin` is a superset; everything is available. The other five roles are scoped per spec §7.6 non-goals. **The visual must NOT hard-code which CTAs appear per role.** CTAs come from `availableActions` per resource (Q-X13).

Cross-app authority note (per Q-X14): some platform-admin actions are companion to ops-console roles. For example `pa_ops_risk_gov` can read what `ops_compliance` produces in audit; `pa_finance_gov` owns reconciliation issue mutation that `ops_finance_reviewer` only mirrors. This is the design's reason to make cross-app deep links (per Q-X03) first-class.

---

## 3. Operating context (binding on every screen)

Same shape as ops-console packet §3 — pulled from system design answers §1. Repeated here so this packet stands alone for the visual team.

### 3.1 Locale (Q-X17)

zh-TW primary, en secondary. Domain codes only via translation maps; never as primary user-facing label. Note: many platform-admin state codes (`sandbox`, `pilot`, `production`, `rollback_hold`, `pending`, `ready`, `approved`, `blocked`, `draft`, `published`, `retired`, `initiated`, `dispatch_disabled`, `debranding_pending`, `debranding_verified`, `completed`) need translated labels.

### 3.2 Refresh model (Q-X01, Q-X02)

Tiered polling + cross-app notifications. Platform Admin surfaces are mostly medium-slow:

| Tier                     | Cadence | Where it applies in platform-admin                                                                                                                                                                                                                                              |
| ------------------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T4 Admin medium-slow** |     30s | `/health`, `/payments`, `/payments/reimbursements`, `/payments/reimbursements/[id]`, `/adapter-registry`, `/tenants`, `/tenants/[id]`, `/tenant-governance`, `/partners`, `/partners/[entrySlug]`, `/users`, `/fleet`, `/pricing`, `/notices`, `/switchboard`, `/feature-flags` |
| **T6 Manual**            |  manual | `/audit`                                                                                                                                                                                                                                                                        |

Every list/detail response includes `UiRefreshMetadata`. Stale affordance and refresh affordance required on every live surface; visual treatment is design's call.

### 3.3 Identity / health context bar (Q-X11, Q-X12)

Every screen surfaces:

- **Top header chip:** actor / realm / environment (e.g. `platform / production / SA-01`)
- **Sidebar footer:** API health (`healthy` / `degraded` / `down`) + `lastCheckedAt` from `UiHealthEnvelope`
- **Page content top:** degraded banner _only when_ a page-critical dependency is degraded (per page; see each brief)

`UiHealthEnvelope` is backend-emitted; designer doesn't compute.

### 3.4 Confirmation pattern (Q-X09, Q-X10)

Risk-classified (binding on every CTA via `ResourceActionDescriptor.riskLevel`):

| Risk       | Pattern                                                                       | Examples in platform-admin                                                                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Low**    | direct action + toast receipt with audit reference                            | refresh, filter, search, mark notification read                                                                                                                                                                                                                                                             |
| **Medium** | modal confirm + toast receipt with audit reference                            | create tenant, edit tenant settings, invite tenant role, activate tenant, create partner entry, edit pricing draft, create notice, enable adapter, approve reimbursement batch                                                                                                                              |
| **High**   | modal confirm + **required reason text** + toast receipt with audit reference | enter rollback hold, suspend tenant, revoke partner credential, **publish pricing rule**, **publish driver fee plan**, force suspend, mark reimbursement paid, set maintenance mode, grant legal hold, grant deletion exception, disable adapter for a production tenant, revoke partner ingress credential |

Designer chooses confirmation modal visuals; `riskLevel` and `requiresReason` come from backend. Action receipts include `auditId`; if user has audit read scope, surface "View audit" link to `/audit?auditId=<id>`.

### 3.5 Authority boundaries (Q-X13)

CTA visibility comes from `data.availableActions[]` per resource — NOT hard-coded by role. Each descriptor:

```ts
{
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
}
```

A row with 0 available actions is read-only. Visual must convey "you can see this but can't act" cleanly (no dead disabled buttons everywhere).

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

Each list response with 0 items returns `{ emptyState: { reason, messageCode, nextAction? } }`. Six distinct treatments required.

### 3.7 Audit (admin spec §3.3 + Q-ADM16)

Every state-changing action is audit-logged. **Additionally, platform-admin has two evidence-governance states** that decorate audit and resource rows (Q-ADM16):

- **legal hold badge** — record cannot be deleted; held by `pa_super_admin` or `pa_ops_risk_gov`
- **deletion exception badge** — record exempted from normal retention rules

Both must be visible in audit list and on resource detail screens. Hold owner and hold expiry (if any) must be available.

### 3.8 Search (Q-X07)

Header search is app-scoped cross-entity. Platform Admin searches across: tenants, partners, users, adapter registry entries, audit events. Results grouped by category. Per-page filters remain on list pages.

### 3.9 Notifications (Q-X05, Q-X06)

Backend per-user inbox + bell icon. Platform-admin-relevant events:

```text
adapter.health.degraded
tenant.rollout_gate.ready
tenant.rollback_hold.enabled
reconciliation_issue.assigned    (when assigned to a pa_finance_gov user)
incident.critical.created        (when impacting platform integrity)
```

Note Q-ADM15: **critical notices** the platform admin publishes can push cross-app banners to ops/tenant/driver via the notification model. The publish flow on `/notices` is the producer; downstream apps consume.

### 3.10 Cross-app navigation (Q-X03)

Deep links to other apps open in **new tab** by default. Platform-admin cross-app targets:

- `/tenants/[id]` operational view → ops-console deep link (e.g. tenant's dispatch board context) — new tab
- `/payments` reconciliation issue detail ← cross-app target from ops-console `/revenue` (drawer) — platform-admin owns the mutation
- `/adapter-registry` adapter inspection ← cross-app target from ops-console `/dispatch` forwarded board — new tab from ops
- `/audit` filtered to a specific resource ← cross-app target from any app's action receipt

---

## 4. Sitemap

### 4.1 Top-level structure

Six sections, 17 routes (existing routes preserved per Q-ADM01-04; `/payments/reimbursements/[batchId]` is new per Q-ADM12).

```
工作面 (Workspace)
└── /                                平台首頁         Home / module entry (TBD whether redirect to a default)

租戶治理 (Tenant Governance)
├── /tenants                         租戶            Tenant lifecycle, modules, rollout, onboarding (per spec §7.4.2)
│   └── /tenants/[tenantId]          租戶詳情         Tenant detail / rollout workflow
└── /tenant-governance               跨租戶治理       Cross-tenant governance dashboard (Q-ADM01) — quota, approvals, cost-center health, governance risk

合作夥伴治理 (Partner Governance)
├── /partners                        合作夥伴         Partner entry list
└── /partners/[entrySlug]            合作夥伴詳情     Partner entry detail (with credential issuance modal — Q-ADM07)

人員與車隊 (People & Fleet)
├── /users                           平台人員         Platform users (spec §7.4.4)
└── /fleet                           車隊與法遵       Vehicles + drivers + contracts + device binding + **Exclusivity Reviews tab** (Q-ADM08) + **Offboarding state-machine tab** (Q-ADM09)

平台與商務 (Platform & Commerce)
├── /switchboard                     公開資訊/車牌    Public Info & Placards (UI label per Q-ADM04; route name preserved)
├── /pricing                         費率治理         Pricing rules + driver fee plans + subsidy rules + version history (Q-ADM10, Q-ADM11)
├── /payments                        結算與帳務       Tenant invoices, driver statements, reconciliation issues (write authority; ops mirrors read-only per Q-OPS14/Q-ADM13)
│   └── /payments/reimbursements     代墊批次         Reimbursement batch queue (NEW per Q-ADM12)
│       └── /payments/reimbursements/[batchId]   批次詳情   Reimbursement batch detail (NEW per Q-ADM12)
└── /adapter-registry                平台 Adapter     External platform adapter registry; config/credential writes here, ops gets operational pause/retry (Q-ADM17)

平台維運 (Platform Ops & Risk)
├── /health                          平台健康         Platform alerts, dispatch lag metrics, webhook queue, adapter health
├── /notices                         公告與維護       Notices + **Maintenance Mode tab** + **Broadcast History tab** (Q-ADM03)
├── /audit                           稽核與證據       Audit log with legal hold + deletion exception badges (Q-ADM16)
└── /feature-flags                   功能旗標         Feature flags write authority (Q-ADM02; ops + tenant + driver get scoped read endpoints per Q-X16)
```

### 4.2 Inter-page navigation flows

First-class transitions:

- `/` (home) → any module (decide redirect vs landing tile board — §7)
- `/tenants` row → `/tenants/[tenantId]`
- `/tenants/[tenantId]` "rollout gate ready" notification → directly to gate-approval action on this page
- `/tenants/[tenantId]` partner-related → `/partners` filtered or `/partners/[entrySlug]`
- `/tenants/[tenantId]` operational impact → ops-console deep link (new tab)
- `/tenant-governance` cross-tenant aggregated views → drill to `/tenants/[id]`, `/payments`, `/audit`
- `/partners/[entrySlug]` "issue credential" → modal (Q-ADM07; secret shown once)
- `/partners/[entrySlug]` adapter linkage → `/adapter-registry` filtered
- `/fleet` exclusivity row → exclusivity-review tab within `/fleet` (Q-ADM08)
- `/fleet` offboarding row → offboarding state-machine workflow within `/fleet` (Q-ADM09)
- `/switchboard` "generate placard" → placard generation action (1 public info → many placards per Q-ADM14)
- `/pricing` publish → publish modal (high-risk, requires reason; atomic version-replace per Q-ADM10)
- `/payments` reconciliation issue row → reconciliation detail (with cross-app receipt to ops if owner is ops_finance_reviewer)
- `/payments/reimbursements` → batch list with state queue per Q-ADM12
- `/payments/reimbursements/[batchId]` → batch detail; status flow (draft → pending_approval → approved → exported → paid → reconciled)
- `/health` adapter degraded → `/adapter-registry` filtered
- `/notices` create critical notice → cross-app banner push to selected audiences (Q-ADM15)
- `/notices` Maintenance Mode tab → set maintenance mode (high-risk)
- `/audit` row → resource detail (in-app if platform resource; cross-app new tab if owner is another app)
- `/audit` legal hold action → hold modal (high-risk; reason required)
- `/feature-flags` toggle → audit + downstream impact warning

---

## 5. Per-page functional briefs

Schema per page (same as ops-console packet §5): spec ref / refresh tier / primary persona / primary task / must-show data / must-support actions (driven by `availableActions`) / decision points / state variants / entry-exit.

---

### 5.1 `/` — Platform Home

- **Spec ref:** §7.4.1
- **Refresh tier:** T4 (or T6 if no live KPIs)
- **Primary persona / roles:** all platform users at session start
- **Primary task:** Get to my work area, or see a high-level summary of platform governance status.
- **Must-show data:** module cards / quick links per spec §7.4.1; environment chip; multi-language switch
- **Must-support actions:** navigate to module
- **State variants:** loading; degraded; per-role visible module set
- **Entry / exit:** session start landing → any module

Open question: redirect `/` → `/tenants` (most common entry) vs landing tile board? §7.

---

### 5.2 `/tenants` — Tenant List

- **Spec ref:** §7.4.2; workflow §7.5.1
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_tenant_mgr`, `pa_super_admin`
- **Primary task:** Find a tenant, see lifecycle stage at a glance, jump to detail.
- **Must-show data:**
  - tenant name / code / status
  - enabled modules summary
  - integration mode
  - rollout stage (`sandbox` / `pilot` / `production` / `rollback_hold`)
  - rollout gate status (`pending` / `ready` / `approved` / `blocked`) — per Q-ADM05 single source of truth
  - cutover owner + rollback owner (linked user records per Q-ADM06)
  - last activity
- **Must-support actions** per `availableActions`:
  - Create tenant (medium)
  - Filter by status, rollout stage
  - Search by name / code
- **Decision points:**
  - Triage: which tenant needs attention (rollout blocked, rollback hold, etc.)
- **State variants:**
  - Empty `no_data` (no tenants yet) vs `permission_denied`
  - Rollback-hold cluster (visual urgency)
- **Entry:** Sidebar
- **Exit:** `/tenants/[tenantId]`

---

### 5.3 `/tenants/[tenantId]` — Tenant Detail / Lifecycle Workspace

- **Spec ref:** §7.4.2 + §7.5.1 full provisioning workflow
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_tenant_mgr`, `pa_super_admin`
- **Primary task:** Drive this tenant from sandbox → pilot → production safely, including role invitations, gate sign-offs, and rollback if needed.
- **Must-show data:**
  - tenant identity (name, code, bootstrap admin email, billing baseline, webhook baseline)
  - enabled modules, quotas
  - integration mode, sandbox + production URLs
  - rollout stage + gate status (Q-ADM05)
  - cutover owner / rollback owner (Q-ADM06 — user record references with displayName snapshot)
  - required role invitations + acknowledgement status
  - rollback prepared flag
  - recent activity (audit subset)
  - linked partner entries (if any)
- **Must-support actions** per `availableActions`:
  - Update settings (medium)
  - Update onboarding package (medium)
  - Invite tenant role (medium)
  - Acknowledge tenant role (medium — by the invited role holder)
  - Set rollout stage (medium → high depending on target; promotion to `production` requires `rollbackPrepared`)
  - Activate (medium)
  - Suspend (high — requires reason)
  - Enter rollback hold (high — requires reason)
- **Decision points:**
  - Is this tenant ready for promotion?
  - Should we enter rollback hold given current incident state?
  - Cross-app: do I need to look at ops-console operational state for this tenant before acting? (Q-X03 — new-tab deep link)
- **State variants:**
  - Tenant not found
  - In each rollout stage (4 visual states)
  - With pending gate vs ready gate vs blocked gate
  - In rollback hold (page chrome conveys)
  - With unacknowledged required role invitations
  - Closed / archived (read-only)
- **Entry:** Row on `/tenants`, notification `tenant.rollout_gate.ready`
- **Exit:** Linked partners, cross-app deep link to ops view, back to list

---

### 5.4 `/tenant-governance` — Cross-tenant Governance Dashboard (per Q-ADM01)

- **Spec ref:** decision Q-ADM01 (separate from `/tenants`)
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_tenant_mgr`, `pa_finance_gov`, `pa_super_admin`
- **Primary task:** See aggregated cross-tenant governance signal — quota usage, approval backlog, cost-center health, governance risk.
- **Must-show data:**
  - Tenant quota summary (per tenant: used / threshold; cross-tenant aggregate)
  - Approval backlog (cross-tenant approval requests queue depth, by type)
  - Cost-center health (linked to tenant-console cost-center module reads)
  - Governance risk signals (rollback-hold count, blocked-gate count, expired credentials, expiring contracts)
- **Must-support actions:**
  - Filter by risk type
  - Drill to `/tenants/[id]`, `/payments`, `/audit`
- **Decision points:**
  - Where to spend governance attention next
  - Whether a tenant-level issue is systemic vs isolated
- **State variants:**
  - All-clear
  - Quota threshold warning across N tenants
  - Backlog spike
- **Entry:** Sidebar
- **Exit:** Drill targets

---

### 5.5 `/partners` — Partner Entry List

- **Spec ref:** §7.4.3
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_partner_mgr`, `pa_super_admin`
- **Primary task:** Find a partner entry, see its readiness and operating status.
- **Must-show data:**
  - tenantId, partner code / type, program id / code, bank code
  - entry slug, display name
  - business dispatch subtype
  - auth mode, eligibility mode
  - entry host / path
  - status
  - readiness indicators (credential status, webhook readiness)
- **Must-support actions:**
  - Create entry (medium)
  - Filter by tenant, status, type
  - Search
- **State variants:**
  - Inactive entries highlighted as risk (spec §7.4.3: inactive entry must not serve)
  - Credential-expiring entries highlighted
- **Entry:** Sidebar
- **Exit:** `/partners/[entrySlug]`

---

### 5.6 `/partners/[entrySlug]` — Partner Entry Detail

- **Spec ref:** §7.4.3 + workflow §7.5.2
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_partner_mgr`, `pa_super_admin`
- **Primary task:** Configure this partner entry end-to-end, including credential issuance and activation.
- **Must-show data:**
  - All fields from §7.4.3 (tenantId, partner code, program id, bank code, slug, display name, subtype, auth mode, eligibility mode, entry host/path, theme accent, support contact, status, readiness indicators)
  - Ingress credentials state (masked suffix, expiry, last rotation)
  - Webhook configuration linkage
  - Adapter linkage to `/adapter-registry` if applicable
- **Must-support actions** per `availableActions`:
  - Edit entry (medium)
  - Activate / deactivate (medium → high depending on production traffic)
  - Issue credential (high) — **plaintext secret shown once in modal** per Q-ADM07; modal requires "I stored this key" confirmation; admin must copy or download `.txt`
  - Rotate credential (high)
  - Revoke credential (high — requires reason)
  - View readiness gaps
- **Decision points:**
  - Is this entry ready to activate?
  - Should rotation precede activation or follow?
- **State variants:**
  - Entry not found
  - Sandbox vs production
  - Credential missing / expiring / active
  - Credential just-issued (secret available in modal — designer must handle modal-on-load)
- **Entry:** Row on `/partners`, credential expiry warning notification
- **Exit:** Back to list; cross-app to tenant deep link if relevant

---

### 5.7 `/users` — Platform Users

- **Spec ref:** §7.4.4
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_super_admin`
- **Primary task:** Manage platform internal users and their roles.
- **Must-show data:**
  - user id, display name, email, role code, status, updated time
- **Must-support actions** per `availableActions`:
  - Create staff user (medium)
  - Update role (medium)
  - Suspend / reactivate (high — requires reason)
- **State variants:**
  - Empty
  - Pending invitation
  - Suspended (visible)
- **Entry:** Sidebar
- **Exit:** None (terminal screen for v1)

---

### 5.8 `/fleet` — Fleet & Compliance Governance

This is a multi-tab page covering several spec sub-domains.

- **Spec ref:** §7.4.5 + workflow §7.5.3 + Q-ADM08 exclusivity tab + Q-ADM09 offboarding state machine
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_fleet_gov`, `pa_super_admin`

#### 5.8.A Tabs

```
/fleet
├── Vehicles
├── Drivers
├── Contracts
├── Device Binding
├── Exclusivity Reviews      (Q-ADM08)
└── Offboarding              (Q-ADM09 — state machine workflow)
```

#### 5.8.B Per-tab must-show data + actions

**Vehicles**:

- registry list with id, plate, type, regulatory profile, insurance expiry, dispatchable flag, current driver binding, compliance status
- actions: update vehicle compliance (medium); link to ops-console `/vehicles/[id]` for operational state (new tab)

**Drivers**:

- driver list with id, name, license expiry, supported service buckets, lifecycle stage, device binding summary, contract status
- actions: create driver (medium), update lifecycle (medium → high for suspend), revoke device binding (high)

**Contracts**:

- contract list with id, type, parties, status, effective from/to
- actions: create contract (medium), edit terms (medium → high if affects active dispatch)

**Device Binding**:

- binding state per driver/device
- actions: revoke device binding (high — requires reason)

**Exclusivity Reviews** (Q-ADM08):

- queue of submitted exclusivity reviews
- per-review: vehicle/driver scope, submitter, submitted at, current state (`submitted` / `under_review` / `approved` / `rejected`)
- actions: approve (high — requires reason), reject (high — requires reason)
- Rule: vehicle/driver `dispatchable` cannot become `true` until exclusivity approved

**Offboarding** (Q-ADM09):

- multi-step state machine: `initiated` → `dispatch_disabled` → `debranding_pending` → `debranding_verified` → `completed`
- per-record: vehicle, current state, timestamps per step, actor per step, evidence per step
- actions: initiate offboarding (high), advance step (medium — each transition requires audit), complete debranding (medium with evidence)

#### 5.8.C Decision points

- Is this vehicle/driver compliant enough for dispatch?
- Is exclusivity blocking real production work that needs urgent review?
- Is offboarding being treated as a real workflow (not a one-off form)?

#### 5.8.D State variants

- Each tab empty per `EmptyReason`
- Exclusivity backlog (visual urgency)
- Offboarding in-flight clusters

#### 5.8.E Entry / exit

- **Entry:** Sidebar
- **Exit:** Cross-app to ops-console for operational state on a specific vehicle/driver

---

### 5.9 `/switchboard` — Public Info & Placards

UI label is "Public Info & Placards" per Q-ADM04; route name preserved.

- **Spec ref:** §7.4.6 + workflow §7.5.4 + Q-ADM14 (1:many public info → placard)
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_super_admin`, `pa_ops_risk_gov`
- **Primary task:** Maintain published legal information and generate/publish placards for fleet/vehicle/brand templates.
- **Must-show data:**
  - Public Info: draft / published / retired versions; effectiveFrom / effectiveTo; call phone, complaint phone, fare text, payment method text
  - Placards: per public info version → list of generated placard artifacts; per placard: version code, source version, artifact file URL, publish state, scope (fleet / vehicle / brand template per Q-ADM14)
- **Must-support actions** per `availableActions`:
  - Create public info version (medium)
  - Publish version (high — requires reason)
  - Delete draft (medium)
  - Generate placard version (medium — choose source public info + scope)
  - Publish placard (high — requires reason)
- **Decision points:**
  - When to publish a new public info version (effective date strategy)
  - Which scope each placard targets
- **State variants:**
  - No drafts vs many drafts
  - With unretired older published version (signal to retire)
  - Placard generation in flight
- **Entry:** Sidebar
- **Exit:** Generated placard artifact download

---

### 5.10 `/pricing` — Pricing Governance

Per Q-ADM11, tabs:

```
/pricing
├── Passenger Pricing
├── Driver Fee Plans
├── Subsidy / Reimbursement Rules
└── Published Versions       (cross-tab history)
```

Per Q-ADM10, pricing is versioned: `draft` / `published` / `retired`. Publishing creates a new published version and atomically retires the previous for the same scope.

- **Spec ref:** §7.4.7 + workflow §7.5.5
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_finance_gov`, `pa_super_admin`
- **Primary task:** Draft, review, and publish pricing rules / driver fee plans / subsidy rules with safe versioning.

#### 5.10.A Per-tab must-show data

**Passenger Pricing**:

- rule list with name, version, service fee bps, reimbursement mode, applicable scope, effective from/to, status (`draft` / `published` / `retired`)
- per rule: canonical quoted fare authority, manual override actor types, required override fields

**Driver Fee Plans**:

- plan list with name, version, applicable scope, effective dates, status
- per plan: per-trip fee structure, subsidy linkage

**Subsidy / Reimbursement Rules**:

- subsidy rule list with name, version, applicable trigger, amount/percentage, scope, effective dates, status

**Published Versions** (cross-tab):

- chronological history across all tabs; filterable by tab type, scope, period

#### 5.10.B Must-support actions

- Create draft (medium) — per tab
- Edit draft (medium)
- Publish draft → published (high — requires reason; atomic version-replace per Q-ADM10)
- Retire published manually (high)
- View version history

#### 5.10.C Decision points

- Is the draft safe to publish? (effective date, scope conflict check)
- Does the new version supersede an active rule with in-flight trips?

#### 5.10.D State variants

- Multiple drafts per scope (potential conflict)
- Publish in progress (atomic transition state)
- Retired version visible vs hidden

#### 5.10.E Entry / exit

- **Entry:** Sidebar
- **Exit:** Audit trail entries

---

### 5.11 `/payments` — Settlement & Reconciliation

Per Q-ADM13, Platform Admin owns reconciliation issue **mutation** (ops mirrors read-only). Reimbursement batches move to a sub-route per Q-ADM12.

- **Spec ref:** §7.4.8 + workflow §7.5.6
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_finance_gov`, `pa_super_admin`
- **Primary task:** Review tenant invoices, driver statements, settlement matrix, and triage reconciliation issues.
- **Must-show data:**
  - Tenant invoices: id, tenant, period, amount, status (draft / issued / paid)
  - Driver statements: id, driver, period, amount, status
  - Settlement matrix view (per Q-ADM13 + spec §7.4.8 — preserve tenantId, partnerId, partner program id, sponsor reference, mirror order id, external order id, linked reconciliation job id)
  - Reconciliation issues queue: issue id, platform, mirror order id, external order id, reason code, owner (links to platform user), status, resolution notes (with **artifact references** per spec)
  - Link to `/payments/reimbursements` queue
- **Must-support actions** per `availableActions`:
  - Generate tenant invoices (medium — batch)
  - Generate driver statements (medium — batch)
  - Create reconciliation issue (medium)
  - Assign issue (medium)
  - Comment with artifact ids (medium)
  - Resolve issue (medium → high depending on financial impact)
  - Reopen issue (high — requires reason)
- **Decision points:**
  - Is the reconciliation issue within owner's authority or needs escalation?
  - Is the resolution code accurate (affects audit)?
- **State variants:**
  - Empty per `EmptyReason`
  - Issue with linked artifacts vs unresolved (visual urgency)
  - Reopen cycle visible (high-attention)
- **Entry:** Sidebar, cross-app from ops-console `/revenue` mismatch drawer (Q-OPS14)
- **Exit:** `/payments/reimbursements`

---

### 5.12 `/payments/reimbursements` — Reimbursement Batch Queue (NEW per Q-ADM12)

- **Spec ref:** §7.4.8 actions `approve reimbursement batch`, `mark reimbursement paid` — promoted to a queue per Q-ADM12
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_finance_gov`, `pa_super_admin`
- **Primary task:** Triage reimbursement batches through the approval → export → paid → reconciled flow.
- **Must-show data:**
  - Batch list: id, scope (tenant / partner / period), amount, current state (`draft` / `pending_approval` / `approved` / `exported` / `paid` / `reconciled`), submitter, submitted at, approver (if any), updated at
  - Filters: state, scope, period
- **Must-support actions** per `availableActions`:
  - Approve batch (high — requires reason per Q-ADM12)
  - Mark reimbursement paid (high — requires reason; transition to `paid` state)
  - Mark reconciled (medium)
  - Export batch artifact (low — produces signed artifact link)
- **Decision points:**
  - Is the batch ready for approval?
  - Has paid status been confirmed by external system before flipping state?
- **State variants:**
  - Empty `no_data`
  - Pending-approval backlog (visual urgency)
  - Stuck in `exported` (paid confirmation overdue)
- **Entry:** From `/payments`, sidebar (if nested)
- **Exit:** `/payments/reimbursements/[batchId]`

---

### 5.13 `/payments/reimbursements/[batchId]` — Reimbursement Batch Detail (NEW per Q-ADM12)

- **Spec ref:** §7.4.8 + Q-ADM12 state machine
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_finance_gov`, `pa_super_admin`
- **Primary task:** Work this batch end-to-end through the state machine.
- **Must-show data:**
  - Batch header: id, scope, total amount, state, timestamps per state, actor per state
  - Line items: per recipient, amount, source reference (mirror order / external order / driver)
  - State timeline (audit subset)
  - Export artifact (if `exported` or later)
- **Must-support actions** per `availableActions`:
  - Approve (high)
  - Export (medium — generates signed artifact)
  - Mark paid (high)
  - Mark reconciled (medium)
  - Add comment (low)
- **State variants:**
  - Each state (6 visual states)
  - With artifact vs without
  - Reconciliation mismatch (cross-link to `/payments` recon issue)
- **Entry:** Row on `/payments/reimbursements`
- **Exit:** Back to queue; cross-link to reconciliation issue

---

### 5.14 `/health` — Platform Health

- **Spec ref:** §7.4.9
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_ops_risk_gov`, `pa_super_admin`
- **Primary task:** See platform-wide health and alerts; route to specific adapter or module for follow-up.
- **Must-show data:**
  - `UiHealthEnvelope` top banner
  - Alert list (with route filter — view alerts relevant to platform, not just ops)
  - Dispatch lag metrics
  - Webhook queue metrics
  - Eligibility review queue
  - Reporting failures
  - Adapter counts + adapter health status (cross-link to `/adapter-registry`)
- **Must-support actions:**
  - Refresh (low; T4 cadence)
  - Switch between alerts / adapters views
  - Filter alerts by route
- **State variants:**
  - All-healthy
  - Per-severity degraded clusters
- **Entry:** Sidebar, notification `adapter.health.degraded`
- **Exit:** `/adapter-registry` filtered

---

### 5.15 `/notices` — Notices & Maintenance Mode

Per Q-ADM03, single route with tabs.

- **Spec ref:** §7.4.10 + Q-ADM15 cross-app notification linkage
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_ops_risk_gov`, `pa_super_admin`

#### 5.15.A Tabs

```
/notices
├── Notices
├── Maintenance Mode      (the toggle and reason; Q-ADM03)
└── Broadcast History
```

#### 5.15.B Per-tab

**Notices**:

- Notice list: title, body, severity (`info` / `warning` / `critical` / `maintenance` per Q-ADM15), audience, status, updated time
- Actions: create notice (medium); critical/maintenance severity (high — requires reason; pushes cross-app banner to ops/tenant/driver per Q-ADM15); resolve notice (medium)

**Maintenance Mode**:

- Current state: enabled / disabled, reason, scheduled window (if any), affected services
- Actions: set maintenance mode (high — requires reason); clear maintenance mode (high — requires reason)

**Broadcast History**:

- Past notices with delivered audiences (cross-app delivery results)
- Read-only

#### 5.15.C State variants

- Maintenance mode currently ON — page chrome conveys + persistent banner across other admin pages (visual designer's call on banner style)
- Critical notice in flight (delivery still propagating)

#### 5.15.D Entry / exit

- **Entry:** Sidebar
- **Exit:** Downstream apps (cross-app banner appears in ops/tenant/driver per Q-ADM15)

---

### 5.16 `/audit` — Audit & Evidence Governance

Per Q-ADM16, audit list shows legal hold and deletion exception badges.

- **Spec ref:** §7.4.11
- **Refresh tier:** T6 (manual)
- **Primary persona / roles:** `pa_ops_risk_gov`, `pa_super_admin`
- **Primary task:** Investigate platform actions, manage evidence retention and legal holds.
- **Must-show data:**
  - Audit records: createdAt, actorType, actorId, moduleName, actionName, resourceType, resourceId, requestId
  - **Legal hold badge** on held records (Q-ADM16): visible owner, expiry if any
  - **Deletion exception badge** on exempted records (Q-ADM16): visible owner, reason
  - Active legal holds list (separate panel)
  - Active deletion exceptions list (separate panel)
  - Evidence retention policies summary
- **Must-support actions** per `availableActions`:
  - Filter by module / actor type / resource type / time range
  - Expand record detail
  - Refresh (low)
  - Grant legal hold (high — requires reason; specifies hold owner + expiry)
  - Lift legal hold (high — requires reason)
  - Grant deletion exception (high — requires reason; specifies owner + reason code)
  - Revoke deletion exception (high)
- **Decision points:**
  - Is this audit record evidence of a real incident?
  - Should this resource be put on legal hold pending investigation?
- **State variants:**
  - Empty per `EmptyReason`
  - With many held records (cluster visible)
  - Search results
- **Entry:** Sidebar; cross-app action receipt "View audit" links (other apps deep-link in to this page filtered)
- **Exit:** Resource detail (in-app or cross-app new tab)

---

### 5.17 `/feature-flags` — Feature Flags (Write Authority)

Per Q-X16, this is the only app with **write** authority. Other apps get read-only filtered endpoints.

- **Spec ref:** §7.4.12 (Feature Flags portion)
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_super_admin`
- **Primary task:** Govern feature flags: enable / disable globally or per tenant; understand current rollout state.
- **Must-show data:**
  - Flag list: key, enabled (global default), per-tenant override list, last changed at, last changed by, description
  - Filter by scope, search by key
- **Must-support actions** per `availableActions`:
  - Toggle global default (high — requires reason)
  - Add tenant override (high — requires reason)
  - Remove tenant override (high — requires reason)
  - View change history (low)
- **Decision points:**
  - Is this flag safe to flip globally?
  - Should a tenant override be added vs blanket flip?
- **State variants:**
  - Flag mid-rollout (partial value across tenants) — visible
  - Flag fully rolled-out
  - Flag deprecated (tag visible)
- **Entry:** Sidebar
- **Exit:** Audit trail entry

---

### 5.18 `/adapter-registry` — External Platform Adapter Registry

Per Q-ADM17, adapter write authority is split:

- Platform Admin: create config, edit credentials, enable/disable
- Ops: pause/resume operational traffic (with TTL), retry failed callback
- Secret material is never shown after creation

- **Spec ref:** §7.4.12 (Adapter Registry portion) + driver-spec §6.4
- **Refresh tier:** T4
- **Primary persona / roles:** `pa_partner_mgr`, `pa_super_admin`, `pa_ops_risk_gov` (operational status only)
- **Primary task:** Configure external platform adapters and their credentials; monitor health.
- **Must-show data:**
  - Adapter list: platform code, display name, environment, enabled flag, adapter type, webhook URL status, credential status (configured / missing / expiring / rotated at / rotation owner), last health check, supported actions, current health (healthy / degraded / down)
  - Per-adapter detail: config metadata (allowed service buckets, driver eligibility rules, max candidates, accept timeout, manual fallback threshold, finance authority mode), supported actions, capability flags (per Q-DRV01: `canRelayAccept`, `canRelayReject`)
  - Per-adapter feature flags: driver external order accept enabled, driver external order reject enabled, platform earnings enabled, platform presence enabled
  - Operational pause state (if ops paused traffic): pause owner, TTL, reason
- **Must-support actions** per `availableActions` (split per Q-ADM17):
  - Create adapter config (high — `pa_partner_mgr` or `pa_super_admin`)
  - Edit credentials (high — `pa_super_admin` only)
  - Enable / disable adapter (high — `pa_partner_mgr` or `pa_super_admin`; disable that affects production tenant requires reason)
  - Edit config (medium)
  - Pause operational traffic (high — `pa_ops_risk_gov`; TTL required)
  - Retry failed callback (medium — `pa_ops_risk_gov`)
  - Rotate credentials (high — `pa_super_admin`; secret shown once like Q-ADM07)
- **Decision points:**
  - Is this adapter ready for production rollout?
  - Should I pause traffic vs disable adapter entirely?
- **State variants:**
  - Healthy / degraded / down
  - Credential expiring / expired (urgency)
  - Operationally paused (visible)
  - Sandbox vs pilot vs production
- **Entry:** Sidebar, cross-app from ops-console `/dispatch` forwarded board (new tab)
- **Exit:** `/health` for platform-wide signal; `/audit` for change history

---

## 6. API mapping

| Page                                 | Read methods                                                                                             | Write methods                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/`                                  | `getIdentityContext`, lightweight module enablement                                                      | (none)                                                                                                                   |
| `/tenants`                           | `listPlatformTenants` (TBD method naming), `listPlatformAdminUsers` (for owner display)                  | `createPlatformTenant`                                                                                                   |
| `/tenants/[tenantId]`                | tenant detail (TBD), rollout gate state, role invitation state, audit subset                             | `activateTenant`, suspend, `acknowledgeTenantRole`, set rollout stage, enter rollback hold                               |
| `/tenant-governance`                 | cross-tenant aggregated reads (quota, approval backlog, cost-center health, governance risk)             | (read-only dashboard; mutations happen in source modules)                                                                |
| `/partners`                          | `listPlatformPartnerEntries` (TBD)                                                                       | `createPlatformPartnerEntry`                                                                                             |
| `/partners/[entrySlug]`              | partner detail (TBD), credential metadata                                                                | edit, `activatePlatformPartnerEntry`, deactivate, issue credential (returns plaintext once), rotate, revoke              |
| `/users`                             | `listPlatformAdminUsers` (TBD)                                                                           | `createPlatformAdminUser`, update role, suspend                                                                          |
| `/fleet`                             | vehicles / drivers / contracts / device-binding / exclusivity / offboarding lists (mostly TBD endpoints) | `createDriverMaster`, `createDriverProfile`, update lifecycle, `approveExclusivity`, offboarding step transitions (TBD)  |
| `/switchboard`                       | public info versions + placards (TBD)                                                                    | `createPublicInfoVersion`, publish version, generate placard, publish placard                                            |
| `/pricing`                           | pricing rules + driver fee plans + subsidy rules + version history (TBD)                                 | `createPlatformPricingRule`, publish (atomic version replace per Q-ADM10)                                                |
| `/payments`                          | invoices, statements, reconciliation issues (TBD), `listReconciliationIssues`                            | `createReconciliationIssue`, `assignReconciliationIssue`, resolve, reopen                                                |
| `/payments/reimbursements`           | batch queue (TBD)                                                                                        | `approveReimbursementBatch`, mark paid, mark reconciled                                                                  |
| `/payments/reimbursements/[batchId]` | batch detail (TBD)                                                                                       | approve, export, mark paid, mark reconciled, comment                                                                     |
| `/health`                            | platform observability (TBD; superset of ops observability), adapter health                              | refresh                                                                                                                  |
| `/notices`                           | notices, maintenance state, broadcast history (TBD)                                                      | `createPlatformNotice`, resolve notice, set maintenance mode                                                             |
| `/audit`                             | `listAuditLogs`, legal holds, deletion exceptions (TBD)                                                  | grant/revoke legal hold, grant/revoke deletion exception                                                                 |
| `/feature-flags`                     | `GET /api/platform/feature-flags` (write authority per Q-X16)                                            | toggle global, add/remove tenant override                                                                                |
| `/adapter-registry`                  | adapter registry list + detail + health + capability flags (TBD)                                         | create, edit, enable/disable, edit credentials (pa only), rotate credentials, pause/retry (ops scope), per Q-ADM17 split |

Methods marked TBD need to be added to `packages/api-client/src/index.ts` as part of the engineering follow-up that produces the 12 new contracts in answers §7 plus the platform-admin-specific contracts implied by §6 docs.

---

## 7. Purely visual open questions

> **🎨 2026-05-25 status:** the visual design team has answered most of these in [`drts-design-canvas/Platform Admin.html`](./drts-design-canvas/Platform%20Admin.html) (v0.6, indigo accent). The implementer should consult the canvas first; remaining "still open" items are ones the canvas explicitly did not address. Canvas wins for visual; this packet wins for behavior/data/API.

§3 covers cross-cutting; most decisions baked in. Remaining below are visual / interaction choices — most now answered.

### 7.1 Cross-cutting (these are shared with ops-console packet §7.1 and apply here too)

1. Density target (compact / comfortable / spacious)
2. Stale-data visual treatment
3. Identity context chip shape (top header)
4. Health context placement (sidebar footer)
5. Degraded banner pattern
6. Empty-state illustration set per `EmptyReason`
7. Confirmation modal shape per risk tier
8. State pill color system (admin codes: `sandbox`/`pilot`/`production`/`rollback_hold`, gate `pending`/`ready`/`approved`/`blocked`, pricing `draft`/`published`/`retired`, offboarding states, adapter health, etc.)
9. Loading skeleton vs spinner
10. Search drawer / overlay shape
11. Notification bell + inbox panel shape
12. Cross-app deep-link affordance

### 7.2 Per-screen

13. **`/` (home)** — redirect to default module vs landing tile board? If tile board, what tiles per role?
14. **`/tenants/[tenantId]`** — page IA. The rollout workflow is multi-step and stateful; how to convey (stepper? timeline? state diagram visualization?)
15. **`/tenants/[tenantId]`** — role invitations + acknowledgements: inline panel? Modal? Separate tab?
16. **`/tenant-governance`** — dashboard structure: KPI tiles? Heat map? List sorted by risk score?
17. **`/partners/[entrySlug]`** — credential issuance modal: single big modal vs multi-step? Copy/download affordance shape; "I stored this key" confirmation visualization.
18. **`/users`** — invite flow: inline row vs modal vs dedicated route?
19. **`/fleet`** — 6-tab IA: horizontal tabs? Vertical secondary nav? Nested route per tab?
20. **`/fleet` Exclusivity Reviews tab** — queue visual; approve/reject reason capture
21. **`/fleet` Offboarding tab** — state-machine visualization (Kanban? Linear stepper per record? Table with state column?)
22. **`/switchboard`** — public-info versioning UI; placard generation modal/wizard; per-scope placard list
23. **`/pricing`** — 4-tab structure; version history view; publish modal with conflict-check warning
24. **`/payments`** — settlement matrix visualization (table? heatmap? aggregated view?); reconciliation issue list and detail
25. **`/payments/reimbursements`** — Kanban (state columns) vs list-with-state-column?
26. **`/payments/reimbursements/[batchId]`** — state timeline visualization; line-item list density
27. **`/health`** — alert list density; adapter health summary placement
28. **`/notices`** — 3-tab structure; severity badge system; maintenance mode toggle prominence
29. **`/audit`** — record list density; legal hold + deletion exception badge styling; expandable detail
30. **`/feature-flags`** — flag list density; mid-rollout partial-value visualization
31. **`/adapter-registry`** — list density; credential status indicator; operational pause overlay/badge

### 7.3 Shell

32. **Sidebar grouping verification.** Six sections (工作面 / 租戶治理 / 合作夥伴治理 / 人員與車隊 / 平台與商務 / 平台維運). Visual team confirms or amends.
33. **Sidebar role-aware visibility.** Many routes are scoped (`/fleet` to `pa_fleet_gov`, `/pricing` & `/payments` to `pa_finance_gov`, `/feature-flags` to `pa_super_admin`). Mechanism: hide vs disable.
34. **Header search bar placement and prominence.**
35. **Avatar chip behavior.** Identity drawer? Logout? Settings?
36. **Maintenance Mode banner** when enabled (Q-ADM03) — persistent banner across all platform-admin pages, design shape.

---

## 8. Out of scope for this packet

- Visual design choices
- Other apps (ops-console packet already shipped; tenant-console + driver-app to follow)
- API contract additions (engineering follow-up per answers §7)
- Implementation backlog
- Migration plan from current implementation to designed implementation

---

## 9. Hand-off process

Same as ops-console packet §9. Visual team consumes this + answers doc + spec §7. Produces IA sitemap (confirming §4) + per-screen wireframes covering all state variants + component system + design tokens. Engineering picks up wireframes + tokens + §6 API mapping + new contracts (when they exist) and produces implementation backlog.

This packet is input to step 1. Not a design.
