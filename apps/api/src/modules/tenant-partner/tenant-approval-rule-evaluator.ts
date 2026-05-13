import { randomUUID } from "node:crypto";

import { TENANT_APPROVAL_RULE_CONDITION_FIELDS } from "@drts/contracts";
import type {
  TenantApprovalEvaluationInputSnapshot,
  TenantApprovalEvaluationResult,
  TenantApprovalFallbackPolicy,
  TenantApprovalMatchedRuleResult,
  TenantApprovalPlan,
  TenantApprovalRuleAction,
  TenantApprovalRuleCondition,
  TenantApprovalRuleConditionField,
  TenantApprovalRuleRecord,
  TenantApprovalWarning,
  TenantBookingQuotaImpactResult,
  TenantPrincipalRef,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";

type EvaluatorInput = {
  tenantId: string;
  subject: NonNullable<TenantApprovalEvaluationResult["subject"]>;
  inputSnapshot: TenantApprovalEvaluationInputSnapshot;
  rules: readonly TenantApprovalRuleRecord[];
  quotaImpacts?: readonly TenantBookingQuotaImpactResult[];
  evaluatedAt?: string;
  ruleVersionSnapshot: string;
  tenantDefaultTimeoutHours?: number;
  tenantDefaultFallbackPolicy?: TenantApprovalFallbackPolicy;
  quotaSnapshotVersion?: string | null;
};

type EvaluationDecision =
  | "allow"
  | "warn"
  | "require_approval"
  | "manual_review"
  | "block";

type CanonicalOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "exists";

const DECISION_PRIORITY: Record<EvaluationDecision, number> = {
  allow: 0,
  warn: 1,
  require_approval: 2,
  manual_review: 3,
  block: 4,
};

const ACTION_TO_DECISION: Record<TenantApprovalRuleAction, EvaluationDecision> =
  {
    allow: "allow",
    warn: "warn",
    require_approval: "require_approval",
    flag_manual_review: "manual_review",
    block: "block",
  };

const KNOWN_CONDITION_FIELDS = new Set([
  ...TENANT_APPROVAL_RULE_CONDITION_FIELDS,
]);

// Accessors for snapshot values
const APPROVAL_RULE_FIELD_ACCESSORS: Record<
  TenantApprovalRuleConditionField,
  (snapshot: TenantApprovalEvaluationInputSnapshot) => unknown
> = {
  "booking.amount_minor": (snapshot) => snapshot.amountMinor,
  "booking.business_dispatch_subtype": (snapshot) =>
    snapshot.businessDispatchSubtype,
  "booking.vehicle_preference": (snapshot) => snapshot.vehiclePreference,
  "booking.direction": (snapshot) => snapshot.direction ?? null,
  "booking.flight_no_present": (snapshot) => snapshot.flightNoPresent ?? null,
  "booking.reservation_window_start": (snapshot) =>
    snapshot.reservationWindowStart,
  "booking.passenger.role": (snapshot) => snapshot.passengerRole,
  "booking.passenger.id": (snapshot) => snapshot.passengerId,
  "cost_center.code": (snapshot) => snapshot.costCenterCode,
  "cost_center.monthly_quota_remaining_amount_minor": () => null, // Handled by lookupQuotaField
  "cost_center.monthly_quota_remaining_percent": () => null, // Handled by lookupQuotaField
  "tenant.monthly_quota_remaining_amount_minor": () => null, // Handled by lookupQuotaField
  "tenant.monthly_quota_remaining_percent": () => null, // Handled by lookupQuotaField
};

function isFieldWhitelisted(
  field: string,
): field is TenantApprovalRuleConditionField {
  return KNOWN_CONDITION_FIELDS.has(field as TenantApprovalRuleConditionField);
}

export function evaluateTenantApprovalRules(
  input: EvaluatorInput,
): TenantApprovalEvaluationResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const quotaImpacts = [...(input.quotaImpacts ?? [])];
  const activeRules = input.rules
    .filter((rule) => rule.activeFlag)
    .filter((rule) => isRuleEffective(rule, evaluatedAt))
    .sort((left, right) => left.priority - right.priority);

  const matchedRules = activeRules
    .filter((rule) =>
      rule.conditions.every((condition) =>
        matches(condition, input.inputSnapshot, quotaImpacts),
      ),
    )
    .map<TenantApprovalMatchedRuleResult>((rule) => ({
      ruleId: rule.ruleId,
      ruleName: rule.ruleName ?? rule.name ?? rule.ruleId,
      priority: rule.priority,
      action: rule.action,
      approvalMode: rule.approvalMode ?? null,
      approvers: rule.approvers.map(clonePrincipal),
      matchedConditions: rule.conditions.map(cloneCondition),
    }));

  const decision = deriveDecision(matchedRules, quotaImpacts);

  let approvalPlan: TenantApprovalPlan | null = null;
  if (decision === "require_approval" || decision === "manual_review") {
    const effectiveApprovers = dedupeApprovers(
      matchedRules
        .filter(
          (rule) =>
            rule.action === "require_approval" ||
            rule.action === "flag_manual_review",
        )
        .flatMap((rule) => rule.approvers),
    );
    const rule = findApprovalPlanRule(input.rules, matchedRules, decision);

    approvalPlan = {
      approvalMode: rule?.approvalMode ?? "any_of",
      approvers: effectiveApprovers,
      timeoutHours:
        rule?.timeoutHoursOverride ?? input.tenantDefaultTimeoutHours ?? 24,
      fallbackPolicy:
        rule?.fallbackPolicyOverride ??
        input.tenantDefaultFallbackPolicy ??
        "escalate_to_tenant_admin",
      escalationTarget: null,
    };
  }

  const warnings = buildWarnings(matchedRules, quotaImpacts);

  return {
    evaluationId: randomUUID(),
    tenantId: input.tenantId,
    evaluatedAt,
    subject: input.subject,
    inputSnapshot: input.inputSnapshot,
    matchedRules,
    quotaImpacts,
    outcome: {
      decision,
      approvalRequired: decision === "require_approval",
      blocked: decision === "block",
      warnings,
      reasonCodes: [
        ...matchedRules.map((rule) => `rule:${rule.ruleId}`),
        ...quotaImpacts
          .filter((impact) => impact.triggered !== "none")
          .map(
            (impact) =>
              `quota:${impact.scope}:${impact.dimension}:${impact.triggered}`,
          ),
      ],
    },
    approvalPlan: decision === "block" ? null : approvalPlan,
    auditSummary: {
      ruleVersionSnapshot: input.ruleVersionSnapshot,
      quotaSnapshotVersion: input.quotaSnapshotVersion ?? null,
      costCenterCode: input.inputSnapshot.costCenterCode,
    },
  };
}

