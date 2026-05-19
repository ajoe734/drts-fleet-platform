# Tenant Governance UAT Scenarios — 2026-05-19

**Task:** `TGV-UAT-001`  
**Owner:** `Codex2`  
**Reviewer:** `Codex`  
**Date:** `2026-05-19`  
**Source tasks:** `TGV-NEG-001`, `TST-E2E-005-TGV`  
**Primary automation:** `tests/e2e/E2E-005-tenant-governance.sh`, `tests/integ/tenant-governance-negative.test.ts`

## 1. Purpose

This document turns the tenant-governance negative-path pack into a UAT-ready
scenario set for Phase 1. It is intentionally availability-first: the same ten
negative paths are represented as operator-readable scenarios and mapped back to
the shipped shell E2E plus the deterministic integration companion.

The scenarios cover four tenant-governance invariants:

1. Cost-center validation fails closed.
2. Quota and approval-policy gates block unsafe bookings before dispatch.
3. Approval-request lifecycle behaves correctly when bookings change.
4. Every negative path leaves an auditable evidence chain.

## 2. Scope And Surfaces

**Surface chain**

```text
Tenant Console (cost center / quota / rule / booking / approval actions)
  -> Platform Admin or Ops dispatch surface
  -> Audit trail and governance summary
```

**In scope**

- Cost-center directory validation
- Quota hard-block behavior
- Approval-rule block / require-approval behavior
- Approval-request rejection, re-evaluation, and escalation
- Dispatch denial for blocked or rejected bookings
- Governance summary visibility for pending approvals
- Audit evidence for each negative path

**Out of scope**

- Happy-path tenant booking creation
- Driver execution after a successful governance approval
- Cross-product reporting beyond the governance summary and audit chain

## 3. Preconditions

The operator or environment should provide:

1. A seed tenant with active `tenant_admin` and `tenant_finance_admin` users.
2. Tenant Console routes for cost centers, quotas, approval rules, bookings,
   and approval requests.
3. Platform Admin or equivalent privileged surface that can inspect audit logs
   and attempt dispatch.
4. Access to the governance summary surface
   (`/admin/tenant-governance/summary` in the automated path).

If the environment cannot safely provide approval actors or cross-tenant setup,
the scenario may be recorded as skipped, but the skip reason must be explicit.

## 4. UAT Scenario Matrix

| ID       | Scenario | Primary actor | Expected result | Automation crosswalk |
| -------- | -------- | ------------- | --------------- | -------------------- |
| `TGV-UAT-01` | Unknown cost center | `tenant_admin` | Booking rejected with `BOOKING_COST_CENTER_UNKNOWN`; no booking persisted | E2E-005 A |
| `TGV-UAT-02` | Disabled cost center | `tenant_admin` | Booking rejected with `BOOKING_COST_CENTER_DISABLED` | E2E-005 B |
| `TGV-UAT-03` | Cross-tenant cost center isolation | `platform_admin`, `tenant_admin` | Other tenant's cost center is treated as unknown by caller tenant | E2E-005 C |
| `TGV-UAT-04` | Quota insufficient hard block | `tenant_admin`, `tenant_finance_admin` | Booking commit fails with `QUOTA_INSUFFICIENT_AT_COMMIT`; no quota residue | E2E-005 D |
| `TGV-UAT-05` | Approval rule block prevents dispatch | `tenant_admin`, `platform_admin` | Booking enters `approvalState=blocked`; dispatch denied | E2E-005 E |
| `TGV-UAT-06` | Missing approver rolls back cleanly | `tenant_admin` | `APPROVAL_NO_RESOLVABLE_APPROVERS`; no booking, approval, or quota residue | E2E-005 F |
| `TGV-UAT-07` | Governance-sensitive update re-evaluates approval | `tenant_admin` | Approval request rotates when cost center changes | E2E-005 G |
| `TGV-UAT-08` | Notes-only update does not re-evaluate | `tenant_admin` | Same approval request remains active after notes-only update | E2E-005 H |
| `TGV-UAT-09` | Rejected booking cannot dispatch | `tenant_finance_admin`, `platform_admin` | Rejected booking stays undispatched; no driver task created | E2E-005 I |
| `TGV-UAT-10` | Manual escalation remains visible | `tenant_admin`, `platform_admin` | Escalated pending approval remains visible in governance summary and audit | E2E-005 J |

