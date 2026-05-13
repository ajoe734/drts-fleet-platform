# BE-APR-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `BE-APR-001` - Tenant Booking Approval Workflow
**Parent Owner:** `Codex`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-13` (UTC)
**Snapshot anchor (parent `last_update`):** `2026-05-13T17:07:22Z`
**Snapshot anchor (sidecar `last_update`):** `2026-05-13T17:13:55Z`
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or parent lifecycle fields.

This packet is reviewer support only. It translates the current
`ai-status.json` acceptance bar for `BE-APR-001` into a concrete checklist,
pins the hard dependencies on `BE-RULE-001` and `BE-QUOTA-001`, maps the
downstream unblock edges, and records the current in-flight implementation
signals already visible in the worktree so the reviewer can focus on
completeness and regression risk instead of rediscovering scope.

Transient lifecycle truth (`status`, `next`, `last_update`, handoff messages,
commit/push evidence) remains authoritative only in `ai-status.json` and
`ai-activity-log.jsonl`. If those values drift after this packet was generated,
machine truth wins.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance checklist from `ai-status.json`
- pin the upstream dependency edges from `BE-RULE-001` and `BE-QUOTA-001`
- map each acceptance item to the code surfaces the reviewer should inspect
- record visible worktree signals and current implementation gaps relevant to
  reviewer handoff

Out of scope:

- editing L1/L2 product truth, `ai-status.json`, `current-work.md`, or any
  parent implementation file
- approving or modifying sibling slices `BE-RULE-001` or `BE-QUOTA-001`
- replacing the parent's own executable verification, commit evidence, or
  canonical handoff

---

## 2. Machine Truth Anchors

### 2.1 Sidecar task snapshot

Machine-truth row: `ai-status.json` -> `BE-APR-001-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- depends_on=`[BE-RULE-001, BE-QUOTA-001]`
- helper_parent=`BE-APR-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 2.2 Parent task snapshot

Machine-truth row: `ai-status.json` -> `BE-APR-001`

- title=`Tenant Booking Approval Workflow`
- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`[BE-RULE-001, BE-QUOTA-001]`
- planning_ref=`docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
- unblocks=`[TEN-UI-RD-010, TEN-UI-RD-099]`
- mutates_canonical=`true`
- artifacts:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `packages/api-client/src/index.ts`
  - `apps/api/tests/unit/tenant-approval-workflow.test.ts`
  - `apps/api/tests/unit/owned-mobility.service.test.ts`

### 2.3 Hard upstream dependencies

Machine-truth rows:

- `BE-RULE-001`
  - status=`done`
  - commit_hash=`c0f533c3a73a9a71367f8eda308e8e9a075cd867`
  - commit_subject=`feat(BE-RULE-001): tenant approval rules canonical contract + evaluator + API surface`
- `BE-QUOTA-001`
  - status=`done`
  - commit_hash=`73b53eedd0c7c96549b36a6fe813c6acb870bbb1`
  - commit_subject=`fix(BE-QUOTA-001): add quota persistence migration and DB-path coverage`

Reviewer implication:

- `BE-APR-001` must consume approval-rule evaluation results and quota
  reservation semantics from those shipped slices, not redefine them.
- Any contract drift in approval mode, fallback policy, approver descriptor,
  or quota reservation result shape should be treated as a regression.

---

## 3. Planning Anchors

Primary planning anchor:

- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  - section `3 Shared types`
  - section `4.4 BE-APR-001 - Tenant Booking Approval Workflow`
  - section `5 Audit taxonomy additions`
  - section `7 Downstream unblock map`

Historical context only:

- `docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
- `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`

Reviewer note:

- the execution packet is the authoritative planning anchor for acceptance
  review; older packets explain rationale but do not override section `4.4`

---

## 4. Dependency Map

### 4.1 Hard dependencies

| Dependency     | Status | Relevance                                                                                                                                          |
| -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-RULE-001`  | `done` | owns `TenantApprovalEvaluationResult`, approval modes, fallback policy, approver descriptor vocabulary, and rule-trigger semantics consumed by APR |
| `BE-QUOTA-001` | `done` | owns `reserveTenantQuota`, quota ledger impact semantics, `QUOTA_INSUFFICIENT_AT_COMMIT`, and DB-backed reservation ordering consumed by APR       |

