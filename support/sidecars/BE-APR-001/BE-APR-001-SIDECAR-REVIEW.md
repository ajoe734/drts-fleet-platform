# Review Packet: BE-APR-001-SIDECAR-REVIEW

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `BE-APR-001` - Tenant Booking Approval Workflow
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Codex2` / `Codex`
- **Planning Anchor:** `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
- **Machine-Truth Basis:** `ai-status.json` refreshed through `2026-05-13T17:56:30Z` for the sidecar and `2026-05-13T17:39:28Z` for the parent.
- **Workflow Position:** support-only reviewer packet with sidecar review approval recorded. This file does not change canonical truth, runtime behavior, contracts, or parent lifecycle state.

This packet packages the current BE-APR-001 review evidence into one place for
the sidecar reviewer. The parent is already in `review` in machine truth, with
reviewer `Claude2`; this sidecar exists to give `Codex` a concrete evidence
summary, acceptance-to-code map, and rerun verification record without
touching the parent implementation.

## 1. Scope Boundary

Allowed:

- summarize reviewer-facing evidence for `BE-APR-001`
- map the parent acceptance list to concrete code and test anchors
- record fresh verification results from build, typecheck, and tests
- flag the specific parent review points that still need human judgment

Not allowed:

- editing L1/L2 product truth
- editing parent implementation files through this sidecar
- changing the parent `review` / `review_approved` / `done` lifecycle
- changing `ai-status.json` except through the status-script lifecycle

## 2. Machine-Truth Anchors

### 2.1 Sidecar task

- `id`: `BE-APR-001-SIDECAR-REVIEW`
- `owner`: `Codex2`
- `reviewer`: `Codex`
- `status`: `review_approved`
- `depends_on`: `BE-RULE-001`, `BE-QUOTA-001`
- `helper_parent`: `BE-APR-001`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- artifact path: `support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-REVIEW.md`

### 2.2 Parent task

