# BE-INTEG-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `BE-INTEG-001` — Tenant Governance E2E integration test (booking → governance → dispatch → completion → billing → audit)
**Parent Owner:** `Codex`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2` (rev2, refreshed after availability-first reassignment — was `Codex` at rev1)
**Generated:** `2026-05-13` (UTC, packet rev2 — sidecar reviewer anchor refresh)
**Snapshot anchor (parent `last_update`):** `2026-05-13T17:57:16Z`
**Snapshot anchor (sidecar `last_update`):** `2026-05-13T18:17:46Z` (latest pre-refresh value recorded in `ai-status.json → BE-INTEG-001-SIDECAR-ACCEPTANCE`; a fresh `last_update` will land when this rev2 is handed off to the new reviewer)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not
modify canonical truth, runtime behavior, contract surface, or the
parent task's implementation files.

This packet is a reviewer-facing companion to `BE-INTEG-001`. The
parent task is the end-to-end integration test slice that proves the
four Wave 3 Contract Unblocker primitives (`BE-CC-001` cost-center
directory, `BE-RULE-001` approval rules evaluator, `BE-QUOTA-001`
quota ledger with atomic reserve, `BE-APR-001` booking approval
workflow) actually compose into a coherent enterprise dispatch
lifecycle: `createTenantBooking` → cost-center validate → rule
evaluate → quota reserve (atomic, inside booking tx) → approval
request → approve → schedulable → dispatch → complete → billing
export with cost-center name → 21 audit events fired.

This packet pins the planning anchor, the four hard upstream
machine-truth dependencies (all four are `done` and pushed to
`origin/feat/claude2-ui-redesign-foundation`), the acceptance
checklist the reviewer should walk against the in-flight working-tree
test, the integration-flow seams the test must exercise without
invading production code, the **vitest-include hazard** (the current
root `vitest.config.ts` does not include `tests/integration/**`), the
**quota-consume gap** (`reserveTenantQuota` exists but no production
service method drives the `reserved → consumed` transition that the
parent acceptance bullet requires), and the **commit-evidence hazard**
that the parent test file is not yet tracked in the working tree
(directory `apps/api/tests/integration/` does not exist at packet
generation time).

**Current-state caveat.** Every owner / reviewer / status / commit /
timestamp value below is the snapshot read out of `ai-status.json` at
the timestamps anchored in the header. The lifecycle fields move
quickly. Any reviewer reading this packet must first re-read
`ai-status.json` for the live values and treat the live values as
authoritative if they have drifted from the snapshots below. This
packet is not a substitute for machine truth.

Transient lifecycle truth (`status`, `next`, `last_update`,
`commit_hash`, `push_*` fields, reviewer messages) remains
authoritative only in `ai-status.json` and `ai-activity-log.jsonl`.
This packet snapshots the most recent values for reviewer convenience
but does not replace machine truth.

**Revision note (rev2, `2026-05-13T18:21Z`).** Rev1 of this packet
was reopened by the sidecar reviewer with a cite that the
`Sidecar Reviewer` value drifted: the header and §2.1 declared
`Codex`, but live `ai-status.json → BE-INTEG-001-SIDECAR-ACCEPTANCE`
recorded `reviewer=Codex2` after an availability-first reassignment
(reviewer `last_update=2026-05-13T18:12:50Z`). Rev2 refreshes the
sidecar-reviewer anchor to `Codex2` in the header and §2.1, refreshes
the sidecar snapshot `last_update` anchor to the latest pre-refresh
value `2026-05-13T18:17:46Z`, and notes the live `status` was
`review → in_progress` after the reopen. Rev2 does **not** alter
§§1–8 substantive content (scope boundary, parent / upstream
machine-truth anchors, integration-flow seams, 21-event audit
inventory, acceptance walk, vitest-include hazard, commit-evidence
hazard, downstream risk map) — those anchors remain accurate as of
the parent `last_update=2026-05-13T17:57:16Z` snapshot. Rev2 §9 also
stands unchanged: the parent task `BE-INTEG-001` reviewer has always
been `Codex2`, only the **sidecar** reviewer drifted. As a
side-effect of the reassignment, **the sidecar reviewer and parent
reviewer are now the same agent** (`Codex2`), which keeps review
context co-located: when the parent slice handoff arrives in
`Codex2`'s queue, the same reviewer has both this packet and the
parent test file in the same review window.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist
  keyed to the parent task entry in `ai-status.json → BE-INTEG-001`
  (acceptance list) and to the planned working-tree test file
  `apps/api/tests/integration/tenant-governance-e2e.test.ts`
- pin the four hard upstream machine-truth dependencies (`BE-CC-001`,
  `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`, all `done` with commit
  evidence) and the contract / service surfaces the integration test
  consumes
- map each acceptance bullet to the concrete code seam in
  `owned-mobility.service.ts`, `tenant-partner.service.ts`,
  `billing-settlement.service.ts`, and the contracts package the
  reviewer should verify the test drives
- record the 21-audit-event inventory the parent acceptance bullet 7
  refers to (drawn from execution packet §5) so the reviewer can
  cross-check the assertion set without re-deriving the list
- record the **vitest-include hazard** (the root `vitest.config.ts`
  currently scopes `test.include` to `tests/unit/**` and
  `tests/load/**` only — adding a new file under
  `apps/api/tests/integration/` will be silently skipped unless the
  root config is also updated to include the new glob)
- record the **quota reserve → consume transition gap**: the ledger
  type definition in `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`
  declares `transition: "reserve" | "update" | "cancel" | "consume"`
  but no production service method drives the `"consume"` transition;
  the parent acceptance bullet 5 ("Drives dispatch + complete →
  asserts quota usage moves reserved → consumed") therefore requires
  either a new service primitive on `TenantPartnerService` or a
  documented relaxation of that acceptance bullet to "reserved
  remains 1; consumed remains 0; ledger reflects no leak"
- record the **commit-evidence hazard**: the test file is not yet
  tracked in the working tree, the directory
  `apps/api/tests/integration/` does not exist, and `BE-INTEG-001`
  has `mutates_canonical=true` so its `done` requires a canonical
  commit with the standard trailers and a non-force push to
  `feat/claude2-ui-redesign-foundation`
- frame the downstream consumers (`TEN-UI-RD-010`, `TEN-UI-RD-099`,
  `ADM-UI-RD-010`) so the reviewer understands why proving the
  end-to-end chain now matters for the tenant-portal close-out and
  the admin-parity slice that all depend on the same chain

Out of scope:

- editing L1/L2 product truth, the parent task entry in
  `ai-status.json`, or any working-tree implementation files
  (`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`,
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`,
  `apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts`,
  `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`,
  `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`,
  `packages/contracts/src/index.ts`, the integration-test file
  itself)
- producing the parent slice's canonical implementation, typecheck,
  or test runs; this sidecar only frames the acceptance bar and the
  seams
- mutating or "absorbing" the parent task; the parent must still
  complete its own canonical closeout (`done` with commit + push
  evidence under the canonical implementation commit-evidence rule)
- redesigning the integration-test approach away from in-memory /
  seed fixtures — the parent owner has not yet committed to a
  concrete test-double shape; this packet only records the seams
  that must be exercised
- expanding scope into sibling tasks `BE-LOAD-001` (already `done`)
  or any P2 parking-lot item (parent-derived cost-center hierarchy,
  quarterly periods, auto-timeout cron, etc.)
- defining the production `consumeTenantQuota` service method itself
  — if the parent owner concludes one is required, that is part of
  the parent slice scope, not the sidecar's

---

## 2. Machine Truth Anchors

### 2.1 Sidecar (this task) — `ai-status.json → BE-INTEG-001-SIDECAR-ACCEPTANCE`

- id=`BE-INTEG-001-SIDECAR-ACCEPTANCE`
- title=`Prepare BE-INTEG-001 acceptance packet and dependency map`
- owner=`Claude2`
- reviewer=`Codex2` (rev2; was `Codex` at rev1 — refreshed to match live
  `ai-status.json` after availability-first reassignment recorded at
  `last_update=2026-05-13T18:12:50Z` per the reviewer reopen note)
- phase=`Wave 3 Contract Unblockers`
- depends_on=`[BE-APR-001]`
- task_class=`sidecar`
- helper_parent=`BE-INTEG-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- artifacts=`support/sidecars/BE-INTEG-001/BE-INTEG-001-SIDECAR-ACCEPTANCE.md`
- acceptance=
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`. At rev2 generation the live row reads
  `status=in_progress` (was `review` until the rev1 review reopened
  for the drift) and `next` carries the reviewer's drift-cite
  instructing this refresh.

### 2.2 Parent — `ai-status.json → BE-INTEG-001` (snapshot at packet rev1, `last_update=2026-05-13T17:57:16Z`)

- id=`BE-INTEG-001`
- title=`Tenant Governance E2E integration test — booking → governance → dispatch → completion → billing → audit`
- summary_zh=`端到端整合測試：跑一筆完整企業派車從 createTenantBooking
→ costCenter validate → rule evaluate → quota reserve(atomic) →
approval request → approve → schedulable → dispatch → complete →
billing 帶 costCenter name → 21 個 audit event 齊全。確保 BE-CC-001
/ RULE / QUOTA / APR 個別測過後，整體鏈路真的跑得通。`
- phase=`Wave 3 Contract Unblockers`
- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` (snapshot; reviewer must re-read live)
- depends_on=`[BE-APR-001]` (now `done`, commit `7b361fa`)
- planning_ref=`docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
- mutates_canonical=`true`
- artifacts (declared in `ai-status.json`):
  - `apps/api/tests/integration/tenant-governance-e2e.test.ts` (new
    file; **untracked AND directory does not exist** at packet
    generation time)
- acceptance (declared in `ai-status.json`, 9 bullets — see §5 for
  the reviewer-walk against the seams):
  - new `apps/api/tests/integration/tenant-governance-e2e.test.ts`
    (new file / new directory if not exist)
  - test creates a fresh tenant with cost-center directory +
    approval rule + quota policy seeded
  - drives booking create → asserts evaluation result requires
    approval → asserts quota reserved (ledger entry exists)
  - drives approval approve → asserts `booking.approvalState =
approved` + booking is schedulable
  - drives dispatch + complete → asserts quota usage moves reserved
    → consumed
  - drives billing export → asserts cost-center name + `ownerUserId`
    enriched on export row
  - asserts all 21 audit event names from execution packet §5 fired
    with correct `resourceType` / `resourceId`
  - tests booking update path that triggers re-evaluation (Q5
    trigger) — old approval cancelled, new request created
  - `pnpm --filter @drts/api test` passes including new file
- `next` (verbatim from `ai-status.json` at snapshot):
  > Implementing tenant governance E2E integration test: inspect
  > approval/quota/billing/audit seams, add end-to-end coverage, and
  > run @drts/api tests.
- no `commit_hash` / `commit_subject` / `push_remote` / `push_branch`
  recorded yet — parent has not produced a canonical commit (see §7
  commit-evidence hazard).

### 2.3 Hard upstream dependencies

All four Wave 3 Contract Unblocker slices are `done` and pushed to
`origin/feat/claude2-ui-redesign-foundation` at packet generation
time. The integration test consumes the contract surfaces and
service entry points published by these commits — it must not
redefine them.

| Upstream task          | Status | Owner / Reviewer       | Commit hash | Commit subject                                                                          | Surface consumed by BE-INTEG-001                                                                                                                                                                                                                                                                |
| ---------------------- | ------ | ---------------------- | ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001`            | `done` | `Codex` / `Codex2`     | `a7c1b9f`   | (cost-center directory canonical landing)                                               | `validateBookingCostCenter`, cost-center directory CRUD, the `buildCostCenterExportFields` helper in `billing-settlement.service.ts:543`, audit events `tenant.cost_center.created/.updated/.disabled` and `booking.cost_center.assigned`                                                       |
| `BE-CC-001-FU-BILLING` | `done` | (per `ai-status.json`) | `0c49f60`   | (cost-center backfill + billing/reporting enrichment)                                   | `GET /api/tenant/cost-centers/coverage`, billing/reporting export `costCenterName` + `ownerUserId` + `legacy_unmapped` flag, audit event `tenant.cost_center.coverage_listed`                                                                                                                   |
| `BE-CC-001-FU-SEED`    | `done` | (per `ai-status.json`) | `adea541`   | seed tenant governance defaults                                                         | `pnpm --filter @drts/api seed:tenant-governance --tenantId=<id>` CLI + `apps/api/seed/tenant-governance-default.ts` (gives the integration test a one-shot seeder for cost-center directory + approval rule + quota policy without hand-rolling fixtures)                                       |
| `BE-RULE-001`          | `done` | `Claude` / `Codex2`    | `c0f533c`   | `feat(BE-RULE-001): tenant approval rules canonical contract + evaluator + API surface` | `evaluateTenantApprovalRules`, `TenantApprovalEvaluationResult`, the 11-case condition surface, audit events `tenant.approval_rule.created/.updated/.disabled/.reordered` + `booking.approval_rules.evaluated`                                                                                  |
| `BE-QUOTA-001`         | `done` | `Codex` / `Codex2`     | `73b53ee`   | `fix(BE-QUOTA-001): add quota persistence migration and DB-path coverage`               | `reserveTenantQuota` (atomic, `SELECT FOR UPDATE` on policy + snapshot rows), `TenantQuotaLedgerEntry`, the `transition: "reserve" \| "update" \| "cancel" \| "consume"` enum, audit events `tenant.quota_policy.updated`, `tenant.quota_ledger.entry_added`, `tenant.quota_snapshot.refreshed` |
| `BE-APR-001`           | `done` | `Codex` / `Claude2`    | `7b361fa`   | `feat(BE-APR-001): add booking approval workflow (ordered_chain -> all_of_parallel)`    | `createApprovalRequestForOrder`, `recordApprovalDecision`, `cancelApprovalRequestsForReevaluation`, `escalateApprovalRequest`, `evaluateTenantBookingGovernance`, `applyApprovalRequestResolutionToOrder`, `OwnedOrderRecord.approvalState` + `approvalRequestIds`, 7 approval audit events     |

Reviewer implication: the integration test must call these
service entry points and assert on their published shapes, not
re-implement them. Any drift in `TenantApprovalEvaluationResult`
shape, `TenantQuotaLedgerEntry` shape, `OwnedOrderRecord.approvalState`
state machine, or audit-event `actionName` strings should be treated
as a regression in the corresponding upstream slice, not a fix in
`BE-INTEG-001`.

### 2.4 Sibling Wave 3 Contract Unblockers (informational, snapshot at packet rev1)

| Sibling task  | Status | Owner / Reviewer   | Relevance to `BE-INTEG-001`                                                                                                                                                                                                                                              |
| ------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BE-LOAD-001` | `done` | `Codex` / `Codex2` | Already-shipped contention load test for `reserveTenantQuota`. The integration test does **not** need to re-prove race-safety; that invariant is defended by `BE-LOAD-001`. The integration test only needs to prove the **single-tenant happy path** chains end-to-end. |

### 2.5 Authoritative supporting documents

- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  is the canonical planning anchor for the whole tenant-governance
  wave. The key sections for `BE-INTEG-001` are:
  - §2 Booking integration (cross-task) — single source of truth
  - §3 Shared types (the contract surface the integration test
    consumes)
  - §4.4 BE-APR-001 (the booking-flow integration spec)
  - §5 Audit taxonomy (the 21-event inventory referenced by
    acceptance bullet 7)
  - §6 Verification commands (the `pnpm --filter @drts/api test`
    surface referenced by acceptance bullet 9)
- `support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-ACCEPTANCE.md` is
  the sibling acceptance packet for the most directly upstream
  slice. It records the booking-integration flow, the re-evaluation
  whitelist (Q5), and the approver-resolution fallback path. It is
  historical context for this packet.
- `support/sidecars/BE-QUOTA-001/BE-QUOTA-001-SIDECAR-ACCEPTANCE.md`
  and `support/sidecars/BE-LOAD-001/BE-LOAD-001-SIDECAR-ACCEPTANCE.md`
  document the quota reservation primitive's contract surface and
  contention proof.
- `support/sidecars/BE-CC-001-FU-SEED/BE-CC-001-FU-SEED-SIDECAR-ACCEPTANCE.md`
  documents the seed CLI the integration test should use to set up
  fixtures instead of hand-rolling cost-center / rule / quota rows.
- `packages/contracts/src/index.ts` (frozen at `BE-APR-001` `done`,
  commit `7b361fa`) defines `TenantApprovalEvaluationResult`,
  `TenantApprovalPlan`, `TenantApprovalFallbackPolicy`,
  `TenantBookingApprovalState`, `TenantBookingApprovalRequestRecord`,
  `TenantBookingApprovalDecisionRecord`, `TenantQuotaLedgerEntry`,
  `TenantQuotaUsage`, and the error-code surface
  (`QUOTA_INSUFFICIENT_AT_COMMIT`, `APPROVAL_NOT_AUTHORIZED`,
  `APPROVAL_NO_RESOLVABLE_APPROVERS`).
- `vitest.config.ts` (repo root) currently declares
  `include = ["tests/unit/**/*.test.ts", "tests/load/**/*.test.ts"]`.
  **It does not include `tests/integration/**/\*.test.ts`.\*\* See §6
  for the vitest-include hazard.