### 4.2 Downstream coupling

| Task                | Relationship   | Relevance                                                                                               |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-010`     | direct unblock | tenant booking UI needs approval state, request listing/detail, and action semantics                    |
| `TEN-UI-RD-099`     | direct unblock | tenant booking detail / approval UX depends on approval request lifecycle and booking mirror fields     |
| `BE-INTEG-001`      | follow-on      | end-to-end governance flow depends on APR to connect rule + quota + booking lifecycle                   |
| `BE-APR-NOTIFY-001` | follow-on      | notification fan-out depends on APR audit/request creation events and resolved approver ids             |
| `OPS-UI-APR-001`    | follow-on      | Ops queue depends on approval request state and stale-pending visibility                                |
| `OBS-GOV-001`       | follow-on      | governance observability depends on approval pending count, age, timeout/escalation, and audit emission |

### 4.3 Shared ownership map

| Surface                                                                    | Owned upstream | Consumed here |
| -------------------------------------------------------------------------- | -------------- | ------------- |
| `TenantApprovalMode`, `TenantPrincipalRef`, `TenantApprovalFallbackPolicy` | `BE-RULE-001`  | yes           |
| `TenantApprovalEvaluationResult`                                           | `BE-RULE-001`  | yes           |
| `reserveTenantQuota` + quota ledger result                                 | `BE-QUOTA-001` | yes           |
| booking `approvalState` / `approvalRequestIds` mirror                      | `BE-APR-001`   | owned here    |
| approval request / decision records and commands                           | `BE-APR-001`   | owned here    |

---

## 5. Reviewer Checklist

The reviewer should walk the parent against the live `ai-status.json`
acceptance list and execution packet section `4.4`.

### 5.1 Contracts and exported commands

- verify `packages/contracts/src/index.ts` exports:
  - `TenantBookingApprovalState`
  - `TenantBookingApprovalRequestRecord`
  - `TenantBookingApprovalDecisionRecord`
  - `ListTenantBookingApprovalRequestsQuery`
  - `ApproveTenantBookingApprovalRequestCommand`
  - `RejectTenantBookingApprovalRequestCommand`
  - `EscalateTenantBookingApprovalRequestCommand`
- verify request status union includes:
  - `pending`
  - `approved`
  - `rejected`
  - `cancelled_by_re_evaluation`
  - `timeout_escalated`
- verify `OwnedOrderRecord` and `BookingRecord` both expose:
  - `approvalState`
  - `approvalRequestIds`

### 5.2 Persistence and repository wiring

- verify two new tables exist and match the accepted contract:
  - `core.phase1_tenant_approval_requests`
  - `core.phase1_tenant_approval_decisions`
- verify persisted request fields include:
  - `timeoutAt`
  - `escalatedAt`
  - `fallbackPolicy`
  - `escalationTarget`
  - `previousApprovers`
- verify repository/service paths support:
  - create request during booking write flow
  - append approval/reject decisions
  - manual escalation
  - lookup list/detail by tenant and booking

### 5.3 Workflow behavior

- verify booking create/update wires operations in this order:
  - rule evaluation
  - quota reservation
  - approval request creation when required
- verify a failure in any step rolls back the booking-write transaction
- verify approver resolution converts:
  - `tenant_user`
  - `tenant_role`
  - `cost_center_owner`
  - `tenant_finance_admin`
  - `tenant_admin`
    into concrete `tenant_user` ids at request creation time
- verify empty resolution throws `APPROVAL_NO_RESOLVABLE_APPROVERS`
- verify `any_of` works end-to-end
- verify `all_of_parallel` works end-to-end
- verify `ordered_chain` is accepted in contract and, if downgraded in P1,
  the limitation is explicitly documented in the parent handoff

### 5.4 Re-evaluation behavior

- verify the Q5 trigger whitelist is implemented exactly for:
  - `costCenterCode`
  - `businessDispatchSubtype`
  - `reservationWindowStart`
  - `reservationWindowEnd`
  - `passengerId`
  - `passenger.role`
  - `quotedFare`
  - `vehiclePreference`
  - `partnerEntrySlug`
  - `eligibilityVerificationId`
  - `signoffRequired`
  - `expenseProofRequired`
- verify these fields do **not** trigger re-evaluation:
  - `notes`
  - `terminal`
  - `luggageCount`
  - `onsiteContact`
  - `bookedBy`
- verify if re-evaluation no longer requires approval, pending requests are
  cancelled with `cancelled_by_re_evaluation` and booking state is updated

### 5.5 API, authorization, and timeout behavior

- verify 5 routes exist under `/api/tenant/approval-requests`:
  - list
  - detail
  - approve
  - reject
  - escalate
- verify approve/reject authorization is per-request membership in
  `resolvedApproverUserIds`, not only role-based
- verify non-approver action returns `APPROVAL_NOT_AUTHORIZED`
- verify P1 timeout behavior ships both:
  - manual escalate route by `tenant_admin`
  - stub cron entry that returns `501`

### 5.6 Audit, client, and tests

- verify audit events exist:
  - `booking.approval_request.created`
  - `booking.approval_request.approved`
  - `booking.approval_request.rejected`
  - `booking.approval_request.timeout_escalated`
  - `booking.approval_request.cancelled_by_re_evaluation`
  - `booking.approval_state.changed`
  - `approver_fallback_used`
- verify `packages/api-client/src/index.ts` exposes 5 new approval-request
  methods and corresponding booking-flow integration
- verify test coverage includes:
  - `any_of`
  - `all_of_parallel`
  - `cost_center_owner` fallback
  - re-eval trigger and non-trigger cases
  - `APPROVAL_NOT_AUTHORIZED`
  - `APPROVAL_NO_RESOLVABLE_APPROVERS`
  - manual escalate
- verify executable checks passed:
  - `pnpm --filter @drts/contracts build`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test`

