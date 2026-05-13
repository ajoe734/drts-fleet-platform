# BE-QUOTA-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `BE-QUOTA-001` — Tenant Quota and Usage canonical read-model
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-13` (UTC, packet rev2)
**Snapshot anchor (parent `last_update`):** `2026-05-13T07:29:33Z`
**Snapshot anchor (sibling `BE-RULE-001` `last_update`):** `2026-05-13T07:39:10Z`
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, contract surface, or the parent task's
implementation files.

This packet is a reviewer-facing companion to `BE-QUOTA-001`, the Wave 3
Contract-Unblocker slice that publishes the tenant-visible quota / usage
read-model contract (`TenantQuotaSummary`, `TenantCostCenterQuotaSummary`,
`TenantBookingQuotaImpactQuery`) and the corresponding tenant-side API
surface so that `TEN-UI-RD-010` (TN_NewBooking quota impact card) and
`TEN-UI-RD-014` (TN_Rules quota-aware conditions) can fully unblock once
all three Wave 3 contract slices land. The parent task is the canonical
implementation slice; this packet pins the planning anchors, the hard
machine-truth dependency on `BE-CC-001` (already shipped under commit
`a7c1b9f`), the acceptance checklist the reviewer should walk, and the
unresolved spec questions the parent owner will need to answer (or accept
the defaults of) before the contract shape can be frozen.

At packet rev2 creation time the parent `BE-QUOTA-001` is
**`in_progress`** under owner `Codex2` with reviewer `Claude`
(availability-first reassignment from the original `Codex / Codex2` lane
after `Codex` paused for capacity reasons, recorded in
`ai-activity-log.jsonl` and surfaced in the parent's `next` field at
`2026-05-13T07:29:33Z`). The sidecar itself is owned by `Claude` with
reviewer `Codex2` (the prior `Codex -> Codex2` sidecar-reviewer reassign
was applied at the same time the parent reviewer rotated to `Claude`).
The hard dependency `BE-CC-001` is already `done`
(commit `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` on
`origin/feat/claude2-ui-redesign-foundation`), so the parent has the full
cost-center directory contract available as a stable anchor for the
quota read-model's cost-center granularity surface.

**Current-state caveat.** Every owner / reviewer / status / commit /
timestamp value below is the snapshot read out of `ai-status.json` at the
timestamps anchored in the header. The lifecycle fields move quickly —
in particular the parent's reviewer rotated from `Codex2` to `Claude`
between the rev1 and rev2 cuts of this packet, and the sidecar's
reviewer rotated from `Codex` to `Codex2`. Any reviewer reading this
packet must first re-read `ai-status.json` for the live values and treat
the live values as authoritative if they have drifted from the
snapshots below. This packet is not a substitute for machine truth.

Transient lifecycle truth (`status`, `next`, `last_update`,
`commit_hash`, `push_*` fields, reviewer messages) remains authoritative
only in `ai-status.json` and `ai-activity-log.jsonl`. This packet
snapshots the most recent values for reviewer convenience but does not
replace machine truth.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist
  keyed to the published planning packet and follow-up packet
- pin the planning anchors at
  `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
  (Contract 3 — Tenant Quota / Usage Read-Model) and
  `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
  (operational caveats + open questions Q4 and Q7 directly affect the
  quota contract shape)
- enumerate the upstream machine-truth dependency (`BE-CC-001`) and the
  downstream unblock map (`TEN-UI-RD-010`, `TEN-UI-RD-014`,
  indirectly `TEN-UI-RD-099` / `ADM-UI-RD-010` follow-ons)
- record the canonical implementation entry points the parent slice will
  extend (tenant-partner module, `packages/contracts/src/index.ts`,
  `packages/api-client/src/index.ts`, parity-decisions doc)
- record the unresolved spec questions (Q4 quota period attribution, Q7
  concurrent reservation semantics) that gate the contract finalisation
  and the defaults the backend will assume if no answer arrives by EOD
  2026-05-15

Out of scope:

- editing L1/L2 product truth, the parent task entry in `ai-status.json`,
  or any working-tree implementation files
  (`packages/contracts/src/index.ts`,
  `apps/api/src/modules/tenant-partner/`,
  `packages/api-client/src/index.ts`,
  `docs/05-ui/tenant-console-parity-decisions-20260510.md`)
- editing the upstream planning packets
  (`docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`,
  `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`)
- expanding into the sibling contract slice `BE-RULE-001` (approval
  rules) or the platform-admin-side `PlatformTenantQuotaSummary`; both
  are tracked in their own `ai-status.json` rows and are not part of
  the tenant-visible quota surface
- producing the parent slice's canonical implementation, typecheck, or
  test runs; this sidecar only frames the acceptance bar
- mutating or "absorbing" the parent task; the parent must still
  complete its own canonical closeout (`done` with commit + push
  evidence under the canonical implementation commit-evidence rule)

---

## 2. Machine Truth Anchors

### 2.1 Sidecar (this task) — `ai-status.json → BE-QUOTA-001-SIDECAR-ACCEPTANCE`

- id=`BE-QUOTA-001-SIDECAR-ACCEPTANCE`
- title=`Prepare BE-QUOTA-001 acceptance packet and dependency map`
- owner=`Claude`
- reviewer=`Codex2` (rotated from the original `Codex` lane; the prior
  `Codex` assignment was a stale snapshot — current machine truth is
  `Codex2`)
- phase=`Wave 3 Contract Unblockers`
- depends_on=`[BE-CC-001]`
- task_class=`sidecar`
- helper_parent=`BE-QUOTA-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- artifacts=`support/sidecars/BE-QUOTA-001/BE-QUOTA-001-SIDECAR-ACCEPTANCE.md`
- acceptance=
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`

### 2.2 Parent — `ai-status.json → BE-QUOTA-001` (snapshot at packet rev2, `last_update=2026-05-13T07:29:33Z`)

- id=`BE-QUOTA-001`
- title=`Tenant Quota and Usage canonical read-model`
- summary_zh=`建立 tenant-visible quota/usage read-model contract，
支援 TN_NewBooking quota impact card 與 TN_Rules quota-aware
conditions。`
- phase=`Wave 3 Contract Unblockers`
- owner=`Codex2` (current machine truth; reassigned availability-first
  from `Codex` while `Codex` was unavailable / occupied — see the
  parent's `next` quoted below)
- reviewer=`Claude` (current machine truth; rotated from `Codex2`
  after the chairman reassigned reviewers around the `Codex` capacity
  pause — same rotation applied symmetrically to the sibling slice
  `BE-RULE-001`, see §2.4)
- status=`in_progress` (at packet rev2 snapshot; the parent was
  `backlog` at the time the sidecar was auto-spawned)
- depends_on=`[BE-CC-001]`
- planning_ref=`docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
- unblocks=`[TEN-UI-RD-010, TEN-UI-RD-014]`
- mutates_canonical=`true`
- artifacts (declared in `ai-status.json`):
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/tenant-partner/`
  - `packages/api-client/src/index.ts`
  - `docs/05-ui/tenant-console-parity-decisions-20260510.md`
- acceptance (declared in `ai-status.json`):
  - 新增 `TenantQuotaSummary` /
    `TenantCostCenterQuotaSummary` /
    `TenantBookingQuotaImpactQuery`
  - API exposes tenant quota summary and booking quota preview surface
  - quota model supports tenant and cost-center granularity
  - `pnpm --filter @drts/api typecheck` passes
  - `pnpm --filter @drts/api test` passes
- `next` (verbatim from `ai-status.json` at packet rev2 snapshot):
  > Availability-first reassignment: Codex2 claimed BE-QUOTA-001 while
  > Codex was unavailable or occupied.
- no `commit_hash` / `commit_subject` / `push_remote` / `push_branch`
  recorded yet — parent has not produced a canonical commit yet.

### 2.3 Hard upstream dependency — `BE-CC-001`

- id=`BE-CC-001`
- title=`Tenant Cost-Center Directory canonical contract`
- owner=`Codex`
- reviewer=`Codex2`
- status=`done`
- mutates_canonical=`true`
- commit_hash=`a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- commit_subject=`feat(BE-CC-001): add tenant cost-center directory contract`
- push_remote=`origin`
- push_branch=`feat/claude2-ui-redesign-foundation`
- the published shape that `BE-QUOTA-001`'s cost-center granularity will
  reference is the already-frozen `TenantCostCenterRecord` interface in
  `packages/contracts/src/index.ts` (key: `tenantId` + `code`, see §3.2)
  and the four routes mounted on the tenant-partner module
  (`GET /api/tenant/cost-centers`, `GET /api/tenant/cost-centers/:code`,
  `POST /api/tenant/cost-centers`, `POST /api/tenant/cost-centers/disable`)

