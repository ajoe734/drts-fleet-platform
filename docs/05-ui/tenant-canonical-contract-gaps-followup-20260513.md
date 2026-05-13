# Tenant Canonical Contract Gaps — Follow-up to SD/SA 2026-05-13

> Audience: System Design / Planning Team
> Status: **awaiting decisions on 7 sharp questions before BE-QUOTA-001 / BE-RULE-001 / BE-APR-001 can start**
> Source context:
>
> - [tenant-canonical-contract-gaps-decision-packet-20260513.md](./tenant-canonical-contract-gaps-decision-packet-20260513.md) (original ask)
> - `phase1_service_framework_sd_v1_20260513.md` (design team SD reply)
> - `phase1_service_framework_sa_v1_20260513.md` (design team SA reply)

## 0. TL;DR

Backend agrees with SD/SA direction: build all four contracts (CC / RULE / QUOTA / APR), reuse existing tenant audit log and roles, soft-migrate cost-center free-text, snapshot governance on booking create. **Two operational caveats** plus **seven open spec questions** need a one-pass response before further contract work can start safely.

We **do not** want to redo BE-CC-001 to match the SD's name choices. We **do** want SD to be revised to match what already shipped.

---

## 1. Operational caveats (require explicit ack, not full discussion)

### 1.1 BE-CC-001 has already shipped a different shape

`BE-CC-001` is `review_approved` (commit `a7c1b9f`, branch `feat/claude2-ui-redesign-foundation`). The committed shape **does not** match what SD §3.2 describes. We propose to keep the committed shape and amend SD instead of reopening BE-CC-001. Diff summary:

| Aspect         | SD §3.2 says                                   | What `a7c1b9f` shipped                                 |
| -------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Record key     | `costCenterCode`                               | `code`                                                 |
| Display        | `displayName`                                  | `name`                                                 |
| Description    | `description`                                  | `description`                                          |
| Owner          | `owner: TenantRuleApproverDescriptor \| null`  | `ownerUserId` + `ownerName` (user only)                |
| Hierarchy      | `parentCostCenterCode`                         | (not present — flat only)                              |
| Update path    | `PUT /api/tenant/cost-centers/{code}`          | `POST /api/tenant/cost-centers` (upsert)               |
| Disable path   | `POST /api/tenant/cost-centers/{code}/disable` | `POST /api/tenant/cost-centers/disable` (code in body) |
| Disable reason | `reasonCode` + `reasonNote`                    | `reason: string \| null`                               |
| DB table       | `tenant_cost_centers`                          | `core.phase1_tenant_cost_centers`                      |
| Booking field  | `costCenterCode` + `legacyCostCenterText`      | unchanged `costCenter?: string` (JSDoc only)           |
| Module         | `TenantGovernanceModule` (new)                 | extension to existing `tenant-partner` module          |

**Decision requested (caveat A):** confirm "amend SD to match `a7c1b9f`" is acceptable, or escalate the specific divergences you want reverted (one row at a time, please).

### 1.2 Module placement: stay in `tenant-partner`, do not split

SD §7.1 proposes a new `TenantGovernanceModule`. We propose to **continue putting all four contracts in `tenant-partner`** (already hosts the cost-center API surface). Reasons:

- `tenant-partner` is already the tenant-side directory hub (users, addresses, passengers, cost centers).
- A new module forces re-import of `BE-CC-001` and a non-trivial DI/migration churn before downstream tasks even start.
- Naming concern (`tenant-partner` covers more than partner channels) can be solved with a follow-up rename PR after the wave lands, instead of blocking it.

**Decision requested (caveat B):** confirm the wave stays in `tenant-partner`, or call out which specific surfaces you want pulled into a new module.

---

## 2. Seven sharp open questions (block downstream contracts)

The remaining items are spec-shape questions. Each one directly affects code we are about to write. Defaults below are what we will assume if no answer arrives by EOD 2026-05-15.

### Q1. `TenantApprovalEvaluationResult` shape (referenced in SD §6.3, §8.2 but never defined)

This is the type written into `booking_governance_snapshots.ruleEvaluation` and `TenantBookingApprovalRequestRecord.evaluationSnapshot`. Without its definition we cannot write either contract. Minimum required fields we're assuming:

```ts
export interface TenantApprovalEvaluationResult {
  evaluatedAt: string; // ISO timestamp
  ruleSetVersion: string; // monotonic per-tenant version stamp
  matchedRules: Array<{
    ruleId: string;
    ruleName: string;
    priorityAtEvaluation: number;
    action: TenantApprovalRuleAction;
    approvers: TenantRuleApproverDescriptor[];
    approvalMode: TenantApprovalMode | null;
    matchedConditions: TenantApprovalRuleCondition[];
  }>;
  finalAction: "allow" | "require_approval" | "block";
  hardBlockReasonCodes: string[];
  warnings: Array<{ ruleId: string; messageCode: string }>;
}
```