---

## 6. Current Worktree Signals

These signals are reviewer aids only; they are not acceptance by themselves.

### 6.1 Visible progress already present

- `packages/contracts/src/index.ts` already contains the APR-specific contract
  exports and booking mirror fields.
- `apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts` exists and
  already contains:
  - re-evaluation trigger helper
  - approver resolution helper
  - approval-mode execution normalization
  - request status computation for `any_of` and `all_of_parallel`
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` already
  references:
  - `core.phase1_tenant_approval_requests`
  - `core.phase1_tenant_approval_decisions`
- `infra/migrations/V0024__tenant_approval_workflow.sql` already exists in the
  worktree and appears to define the two approval tables expected by the parent
  scope.

### 6.2 In-flight gaps reviewer should actively verify

- declared artifact `apps/api/tests/unit/tenant-approval-workflow.test.ts`
  was **not present** in the worktree at packet generation time
- grep did **not** yet show approval-request route strings or approval audit
  event strings in:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `packages/api-client/src/index.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` currently has
  `mapOrderToBooking`, but the visible mapping slice at packet time did not yet
  show `approvalState` / `approvalRequestIds` being copied through, so reviewer
  should confirm the final handoff includes that mirror and not just the type
  additions
- `apps/api/tests/unit/tenant-partner.service.test.ts` currently shows quota
  reservation coverage, but this packet generation pass did not surface the
  APR-specific test matrix yet; reviewer should treat that as unverified until
  the parent handoff includes direct evidence

Reviewer posture:

- treat section 6.1 as "foundation exists"
- treat section 6.2 as "must be checked before approval"

---

## 7. Reviewer Handoff Expectations

Before approving the parent, the reviewer should expect the owner handoff to
include:

- precise note on whether `ordered_chain` is fully executed or intentionally
  downgraded to `all_of_parallel` for P1
- explicit verification evidence for:
  - contracts build
  - API typecheck
  - API tests
- confirmation that booking transaction rollback behavior was exercised
- confirmation that request-level authorization rejects non-approvers
- confirmation that the timeout cron stub exists and intentionally returns 501

If any of those are absent, prefer `reopen` over inferring behavior from partial
worktree signals.

---

## 8. Sidecar Closeout

This sidecar creates one support artifact only:

- `support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-ACCEPTANCE.md`

It does not modify canonical truth, runtime code, or the parent task's commit
evidence. Parent owner `Codex` remains responsible for the canonical
implementation, executable verification, commit/push evidence, and reviewer
handoff.