### 2.4 Sibling Wave 3 Contract Unblockers (informational, snapshot at packet rev2)

| Sibling task   | Status                                             | Owner / Reviewer (current)                                                                                                           | Depends on  | Relevance to `BE-QUOTA-001`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001`    | `done`                                             | `Codex` / `Codex2`                                                                                                                   | —           | Hard upstream dependency. The cost-center directory record is the key that the cost-center-scoped quota summary attaches to. Commit `a7c1b9f` on `origin/feat/claude2-ui-redesign-foundation`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `BE-RULE-001`  | `in_progress` (`last_update=2026-05-13T07:39:10Z`) | `Codex2` / `Claude` (reviewer reassigned from `Codex` to `Claude` after the `Codex` capacity pause; same rotation as `BE-QUOTA-001`) | `BE-CC-001` | Sibling Wave 3 slice. Its rule-evaluation surface references quota visibility through the `cost_center.monthly_quota_remaining_amount_minor` and `tenant.monthly_quota_remaining_amount_minor` rule-condition fields enumerated in the follow-up packet §3 item J. The quota read-model must publish those fields in a shape the rule engine can consume. Because `BE-RULE-001` is now in flight under the same owner lane (`Codex2`) as `BE-QUOTA-001`, the parent owner can coordinate field naming with themselves rather than across lanes, but the field shape is still load-bearing for the rule contract. |
| `BE-QUOTA-001` | `in_progress` (`last_update=2026-05-13T07:29:33Z`) | `Codex2` / `Claude`                                                                                                                  | `BE-CC-001` | This sidecar's parent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

`BE-RULE-001` does not formally `depends_on` `BE-QUOTA-001` in machine
truth, but its rule-condition whitelist references quota fields. Both
slices are currently owned by `Codex2` with reviewer `Claude`, so field-
shape coordination is an intra-lane responsibility: the `Codex2` owner
should land both contracts with a consistent monthly-quota field
naming so the rule engine does not have to re-declare quota types.

### 2.5 Authoritative supporting documents

- `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
  is the planning packet that the parent's `planning_ref` points at.
  It explicitly proposes Contract 3 — Tenant Quota / Usage Read-Model
  with these decisions and read surfaces:
  - granularity: per tenant, per cost-center (per-user deferred)
  - period: monthly default (quarterly / yearly deferred)
  - read surface:
    - `GET /tenant/quotas` — tenant-level summary
    - `GET /tenant/cost-centers/{code}/quota` — cost-center scoped
    - `GET /tenant/quotas/preview?costCenter=X&amount=N` —
      TN_NewBooking impact-card use case
  - new types: `TenantQuotaSummary`, `TenantCostCenterQuotaSummary`,
    `TenantBookingQuotaImpactQuery`