**Decision requested:** confirm shape, or send back the corrected one. We will publish whichever you confirm into `packages/contracts/src/index.ts` as part of BE-RULE-001.

### Q2. Multi-rule combination semantics (SD §4.4 says "all-match-apply" but stops there)

When two `require_approval` rules match the same booking, what is the resulting workflow?

| Option                                                    | Behaviour                                                              | Cost                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| (a) merge approvers into one request                      | union of approver descriptors, single mode                             | mode conflict undefined; one rejection blocks everything implicitly |
| (b) one request per matched rule (default we will assume) | N independent requests; booking schedulable only when **all** approved | clean state-machine per rule; UI must show list                     |
| (c) take only highest-priority `require_approval`         | single request, others informational                                   | loses audit fidelity of why others matched                          |

**Our default if no answer:** option (b). We need to know before APR contract finalizes.

### Q3. `TenantRuleApproverDescriptor` vs cost-center owner type

SD has owner typed as `TenantRuleApproverDescriptor | null` on the cost-center record, but the descriptor itself has a `kind: "cost_center_owner"` variant. That is a circular type: a CC owner cannot itself be "whichever CC owns this CC".

Proposal:

```ts
// New, non-circular principal reference for ownership.
export type TenantPrincipalRef =
  | { kind: "user"; userId: string }
  | { kind: "role"; roleCode: string };

// Approver descriptor extends principal ref with one runtime-resolved variant.
export type TenantRuleApproverDescriptor =
  | TenantPrincipalRef
  | { kind: "cost_center_owner"; costCenterCode: string };
```

This also lets BE-CC-001's `ownerUserId` evolve into `owner: TenantPrincipalRef` in a future minor revision (add field alongside, deprecate old fields next wave) without disturbing the already-shipped surface in this wave.

**Decision requested:** accept the split, or send back the type families you want instead.

### Q4. Quota period attribution (SD §5 leaves it ambiguous)

If a booking is **created on 2026-05-30** with **trip time 2026-06-02**, which monthly bucket does it consume?

- (a) Created-month: 2026-05.
- (b) Trip-month: 2026-06 (default we will assume).
- (c) Both — soft hold in created-month, settle in trip-month at completion.

Trip-month is conceptually right for tenant budget management. Created-month is operationally simpler.

**Our default if no answer:** option (b), with `tenant_quota_usage_events.reserve` event timestamped at trip-month period start and `release` events on cancel.

### Q5. Re-evaluation triggers on booking update (SD §13 only describes create)

If a tenant user updates an existing booking, when must we re-run rule + quota evaluation and write a fresh governance snapshot?

Proposed trigger whitelist (re-evaluate iff any of these change):

- `costCenter` / cost-center code
- monetary fields: `quotedFare.amountMinor`, `manualFareOverride`
- `reservationWindowStart`, `reservationWindowEnd`
- `businessDispatchSubtype`, `direction`, `flightNo`, `terminal`
- `vehiclePreference` (only if any rule references it)
- `passenger.passengerId`

Non-triggers (no re-eval): contact phone, notes, luggage count, address text edits within same address id.

**Decision requested:** confirm the trigger list, or amend.

### Q6. Approval timeout / fallback (SD §15 mentions risk, contract has no field)

What happens when an approval request stays `pending` past its tenant-configurable timeout?

| Option                                                         | Behaviour                                  |
| -------------------------------------------------------------- | ------------------------------------------ |
| (a) auto-approve                                               | risky for compliance                       |
| (b) auto-reject                                                | risky for SLA                              |
| (c) escalate to `tenant_admin` (default we will assume for P1) | manual unblock available, no auto-decision |
| (d) configurable per rule                                      | adds shape complexity                      |

If you accept (c): we will add `expiresAt: string \| null` on the approval request record but **not** ship an automated escalation job in P1. P1 ships **manual escalate / override** by `tenant_admin` only, with audit. Auto-escalation lands in P2.

**Decision requested:** confirm (c) as P1 minimum, or specify otherwise.

### Q7. Concurrent quota reservation (SD §5 has no concurrency story)

Two bookings hit `POST /api/tenant/quotas/preview` at the same time with `2,000` left in the bucket, each asking for `1,500`. Both see `OK`. What protects the second `createTenantBooking` from over-spending?

Proposed semantics:

