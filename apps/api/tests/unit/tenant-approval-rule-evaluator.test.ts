import { describe, expect, it } from "vitest";

import type {
  TenantApprovalEvaluationInputSnapshot,
  TenantApprovalRuleRecord,
  TenantBookingQuotaImpactResult,
} from "@drts/contracts";

import { evaluateTenantApprovalRules } from "../../src/modules/tenant-partner/tenant-approval-rule-evaluator";

const TENANT_ID = "tenant-demo-001";

function computeRemainingPercentAfter(
  remainingAfter: number | null,
  limitValue: number | null,
) {
  if (remainingAfter === null || limitValue === null) {
    return null;
  }
  if (limitValue <= 0) {
    return remainingAfter > 0 ? 100 : 0;
  }
  return Math.max(
    0,
    Math.round((Math.max(0, remainingAfter) / limitValue) * 100),
  );
}

function createInputSnapshot(
  overrides: Partial<TenantApprovalEvaluationInputSnapshot> = {},
): TenantApprovalEvaluationInputSnapshot {
  return {
    costCenterCode: "CC-FIN-04",
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: "2026-05-13T10:00:00.000Z",
    passengerId: "passenger-001",
    passengerRole: "employee",
    amountMinor: 200_000,
    currency: "TWD",
    vehiclePreference: "standard_taxi",
    direction: "pickup",
    flightNoPresent: false,
    flightNo: null,
    ...overrides,
  };
}

function createRule(
  overrides: Partial<TenantApprovalRuleRecord> = {},
): TenantApprovalRuleRecord {
  return {
    ruleId: overrides.ruleId ?? "rule-001",
    tenantId: TENANT_ID,
    ruleName: overrides.ruleName ?? "Approval rule",
    priority: overrides.priority ?? 10,
    activeFlag: overrides.activeFlag ?? true,
    effectiveFrom: overrides.effectiveFrom ?? null,
    effectiveUntil: overrides.effectiveUntil ?? null,
    conditions: overrides.conditions ?? [
      {
        field: "booking.amount_minor",
        op: "gte",
        value: 100_000,
      },
    ],
    action: overrides.action ?? "require_approval",
    approvalMode: overrides.approvalMode ?? "any_of",
    approvers: overrides.approvers ?? [
      { kind: "tenant_role", roleCode: "finance_admin" },
    ],
    timeoutHoursOverride: overrides.timeoutHoursOverride ?? null,
    fallbackPolicyOverride: overrides.fallbackPolicyOverride ?? null,
    createdAt: overrides.createdAt ?? "2026-05-13T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-13T10:00:00.000Z",
  };
}

function createQuotaImpact(
  overrides: Partial<TenantBookingQuotaImpactResult> = {},
): TenantBookingQuotaImpactResult {
  const remainingAfter = overrides.remainingAfter ?? -5_000;
  const limitValue = overrides.limitValue ?? 20_000;
  return {
    scope: overrides.scope ?? "tenant",
    costCenterCode: overrides.costCenterCode ?? null,
    periodKey: overrides.periodKey ?? "2026-05",
    dimension: overrides.dimension ?? "amount_minor",
    remainingBefore: overrides.remainingBefore ?? 10_000,
    delta: overrides.delta ?? 15_000,
    remainingAfter,
    limitValue,
    remainingPercentAfter:
      overrides.remainingPercentAfter ??
      computeRemainingPercentAfter(remainingAfter, limitValue),
    enforcementMode: overrides.enforcementMode ?? "require_approval",
    triggered: overrides.triggered ?? "approval",
  };
}

function evaluate(params?: {
  rules?: TenantApprovalRuleRecord[];
  quotaImpacts?: TenantBookingQuotaImpactResult[];
  inputSnapshot?: TenantApprovalEvaluationInputSnapshot;
}) {
  return evaluateTenantApprovalRules({
    tenantId: TENANT_ID,
    subject: {
      subjectType: "booking",
      bookingId: "booking-001",
      draftId: null,
      operation: "dry_run",
    },
    inputSnapshot: params?.inputSnapshot ?? createInputSnapshot(),
    rules: params?.rules ?? [],
    quotaImpacts: params?.quotaImpacts ?? [],
    ruleVersionSnapshot: "3",
  });
}

