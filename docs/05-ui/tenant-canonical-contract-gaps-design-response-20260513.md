# Tenant Governance Contract Wave — Follow-up Design Response

**Date:** 2026-05-13
**Audience:** System Design / Planning Team, Backend Team, Tenant Portal UI Team, Lovable / VS Code LLM Workflow Owners
**Status:** Accepted design response for development execution
**Related Packet:** `docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
**Related Work Items:** `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`, `TEN-UI-RD-010`, `TEN-UI-RD-013`, `TEN-UI-RD-014`, `TEN-UI-RD-099`, `ADM-UI-RD-010`

> **Archive note (added 2026-05-13 by Claude during commit a2e9607-followup):** This file is the verbatim design-team response to the followup packet (`tenant-canonical-contract-gaps-followup-20260513.md`). Engineers should also read `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`, which translates the answers below into per-task acceptance bars, file targets, test matrices, and ai-status.json wiring instructions.

---

## 0. Executive Summary

The follow-up packet and the first-stage `BE-CC-001` booking integration validation are accepted.

The correct framing is not "UI needs more fields." The correct framing is:

> Phase 1 Tenant Portal has reached the point where enterprise dispatch can no longer rely on free-text fields or frontend-local rules. Cost center, approval rules, quota / usage, and approval workflow must become canonical backend contracts owned by `drts-fleet-platform`.

The accepted implementation direction is:

1. Keep `drts-fleet-platform` as canonical backend / BFF / authority.
2. Keep `tenant-commute-hub` as production tenant UI consumer.
3. Keep this wave in the `tenant-partner` domain.
4. Treat `BE-CC-001` as accepted Phase 1A work.
5. Open and schedule `BE-RULE-001`, `BE-QUOTA-001`, and `BE-APR-001` before unblocking the dependent UI tasks.
6. Do not let `tenant-commute-hub` or Lovable invent production schema, approval logic, quota logic, or booking governance semantics.

---

## 1. Design Baseline

The system boundary remains unchanged:

- `drts-fleet-platform` is the canonical backend, BFF, contract source, tenant data authority, booking authority, audit authority, reporting authority, and billing / settlement authority.
- `tenant-commute-hub` is the production Tenant Portal frontend and must consume `/api/tenant/*` through the shared API client / BFF.
- Tenant Portal UI may request missing backend support through the `.ai-loop` feedback mechanism, but it must not create production-grade domain truth locally.

This follow-up is part of the **Tenant Governance Contract Wave**.

The wave consists of four backend work items:

| Task ID        | Contract / Service               | Purpose                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| `BE-CC-001`    | Tenant Cost-Center Directory     | Canonical tenant cost-center master data and booking validation                |
| `BE-RULE-001`  | Tenant Approval Rules            | Tenant-level structured governance rules and rule evaluation                   |
| `BE-QUOTA-001` | Tenant Quota / Usage Read-Model  | Tenant and cost-center quota visibility, preview, and atomic reservation       |
| `BE-APR-001`   | Tenant Booking Approval Workflow | Approval request lifecycle, approver resolution, decisions, timeout, and audit |

The fourth task, `BE-APR-001`, is required even though the original packet asked for only three contracts. Without approval workflow, the system can detect that approval is required but cannot operate approval as a real business process.

---

## 2. Accepted Caveats

### 2.1 Caveat A — Keep the implemented `BE-CC-001` shape

**Decision:** Accepted.

The current `BE-CC-001` booking integration validation direction is correct.

Accepted behavior:

- If a tenant has no cost-center directory, booking may continue to accept legacy free-text cost center.
- If a tenant has a cost-center directory, booking must reference a known active cost-center code.
- Unknown cost-center code must be rejected.
- Disabled cost-center code must be rejected.
- Invalid raw code must be rejected.
- Cross-tenant cost-center code must be rejected.
- Clearing the booking cost center with `null` is always allowed.

This is the correct soft-migration path because it avoids breaking existing booking data while making new tenant-governance behavior canonical.

#### Required follow-up

The validator result must not be thrown away after validation. The booking and / or audit trail must preserve enough information for reporting and forensics:

- raw input
- normalized cost-center code
- whether the input matched a directory entry
- matched cost-center display name, if available
- validation mode: `grandfather_free_text` or `directory_code`
- validation timestamp

The three cost-center validation error codes must also be part of the canonical API error contract and frontend handling:

- `BOOKING_COST_CENTER_INVALID`
- `BOOKING_COST_CENTER_UNKNOWN`
- `BOOKING_COST_CENTER_DISABLED`

---

### 2.2 Caveat B — Keep the wave in `tenant-partner`

**Decision:** Accepted.

The Tenant Governance Contract Wave should stay under the `tenant-partner` domain.

Rationale:

- Cost center is tenant-owned master data.
- Approval rules are tenant governance rules.
- Quota / usage is a tenant-facing governance read model.
- Approval workflow is tenant governance, even though it affects booking lifecycle.
- `owned-mobility` should consume validation / evaluation results, not own tenant-governance master data.
- `product-rule` should remain service / product vocabulary and pricing-rule territory; it should not own mutable tenant approval governance.

Expected domain ownership:

| Domain               | Owns                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| `tenant-partner`     | cost center, tenant approval rules, tenant quota read model, approval workflow |
| `owned-mobility`     | booking lifecycle; calls tenant governance validator / evaluator               |
| `billing-settlement` | uses canonical cost-center and quota / usage outputs for invoices and reports  |
| `audit-notification` | records mutations, evaluation snapshots, approval decisions, escalation events |

---

## 3. `BE-CC-001` Stage 1 Acceptance

The delivered Stage 1 implementation is accepted as `BE-CC-001` Phase 1A.

Accepted delivered behavior from the development summary:

- `tenant-partner.service.ts` adds `validateBookingCostCenter(tenantId, rawCode)`.
- The validator returns `{ value, matchedDirectory }`.
- Grandfather behavior is implemented:
  - no tenant directory → accept free-text
  - tenant directory exists → require active matching cost-center code
- Error codes are implemented for invalid / unknown / disabled cost centers.
- `owned-mobility.service.ts` adds `resolveTenantBookingCostCenter`.
- `createTenantBooking` and `updateTenantBooking` use the resolver.
- Unit / integration tests cover grandfather, active, unknown, disabled, invalid, cross-tenant isolation, and clearing `null`.

### Accepted as done for Phase 1A

`BE-CC-001` Phase 1A is considered accepted if the described tests pass and the validator is wired through booking create / update paths.

### Not yet complete for full `BE-CC-001`

The following are still needed for full `BE-CC-001`:

- list cost centers
- get cost-center detail
- create / update cost center
- disable cost center
- full audit for cost-center mutation
- backfill / unresolved free-text mapping path
- use cost-center code in billing / reporting exports
- frontend API client methods
- tenant UI cost-center management surface

> **Engineering note (Claude, 2026-05-13):** All bullets above except `backfill / unresolved free-text mapping path` and `use cost-center code in billing / reporting exports` already shipped in commit `a7c1b9f` (`BE-CC-001`) before the design response was written. The execution packet groups the two genuinely remaining items under a `BE-CC-001-FU-BILLING` follow-up so the design team's residual ask is not lost.

---

## 4. Design Answers to Q1–Q7

### Q1. `TenantApprovalEvaluationResult` shape

#### Decision

Create a single canonical evaluation result that can serve:

- booking create preview
- booking update re-evaluation
- rule dry-run
- quota impact card
- approval workflow creation
- audit snapshot

#### Required type

```ts
export interface TenantApprovalEvaluationResult {
  evaluationId: string;
  tenantId: string;
  evaluatedAt: string;

  subject: {
    subjectType: "booking";
    bookingId: string | null;
    draftId: string | null;
    operation: "create" | "update" | "cancel" | "dry_run";
  };

  inputSnapshot: TenantApprovalEvaluationInputSnapshot;

  matchedRules: TenantApprovalMatchedRuleResult[];

  quotaImpacts: TenantBookingQuotaImpactResult[];

  outcome: {
    decision: "allow" | "warn" | "require_approval" | "block" | "manual_review";
    approvalRequired: boolean;
    blocked: boolean;
    warnings: TenantApprovalWarning[];
    reasonCodes: string[];
  };

  approvalPlan: TenantApprovalPlan | null;

  auditSummary: {
    ruleVersionSnapshot: string;
    quotaSnapshotVersion: string | null;
    costCenterCode: string | null;
  };
}
```

#### Notes

- `matchedRules` is for transparency and audit.
- `quotaImpacts` powers the Tenant Portal quota impact card.
- `approvalPlan` is the input for approval workflow creation.
- `auditSummary` must be persisted when a booking is created or updated.

---

### Q2. Multi-rule merge semantics

#### Decision

Use `all-match-apply`, not `first-match-wins`.

#### Rationale

Enterprise governance rules can overlap. A booking may simultaneously trigger:

- high amount approval
- low quota warning
- cost-center manager approval
- manual review due to partner eligibility fallback

Using first-match-wins would hide important downstream rules. All matching rules must be evaluated and merged.

#### Precedence

Decision precedence:

```text
block
> manual_review
> require_approval
> warn
> allow
```

#### Merge behavior

1. Collect all active, effective matching rules.
2. Sort by priority for deterministic output.
3. Compute final decision by precedence.
4. Merge approver descriptors and de-duplicate.
5. Preserve every matched rule in `matchedRules`.
6. Return all warnings.
7. If any `block` rule matches, booking cannot be submitted, but all matched reasons must still be returned.

---

### Q3. `TenantPrincipalRef` split

#### Decision

Use a structured principal reference. Do not encode approvers as a plain string.

#### Required type

```ts
export type TenantPrincipalKind =
  | "tenant_user"
  | "tenant_role"
  | "cost_center_owner"
  | "tenant_finance_admin"
  | "tenant_admin";

export interface TenantPrincipalRef {
  kind: TenantPrincipalKind;
  userId?: string;
  roleCode?: string;
  costCenterCode?: string;
  displayName?: string | null;
}
```

#### Semantics

| Kind                   | Meaning                                 |
| ---------------------- | --------------------------------------- |
| `tenant_user`          | specific tenant user                    |
| `tenant_role`          | specific tenant role code               |
| `cost_center_owner`    | dynamic owner resolved from cost center |
| `tenant_finance_admin` | shortcut for tenant finance admins      |
| `tenant_admin`         | fallback admin approver                 |

#### Approver modes

Approval rule should support:

- `any_of`
- `all_of_parallel`
- `ordered_chain`

UI can initially implement `any_of`, but backend contract should not block future enterprise multi-level approval.

---

### Q4. Quota period ownership

#### Decision

Quota period is determined by booking `reservationWindowStart`.

Do not use `createdAt`. Do not use `completedAt`.

#### Rationale

Enterprise quota should reflect intended ride month, not booking creation month or completion month.

#### Required period model

```ts
periodType: "monthly";
periodKey: "YYYY-MM";
timezone: "Asia/Taipei";
```

#### Lifecycle rules

| Event                      | Quota behavior                                     |
| -------------------------- | -------------------------------------------------- |
| booking create             | reserve quota in `reservationWindowStart` month    |
| booking update same month  | adjust reservation if amount / cost center changes |
| booking update cross month | release old period, reserve new period             |
| booking cancel             | release reserved usage                             |
| booking complete           | convert reserved usage to consumed usage           |
| no-show                    | consume or release according to billing rule       |

---

### Q5. Booking update re-evaluation trigger

#### Decision

Booking update must re-evaluate approval and quota only when governance-sensitive fields change.

#### Fields that require re-evaluation

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

#### Fields that do not require re-evaluation by default

- `notes`
- `terminal`
- `luggageCount`
- `onsiteContact`
- `bookedBy`
- minor address text typo, if it does not affect pricing, service area, route, or SLA

#### If re-evaluation becomes stricter

If an approved booking is updated and the new evaluation requires approval or blocks the booking:

- set approval state to `pending` or `blocked`
- invalidate previous approval for the updated version
- create a new evaluation snapshot
- create a new approval request if required
- keep old approval history

#### If re-evaluation becomes more permissive

If a pending booking no longer requires approval:

- cancel old approval request with reason `cancelled_by_re_evaluation`
- set approval state to `not_required`
- audit the state change

---

### Q6. Approval timeout / fallback

#### Decision

Approval timeout is required in Phase 1.

#### Default timeout

```ts
defaultApprovalTimeoutHours: 24;
```

Rules may override the timeout.

#### Fallback policies

Supported policies:

```ts
"auto_reject";
"escalate_to_tenant_admin";
"manual_ops_review";
```

Default policy:

```ts
"escalate_to_tenant_admin";
```

#### Rationale

- `auto_reject` may disrupt business-critical travel.
- `manual_ops_review` pushes too much tenant governance work to platform operations.
- `escalate_to_tenant_admin` preserves tenant self-service and reduces platform manual handling.

#### Timeout record must include

- `timeoutAt`
- `escalatedAt`
- `fallbackPolicy`
- `escalationTarget`
- `previousApprovers`
- `audit event`

#### UI must expose

- pending approval
- timeout countdown
- escalated state
- rejected state
- approved state
- blocked state

---

### Q7. Concurrent quota race

#### Decision

Quota race must be solved on the backend through atomic reservation. Frontend preview is not authoritative.

#### Principle

`quota preview` is UX only. Booking create / update must re-check quota at commit time.

#### Required ledger type

```ts
export interface TenantQuotaLedgerEntry {
  ledgerEntryId: string;
  tenantId: string;
  costCenterCode: string | null;
  periodKey: string;
  dimension: "booking_count" | "amount_minor";
  amount: number;
  entryType: "reserve" | "release" | "consume" | "adjust";
  bookingId: string;
  evaluationId: string;
  createdAt: string;
}
```

#### Required submit transaction

When booking create / update touches quota:

1. Start DB transaction.
2. Lock tenant quota row.
3. Lock cost-center quota row if applicable.
4. Recompute remaining quota.
5. Apply approval / rule evaluation.
6. Write quota reservation ledger.
7. Write booking / approval request.
8. Commit.

#### Race failure

If preview said quota was available but commit-time check fails:

- return `QUOTA_INSUFFICIENT_AT_COMMIT`
- UI must re-run quota preview
- UI should display: "額度已被其他預訂佔用，請重新檢查後再送出。"

---

## 5. Engineering-owned Decisions E / H / I / J / L / M

Development team may self-decide E/H/I/J/L/M with the following guardrails.

### E. Naming / casing

- API wire format remains `snake_case`.
- Frontend runtime may use shared `@drts/api-client` normalization to camelCase.
- Page code must not implement its own per-page shape transform.

### H. API path details

All tenant governance paths must remain under `/api/tenant/*`.

Recommended paths:

```http
/api/tenant/cost-centers
/api/tenant/approval-rules
/api/tenant/quotas
/api/tenant/approval-requests
```

Do not put these under `/api/admin/*`, `/api/product-rule/*`, or frontend-only endpoints.

### I. UI wording

UI wording may be decided by frontend / Lovable, but wording must not alter business semantics.

Examples:

- Quota preview must not be worded as guaranteed quota availability.
- Approval warning must not imply approval has been granted.
- Disabled cost center must not be shown as selectable.

### J. Test data

Test fixtures must include at least:

- tenant with no cost-center directory
- active cost center
- unknown cost-center code
- disabled cost-center code
- cross-tenant isolation
- quota nearly exhausted
- multiple matching rules
- approval timeout
- quota race at commit

### L. Internal helper / repository naming

Engineering may decide helper and repository names, but domain ownership must remain:

- tenant governance authority in `tenant-partner`
- booking lifecycle in `owned-mobility`
- audit in `audit-notification`
- billing output in `billing-settlement`

### M. Small UI interaction

Frontend may decide minor interaction details, but cannot introduce local authority.

If UI needs a new field, status, enum, or mutation, it must come from backend contracts.

---

## 6. Required Backend Tasks

### `BE-CC-001` — Tenant Cost-Center Directory

#### Already accepted in Phase 1A

- booking create validation
- booking update validation
- grandfather free-text logic
- active / unknown / disabled checks
- cross-tenant isolation tests

#### Remaining scope

- `TenantCostCenterRecord`
- `ListTenantCostCentersQuery`
- `UpsertTenantCostCenterCommand`
- `DisableTenantCostCenterCommand`
- list endpoint
- detail endpoint
- create / update endpoint
- disable endpoint
- audit events
- backfill / unresolved mapping path
- billing / reporting linkage
- frontend API client methods

### `BE-RULE-001` — Tenant Approval Rules

Required deliverables:

- `TenantApprovalRuleRecord`
- `TenantApprovalEvaluationResult`
- `TenantPrincipalRef`
- structured condition model
- action model
- all-match-apply evaluator
- create / update / disable API
- reorder API
- dry-run evaluate API
- rule audit events
- unit tests for matching, merge, precedence, and approver resolution

### `BE-QUOTA-001` — Tenant Quota / Usage Read-Model

Required deliverables:

- `TenantQuotaSummary`
- `TenantCostCenterQuotaSummary`
- `TenantBookingQuotaImpactQuery`
- `TenantBookingQuotaImpactPreview`
- quota ledger
- monthly usage read model
- quota preview API
- atomic quota reservation
- release / consume / adjust lifecycle
- quota race handling
- backfill job
- tests for period, reservation, release, consume, and race

### `BE-APR-001` — Tenant Booking Approval Workflow

Required deliverables:

- `TenantBookingApprovalRequestRecord`
- `TenantBookingApprovalDecisionRecord`
- approval request API
- approve / reject API
- timeout escalation job
- approver resolution
- booking approval state integration
- re-evaluation cancellation logic
- notification events
- audit snapshot
- tests for approve, reject, timeout, escalation, re-evaluation, and audit

---

## 7. UI Unblock Conditions

| UI Task                       | Unlock Condition                                                      |
| ----------------------------- | --------------------------------------------------------------------- |
| `TEN-UI-RD-013` TN_CostCenter | `BE-CC-001` full CRUD and list/detail landed                          |
| `TEN-UI-RD-014` TN_Rules      | `BE-CC-001` + `BE-RULE-001`; quota-aware rules require `BE-QUOTA-001` |
| `TEN-UI-RD-010` TN_NewBooking | `BE-CC-001` + `BE-RULE-001` + `BE-QUOTA-001` + `BE-APR-001`           |
| `TEN-UI-RD-099`               | all of the above                                                      |
| `ADM-UI-RD-010`               | all above plus admin-side parity decisions                            |

---

## 8. Acceptance Gates

### 8.1 Contract gate

- `packages/contracts` contains all new tenant governance types.
- `packages/api-client` exposes all tenant governance methods.
- Wire casing and error envelope conform to existing API contract.
- Tenant UI does not hand-create contract types.

### 8.2 Backend gate

Backend must expose:

- `/api/tenant/cost-centers`
- `/api/tenant/approval-rules`
- `/api/tenant/quotas`
- `/api/tenant/approval-requests`

Booking create / update must integrate:

- cost-center validation
- approval / rule evaluation
- quota preview / reservation
- approval workflow creation
- audit snapshot

### 8.3 Test gate

At minimum:

- cost center grandfather / active / unknown / disabled / invalid / cross-tenant
- multi-rule merge
- quota preview
- quota race at commit
- approval request creation
- approval approve / reject
- approval timeout escalation
- booking update re-evaluation
- audit event creation

### 8.4 UI gate

- TN_CostCenter can list, create, update, and disable cost centers.
- TN_Rules can list, create, update, disable, reorder, and dry-run rules.
- TN_NewBooking can show cost-center selector, quota impact card, rule warnings, approval state, and submit blocked / approval-required bookings correctly.

### 8.5 Audit gate

All mutations must emit tenant audit events:

- cost center create / update / disable
- rule create / update / disable / reorder
- quota policy update
- booking evaluation snapshot
- approval approve / reject / timeout / escalation

---

## 9. Final Decision Summary

1. `BE-CC-001` Stage 1 booking integration validation is accepted.
2. Keep `BE-CC-001` implemented shape.
3. Keep Tenant Governance wave under `tenant-partner`.
4. Define `TenantApprovalEvaluationResult` as shared evaluation snapshot for rules, quota, approval, and audit.
5. Use `all-match-apply` for multiple approval rules.
6. Use structured `TenantPrincipalRef` for approvers.
7. Quota period belongs to `reservationWindowStart` month in `Asia/Taipei`.
8. Booking update triggers re-evaluation only for governance-sensitive fields.
9. Approval timeout is required; default timeout is 24 hours; default fallback is `escalate_to_tenant_admin`.
10. Quota race must be handled through backend atomic reservation.
11. Engineering-owned E/H/I/J/L/M decisions are accepted only within the guardrails above.
12. Add `BE-APR-001` as required companion task.
13. Do not unblock `TEN-UI-RD-010 / 013 / 014` until the corresponding backend contracts have landed.

---

## 10. Next Actions for Supervisor

1. Register `BE-CC-001` remaining scope as follow-up work.
2. Open `BE-RULE-001`.
3. Open `BE-QUOTA-001`.
4. Open `BE-APR-001`.
5. Keep `TEN-UI-RD-010`, `TEN-UI-RD-013`, and `TEN-UI-RD-014` blocked with explicit `depends_on` links.
6. Update PR descriptions to include any defaulted EOD 2026-05-15 decisions.
7. Require all new UI work to consume canonical contracts only.
