# Tenant Canonical Contract Gaps — Decision Packet 2026-05-13

> Audience: System Design / Planning Team
> Status: **awaiting decisions**
> Source of context: [docs/05-ui/tenant-console-parity-decisions-20260510.md](./tenant-console-parity-decisions-20260510.md)

## TL;DR

`ui-redesign-wave-202605` sprint has converged. Of the remaining 7 non-done
tasks, **3 are blocked on missing canonical backend contracts** and **2 more
are downstream backlog waiting on the same gap**. Supervisor cannot dispatch
implementation workers because there is no spec for them to implement against.

The user has already approved **Plan A** (build the canonical contracts
upstream rather than narrow UI scope). This packet enumerates the contract
gaps and the decisions the design team needs to make so a contract work item
can be opened and scheduled.

## Affected tasks

| Task            | Owner  | Reviewer | Status    | Gap                                                                                    |
| --------------- | ------ | -------- | --------- | -------------------------------------------------------------------------------------- |
| `TEN-UI-RD-010` | Codex2 | Codex    | `blocked` | TN_NewBooking — cost-center selector + auto-applied approval rules + quota impact card |
| `TEN-UI-RD-013` | Codex  | Codex2   | `blocked` | TN_CostCenter — full cost-center management surface                                    |
| `TEN-UI-RD-014` | Codex  | Codex2   | `blocked` | TN_Rules — approval-rule list + quota-aware conditions                                 |
| `ADM-UI-RD-010` | Claude | —        | `backlog` | depends on -005/-006 (now unblocked) and TEN-UI-RD-099 chain                           |
| `TEN-UI-RD-099` | Claude | —        | `backlog` | depends on TEN-UI-RD-010 / -013 / -014                                                 |

The 3 blocked tasks block the 2 backlog tasks; all 5 unblock the same way.

## Three canonical contracts requested

### Contract 1 — Tenant Cost-Center Directory

**Why**: TN_NewBooking, TN_CostCenter (and indirectly TN_Rules) all need to
read a tenant's cost-center list. Today `costCenter` only exists as a free-text
string on `CreateTenantBookingCommand`, with no list/CRUD endpoint published.

**Design-team decisions required:**

1. **Cost-center identity**
   - Stable code only (`"CC-ENG"`), or stable code + display name + description?
   - Flat list, or hierarchical (parent code)?

2. **Ownership and approver semantics**
   - Each cost center has an owner (user / role)?
   - Approver resolution: per-rule, or attached to the cost center itself?
   - Are approvers a list (any-of), ordered chain (all-of), or single?

3. **Lifecycle**
   - Soft-delete (active / disabled) vs hard-delete?
   - History / audit required at read-model level?

4. **Read surface (UI consumes)**
   - `GET /tenant/cost-centers` — list with metadata
   - `GET /tenant/cost-centers/{code}` — detail with quota + recent usage?
   - Should usage be inline or a separate endpoint? (see Contract 3)

5. **Write surface (UI mutates)**
   - Create / update / disable
   - RBAC: tenant_admin only, or delegated roles?
   - Bulk upload (CSV)?

**Affected `packages/contracts/src/index.ts` types:**

- new `TenantCostCenterRecord`
- new `ListTenantCostCentersQuery`, `UpsertTenantCostCenterCommand`,
  `DisableTenantCostCenterCommand`
- `CreateTenantBookingCommand.costCenter` should reference a code from this
  directory (validation: known code, not free-text)

---

### Contract 2 — Tenant Approval Rules

**Why**: TN_Rules requires a prioritized rule table with condition / action /
approver / active state. Today `ProductRuleCatalog` exposes only service-bucket
vocabulary and pricing authority — no approval rules, no approver resolution,
no mutable state.

**Design-team decisions required:**

1. **Rule shape**
   - Condition model: structured (`field op value`), DSL, or both?
   - Action model: `require_approval`, `block`, `route_to_approver`, others?
   - Examples of conditions to support: `cost_center.monthly_quota_remaining < 10%`,
     `booking.amount > X`, `booking.passenger.role == manager`, etc.

2. **Approver resolution**
   - `cost_center.owner` (refers to Contract 1)
   - explicit user / role
   - dynamic (e.g., "tenant_admin available")
   - dual-sign (sequential or parallel)?

3. **Priority & ordering**
   - Numeric priority, ordered list, or both?
   - First-match-wins vs all-match-apply?

4. **Read surface**
   - `GET /tenant/rules` — list with priority order
   - `GET /tenant/rules/{id}` — detail with eval semantics
   - `POST /tenant/rules/evaluate` — dry-run on a sample booking?

5. **Write surface**
   - Create / update / disable / reorder
   - RBAC: tenant_admin only, or split rule-author vs rule-approver roles?
   - Versioning / staged rollouts required?

6. **Active-state semantics**
   - Boolean on/off only, or scheduled (effective_from / effective_until)?

**Affected types:**

- new `TenantApprovalRuleRecord`
- new `ListTenantApprovalRulesQuery`, `UpsertTenantApprovalRuleCommand`,
  `ReorderTenantApprovalRulesCommand`, `EvaluateTenantApprovalRuleCommand`
