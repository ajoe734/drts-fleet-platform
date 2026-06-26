import { describe, expect, it, vi } from "vitest";

import type { SandboxFallbackCostPolicyRecord } from "@drts/contracts";

import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { SandboxFallbackCostPolicyResolverService } from "../../apps/api/src/modules/billing-settlement/sandbox-fallback-cost-policy-resolver.service";

function createService(policies: SandboxFallbackCostPolicyRecord[]) {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  return {
    auditNotificationService,
    billingSettlementService: new BillingSettlementService(
      auditNotificationService as any,
      undefined,
      undefined,
      new SandboxFallbackCostPolicyResolverService(policies),
    ),
  };
}

describe("billing settlement fallback-cost policy integration", () => {
  it("records an audit event when the resolver falls back to default platform handling", () => {
    const { auditNotificationService, billingSettlementService } =
      createService([]);

    const resolution =
      billingSettlementService.resolveSandboxFallbackCostPolicy(
        {
          experimentId: "experiment-missing",
          partnerProgramId: "program-missing",
          reason: "partner_operational_issue",
          tenantId: "tenant-demo-001",
        },
        "fallback-policy-request-001",
      );

    expect(resolution).toMatchObject({
      fallbackCostAbsorber: "platform",
      policyResolution: "default_platform_no_contract",
      auditEventCode: "sandbox.billing.fallback_cost_policy.defaulted",
    });

    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith({
      moduleName: "billing-settlement",
      actionName: "sandbox.billing.fallback_cost_policy.defaulted",
      resourceType: "sandbox_fallback_cost_policy",
      requestId: "fallback-policy-request-001",
      tenantId: "tenant-demo-001",
      newValuesSummary: {
        reason: "partner_operational_issue",
        fallbackCostAbsorber: "platform",
        policyResolution: "default_platform_no_contract",
      },
    });
  });

  it("returns a contracted absorber without recording the default audit event", () => {
    const { auditNotificationService, billingSettlementService } =
      createService([
        {
          policyId: "partner-priority-001",
          scope: "partner_program",
          scopeRef: "program-airport-alpha",
          contractId: "partner-contract-airport-alpha",
          defaultAbsorber: "partner_program",
          reasonOverrides: {},
          passengerSurchargeAllowed: false,
          effectiveFrom: "2026-06-26T00:00:00.000Z",
          effectiveUntil: null,
          notes: null,
        },
      ]);

    const resolution =
      billingSettlementService.resolveSandboxFallbackCostPolicy(
        {
          partnerProgramId: "program-airport-alpha",
          partnerContractId: "partner-contract-airport-alpha",
          reason: "partner_operational_issue",
        },
        "fallback-policy-request-002",
      );

    expect(resolution).toMatchObject({
      fallbackCostAbsorber: "partner_program",
      policyResolution: "partner_policy",
      auditEventCode: null,
    });
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
  });
});
