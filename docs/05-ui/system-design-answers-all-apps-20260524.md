# System Design Answers — All Four Apps

**Date:** 2026-05-24
**Role:** 系統設計規劃領域
**Apps in scope:** `ops-console-web`, `platform-admin-web`, `tenant-console-web`, `driver-app`
**Input:** [`system-design-questions-all-apps-20260524.md`](./system-design-questions-all-apps-20260524.md)
**Decision posture:** 本文件為系統設計裁決，不是視覺設計建議，也不是交給視覺團隊討論的開放問題。

> **Encoding note (2026-05-25, Claude):** This document was received via chat paste with double-encoded UTF-8 corruption; best-effort restoration applied (see `/tmp/fix-mojibake.py`). Most fullwidth punctuation (`，`, `：`, `（`, `）`, `「`, `」`) and some Chinese characters recovered; a few characters lost bytes in transport and may show `?` or near-equivalent. Decisions, structure, code blocks, contract names, and route names are all intact. If perfect Chinese reconstruction is needed, request the original file from the system design team.

---

## 0. Executive Summary

本次裁決的核心原則如下:

1. **每個 App 維持前端獨立部署，不做 Phase 1 統一 shell。**
   `platform-admin-web`、`ops-console-web`、`tenant-console-web`、`driver-app` 仍是獨立 surface，跨 App 互跳用 deep link + session continuity，不做 module federation / multi-app SPA。

2. **Phase 1 realtime 採 mixed model，polling 為主線，push 只用於高優先級事件。**
   不在 Phase 1 引入 WebSocket。Ops / Tenant / Admin Web 以 tiered polling + manual refresh，Driver App 使用 polling + native push for urgent events。

3. **所有敏感 CTA 顯示必須由 backend authority 決定。**
   UI 不得只靠 role hard-code。Read model 必須帶 `availableActions` 或可呼叫 resource action endpoint。

4. **所有寫入操作都必須回傳 action receipt，含 audit reference。**
   高風險操作需要 modal + reason，中風險 modal，低風險 inline confirm 或直接執行，但仍要 audit。

5. **Tenant Console canonical migration 已定案: `apps/tenant-console-web` 是 repo-local canonical tenant admin console，`tenant-commute-hub` 仍是外部 live transition owner，直到 cutover 任務完成。**

6. **Partner Booking Mode 不再繼續長在 Tenant Console，正式 repo-local surface 是 `apps/partner-booking-web`。**
   `tenant-console-web/app/partner/*` 只保留 legacy compatibility / rollback reference。

7. **Driver App 的 Phase 1 產品責任是多平台司機工作台，不是自家中央派遣 App。**
   第三方平台只 mirror / relay / sync，不搶第三方平台派單規則和路線 authority。

8. **Phase 1 完成標準不得用 workflow-family gate。**
   UI done、contract done、typecheck passed、sidecar produced 各不得單獨宣稱 flow complete。

---

## 1. Cross-cutting Decisions

---

### Q-X01. Canonical realtime data model

**裁決: 選 mixed model。**

Phase 1 不採 WebSocket 作為基線。正式 realtime model 如下:

| Surface / use case                                   | Model                                | Reason                                                                 |
| ---------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Driver task offer / SOS / urgent task update         | Native push + short polling fallback | Driver mobile 需要 prompt delivery，但資料 truth 仍由 pull API confirm |
| Driver `/trip` active state                          | Polling fast tier + push interrupt   | 行程狀態需要穩定，不用 WebSocket 作為必備                              |
| Ops `/dispatch`, `/callcenter`, `/approval-requests` | Polling fast tier                    | Dispatch board 可用 deterministic polling，避免 Phase 1 增加 WS infra  |
| Ops dashboard / incidents / complaints               | Polling medium tier                  | KPI / case list 可容忍秒級延遲                                         |
| Platform Admin health / payments / adapter registry  | Polling medium-slow tier             | 控制面不需要毫秒級 live                                                |
| Tenant bookings / webhooks delivery logs             | Polling slow tier + manual refresh   | B2B portal 不需要高頻 refresh                                          |
| Reports / audit                                      | Manual refresh                       | 報核型資料不需自動刷新                                                 |

**Contract requirement:**

所有 list/detail API 應回傳可消費的反饋:

```ts
interface UiRefreshMetadata {
  generatedAt: string;
  staleAfterMs: number;
  dataFreshness: "fresh" | "stale" | "degraded" | "unknown";
  source: "live" | "cache" | "sandbox" | "static";
}
```

