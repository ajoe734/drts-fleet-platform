# Sidecar Acceptance Packet: BE-APR-001

- **Parent Task:** `BE-APR-001` (`Tenant Booking Approval Workflow`)
- **Sidecar Task:** `BE-APR-001-SIDECAR-ACCEPTANCE`
- **Status:** `in_progress`
- **Owner:** `Codex`
- **Reviewer:** `Codex2`
- **Parent Owner:** `Claude2`
- **Parent Reviewer:** `Codex`
- **Scope Guardrail:** support artifact only; no canonical truth or runtime implementation changes
- **Primary Machine Truth:** `ai-status.json`
- **Reference Planning Doc:** `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md` (§2, §3, §4.4, §5, §7)

## 1. Purpose

This packet refreshes the acceptance checklist and dependency map for `BE-APR-001` using current machine truth plus repo-visible APR implementation anchors already present on `HEAD`.

It is reviewer support only. Canonical lifecycle truth stays in `ai-status.json` and `ai-activity-log.jsonl`; this file only helps `Codex` review the parent slice without re-discovering upstream gates, planning requirements, and already-landed source surfaces.

## 2. Machine-Truth Snapshot

Snapshot below is aligned to the current `ai-status.json` state captured during this pass.

| Task ID                         | Status        | Owner     | Reviewer  | Notes                                                                                                                     |
| ------------------------------- | ------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `BE-RULE-001`                   | `done`        | `Codex`   | `Codex2`  | Approval-rule evaluator/types are closed and pushed.                                                                      |
| `BE-QUOTA-001`                  | `done`        | `Codex`   | `Claude2` | Quota ledger/read-model is closed and pushed.                                                                             |
| `BE-APR-001`                    | `in_progress` | `Claude2` | `Codex`   | Parent implementation is active and currently carries reviewer-blocked follow-up findings against the APR acceptance bar. |
| `BE-APR-001-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex`   | `Codex2`  | This support packet only; no canonical/runtime edits allowed.                                                             |
| `BE-INTEG-001`                  | `todo`        | `Claude`  | `Codex2`  | Follows after APR; depends directly on this parent task.                                                                  |
| `BE-APR-NOTIFY-001`             | `backlog`     | `Codex`   | `Codex2`  | Notification fan-out remains blocked on APR done.                                                                         |

Direct machine-truth facts for the sidecar:

- `depends_on`: `BE-RULE-001`, `BE-QUOTA-001`
- `artifact`: `support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

## 3. Dependency Map

### 3.1 Direct hard dependencies

| Dependency     | Current status | Why it matters to APR acceptance                                                                                                                                             |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-RULE-001`  | `done`         | Owns `TenantApprovalEvaluationResult`, approval modes, approver descriptor vocabulary, fallback policy, and re-eval semantics that APR must consume without redefining.      |
| `BE-QUOTA-001` | `done`         | Owns quota reservation ordering, ledger semantics, and `QUOTA_INSUFFICIENT_AT_COMMIT` behavior that APR must execute before approval-request creation in booking-write flow. |

### 3.2 Downstream unblock edges