- `id`: `BE-APR-001`
- `owner`: `Codex`
- `reviewer`: `Claude2`
- `status`: `review`
- `depends_on`: `BE-RULE-001`, `BE-QUOTA-001`
- `planning_ref`: `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
- `unblocks`: `TEN-UI-RD-010`, `TEN-UI-RD-099`
- current handoff summary in machine truth:
  - contracts and API client types landed
  - approval request / decision persistence and migration landed
  - tenant-partner approval lifecycle and actions landed
  - owned-mobility booking approval integration and re-evaluation landed
  - verification reported as `pnpm --filter @drts/contracts build`, `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api test`

### 2.3 Upstream dependencies already closed

- `BE-RULE-001`: `done`
  - commit `c0f533c3a73a9a71367f8eda308e8e9a075cd867`
- `BE-QUOTA-001`: `done`
  - commit `73b53eedd0c7c96549b36a6fe813c6acb870bbb1`

Reviewer implication:

- APR should consume the shipped approval-rule and quota semantics rather than
  redefining them locally.

## 3. Acceptance-To-Evidence Matrix

| Parent acceptance item                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval contract types and commands exist                                                                                             | [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1331) defines `TenantBookingApprovalState`, request/decision records, request status union, list query, and approve/reject/escalate commands; [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:2245) adds `approvalState` / `approvalRequestIds` to `OwnedOrderRecord` and [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:2305) surfaces them on `BookingRecord`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Two new approval tables exist and are wired                                                                                            | [infra/migrations/V0024\_\_tenant_approval_workflow.sql](/home/edna/workspace/drts-fleet-platform/infra/migrations/V0024__tenant_approval_workflow.sql:1) creates `core.phase1_tenant_approval_requests` and `core.phase1_tenant_approval_decisions`; [tenant-partner.repository.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:1383) persists requests and decisions through repository executors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Booking create wires evaluator -> quota reserve -> approval creation in transaction order                                              | [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:721) evaluates governance, sets `approvalState`, creates the approval request, and then persists the order inside `withTransaction(...)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Approver resolution maps descriptors to concrete tenant users and fails closed on empty resolution                                     | [tenant-approval-workflow.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts:60) resolves `tenant_user`, `tenant_role`, `cost_center_owner`, `tenant_finance_admin`, and `tenant_admin`; [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1992) applies that resolution at request creation and [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2010) throws `APPROVAL_NO_RESOLVABLE_APPROVERS` when no user ids remain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `any_of` and `all_of_parallel` execute end-to-end; `ordered_chain` is accepted in contract and executed as the same quorum model in P1 | [tenant-approval-workflow.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts:54) maps `ordered_chain` to `all_of_parallel` for execution; [tenant-approval-workflow.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/tenant-approval-workflow.test.ts:53) covers `any_of`, and [tenant-approval-workflow.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/tenant-approval-workflow.test.ts:66) covers `all_of_parallel` plus the P1 `ordered_chain` downgrade.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Re-evaluation whitelist is explicit and non-trigger fields stay out of scope                                                           | [tenant-approval-workflow.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts:9) declares the trigger whitelist used by `shouldReevaluateTenantBookingApproval`; [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1192) reruns governance only when reevaluation is needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Re-evaluation can cancel pending requests with auditable state transition                                                              | [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2097) cancels pending requests as `cancelled_by_re_evaluation` and audits `booking.approval_request.cancelled_by_re_evaluation`; [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1202) invokes that flow during booking update.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Five REST routes plus timeout stub exist                                                                                               | [tenant-partner.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:657) exposes list/detail/approve/reject/escalate under `/api/tenant/approval-requests`; [tenant-partner.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:751) keeps timeout automation as a `501 APPROVAL_TIMEOUT_AUTOMATION_DEFERRED` stub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Approver authorization is per-request membership, not role-only                                                                        | [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6141) requires a pending request, [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6145) checks `resolvedApproverUserIds`, and [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6156) prevents duplicate decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Manual escalate exists for P1 and records escalation evidence                                                                          | [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2199) restricts escalate to `tenant_admin`, rewrites approvers to the escalation target, sets `status=timeout_escalated`, and audits `booking.approval_request.timeout_escalated`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Booking approval state is mirrored back onto the order / booking lifecycle                                                             | [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4381) applies request resolution back to the order and [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4561) audits `booking.approval_state.changed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| API client exposes the approval-request review surface                                                                                 | [packages/api-client/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1452) implements `listApprovalRequests`, `getApprovalRequest`, `approveApprovalRequest`, `rejectApprovalRequest`, and `escalateApprovalRequest`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unit tests cover the required behavior matrix                                                                                          | [tenant-approval-workflow.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/tenant-approval-workflow.test.ts:52) covers helper semantics; [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:330) covers `any_of`; [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:395) covers auth plus `all_of_parallel` rejection; [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:481) covers cost-center-owner fallback; [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:531) covers re-evaluation cancellation; [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:592) covers no-resolvable-approvers and manual escalate, with escalation state asserted at [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:668). |

## 4. Fresh Verification

Rerun by this sidecar on `2026-05-13` UTC:

| Command                               | Result                                            |
| ------------------------------------- | ------------------------------------------------- |
| `pnpm --filter @drts/contracts build` | PASS                                              |
| `pnpm --filter @drts/api typecheck`   | PASS                                              |
| `pnpm --filter @drts/api test`        | PASS - `33` files, `346` tests, duration `17.36s` |

Notes:

- the API test run emitted existing debug/log noise from dispatch, auth, and
  forwarder modules, but the suite finished green
- this sidecar did not rerun any migration apply step; evidence for schema
  presence is the checked-in migration plus repository SQL anchors

## 5. Review Focus For Parent `BE-APR-001`

Recommended parent-review focus for `Claude2`:

1. Confirm the P1 `ordered_chain` downgrade to `all_of_parallel` is acceptable
   as implemented and is explicitly called out in the parent review / PR
   narrative, because the contract accepts `ordered_chain` but execution does
   not serialize it in Phase 1.
2. Confirm the "audit fields" acceptance wording is satisfied by the persisted
   JSON `record` for `fallbackPolicy`, `escalationTarget`, and
   `previousApprovers`, since only `timeout_at` and `escalated_at` are promoted
   to dedicated SQL columns.
3. Confirm the timeout story matches the execution packet: manual escalate is
   shippable in P1, while automated timeout processing is intentionally still a
   `501` stub.
4. Confirm the re-evaluation trigger set matches the latest accepted Q5 answer.
   The helper currently includes `amountMinor`, which corresponds to the
   acceptance wording's `quotedFare`.

## 6. Sidecar Conclusion

This sidecar packet now satisfies its own support-only scope:

- the artifact exists at the declared path
- no canonical truth or parent implementation file was edited for this packet
- machine-truth status was recorded through `scripts/ai-status.sh`
- the reviewer gets a direct map from acceptance item -> code anchor -> test
  coverage -> rerun verification

Recommended next lifecycle step: owner `Codex2` should perform closeout using
the approved sidecar verdict from `Codex`, while the parent remains in `review`
with reviewer `Claude2` and the rerun verification in §4 remains the current
support evidence snapshot.