**禁止:** 各 App 自行猜測資料是否 stale。

---

### Q-X02. Per-surface refresh cadence

**裁決: Phase 1 採 fixed cadence tiers。**

| Tier                 | Surface                                              |                             Cadence | Notes                          |
| -------------------- | ---------------------------------------------------- | ----------------------------------: | ------------------------------ |
| T0 Urgent            | Driver task offer, SOS ack                           | push immediately + poll 5s fallback | Push 失敗時由 polling 補       |
| T1 Fast              | Driver active trip `/trip`                           |                                  3s | 若 offline 則顯示 offline mode |
| T2 Dispatch          | Ops `/dispatch`, `/callcenter`, `/approval-requests` |                                  5s | 可手動 refresh                 |
| T3 Ops medium        | Ops dashboard, incidents, complaints                 |                                 15s | SLA breach 由 backend compute  |
| T4 Admin medium-slow | Platform Admin health, payments, adapter registry    |                                 30s | 健康訊號顯示 last checked      |
| T5 Tenant slow       | Tenant bookings, webhooks, notifications             |                                 30s | Detail page 可手動 refresh     |
| T6 Manual            | Reports, audit, filing packages                      |                         manual only | 不自動刷新                     |

**Implementation instruction:** 每個頁面不得各自寫 magic number，改由 shared config 提供:

```ts
RefreshTier =
  "urgent" | "fast" | "dispatch" | "medium" | "medium_slow" | "slow" | "manual";
```

---

### Q-X03. Cross-app navigation

**裁決: Phase 1 保留各 App 獨立部署，跨 App 採 deep link full-page navigation，預設開新分頁。**

不做 unified shell。不做 module federation。不做 inline embed 作為通用機制。

| From                                                     | To                                                                        | Mechanism                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| Ops revenue mismatch → Platform Admin payments           | Deep link to platform-admin URL, new tab                                  | Owner app is platform-admin                |
| Ops dispatch forwarded → Platform Admin adapter registry | Deep link, new tab                                                        | Adapter config authority in platform-admin |
| Platform Admin tenant → Ops operational view             | Deep link, new tab                                                        | Operational impact in ops-console          |
| Platform Admin audit → tenant-scoped events              | Same app if platform-level audit; deep link to tenant if tenant-only view | Depends on owner domain                    |

**Read-only mirror rule:** 只有高頻 ops triage 需要在 ops-console 顯示 read-only drawer (例如 payment mismatch summary)，但真正 mutation 仍 deep link 到 owner app。

**Contract:** `CrossAppResourceLink`:

```ts
interface CrossAppResourceLink {
  targetApp: "ops-console" | "platform-admin" | "tenant-console";
  route: string;
  resourceType: string;
  resourceId: string;
  openMode: "new_tab" | "same_tab";
  label: string;
}
```

---

### Q-X04. Unified shell vs separate deployments

**裁決: Phase 1 維持各自獨立部署。**

- `platform-admin-web`: 平台控制面
- `ops-console-web`: 監看 / 派遣 / 客服控制面
- `tenant-console-web`: 租戶管理 console
- `driver-app`: Expo / React Native mobile app

Admin Web 可共享 design tokens / component package，但不共享 runtime shell。Driver App 不可 import `@drts/ui-web`。

**P2 可評估:** admin apps unified shell 或 shared launcher，但不列入 Phase 1 完成標準。

---

### Q-X05. Platform notification model

**裁決: Phase 1 採 backend per-user inbox + native push for driver urgent events。**

| App            | Notification model                     |
| -------------- | -------------------------------------- |
| Platform Admin | backend inbox, polled                  |
| Ops Console    | backend inbox, polled, critical banner |
| Tenant Console | backend inbox, polled                  |
| Driver App     | backend inbox + native push            |

**Contract:**

```ts
interface UserNotificationRecord {
  notificationId: string;
  recipientActorId: string;
  recipientRealm: "platform" | "ops" | "tenant" | "driver";
  tenantId?: string | null;
  severity: "info" | "warning" | "critical";
  eventType: string;
  title: string;
  message: string;
  resourceLink?: CrossAppResourceLink | null;
  readAt: string | null;
  createdAt: string;
}
```

**Endpoints:**

```http
GET  /api/notifications
POST /api/notifications/{notificationId}/read
POST /api/notifications/read-bulk
```

---

### Q-X06. Notification events

**裁決: 以下 event taxonomy 為 Phase 1 必備。**

#### Admin / Ops