- `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
  is the design-team-facing follow-up that captured two of the four
  open spec questions directly affecting the quota contract shape:
  - **Q4** — quota period attribution (created-month vs trip-month vs
    both). Backend default if no answer by EOD 2026-05-15: trip-month
    (`(b)`), with `tenant_quota_usage_events.reserve` events timestamped
    at trip-month period start and `release` events on cancel.
  - **Q7** — concurrent quota reservation. Backend default: preview is
    non-binding, reservation happens at booking-create with an atomic
    ledger insert + conditional check, and `TenantQuotaUsage` adds
    `pendingReservedAmountMinor` / `confirmedAmountMinor` so the UI
    can explain why a preview can become stale.
  - **Item J** (`§3`) — rule-condition whitelist that references
    `cost_center.monthly_quota_remaining_amount_minor`,
    `cost_center.monthly_quota_remaining_percent`,
    `tenant.monthly_quota_remaining_amount_minor`,
    `tenant.monthly_quota_remaining_percent`. The quota read-model must
    expose these fields (or their direct precursors) so `BE-RULE-001`
    can read them without bespoke types.
- `packages/contracts/src/index.ts` lines `4159..4163` already define
  `PlatformTenantQuotaSummary` (`activeDrivers` / `monthlyBookings` /
  `monthlyApiCalls`). This is the **platform-admin-facing** quota
  capacity record used by `PlatformAdminTenantRecord` (line 4237). The
  parent slice introduces a **tenant-facing** quota summary that is
  conceptually distinct from `PlatformTenantQuotaSummary` even though
  the names rhyme:
  - `PlatformTenantQuotaSummary` is the platform's allotment ceiling
    granted to a tenant (capacity).
  - `TenantQuotaSummary` is the tenant's current consumption + remaining
    budget against that ceiling (usage), exposed inside the tenant
    surface. The contract must not collapse these two roles.

Precedence note (mirrors `AI_COLLABORATION_GUIDE.md` §2):

- product/business truth precedence:
  L1 product specs > service contracts > migration plan > extracted
  execution rules > seed planning notes.
- the parent slice introduces a new canonical contract surface, so it
  is by definition a `mutates_canonical=true` slice and is gated by the
  commit-evidence rule on closeout.

---

## 3. Dependency Map

### A. Hard upstream machine-truth dependency

| Dependency  | Status | Why it matters to `BE-QUOTA-001`                                                                                                                                                                                                                                                                                                      |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001` | `done` | The cost-center directory record (`TenantCostCenterRecord`, key `tenantId + code`) is the **identifier** the cost-center-scoped quota summary attaches to. Without the directory contract there is no canonical cost-center to budget against. `BE-CC-001` is already shipped under commit `a7c1b9f` so the parent slice can proceed. |