---

## 3. Integration Flow Anchors

The parent task summary in `ai-status.json` describes the
end-to-end chain as:

```
createTenantBooking
  → cost-center validate
  → rule evaluate
  → quota reserve (atomic, inside booking tx)
  → approval request
  → approve
  → schedulable
  → dispatch
  → complete
  → billing export with cost-center name
  → 21 audit events
```

Execution-packet §2 (cross-task booking integration single source of
truth) confirms this order. The integration test must drive each
seam through the **public service surface**, not by reaching into
private repository state. The reviewer should verify the test
exercises these seams at these specific code locations:

### 3.1 Booking create (cost-center + rule + quota + approval composition)

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:519`
  → `createTenantBooking(...)` is the public entry point. The test
  must call this method, not the private helpers.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:728`
  → `createTenantBooking` invokes
  `this.evaluateTenantBookingGovernance({ ... })` to chain
  validateCostCenter → evaluator → reserveTenantQuota inside the
  booking-write tx. The test should assert the booking-write tx is
  atomic (either all four primitives apply or none do).
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:737`
  → `this.createApprovalRequestForOrder({ ... })` is invoked from
  inside `createTenantBooking` only when the evaluation result is
  `require_approval`. The test should drive an evaluation that
  yields `require_approval` (e.g. by seeding an approval rule whose
  condition matches the fixture booking) so this branch fires.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4433`
  → `private evaluateTenantBookingGovernance(...)` — the test should
  **not** call this directly; it is reached transitively via
  `createTenantBooking`.