```text
incident.critical.created
complaint.sla_breached
approval_request.created
approval_request.timeout_warning
approval_request.escalated
reconciliation_issue.assigned
adapter.health.degraded
tenant.rollout_gate.ready
tenant.rollback_hold.enabled
```

#### Driver

```text
driver.task.offered
driver.task.accept_timeout_warning
driver.platform.reauth_required
driver.platform.sync_failed
driver.shift.end_reminder
driver.sos.acknowledged
```

#### Tenant / Partner

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

**禁止:** 每個 App 自己定 notification vocabulary。

---

### Q-X07. Header search scope

**裁決: Phase 1 採 app-scoped cross-entity search，不做全平台 global search。**

| App            | Search scope                                                     |
| -------------- | ---------------------------------------------------------------- |
| Ops Console    | orders, dispatch items, drivers, vehicles, complaints, incidents |
| Platform Admin | tenants, partners, users, adapter registry, audit events         |
| Tenant Console | bookings, passengers, addresses, cost centers, invoices          |
| Driver App     | 不放 header search，使用 jobs / earnings filters                 |

**Endpoint pattern:**

```http
GET /api/{realm}/search?q=...&types=...
```

Driver App 不放全局 search bar，避免假功能。

---

### Q-X08. Cross-entity vs per-page search

**裁決: Header search 是 app-scoped cross-entity，列表頁仍保留 per-page filters。**

- Header search: 快速跳轉與 lookup
- Page filters: 資料表篩選與操作

Search results 必須分 category，不得混搭在單一列表。

---

### Q-X09. Confirmation pattern

**裁決: 使用 risk-classified confirmation。**

| Risk   | Pattern                         | Examples                                                                                                            |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Low    | direct action + toast receipt   | mark read, refresh, acknowledge non-critical                                                                        |
| Medium | modal confirm                   | disable cost center, rotate webhook secret, cancel booking                                                          |
| High   | modal confirm + required reason | rollback hold, pricing publish, revoke partner credential, force driver offline, legal hold, reimbursement approval |

所有 write action 都要回傳 action receipt:

```ts
interface ActionReceipt {
  actionId: string;
  auditId: string;
  resourceType: string;
  resourceId: string;
  status: "accepted" | "completed" | "failed";
  message: string;
}
```

---

### Q-X10. Audit ID in UI receipt

**裁決: 要顯示 audit reference，但依本身權限決定是否可點。**

- 有 audit read scope: toast 顯示「View audit」deep link
- 無 audit read scope: 顯示 audit reference ID，但不可點
- 高風險操作 receipt 必須保留 audit ID

Link pattern:

```text
/audit?auditId=<auditId>
```

跨 App audit 依 resource owner app 重新分頁。

---

### Q-X11. Identity / health context bar

**裁決: 採 Top identity chip + Sidebar footer health + page-level degraded banner。**

- Top header: actor / realm / tenant / environment chip
- Sidebar footer: API health / last checked
- Page content top: degraded banner only when page-critical dependency degraded

Driver App: Settings / Workspace 顯示 identity + platform health，Trip 頁專用 banner 顯示 sync degraded。

---

### Q-X12. Health-degraded contract

**裁決: 新增 UI health envelope，不再允許各頁面 try/catch 後顯示空資料。**

```ts
interface UiHealthEnvelope {
  status: "healthy" | "degraded" | "down";
  degradedServices: Array<{
    service: string;
    impact: string;
    severity: "warning" | "critical";
  }>;
  lastCheckedAt: string;
}
```

All list APIs that fail dependency-specific fetch must return explicit error or degraded metadata, not silently `[]`.

---

### Q-X13. Authoritative actions-I-can-do endpoint

**裁決: Backend read model 必須提供 `availableActions`，複雜資源可另接 action endpoint。**

Preferred:

```ts
interface ResourceActionDescriptor {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
}
```

Pattern:

```http
GET /api/{realm}/{resource}/{id}
→ data.availableActions[]
```

For batch or cross-resource checks:

```http
GET /api/actions?resourceType=...&resourceId=...
```

UI 不得只靠 role hard-code 顯示 CTA。

---

### Q-X14. Ops cross-tenant authority

**裁決: Ops Console 具有 scoped cross-tenant authority，但不是所有 ops user 都看全部。**

Roles:

```text
ops_dispatcher            own area / assigned queue
ops_manager               cross-tenant operational queues
ops_approval_triage       cross-tenant approval requests
ops_compliance            complaints / recordings / filing evidence
ops_finance_reviewer      revenue mismatch / reconciliation read-only
```

Cross-tenant queues must return tenant chips and tenant-scoped audit.

