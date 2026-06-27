import type {
  ResolveSandboxFallbackCostPolicyCommand,
  SandboxFallbackCostAbsorber,
  SandboxFallbackCostPolicyRecord,
  SandboxFallbackCostPolicyResolution,
  SandboxFallbackCostPolicyResolutionRecord,
  SandboxFallbackCostReason,
} from "@drts/contracts";

const DEFAULT_AUDIT_EVENT =
  "sandbox.billing.fallback_cost_policy.defaulted" as const;

const DEFAULT_SANDBOX_FALLBACK_COST_POLICIES: SandboxFallbackCostPolicyRecord[] =
  [
    {
      policyId: "fallback-policy-experiment-downtown-001",
      scope: "experiment",
      scopeRef: "phase2-tesla-fsd-sandbox-202606",
      contractId: null,
      defaultAbsorber: "platform",
      reasonOverrides: {
        experiment_learning: "platform",
      },
      passengerSurchargeAllowed: false,
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      effectiveUntil: null,
      notes:
        "Experiment-level default keeps sandbox fallback costs on platform.",
    },
    {
      policyId: "fallback-policy-partner-airport-001",
      scope: "partner_program",
      scopeRef: "program-airport-alpha",
      contractId: "partner-contract-airport-alpha",
      defaultAbsorber: "partner_program",
      reasonOverrides: {},
      passengerSurchargeAllowed: false,
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      effectiveUntil: null,
      notes:
        "Partner airport-transfer contract absorbs partner-caused fallbacks.",
    },
    {
      policyId: "fallback-policy-tenant-demo-001",
      scope: "tenant_contract",
      scopeRef: "tenant-demo-001",
      contractId: "tenant-contract-demo-001",
      defaultAbsorber: "tenant_contract",
      reasonOverrides: {},
      passengerSurchargeAllowed: false,
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      effectiveUntil: null,
      notes: "Tenant sandbox contract absorbs tenant-caused fallbacks.",
    },
  ];

export class SandboxFallbackCostPolicyResolverService {
  constructor(
    private readonly policies: SandboxFallbackCostPolicyRecord[] = DEFAULT_SANDBOX_FALLBACK_COST_POLICIES,
  ) {}

  resolvePolicy(
    input: ResolveSandboxFallbackCostPolicyCommand,
  ): SandboxFallbackCostPolicyResolutionRecord {
    if (input.reason === "regulatory_requirement") {
      return this.buildOverrideResolution(input.reason, "regulatory_override");
    }

    if (input.reason === "safety_intervention") {
      return this.buildOverrideResolution(input.reason, "safety_override");
    }

    if (input.reason === "platform_operational_issue") {
      return this.buildOverrideResolution(
        input.reason,
        "platform_cause_platform_default",
      );
    }

    const experimentPolicy = this.findMatchingPolicy("experiment", {
      scopeRef: input.experimentId ?? null,
      contractId: null,
      asOf: input.asOf ?? null,
    });
    if (experimentPolicy) {
      return this.buildPolicyResolution(
        experimentPolicy,
        input.reason,
        "experiment_policy",
        "experiment_reason_override",
      );
    }

    const partnerPolicy = this.findMatchingPolicy("partner_program", {
      scopeRef: input.partnerProgramId ?? null,
      contractId: input.partnerContractId ?? null,
      asOf: input.asOf ?? null,
    });
    if (partnerPolicy) {
      return this.buildPolicyResolution(
        partnerPolicy,
        input.reason,
        "partner_policy",
        "partner_reason_override",
      );
    }

    const tenantPolicy = this.findMatchingPolicy("tenant_contract", {
      scopeRef: input.tenantId ?? null,
      contractId: input.tenantContractId ?? null,
      asOf: input.asOf ?? null,
    });
    if (tenantPolicy) {
      return this.buildPolicyResolution(
        tenantPolicy,
        input.reason,
        "tenant_policy",
        "tenant_reason_override",
      );
    }

    return {
      reason: input.reason,
      fallbackCostAbsorber: "platform",
      policyResolution: "default_platform_no_contract",
      policyScope: "platform_default",
      policyId: null,
      matchedByReasonOverride: false,
      passengerSurchargeAllowed: false,
      auditEventCode: DEFAULT_AUDIT_EVENT,
    };
  }

  private buildOverrideResolution(
    reason: SandboxFallbackCostReason,
    policyResolution:
      | "regulatory_override"
      | "safety_override"
      | "platform_cause_platform_default",
  ): SandboxFallbackCostPolicyResolutionRecord {
    return {
      reason,
      fallbackCostAbsorber: "platform",
      policyResolution,
      policyScope: null,
      policyId: null,
      matchedByReasonOverride: false,
      passengerSurchargeAllowed: false,
      auditEventCode: null,
    };
  }

  private buildPolicyResolution(
    policy: SandboxFallbackCostPolicyRecord,
    reason: SandboxFallbackCostReason,
    defaultResolution: SandboxFallbackCostPolicyResolution,
    overrideResolution: SandboxFallbackCostPolicyResolution,
  ): SandboxFallbackCostPolicyResolutionRecord {
    const overrideAbsorber = policy.reasonOverrides[reason];
    const matchedByReasonOverride = overrideAbsorber !== undefined;

    return {
      reason,
      fallbackCostAbsorber: this.normalizeAbsorber(
        overrideAbsorber ?? policy.defaultAbsorber,
        policy.passengerSurchargeAllowed,
      ),
      policyResolution: matchedByReasonOverride
        ? overrideResolution
        : defaultResolution,
      policyScope: policy.scope,
      policyId: policy.policyId,
      matchedByReasonOverride,
      passengerSurchargeAllowed: false,
      auditEventCode: null,
    };
  }

  private normalizeAbsorber(
    absorber: SandboxFallbackCostAbsorber,
    passengerSurchargeAllowed: boolean,
  ): Exclude<SandboxFallbackCostAbsorber, "passenger"> {
    if (absorber === "passenger" || !passengerSurchargeAllowed) {
      return absorber === "passenger" ? "platform" : absorber;
    }

    return absorber;
  }

  private findMatchingPolicy(
    scope: SandboxFallbackCostPolicyRecord["scope"],
    input: {
      scopeRef: string | null;
      contractId: string | null;
      asOf: string | null;
    },
  ) {
    if (!input.scopeRef) {
      return null;
    }

    if (scope !== "experiment" && !input.contractId) {
      return null;
    }

    return (
      this.policies.find((policy) => {
        if (policy.scope !== scope || policy.scopeRef !== input.scopeRef) {
          return false;
        }
        if (scope !== "experiment" && policy.contractId !== input.contractId) {
          return false;
        }
        if (!input.asOf) {
          return true;
        }

        const asOf = new Date(input.asOf).getTime();
        const effectiveFrom = new Date(policy.effectiveFrom).getTime();
        const effectiveUntil = policy.effectiveUntil
          ? new Date(policy.effectiveUntil).getTime()
          : null;

        if (Number.isNaN(asOf) || Number.isNaN(effectiveFrom)) {
          return false;
        }

        return (
          asOf >= effectiveFrom &&
          (effectiveUntil === null || Number.isNaN(effectiveUntil)
            ? true
            : asOf <= effectiveUntil)
        );
      }) ?? null
    );
  }
}
