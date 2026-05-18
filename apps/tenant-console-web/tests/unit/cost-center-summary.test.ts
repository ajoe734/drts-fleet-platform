import { describe, expect, it } from "vitest";
import type { TenantApprovalRuleRecord } from "@drts/contracts";
import { summarizeApprovalRulesForCostCenter } from "../../app/cost-centers/summary";

const baseRule: TenantApprovalRuleRecord = {
  ruleId: "rule-1",
  tenantId: "tenant-1",
  name: "Base rule",
  description: null,
  activeFlag: true,
  priority: 10,
  conditions: [],
  action: "require_approval",
  approvalMode: null,
  approvers: [],
  createdAt: "2026-05-14T00:00:00.000Z",
  updatedAt: "2026-05-14T00:00:00.000Z",
};

describe("summarizeApprovalRulesForCostCenter", () => {
  it("counts generic cost-center-owner approvers for every cost center row", () => {
    const summary = summarizeApprovalRulesForCostCenter("CC-FIN-04", [
      {
        ...baseRule,
        approvers: [
          { kind: "cost_center_owner", displayName: "Default owner" },
        ],
      },
    ]);

    expect(summary).toEqual({
      totalCount: 1,
      strictCount: 1,
      ownerApprovalCount: 1,
    });
  });

  it("keeps explicit cost-center-owner scoping and unrelated tenant rules separated", () => {
    const summary = summarizeApprovalRulesForCostCenter("CC-FIN-04", [
      {
        ...baseRule,
        ruleId: "rule-cc-match",
        approvers: [
          {
            kind: "cost_center_owner",
            costCenterCode: "CC-FIN-04",
            displayName: "Finance owner",
          },
        ],
      },
      {
        ...baseRule,
        ruleId: "rule-cc-other",
        approvers: [
          {
            kind: "cost_center_owner",
            costCenterCode: "CC-OPS-07",
            displayName: "Ops owner",
          },
        ],
      },
      {
        ...baseRule,
        ruleId: "rule-tenant-fallback",
        action: "warn",
        approvers: [{ kind: "tenant_admin", displayName: "Tenant admin" }],
      },
    ]);

    expect(summary).toEqual({
      totalCount: 1,
      strictCount: 1,
      ownerApprovalCount: 1,
    });
  });

  it("does not let generic owner approvers overmatch explicit conditions for another cost center", () => {
    const summary = summarizeApprovalRulesForCostCenter("CC-FIN-04", [
      {
        ...baseRule,
        ruleId: "rule-explicit-other-cost-center",
        conditions: [
          {
            field: "cost_center.code",
            operator: "eq",
            value: "CC-OPS-07",
          },
        ],
        approvers: [
          { kind: "cost_center_owner", displayName: "Default owner" },
        ],
      },
    ]);

    expect(summary).toEqual({
      totalCount: 0,
      strictCount: 0,
      ownerApprovalCount: 0,
    });
  });

  it("still scopes rules by explicit cost-center condition even without owner approvers", () => {
    const summary = summarizeApprovalRulesForCostCenter("CC-FIN-04", [
      {
        ...baseRule,
        ruleId: "rule-condition-only",
        action: "block",
        conditions: [
          {
            field: "cost_center.code",
            operator: "in",
            values: ["CC-FIN-04"],
          },
        ],
        approvers: [{ kind: "tenant_finance_admin", displayName: "Finance" }],
      },
    ]);

    expect(summary).toEqual({
      totalCount: 1,
      strictCount: 1,
      ownerApprovalCount: 0,
    });
  });
});
