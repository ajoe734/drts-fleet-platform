# Backend Delivery Note — Iteration 1

> Written by: Codex2 (drts-fleet-platform)
> Date: 2026-05-19
> Contract commit: 949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa
> Contract lock: `.ai-loop/CONTRACT_VERSION.lock`

## What's available now

Tenant Governance wave contracts are available in `drts-fleet-platform` and are the canonical backend surface for tenant booking governance.

### Tenant Governance endpoints (available)

| Method | Path                                              | Description |
| ------ | ------------------------------------------------- | ----------- |
| GET    | `/api/tenant/cost-centers`                        | List tenant cost centers |
| GET    | `/api/tenant/cost-centers/:code`                  | Read one cost center |
| GET    | `/api/tenant/cost-centers/coverage`               | Cost-center coverage report |
| POST   | `/api/tenant/cost-centers`                        | Create or update cost center |
| POST   | `/api/tenant/cost-centers/disable`                | Disable cost center |
| GET    | `/api/tenant/quotas`                              | Tenant quota summary |
| GET    | `/api/tenant/cost-centers/:code/quota`            | Cost-center quota summary |
| POST   | `/api/tenant/quotas/policies`                     | Upsert tenant quota policy |
| POST   | `/api/tenant/quotas/preview`                      | Preview quota impact before submit |
| GET    | `/api/tenant/quotas/ledger`                       | Quota ledger entries |
| GET    | `/api/tenant/approval-rules`                      | List approval rules |
| POST   | `/api/tenant/approval-rules`                      | Create approval rule |
| PUT    | `/api/tenant/approval-rules/:ruleId`              | Update approval rule |
| POST   | `/api/tenant/approval-rules/reorder`              | Reorder approval rules |
| POST   | `/api/tenant/approval-rules/evaluate`             | Dry-run rule evaluation |
| POST   | `/api/tenant/approval-rules/:ruleId/disable`      | Disable approval rule |
| GET    | `/api/tenant/approval-requests`                   | List booking approval requests |
| GET    | `/api/tenant/approval-requests/:approvalRequestId`| Read one approval request |
| POST   | `/api/tenant/approval-requests/:approvalRequestId/approve` | Approve request |
| POST   | `/api/tenant/approval-requests/:approvalRequestId/reject`  | Reject request |
| POST   | `/api/tenant/approval-requests/:approvalRequestId/escalate`| Escalate request |
| GET    | `/api/tenant/integration-governance`              | API-key/webhook governance package |

### Booking flow impact

- `createTenantBooking()` in `@drts/api-client` now runs against backend-owned tenant governance.
- Cost-center validation, quota reservation, approval evaluation, and approval-request creation are backend-owned.
- Dispatch rejects bookings that remain in approval state `pending`, `blocked`, or `rejected`.

### Contracts package

- Canonical SDK versions for this handoff are `@drts/contracts@0.1.0` and `@drts/api-client@0.1.0`.
- In this repo, `@drts/api-client` is pinned to `@drts/contracts@0.1.0`.
- Consumer UI code must not fork schema or define parallel tenant-governance types.

### Canonical error codes the UI must preserve

- `BOOKING_COST_CENTER_INVALID`
- `BOOKING_COST_CENTER_UNKNOWN`
- `BOOKING_COST_CENTER_DISABLED`
- `QUOTA_INSUFFICIENT_AT_COMMIT`
- `BOOKING_APPROVAL_PENDING`

### Contract-lock requirements

- Read `.ai-loop/CONTRACT_VERSION.lock` before build.
- Reject the build if the lock is expired.
- Reject the build if the installed `@drts/contracts` or `@drts/api-client` version differs from the pinned lock.
- Treat this note plus the lock file as authoritative for Tenant Governance wiring; do not infer missing semantics from legacy Supabase behavior.