| Task                | Relationship      | Why it waits on APR                                                                                                         |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-010`     | direct unblock    | Tenant booking UI needs accepted approval-state and approval-request lifecycle behavior.                                    |
| `TEN-UI-RD-099`     | direct unblock    | Tenant booking detail / approval UX depends on approval request status and booking mirror fields.                           |
| `BE-INTEG-001`      | direct dependency | Governance E2E needs APR to connect rule evaluation, quota reservation, approval resolution, and booking state transitions. |
| `BE-APR-NOTIFY-001` | blocked follow-on | Fan-out uses APR audit events and resolved approver ids.                                                                    |
| `OBS-GOV-001`       | blocked follow-on | Approval pending count / timeout age / escalation metrics depend on APR lifecycle.                                          |

### 3.3 Ownership split the reviewer should preserve

| Surface                                                                                                      | Owned by       | APR reviewer expectation                                                                     |
| ------------------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------- |
| `TenantApprovalMode`, `TenantPrincipalRef`, `TenantApprovalFallbackPolicy`, `TenantApprovalEvaluationResult` | `BE-RULE-001`  | confirm APR imports/consumes these shapes instead of inventing new variants                  |
| quota reservation / ledger semantics                                                                         | `BE-QUOTA-001` | confirm APR executes quota reservation in the required order and respects quota-owned errors |
| approval request lifecycle + booking approval mirror                                                         | `BE-APR-001`   | confirm parent task owns and closes these behaviors                                          |

## 4. Parent Acceptance Checklist

Reviewer should walk `BE-APR-001` against the live acceptance row in `ai-status.json` plus execution packet §4.4.

### 4.1 Contracts and booking mirror

- verify `packages/contracts/src/index.ts` exports:
  - `TenantBookingApprovalState`
  - `TenantBookingApprovalRequestRecord`
  - `TenantBookingApprovalDecisionRecord`
  - `ApproveTenantBookingApprovalRequestCommand`
  - `RejectTenantBookingApprovalRequestCommand`
  - `EscalateTenantBookingApprovalRequestCommand`
- verify request statuses include `pending`, `approved`, `rejected`, `cancelled_by_re_evaluation`, `timeout_escalated`
- verify `OwnedOrderRecord` and `BookingRecord` both expose `approvalState` + `approvalRequestIds`

### 4.2 Persistence and transaction wiring

- verify `core.phase1_tenant_approval_requests` and `core.phase1_tenant_approval_decisions` are the only new persistence tables for APR
- verify stored request fields include `timeoutAt`, `escalatedAt`, `fallbackPolicy`, `escalationTarget`, `previousApprovers`
- verify booking create/update order is:
  - rule evaluation
  - quota reservation
  - approval request creation when required
- verify booking-write transaction rolls back on failure in any of those steps

### 4.3 Workflow behavior

- verify approver resolution maps `tenant_role`, `cost_center_owner`, `tenant_finance_admin`, `tenant_admin` descriptors to concrete `tenant_user` ids at request creation time
- verify empty resolution throws `APPROVAL_NO_RESOLVABLE_APPROVERS`
- verify `any_of` works end-to-end
- verify `all_of_parallel` works end-to-end
- verify `ordered_chain` remains accepted in contract and, if downgraded to `all_of_parallel` for P1 execution, the owner documents that explicitly in the parent handoff

### 4.4 Re-evaluation and authorization behavior

- verify Q5 trigger whitelist is implemented exactly for `costCenterCode`, `businessDispatchSubtype`, `reservationWindowStart`, `reservationWindowEnd`, `passengerId`, `passenger.role`, `quotedFare`, `vehiclePreference`, `partnerEntrySlug`, `eligibilityVerificationId`, `signoffRequired`, `expenseProofRequired`
- verify `notes`, `terminal`, `luggageCount`, `onsiteContact`, `bookedBy` do not trigger re-evaluation
- verify if re-evaluation no longer requires approval, pending requests are cancelled with `cancelled_by_re_evaluation`
- verify approve/reject authorization is per-request membership in `resolvedApproverUserIds`, not only role-based
- verify non-approver action returns `APPROVAL_NOT_AUTHORIZED`

### 4.5 API, audit, and verification gates

- verify 5 parent acceptance routes exist under `/api/tenant/approval-requests`: list, detail, approve, reject, escalate
- verify P1 timeout ships manual escalate plus stub timeout-processing route that intentionally returns `501`
- verify audit events include:
  - `booking.approval_request.created`
  - `booking.approval_request.approved`
  - `booking.approval_request.rejected`
  - `booking.approval_request.timeout_escalated`
  - `booking.approval_request.cancelled_by_re_evaluation`
  - `booking.approval_state.changed`
  - `approver_fallback_used`
- verify API client exposes the 5 approval-request methods
- verify executable checks in the parent handoff are all present and pass:
  - `pnpm --filter @drts/contracts build`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test`

## 5. Repo-Visible Evidence On Current HEAD

These anchors are reviewer aids only. They do not replace the parent's own verification or handoff evidence.

