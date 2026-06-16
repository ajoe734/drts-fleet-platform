# Enterprise booking approval stranding — root cause + fix (2026-06-16)

Found while building the full-UI cross-surface loop on a single consolidated dev
VM (API + all web apps + Android emulator + driver APP, one local API).

## Symptom

A real enterprise booking via `enterprise-dispatch-web` UI succeeds → **已受理 /
`awaiting_approval`**, but it never becomes a dispatchable order: both approval
queues are empty (`GET /api/tenant/approval-requests` and `/api/ops/approval-requests`
→ 0), and `core.phase1_tenant_approval_requests` has **0 rows**. The booking is
stranded; the approve UI/API (`/api/tenant/approval-requests/:id/approve`) exist
but are never fed.

## Root cause (two layers)

1. **Missing table migration (fixed here).** The tenant-partner repository reads
   from and writes to `core.phase1_tenant_approval_rules` (loadState SELECT +
   persistChanges INSERT), and the approval evaluator resolves approvers from
   these rules. But **no migration ever created the table** — V0024 created
   `phase1_tenant_approval_requests` + `_decisions` only. On every API start the
   repo logged `relation "core.phase1_tenant_approval_rules" does not exist` and
   skipped loading approval rules. Fixed by `V0032__tenant_approval_rules_table.sql`.
2. **No approval rules seeded (remaining).** Even with the table, there are no
   approval rules for the demo tenant, so the evaluator produces no
   `approvalPlan.approvers` → `createBookingApprovalRequest` resolves no approvers
   → no request is created → the booking strands at `awaiting_approval`.
   Approval can be _required_ (by amount/quota default policy) while approvers are
   _unresolvable_. A rule created via `POST /api/tenant/approval-rules` with empty
   `conditions` did not match the booking (condition-matching semantics need a
   real matching condition, not `[]`).

## Fix delivered

- `infra/migrations/V0032__tenant_approval_rules_table.sql` — creates
  `core.phase1_tenant_approval_rules` (rule_id PK, tenant_id, active_flag,
  created_at, updated_at, record jsonb) matching the repository's INSERT, plus a
  tenant index. Removes the startup WARN and enables rule persistence.

## Remaining to fully unblock the enterprise pure-UI loop

- Seed (or configure via the tenant-console UI) at least one **active approval
  rule** for the demo tenant whose `conditions` match enterprise bookings (e.g.
  amount ≥ threshold or cost-center) and whose `approvers` resolve to real tenant
  users/roles (the demo tenant has Admin/Finance/Ops/Viewer users 901–904).
- Then: 下單 → `awaiting_approval` → request appears in the tenant approval queue →
  approve via UI → order becomes dispatchable → ops dispatch board 派工+指派
  drv-demo-001 → driver APP accept→complete (proof photo) → 回驗證.

## Consolidated dev VM (this session)

Everything now runs on the single `drts-dev-vm`: local API (origin/dev incl.
#712/#717/#725/#735) + Postgres/Redis + enterprise-dispatch-web (:3010) +
ops-console-web (:3003) + Android emulator + driver APP (Metro :8081) + Playwright.
The ops dispatch board loads correctly here (verifies the #735 driver:read fix).
