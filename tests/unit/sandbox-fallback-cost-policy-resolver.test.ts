import { describe, expect, it } from "vitest";

import type { SandboxFallbackCostPolicyRecord } from "@drts/contracts";

import { SandboxFallbackCostPolicyResolverService } from "../../apps/api/src/modules/billing-settlement/sandbox-fallback-cost-policy-resolver.service";

const POLICY_WINDOW_START = "2026-06-26T00:00:00.000Z";

function createResolver(policies: SandboxFallbackCostPolicyRecord[]) {
  return new SandboxFallbackCostPolicyResolverService(policies);
}

describe("SandboxFallbackCostPolicyResolverService", () => {
  it("enforces regulatory and safety precedence ahead of policy scope", () => {
    const resolver = createResolver([
      {
        policyId: "experiment-priority-001",
        scope: "experiment",
        scopeRef: "experiment-alpha",
        contractId: null,
        defaultAbsorber: "tenant_contract",
        reasonOverrides: {
          regulatory_requirement: "partner_program",
          safety_intervention: "tenant_contract",
        },
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
    ]);

    expect(
      resolver.resolvePolicy({
        experimentId: "experiment-alpha",
        tenantId: "tenant-demo-001",
        tenantContractId: "tenant-contract-demo-001",
        reason: "regulatory_requirement",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "platform",
      policyResolution: "regulatory_override",
      policyId: null,
    });

    expect(
      resolver.resolvePolicy({
        experimentId: "experiment-alpha",
        tenantId: "tenant-demo-001",
        tenantContractId: "tenant-contract-demo-001",
        reason: "safety_intervention",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "platform",
      policyResolution: "safety_override",
      policyId: null,
    });
  });

  it("gives experiment policy precedence over partner and tenant contracts", () => {
    const resolver = createResolver([
      {
        policyId: "experiment-priority-001",
        scope: "experiment",
        scopeRef: "experiment-alpha",
        contractId: null,
        defaultAbsorber: "tenant_contract",
        reasonOverrides: {},
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
      {
        policyId: "partner-priority-001",
        scope: "partner_program",
        scopeRef: "program-airport-alpha",
        contractId: "partner-contract-airport-alpha",
        defaultAbsorber: "partner_program",
        reasonOverrides: {},
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
      {
        policyId: "tenant-priority-001",
        scope: "tenant_contract",
        scopeRef: "tenant-demo-001",
        contractId: "tenant-contract-demo-001",
        defaultAbsorber: "tenant_contract",
        reasonOverrides: {},
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
    ]);

    expect(
      resolver.resolvePolicy({
        experimentId: "experiment-alpha",
        partnerProgramId: "program-airport-alpha",
        partnerContractId: "partner-contract-airport-alpha",
        tenantId: "tenant-demo-001",
        tenantContractId: "tenant-contract-demo-001",
        reason: "partner_operational_issue",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "tenant_contract",
      policyResolution: "experiment_policy",
      policyId: "experiment-priority-001",
      policyScope: "experiment",
    });
  });

  it("routes platform-caused fallbacks to the platform even when contracts exist", () => {
    const resolver = createResolver([
      {
        policyId: "partner-priority-001",
        scope: "partner_program",
        scopeRef: "program-airport-alpha",
        contractId: "partner-contract-airport-alpha",
        defaultAbsorber: "partner_program",
        reasonOverrides: {
          platform_operational_issue: "partner_program",
        },
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
    ]);

    expect(
      resolver.resolvePolicy({
        partnerProgramId: "program-airport-alpha",
        partnerContractId: "partner-contract-airport-alpha",
        reason: "platform_operational_issue",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "platform",
      policyResolution: "platform_cause_platform_default",
      policyId: null,
    });
  });

  it("applies partner and tenant policies only when a matching contract is present", () => {
    const resolver = createResolver([
      {
        policyId: "partner-priority-001",
        scope: "partner_program",
        scopeRef: "program-airport-alpha",
        contractId: "partner-contract-airport-alpha",
        defaultAbsorber: "partner_program",
        reasonOverrides: {},
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
      {
        policyId: "tenant-priority-001",
        scope: "tenant_contract",
        scopeRef: "tenant-demo-001",
        contractId: "tenant-contract-demo-001",
        defaultAbsorber: "tenant_contract",
        reasonOverrides: {},
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
    ]);

    expect(
      resolver.resolvePolicy({
        partnerProgramId: "program-airport-alpha",
        reason: "partner_operational_issue",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "platform",
      policyResolution: "default_platform_no_contract",
      auditEventCode: "sandbox.billing.fallback_cost_policy.defaulted",
    });

    expect(
      resolver.resolvePolicy({
        tenantId: "tenant-demo-001",
        reason: "tenant_operational_issue",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "platform",
      policyResolution: "default_platform_no_contract",
      auditEventCode: "sandbox.billing.fallback_cost_policy.defaulted",
    });

    expect(
      resolver.resolvePolicy({
        partnerProgramId: "program-airport-alpha",
        partnerContractId: "partner-contract-airport-alpha",
        reason: "partner_operational_issue",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "partner_program",
      policyResolution: "partner_policy",
    });

    expect(
      resolver.resolvePolicy({
        tenantId: "tenant-demo-001",
        tenantContractId: "tenant-contract-demo-001",
        reason: "tenant_operational_issue",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "tenant_contract",
      policyResolution: "tenant_policy",
    });
  });

  it("never surcharges the passenger even if a policy attempts to", () => {
    const resolver = createResolver([
      {
        policyId: "experiment-passenger-guard-001",
        scope: "experiment",
        scopeRef: "experiment-alpha",
        contractId: null,
        defaultAbsorber: "passenger",
        reasonOverrides: {
          experiment_learning: "passenger",
        },
        passengerSurchargeAllowed: false,
        effectiveFrom: POLICY_WINDOW_START,
        effectiveUntil: null,
        notes: null,
      },
    ]);

    expect(
      resolver.resolvePolicy({
        experimentId: "experiment-alpha",
        reason: "experiment_learning",
      }),
    ).toMatchObject({
      fallbackCostAbsorber: "platform",
      passengerSurchargeAllowed: false,
      matchedByReasonOverride: true,
    });
  });
});