### B. Coupling to existing canonical surfaces (informational; no `depends_on` edge)

| Surface                                                                                                               | Why it matters for the quota read-model                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/index.ts` — `TenantCostCenterRecord`                                                          | The `code` field on this record is the foreign key the cost-center-scoped quota summary will reference. Field shape and tenant scoping (`tenantId + code`) are already frozen by `BE-CC-001`.                                                                                                                |
| `packages/contracts/src/index.ts` — `PlatformTenantQuotaSummary` (line 4159)                                          | Existing platform-admin allotment shape. The tenant-facing `TenantQuotaSummary` must not be conflated with this type. Whether they share fields (e.g. `monthlyBookings`) is a parent-slice modelling choice; this packet flags it but does not decide.                                                       |
| `packages/contracts/src/index.ts` — `CreateTenantBookingCommand.costCenter` / `UpdateTenantBookingCommand.costCenter` | Booking commands reference a canonical cost-center code (per the `BE-CC-001` JSDoc cross-reference). Quota preview (`TenantBookingQuotaImpactQuery`) needs to accept the same shape so the UI can call preview before submitting the booking.                                                                |
| `apps/api/src/modules/tenant-partner/`                                                                                | The Wave 3 follow-up packet explicitly recommends keeping the four contracts in the existing `tenant-partner` Nest module instead of opening a new `TenantGovernanceModule`. The parent slice should extend this module rather than create a new one.                                                        |
| `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:339-410`                                            | Existing throttling pattern: `@Throttle(READ_HEAVY_RATE_LIMIT)` on the four cost-center routes. The new quota routes should follow the same convention for their `GET` endpoints.                                                                                                                            |
| `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`                                                    | Existing repository pattern: `TenantPartnerState` slice + parallel `SELECT` / `INSERT ... ON CONFLICT` per resource. The parent slice will need a `quotaLedger` (or equivalent) slice and a `tenant_quota_usage_events` ledger table reference if the trip-month reservation semantics from Q4 default land. |
| `packages/api-client/src/index.ts`                                                                                    | Existing client pattern: typed `ApiClient` methods that wrap each REST route, `URLSearchParams` for `GET` query strings, `encodeURIComponent` on path components. The new quota client methods should match.                                                                                                 |
| `docs/05-ui/tenant-console-parity-decisions-20260510.md`                                                              | Existing parity-decisions doc with a `2026-05-13 Implementation Update` section from `BE-CC-001`. The parent slice should append a similar note for the quota contract surface.                                                                                                                              |

### C. Downstream consumer map

| Consumer        | Relationship                   | Why `BE-QUOTA-001` matters                                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-010` | partial unblock                | TN_NewBooking's quota impact card needs `TenantBookingQuotaImpactQuery` (preview before creating booking) and the tenant + cost-center summaries to render the card. `BE-CC-001` alone is necessary but not sufficient. After `BE-QUOTA-001` lands, the booking flow's quota impact card is unblocked end-to-end. |
| `TEN-UI-RD-014` | partial unblock                | TN_Rules' quota-aware conditions need the tenant + cost-center quota fields enumerated in the follow-up packet §3 item J (`cost_center.monthly_quota_remaining_amount_minor`, `tenant.monthly_quota_remaining_percent`, etc.). The rule-engine reads these fields out of `BE-QUOTA-001`'s read-model.             |
| `BE-RULE-001`   | sibling (no `depends_on` edge) | Rule-engine quota conditions consume `BE-QUOTA-001`'s field shape. The two parent owners should coordinate so the rule contract does not re-declare quota types.                                                                                                                                                  |
| `TEN-UI-RD-099` | indirect unblock               | Tenant console parity follow-up backlog item that depends on the Wave 3 contract trio landing. Auto-unblocks once `TEN-UI-RD-010` / `TEN-UI-RD-013` / `TEN-UI-RD-014` close.                                                                                                                                      |
| `ADM-UI-RD-010` | already done                   | Platform-admin Wave 3 closeout. Already `done` under commit `25daea0` — listed here only to disambiguate from the tenant-console follow-ons; the platform-admin closeout is not gated on `BE-QUOTA-001`.                                                                                                          |