---

### Q-X15. Empty / not-ready states

**裁決: Backend 必須區分 empty reason。**

```ts
type EmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "driver_not_eligible"
  | "filtered_empty";
```

每個 list response 若 items 為空，必須回傳:

```ts
emptyState?: {
  reason: EmptyReason;
  messageCode: string;
  nextAction?: ResourceActionDescriptor;
}
```

---

### Q-X16. Feature flag visibility

**裁決: 一份 backend authority，多份 actor-filtered surfaces。**

Endpoints:

```http
GET /api/platform/feature-flags          // write authority
GET /api/ops/feature-flags               // read filtered operational flags
GET /api/tenant/feature-flags            // read own tenant flags
GET /api/driver/feature-flags            // read driver/mobile flags
```

同一套 flag storage，由 actor realm 過濾可見 scope。

---

### Q-X17. Internationalization

**裁決: Domain codes 不應直接作為最終 user-facing label。**

- UI 顯示 zh-TW label
- 可在 developer tooltip / detail drawer 顯示 raw code
- Filter chip / state pill / status badge 必須使用 translation map
- API 回傳 code，frontend 用 shared dictionary render label

zh-TW 是 primary，en 是 secondary。不得混用 raw `accept_pending` 當正式中文畫面文案。

---

## 2. Ops Console Decisions

---

### Q-OPS01. `/complaints/[caseNo]`

**裁決: 需要獨立 case detail route。**

Route:

```text
/complaints/[caseNo]
```

List page 可掛 quick drawer，但 detail route 是正式落地 surface。

Scope:

- timeline
- status change
- reopen
- SLA state
- linked order / call / recording / incident
- recovery notes
- export / evidence access
- audit trail

---

### Q-OPS02. `/vehicles/[vehicleId]`

**裁決: 需要獨立 vehicle detail route。**

Route:

```text
/vehicles/[vehicleId]
```

Scope:

- current driver binding
- dispatchable state
- regulatory profile
- insurance expiry
- maintenance records
- contract references
- offboarding / debranding state
- incident linkage
- audit events

---

### Q-OPS03. `/contracts/[contractId]`

**裁決: 需要 route，但 Ops 為 read-only operational view。**

Route:

```text
/contracts/[contractId]
```

Scope:

- modifiable window
- proof requirements
- waiting / no-show rules
- SLA profile
- tenant / partner linkage
- current effective version

Mutation authority remains platform-admin / tenant governance depending on contract type.

---

### Q-OPS04. Concurrent call sessions per agent

**裁決: Phase 1 不允許 agent 同時間有多個 active call session。**

允許:

- waiting queue
- transfer incoming
- completed call history

不允許:

- 一個 agent 同時處理多個 active call

Reason: call booking / complaint / recording linkage 需要清楚，不可讓 call_id 混淆。

---

### Q-OPS05. Transfer to complaint

**裁決: 同步建立 complaint case draft，立即 redirect 到 detail route。**

Flow:

```text
active call
→ transfer to complaint
→ create complaint_case with call_id / order_id / recording_pending flag
→ redirect /complaints/[caseNo]
```

如果 recording callback 尚未到，case 顯示 `recording_pending`。

---

### Q-OPS06. Override governance and no-supply boards

**裁決: 在 `/dispatch` 內作為 first-class sub-boards，不只是 filter chips。**

Dispatch IA:

```text
/dispatch
  - Ready queue
  - Assigned
  - Exception hold
  - No eligible supply
  - Governance blocked / approval pending
  - Forwarded mirror
```

Chips 可作為輔助 filter，但每個 queue 要有 tab / board identity。

---

### Q-OPS07. Forwarded order detail

**裁決: 使用同一 `/dispatch/[workItemId]` route，read model 標明 `domain=owned|forwarded`。**

No separate route in Phase 1.

Endpoint:

```http
GET /api/ops/dispatch/work-items/{workItemId}
```

Forwarded detail must show:

- sourcePlatform
- externalOrderId
- routeLocked
- waypoints
- status sync state
- last callback
- no-owned-assignment assertion

---

### Q-OPS08. Driver take offline per platform

**裁決: Ops 有 incident / safety / compliance force-offline authority，日常上線下線由 driver 自己控制。**

Ops action:

```http
POST /api/ops/drivers/{driverId}/platforms/{platformCode}/force-offline
```

Required fields:

- reasonCode
- note
- expiresAt / TTL
- relatedIncidentId optional

Platform-admin manages eligibility/config; Ops handles operational override.

---