- `POST /quotas/preview` is **non-binding** — it reads current ledger state.
- `createTenantBooking` performs an atomic ledger insert with conditional check (`amountMinorRemaining >= request.amountMinor`) inside the transaction. Second caller's insert fails → booking returns `QUOTA_INSUFFICIENT` error with the same shape as the preview.
- `TenantQuotaUsage` adds two fields so the UI can show why a preview can become stale:

```ts
export interface TenantQuotaUsage {
  // existing fields…
  pendingReservedAmountMinor: number; // booked + not yet completed/cancelled
  confirmedAmountMinor: number; // completed
  // remaining still computed against (pending + confirmed)
}
```

**Decision requested:** confirm reservation is at booking-create (not at completion), confirm pending/confirmed split is correct, and confirm that `preview` is non-binding.

---

## 3. Items we will decide ourselves (notify only)

These are listed for transparency; we are not asking design to weigh in unless you see a problem. We will write the result into the contract drafts.

- **E. Rule evaluation timestamp.** Use creation-time snapshot; later rule edits do not re-decide existing approvals. (Mirrors §13 snapshot intent.)
- **H. Approver authorization on `POST /approval-requests/{id}/approve`.** Per-request check ("is this caller an approver descriptor on this request?"), not a role check.
- **I. Rule reorder endpoint.** `POST /rules/reorder` accepts a **complete** ordered list of rule ids for the tenant; backend normalizes priority to `[10, 20, 30, ...]`. Partial reorder rejected.
- **J. Rule condition field whitelist for P1.** We will ship `booking.amount_minor`, `booking.business_dispatch_subtype`, `booking.vehicle_preference`, `booking.direction`, `booking.flight_no` presence, `booking.reservation_window_start`, `booking.passenger.role`, `booking.passenger.id`, `cost_center.code`, `cost_center.monthly_quota_remaining_amount_minor`, `cost_center.monthly_quota_remaining_percent`, `tenant.monthly_quota_remaining_amount_minor`, `tenant.monthly_quota_remaining_percent`. Time-of-day / weekend deferred.
- **L. Cost-center hierarchy.** P1 ships flat only. `parentCostCenterCode` not added in this wave. Hierarchy revisit in P2.
- **M. Legacy free-text cost center.** No `legacyCostCenterText` second field. Backend validates `costCenter` against directory if the tenant has any active cost-centers (grandfathered for tenants with no directory yet); legacy values audit-tagged but not rejected for existing orders. Documented in `BE-CC-001` follow-up commit.

If you disagree with any of these six, please flag explicitly; otherwise we'll treat silence as concurrence.

---

## 4. Parallel work already in flight (does not block on this packet)

We have started **BE-CC-001 booking integration validation** (M above) in parallel because it only depends on the already-shipped cost-center directory and does not change any contract shape that the open questions could affect. It will land as a small follow-up commit under `BE-CC-001` (or as `BE-CC-001-FU` if the parent is already `done` by then).

Scope:

- new `validateBookingCostCenter(tenantId, code)` on `TenantPartnerService` (grandfather-aware: empty directory → accept text; non-empty → must match active code).
- wire it into `OwnedMobilityService.createTenantBooking` + `updateTenantBooking`.
- error codes: `BOOKING_COST_CENTER_INVALID` (format), `BOOKING_COST_CENTER_UNKNOWN`, `BOOKING_COST_CENTER_DISABLED`.
- tests: unknown, disabled, grandfather tenant, cross-tenant isolation, normalization round-trip.

This will be visible on `feat/claude2-ui-redesign-foundation` once it passes typecheck + tests.

---

## 5. What we need back, and by when

In one reply, please return:

1. Caveat A — accept SD revision to match `a7c1b9f` (yes/no, list exceptions if any).
2. Caveat B — confirm wave stays in `tenant-partner` (yes/no).
3. Q1 through Q7 — answers (or "accept default").
4. Optional: any pushback on §3 items E/H/I/J/L/M.

**Target turnaround:** EOD 2026-05-15. If no reply by then, we proceed with the defaults stated above and will flag each one in the relevant PR description so a reviewer can still object before merge.

## 6. Source references

- [tenant-canonical-contract-gaps-decision-packet-20260513.md](./tenant-canonical-contract-gaps-decision-packet-20260513.md)
- [tenant-console-parity-decisions-20260510.md](./tenant-console-parity-decisions-20260510.md)
- BE-CC-001 commit `a7c1b9f` (canonical implementation)
- BE-CC-001 review sidecar: [support/sidecars/BE-CC-001/BE-CC-001-SIDECAR-REVIEW.md](../../support/sidecars/BE-CC-001/BE-CC-001-SIDECAR-REVIEW.md)
- Existing contract surface in `packages/contracts/src/index.ts` (`TenantCostCenterRecord` and siblings, lines ~1023–1056)
- Existing API surface in `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` (cost-center routes)