describe("evaluateTenantApprovalRules", () => {
  it("returns allow when no rules match", () => {
    const result = evaluate({
      rules: [
        createRule({
          conditions: [
            { field: "booking.amount_minor", op: "gt", value: 999_999 },
          ],
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("allow");
    expect(result.outcome?.warnings).toEqual([]);
  });

  it("returns require_approval and approval plan for one matching rule", () => {
    const result = evaluate({
      rules: [
        createRule({
          approvers: [{ kind: "tenant_user", userId: "user-001" }],
          timeoutHoursOverride: 8,
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("require_approval");
    expect(result.approvalPlan).toMatchObject({
      approvalMode: "any_of",
      timeoutHours: 8,
      approvers: [{ kind: "tenant_user", userId: "user-001" }],
    });
  });

  it("merges and dedupes approvers across matching approval rules", () => {
    const result = evaluate({
      rules: [
        createRule({
          ruleId: "rule-001",
          priority: 10,
          approvers: [
            { kind: "tenant_user", userId: "user-001" },
            { kind: "tenant_role", roleCode: "finance_admin" },
          ],
        }),
        createRule({
          ruleId: "rule-002",
          priority: 20,
          approvers: [
            { kind: "tenant_role", roleCode: "finance_admin" },
            { kind: "tenant_admin" },
          ],
        }),
      ],
    });

    expect(result.matchedRules).toHaveLength(2);
    expect(result.approvalPlan?.approvers).toEqual([
      { kind: "tenant_user", userId: "user-001" },
      { kind: "tenant_role", roleCode: "finance_admin" },
      { kind: "tenant_admin" },
    ]);
  });

  it("prefers block over require_approval and clears approval plan", () => {
    const result = evaluate({
      rules: [
        createRule({ ruleId: "rule-001", action: "require_approval" }),
        createRule({
          ruleId: "rule-002",
          priority: 5,
          action: "block",
          approvalMode: null,
          approvers: [],
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("block");
    expect(result.approvalPlan).toBeNull();
    expect(result.matchedRules).toHaveLength(2);
  });

  it("returns warn with one warning for a warn rule", () => {
    const result = evaluate({
      rules: [
        createRule({
          action: "warn",
          approvalMode: null,
          approvers: [],
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("warn");
    expect(result.outcome?.warnings).toHaveLength(1);
  });

  it("returns manual_review for a flag_manual_review rule", () => {
    const result = evaluate({
      rules: [
        createRule({
          action: "flag_manual_review",
          approvalMode: "any_of",
          approvers: [{ kind: "tenant_admin" }],
        }),
      ],
    });

    expect(result.outcome).toMatchObject({
      decision: "manual_review",
      approvalRequired: false,
      blocked: false,
    });
  });

  it("uses the highest-priority require_approval rule for approvalPlan even when manual_review wins", () => {
    const result = evaluate({
      rules: [
        createRule({
          ruleId: "rule-manual",
          priority: 5,
          action: "flag_manual_review",
          approvalMode: "ordered_chain",
          approvers: [{ kind: "tenant_admin" }],
          timeoutHoursOverride: 12,
        }),
        createRule({
          ruleId: "rule-approval",
          priority: 20,
          action: "require_approval",
          approvalMode: "all_of_parallel",
          approvers: [{ kind: "tenant_user", userId: "user-002" }],
          timeoutHoursOverride: 6,
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("manual_review");
    expect(result.approvalPlan).toMatchObject({
      approvalMode: "all_of_parallel",
      timeoutHours: 6,
    });
    expect(result.approvalPlan?.approvers).toEqual([
      { kind: "tenant_admin" },
      { kind: "tenant_user", userId: "user-002" },
    ]);
  });

  it("ignores expired rules", () => {
    const result = evaluate({
      rules: [
        createRule({
          effectiveUntil: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });

    expect(result.matchedRules).toEqual([]);
    expect(result.outcome?.decision).toBe("allow");
  });

  it("uses tenant defaults when quota requires approval and no rules match", () => {
    const result = evaluate({
      quotaImpacts: [createQuotaImpact({ triggered: "approval" })],
    });

    expect(result.outcome?.decision).toBe("require_approval");
    expect(result.approvalPlan).toMatchObject({
      approvalMode: "any_of",
      timeoutHours: 24,
      fallbackPolicy: "escalate_to_tenant_admin",
    });
  });

  it("blocks when quota impact triggers block", () => {
    const result = evaluate({
      quotaImpacts: [
        createQuotaImpact({
          triggered: "block",
          enforcementMode: "hard_block",
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("block");
  });

  it("preserves cost_center_owner approver descriptors", () => {
    const result = evaluate({
      rules: [
        createRule({
          approvers: [
            { kind: "cost_center_owner", costCenterCode: "CC-FIN-04" },
          ],
        }),
      ],
    });

    expect(result.approvalPlan?.approvers).toEqual([
      { kind: "cost_center_owner", costCenterCode: "CC-FIN-04" },
    ]);
  });

  it("matches quota remaining percent conditions against the configured limit", () => {
    const result = evaluate({
      rules: [
        createRule({
          conditions: [
            {
              field: "cost_center.monthly_quota_remaining_percent",
              op: "lte",
              value: 20,
            },
          ],
        }),
      ],
      quotaImpacts: [
        createQuotaImpact({
          scope: "cost_center",
          costCenterCode: "CC-FIN-04",
          remainingBefore: 30_000,
          delta: 15_000,
          remainingAfter: 15_000,
          limitValue: 100_000,
          remainingPercentAfter: 15,
          triggered: "none",
        }),
      ],
    });

    expect(result.outcome?.decision).toBe("require_approval");
    expect(result.matchedRules).toHaveLength(1);
  });

  it("throws APPROVAL_RULE_FIELD_UNKNOWN for unknown fields", () => {
    expect(() =>
      evaluate({
        rules: [
          createRule({
            conditions: [
              {
                field: "booking.unknown_field" as never,
                op: "eq",
                value: "x",
              },
            ],
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "APPROVAL_RULE_FIELD_UNKNOWN",
          }),
        }),
      }),
    );
  });
});