### Q-OPS09. Suppress matching during incident

**裁決: time-bound suppression，預設直到 incident closed，但有 max TTL。**

State:

```ts
interface DriverMatchingSuppression {
  active: boolean;
  reasonCode: "incident" | "compliance_hold" | "manual_ops_hold";
  sourceIncidentId?: string;
  expiresAt: string;
  liftedAt: string | null;
}
```

Default:

- incident created → suppress matching
- incident resolved → lift suppression
- max TTL = 24h unless ops_manager extends

---

### Q-OPS10. Cross-tenant approval queue

**裁決: 只有特定 ops roles 可看 cross-tenant approval queue。**

Allowed:

```text
ops_manager
ops_approval_triage
ops_compliance
```

Not every ops user.

Queue must show tenant chip and never allow tenant data mutation beyond allowed approval triage actions.

---

### Q-OPS11. Phone booking creation

**裁決: Ops Call Center 使用 ops-side command endpoint，但共用 tenant booking validator。**

Endpoint:

```http
POST /api/ops/callcenter/bookings
```

Includes:

- callId
- agentId
- callerPhone
- tenantId if known
- booking payload

Backend maps to tenant booking / owned mobility flow after validation.

---

### Q-OPS12. Recording / callback attach model

**裁決: auto-attach by call_id，manual attach only for exception correction。**

Flow:

```text
call session created
→ phone booking stores call_id
→ recording callback arrives with call_id
→ backend auto-attaches recording_id
```

Manual attach requires ops_compliance role + reason + audit.

---

### Q-OPS13. SLA breach for complaints

**裁決: backend computed。**

Complaint record must expose:

```ts
slaStatus: "within_sla" | "warning" | "breached";
slaDueAt: string;
slaBreachedAt: string | null;
```

Client may display countdown but cannot decide breach truth.

---

### Q-OPS14. Mismatch detail in revenue

**裁決: Ops 顯示 read-only triage drawer，mutation deep link 到 Platform Admin `/payments`。**

Ops revenue mismatch click:

1. Opens drawer with mismatch summary
2. Shows resource link to platform-admin `/payments/reconciliation/{issueId}`
3. Mutation only in platform-admin

---

## 3. Platform Admin Decisions

---

### Q-ADM01. `/tenant-governance` vs `/tenants`

**裁決: 保留兩個 route，各有分工。**

| Route                | Purpose                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `/tenants`           | tenant lifecycle, modules, rollout, onboarding                                           |
| `/tenant-governance` | cross-tenant governance dashboard: quota, approvals, cost-center health, governance risk |

Do not merge.

---

### Q-ADM02. Feature flags & adapter registry split

**裁決: 保留 split。**

- `/feature-flags`: product / rollout flags
- `/adapter-registry`: external platform adapter config / health / credentials metadata

They may appear under one nav group, but routes remain separate.

---

### Q-ADM03. Notices & Maintenance

**裁決: Maintenance mode lives inside `/notices` as a separate tab.**

Route remains:

```text
/notices
```

Tabs:

```text
Notices
Maintenance Mode
Broadcast History
```

No new `/maintenance-mode` route in Phase 1.

---

### Q-ADM04. `/switchboard` naming

**裁決: Route stays `/switchboard`; UI label becomes `Public Info & Placards`。**

Rationale: route compatibility preserved; visual / product label aligns spec.

---

### Q-ADM05. Tenant rollout gate state machine

**裁決: 必須建立 single source-of-truth state-machine doc。**

Doc:

```text
docs/02-architecture/tenant-rollout-state-machine.md
```

States:

```text
sandbox
pilot
production
rollback_hold
```

Gate statuses:

```text
pending
ready
approved
blocked
```

Transitions require audit and availableActions.

---

### Q-ADM06. Cutover owner / rollback owner

**裁決: 都是 platform user records，不是 free-text。**

Fields store:

- userId
- displayName snapshot
- email snapshot
- assignedAt

If legacy free-text exists, migrate as unlinked owner note until mapped.

---

### Q-ADM07. Partner entry credentials

**裁決: Issue / rotate credential shows plaintext secret once in modal。**

- Full secret shown once only
- Masked suffix stored for future display
- Admin must confirm copied
- Partner delivery is out-of-band
- Audit event required

No email secret delivery in Phase 1.

---

### Q-ADM08. Driver exclusivity review

**裁決: Trigger from vehicle/driver onboarding or dispatchability enablement; queue lives inside `/fleet`。**

Location:

```text
/fleet → Exclusivity Reviews tab
```

Workflow:

```text
submitted
→ under_review
→ approved | rejected
```

Dispatchable cannot become true until approved.

---

### Q-ADM09. Offboarding workflow

**裁決: multi-step state machine。**

```text
initiated
→ dispatch_disabled
→ debranding_pending
→ debranding_verified
→ completed
```

Each step requires timestamp, actor, evidence, audit.

---

### Q-ADM10. Pricing publish

**裁決: draft / published / retired version model。**

Publish creates a new published version and atomically retires previous active version for the same scope.

`/pricing` must list versions, not only active rule.

---

### Q-ADM11. Driver fee plan vs pricing rule

**裁決: Sibling tabs under `/pricing`。**

Tabs:

```text
Passenger Pricing
Driver Fee Plans
Subsidy / Reimbursement Rules
Published Versions
```

Driver fee plan is separate from passenger fare pricing.

---

### Q-ADM12. Reimbursement batch flow

**裁決: Add batch queue and detail inside `/payments`。**

Routes:

```text
/payments/reimbursements
/payments/reimbursements/[batchId]
```

Flow:

```text
draft
→ pending_approval
→ approved
→ exported
→ paid
→ reconciled
```

---

### Q-ADM13. Reconciliation issue ownership

**裁決: Platform Admin owns reconciliation issue mutation; Ops gets read-only operational mirror。**

Owner may be platform finance/admin user. Ops can comment/escalate but not resolve payment truth unless assigned finance scope.

---

### Q-ADM14. Public info versioning vs placard generation

**裁決: One public info version may generate many placard artifacts。**

```text
PublicInfoVersion 1 → many PlacardArtifact
```

Placard scoped by fleet / vehicle / brand template.

---

### Q-ADM15. Notice severity model

**裁決: Critical notice pushes cross-app notification / banner to selected audiences。**

Severity:

```text
info
warning
critical
maintenance
```

Critical + maintenance can target ops / tenant / driver surfaces via notification model.

---

### Q-ADM16. Legal hold / deletion exception

**裁決: Hold is a separate evidence governance state surfaced as badge / filter in audit and evidence lists。**

Audit list shows:

- held badge
- deletion exception badge
- reason code
- hold owner
- hold expiry if any

---

### Q-ADM17. Adapter registry write authority split

**裁決: Platform Admin configures; Ops operates。**

| Action                             | Authority            |
| ---------------------------------- | -------------------- |
| create adapter config              | platform-admin       |
| edit credentials                   | platform-admin only  |
| enable / disable adapter           | platform-admin       |
| pause / resume operational traffic | ops_manager with TTL |
| retry failed callback              | ops                  |
| view health                        | both                 |
| view secret material               | never after creation |

---

## 4. Tenant Console Decisions

---

### Q-TEN01. Canonical migration plan

**裁決: 選 A with transition。**

`apps/tenant-console-web` becomes the canonical repo-local tenant admin console for Phase 1 design and future production cutover.

Current live transition:

- `tenant-commute-hub` remains external live owner until formal cutover
- `apps/tenant-portal-web` remains sunset reference shell only
- `apps/tenant-console-web` receives all missing tenant admin routes

No visual design blocker remains once this decision is recorded.

---

### Q-TEN02. Missing routes

**裁決: 全部 ship in `apps/tenant-console-web`。**

Required routes:

```text
/addresses
/sla
/notifications
/reports
/feature-flags
/integration-governance
/billing
/invoices
/bookings/new
```

`/billing` is overview; `/invoices` remains invoice list/detail. `/bookings/new` is a route, not modal-only.

---

### Q-TEN03. Partner Booking Mode vs Tenant Admin Mode

**裁決: Partner mode moves to different app: `apps/partner-booking-web`。**

- Tenant Admin Mode: `tenant-console-web`
- Partner Booking Mode: `partner-booking-web`
- Legacy tenant-console partner route: compatibility / rollback only

Production cutover remains per partner entry.

---

### Q-TEN04. Booking command vs direct REST

**裁決: Phase 1 uses synchronous command endpoints with command semantics。**

Not async queue by default.

Pattern:

```http
POST /api/tenant/bookings/commands/create
POST /api/tenant/bookings/{bookingId}/commands/update
POST /api/tenant/bookings/{bookingId}/commands/cancel
```

Each command returns immediate result or accepted state with commandId if external dependency is pending.

---

### Q-TEN05. Editable vs read-only booking

**裁決: Backend decides via `availableActions` and `editableUntil`。**

UI must not derive from status alone.

Booking read model exposes:

```ts
editableUntil: string | null;
readOnlyReasonCode: string | null;
availableActions: ResourceActionDescriptor[];
```

---

### Q-TEN06. Passenger / address deactivate / delete semantics

**裁決: soft deactivate, no hard delete in normal UI。**

- Existing bookings retain snapshot
- Address/passenger cannot cascade delete active bookings
- Deactivated records hidden from pickers but visible in historical detail

Privacy deletion is separate compliance workflow, not normal tenant UI delete.

---

### Q-TEN07. SLA profile threshold semantics

**裁決: unit = minutes。**

Fields:

```text
waitThresholdMin
arrivalThresholdMin
completionThresholdMin
```

Threshold changes affect new bookings and newly computed SLA events. Existing bookings keep SLA profile snapshot at creation unless explicitly recalculated by admin command.

---

### Q-TEN08. Webhook delivery log

**裁決: Phase 1 commitment is real delivery engine visibility, not mock。**

If webhook engine is not active, page must show `not_provisioned` / `no_deliveries`, not fake logs.

---

### Q-TEN09. API key issuance

**裁決: plaintext key shown once at creation / rotation。**

Modal requirements:

- show full key once
- copy button
- optional download `.txt`
- admin must check "I stored this key"
- later display masked suffix only

---

### Q-TEN10. Integration Governance aggregation

**裁決: 需要 aggregated readiness endpoint。**

Endpoint:

```http
GET /api/tenant/integration-governance/readiness
```

It aggregates:

- API keys
- webhooks
- notification subscriptions
- SLA profile
- report readiness
- enabled modules
- partner entries if any

UI should not orchestrate 6+ unrelated queries for this page.

---

### Q-TEN11. Cost centers route

**裁決: maps to Tenant Governance / Enterprise Finance module。**

It covers:

- cost center directory
- owner
- active/disabled state
- quota summary
- approval linkage
- reporting attribution

---

### Q-TEN12. Rules route

**裁決: maps to Tenant Governance Approval Rules module。**

It covers:

- approval rules
- quota-aware conditions
- dry-run evaluate
- approval mode
- approvers
- active / disabled / reorder

---

### Q-TEN13. Tenant audit visibility scope

**裁決: tenant own scope includes all actions on tenant-owned resources, regardless actor realm。**

Tenant can see:

- tenant user actions
- ops actions on tenant bookings / complaints
- platform admin actions affecting tenant config
- system actions affecting tenant resources

Sensitive fields are masked by policy.

---

## 5. Driver App Decisions

---

### Q-DRV01. Forwarded order accept / reject relay support

**裁決: Capability-driven per platform。**

Driver UI uses platform capability flags:

```ts
canRelayAccept: boolean;
canRelayReject: boolean;
relayUnavailableReasonCode?: string;
```

If unsupported:

- show task as mirror-only
- disable accept/reject CTA with reason
- never hide the task if it affects driver awareness

---

### Q-DRV02. Accept-pending race timeout

**裁決: Use platform-provided `acceptDeadlineAt`; default 30s if absent。**

When timeout hits:

- state becomes `offer_expired` or `lost_race` depending on external response
- accept button disabled
- driver sees safe copy: 「平台未確認此單，請勿再回應」
- no manual cancel required

---

### Q-DRV03. Lost race vs cancelled by platform

**裁決: distinct terminal states。**

| State                   | Meaning                                        | UI action                                               |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `lost_race`             | another driver won / platform did not confirm  | acknowledge only                                        |
| `cancelled_by_platform` | passenger/platform cancelled after offer/order | acknowledge only; may show compensation note if present |

They must not be collapsed.

---

### Q-DRV04. Manual fallback

**裁決: Driver app must receive an ops-issued instruction record, not just static label。**

Contract:

```ts
interface DriverOpsInstruction {
  instructionId: string;
  taskId: string;
  message: string;
  issuedBy: string;
  issuedAt: string;
  expiresAt?: string | null;
}
```

Displayed as in-app banner + optional push.

---

### Q-DRV05. Re-authentication flow per platform

**裁決: platform-configured auth mechanism。**

Supported mechanisms:

```text
external_browser_oauth
native_app_deeplink
manual_credential
ops_managed
```

Default preferred: `external_browser_oauth` / AppAuth-style external browser. In-app webview is not default for security.

---

### Q-DRV06. Platform bind / unbind authority

**裁決: platform config decides if driver-side bind/unbind allowed。**

- Driver can bind/unbind only if `driverSelfServiceBinding=true`
- Platform admin can revoke binding
- Ops can suspend platform availability temporarily