- new `TenantRuleApproverDescriptor` (referenced from Contract 1 cost-center
  ownership)

---

### Contract 3 — Tenant Quota / Usage Read-Model

**Why**: TN_NewBooking's quota impact card and TN_Rules' quota-aware conditions
both need quota visibility. Today `PlatformTenantQuotaSummary` exists only at
platform-admin level for tenant-governance purposes; tenants cannot see their
own quotas through the published contract.

**Design-team decisions required:**

1. **Quota granularity**
   - Per tenant only, per cost-center, per user, or all three?
   - Period: monthly only, quarterly + yearly, or configurable?

2. **Quota authority**
   - Set at tenant-admin level
   - Inherited / overrideable per cost center?
   - Hard cap vs soft warning?

3. **Usage tracking**
   - What counts toward quota? (booking count? booking amount? rides? km?)
   - Realtime vs eventually-consistent acceptable?

4. **Read surface**
   - `GET /tenant/quotas` — tenant-level summary
   - `GET /tenant/cost-centers/{code}/quota` — cost-center scoped
   - `GET /tenant/quotas/preview?costCenter=X&amount=N` — TN_NewBooking impact-card use case

5. **Refresh semantics**
   - Is `monthly_quota_remaining` cached or live?
   - Where does the rule-engine pull it from? (separate fetch vs inline in rule eval?)

**Affected types:**

- new `TenantQuotaSummary` (tenant-visible variant of platform-admin's existing type)
- new `TenantCostCenterQuotaSummary`
- new `TenantBookingQuotaImpactQuery` (preview before creating booking)

## Cross-cutting questions

These touch all three contracts:

- **A. RBAC model.** Are cost-center / rule / quota management surfaces all
  tenant_admin-only, or do we want a delegated role (e.g., "billing admin")?
  This affects how all three contracts are guarded.

- **B. Migration strategy.** Existing bookings have `costCenter` as free-text.
  When the directory ships, do we:
  - retroactively reject unknown codes (breaking)
  - accept legacy free-text grandfather-style (soft migration)
  - run a backfill mapping pass (one-time migration script)

- **C. Audit / activity log.** All three surfaces have mutation endpoints.
  Should they emit to the existing tenant audit log, or a new dedicated
  governance log?

- **D. Ordering / packaging.** Are these three contracts shipped together
  (one big release) or staggered (Contract 1 first → 2 → 3)? UI tasks unblock
  in this order:
  - Contract 1 alone unblocks `TEN-UI-RD-013` (TN_CostCenter)
  - Contracts 1 + 2 unblock part of `TEN-UI-RD-010` and `TEN-UI-RD-014`
  - All three needed to unblock full TN_NewBooking quota-card UX

## Decision matrix to fill

For each contract, the design team should produce:

| Field                                           | Contract 1: Cost-Center | Contract 2: Approval Rules | Contract 3: Quota |
| ----------------------------------------------- | ----------------------- | -------------------------- | ----------------- |
| Decision: build? defer?                         |                         |                            |                   |
| Owner (which agent / role drives contract spec) |                         |                            |                   |
| Target wave / sprint                            |                         |                            |                   |
| RBAC model                                      |                         |                            |                   |
| Lifecycle (soft-delete? versioning?)            |                         |                            |                   |
| Migration plan                                  |                         |                            |                   |
| Dependencies on other contracts                 |                         |                            |                   |
| Acceptance gate (what makes it "done")          |                         |                            |                   |

## Source references

- Original parity analysis:
  [docs/05-ui/tenant-console-parity-decisions-20260510.md](./tenant-console-parity-decisions-20260510.md) — sections TEN-UI-RD-010, TEN-UI-RD-013, TEN-UI-RD-014
- Design target artboards:
  [docs/05-ui/drts-design-canvas/tenant-screens.jsx](./drts-design-canvas/tenant-screens.jsx) — `TN_NewBooking`, `TN_CostCenter`, `TN_Rules`
- Product spec:
  [docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md](../01-product/platform-admin-ops-tenant-console-product-spec-20260508.md) — sections 9.5, 9.6.2, 9.7.2
- Existing contract surface:
  - `packages/contracts/src/index.ts` — `CreateTenantBookingCommand`,
    `UpdateTenantBookingCommand`, `BookingRecord`, `OwnedOrderRecord`,
    `ProductRuleCatalog`, `PlatformTenantQuotaSummary`,
    `PlatformAdminTenantRecord`
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/product-rule/product-rule.controller.ts`
  - `packages/api-client/src/index.ts`
- Execution packet:
  [docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md](../03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md) — section TEN-UI-005
- Work-breakdown:
  [docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md](./drts-ui-redesign-workbreakdown-20260510.md)

## Once decided

After design team answers, the supervisor should:

1. Create concrete contract tasks under `packages/contracts` + `apps/api`
   (suggested IDs: `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`).
2. Assign owners + reviewers.
3. Leave `TEN-UI-RD-010 / -013 / -014` blocked with `depends_on` pointing at
   the new contract tasks, so they auto-unblock when the contracts land.
4. Then `ADM-UI-RD-010` and `TEN-UI-RD-099` (downstream backlog) unblock naturally.