## 5. Detailed Scenarios

### TGV-UAT-01 — Unknown cost center

**Steps**

1. Log in as `tenant_admin`.
2. Create a tenant booking with a non-existent cost center code.
3. Submit the booking.
4. Check booking list and platform audit.

**Expected**

- API/UI returns `BOOKING_COST_CENTER_UNKNOWN`.
- No booking is created.
- Audit contains `booking.cost_center.validation_rejected`.

### TGV-UAT-02 — Disabled cost center

**Steps**

1. Ensure a valid cost center exists.
2. Disable that cost center.
3. Submit a new booking using the disabled code.
4. Inspect the rejection and audit row.

**Expected**

- Submission fails with `BOOKING_COST_CENTER_DISABLED`.
- The disabled code is reflected in audit evidence.

### TGV-UAT-03 — Cross-tenant cost center isolation

**Steps**

1. As `platform_admin`, create or identify a second tenant.
2. Under the second tenant, create a cost center.
3. Return to the original tenant session.
4. Submit a booking using the other tenant's cost-center code.

**Expected**

- Caller tenant receives `BOOKING_COST_CENTER_UNKNOWN`.
- No cross-tenant reuse or leakage occurs.
- Audit records validation rejection, not cross-tenant adoption.

### TGV-UAT-04 — Quota insufficient hard block

**Steps**

1. Create a quota policy with hard-block limits for a target cost center.
2. Submit a booking against that cost center.
3. Inspect quota ledger and booking list after failure.

**Expected**

- Submission fails with `QUOTA_INSUFFICIENT_AT_COMMIT`.
- No booking is committed.
- Quota ledger does not retain orphaned reservation residue.
- Audit contains `tenant.quota_reservation.blocked`.

### TGV-UAT-05 — Approval rule block prevents dispatch

**Steps**

1. Create an approval rule with action `block` for a target cost center.
2. Create a booking using that cost center.
3. Read the resulting booking state.
4. As `platform_admin`, attempt to dispatch the resulting order.

**Expected**

- Booking persists with `approvalState=blocked`.
- Dispatch attempt fails with `BOOKING_APPROVAL_PENDING`.
- Audit records approval-state change to `blocked`.

### TGV-UAT-06 — Missing approver rolls back cleanly

**Steps**

1. Create a `require_approval` rule that resolves to a missing tenant role.
2. Capture current quota-ledger count for the target cost center.
3. Submit a booking that triggers the rule.
4. Re-check quota ledger, booking list, and approval requests.

**Expected**

- Submission fails with `APPROVAL_NO_RESOLVABLE_APPROVERS`.
- No booking persists.
- No approval request persists.
- Quota-ledger count is unchanged.

### TGV-UAT-07 — Governance-sensitive update re-evaluates approval

**Steps**

1. Create a booking that triggers approval request A.
2. Update a governance-sensitive field, specifically the cost center.
3. Reload the booking and approval-request list.

**Expected**

- Original approval request is cancelled by re-evaluation.
- A replacement approval request is created.
- Booking remains in pending governance posture.
- Audit contains
  `booking.approval_request.cancelled_by_re_evaluation`.

### TGV-UAT-08 — Notes-only update does not re-evaluate

**Steps**

1. Create a booking that already has a pending approval request.
2. Update only a notes field.
3. Reload booking detail and approval requests.

**Expected**

- Approval request ID remains unchanged.
- No replacement request is created.
- No re-evaluation cancellation audit is written.

### TGV-UAT-09 — Rejected booking cannot dispatch

**Steps**