---

### Q-DRV07. Eligibility per service bucket

**裁決: eligibility is computed from driver profile + vehicle + platform config + tenant / partner rules。**

Driver UI receives:

```ts
eligibleServiceBuckets: string[];
ineligibleReasons: Array<{ bucket: string; reasonCode: string }>;
```

UI must show reason, not just hide unavailable work.

---

### Q-DRV08. Shift state and platform availability

**裁決: clock-out disables internal availability and may auto-offline external platforms if configured。**

Rules:

- Clocked out → internal DRTS unavailable
- External platforms: respect platform config `autoOfflineOnShiftEnd`
- Driver can manually take platform offline while clocked in

---

### Q-DRV09. Odometer validation

**裁決: integer required at shift start/end, with sanity checks。**

Rules:

- integer only
- end >= start
- default max delta per shift = 800 km
- over threshold requires confirmation and ops review flag

---

### Q-DRV10. Offline operation / replay

**裁決: partial offline model。**

| Action                                    | Offline behavior                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| accept / reject forwarded task            | blocked unless provider explicitly supports offline relay                  |
| owned task non-critical note              | local queue allowed                                                        |
| trip completion proof upload              | queued and replayed                                                        |
| status change affecting external platform | online required                                                            |
| SOS                                       | attempts native emergency flow + queues backend event when network returns |

---

### Q-DRV11. Two-step SOS confirmation

**裁決: tap opens SOS sheet; press-and-hold sends。**

Steps:

1. Tap SOS
2. SOS sheet opens with incident context
3. Press-and-hold 2 seconds to send

This is the contract. Visual design may choose exact styling but not change confirmation semantics.

---

### Q-DRV12. SOS ACK back to driver

**裁決: both native push and in-app persistent banner。**

ACK remains visible until driver dismisses or incident closes.

---

### Q-DRV13. Auto-accept

**裁決: per-platform, disabled by default。**

- Global auto-accept is not allowed in Phase 1
- Platform config must allow it
- Driver preference can only enable for allowed platforms
- Forwarded third-party orders require provider support

---

### Q-DRV14. Max accept radius

**裁決: unit = kilometers。**

Default:

```text
5 km for internal standard taxi / business dispatch
platform-specific override for external platforms
```

Global preference applies to DRTS-owned tasks; external platform radius may be read-only if platform owns matching.

---

## 6. Required Document Updates

These answers must be applied to:

```text
docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md
docs/01-product/driver-app-multi-platform-product-spec-20260507.md
docs/02-architecture/realtime-data-model-20260524.md
docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md
docs/02-architecture/notification-inbox-contract-20260524.md
docs/02-architecture/search-and-empty-state-contract-20260524.md
docs/02-architecture/ui-authority-actions-contract-20260524.md
docs/02-architecture/tenant-console-migration-plan-20260524.md
docs/02-architecture/driver-platform-binding-and-offline-contract-20260524.md
docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md
```

---

## 7. Functional Contracts to Add / Amend

The following contracts must be added or amended in `packages/contracts/src/index.ts` or its split contract modules:

```text
UiRefreshMetadata
UiHealthEnvelope
CrossAppResourceLink
UserNotificationRecord
ResourceActionDescriptor
EmptyStateEnvelope
SearchResultRecord
ActionReceipt
DriverOpsInstruction
DriverMatchingSuppression
TenantIntegrationReadinessSummary
TenantRolloutStateMachineRecord
```

---

## 8. Visual Design Handoff Impact

After this document lands, Claude / planning team can write the four visual-design hand-off packets:

```text
ops-console-design-handoff-packet-20260524.md
platform-admin-design-handoff-packet-20260524.md
tenant-console-design-handoff-packet-20260524.md
driver-app-design-handoff-packet-20260524.md
```

Each packet must reference the relevant question IDs and decisions above.

---

## 9. Deferred to Phase 2

The following are explicitly not Phase 1 design blockers:

```text
WebSocket live streaming
Unified admin shell / module federation
Full global search across all apps
Sequential ordered_chain approval execution beyond P1 downgrade
Auto-timeout approval cron beyond manual escalation / stub
Cost center hierarchy / inherited quota
Quarterly / yearly quota periods
Time-of-day / holiday approval conditions
Full consumer passenger app
Full self-driving runtime / AV operations UI
```

---

## 10. Final Instruction

視覺設計團隊不得讓 visual design team 自行決定上述問題。所有 visual design hand-off packets 必須以本文件作為 system behavior authority。
