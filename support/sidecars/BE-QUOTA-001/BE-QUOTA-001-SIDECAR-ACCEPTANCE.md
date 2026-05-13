# BE-QUOTA-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `BE-QUOTA-001` — Tenant Quota / Usage Read-Model + atomic ledger
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Gemini2`
**Generated:** `2026-05-13` (UTC, packet rev3)
**Snapshot anchor (parent `last_update`):** `2026-05-13T11:24:08Z`
**Snapshot anchor (sidecar `last_update`):** `2026-05-13T11:26:35Z`
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, contract surface, or the parent task's
implementation files.

> **Rev3 supersedes rev2.** The supervisor sweep at commit `13f4b33`
> re-registered the tenant-governance wave from the design response under
> `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`,
> which expanded `BE-QUOTA-001` from a thin 3-type / 3-route read-model
> into a full **quota policy + atomic ledger + monthly snapshot** slice
> with 12 contract types, 5 REST routes, 3 new tables, three audit
> events, a `reserveTenantQuota` method gated by `SELECT ... FOR UPDATE`,
> and `QUOTA_INSUFFICIENT_AT_COMMIT` error code semantics. The rev2 Q4
> and Q7 "backend defaults" are now **resolved design decisions** anchored
> in the execution packet, not open questions. Reviewer for this sidecar
> rotated from `Codex2` (rev2) to `Gemini2` (rev3 machine truth).
> Reviewer must treat the execution packet as the canonical planning
> anchor and the prior planning packet pair as historical context only.

This packet is a reviewer-facing companion to `BE-QUOTA-001`. The parent
task is the canonical implementation slice; this packet pins the planning
anchor, the hard machine-truth dependency on `BE-CC-001` (already shipped
under commit `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`), the acceptance
checklist the reviewer should walk, the in-flight reconciliation hazard
the parent owner must address before shipping (the worktree already
contains a non-ledger-shape implementation predating the design
response), and the downstream dependency edge to `BE-APR-001` which now
formally depends on `BE-QUOTA-001`'s ledger types.

**Current-state caveat.** Every owner / reviewer / status / commit /
timestamp value below is the snapshot read out of `ai-status.json` at the
timestamps anchored in the header. The lifecycle fields move quickly —
in particular the sidecar reviewer rotated from `Codex2` (rev2) to
`Gemini2` (rev3), and the parent's scope was significantly expanded
between rev2 and rev3. Any reviewer reading this packet must first
re-read `ai-status.json` for the live values and treat the live values
as authoritative if they have drifted from the snapshots below. This
packet is not a substitute for machine truth.

Transient lifecycle truth (`status`, `next`, `last_update`,
`commit_hash`, `push_*` fields, reviewer messages) remains authoritative
only in `ai-status.json` and `ai-activity-log.jsonl`. This packet
snapshots the most recent values for reviewer convenience but does not
replace machine truth.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist
  keyed to the new execution packet `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  (Section 4.3 — `BE-QUOTA-001` — Tenant Quota / Usage Read-Model + Ledger)
  and to the shared contract definitions in Section 3 of the same
  packet
- pin the hard upstream machine-truth dependency (`BE-CC-001`, `done`)
  and the downstream unblock map (`TEN-UI-RD-010`, `TEN-UI-RD-014`,
  `BE-APR-001`, and through them `TEN-UI-RD-099`)
- record the canonical implementation entry points the parent slice will
  extend or add: `packages/contracts/src/index.ts`, the tenant-partner
  Nest module, the **new** `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`
  file, three **new** tables under `core.phase1_tenant_quota_*`, the
  `packages/api-client/src/index.ts` surface, and the two new
  `apps/api/tests/unit/tenant-quota-ledger.test.ts` /
  `apps/api/tests/unit/tenant-partner.service.test.ts` test files
- record the **in-flight reconciliation hazard**: the worktree already
  contains uncommitted edits on `tenant-partner.controller.ts`,
  `tenant-partner.service.ts`, and `packages/api-client/src/index.ts`
  that implement the rev2 (pre-design-response) shape — `previewBookingQuotaImpact`
  with `{costCenter, amountMinor, currency, tripStartsAt}`, no ledger,
  no policy CRUD. The execution packet §4.3 explicitly warns the parent
  owner to reconcile; the reviewer must verify that the final commit
  matches the design-response shape, not the in-flight rev2 shape
- record the resolved design decisions (Q4 period attribution, Q7
  concurrent reservation, M legacy free-text grandfather, and item J
  rule-condition field whitelist) and where each is captured in the
  execution packet so the reviewer does not have to chase them
- record the audit event shape, the `QUOTA_INSUFFICIENT_AT_COMMIT`
  error code, the `SELECT ... FOR UPDATE` lock requirement, and the
  test matrix expected at handoff

Out of scope:

- editing L1/L2 product truth, the parent task entry in `ai-status.json`,
  or any working-tree implementation files
  (`packages/contracts/src/index.ts`,
  `apps/api/src/modules/tenant-partner/`,
  `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`,
  `packages/api-client/src/index.ts`,
  `apps/api/tests/unit/tenant-quota-ledger.test.ts`,
  `apps/api/tests/unit/tenant-partner.service.test.ts`,
  `docs/05-ui/tenant-console-parity-decisions-20260510.md`)
- editing the upstream planning packets
  (`docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`,
  `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`,
  `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`)
- expanding into the sibling contract slices `BE-RULE-001` (approval
  rules) or `BE-APR-001` (approval workflow); both are tracked in their
  own `ai-status.json` rows with their own owner / reviewer lanes
- producing the parent slice's canonical implementation, typecheck, or
  test runs; this sidecar only frames the acceptance bar
- mutating or "absorbing" the parent task; the parent must still
  complete its own canonical closeout (`done` with commit + push
  evidence under the canonical implementation commit-evidence rule)
- reconciling the in-flight rev2-shape implementation directly; the
  parent owner is responsible for that reconciliation. This packet only
  records the hazard

---

## 2. Machine Truth Anchors

### 2.1 Sidecar (this task) — `ai-status.json → BE-QUOTA-001-SIDECAR-ACCEPTANCE`

- id=`BE-QUOTA-001-SIDECAR-ACCEPTANCE`
- title=`Prepare BE-QUOTA-001 acceptance packet and dependency map`
- owner=`Claude`
- reviewer=`Gemini2` (rev3 machine truth; rotated from `Codex2` in
  the supervisor sweep at commit `13f4b33`; earlier rev2 snapshot
  showed `Codex2`)
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

### 2.2 Parent — `ai-status.json → BE-QUOTA-001` (snapshot at packet rev3, `last_update=2026-05-13T11:24:08Z`)

- id=`BE-QUOTA-001`
- title=`Tenant Quota / Usage Read-Model + atomic ledger` (rev3; the
  rev2 title was `Tenant Quota and Usage canonical read-model`)
- summary_zh=`建立 tenant + cost-center quota policy / usage / ledger
契約。Period 歸 reservationWindowStart 月份 (Asia/Taipei)。
reserveTenantQuota 在 booking-write tx 內以 SELECT FOR UPDATE 解決 Q7
並發競爭，preview API 為非綁定 UX 用途。`
- phase=`Wave 3 Contract Unblockers`
- owner=`Codex2` (rev3 machine truth; availability-first claim
  recorded in the activity log at `2026-05-13T11:24:20Z` while
  `Gemini2` was unavailable)
