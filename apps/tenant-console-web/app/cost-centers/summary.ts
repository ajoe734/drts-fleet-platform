import type {
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantRuleApproverDescriptor,
} from "@drts/contracts";

export function conditionReferencesCostCenter(
  condition: TenantApprovalRuleCondition,
  code: string,
) {
  if (condition.field !== "cost_center.code") return false;

  const scalarValues = [condition.value, ...(condition.values ?? [])].flatMap(
    (value) => (Array.isArray(value) ? value : [value]),
  );

  return scalarValues.some((value) => value === code);
}

function isCostCenterCondition(condition: TenantApprovalRuleCondition) {
  return condition.field === "cost_center.code";
}

function approverReferencesCostCenter(
  approver: TenantRuleApproverDescriptor,
  code: string,
) {
  if (approver.kind !== "cost_center_owner") return false;

  // Contract allows omitted costCenterCode for generic/default owner routing.
  return (
    approver.costCenterCode === undefined || approver.costCenterCode === code
  );
}

export function summarizeApprovalRulesForCostCenter(
  costCenterCode: string,
  rules: readonly TenantApprovalRuleRecord[],
) {
  const scopedRules = rules.filter((rule) => {
    if (!rule.activeFlag) return false;

    const costCenterConditions = rule.conditions.filter(isCostCenterCondition);

    if (costCenterConditions.length > 0) {
      return costCenterConditions.some((condition) =>
        conditionReferencesCostCenter(condition, costCenterCode),
      );
    }

    if (
      rule.approvers.some((approver) =>
        approverReferencesCostCenter(approver, costCenterCode),
      )
    ) {
      return true;
    }

    return false;
  });

  const strictCount = scopedRules.filter(
    (rule) => rule.action === "require_approval" || rule.action === "block",
  ).length;
  const ownerApprovalCount = scopedRules.filter((rule) =>
    rule.approvers.some((approver) =>
      approverReferencesCostCenter(approver, costCenterCode),
    ),
  ).length;

  return {
    totalCount: scopedRules.length,
    strictCount,
    ownerApprovalCount,
  };
}