### 5.1 Contracts and routes already visible

- `packages/contracts/src/index.ts:1344-1405` contains approval state/request/decision types and the three command contracts.
- `packages/contracts/src/index.ts:2259-2260` and `:2319-2320` expose `approvalState` and `approvalRequestIds` on booking/order records.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:657-751` exposes list/detail/approve/reject/escalate plus timeout-processing entrypoint under `/api/tenant/approval-requests`.
- `packages/api-client/src/index.ts:1465-1502` exposes the five approval-request client methods.

### 5.2 Persistence and service anchors already visible

- `infra/migrations/V0024__tenant_approval_workflow.sql:1-48` defines the APR request/decision tables and related indexes.
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:656-704` and `:1391-1444` write request/decision rows with `timeout_at` and `escalated_at` persistence.
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2099`, `:2168`, `:2244`, `:2313`, `:6361`, `:6472-6473`, `:6515` already show resolvable-approver failure, request creation, re-eval cancellation, authorization failure, timeout escalation, decision audit events, and fallback audit emission.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:666-693`, `:1184-1185`, `:4403-4416`, `:4680-4681`, `:5451-5452` already mirror approval state/request ids through booking/order lifecycle.

### 5.3 Unit-test surface already visible

- `apps/api/tests/unit/tenant-approval-workflow.test.ts:53-134` covers `any_of`, `all_of_parallel`, `ordered_chain` execution downgrade, and `cost_center_owner` fallback behavior.
- `apps/api/tests/unit/owned-mobility.service.test.ts:330-698` covers approval create/approve/reject flows, non-approver rejection, re-eval non-trigger (`notes` only), no-resolvable-approver failure, and manual escalate to `timeout_escalated`.

### 5.4 What still must come from the parent handoff

Even with the anchors above, the reviewer still needs explicit parent evidence for:

- executable gate results on the owner's final tree
- booking-write transaction rollback confirmation
- exact P1 handling note for `ordered_chain`
- confirmation that timeout-processing route is intentionally `501` stub behavior rather than accidental partial implementation

## 6. Reviewer Handoff Target

When `Codex` reviews the parent task, this packet should help narrow the review to four questions:

1. Does the parent still consume `BE-RULE-001` and `BE-QUOTA-001` contracts without redefining them?
2. Do request lifecycle, authorization, re-evaluation, and booking mirror behaviors satisfy the exact acceptance row?
3. Do the parent-run verification commands pass on the actual handoff tree?
4. If `ordered_chain` is downgraded in P1, is that limitation documented explicitly rather than implied?

When `Codex2` reviews this sidecar, the expected decision is narrower:

- confirm the packet matches current `ai-status.json`
- confirm dependency and evidence sections align with planning docs plus repo-visible source anchors
- confirm support-only scope was preserved and no canonical/runtime file was edited

## 7. Evidence Anchors

- `ai-status.json`
  - `BE-APR-001-SIDECAR-ACCEPTANCE`
  - `BE-APR-001`
  - `BE-RULE-001`
  - `BE-QUOTA-001`
  - `BE-INTEG-001`
  - `BE-APR-NOTIFY-001`
  - `OBS-GOV-001`
- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  - §2 Booking integration
  - §3 Shared types
  - §4.4 `BE-APR-001`
  - §5 Audit taxonomy
  - §7 UI unblock map
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `packages/api-client/src/index.ts`
- `apps/api/tests/unit/tenant-approval-workflow.test.ts`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `infra/migrations/V0024__tenant_approval_workflow.sql`

## 8. Sidecar Verification

This pass changes only `support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-ACCEPTANCE.md`.

Verification performed for the sidecar artifact:

- `ai-status.json` task/dependency snapshot review
- planning doc anchor review (`tenant-governance-wave-execution-packet-20260513.md`)
- committed-source anchor scan for contracts, controller, service, repository, migration, api-client, and unit tests
- `git diff --check -- support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-ACCEPTANCE.md`

No runtime checks were run for this sidecar itself because it is support-only and does not change executable behavior.