Dispatch interpretation:

- The only hard `depends_on` edge pointing **at** `BE-QUOTA-001` is from
  the supervisor's downstream-unblock logic: the UI tasks
  `TEN-UI-RD-010` and `TEN-UI-RD-014` are listed under the parent's
  `unblocks` field but their formal `depends_on` edges live on their own
  `ai-status.json` rows.
- `review_approved` is not yet `done`; the supervisor's dependency-
  release logic gates on `done`, so until the parent owner posts
  canonical commit + push evidence, downstream rows stay blocked by
  machine truth even after review approval.

---

## 4. Open Spec Questions That Gate Contract Shape

The follow-up packet
`docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
captured seven open questions; two of them directly affect the
`BE-QUOTA-001` contract shape and one cross-cutting item (J) affects
the field naming. The parent owner should either obtain the design-team
answer or document acceptance of the stated default before freezing
the contract surface.

### 4.1 Q4 — Quota period attribution

> If a booking is created on 2026-05-30 with trip time 2026-06-02, which
> monthly bucket does it consume?

- (a) Created-month (2026-05) — operationally simpler
- (b) Trip-month (2026-06) — **backend default if no answer by EOD 2026-05-15**
- (c) Both — soft hold in created-month, settle in trip-month at completion

**Default behaviour:** trip-month attribution with
`tenant_quota_usage_events.reserve` events timestamped at trip-month
period start and `release` events on cancel. This is conceptually correct
for tenant budget management.

**Contract-shape implication:** `TenantQuotaSummary.periodStart` and
`TenantCostCenterQuotaSummary.periodStart` will be the trip-month
boundary (UTC). The `TenantBookingQuotaImpactQuery` request must include
the trip time so the backend can compute which bucket the preview
applies against.

### 4.2 Q7 — Concurrent quota reservation

> Two bookings hit `POST /api/tenant/quotas/preview` at the same time
> with 2,000 left in the bucket, each asking for 1,500. Both see OK.
> What protects the second `createTenantBooking` from over-spending?

**Backend default:**

- `POST /quotas/preview` is **non-binding** — reads current ledger state
- `createTenantBooking` performs an atomic ledger insert with
  conditional check (`amountMinorRemaining >= request.amountMinor`)
  inside the transaction. Second caller's insert fails →
  `QUOTA_INSUFFICIENT` error with the same shape as the preview.
- `TenantQuotaUsage` (referenced inside the summary types) exposes:
  - `pendingReservedAmountMinor` — booked but not yet
    completed/cancelled
  - `confirmedAmountMinor` — completed
  - `remaining` is still computed against (`pending + confirmed`)

**Contract-shape implication:** the parent slice must publish
`pendingReservedAmountMinor` and `confirmedAmountMinor` on the
`TenantQuotaSummary` / `TenantCostCenterQuotaSummary` types (or via a
nested `TenantQuotaUsage` block) so the UI can explain why a preview
can become stale. The error envelope for `createTenantBooking` must
include `QUOTA_INSUFFICIENT` as a recognised error code.

### 4.3 Item J (§3 of the follow-up) — Rule-condition field whitelist

The follow-up packet's §3 item J enumerates the P1 rule-condition field
whitelist that `BE-RULE-001` will ship against. The quota-related fields
in that whitelist are:

- `cost_center.monthly_quota_remaining_amount_minor`
- `cost_center.monthly_quota_remaining_percent`
- `tenant.monthly_quota_remaining_amount_minor`
- `tenant.monthly_quota_remaining_percent`

**Contract-shape implication:** the quota read-model must publish these
four values (or their direct precursors `remainingAmountMinor` /
`remainingPercent` on each of `TenantQuotaSummary` and
`TenantCostCenterQuotaSummary`) so `BE-RULE-001`'s rule engine can read
them without a bespoke contract. The parent owner should coordinate
field naming with the `BE-RULE-001` owner if the rule-engine field path
is exposed as a string.

### 4.4 Items decided unilaterally (notify-only, §3 of the follow-up)

These do not gate `BE-QUOTA-001` contract shape but the parent owner
should be aware of them while writing the implementation:

- **E. Rule evaluation timestamp** — creation-time snapshot; later quota
  changes do not retroactively re-decide existing approvals.
- **M. Legacy free-text cost center** — quota preview against a tenant
  with no active cost-centers in its directory should grandfather a
  free-text `costCenter` lookup (same behaviour as
  `validateBookingCostCenter`). The parent slice should mirror the
  grandfather-aware lookup `BE-CC-001-FU` introduced for booking
  validation rather than rejecting unknown codes.

---

## 5. Acceptance Bar Mapping

The parent's `ai-status.json` acceptance list maps onto the expected
working-tree changes as follows. Each row is a reviewer-actionable check
the parent reviewer (`Claude` at rev2; rotated from `Codex2`) should
walk before approving. If the parent reviewer rotates again between
this packet rev2 and the parent's review window, the live reviewer in
`ai-status.json` is authoritative.

| Parent acceptance bar                                                                        | Where to verify in the working tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新增 `TenantQuotaSummary` / `TenantCostCenterQuotaSummary` / `TenantBookingQuotaImpactQuery` | `packages/contracts/src/index.ts` — three new `export interface` blocks (plus any helper types such as `TenantQuotaUsage`). Verify field shape, nullability, monetary units (`amountMinor` convention), period attribution semantics from Q4, and pending/confirmed split from Q7. Verify the tenant-facing types are **not** conflated with the existing platform-admin `PlatformTenantQuotaSummary` (line 4159).                                                                                     |
| API exposes tenant quota summary and booking quota preview surface                           | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` — at least three new routes following the planning packet layout: `GET /tenant/quotas` (tenant summary), `GET /tenant/cost-centers/:code/quota` (cost-center scoped) or `GET /tenant/cost-centers/:code` extended, and `GET /tenant/quotas/preview?costCenter=X&amount=N&tripTime=ISO` (booking impact card). `@Throttle(READ_HEAVY_RATE_LIMIT)` on the `GET` handlers, `x-tenant-id` required, parity with the cost-center routes. |
| quota model supports tenant and cost-center granularity                                      | Service-layer additions in `tenant-partner.service.ts` (e.g. `getTenantQuotaSummary`, `getCostCenterQuotaSummary`, `previewBookingQuotaImpact`). Repository-layer additions in `tenant-partner.repository.ts` (e.g. `tenantQuotaLedger` slice, `core.phase1_tenant_quota_usage_events` SELECT/INSERT path with the conditional-check insert semantics from Q7). Tenant-scoped queries throughout.                                                                                                      |
| `pnpm --filter @drts/api typecheck` passes                                                   | Reviewer should re-run this command after the handoff. The parent owner should also report it in the `handoff` message.                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm --filter @drts/api test` passes                                                        | New unit tests required: (a) tenant summary read with seeded ledger, (b) cost-center summary read with seeded ledger, (c) preview against insufficient budget returns `QUOTA_INSUFFICIENT`-shaped response, (d) concurrent reservation regression — two preview-OK callers race on `createTenantBooking` and the second insert fails atomically, (e) grandfather-aware preview when the tenant has no active cost-centers. Reviewer should re-run after handoff.                                       |

Additional acceptance items the reviewer should walk (derived from the
planning packet and follow-up packet, not from `ai-status.json` but
necessary for contract correctness):

| Derived acceptance bar                                                                              | Where to verify                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-client` parity — `listTenantQuota()`, `getCostCenterQuota(code)`, `previewBookingQuota(query)` | `packages/api-client/src/index.ts` — three new methods on `ApiClient` following the existing cost-center pattern (`URLSearchParams` for `GET`, `encodeURIComponent` on path components).                                                                                        |
| Parity-decisions doc note                                                                           | `docs/05-ui/tenant-console-parity-decisions-20260510.md` — append a `2026-05-13 Implementation Update` block (or use the next available date) enumerating the new record types, REST routes, and the unblock note for `TEN-UI-RD-010` / `TEN-UI-RD-014`.                        |
| `pnpm --filter @drts/api-client typecheck` passes                                                   | Recommended extra check given the new `api-client` methods (matches the `BE-CC-001` first-handoff convention).                                                                                                                                                                  |
| Open-question defaults documented in the closing handoff message                                    | The parent owner should explicitly state in the `handoff` message which of Q4 / Q7 defaults were taken (or which design-team answer arrived) so the reviewer and the downstream `BE-RULE-001` owner can audit the choice.                                                       |
| `QUOTA_INSUFFICIENT` error code wired into the booking write path                                   | `tenant-partner.service.ts` (or whichever module owns `createTenantBooking`) returns a structured `ApiRequestError` with code `QUOTA_INSUFFICIENT` and a remaining-budget payload the UI can render. This is the only **write-side coupling** the read-model contract requires. |
| Grandfather-aware preview against a tenant with no active cost-centers                              | Mirrors `BE-CC-001-FU`'s `validateBookingCostCenter` grandfather semantics. The preview should not reject a free-text `costCenter` for tenants with an empty directory; it should return a summary that the UI can render without throwing.                                     |

