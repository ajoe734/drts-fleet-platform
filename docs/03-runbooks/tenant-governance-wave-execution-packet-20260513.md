# Tenant Governance Contract Wave — Execution Packet 2026-05-13

**Audience:** supervisor + auto workers (Claude, Codex, Codex2, Gemini, Gemini2) executing the four backend tasks for the tenant governance wave.
**Status:** ready to dispatch. All caveats and Q1–Q7 are resolved.
**Sources:**

- [Decision packet](../05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md) — original gap analysis.
- [Followup packet](../05-ui/tenant-canonical-contract-gaps-followup-20260513.md) — caveats + sharp questions sent to design team.
- [Design response](../05-ui/tenant-canonical-contract-gaps-design-response-20260513.md) — authoritative answers; **read this first if anything below is ambiguous.**
- `phase1_service_framework_sa_v1_20260513.md` / `phase1_service_framework_sd_v1_20260513.md` — earlier framing from design team.

This packet is the single doc a worker should pin while implementing. It translates the design response into per-task acceptance bars, file targets, contract types ready to paste, test matrices, and ai-status.json wiring instructions.

---

## 0. How to use this packet

1. Pick the task assigned to you in `ai-status.json` (owner field).
2. Open the section under [§4](#4-tasks) for your task. The section is self-contained — types, API routes, file targets, tests, acceptance, verification.
3. Cross-task types live in [§3 Shared types](#3-shared-types). Add those first; multiple tasks reference them.
4. Audit event names are catalogued in [§5 Audit taxonomy](#5-audit-taxonomy) — do not invent new names.
5. Before handing off for review, run [§6 Verification commands](#6-verification-commands).
6. If your task is `in_progress` already (BE-RULE-001 / BE-QUOTA-001) and your in-flight implementation diverges from the spec below, **stop and reconcile** — the spec wins because it is what design team approved.

---

## 1. Wave overview

| Task ID                | Title                                            | Status (2026-05-13)                                                         | Owner                                         | Reviewer | Depends on                    |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------- | -------- | ----------------------------- |
| `BE-CC-001`            | Tenant Cost-Center Directory                     | `done` (commit `a7c1b9f`) + booking validation follow-up (commit `a2e9607`) | Codex (parent), Claude (validation follow-up) | Codex2   | —                             |
| `BE-CC-001-FU-BILLING` | Cost-center backfill + billing/reporting linkage | **new — needs ai-status.json row**                                          | tbd                                           | tbd      | `BE-CC-001`                   |
| `BE-RULE-001`          | Tenant Approval Rules + Evaluator                | `in_progress`                                                               | Claude                                        | Gemini2  | `BE-CC-001`                   |
| `BE-QUOTA-001`         | Tenant Quota / Usage Read-Model + Ledger         | `in_progress`                                                               | Codex2                                        | Claude   | `BE-CC-001`                   |
| `BE-APR-001`           | Tenant Booking Approval Workflow                 | **new — needs ai-status.json row**                                          | tbd                                           | tbd      | `BE-RULE-001`, `BE-QUOTA-001` |

UI tasks (`TEN-UI-RD-010`, `TEN-UI-RD-013`, `TEN-UI-RD-014`, `TEN-UI-RD-099`, `ADM-UI-RD-010`) stay blocked until their backend prerequisites land — see [§7 Unblock map](#7-ui-unblock-map).

### 1.1 Suggested execution order

```
BE-CC-001          [done]
  │
  ├── BE-CC-001-FU-BILLING        (small, can run in parallel with RULE/QUOTA)
  │
  ├── BE-QUOTA-001                (parallel)
  │       │
  │       └── BE-APR-001 needs this
  │
  └── BE-RULE-001                 (parallel)
          │
          └── BE-APR-001 needs this

BE-APR-001         (starts once RULE + QUOTA land)
```

`BE-RULE-001` and `BE-QUOTA-001` can run in parallel. `BE-APR-001` waits on both — it consumes `TenantApprovalEvaluationResult` (from RULE) and `TenantQuotaLedgerEntry` (from QUOTA).

### 1.2 Module placement

All four tasks land in `apps/api/src/modules/tenant-partner/` (Caveat B accepted). Do **not** spin up a new `TenantGovernanceModule`. `owned-mobility` consumes outputs but does not own governance state.

---

## 2. Booking integration (cross-task) — single source of truth

All four contracts converge on **booking create / update**. The integration story is:

```
createTenantBooking / updateTenantBooking
  │
  ├── validateBookingCostCenter        (BE-CC-001, already shipped)
  │
  ├── evaluateTenantApprovalRules      (BE-RULE-001, new)
  │   └── returns TenantApprovalEvaluationResult
  │
  ├── reserveTenantQuota               (BE-QUOTA-001, new — atomic, inside tx)
  │   └── returns TenantBookingQuotaImpactResult[] + writes TenantQuotaLedgerEntry
  │
  ├── persist BookingGovernanceSnapshot (TenantApprovalEvaluationResult + costCenter audit metadata)
  │
  └── if approvalRequired → createTenantBookingApprovalRequest  (BE-APR-001, new)
```

The execution order matters — quota reservation must happen inside the booking-write transaction so the race in Q7 is solved. Rule evaluation can be cached for the request lifetime so re-eval on update is cheap.

The booking-update re-evaluation trigger list is in [§4.3 BE-RULE-001 / Re-evaluation triggers](#43-re-evaluation-triggers).

---

## 3. Shared types

These types are referenced by multiple tasks. The owner of the **first task to land** is responsible for adding them to `packages/contracts/src/index.ts`. Subsequent tasks import them.

Type origin map:

| Type                                                                                                                                                      | First-to-land task | Used by                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------- |
| `TenantPrincipalRef`, `TenantPrincipalKind`                                                                                                               | BE-RULE-001        | RULE, APR, CC (cost-center owner refactor optional in P2) |
| `TenantApprovalRuleAction`, `TenantApprovalMode`, `TenantApprovalRuleCondition`, `TenantApprovalRuleConditionOperator`                                    | BE-RULE-001        | RULE, APR                                                 |
| `TenantApprovalEvaluationInputSnapshot`, `TenantApprovalMatchedRuleResult`, `TenantApprovalWarning`, `TenantApprovalPlan`, `TenantApprovalFallbackPolicy` | BE-RULE-001        | RULE, APR                                                 |
| `TenantApprovalEvaluationResult`                                                                                                                          | BE-RULE-001        | RULE, QUOTA, APR (and persisted by booking flow)          |
| `TenantQuotaEnforcementMode`, `TenantQuotaPeriod`, `TenantQuotaLimit`, `TenantQuotaUsage`, `TenantQuotaLedgerEntry`                                       | BE-QUOTA-001       | QUOTA, APR (audit), RULE (quota-aware conditions)         |
| `TenantBookingQuotaImpactResult`                                                                                                                          | BE-QUOTA-001       | QUOTA, RULE (returned inside evaluation result)           |

### 3.1 Canonical type definitions (paste-ready)

```ts
// ──────────────────────────────────────────────────────────────
// Tenant principal references (BE-RULE-001 owns)
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Approval rule shape (BE-RULE-001 owns)
// ──────────────────────────────────────────────────────────────
export type TenantApprovalRuleAction =
  | "require_approval"
  | "block"
  | "warn"
  | "flag_manual_review";

export type TenantApprovalMode = "any_of" | "all_of_parallel" | "ordered_chain";

export type TenantApprovalRuleConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "exists";

export interface TenantApprovalRuleCondition {
  field: string;
  op: TenantApprovalRuleConditionOperator;
  value?: string | number | boolean | string[] | number[] | null;
}

// ──────────────────────────────────────────────────────────────
// Evaluation result (BE-RULE-001 owns, BE-APR-001 + BE-QUOTA-001 consume)
// ──────────────────────────────────────────────────────────────
export interface TenantApprovalEvaluationInputSnapshot {
  costCenterCode: string | null;
  businessDispatchSubtype: string | null;
  reservationWindowStart: string | null;
  reservationWindowEnd: string | null;
  passengerId: string | null;
  passengerRole: string | null;
  amountMinor: number | null;
  currency: string | null;
  vehiclePreference: string | null;
  partnerEntrySlug: string | null;
  eligibilityVerificationId: string | null;
  signoffRequired: boolean | null;
  expenseProofRequired: boolean | null;
}

export interface TenantApprovalMatchedRuleResult {
  ruleId: string;
  ruleName: string;
  priority: number;
  action: TenantApprovalRuleAction;
  approvers: TenantPrincipalRef[];
  approvalMode: TenantApprovalMode | null;
  matchedConditions: TenantApprovalRuleCondition[];
}

export interface TenantApprovalWarning {
  source: "rule" | "quota";
  code: string;
  ruleId: string | null;
  message: string;
}

export type TenantApprovalFallbackPolicy =
  | "auto_reject"
  | "escalate_to_tenant_admin"
  | "manual_ops_review";

export interface TenantApprovalPlan {
  approvalMode: TenantApprovalMode;
  approvers: TenantPrincipalRef[];
  timeoutHours: number;
  fallbackPolicy: TenantApprovalFallbackPolicy;
  escalationTarget: TenantPrincipalRef | null;
}

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

// ──────────────────────────────────────────────────────────────
// Quota types (BE-QUOTA-001 owns)
// ──────────────────────────────────────────────────────────────
export type TenantQuotaPeriod = "monthly"; // P1 ships monthly only; quarterly/yearly deferred.
export type TenantQuotaEnforcementMode =
  | "warn_only"
  | "require_approval"
  | "hard_block";

export interface TenantQuotaLimit {
  bookingCountLimit: number | null;
  amountMinorLimit: number | null;
  currency: string;
  enforcementMode: TenantQuotaEnforcementMode;
}

export interface TenantQuotaUsage {
  bookingCountReserved: number;
  bookingCountConsumed: number;
  amountMinorReserved: number;
  amountMinorConsumed: number;
  bookingCountRemaining: number | null;
  amountMinorRemaining: number | null;
  remainingPercent: number | null;
}

export interface TenantQuotaLedgerEntry {
  ledgerEntryId: string;
  tenantId: string;
  costCenterCode: string | null;
  periodKey: string; // "YYYY-MM" in Asia/Taipei
  dimension: "booking_count" | "amount_minor";
  amount: number;
  entryType: "reserve" | "release" | "consume" | "adjust";
  bookingId: string;
  evaluationId: string;
  createdAt: string;
}

export interface TenantBookingQuotaImpactResult {
  scope: "tenant" | "cost_center";
  costCenterCode: string | null;
  periodKey: string;
  dimension: "booking_count" | "amount_minor";
  remainingBefore: number | null;
  delta: number;
  remainingAfter: number | null;
  enforcementMode: TenantQuotaEnforcementMode;
  triggered: "none" | "warn" | "approval" | "block";
}
```

> The five auxiliary types (`TenantApprovalEvaluationInputSnapshot`, `TenantApprovalMatchedRuleResult`, `TenantApprovalWarning`, `TenantApprovalPlan`, `TenantApprovalFallbackPolicy`) are engineering-derived from the design response. Design team has not pushed back on the followup default proposals — workers may extend / rename fields if implementation needs it, but the **shape and field semantics must remain compatible** with the design response's `TenantApprovalEvaluationResult` skeleton.

---

## 4. Tasks

### 4.1 BE-CC-001-FU-BILLING — Cost-center backfill + billing/reporting linkage

**Status:** new. Needs an `ai-status.json` row before dispatch.
**Recommended owner / reviewer:** any backend agent + cross-reviewer.
**Depends on:** `BE-CC-001` (done).
**Unblocks:** completes the full BE-CC-001 acceptance bar from the design response.

#### Scope

Two thin slices the design response flagged as still owed for BE-CC-001:

1. **Backfill / unresolved mapping path.** Sweep existing `OwnedOrderRecord.costCenter` free-text values and emit a per-tenant report of (text → suggested directory code | unresolved). Output is a CSV / JSON artifact tenant_admins can review, not an automated rewrite. Booking records stay as-is until a tenant-admin migration step replaces them.

2. **Billing / reporting linkage.** Ensure cost-center exports in `billing-settlement` and `reporting-filing` use the canonical code (already on `BookingRecord.costCenter`) and resolve the directory record at export time to enrich exports with `name` / `ownerUserId` / `activeFlag` so finance reports are no longer just opaque strings.

#### File targets

- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` — add `summarizeCostCenterCoverage(tenantId)` that joins `costCenter` values from `owned-mobility` (read-only) against the directory and returns `{ resolved, unresolved, disabledHits }`.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` — `GET /api/tenant/cost-centers/coverage` endpoint backed by the new service method.
- `apps/api/src/modules/billing-settlement/` — wherever cost-center is emitted in invoices / statements: enrich with `name` and `ownerUserId` from `TenantPartnerService.getCostCenter()`; if directory miss → flag as `legacy_unmapped` in the export row.
- `apps/api/src/modules/reporting-filing/` — same enrichment in tenant report rows.
- `packages/contracts/src/index.ts` — new `TenantCostCenterCoverageReport` type.
- `packages/api-client/src/index.ts` — `getTenantCostCenterCoverageReport()`.

#### Contract additions

```ts
export interface TenantCostCenterCoverageReport {
  tenantId: string;
  generatedAt: string;
  totalBookings: number;
  resolvedCount: number;
  unresolvedCount: number;
  disabledHits: number;
  unresolvedSamples: Array<{
    rawCostCenter: string;
    occurrences: number;
    suggestion: string | null; // code from directory if confident, else null
  }>;
}
```

#### Test matrix

- Tenant with full directory + all bookings mapped → `unresolvedCount = 0`.
- Tenant with directory + legacy free-text bookings → `unresolvedCount > 0`, samples include the actual text.
- Tenant whose booking references a now-disabled code → `disabledHits ≥ 1`.
- Grandfather tenant (no directory) → endpoint returns coverage with `totalBookings`, `resolvedCount = 0`, `unresolvedCount = totalBookings`.
- Billing export row for a resolved booking includes `costCenterName` and `costCenterOwnerUserId`.
- Billing export row for a `legacy_unmapped` booking sets a `legacy_unmapped: true` flag with the raw text retained.

#### Acceptance

- New contract type exported.
- Service method + controller route + audit emission (`actionName: "list_cost_center_coverage"`).
- Billing + reporting enrichment paths updated.
- API client method added.
- Unit tests cover the matrix above.
- `pnpm --filter @drts/api typecheck` + test passes.

---

### 4.2 BE-RULE-001 — Tenant Approval Rules + Evaluator

**Status:** `in_progress` (owner Claude, reviewer Gemini2 in `ai-status.json`).
**Depends on:** `BE-CC-001` (done).
**Unblocks:** `TEN-UI-RD-014`, partial unblock for `TEN-UI-RD-010`, dependency for `BE-APR-001`.

> ⚠ **In-flight reconciliation note:** the existing `ai-status.json` row for `BE-RULE-001` was written before the design response. If the worker's implementation already shipped a different shape, reconcile against [§3 Shared types](#3-shared-types) — the design response is now authoritative.

#### Scope

1. Add all shared types listed in [§3](#3-shared-types) (this task is the first to land that touches them).
2. Add `TenantApprovalRuleRecord` + CRUD/reorder commands.
3. Implement an **all-match-apply** evaluator that returns `TenantApprovalEvaluationResult`. The evaluator must be a pure function (input snapshot + active rule set → result) so it is unit-testable in isolation.
4. Wire create/update/disable/reorder/dry-run endpoints.
5. Persist evaluator output as the rule-portion of the booking governance snapshot. (Booking flow integration done by APR; this task ships only the evaluator + persistence helper.)

#### File targets

- `packages/contracts/src/index.ts` — all shared types + records below.
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` — rule storage slice + evaluator entry points.
- `apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator.ts` — **new** file for the pure evaluator function. Keep this file under ~300 lines and unit-test it standalone.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` — new routes.
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` — `tenantApprovalRules` slice + `core.phase1_tenant_approval_rules` table.
- `packages/api-client/src/index.ts` — five new methods.
- `apps/api/tests/unit/tenant-approval-rule-evaluator.test.ts` — **new** file: evaluator unit matrix.
- `apps/api/tests/unit/tenant-partner.service.test.ts` — CRUD + audit tests.

#### Contract additions

```ts
export interface TenantApprovalRuleRecord {
  ruleId: string;
  tenantId: string;
  ruleName: string;
  priority: number;
  activeFlag: boolean;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  conditions: TenantApprovalRuleCondition[];
  action: TenantApprovalRuleAction;
  approvalMode: TenantApprovalMode | null;
  approvers: TenantPrincipalRef[];
  timeoutHoursOverride: number | null; // null → use tenant default (24h)
  fallbackPolicyOverride: TenantApprovalFallbackPolicy | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTenantApprovalRulesQuery {
  activeOnly?: boolean;
  search?: string;
}

export interface UpsertTenantApprovalRuleCommand {
  ruleId?: string;
  ruleName: string;
  priority: number;
  activeFlag?: boolean;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  conditions: TenantApprovalRuleCondition[];
  action: TenantApprovalRuleAction;
  approvalMode?: TenantApprovalMode | null;
  approvers?: TenantPrincipalRef[];
  timeoutHoursOverride?: number | null;
  fallbackPolicyOverride?: TenantApprovalFallbackPolicy | null;
}

export interface ReorderTenantApprovalRulesCommand {
  orderedRuleIds: string[]; // full list; backend normalizes priorities to [10, 20, 30, ...]
}

export interface EvaluateTenantApprovalRuleCommand {
  subject: TenantApprovalEvaluationResult["subject"];
  inputSnapshot: TenantApprovalEvaluationInputSnapshot;
  // quotaImpacts are passed in by the booking flow; dry-run UI can pass [].
  quotaImpacts?: TenantBookingQuotaImpactResult[];
}
```

#### API surface

```http
GET    /api/tenant/approval-rules
GET    /api/tenant/approval-rules/{ruleId}
POST   /api/tenant/approval-rules
PUT    /api/tenant/approval-rules/{ruleId}
POST   /api/tenant/approval-rules/{ruleId}/disable
POST   /api/tenant/approval-rules/reorder
POST   /api/tenant/approval-rules/evaluate
```

#### Supported condition fields (P1 whitelist)

```
booking.amount_minor
booking.business_dispatch_subtype
booking.vehicle_preference
booking.direction
booking.flight_no_present
booking.reservation_window_start
booking.passenger.role
booking.passenger.id
cost_center.code
cost_center.monthly_quota_remaining_amount_minor
cost_center.monthly_quota_remaining_percent
tenant.monthly_quota_remaining_amount_minor
tenant.monthly_quota_remaining_percent
```

Time-of-day and weekend conditions deferred to P2. Unknown field in `EvaluateTenantApprovalRuleCommand.conditions[].field` → reject with `APPROVAL_RULE_FIELD_UNKNOWN`.

#### Evaluator behavior (must match design response §Q2)

1. Filter active rules by `activeFlag`, `effectiveFrom <= now <= effectiveUntil`.
2. For each rule, AND all conditions; rule matches iff all conditions match.
3. Sort matched rules by `priority` ascending (lower number = higher priority).
4. Merge approver descriptors by `(kind, userId|roleCode|costCenterCode)` to de-duplicate.
5. Compute final decision via precedence `block > manual_review > require_approval > warn > allow`.
6. Build `outcome.warnings` from every matched `warn` / `flag_manual_review` rule **and** every `triggered ∈ {warn}` quota impact.
7. If final decision is `require_approval` or `manual_review`, populate `approvalPlan` using the highest-priority matched rule's `approvalMode` / `approvers` / `timeoutHoursOverride` / `fallbackPolicyOverride`, falling back to tenant defaults (24h, `escalate_to_tenant_admin`).
8. `auditSummary.ruleVersionSnapshot` is the monotonic per-tenant version stamp incremented on each rule mutation.

#### Test matrix (in `tenant-approval-rule-evaluator.test.ts`)

- No rules match → decision `allow`, no warnings.
- One `require_approval` rule matches → decision `require_approval`, `approvalPlan` populated.
- Two `require_approval` rules match → `matchedRules.length === 2`, both approvers merged + deduped, plan from highest priority.
- One `block` + one `require_approval` match → decision `block`, `approvalPlan = null`, `matchedRules` includes both.
- `warn` rule matches alone → decision `warn`, `warnings.length === 1`.
- `flag_manual_review` matches → decision `manual_review`, `approvalRequired === false`, `blocked === false`.
- Rule with `effectiveUntil` in the past → ignored.
- Quota impact `triggered: "approval"` with no matching rules → decision `require_approval`, `approvalPlan` uses tenant default (24h, escalate_to_tenant_admin).
- Quota impact `triggered: "block"` → decision `block`.
- Approver descriptor with `kind: "cost_center_owner"` → evaluator records the descriptor but does **not** resolve to user (resolution happens at APR creation time).
- Unknown condition field → throws `APPROVAL_RULE_FIELD_UNKNOWN`.

#### Acceptance

- Shared types in [§3](#3-shared-types) all exported.
- `TenantApprovalRuleRecord` + 4 commands exported.
- 7 REST routes wired.
- Evaluator pure function + standalone test file with the 11 cases above.
- CRUD/reorder audit events: `tenant.approval_rule.created` / `.updated` / `.disabled` / `.reordered`; evaluate emits `booking.approval_rules.evaluated`.
- API client exposes `listApprovalRules`, `upsertApprovalRule`, `reorderApprovalRules`, `evaluateApprovalRules`, `disableApprovalRule`.
- `pnpm --filter @drts/api typecheck` + test pass.

---

### 4.3 BE-QUOTA-001 — Tenant Quota / Usage Read-Model + Ledger

**Status:** `in_progress` (owner Codex2, reviewer Claude in `ai-status.json`).
**Depends on:** `BE-CC-001` (done).
**Unblocks:** quota card for `TEN-UI-RD-010`, quota-aware conditions for `TEN-UI-RD-014`, dependency for `BE-APR-001`.

> ⚠ **In-flight reconciliation note:** the existing `BE-QUOTA-001` acceptance criteria predate the design response. If the worker has already built a non-ledger model, reconcile — the design response mandates the ledger + atomic reservation pattern.

#### Scope

1. Quota policy CRUD (tenant-level + cost-center-level, optional inheritance from tenant).
2. Quota ledger (`reserve` / `release` / `consume` / `adjust`).
3. Monthly snapshot read model (derived; refreshed on ledger write).
4. `POST /quotas/preview` (non-binding, UX only).
5. `reserveTenantQuota(...)` service method that is called **inside the booking-write DB transaction** with row-level lock — this is the atomic reservation.
6. Period attribution = `reservationWindowStart` month in `Asia/Taipei`.

#### File targets

- `packages/contracts/src/index.ts` — quota types from [§3](#3-shared-types) + records below.
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` — quota policy slice + ledger methods.
- `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts` — **new** file for the ledger primitives (atomic apply, snapshot rebuild). Keep logic out of the giant service file so the lock semantics are reviewable.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` — preview + summary routes.
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` — three new tables: `core.phase1_tenant_quota_policies`, `core.phase1_tenant_quota_ledger`, `core.phase1_tenant_quota_monthly_snapshots`. SQL uses `SELECT ... FOR UPDATE` on the policy row + snapshot row when reserving.
- `packages/api-client/src/index.ts` — three new methods.
- `apps/api/tests/unit/tenant-quota-ledger.test.ts` — **new** ledger semantics.
- `apps/api/tests/unit/tenant-partner.service.test.ts` — endpoint + race tests.

#### Contract additions

```ts
export interface TenantQuotaPolicyRecord {
  tenantId: string;
  costCenterCode: string | null; // null = tenant-level policy
  period: TenantQuotaPeriod;
  limit: TenantQuotaLimit;
  inheritedFromTenant: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTenantQuotaPolicyCommand {
  costCenterCode?: string | null;
  period: TenantQuotaPeriod;
  limit: TenantQuotaLimit;
}

export interface TenantQuotaSummary {
  tenantId: string;
  period: TenantQuotaPeriod;
  periodKey: string; // "YYYY-MM" Asia/Taipei
  limit: TenantQuotaLimit;
  usage: TenantQuotaUsage;
  refreshedAt: string;
}

export interface TenantCostCenterQuotaSummary {
  tenantId: string;
  costCenterCode: string;
  period: TenantQuotaPeriod;
  periodKey: string;
  limit: TenantQuotaLimit;
  usage: TenantQuotaUsage;
  inheritedFromTenant: boolean;
  refreshedAt: string;
}

export interface TenantBookingQuotaImpactQuery {
  bookingId?: string | null;
  costCenterCode?: string | null;
  estimatedAmountMinor?: number | null;
  currency?: string;
  reservationWindowStart: string; // required: period attribution depends on it
  businessDispatchSubtype?: string | null;
}

export interface TenantBookingQuotaImpactPreview {
  evaluationId: string;
  periodKey: string;
  impacts: TenantBookingQuotaImpactResult[];
  combinedTriggered: "none" | "warn" | "approval" | "block";
}
```

#### API surface

```http
GET    /api/tenant/quotas
GET    /api/tenant/cost-centers/{costCenterCode}/quota
POST   /api/tenant/quotas/policies
POST   /api/tenant/quotas/preview
GET    /api/tenant/quotas/ledger?periodKey=YYYY-MM&costCenterCode=...
```

#### Reservation flow (atomic, called inside booking write tx)

```ts
async function reserveTenantQuota(
  tx,
  input,
): Promise<{
  ledgerEntries: TenantQuotaLedgerEntry[];
  impacts: TenantBookingQuotaImpactResult[];
}> {
  // 1. SELECT FOR UPDATE on tenant policy + cost-center policy rows.
  // 2. SELECT FOR UPDATE on current-period snapshot rows.
  // 3. Compute remainingBefore.
  // 4. If enforcementMode = hard_block and remainingAfter < 0 → throw QUOTA_INSUFFICIENT_AT_COMMIT.
  // 5. INSERT ledger rows (reserve, count + amount dimensions, one per applicable scope).
  // 6. UPDATE snapshot rows (or upsert).
  // 7. Return impacts so caller can fold into TenantApprovalEvaluationResult.quotaImpacts.
}
```

#### Lifecycle behavior (must match design response §Q4)

| Event                                                        | Action                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| booking create                                               | `reserve` in `reservationWindowStart` month                                |
| booking update, same costCenter + same period + amount delta | `adjust` delta                                                             |
| booking update, period changed                               | `release` old period, `reserve` new period                                 |
| booking cancel                                               | `release`                                                                  |
| booking complete                                             | convert reserved → consumed (`consume` entry; net change = 0 to remaining) |
| no-show                                                      | per billing rule; default = `consume`                                      |

#### Test matrix

- Empty policy + new booking → `remainingAfter = null - delta` is treated as unlimited; impact `triggered: "none"`.
- Policy with `warn_only` 80% threshold → impact `triggered: "warn"`.
- Policy with `require_approval` 90% threshold → impact `triggered: "approval"`.
- Policy with `hard_block` → over-limit reserve throws `QUOTA_INSUFFICIENT_AT_COMMIT`.
- Period attribution: booking with `reservationWindowStart = 2026-05-31T23:30:00+08:00` → `periodKey = "2026-05"`. With `+00:00` form at the boundary, conversion to Asia/Taipei still yields the right key.
- Booking update across months: old period `release`, new period `reserve`, net usage moves correctly.
- Booking cancel after reserve → `release`; subsequent preview shows quota freed.
- Booking complete → `consume` entry; reserved counter goes down, consumed counter goes up, remaining unchanged.
- **Race test**: two concurrent reserve calls against a tenant with exactly 1 booking-count remaining. One succeeds; the other throws `QUOTA_INSUFFICIENT_AT_COMMIT`. Implement with two separate transactions in the same vitest.
- Cross-tenant isolation: tenant A's ledger entries do not affect tenant B's summary.

#### Acceptance

- Quota policy CRUD + summary endpoints + preview endpoint + ledger endpoint.
- `reserveTenantQuota` exposed for booking integration (BE-APR-001 / owned-mobility will wire it).
- Audit events: `tenant.quota_policy.updated`, `tenant.quota_ledger.entry_added` (one per ledger row), `tenant.quota_snapshot.refreshed`.
- API client exposes `getTenantQuotaSummary`, `getTenantCostCenterQuota`, `previewTenantBookingQuotaImpact`, `upsertTenantQuotaPolicy`, `listTenantQuotaLedger`.
- All tests in matrix pass, including the race test.
- `pnpm --filter @drts/api typecheck` + test pass.

---

### 4.4 BE-APR-001 — Tenant Booking Approval Workflow

**Status:** **new — needs ai-status.json row.**
**Depends on:** `BE-RULE-001` + `BE-QUOTA-001` (both for type imports and for `TenantApprovalEvaluationResult`).
**Unblocks:** `TEN-UI-RD-010` (approval UX), Ops Console approval monitor.

#### Scope

1. Approval request record + decision record contracts.
2. Approval request lifecycle: created on booking flow → pending → approved | rejected | timeout-escalated | cancelled-by-re-eval.
3. Approver resolution at request creation (resolve `cost_center_owner` / `tenant_role` / `tenant_finance_admin` / `tenant_admin` to concrete `tenant_user` candidates).
4. Approval modes: `any_of` (P1 must work end-to-end), `all_of_parallel` and `ordered_chain` (contracts must accept them, backend may skip ordered-chain execution if too risky for P1 — clearly flag if so).
5. Timeout: 24h default, override per rule, fallback `escalate_to_tenant_admin` default. P1 ships **manual escalate** + a **stub timeout cron entry** (returns 501 in P1 — automated timeout is a P2 item, but the cron entry must exist so observability shows it's deliberately disabled).
6. Booking integration: `approvalState` field on `OwnedOrderRecord`; transitions in `owned-mobility.service.ts`.
7. Re-evaluation cancellation: when booking update triggers re-eval and approval no longer required → cancel existing pending requests with reason `cancelled_by_re_evaluation`.

#### File targets

- `packages/contracts/src/index.ts` — records below.
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` — approval workflow service methods.
- `apps/api/src/modules/tenant-partner/tenant-approval-workflow.ts` — **new** file for resolution + state machine helpers.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` — approval routes.
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` — two new tables: `core.phase1_tenant_approval_requests`, `core.phase1_tenant_approval_decisions`.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` — wire approval into `createTenantBooking` + `updateTenantBooking`; add `approvalState` to order record + booking record; add re-evaluation trigger field guard from design response §Q5.
- `packages/api-client/src/index.ts` — new approval methods.
- `apps/api/tests/unit/tenant-approval-workflow.test.ts` — **new** state machine + resolution tests.
- `apps/api/tests/unit/owned-mobility.service.test.ts` — end-to-end booking + approval scenarios.

#### Contract additions

```ts
export type TenantBookingApprovalState =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "blocked"
  | "cancelled_by_re_evaluation";

export interface TenantBookingApprovalRequestRecord {
  approvalRequestId: string;
  tenantId: string;
  bookingId: string;
  orderId: string;
  evaluationId: string;
  ruleIds: string[];
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "cancelled_by_re_evaluation"
    | "timeout_escalated";
  approvalMode: TenantApprovalMode;
  approvers: TenantPrincipalRef[]; // resolved descriptors at creation
  resolvedApproverUserIds: string[]; // concrete tenant users eligible to act
  decisions: TenantBookingApprovalDecisionRecord[];
  evaluationSnapshot: TenantApprovalEvaluationResult;
  timeoutAt: string; // computed from rule + tenant default
  escalatedAt: string | null;
  fallbackPolicy: TenantApprovalFallbackPolicy;
  escalationTarget: TenantPrincipalRef | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TenantBookingApprovalDecisionRecord {
  decisionId: string;
  approvalRequestId: string;
  actorUserId: string;
  actorRoleCode: string | null;
  decision: "approve" | "reject";
  reasonCode: string | null;
  reasonNote: string | null;
  decidedAt: string;
}

export interface ApproveTenantBookingApprovalRequestCommand {
  reasonNote?: string | null;
}

export interface RejectTenantBookingApprovalRequestCommand {
  reasonCode: string;
  reasonNote?: string | null;
}

export interface EscalateTenantBookingApprovalRequestCommand {
  reasonNote?: string | null;
}
```

Add to `OwnedOrderRecord`:

```ts
approvalState: TenantBookingApprovalState;
approvalRequestIds: string[];   // current open requests
```

#### API surface

```http
GET    /api/tenant/approval-requests
GET    /api/tenant/approval-requests/{approvalRequestId}
POST   /api/tenant/approval-requests/{approvalRequestId}/approve
POST   /api/tenant/approval-requests/{approvalRequestId}/reject
POST   /api/tenant/approval-requests/{approvalRequestId}/escalate    // tenant_admin manual fallback
```

#### State machine

```
created (during booking write tx, only if evaluationResult.approvalRequired)
  │
  ├── approve   → approved   (booking.approvalState = approved if all requests resolved)
  ├── reject    → rejected   (booking.approvalState = rejected; booking.status → cancelled)
  ├── escalate  → timeout_escalated  (manual; clears approvers, surfaces in tenant_admin queue)
  └── cancelled_by_re_evaluation (booking update re-eval no longer requires approval)
```

For approval mode `any_of`: first approve resolves request; first reject rejects request.
For `all_of_parallel`: all resolved approvers must approve; any rejection rejects request.
For `ordered_chain`: P1 may implement as `all_of_parallel` and label it as a known-limit if ordered-chain scheduling is too risky — flag in PR description.

#### Re-evaluation triggers (per Q5)

Re-evaluate iff any of these fields changed on `updateTenantBooking`:

```
costCenterCode (booking.costCenter)
businessDispatchSubtype
reservationWindowStart
reservationWindowEnd
passengerId
passenger.role (when passenger profile changes)
quotedFare
vehiclePreference
partnerEntrySlug
eligibilityVerificationId
signoffRequired
expenseProofRequired
```

Do NOT re-evaluate on: `notes`, `terminal`, `luggageCount`, `onsiteContact`, `bookedBy`.

Implement as a comparison helper on the update path. If re-eval needed:

- Run evaluator + quota preview as if creating.
- If approval required and not already pending → create new request.
- If approval previously required but now not → cancel existing requests with `cancelled_by_re_evaluation` and set `approvalState = not_required`.
- If approval previously approved and new evaluation requires approval again → cancel old request, create new, set `approvalState = pending`.

#### Approver resolution

At request creation (not at evaluation time), resolve descriptors to concrete `tenant_user` user ids:

| Descriptor kind        | Resolution                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_user`          | userId itself                                                                                                                                                                         |
| `tenant_role`          | all active tenant users with that role                                                                                                                                                |
| `cost_center_owner`    | `TenantCostCenterRecord.ownerUserId` for the booking's cost-center code; if owner missing → fall back to escalationTarget (or `tenant_admin` role) and audit `approver_fallback_used` |
| `tenant_finance_admin` | all active tenant users with role `tenant_finance_admin`                                                                                                                              |
| `tenant_admin`         | all active tenant users with role `tenant_admin`                                                                                                                                      |

Empty resolution set → reject request creation with `APPROVAL_NO_RESOLVABLE_APPROVERS` and roll back the booking-write transaction (caller's responsibility — APR throws, caller propagates).

#### Test matrix

- `any_of` + 2 approvers, first approves → request approved, booking `approvalState = approved`.
- `any_of` + 2 approvers, one rejects → request rejected, booking cancelled.
- `all_of_parallel` + 2 approvers, both approve → approved.
- `all_of_parallel` + 2 approvers, one approves + one rejects → rejected.
- Manual escalate by `tenant_admin` → request `timeout_escalated`, escalation event audited.
- Booking update changes amount above approval threshold → new request created, old (if any) cancelled.
- Booking update changes only `notes` → no re-eval, no new request.
- Booking update flips approval from required → not required → existing requests cancelled with `cancelled_by_re_evaluation`.
- `cost_center_owner` resolution against a cost-center with `ownerUserId = null` → fallback used + audit.
- `APPROVAL_NO_RESOLVABLE_APPROVERS` rolls back the booking transaction.
- Approver who is **not** in `resolvedApproverUserIds` calls approve → 403 `APPROVAL_NOT_AUTHORIZED`.

#### Acceptance

- All contracts in [§3](#3-shared-types) plus the APR-specific records exported.
- Approval request + decision repo slices + tables.
- 5 REST routes + 3 commands.
- State machine helper file + tests.
- `OwnedOrderRecord.approvalState` + `approvalRequestIds` added; `BookingRecord` mirror; `mapOrderToBooking` updated.
- Booking create/update wires evaluator + quota reservation + APR creation in correct order; transaction rolls back if any step throws.
- Re-evaluation triggers implemented per Q5 whitelist.
- Audit events: `booking.approval_request.created`, `.approved`, `.rejected`, `.timeout_escalated`, `.cancelled_by_re_evaluation`, `booking.approval_state.changed`, `approver_fallback_used`.
- API client exposes 5 new methods.
- All tests in matrix pass.
- `pnpm --filter @drts/api typecheck` + test pass.

---

## 5. Audit taxonomy

Use these `actionName` values exactly. Do not invent variants.

```
tenant.cost_center.created
tenant.cost_center.updated
tenant.cost_center.disabled
tenant.cost_center.coverage_listed          // BE-CC-001-FU-BILLING
booking.cost_center.assigned                // already wired by BE-CC-001 follow-up commit a2e9607
tenant.approval_rule.created
tenant.approval_rule.updated
tenant.approval_rule.disabled
tenant.approval_rule.reordered
booking.approval_rules.evaluated
tenant.quota_policy.updated
tenant.quota_ledger.entry_added
tenant.quota_snapshot.refreshed
booking.governance.evaluated                // bundled snapshot persistence event
booking.approval_request.created
booking.approval_request.approved
booking.approval_request.rejected
booking.approval_request.timeout_escalated
booking.approval_request.cancelled_by_re_evaluation
booking.approval_state.changed
approver_fallback_used
```

All booking-related events have `resourceType: "booking"`. Tenant governance events have `resourceType: "tenant_cost_center" | "tenant_approval_rule" | "tenant_quota_policy" | "tenant_approval_request"` as appropriate. `actorType` mirrors the existing tenant-partner convention.

---

## 6. Verification commands

Each task closes out with these commands run from the repo root. Replace `<TASK>` in the PR / commit footer.

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test
pnpm --filter @drts/api-client typecheck
```

If your task touches `packages/api-client/`:

```bash
pnpm --filter @drts/api-client test 2>/dev/null || echo "no api-client tests yet — OK"
```

Document the actual versions you ran in the commit trailer:

```
Verification: pnpm --filter @drts/api typecheck; pnpm --filter @drts/api test (NNN/NNN); ...
```

---

## 7. UI unblock map

| UI task                                                | Unblocks when                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `TEN-UI-RD-013` TN_CostCenter                          | `BE-CC-001` is done — already true, may start anytime                |
| `TEN-UI-RD-014` TN_Rules                               | `BE-RULE-001` done; quota-aware rule UI also needs `BE-QUOTA-001`    |
| `TEN-UI-RD-010` TN_NewBooking quota card + approval UX | `BE-CC-001` + `BE-QUOTA-001` + `BE-RULE-001` + `BE-APR-001` all done |
| `TEN-UI-RD-099` Tenant Portal close-out                | all of the above                                                     |
| `ADM-UI-RD-010` admin parity for tenant governance     | all of the above                                                     |

Supervisor should keep `depends_on` edges on these UI rows pointing at the precise backend tasks above.

---

## 8. ai-status.json wiring (supervisor)

The ai-status.json is in flight (parallel workers updating). Do not blindly overwrite — make these specific edits when the file is quiescent:

### 8.1 Update existing rows

For `BE-RULE-001`:

- `planning_ref`: replace with `"docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md"`.
- `acceptance`: replace bullet list with:
  - 新增 `TenantPrincipalRef` + `TenantApprovalEvaluationResult` + all approval-rule shared types in `packages/contracts/src/index.ts`.
  - 新增 `TenantApprovalRuleRecord` 與 4 個 commands (`Upsert` / `Reorder` / `Evaluate` / `Disable`).
  - Implement pure evaluator in `tenant-approval-rule-evaluator.ts` with the 11-case test matrix in `tenant-approval-rule-evaluator.test.ts`.
  - Wire 7 REST routes under `/api/tenant/approval-rules`.
  - Audit events listed in execution packet §5.
  - `pnpm --filter @drts/api typecheck` + `test` pass.

For `BE-QUOTA-001`:

- `planning_ref`: replace with the execution packet path.
- `acceptance`: replace bullet list with:
  - 新增 `TenantQuotaLedgerEntry` + summary / preview / policy contracts in `packages/contracts/src/index.ts`.
  - Implement ledger in `tenant-quota-ledger.ts` with atomic `reserveTenantQuota` (SELECT FOR UPDATE on policy + snapshot rows inside booking tx).
  - Period attribution = `reservationWindowStart` month in `Asia/Taipei`.
  - 5 REST routes under `/api/tenant/quotas` (+ cost-center-scoped detail).
  - Race test: two concurrent reservations against last unit; one wins, one throws `QUOTA_INSUFFICIENT_AT_COMMIT`.
  - Audit events listed in execution packet §5.

### 8.2 New rows to add

```jsonc
{
  "id": "BE-APR-001",
  "title": "Tenant Booking Approval Workflow",
  "summary_zh": "建立 tenant booking approval workflow 與 owned-mobility 的整合，落地 approval request / decision / timeout escalation 並串接 BE-RULE-001 / BE-QUOTA-001 的評估結果。",
  "phase": "Wave 3 Contract Unblockers",
  "owner": "tbd",
  "reviewer": "tbd",
  "status": "backlog",
  "depends_on": ["BE-RULE-001", "BE-QUOTA-001"],
  "artifacts": [
    "packages/contracts/src/index.ts",
    "apps/api/src/modules/tenant-partner/",
    "apps/api/src/modules/owned-mobility/",
    "packages/api-client/src/index.ts",
  ],
  "acceptance": [
    "新增 TenantBookingApprovalRequestRecord / TenantBookingApprovalDecisionRecord + 3 commands",
    "Approval state machine + approver resolution + manual escalate route",
    "Booking create/update wires evaluator + quota reservation + APR creation",
    "Re-evaluation triggers match design response §Q5 whitelist",
    "pnpm --filter @drts/api typecheck + test pass",
  ],
  "next": "Backlog; ready once BE-RULE-001 and BE-QUOTA-001 reach done.",
  "planning_ref": "docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md",
  "unblocks": ["TEN-UI-RD-010"],
  "mutates_canonical": true,
}
```

```jsonc
{
  "id": "BE-CC-001-FU-BILLING",
  "title": "Cost-center backfill report + billing/reporting enrichment",
  "summary_zh": "補齊 BE-CC-001 設計團隊指定的兩個尾巴：coverage / backfill 報表 endpoint，以及 billing-settlement / reporting-filing 的 cost-center enrich。",
  "phase": "Wave 3 Contract Unblockers",
  "owner": "tbd",
  "reviewer": "tbd",
  "status": "backlog",
  "depends_on": ["BE-CC-001"],
  "artifacts": [
    "packages/contracts/src/index.ts",
    "apps/api/src/modules/tenant-partner/",
    "apps/api/src/modules/billing-settlement/",
    "apps/api/src/modules/reporting-filing/",
    "packages/api-client/src/index.ts",
  ],
  "acceptance": [
    "新增 TenantCostCenterCoverageReport 契約 + GET /api/tenant/cost-centers/coverage",
    "Billing / reporting export rows 加入 costCenterName / ownerUserId / legacy_unmapped flag",
    "API client method getTenantCostCenterCoverageReport",
    "Unit tests cover resolved / unresolved / disabled / grandfather cases",
    "pnpm --filter @drts/api typecheck + test pass",
  ],
  "next": "Backlog; can be picked up in parallel with RULE / QUOTA.",
  "planning_ref": "docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md",
  "unblocks": [],
  "mutates_canonical": true,
}
```

---

## 9. Out of scope (P2 parking lot)

Do **not** include the following in this wave — they are deliberately deferred:

- `parentCostCenterCode` hierarchy and parent-derived quota inheritance.
- Quarterly / yearly quota periods.
- Automated approval-timeout cron (P1 ships the cron entry as 501-stub; manual escalate is the unblock path).
- Time-of-day / weekend / holiday rule conditions.
- `ordered_chain` sequencing semantics — contract accepts the value; backend may implement as `all_of_parallel` in P1 if it can't ship deterministic ordering. **Flag the limit in the PR description if you do this.**
- Tenant-self-serve quota policy import (CSV upload).
- Auto-resolving `cost_center_owner` chain when owner is null beyond a single fallback hop.
- A separate `TenantGovernanceModule` extraction — keep everything in `tenant-partner` for this wave.

Items in the parking lot stay as parking lot until a new design response opens them.

---

## 10. Quick reference for workers

- **Read the design response first.** It is the only authoritative source for ambiguous decisions.
- **Don't invent types.** Use [§3 Shared types](#3-shared-types) verbatim.
- **Don't invent audit event names.** Use [§5 Audit taxonomy](#5-audit-taxonomy).
- **Don't change module placement.** Everything in `apps/api/src/modules/tenant-partner/` (Caveat B).
- **Run the verification matrix** ([§6](#6-verification-commands)) before handing off.
- **If you find a contradiction**, stop and write it back into a follow-up doc — do not pick one side silently.