function isRuleEffective(rule: TenantApprovalRuleRecord, evaluatedAt: string) {
  if (rule.effectiveFrom && rule.effectiveFrom > evaluatedAt) {
    return false;
  }
  if (rule.effectiveUntil && rule.effectiveUntil < evaluatedAt) {
    return false;
  }
  return true;
}

function matches(
  condition: TenantApprovalRuleCondition,
  snapshot: TenantApprovalEvaluationInputSnapshot,
  quotaImpacts: readonly TenantBookingQuotaImpactResult[],
): boolean {
  const field = condition.field;
  if (!isFieldWhitelisted(field)) {
    throw new ApiRequestError(
      400,
      "APPROVAL_RULE_FIELD_UNKNOWN",
      "Unknown approval rule condition field.",
      { field },
    );
  }

  const accessor = APPROVAL_RULE_FIELD_ACCESSORS[field];
  let actual: unknown;

  if (
    field.startsWith("cost_center.monthly_quota_remaining") ||
    field.startsWith("tenant.monthly_quota_remaining")
  ) {
    actual = lookupQuotaField(field, snapshot.costCenterCode, quotaImpacts);
  } else {
    actual = accessor(snapshot);
  }

  const operator = canonicalizeOperator(condition);
  // Use 'values' if present for 'in'/'not_in', otherwise use 'value'
  const expected = condition.values ?? condition.value;

  switch (operator) {
    case "exists":
      return actual !== null && actual !== undefined;
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual > expected
      );
    case "gte":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual >= expected
      );
    case "lt":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual < expected
      );
    case "lte":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual <= expected
      );
    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual as never);
    default:
      // This should not happen if canonicalizeOperator is correct
      throw new Error(`Unhandled operator: ${operator}`);
  }
}

function lookupQuotaField(
  field: TenantApprovalRuleConditionField,
  costCenterCode: string | null,
  quotaImpacts: readonly TenantBookingQuotaImpactResult[],
): number | null {
  let relevantImpacts: readonly TenantBookingQuotaImpactResult[] = [];

  if (field.startsWith("cost_center.") && costCenterCode) {
    relevantImpacts = quotaImpacts.filter(
      (impact) =>
        impact.scope === "cost_center" &&
        impact.costCenterCode === costCenterCode,
    );
  } else if (field.startsWith("tenant.")) {
    relevantImpacts = quotaImpacts.filter(
      (impact) => impact.scope === "tenant",
    );
  }

  const impact = relevantImpacts.find(
    (candidate) => candidate.dimension === "amount_minor",
  );

  if (!impact) {
    return null;
  }

  if (field.endsWith("_percent")) {
    return impact.remainingPercentAfter;
  }

  return impact.remainingAfter;
}