---

## 6. Reviewer Handoff Notes

1. Re-check the parent's lifecycle against `ai-status.json` and
   `ai-activity-log.jsonl` first, not `current-work.md`. At the rev2
   snapshot the parent `BE-QUOTA-001` is `in_progress` under owner
   `Codex2` with reviewer `Claude` (rotated from `Codex / Codex2` as
   described in §2.2). If the parent owner has already submitted
   canonical contract changes, or if the lane has rotated again,
   between rev2 of this packet and the sidecar review window, that
   state is authoritative and supersedes the snapshot here.
2. Treat the Q4 / Q7 defaults from the follow-up packet as **proposed
   defaults**, not as accepted decisions. If the design team replies
   before the parent slice freezes the contract shape, the parent
   owner's `handoff` message must record which choice the contract
   reflects. If no reply arrives by EOD 2026-05-15, the defaults stand
   and the `handoff` message should call that out explicitly.
3. Coordinate field naming with the `BE-RULE-001` owner (also `Codex2`
   under reviewer `Claude` — same lane as `BE-QUOTA-001` after the
   reassignment) on the four quota-related rule-condition fields
   enumerated in §4.3. Because both Wave 3 slices currently live in the
   same owner lane, the coordination cost is lower than when this
   packet was first drafted, but the field shape is still load-bearing
   for the rule engine — the rule engine consumes these fields by
   string path, so any rename downstream is breaking.