### 3.2 Approval approve (state machine + schedulable invariant)

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:927`
  → `applyApprovalRequestResolutionToOrder(request, requestId)` is
  invoked from the `recordApprovalDecision` approve / reject / escalate
  branches. The test should call `recordApprovalDecision` (via
  `tenantPartnerService.recordApprovalDecision({ ... command:
"Approve" })` or the REST surface) and assert:
  - `OwnedOrderRecord.approvalState === "approved"`
  - the booking is **schedulable** (the parent acceptance bullet 4
    says "booking is schedulable" — the reviewer should verify the
    test asserts this against `OwnedOrderRecord.status` or the
    schedulable predicate exposed by `owned-mobility.service.ts`,
    not by re-reading the approval state)

### 3.3 Dispatch + complete (reserved → consumed transition)

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1374`
  → `dispatchOrder(...)` is the public dispatch entry point.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1737`
  - `:4097` → `dispatchOrder(orderId, { mode: "auto" }, requestId)`
    is the auto-dispatch convenience path.

**Gap to flag.** As of packet generation, grep across `apps/api/src/`
finds:

- one occurrence of `transition: "reserve" | "update" | "cancel" |
"consume"` in `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts:211`
- one branch handling `transition === "consume"` at
  `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts:221`
- **no** public service method named `consumeTenantQuota` or
  similar on `TenantPartnerService` or `OwnedMobilityService`
- **no** dispatch / complete handler that drives the `consume`
  transition

This means the parent acceptance bullet 5 ("Drives dispatch + complete
→ asserts quota usage moves reserved → consumed") cannot be satisfied
by calling existing service entry points alone. The reviewer must
confirm at handoff that one of:

1. the parent owner has shipped a new public `consumeTenantQuota`
   primitive (or equivalent reservation-finalize entry on
   `TenantPartnerService`) and the integration test drives it via
   `OwnedMobilityService.dispatchOrder` / completion path, **OR**
2. the parent acceptance bullet 5 has been explicitly relaxed in
   `ai-status.json → BE-INTEG-001.acceptance` (with reviewer-approved
   wording) to "reserved remains 1, consumed remains 0, ledger
   reflects no leak after dispatch + complete" — i.e. acknowledging
   that `reserved → consumed` is a P2 lifecycle item, **OR**
3. the parent task is split into a follow-up `BE-INTEG-001-FU-CONSUME`
   slice that lands the consume primitive separately.

Option 1 is the most faithful to the parent acceptance bullet wording.
Reviewer should not approve a test that silently asserts on a usage
shape that does not exist in production code — that would be a fake
assertion (passes by virtue of the absence of the transition, not by
verifying it).

### 3.4 Billing export (cost-center name + ownerUserId enrichment)

- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:447`
  → `buildCostCenterExportFields(command.tenantId, trip.costCenter)`
  is the helper that enriches each export row with `costCenterName`
  and `ownerUserId` from the cost-center directory.
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:543`
  → `private buildCostCenterExportFields(...)` definition. Returns
  `{ costCenterCode, costCenterName, ownerUserId }` (or `null`s if
  the directory has no record).
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:602`
  → `listSettlementMatrix(): SettlementMatrixRecord[]` is the public
  read surface. The test should call this (or the controller's
  equivalent route) and assert the export row for the test trip has
  `costCenterName !== null` and `ownerUserId !== null` (matching the
  seeded cost-center directory record).