function canonicalizeOperator(
  condition: TenantApprovalRuleCondition,
): CanonicalOperator {
  const operator = condition.op ?? condition.operator ?? "eq";
  switch (operator) {
    case "equals":
      return "eq";
    case "not_equals":
      return "neq";
    case "greater_than":
      return "gt";
    case "greater_than_or_equal":
      return "gte";
    case "less_than":
      return "lt";
    case "less_than_or_equal":
      return "lte";
    case "in":
    case "not_in":
    case "exists":
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return operator;
    default:
      throw new ApiRequestError(
        400,
        "APPROVAL_RULE_OPERATOR_UNKNOWN",
        "Unknown approval rule condition operator.",
        { operator },
      );
  }
}

function deriveDecision(
  matchedRules: readonly TenantApprovalMatchedRuleResult[],
  quotaImpacts: readonly TenantBookingQuotaImpactResult[],
): EvaluationDecision {
  let highestRuleDecision: EvaluationDecision = "allow";
  for (const rule of matchedRules) {
    const ruleDecision = ACTION_TO_DECISION[rule.action];
    if (
      DECISION_PRIORITY[ruleDecision] > DECISION_PRIORITY[highestRuleDecision]
    ) {
      highestRuleDecision = ruleDecision;
    }
  }

  let highestQuotaDecision: EvaluationDecision = "allow";
  for (const impact of quotaImpacts) {
    const quotaDecision =
      impact.triggered === "block"
        ? "block"
        : impact.triggered === "approval"
          ? "require_approval"
          : impact.triggered === "warn"
            ? "warn"
            : "allow";
    if (
      DECISION_PRIORITY[quotaDecision] > DECISION_PRIORITY[highestQuotaDecision]
    ) {
      highestQuotaDecision = quotaDecision;
    }
  }

  return DECISION_PRIORITY[highestQuotaDecision] >
    DECISION_PRIORITY[highestRuleDecision]
    ? highestQuotaDecision
    : highestRuleDecision;
}

function buildWarnings(
  matchedRules: readonly TenantApprovalMatchedRuleResult[],
  quotaImpacts: readonly TenantBookingQuotaImpactResult[],
): TenantApprovalWarning[] {
  const ruleWarnings = matchedRules
    .filter(
      (rule) => rule.action === "warn" || rule.action === "flag_manual_review",
    )
    .map((rule) => ({
      source: "rule" as const,
      code:
        rule.action === "warn"
          ? "approval_rule_warn"
          : "approval_rule_manual_review",
      ruleId: rule.ruleId,
      message:
        rule.action === "warn"
          ? `Rule "${rule.ruleName}" issued a warning.`
          : `Rule "${rule.ruleName}" requested manual review.`,
    }));

  const quotaWarnings = quotaImpacts
    .filter((impact) => impact.triggered === "warn")
    .map((impact) => ({
      source: "quota" as const,
      code: "quota_warn",
      ruleId: null, // Quota warnings don't have a specific rule ID
      message: `Quota warning for ${impact.scope} ${impact.dimension}. Remaining: ${impact.remainingAfter ?? "unlimited"}, Limit: ${impact.limitValue ?? "unlimited"}.`,
    }));

  return [...ruleWarnings, ...quotaWarnings];
}

function clonePrincipal(principal: TenantPrincipalRef): TenantPrincipalRef {
  return { ...principal };
}

function cloneCondition(condition: TenantApprovalRuleCondition) {
  return {
    ...condition,
    ...(Array.isArray(condition.values)
      ? { values: [...condition.values] }
      : {}),
    ...(Array.isArray(condition.value)
      ? { value: [...condition.value] as string[] | number[] }
      : {}),
  };
}

// Ensure uniqueness based on kind, userId, roleCode, and costCenterCode
function dedupeApprovers(
  approvers: readonly TenantPrincipalRef[],
): TenantPrincipalRef[] {
  const uniqueApprovers: TenantPrincipalRef[] = [];
  const seenKeys = new Set<string>();

  for (const approver of approvers) {
    const key = `${approver.kind}:${approver.userId ?? ""}:${approver.roleCode ?? ""}:${approver.costCenterCode ?? ""}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueApprovers.push(clonePrincipal(approver)); // Ensure a deep copy
    }
  }
  return uniqueApprovers;
}

function findApprovalPlanRule(
  rules: readonly TenantApprovalRuleRecord[],
  matchedRules: readonly TenantApprovalMatchedRuleResult[],
  decision: EvaluationDecision,
): TenantApprovalRuleRecord | null {
  const preferredMatchedRule =
    matchedRules.find((rule) => rule.action === "require_approval") ??
    (decision === "manual_review"
      ? (matchedRules.find((rule) => rule.action === "flag_manual_review") ??
        null)
      : null);
  if (!preferredMatchedRule) {
    return null;
  }

  const rule = rules.find(
    (candidate) => candidate.ruleId === preferredMatchedRule.ruleId,
  );
  if (!rule) {
    return null;
  }

  return {
    ...rule,
    conditions: rule.conditions.map(cloneCondition),
    approvers: rule.approvers.map(clonePrincipal),
  };
}