4. Do **not** collapse `TenantQuotaSummary` (tenant-facing usage) into
   the existing platform-admin `PlatformTenantQuotaSummary` (allotment
   capacity). They serve different roles and live on different surfaces.
5. The parent's commit-evidence rule applies on the way to `done`. This
   is a `mutates_canonical=true` slice, so `NO_COMMIT_REQUIRED=1` is
   not available for `BE-QUOTA-001`; the parent owner must produce a
   real commit with `LLM-Agent: Codex2`, `Task-ID: BE-QUOTA-001`,
   `Reviewer: Claude` trailers (mirroring the current owner / reviewer
   lane) and a normal non-force push. Until that commit + push lands,
   downstream `TEN-UI-RD-010` and `TEN-UI-RD-014` stay blocked in
   machine truth even after `review_approved`. If the lane rotates
   again before commit, the trailers must match whichever owner /
   reviewer pair is recorded in `ai-status.json` at finalize time, not
   the rev2 snapshot here.
6. This sidecar is a support-only docs slice. No commit or push evidence
   is needed before owner handoff to sidecar review; the machine-truth
   transition required from this owner step is
   `AI_NAME=Claude scripts/ai-status.sh handoff
BE-QUOTA-001-SIDECAR-ACCEPTANCE Codex2 "<note>"`, and the sidecar
   may use `NO_COMMIT_REQUIRED=1` at its own closeout (`done`) because
   it is a `task_class: sidecar` artifact under the
   `helper_kind: acceptance_packet` allowance. The handoff target
   `Codex2` matches the current sidecar reviewer; if the sidecar
   reviewer rotates again before handoff the owner must adjust the
   handoff target accordingly.

---

## 7. Acceptance Checklist For This Support Packet

Reviewer `Codex2` should treat this as a docs-only support artifact. The
goal is to confirm that the packet correctly frames the parent's
implementation scope, the dependency edges, and the open spec questions.

### A. Parent-task alignment

- [ ] `BE-QUOTA-001` is in `ai-status.json` with `owner=Codex2`,
      `reviewer=Claude`, `phase=Wave 3 Contract Unblockers`,
      `depends_on=[BE-CC-001]`, and `mutates_canonical=true` (rev2
      snapshot — if the lane has rotated again, treat live machine
      truth as authoritative).