1. Create a booking that requires finance approval.
2. As `tenant_finance_admin`, reject the approval request.
3. As `platform_admin`, attempt dispatch on the associated order.
4. Inspect driver task list if available.

**Expected**

- Booking moves to `approvalState=rejected` and cancellation posture.
- Dispatch fails with `BOOKING_APPROVAL_PENDING`.
- No driver task is created.
- Audit contains `booking.approval_request.rejected`.

### TGV-UAT-10 — Manual escalation remains visible

**Steps**

1. Create a booking that produces a pending approval request.
2. Trigger manual escalation on that request as `tenant_admin`.
3. Open the governance summary surface.
4. Inspect audit records.

**Expected**

- Escalated request remains represented in governance summary pending counts.
- Audit contains `booking.approval_request.timeout_escalated`.
- The summary remains usable even when the environment cannot simulate a
  time-travelled 48-hour breach.

## 6. Audit Expectations

Each scenario should retain an evidence chain that is human-readable and
machine-checkable. The minimum audit anchor by scenario is:

| Scenario | Minimum audit evidence |
| -------- | ---------------------- |
| `TGV-UAT-01` | `booking.cost_center.validation_rejected` |
| `TGV-UAT-02` | `booking.cost_center.validation_rejected` |
| `TGV-UAT-03` | `booking.cost_center.validation_rejected` |
| `TGV-UAT-04` | `tenant.quota_reservation.blocked` |
| `TGV-UAT-05` | `booking.approval_state.changed` |
| `TGV-UAT-06` | `booking.approval_rules.evaluated` |
| `TGV-UAT-07` | `booking.approval_request.cancelled_by_re_evaluation` |
| `TGV-UAT-08` | approval-request continuity with no cancellation audit |
| `TGV-UAT-09` | `booking.approval_request.rejected` |
| `TGV-UAT-10` | `booking.approval_request.timeout_escalated` |

## 7. Automation Mapping

| UAT scenario | Shell E2E coverage | Integration coverage | Notes |
| ------------ | ------------------ | -------------------- | ----- |
| `TGV-UAT-01` | `subcase_unknown_cost_center` | yes | Deterministic rejection + audit |
| `TGV-UAT-02` | `subcase_disabled_cost_center` | yes | Directory disable path |
| `TGV-UAT-03` | `subcase_cross_tenant_cost_center` | yes | Live E2E may skip if tenant creation unavailable |
| `TGV-UAT-04` | `subcase_quota_insufficient` | yes | Integration verifies no quota residue |
| `TGV-UAT-05` | `subcase_rule_block` | yes | Dispatch denial and blocked state |
| `TGV-UAT-06` | `subcase_no_approver_rollback` | yes | Integration verifies no approval/quota residue |
| `TGV-UAT-07` | `subcase_notes_and_reevaluation_and_rejection` | yes | E2E step bundle covers G/H/I together |
| `TGV-UAT-08` | `subcase_notes_and_reevaluation_and_rejection` | yes | Notes-only stability assertion |
| `TGV-UAT-09` | `subcase_notes_and_reevaluation_and_rejection` | yes | Rejection keeps dispatch blocked |
| `TGV-UAT-10` | `subcase_escalation_visible` | yes | Integration is authoritative for 48h SLA-age math |

## 8. Pass Criteria

This UAT pack is satisfied when:

1. The ten scenarios above are documented and traceable to shipped automation.
2. Every negative path either passes or records a bounded skip reason.
3. Dispatch remains impossible for blocked or rejected governance states.
4. Approval-request lifecycle distinguishes between governance-sensitive and
   notes-only updates.
5. Audit evidence exists for every state-changing failure path.

## 9. Verification Snapshot

- `bash -n tests/e2e/E2E-005-tenant-governance.sh`
- `pnpm --filter @drts/api test:tenant-governance-negative`
- `bash tests/e2e/run-e2e.sh --suite 005 --dry-run`

If `pnpm` dependencies are absent in the isolated worktree, treat the
integration command as environment-blocked and preserve the shell syntax check
plus document/source traceability as the minimum repo-local verification.