### 3.5 Re-evaluation trigger (booking update)

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:987`
  → `updateTenantBooking(...)` is the public entry point for booking
  updates.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1204`
  → `updateTenantBooking` re-invokes
  `this.evaluateTenantBookingGovernance({ ... })` when the
  re-evaluation whitelist matches.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1221`
  → `this.createApprovalRequestForOrder({ ... })` is invoked from the
  re-eval branch when the new evaluation result requires a new
  approval request.

The re-evaluation whitelist (per execution packet §4.4 / design
response §Q5, 12 fields) is:

- `costCenterCode`
- `businessDispatchSubtype`
- `reservationWindowStart`
- `reservationWindowEnd`
- `passengerId`
- `passenger.role` (i.e. `passengerRole`)
- `quotedFare`
- `vehiclePreference`
- `partnerEntrySlug`
- `eligibilityVerificationId`
- `signoffRequired`
- `expenseProofRequired`

The non-trigger fields are: `notes`, `terminal`, `luggageCount`,
`onsiteContact`, `bookedBy`. The integration test should drive a
booking update that flips **one** whitelisted field (e.g.
`costCenterCode`) and assert:

1. the old approval request is cancelled with
   `cancelled_by_re_evaluation` (audit event fires)
2. a new approval request is created with a fresh
   `TenantBookingApprovalRequestRecord.id`
3. the booking's `approvalState` returns to `pending_approval`

And separately drive an update that flips a non-trigger field (e.g.
`notes`) and assert **no** re-evaluation fires (no
`cancelled_by_re_evaluation`, no new request, no
`approval_state.changed`).

---

## 4. Audit Event Inventory (21 events, per execution packet §5)

Acceptance bullet 7 ("Asserts all 21 audit event names from execution
packet §5 fired with correct `resourceType` / `resourceId`") is the
densest assertion in the parent. The integration test must — across
the full chain — verify the following 21 `actionName` strings appear
in the audit log, each with the expected `resourceType`:

| #   | `actionName`                                          | Expected `resourceType`                                                                                                       | Fires from (in the e2e chain)                                                                                                                                                                                        |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tenant.cost_center.created`                          | `tenant_cost_center`                                                                                                          | Fixture seed (cost-center directory CRUD)                                                                                                                                                                            |
| 2   | `tenant.cost_center.updated`                          | `tenant_cost_center`                                                                                                          | Fixture mutation (the integration test should drive at least one update)                                                                                                                                             |
| 3   | `tenant.cost_center.disabled`                         | `tenant_cost_center`                                                                                                          | Fixture mutation (test should drive at least one disable to cover the audit event)                                                                                                                                   |
| 4   | `tenant.cost_center.coverage_listed`                  | `tenant_cost_center`                                                                                                          | `GET /api/tenant/cost-centers/coverage` invocation                                                                                                                                                                   |
| 5   | `booking.cost_center.assigned`                        | `booking`                                                                                                                     | Booking create path (cost-center validate emits assignment audit)                                                                                                                                                    |
| 6   | `tenant.approval_rule.created`                        | `tenant_approval_rule`                                                                                                        | Fixture seed (approval rule CRUD)                                                                                                                                                                                    |
| 7   | `tenant.approval_rule.updated`                        | `tenant_approval_rule`                                                                                                        | Fixture mutation                                                                                                                                                                                                     |
| 8   | `tenant.approval_rule.disabled`                       | `tenant_approval_rule`                                                                                                        | Fixture mutation                                                                                                                                                                                                     |
| 9   | `tenant.approval_rule.reordered`                      | `tenant_approval_rule`                                                                                                        | Fixture mutation (`reorderTenantApprovalRules`)                                                                                                                                                                      |
| 10  | `booking.approval_rules.evaluated`                    | `booking`                                                                                                                     | Inside `evaluateTenantBookingGovernance` (booking create / update path)                                                                                                                                              |
| 11  | `tenant.quota_policy.updated`                         | `tenant_quota_policy`                                                                                                         | Fixture seed (quota policy upsert)                                                                                                                                                                                   |
| 12  | `tenant.quota_ledger.entry_added`                     | `tenant_quota_policy` (per execution packet §5 convention; reviewer should re-confirm against `BE-QUOTA-001`'s emitted shape) | Each `reserveTenantQuota` ledger row write                                                                                                                                                                           |
| 13  | `tenant.quota_snapshot.refreshed`                     | `tenant_quota_policy`                                                                                                         | Each monthly snapshot recompute                                                                                                                                                                                      |
| 14  | `booking.governance.evaluated`                        | `booking`                                                                                                                     | Bundled snapshot persistence event after `evaluateTenantBookingGovernance` commits                                                                                                                                   |
| 15  | `booking.approval_request.created`                    | `tenant_approval_request`                                                                                                     | `createApprovalRequestForOrder` (booking create + re-eval re-create)                                                                                                                                                 |
| 16  | `booking.approval_request.approved`                   | `tenant_approval_request`                                                                                                     | `recordApprovalDecision` approve branch                                                                                                                                                                              |
| 17  | `booking.approval_request.rejected`                   | `tenant_approval_request`                                                                                                     | The integration test should drive at least one reject scenario; if the e2e chain only covers approve, the reviewer should require a sibling assertion that exercises a separate reject path against the same fixture |
| 18  | `booking.approval_request.timeout_escalated`          | `tenant_approval_request`                                                                                                     | `escalateApprovalRequest` (manual escalate route in P1)                                                                                                                                                              |
| 19  | `booking.approval_request.cancelled_by_re_evaluation` | `tenant_approval_request`                                                                                                     | `cancelApprovalRequestsForReevaluation` from booking update re-eval branch                                                                                                                                           |
| 20  | `booking.approval_state.changed`                      | `booking`                                                                                                                     | Every approval-state transition on `OwnedOrderRecord.approvalState`                                                                                                                                                  |
| 21  | `approver_fallback_used`                              | `tenant_approval_request`                                                                                                     | When `cost_center_owner` resolution is null and the resolver falls back to `tenant_admin`                                                                                                                            |

Reviewer implication: the parent owner cannot ship a test that only
asserts a subset of these events. The test must walk all 21 across
the chain. If the test relies on fixture setup to drive the
governance-only events (1–4, 6–9, 11), the reviewer must confirm
the fixture is built **through public service entry points** (i.e.
`tenantPartnerService.upsertCostCenter`, `upsertApprovalRule`,
`upsertTenantQuotaPolicy`, etc.) so the audit events actually fire.
Loading fixtures by writing directly into the repository state
would bypass the audit emission and silently undercount the event
list.

Special note for event 21 (`approver_fallback_used`): this only
fires when `cost_center_owner` resolution returns null and the
resolver falls back to `tenant_admin`. The integration test must
seed the cost-center directory with `ownerUserId=null` for the cost
center referenced by the booking fixture, otherwise this event will
not fire and the 21-event assertion will be one short. The
fixture-seeding strategy must intentionally trigger this fallback.

Special note for event 17 (`booking.approval_request.rejected`): the
parent summary describes a happy-path chain (create → approve →
schedulable → dispatch → complete). If the test follows that chain
literally, the reject branch is not exercised. The reviewer should
require either:

- a separate `it()` block in the same test file that drives a reject
  scenario against a fresh booking, **or**
- the parent owner to flag this as a known gap in
  `ai-status.json → BE-INTEG-001.acceptance` and add a follow-up
  task for reject-path coverage.

---

## 5. Acceptance Walk for the Reviewer

The reviewer should walk these in order against the working-tree
test file at parent handoff time:

| #   | Acceptance bullet (verbatim from `ai-status.json → BE-INTEG-001`)                                                  | Where to verify                                                                                                                                                                          | Notes for reviewer                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 新增 `apps/api/tests/integration/tenant-governance-e2e.test.ts` (新檔案 / 新目錄 if not exist)                     | `git ls-files apps/api/tests/integration/` and `git log --oneline -1 -- apps/api/tests/integration/tenant-governance-e2e.test.ts`                                                        | At packet generation the directory does not exist and the file is untracked. The reviewer must verify the parent's canonical commit tracks both the new directory and the new file (§7 commit-evidence hazard).                                              |
| 2   | Test creates a fresh tenant with cost-center directory + approval rule + quota policy seeded                       | Test `beforeEach` / `beforeAll` block; ideally calls `apps/api/seed/tenant-governance-default.ts` (already shipped under `BE-CC-001-FU-SEED`) or its in-test analog                      | Seed must go through **public service entry points** (`upsertCostCenter`, `upsertApprovalRule`, `upsertTenantQuotaPolicy`), not direct repository writes. Otherwise audit events 1, 6, 11 will not fire and the §4 21-event assertion will undercount.       |
| 3   | Drives booking create → asserts evaluation result requires approval → asserts quota reserved (ledger entry exists) | `owned-mobility.service.ts:519` `createTenantBooking`; ledger via `tenantPartnerService.listTenantQuotaLedger(...)` or `getTenantQuotaSummary(...)`                                      | The evaluation result must be `require_approval` — the fixture rule must have a condition that matches the fixture booking. After create, assert the ledger has exactly one `reserve` entry with the expected `bookingId` and `bookingCountReserved=1`.      |
| 4   | Drives approval approve → asserts `booking.approvalState = approved` + booking is schedulable                      | `tenantPartnerService.recordApprovalDecision({ command: "Approve" })`; then `ownedMobilityService.getOrder(orderId)` should return `approvalState = "approved"` and a schedulable status | The "schedulable" assertion must check `OwnedOrderRecord.status` (or the schedulable predicate) — not just the `approvalState` field. The reviewer should confirm the test does not conflate the two.                                                        |
| 5   | Drives dispatch + complete → asserts quota usage moves reserved → consumed                                         | `owned-mobility.service.ts:1374` `dispatchOrder`; whichever completion entry point the parent owner adds (see §3.3 gap)                                                                  | **Gap flag.** No production `consumeTenantQuota` method exists at packet generation time. The reviewer must confirm one of the three resolution paths from §3.3 (new primitive, relaxed acceptance, or follow-up split) before approving.                    |
| 6   | Drives billing export → asserts cost-center name + `ownerUserId` enriched on export row                            | `billing-settlement.service.ts:602` `listSettlementMatrix()`; export row for the test trip                                                                                               | The fixture cost-center directory record must carry `ownerUserId !== null` so the enrichment is observable. (Separately, event 21 `approver_fallback_used` requires `ownerUserId=null` for a different cost center — these are two different fixture rows.)  |
| 7   | Asserts all 21 audit event names from execution packet §5 fired with correct `resourceType` / `resourceId`         | Audit-event capture (audit-notification module or test double); §4 inventory in this packet                                                                                              | Reviewer must walk the §4 table top-to-bottom against the test's audit assertions. The test must capture audit emissions from **all** of: fixture seed, booking create, approve, dispatch, complete, billing export, and (separately) update + reject paths. |
| 8   | Tests booking update path that triggers re-evaluation (Q5 trigger) — old approval cancelled, new request created   | `owned-mobility.service.ts:987` `updateTenantBooking`; §3.5 in this packet                                                                                                               | Must cover **at least one** whitelisted field (12 listed in §3.5) **and** at least one non-trigger field (e.g. `notes`) to prove the whitelist is honoured in both directions. The test should not pass if a non-trigger update accidentally re-evaluates.   |
| 9   | `pnpm --filter @drts/api test` passes including new file                                                           | `pnpm --filter @drts/api test` from repo root or `apps/api/`                                                                                                                             | **Vitest-include hazard** (§6). Adding a new file under `apps/api/tests/integration/` will be silently skipped unless the root `vitest.config.ts` `test.include` glob is also updated. Reviewer must confirm the integration file is actually executed.      |

Additional reviewer-side checks the bullet list does not call out
explicitly but the integration discipline requires:

- The test must drive the chain through **public service entry
  points** (`OwnedMobilityService.createTenantBooking`,
  `TenantPartnerService.recordApprovalDecision`,
  `OwnedMobilityService.dispatchOrder`,
  `BillingSettlementService.listSettlementMatrix`, etc.) and **not**
  by reaching into private methods or direct repository writes. The
  whole point of an e2e test is to prove the public surfaces compose;
  bypassing them defeats the purpose.
- The audit-event capture must observe events emitted **inside** the
  service-layer transactions, not events emitted by the test
  scaffold. The reviewer should confirm the audit capture wires into
  the same event bus / audit-notification module that production
  consumes.
- All assertions on `TenantQuotaLedgerEntry` shape must use the
  contract types from `packages/contracts/src/index.ts`, not
  ad-hoc field names — if the parent introduces ad-hoc field
  shorthands in the test, that is contract drift.
- The booking fixture must use a `reservationWindowStart` that lands
  in a single Asia/Taipei monthly period (per `BE-QUOTA-001` packet
  §2.5) so the quota snapshot length is 1, not 2 — otherwise the
  ledger / summary assertions in acceptance bullet 3 become
  ambiguous.

---

## 6. Vitest-include Hazard

The current repo-root `vitest.config.ts` declares:

```ts
include: ["tests/unit/**/*.test.ts", "tests/load/**/*.test.ts"],
```

It does **not** include `tests/integration/**/*.test.ts`.

When `pnpm --filter @drts/api test` runs from `apps/api/`, vitest
walks up to the repo-root config and resolves those globs against
the package cwd (`apps/api/`). The new file
`apps/api/tests/integration/tenant-governance-e2e.test.ts` will be
silently skipped unless the config is also updated to include
`"tests/integration/**/*.test.ts"`.

At packet generation time:

- `apps/api/tests/integration/` does **not** exist
- `vitest.config.ts:16` reads `include: ["tests/unit/**/*.test.ts",
"tests/load/**/*.test.ts"]`
- there is no `apps/api/vitest.config.ts` overriding the root

Reviewer implication: the parent owner's canonical commit must
either:

1. update repo-root `vitest.config.ts` to add
   `"tests/integration/**/*.test.ts"` to the `test.include` array,
   **or**
2. add an `apps/api/vitest.config.ts` that overrides the include
   glob for the api package specifically and confirms the root
   config still discovers existing unit / load tests.

Reviewer should not approve a parent commit that adds the test file
without proving (via a logged `pnpm --filter @drts/api test` run
with `--reporter=verbose`) that the new file is actually picked up
by vitest. A `passWithNoTests`-style green light from
`apps/api/package.json` would silently mask a non-discovered test.

The reviewer should also confirm the previously-passing test count
**grows** (from the `BE-APR-001`-time baseline of 346 tests) by at
least the number of `it()` blocks in the new integration file.
Equal count = test not discovered.

---

## 7. Commit-Evidence Hazard

The parent task `BE-INTEG-001` has `mutates_canonical=true`, so
under the canonical implementation commit-evidence rule
(`AI_COLLABORATION_GUIDE.md` §5) its `done` requires:

- a local git commit
- `COMMIT_HASH` and `COMMIT_SUBJECT` provided to `scripts/ai-status.sh done`
- commit subject includes the task id (e.g.
  `test(BE-INTEG-001): add tenant governance E2E integration test`)
- commit body trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: BE-INTEG-001`
  - `Reviewer: Codex2`
- a normal non-force push with `PUSH_REMOTE=origin` and
  `PUSH_BRANCH=feat/claude2-ui-redesign-foundation`

At packet generation time (`2026-05-13T18:04Z`):

- the test file does **not** exist in the working tree
- the directory `apps/api/tests/integration/` does **not** exist
- `git ls-files apps/api/tests/integration/` returns **empty**
- `git log -- apps/api/tests/integration/` returns **no commits**
- no `commit_hash` / `commit_subject` / `push_*` fields appear on
  the `BE-INTEG-001` row in `ai-status.json`
- the active branch is `feat/claude2-ui-redesign-foundation` (matches
  the push branch all sibling Wave 3 slices used)

This is consistent with the parent task being `in_progress`, but
the reviewer must verify at handoff time that:

1. the new directory `apps/api/tests/integration/` and the new file
   `apps/api/tests/integration/tenant-governance-e2e.test.ts` are
   both tracked under the parent's canonical commit
2. any necessary `vitest.config.ts` change (§6) is included in the
   **same** canonical commit (not split across commits — that would
   make the test discoverable at one commit but not another)
3. the commit body carries the three required trailers above
4. the push lands on `feat/claude2-ui-redesign-foundation` (the
   active working branch matching all sibling Wave 3 slices) without
   `--force`
5. the canonical implementation rule is fully honoured before
   `ai-status.sh done BE-INTEG-001` is invoked

If the parent owner handoff arrives with the file still untracked
or the test not discoverable by vitest, the reviewer should
`reopen` and not `approve`. There is no sidecar /
`NO_COMMIT_REQUIRED` exemption available for `BE-INTEG-001` itself
— that flag is reserved for support-only artifacts like this
packet, not for canonical test slices that the wave depends on.

---

## 8. Downstream Risk Map

`BE-INTEG-001` does not formally block anything in
`ai-status.json` at packet generation time, but its empirical proof
of end-to-end chain health is load-bearing for:

- **`TEN-UI-RD-010` TN_NewBooking quota card + approval UX** —
  declared in execution packet §7 as unblocking when all four Wave 3
  backend slices are `done`. They are. But the UI slice consumes the
  composed governance result (cost-center + rule + quota + approval)
  via the `BookingRecord.approvalState` / `approvalRequestIds`
  fields and the cost-center-aware booking-create command. If
  `BE-INTEG-001` later flushes out a composition bug (e.g.
  `evaluateTenantBookingGovernance` not threading `reserveTenantQuota`
  inside the booking-write tx atomically, or
  `cancelApprovalRequestsForReevaluation` not actually firing on the
  whitelisted update path), the UI slice would inherit the bug
  without a defended e2e invariant.
- **`TEN-UI-RD-099` Tenant Portal close-out** — depends on the same
  four backend slices. The same composition-bug risk applies.
- **`ADM-UI-RD-010` admin parity for tenant governance** — depends
  on the same four backend slices, exposed via the admin-console
  parity routes. The same composition-bug risk applies.

The reviewer should not let any of these downstream concerns expand
the scope of `BE-INTEG-001` itself. The parent owner has scoped the
slice to the **single-tenant happy path** end-to-end chain with one
re-eval scenario. Race / load coverage is already owned by
`BE-LOAD-001` (now `done`). Multi-tenant / cross-tenant isolation is
a future hardening task, not in scope here.

---

## 9. Reviewer Handoff Checklist

When the parent task handoff lands in the reviewer queue (`Codex2`
receives `AI_NAME=Codex scripts/ai-status.sh handoff BE-INTEG-001
Codex2 "..."`), the reviewer should:

1. re-read `ai-status.json → BE-INTEG-001` for live `status`,
   `commit_hash`, `commit_subject`, `push_remote`, `push_branch`
2. confirm the commit referenced by `commit_hash` exists locally and
   that it tracks both `apps/api/tests/integration/` (new directory)
   and `apps/api/tests/integration/tenant-governance-e2e.test.ts`
   (new file)
3. confirm the same commit also tracks any necessary
   `vitest.config.ts` update (§6 hazard) so the test is actually
   discoverable
4. walk §5 acceptance table top-to-bottom against the file at that
   commit (not the working-tree HEAD if they have drifted)
5. cross-check §4 21-event audit inventory against the test's audit
   assertions — especially event 21 (`approver_fallback_used`,
   which requires a fixture cost-center with `ownerUserId=null`),
   event 17 (`booking.approval_request.rejected`, which requires a
   separate reject scenario), and event 19
   (`booking.approval_request.cancelled_by_re_evaluation`, which
   requires the whitelisted-field update path)
6. verify §3.3 quota reserve → consume gap is resolved by either a
   new production primitive, a relaxed acceptance bullet (with
   documented sign-off), or a follow-up split task
7. run `pnpm --filter @drts/api test` with `--reporter=verbose` and
   confirm the integration file is picked up by vitest and that the
   total-tests count grew over the `BE-APR-001`-time baseline of 346
8. if everything holds, `approve` with a brief review note pointing
   at the e2e chain, the §4 21-event assertion set, and the §6
   vitest-include change
9. if any check fails, `reopen` or `blocker` with a specific cite
   (file + line + which acceptance bullet)

This packet does not modify `ai-status.json` and does not represent
machine truth. Reviewer must always defer to the live `ai-status.json`
and `ai-activity-log.jsonl` values.