- [ ] `BE-QUOTA-001` declares acceptance items matching §5 verbatim
      (three new types, API surface for summary + preview, tenant and
      cost-center granularity, typecheck + test gates).
- [ ] `BE-QUOTA-001.planning_ref` still points at
      `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`.
- [ ] `BE-QUOTA-001.unblocks` still contains exactly `TEN-UI-RD-010`
      and `TEN-UI-RD-014`.
- [ ] `BE-RULE-001` is `in_progress` with `owner=Codex2`,
      `reviewer=Claude` (same lane as `BE-QUOTA-001` after the
      reassignment cascade).

### B. Dependency completeness

- [ ] `BE-CC-001` is `done` in `ai-status.json` with
      `commit_hash=a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` on
      `origin/feat/claude2-ui-redesign-foundation`.
- [ ] `TenantCostCenterRecord` is exported from
      `packages/contracts/src/index.ts` at lines `1193..1205` with the
      shape recorded in §2.3.
- [ ] The four cost-center routes still exist in
      `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
      lines `339..410`.

### C. Planning anchor completeness

- [ ] `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
      still defines Contract 3 — Tenant Quota / Usage Read-Model with
      the three new types and three read-surface routes recorded in §2.5.
- [ ] `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
      still records Q4, Q7, and §3 item J as open questions /
      unilateral decisions.

### D. Support-artifact guardrails

- [ ] This sidecar only adds
      `support/sidecars/BE-QUOTA-001/BE-QUOTA-001-SIDECAR-ACCEPTANCE.md`.
- [ ] No canonical truth was modified to produce this packet —
      `packages/contracts/`, the tenant-partner module, the api-client
      surface, the parity-decisions doc, and `ai-status.json` are not
      touched by this sidecar's diff.
- [ ] No runtime verification is claimed as newly executed by this
      sidecar; all reviewer-actionable verification belongs to the
      parent slice.
- [ ] Reviewer handoff message states clearly that the parent is still
      `in_progress` and that the canonical implementation, typecheck,
      test, commit, and push are the remaining lifecycle steps for
      `BE-QUOTA-001`.

---

## 8. Verification Notes For Owner Handoff

Checks performed while preparing rev2 of this packet (read-only against
machine-truth files and the working tree):

- confirmed `BE-QUOTA-001-SIDECAR-ACCEPTANCE` exists in `ai-status.json`
  as a `sidecar` / `acceptance_packet` task owned by `Claude` with
  reviewer `Codex2` and `helper_parent: BE-QUOTA-001`. The earlier
  reviewer value `Codex` was stale and has been refreshed in rev2.
- confirmed parent `BE-QUOTA-001` is currently `in_progress` under
  `Codex2` / `Claude` (rev2 machine truth, `last_update=2026-05-13T07:29:33Z`)
  with the acceptance list and `unblocks` list reproduced verbatim in
  §2.2. The earlier `Codex` / `Codex2` snapshot reflected the
  pre-availability-first-reassignment state and is no longer accurate.
- confirmed sibling `BE-RULE-001` is currently `in_progress` under
  `Codex2` / `Claude` (rev2 machine truth, `last_update=2026-05-13T07:39:10Z`).
  The earlier `backlog` snapshot was pre-start; `BE-RULE-001` started
  before this packet rev2 was cut and now lives in the same lane as
  `BE-QUOTA-001`.
- confirmed hard upstream `BE-CC-001` is `done` with commit
  `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` on
  `origin/feat/claude2-ui-redesign-foundation`.
- confirmed `TenantCostCenterRecord` is exported from
  `packages/contracts/src/index.ts:1193`.
- confirmed `PlatformTenantQuotaSummary` exists at line `4159` and is
  used by `PlatformAdminTenantRecord.quotas` at line `4237`,
  distinguishing it from the new tenant-facing summary the parent slice
  will introduce.
- confirmed the four cost-center routes exist at
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:339..410`
  with `@Throttle(READ_HEAVY_RATE_LIMIT)` on the `GET` handlers.
- confirmed the planning packets at
  `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
  and `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
  exist and define the Wave 3 contract trio plus the open spec
  questions.

No runtime commands were executed by this sidecar. This packet is
limited to support-material consolidation and reviewer handoff
preparation; the typecheck / test / commit / push verifications belong
to the parent slice and are tracked on `BE-QUOTA-001`, not on this
sidecar row.