- reviewer=`Claude` (rev3 machine truth)
- status=`backlog` (rev3 snapshot; was `in_progress` at rev2 but the
  supervisor sweep at `13f4b33` rewrote acceptance fields and reset the
  lifecycle; if the parent owner has started again between this
  snapshot and the reviewer's read window, live machine truth wins)
- depends_on=`[BE-CC-001]`
- planning_ref=`docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  (rev3; the rev2 anchor was `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`)
- unblocks=`[TEN-UI-RD-010, TEN-UI-RD-014, BE-APR-001]` (rev3; rev2
  was `[TEN-UI-RD-010, TEN-UI-RD-014]` — `BE-APR-001` is new)
- mutates_canonical=`true`
- artifacts (declared in `ai-status.json`, rev3):
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts` (new)
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
  - `packages/api-client/src/index.ts`
  - `apps/api/tests/unit/tenant-quota-ledger.test.ts` (new)
  - `apps/api/tests/unit/tenant-partner.service.test.ts`
- acceptance (declared in `ai-status.json`, rev3 — 11 bullets, see §5
  for the verbatim list and where to verify each):
  - 12 new contract types
  - 3 new tables under `core.phase1_tenant_quota_*`
  - `reserveTenantQuota` inside booking-write tx with `SELECT ... FOR UPDATE`
  - period attribution = `reservationWindowStart` month in Asia/Taipei
  - `hard_block` over-limit reserve throws `QUOTA_INSUFFICIENT_AT_COMMIT`
  - 5 REST routes under `/api/tenant/quotas` (+ cost-center scoped)
  - 3 audit event types
  - 5 new api-client methods
  - race test (two concurrent reservers against the last unit)
  - `pnpm --filter @drts/contracts build` + `pnpm --filter @drts/api typecheck` + test pass
- `next` (verbatim from `ai-status.json` at packet rev3 snapshot):
  > Availability-first claim: Codex2 self-claimed BE-QUOTA-001 while
  > Gemini2 was unavailable or occupied.
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
- the published shape that `BE-QUOTA-001`'s cost-center-scoped quota
  policy + summary attaches to is the frozen `TenantCostCenterRecord`
  interface in `packages/contracts/src/index.ts` (the directory record
  keyed by `tenantId + code`) and the four mounted cost-center routes
  on `tenant-partner.controller.ts` (`GET tenant/cost-centers`,
  `GET tenant/cost-centers/:code`, `POST tenant/cost-centers`,
  `POST tenant/cost-centers/disable`). The fifth route
  `GET tenant/cost-centers/:code/quota` is the **new** cost-center-scoped
  quota summary route owned by `BE-QUOTA-001`, already partially
  present in the working tree but in the rev2 shape (see §6
  reconciliation hazard).

### 2.4 Sibling Wave 3 Contract Unblockers (informational, snapshot at packet rev3)

| Sibling task           | Status                    | Owner / Reviewer (current)                                                                                              | Depends on                    | Relevance to `BE-QUOTA-001`                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BE-CC-001`            | `done`                    | `Codex` / `Codex2`                                                                                                      | —                             | Hard upstream dependency. Cost-center directory record is the key the cost-center-scoped quota policy + summary attaches to. Shipped under commit `a7c1b9f`.                                                                                                                                                                                                                                                                   |
| `BE-CC-001-FU-BILLING` | `backlog`                 | `Gemini2` / `Codex`                                                                                                     | `BE-CC-001`                   | Cost-center backfill report + billing/reporting linkage. Does not gate `BE-QUOTA-001`. Sister sidecar acceptance packet `BE-CC-001-FU-BILLING-SIDECAR-ACCEPTANCE` is in-flight under `Codex2 / Gemini2`.                                                                                                                                                                                                                       |
| `BE-RULE-001`          | `backlog` (rev3 snapshot) | `Codex` / `Claude` (rev3 final snapshot; rotated mid-packet from `Codex2` / `Gemini2` and earlier `Claude` / `Gemini2`) | `BE-CC-001`                   | Sibling Wave 3 slice. Rule engine consumes `TenantQuotaLedgerEntry` semantics and the `cost_center.monthly_quota_remaining_*` / `tenant.monthly_quota_remaining_*` fields (execution packet §3 / §4.2 item J). Owned by a different lane than `BE-QUOTA-001` — field-shape coordination is **cross-lane**. The lane has rotated multiple times today; reviewers must re-read live machine truth before acting on the snapshot. |
| `BE-QUOTA-001`         | `backlog` (rev3 snapshot) | `Codex2` / `Claude` (rev3)                                                                                              | `BE-CC-001`                   | This sidecar's parent.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `BE-APR-001`           | `backlog` (rev3 snapshot) | `Codex` / `Codex2` (rev3)                                                                                               | `BE-RULE-001`, `BE-QUOTA-001` | Tenant approval workflow. Now formally depends on `BE-QUOTA-001` (was not in the rev2 dependency graph). Approval request creation calls `reserveTenantQuota` inside the booking-write transaction and reads back the impacts list — the ledger / impact result shape is the contract surface `BE-APR-001` consumes.                                                                                                           |

`BE-RULE-001` does not formally `depends_on` `BE-QUOTA-001` in machine
truth, but its rule-condition whitelist (execution packet §4.2 item J)
references quota fields:

- `cost_center.monthly_quota_remaining_amount_minor`
- `cost_center.monthly_quota_remaining_percent`
- `tenant.monthly_quota_remaining_amount_minor`
- `tenant.monthly_quota_remaining_percent`

At the rev3 final-snapshot read `BE-RULE-001` is owned by
`Codex / Claude` and `BE-QUOTA-001` by `Codex2 / Claude`. Earlier in
the same day the rule slice cycled through `Codex2 / Gemini2` and
`Claude / Gemini2`, so the lane has rotated three times since the
supervisor sweep registered the wave. Regardless of which precise
lane the reviewer sees at action time, the two slices are in
**different owner / reviewer lanes** and the field-shape coordination
is a **cross-lane** concern. The rev2 packet's intra-lane-coordination
assumption is no longer valid.

`BE-APR-001` formally depends on both `BE-RULE-001` and `BE-QUOTA-001`.
The approval workflow's `createApprovalRequest` flow folds the result of
`reserveTenantQuota` into a single `TenantApprovalEvaluationResult` so
the booking write sees both rule decisions and quota impacts in one
transaction. The parent owner of `BE-QUOTA-001` should expose
`reserveTenantQuota` with the signature in execution packet §4.3
"Reservation flow" and the return shape `{ ledgerEntries, impacts }`.

### 2.5 Authoritative supporting documents

- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  is the **rev3 canonical planning anchor** (was archived in commit
  `45f86cd`). Section 4.3 contains the full `BE-QUOTA-001` spec
  including:
  - file targets (the new `tenant-quota-ledger.ts` file and the two
    new test files)
  - contract additions (record + command + summary + impact-result + query
    - preview types)
  - API surface (`GET /api/tenant/quotas`, `GET /api/tenant/cost-centers/{costCenterCode}/quota`,
    `POST /api/tenant/quotas/policies`, `POST /api/tenant/quotas/preview`,
    `GET /api/tenant/quotas/ledger?periodKey=YYYY-MM&costCenterCode=...`)
  - the `reserveTenantQuota(tx, input)` pseudo-code with the 7-step
    `SELECT FOR UPDATE` flow
  - the booking lifecycle table (`reserve` / `adjust` / `release` /
    `consume`)
  - the explicit in-flight reconciliation note that the rev2
    implementation must be reworked to ledger-shape
- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  §3 contains the shared types `TenantQuotaPeriod`, `TenantQuotaEnforcementMode`,
  `TenantQuotaLimit`, `TenantQuotaUsage` (with `bookingCountReserved`,
  `bookingCountConsumed`, `amountMinorReserved`, `amountMinorConsumed`,
  `bookingCountRemaining`, `amountMinorRemaining`, `remainingPercent`),
  `TenantQuotaLedgerEntry`, and `TenantBookingQuotaImpactResult`. These
  are the types `BE-QUOTA-001` owns and `BE-RULE-001` / `BE-APR-001`
  consume.
- `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
  remains valid as the **earlier** planning packet that surfaced
  Contract 3 — Tenant Quota / Usage Read-Model. It is no longer the
  primary anchor (the execution packet is) but reviewers may consult it
  for the original tenant-UI use cases (TN_NewBooking quota impact card,
  TN_Rules quota-aware conditions). The execution packet supersedes its
  contract shape proposals — do not use the rev2 3-type shape as the
  source of truth.
- `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
  remains valid as the historical record of how Q4, Q7, and item J
  were resolved. The execution packet now embeds the resolved
  decisions; this packet contains the decision trail.
- `packages/contracts/src/index.ts` already defines
  `PlatformTenantQuotaSummary` (around line `3989`) used by
  `PlatformAdminTenantRecord.quotas`. This is the
  **platform-admin-facing** quota capacity record (allotment ceiling
  granted to a tenant). The parent slice introduces a **tenant-facing**
  set of summaries (`TenantQuotaSummary`, `TenantCostCenterQuotaSummary`)
  that report the tenant's consumption + remaining budget against that
  ceiling. The contract must not collapse these two roles even though
  the names rhyme. (Line numbers drift quickly; reviewer should `grep`
  rather than rely on these snapshot indices.)

Precedence note (mirrors `AI_COLLABORATION_GUIDE.md` §2):

- product/business truth precedence:
  L1 product specs > service contracts > migration plan > extracted
  execution rules > seed planning notes including the execution packet.
- the parent slice introduces a new canonical contract surface, three
  new tables, and a transactional reservation flow, so it is by
  definition a `mutates_canonical=true` slice and is gated by the
  commit-evidence rule on closeout.

---

## 3. Dependency Map

### A. Hard upstream machine-truth dependency

| Dependency  | Status | Why it matters to `BE-QUOTA-001`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001` | `done` | The cost-center directory record (`TenantCostCenterRecord`, key `tenantId + code`) is the **identifier** the cost-center-scoped quota policy and cost-center-scoped summary attach to. Without the directory contract there is no canonical cost-center to budget against. `BE-CC-001` is already shipped under commit `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` on `origin/feat/claude2-ui-redesign-foundation` so the parent slice can proceed without an external block. |

### B. Coupling to existing canonical surfaces (informational; no `depends_on` edge)

| Surface                                                                                                               | Why it matters for the quota read-model                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/index.ts` — `TenantCostCenterRecord`                                                          | The `code` field on this record is the foreign key the cost-center-scoped quota policy and the cost-center-scoped summary will reference. Field shape and tenant scoping (`tenantId + code`) are already frozen by `BE-CC-001`.                                                                                                                                                                                                                                                                                   |
| `packages/contracts/src/index.ts` — `PlatformTenantQuotaSummary`                                                      | Existing platform-admin allotment shape. The tenant-facing `TenantQuotaSummary` must not be conflated with this type. Whether the platform-side summary should later be derived from the tenant-side ledger is a future modelling decision; this packet flags it but does not decide.                                                                                                                                                                                                                             |
| `packages/contracts/src/index.ts` — `CreateTenantBookingCommand.costCenter` / `UpdateTenantBookingCommand.costCenter` | Booking commands reference a canonical cost-center code (per the `BE-CC-001` JSDoc cross-reference). The quota preview path (`TenantBookingQuotaImpactQuery`) must accept the same shape so the UI can call preview before submitting the booking.                                                                                                                                                                                                                                                                |
| `apps/api/src/modules/tenant-partner/`                                                                                | The execution packet recommends keeping the four new contracts in the existing `tenant-partner` Nest module rather than opening a new `TenantGovernanceModule`. The parent slice should extend this module rather than create a new one. The ledger primitives should live in the **new** `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts` file so the lock semantics stay reviewable apart from the service-orchestrator file.                                                                       |
| `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`                                                    | Existing throttling pattern: `@Throttle(READ_HEAVY_RATE_LIMIT)` on the four cost-center routes. The new quota `GET` routes should follow the same convention. Existing cost-center routes are mounted at `tenant/cost-centers`, `tenant/cost-centers/:code`, `tenant/cost-centers (POST)`, `tenant/cost-centers/disable (POST)`. The new quota routes are mounted at `tenant/quotas`, `tenant/cost-centers/:code/quota`, `tenant/quotas/policies (POST)`, `tenant/quotas/preview (POST)`, `tenant/quotas/ledger`. |
| `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`                                                    | Existing repository pattern: `TenantPartnerState` slice + parallel `SELECT` / `INSERT ... ON CONFLICT` per resource. The parent slice introduces three new tables (`core.phase1_tenant_quota_policies`, `core.phase1_tenant_quota_ledger`, `core.phase1_tenant_quota_monthly_snapshots`) and must implement `SELECT ... FOR UPDATE` on the policy row + snapshot row at reserve time.                                                                                                                             |
| `packages/api-client/src/index.ts`                                                                                    | Existing client pattern: typed `ApiClient` methods that wrap each REST route, `URLSearchParams` for `GET` query strings, `encodeURIComponent` on path components. The five new quota client methods should match.                                                                                                                                                                                                                                                                                                 |
| `docs/05-ui/tenant-console-parity-decisions-20260510.md`                                                              | Existing parity-decisions doc with a `2026-05-13 Implementation Update` section from `BE-CC-001`. The parent slice should append a similar note for the quota contract surface, including the ledger semantics (`reserve` / `release` / `consume` / `adjust`), the period-attribution rule (Asia/Taipei trip-month), the `QUOTA_INSUFFICIENT_AT_COMMIT` error code, and the audit event names.                                                                                                                    |
| `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md` §3 / §4.2 / §4.3 / §4.4                        | The execution packet is the rev3 planning anchor. §3 declares the shared quota types `BE-QUOTA-001` owns. §4.2 enumerates the rule-condition field whitelist `BE-RULE-001` will consume. §4.3 is the full `BE-QUOTA-001` spec including reservation flow + lifecycle table + test matrix. §4.4 declares the `BE-APR-001` slice and its dependency edge into `BE-QUOTA-001`'s `reserveTenantQuota` / `TenantQuotaLedgerEntry` / `TenantBookingQuotaImpactResult`.                                                  |

### C. Downstream consumer map

| Consumer        | Relationship                   | Why `BE-QUOTA-001` matters                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-010` | partial unblock                | TN_NewBooking's quota impact card needs `TenantBookingQuotaImpactPreview` (preview before creating booking), the tenant + cost-center summaries to render the card, and the `triggered: warn                                                                                                                                                                                                                                                                       | approval | block`channel to drive the UI. Now also gated on`BE-APR-001`for the approval UX, so it does **not** unblock end-to-end on`BE-QUOTA-001` alone. |
| `TEN-UI-RD-014` | partial unblock                | TN*Rules' quota-aware conditions need the four `cost_center.monthly_quota_remaining*_`/`tenant.monthly*quota_remaining*_`fields enumerated in execution packet §4.2 item J. The rule-engine reads these fields out of`BE-QUOTA-001`'s monthly snapshot. Once `BE-RULE-001`+`BE-QUOTA-001`both reach`done`, TN_Rules' UI is unblocked end-to-end.                                                                                                                   |
| `BE-RULE-001`   | sibling (no `depends_on` edge) | Rule-engine quota conditions consume `BE-QUOTA-001`'s field shape. Because the two slices are now in **different lanes** (`Claude / Gemini2` for RULE vs `Codex2 / Claude` for QUOTA), the field-shape coordination is cross-lane. Both lanes are working from the same execution packet so the canonical field names are not in doubt, but field-shape drift between the two contracts will only be caught at PR review time.                                     |
| `BE-APR-001`    | hard `depends_on`              | `BE-APR-001`'s `createApprovalRequest` flow imports `TenantQuotaLedgerEntry` and `TenantBookingQuotaImpactResult` and calls `reserveTenantQuota(tx, input)` inside the booking-write transaction. `BE-APR-001` cannot start its own work until `BE-QUOTA-001` publishes the ledger types and the `reserveTenantQuota` signature. Closing `BE-QUOTA-001` unblocks `BE-APR-001` in machine truth (its `depends_on` edge releases once `BE-QUOTA-001.status = done`). |
| `TEN-UI-RD-099` | indirect unblock               | Tenant console parity follow-up backlog item that depends on the Wave 3 contract trio (`BE-CC-001`, `BE-QUOTA-001`, `BE-RULE-001`) plus the approval workflow `BE-APR-001` all landing. Auto-unblocks once the four parents close.                                                                                                                                                                                                                                 |
| `ADM-UI-RD-010` | already done                   | Platform-admin Wave 3 closeout. Already `done`. Not gated on `BE-QUOTA-001`. Listed here only to disambiguate from the tenant-console follow-ons.                                                                                                                                                                                                                                                                                                                  |

Dispatch interpretation:

- The hard `depends_on` edges pointing **at** `BE-QUOTA-001` are now
  `BE-APR-001` (new in rev3) plus the supervisor's downstream-unblock
  routing for `TEN-UI-RD-010` and `TEN-UI-RD-014` whose own
  `depends_on` edges live on their own `ai-status.json` rows.
- `review_approved` is not yet `done`; the supervisor's dependency-
  release logic gates on `done`, so until the parent owner posts
  canonical commit + push evidence, `BE-APR-001` and the two UI rows
  stay blocked by machine truth even after review approval.

---

## 4. Resolved Design Decisions (Was Open Spec Questions In Rev2)

The follow-up packet
`docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
captured seven open questions. The design team's response (archived as
the execution packet under commit `45f86cd`) resolved the three quota-
relevant items. They are **no longer open** — they are decisions baked
into the rev3 acceptance bar.

### 4.1 Q4 — Quota period attribution (resolved)

> If a booking is created on 2026-05-30 with trip time 2026-06-02, which
> monthly bucket does it consume?

- **Decision (execution packet §4.3, lifecycle table):** period
  attribution = `reservationWindowStart` month in `Asia/Taipei`. The
  `periodKey` is `"YYYY-MM"` formatted off the Asia/Taipei conversion.
  On booking update with period change, the old period gets a
  `release` and the new period gets a `reserve` (no net inflow of new
  consumption, but two ledger rows).
- **Contract-shape implication:** `TenantQuotaSummary.periodKey` and
  `TenantCostCenterQuotaSummary.periodKey` are `"YYYY-MM"` strings.
  `TenantBookingQuotaImpactQuery.reservationWindowStart` is **required**
  (not optional) because period attribution depends on it. The preview
  endpoint must reject queries that omit `reservationWindowStart`.
- **Reviewer check:** `getTenantQuotaSummary` and
  `getCostCenterQuotaSummary` must compute `periodKey` from the current
  request time in Asia/Taipei. The reserve flow must use the trip-month
  derived from `reservationWindowStart`, not the create-month derived
  from `now()`.

### 4.2 Q7 — Concurrent quota reservation (resolved)

> Two bookings hit `POST /api/tenant/quotas/preview` at the same time
> with 2,000 left in the bucket, each asking for 1,500. Both see OK.
> What protects the second `createTenantBooking` from over-spending?

- **Decision (execution packet §4.3, reservation flow):**
  `POST /quotas/preview` is **non-binding** (reads current ledger
  state). `reserveTenantQuota(tx, input)` inside the booking-write
  transaction is the **only** binding step. The reserve flow:
  1. `SELECT FOR UPDATE` on the tenant policy + cost-center policy rows
  2. `SELECT FOR UPDATE` on the current-period snapshot rows
  3. Compute `remainingBefore`
  4. If `enforcementMode = hard_block` and `remainingAfter < 0`,
     **throw `QUOTA_INSUFFICIENT_AT_COMMIT`** (note the rev3 error code
     is `QUOTA_INSUFFICIENT_AT_COMMIT`, not the rev2 placeholder
     `QUOTA_INSUFFICIENT`)
  5. `INSERT` ledger rows (`reserve`, one per dimension × applicable
     scope)
  6. `UPDATE` (or upsert) snapshot rows
  7. Return `{ ledgerEntries, impacts }` so the caller can fold
     `impacts` into `TenantApprovalEvaluationResult.quotaImpacts` for
     `BE-APR-001`
- **Contract-shape implication:** `TenantQuotaUsage` exposes
  `bookingCountReserved` / `bookingCountConsumed` /
  `amountMinorReserved` / `amountMinorConsumed` / per-dimension
  remaining values + `remainingPercent` so the UI can explain why a
  preview can become stale. `TenantBookingQuotaImpactResult.triggered`
  is `"none" | "warn" | "approval" | "block"` — note `"approval"` (not
  `"require_approval"`) is the UI-facing string.
- **Reviewer check:** the test matrix must include a race test (two
  concurrent reserve transactions against the last remaining unit,
  implemented as two separate vitest transactions). One must succeed,
  the other must throw `QUOTA_INSUFFICIENT_AT_COMMIT`. Snapshot rows
  must reflect the winner's reservation. The race test is a hard
  acceptance bar — there is no path to `review_approved` without it.

### 4.3 Item J — Rule-condition field whitelist (resolved)

The execution packet §4.2 enumerates the rule-condition field whitelist
`BE-RULE-001`'s evaluator will ship against. The quota-related fields
in that whitelist are:

- `cost_center.monthly_quota_remaining_amount_minor`
- `cost_center.monthly_quota_remaining_percent`
- `tenant.monthly_quota_remaining_amount_minor`
- `tenant.monthly_quota_remaining_percent`

- **Decision:** `BE-QUOTA-001`'s monthly snapshot must expose these
  four values in a shape the rule engine can read by string path.
  Either:
  - the snapshot exposes them under matching nested keys (e.g.
    `summary.usage.amountMinorRemaining` mapped one-to-one to the
    string path), or
  - the rule engine ships a translation layer that maps the string
    paths to the canonical `TenantQuotaUsage` fields.
- **Contract-shape implication:** `TenantQuotaUsage.amountMinorRemaining`
  and `TenantQuotaUsage.remainingPercent` are the canonical field
  names. The `bookingCountRemaining` field is computed but not currently
  in the rule-condition whitelist; reviewer should not block on
  `bookingCount` rule conditions unless `BE-RULE-001` opens that
  surface.
- **Reviewer check:** confirm the four field names are reachable (or
  trivially translatable) in `BE-QUOTA-001`'s output. Because
  `BE-RULE-001` is now in a different lane, the parent owner must call
  out the field-naming choice in the `handoff` message so the
  `BE-RULE-001` owner can react.

### 4.4 Items decided unilaterally (notify-only, §3 of the follow-up)

These do not gate `BE-QUOTA-001` contract shape but the parent owner
should be aware of them while writing the implementation:

- **E. Rule evaluation timestamp** — creation-time snapshot; later quota
  changes do not retroactively re-decide existing approvals. The
  `auditSummary.quotaSnapshotVersion` field carried in
  `TenantApprovalEvaluationResult` is the snapshot fingerprint
  `BE-QUOTA-001` should publish so `BE-RULE-001` / `BE-APR-001` can
  freeze it at evaluation time.
- **M. Legacy free-text cost center** — quota preview against a tenant
  with no active cost-centers in its directory should grandfather a
  free-text `costCenter` lookup (same behaviour as
  `validateBookingCostCenter`). The parent slice should mirror the
  grandfather-aware lookup `BE-CC-001-FU` introduced for booking
  validation rather than rejecting unknown codes. The preview should
  return a summary the UI can render (likely with `triggered: "none"`
  or `enforcementMode: "warn_only"` flagged as "no policy applied").

---

## 5. Acceptance Bar Mapping

The parent's `ai-status.json` acceptance list (rev3) maps onto the
expected working-tree changes as follows. Each row is a reviewer-
actionable check the parent reviewer (`Claude` at rev3) should walk
before approving. If the parent reviewer rotates again between this
packet rev3 and the parent's review window, the live reviewer in
`ai-status.json` is authoritative.

| #   | Parent acceptance bar (verbatim from `ai-status.json` at rev3 snapshot)                                                                                                                                  | Where to verify in the working tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 新增 `TenantQuotaEnforcementMode` / `TenantQuotaPeriod` / `TenantQuotaLimit` / `TenantQuotaUsage` (with pendingReserved + confirmed split) / `TenantQuotaLedgerEntry` / `TenantBookingQuotaImpactResult` | `packages/contracts/src/index.ts` — six new types. Verify against execution packet §3 verbatim. `TenantQuotaPeriod = "monthly"` (P1 ships monthly only). `TenantQuotaEnforcementMode = "warn_only" \| "require_approval" \| "hard_block"`. `TenantQuotaUsage` exposes both `bookingCount*` and `amountMinor*` reserved/consumed/remaining triples + `remainingPercent`. `TenantQuotaLedgerEntry.entryType = "reserve" \| "release" \| "consume" \| "adjust"`. `TenantBookingQuotaImpactResult.triggered = "none" \| "warn" \| "approval" \| "block"`.                                                                                                                             |
| 2   | 新增 `TenantQuotaPolicyRecord` + `UpsertTenantQuotaPolicyCommand` + `TenantQuotaSummary` + `TenantCostCenterQuotaSummary` + `TenantBookingQuotaImpactQuery` + `TenantBookingQuotaImpactPreview`          | `packages/contracts/src/index.ts` — six more new types. `TenantBookingQuotaImpactQuery.reservationWindowStart` **required**. `TenantBookingQuotaImpactPreview.combinedTriggered` is the rolled-up channel across tenant + cost-center impacts. `TenantCostCenterQuotaSummary.inheritedFromTenant` records whether the cost-center has its own policy or inherits the tenant-level limit.                                                                                                                                                                                                                                                                                          |
| 3   | Three new tables (`core.phase1_tenant_quota_policies` / `quota_ledger` / `quota_monthly_snapshots`)                                                                                                      | `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` — three new table references with `SELECT ... FOR UPDATE` on the policy and snapshot rows at reserve time. Tables must be tenant-scoped (every query includes `tenantId` predicate). Reviewer should look for the existing repository pattern (`TenantPartnerState` slice) being extended consistently.                                                                                                                                                                                                                                                                                                        |
| 4   | `reserveTenantQuota` service method runs inside booking-write tx with `SELECT ... FOR UPDATE` on policy + snapshot rows                                                                                  | `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts` — **new file** carrying the ledger primitives (atomic apply, snapshot rebuild). Service method exposed off `TenantPartnerService` (or a dedicated `TenantQuotaLedger` injectable) so the booking-write transaction can call it directly. The function signature must accept the transaction handle / Knex `tx` so the lock survives across the SELECTs and the INSERT.                                                                                                                                                                                                                                               |
| 5   | Period attribution = `reservationWindowStart` in Asia/Taipei → `periodKey` `"YYYY-MM"`; cross-month update releases old + reserves new                                                                   | Implementation in `tenant-quota-ledger.ts` (or wherever the reservation flow lives). Use a date-time helper that converts `reservationWindowStart` (ISO with offset) into the corresponding Asia/Taipei wall-clock month and formats `YYYY-MM`. Cross-month booking update path must emit two ledger rows (`release` against old period + `reserve` against new period) within the same transaction.                                                                                                                                                                                                                                                                              |
| 6   | Hard-block over-limit reserve throws `QUOTA_INSUFFICIENT_AT_COMMIT`; preview is non-binding                                                                                                              | Reviewer should search for `QUOTA_INSUFFICIENT_AT_COMMIT` as the error code shipped through `ApiRequestError`. Preview endpoint (`POST /api/tenant/quotas/preview`) must **not** persist any ledger rows; it reads the snapshot and computes the impact off in-memory math.                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | 5 REST routes under `/api/tenant/quotas` (+ cost-center scoped detail)                                                                                                                                   | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` — five routes: `GET /api/tenant/quotas`, `GET /api/tenant/cost-centers/{costCenterCode}/quota`, `POST /api/tenant/quotas/policies`, `POST /api/tenant/quotas/preview`, `GET /api/tenant/quotas/ledger?periodKey=YYYY-MM&costCenterCode=...`. `@Throttle(READ_HEAVY_RATE_LIMIT)` on the `GET` handlers; `x-tenant-id` header required; parity with the cost-center routes. Note: the in-flight worktree has `GET /api/tenant/quotas/preview` (rev2 shape) — reviewer must confirm the rev3 shape is `POST /api/tenant/quotas/preview` per the execution packet §4.3 API surface (see §6 reconciliation hazard). |
| 8   | Audit events `tenant.quota_policy.updated` / `tenant.quota_ledger.entry_added` / `tenant.quota_snapshot.refreshed`                                                                                       | Service layer must emit audit events through the existing audit interface (whichever pattern `BE-CC-001` settled on). `tenant.quota_ledger.entry_added` emits **one event per ledger row** (so a cross-month booking update emits two). Reviewer should grep for the three event names and confirm they fire on the right code paths.                                                                                                                                                                                                                                                                                                                                             |
| 9   | API client exposes `getTenantQuotaSummary` / `getTenantCostCenterQuota` / `previewTenantBookingQuotaImpact` / `upsertTenantQuotaPolicy` / `listTenantQuotaLedger`                                        | `packages/api-client/src/index.ts` — five new methods on `ApiClient` following the existing cost-center pattern (`URLSearchParams` for `GET`, `encodeURIComponent` on path components, `previewTenantBookingQuotaImpact` posts JSON body since the rev3 route is `POST`).                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | Race test: two concurrent reserve calls against last unit; one wins, other throws `QUOTA_INSUFFICIENT_AT_COMMIT`                                                                                         | `apps/api/tests/unit/tenant-quota-ledger.test.ts` (or `tenant-partner.service.test.ts`) — implement with two separate vitest transactions. The execution packet §4.3 test matrix explicitly mandates this shape. Reviewer should re-run after handoff to confirm the race-protection invariant.                                                                                                                                                                                                                                                                                                                                                                                   |
| 11  | `pnpm --filter @drts/contracts build` + `pnpm --filter @drts/api typecheck` + `pnpm --filter @drts/api test` all pass                                                                                    | Reviewer should re-run these three commands after handoff. The parent owner should also report all three in the `handoff` message and in the commit body so the trailers are auditable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Additional acceptance items derived from the execution packet test
matrix (not in `ai-status.json` acceptance list but listed in execution
packet §4.3 "Test matrix"):

| Derived acceptance bar                                                                                                                                                                       | Where to verify                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty policy + new booking → `remainingAfter = null - delta` treated as unlimited; impact `triggered: "none"`                                                                                | `tenant-quota-ledger.test.ts` — unit test against a tenant with no policy row. `reserveTenantQuota` must succeed and emit a ledger row with `null` limits; impact result is `triggered: "none"`.                                                                                                                             |
| Policy with `warn_only` 80% threshold → impact `triggered: "warn"`                                                                                                                           | `tenant-quota-ledger.test.ts` — seed a `warn_only` policy and reserve to 80%; expect `triggered: "warn"`. Note the 80% / 90% thresholds are policy attributes not yet visible in the rev3 contract types as I read them; reviewer should confirm whether the threshold is on `TenantQuotaLimit` or derived in service logic. |
| Policy with `require_approval` 90% threshold → impact `triggered: "approval"`                                                                                                                | Same test file. Note `triggered: "approval"` (not `"require_approval"`) is the UI string.                                                                                                                                                                                                                                    |
| Policy with `hard_block` over-limit → reserve throws `QUOTA_INSUFFICIENT_AT_COMMIT`                                                                                                          | Same test file. Confirm the throw happens **inside** the transaction so the booking row is also rolled back (no orphan booking on quota fail).                                                                                                                                                                               |
| Period attribution: `reservationWindowStart = 2026-05-31T23:30:00+08:00` → `periodKey = "2026-05"`. With `+00:00` form at the boundary, conversion to Asia/Taipei still yields the right key | Date-time helper unit test. Reviewer should confirm the test covers both the `+08:00` form (already in Asia/Taipei) and the `+00:00` boundary case (where local time and UTC differ).                                                                                                                                        |
| Booking update across months: old period `release`, new period `reserve`, net usage moves correctly                                                                                          | `tenant-quota-ledger.test.ts` — seed a booking in `2026-05`, update to `2026-06`, confirm two ledger rows and snapshot updates in both periods.                                                                                                                                                                              |
| Booking cancel after reserve → `release`; subsequent preview shows quota freed                                                                                                               | Same test file. Confirm the preview math reads the snapshot, not the ledger, so the `release` propagates through snapshot refresh.                                                                                                                                                                                           |
| Booking complete → `consume` entry; reserved counter goes down, consumed counter goes up, remaining unchanged                                                                                | Same test file. Confirm the `consume` math is conservative (zero net change to `remaining`).                                                                                                                                                                                                                                 |
| Cross-tenant isolation: tenant A's ledger entries do not affect tenant B's summary                                                                                                           | Standard cross-tenant regression test pattern in `tenant-partner.service.test.ts`.                                                                                                                                                                                                                                           |
| `api-client` typecheck                                                                                                                                                                       | Recommended extra check given the new `api-client` methods (matches the `BE-CC-001` first-handoff convention).                                                                                                                                                                                                               |
| Parity-decisions doc note                                                                                                                                                                    | `docs/05-ui/tenant-console-parity-decisions-20260510.md` — append a `2026-05-13 Implementation Update` block enumerating the new record types, REST routes, audit events, and the unblock note for `TEN-UI-RD-010` / `TEN-UI-RD-014` / `BE-APR-001`.                                                                         |

---

## 6. In-Flight Reconciliation Hazard

The working tree at the time of this packet rev3 snapshot contains
**uncommitted edits** on the parent slice's primary implementation
files that **predate the design response**:

```
M apps/api/src/modules/tenant-partner/tenant-partner.controller.ts  (+72 lines)
M apps/api/src/modules/tenant-partner/tenant-partner.service.ts     (+289 lines)
M packages/api-client/src/index.ts                                  (+39 lines)
```

These edits implement the **rev2-shape** read-model:

- `GET tenant/cost-centers/:code/quota` returning `TenantCostCenterQuotaSummary`
- `GET tenant/quotas/preview?costCenter=...&amountMinor=...&currency=...&tripStartsAt=...`
  returning `TenantBookingQuotaImpactPreview`
- `previewBookingQuotaImpact` service method with the query shape
  `{ amountMinor, costCenter, currency, tripStartsAt }`
- no ledger primitives, no policy CRUD, no `reserveTenantQuota`, no
  `SELECT ... FOR UPDATE`, no `QUOTA_INSUFFICIENT_AT_COMMIT`, no audit
  events, no period attribution rule

The execution packet §4.3 explicitly warns:

> ⚠ In-flight reconciliation note: the existing BE-QUOTA-001 acceptance
> criteria predate the design response. If the worker has already built
> a non-ledger model, reconcile — the design response mandates the
> ledger + atomic reservation pattern.

**Reconciliation guidance for the parent owner (`Codex2`):**

1. **Do not** ship the rev2-shape implementation as the closeout for
   the rev3 `BE-QUOTA-001` acceptance bar. The shapes diverge in too
   many places (preview is `POST` not `GET` in rev3; query has
   `reservationWindowStart` + `businessDispatchSubtype` not
   `amountMinor` + `tripStartsAt`; `TenantQuotaUsage` has the
   reserved/consumed split not the rev2 single-bucket; the rev3 acceptance
   bar requires a transactional ledger reserve flow).
2. Decide whether to **rebase** the in-flight work onto the rev3 shape
   (keeping the route scaffolding and adapting the body) or **discard**
   it and re-implement from scratch against the execution packet §4.3.
   This packet does not recommend one path; the parent owner judges based
   on how much of the rev2 work is salvageable.
3. Confirm that the **rev3 preview route** is `POST /api/tenant/quotas/preview`
   (execution packet §4.3 API surface), not the rev2 `GET` shape.
4. Ensure that the parent slice's final commit body explicitly notes the
   reconciliation, so reviewers and downstream consumers
   (`BE-RULE-001`, `BE-APR-001`) understand which contract shape shipped.
5. The in-flight `getTenantQuotaSummary` / `getCostCenterQuotaSummary`
   service methods may be salvageable if their return types are widened
   to match the rev3 `TenantQuotaSummary` / `TenantCostCenterQuotaSummary`
   (with `bookingCountReserved`, `bookingCountConsumed`,
   `amountMinorReserved`, `amountMinorConsumed`, etc.). The reviewer
   should not auto-approve a commit that only widens types without
   wiring the ledger / snapshot tables behind them.

**Reviewer responsibility:** the reviewer (`Claude` on parent,
`Gemini2` on sidecar) must read the final commit's diff against the
**execution packet §4.3 spec**, not against the rev2 in-flight state.
If the diff is small enough that the in-flight rev2 work was clearly
not torn out, the reviewer should `reopen` or `blocker` the parent
slice rather than approve.

---

## 7. Reviewer Handoff Notes

1. Re-check the parent's lifecycle against `ai-status.json` and
   `ai-activity-log.jsonl` first, not `current-work.md`. At the rev3
   snapshot the parent `BE-QUOTA-001` is `backlog` under owner
   `Codex2` with reviewer `Claude` (availability-first claim from
   `Gemini2`). If the parent owner has already submitted canonical
   contract changes, or if the lane has rotated again, between rev3 of
   this packet and the sidecar review window, that state is
   authoritative and supersedes the snapshot here.
2. Treat the resolved decisions from §4 as **decisions**, not as
   "backend defaults" subject to design-team review. The execution
   packet is the canonical source for Q4 / Q7 / Item J semantics. If
   the parent owner has deviated from the execution packet spec, that
   is a `reopen` not an `approve`.
3. **Cross-lane coordination** for `BE-RULE-001`'s rule-condition field
   whitelist is now required (rev2 assumed intra-lane coordination; the
   supervisor sweep moved `BE-RULE-001` to a different lane). The
   parent owner of `BE-QUOTA-001` should call out the canonical field
   names (`bookingCountRemaining`, `amountMinorRemaining`,
   `remainingPercent`) in the `handoff` message so the `BE-RULE-001`
   owner can align without a separate consensus round.
4. Do **not** collapse `TenantQuotaSummary` (tenant-facing usage) into
   the existing platform-admin `PlatformTenantQuotaSummary` (allotment
   capacity). They serve different roles and live on different surfaces.
5. The parent's commit-evidence rule applies on the way to `done`. This
   is a `mutates_canonical=true` slice, so `NO_COMMIT_REQUIRED=1` is
   not available for `BE-QUOTA-001`; the parent owner must produce a
   real commit with `LLM-Agent: Codex2`, `Task-ID: BE-QUOTA-001`,
   `Reviewer: Claude` trailers (mirroring the current owner / reviewer
   lane) and a normal non-force push. Until that commit + push lands,
   downstream `BE-APR-001`, `TEN-UI-RD-010`, and `TEN-UI-RD-014` stay
   blocked in machine truth even after `review_approved`. If the lane
   rotates again before commit, the trailers must match whichever
   owner / reviewer pair is recorded in `ai-status.json` at finalize
   time, not the rev3 snapshot here.
6. **`BE-APR-001` blocking**: closing `BE-QUOTA-001` is a hard
   precondition for `BE-APR-001` to leave `backlog`. The parent owner's
   `handoff` message should explicitly note that `reserveTenantQuota`
   is now exported with the `(tx, input)` signature so the `BE-APR-001`
   owner can call it from inside the approval-request-creation flow.
7. This sidecar is a support-only docs slice. No commit or push evidence
   is needed before owner handoff to sidecar review; the machine-truth
   transition required from this owner step is
   `AI_NAME=Claude scripts/ai-status.sh handoff BE-QUOTA-001-SIDECAR-ACCEPTANCE Gemini2 "<note>"`,
   and the sidecar may use `NO_COMMIT_REQUIRED=1` at its own closeout
   (`done`) because it is a `task_class: sidecar` artifact under the
   `helper_kind: acceptance_packet` allowance. The handoff target
   `Gemini2` matches the current sidecar reviewer; if the sidecar
   reviewer rotates again before handoff the owner must adjust the
   handoff target accordingly.

---

## 8. Acceptance Checklist For This Support Packet

Reviewer `Gemini2` should treat this as a docs-only support artifact.
The goal is to confirm that the packet correctly frames the rev3
parent's implementation scope, the dependency edges, the resolved
design decisions, and the in-flight reconciliation hazard.

### A. Parent-task alignment

- [ ] `BE-QUOTA-001` is in `ai-status.json` with `owner=Codex2`,
      `reviewer=Claude`, `phase=Wave 3 Contract Unblockers`,
      `depends_on=[BE-CC-001]`, and `mutates_canonical=true` (rev3
      snapshot — if the lane has rotated again, treat live machine
      truth as authoritative).
- [ ] `BE-QUOTA-001` declares acceptance items matching §5 verbatim
      (12 new contract types, 3 new tables, atomic ledger with
      `SELECT FOR UPDATE`, period attribution rule, `QUOTA_INSUFFICIENT_AT_COMMIT`,
      5 REST routes, 3 audit events, 5 api-client methods, race test,
      `contracts build` + `api typecheck` + `api test` all pass).
- [ ] `BE-QUOTA-001.planning_ref` points at
      `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
      (rev3 anchor — not the rev2 anchor `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`).
- [ ] `BE-QUOTA-001.unblocks` contains exactly `TEN-UI-RD-010`,
      `TEN-UI-RD-014`, and **`BE-APR-001`** (the rev3 addition).
- [ ] `BE-RULE-001` is `backlog` (or `in_progress` if started after
      this packet) under `owner=Claude`, `reviewer=Gemini2` (rev3
      machine truth; different lane from `BE-QUOTA-001`).
- [ ] `BE-APR-001` is in `ai-status.json` with
      `depends_on=[BE-RULE-001, BE-QUOTA-001]`.

### B. Dependency completeness

- [ ] `BE-CC-001` is `done` in `ai-status.json` with
      `commit_hash=a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` on
      `origin/feat/claude2-ui-redesign-foundation`.
- [ ] `TenantCostCenterRecord` is exported from
      `packages/contracts/src/index.ts` with the shape recorded in
      §2.3.
- [ ] The four cost-center routes still exist in
      `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
      (`GET tenant/cost-centers`, `GET tenant/cost-centers/:code`,
      `POST tenant/cost-centers`, `POST tenant/cost-centers/disable`).

### C. Planning anchor completeness

- [ ] `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
      §4.3 still defines the `BE-QUOTA-001` spec (12 contract types,
      5 routes, 3 tables, atomic reservation flow, lifecycle table,
      test matrix).
- [ ] Execution packet §3 still declares the shared quota types
      (`TenantQuotaPeriod`, `TenantQuotaEnforcementMode`, `TenantQuotaLimit`,
      `TenantQuotaUsage`, `TenantQuotaLedgerEntry`,
      `TenantBookingQuotaImpactResult`).
- [ ] Execution packet §4.2 still declares the rule-condition field
      whitelist (item J).
- [ ] `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
      and `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
      are still in place as the historical record (no longer the
      primary anchor but valuable as decision trail).

### D. Resolved design decisions

- [ ] §4.1 (Q4 period attribution) matches execution packet §4.3
      lifecycle table: `reservationWindowStart` month in Asia/Taipei,
      `release` + `reserve` on cross-month update.
- [ ] §4.2 (Q7 concurrent reservation) matches execution packet §4.3
      reservation flow: `SELECT FOR UPDATE` on policy + snapshot rows,
      `QUOTA_INSUFFICIENT_AT_COMMIT` error code, preview non-binding.
- [ ] §4.3 (Item J rule-condition field whitelist) matches execution
      packet §4.2 item J: four `cost_center.monthly_quota_remaining_*` /
      `tenant.monthly_quota_remaining_*` fields.

### E. In-flight reconciliation hazard

- [ ] §6 correctly identifies the uncommitted edits in
      `tenant-partner.controller.ts`, `tenant-partner.service.ts`, and
      `packages/api-client/src/index.ts` as **rev2-shape** work that
      must be reconciled before the rev3 acceptance bar can be met.
- [ ] §6 includes the explicit warning from execution packet §4.3.
- [ ] §6 instructs the reviewer to evaluate the final commit's diff
      against the execution packet, not against the rev2 in-flight
      state.

### F. Support-artifact guardrails

- [ ] This sidecar only adds / refreshes
      `support/sidecars/BE-QUOTA-001/BE-QUOTA-001-SIDECAR-ACCEPTANCE.md`.
- [ ] No canonical truth was modified to produce this packet —
      `packages/contracts/`, the tenant-partner module, the api-client
      surface, the parity-decisions doc, and `ai-status.json` task
      fields are not touched by this sidecar's diff. (The sidecar
      lifecycle fields under `ai-status.json → BE-QUOTA-001-SIDECAR-ACCEPTANCE`
      are touched only through `scripts/ai-status.sh` per the
      machine-truth discipline rule.)
- [ ] No runtime verification is claimed as newly executed by this
      sidecar; all reviewer-actionable verification belongs to the
      parent slice.
- [ ] Reviewer handoff message states clearly that the parent is still
      `backlog` (or `in_progress` if the parent owner has started
      since the snapshot) and that the canonical implementation,
      typecheck, test, commit, and push are the remaining lifecycle
      steps for `BE-QUOTA-001`.

---

## 9. Verification Notes For Owner Handoff

Checks performed while preparing rev3 of this packet (read-only against
machine-truth files and the working tree):

- confirmed `BE-QUOTA-001-SIDECAR-ACCEPTANCE` exists in `ai-status.json`
  as a `sidecar` / `acceptance_packet` task owned by `Claude` with
  reviewer `Gemini2` and `helper_parent: BE-QUOTA-001`. The earlier
  reviewer value `Codex2` (rev2) was rotated by the supervisor sweep
  at commit `13f4b33` and has been refreshed throughout this rev3.
- confirmed parent `BE-QUOTA-001` is currently `backlog` under
  `Codex2` / `Claude` (rev3 machine truth, `last_update=2026-05-13T11:24:08Z`).
  The earlier `in_progress` snapshot (rev2) reflected the pre-sweep
  state and is no longer accurate. The acceptance list was rewritten by
  the sweep to match the design response.
- confirmed sibling `BE-RULE-001` is currently `backlog` under
  `Claude` / `Gemini2` (rev3 machine truth, `last_update=2026-05-13T11:24:07Z`).
  The earlier `in_progress` snapshot (rev2) under `Codex2` / `Claude`
  was rotated. `BE-RULE-001` is now in a **different lane** than
  `BE-QUOTA-001`; cross-lane field-shape coordination is back in play.
- confirmed `BE-APR-001` is currently `backlog` under `Codex` /
  `Codex2` (rev3 machine truth) with `depends_on=[BE-RULE-001, BE-QUOTA-001]`.
  This is new in rev3; the rev2 packet did not include this dependency
  edge because `BE-APR-001` was not formally on the wave at that time.
- confirmed hard upstream `BE-CC-001` is `done` with commit
  `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` on
  `origin/feat/claude2-ui-redesign-foundation`.
- confirmed `TenantCostCenterRecord` is exported from
  `packages/contracts/src/index.ts` (current snapshot around line
  `1023`; line numbers drift quickly — reviewer should `grep` rather
  than rely on the snapshot index).
- confirmed `PlatformTenantQuotaSummary` is exported from
  `packages/contracts/src/index.ts` (current snapshot around line
  `3989`) and is referenced by `PlatformAdminTenantRecord.quotas`,
  distinguishing it from the new tenant-facing summary the parent slice
  will introduce.
- confirmed the four cost-center routes exist in
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  (current snapshot at lines `343`, `369`, `384`, `400`) with
  `@Throttle(READ_HEAVY_RATE_LIMIT)` on the `GET` handlers.
- confirmed the execution packet
  `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  exists (1039 lines, 51,633 bytes) and contains §3 shared quota types,
  §4.2 `BE-RULE-001` spec (with item J quota-field whitelist), §4.3
  `BE-QUOTA-001` spec (with reservation flow + lifecycle table + test
  matrix), and §4.4 `BE-APR-001` spec (with the new dependency edge).
- confirmed the prior planning packets at
  `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
  and `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
  still exist as the historical record of the original Contract 3 /
  Q4 / Q7 / item J framing.
- confirmed the working tree contains uncommitted rev2-shape edits on
  `tenant-partner.controller.ts` (+72 lines), `tenant-partner.service.ts`
  (+289 lines), and `packages/api-client/src/index.ts` (+39 lines).
  These edits define `GET tenant/cost-centers/:code/quota`,
  `GET tenant/quotas/preview` with query shape `{costCenter, amountMinor, currency, tripStartsAt}`,
  `getTenantQuotaSummary` / `getCostCenterQuotaSummary` /
  `previewBookingQuotaImpact` service methods, and the three new
  `TenantQuotaSummary` / `TenantCostCenterQuotaSummary` /
  `TenantBookingQuotaImpactPreview` types in the api-client. None of
  these edits implement the rev3 ledger / policy / `SELECT FOR UPDATE`
  semantics. The reconciliation hazard recorded in §6 is real and
  must be addressed by the parent owner before closeout.

No runtime commands were executed by this sidecar. This packet is
limited to support-material consolidation and reviewer handoff
preparation; the typecheck / test / commit / push verifications belong
to the parent slice and are tracked on `BE-QUOTA-001`, not on this
sidecar row.
