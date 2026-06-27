import { Injectable } from "@nestjs/common";

import type {
  OwnedOrderRecord,
  SandboxBillingTreatmentRecord,
} from "@drts/contracts";

type SandboxFallbackCostAbsorber = NonNullable<
  SandboxBillingTreatmentRecord["fallbackCostAbsorber"]
>;

type SandboxFallbackCostPolicyRecord = {
  policyId: string;
  scope: "partner_program" | "tenant_contract";
  scopeRef: string;
  defaultAbsorber: SandboxFallbackCostAbsorber;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

export type SandboxFallbackCostPolicyResolution = {
  fallbackCostAbsorber: SandboxBillingTreatmentRecord["fallbackCostAbsorber"];
  fallbackPolicyId: string | null;
  policyResolution: string;
};

const DEFAULT_SANDBOX_FALLBACK_COST_POLICIES: SandboxFallbackCostPolicyRecord[] =
  [
    {
      policyId: "fallback-policy-partner-airport-001",
      scope: "partner_program",
      scopeRef: "program-airport-alpha",
      defaultAbsorber: "partner",
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      effectiveUntil: null,
    },
    {
      policyId: "fallback-policy-tenant-demo-001",
      scope: "tenant_contract",
      scopeRef: "tenant-demo-001",
      defaultAbsorber: "tenant_contract",
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      effectiveUntil: null,
    },
  ];

@Injectable()
export class SandboxFallbackCostPolicyResolverService {
  constructor(
    private readonly policies: readonly SandboxFallbackCostPolicyRecord[] = DEFAULT_SANDBOX_FALLBACK_COST_POLICIES,
  ) {}

  resolveHumanFallbackPolicy(
    order: Pick<OwnedOrderRecord, "tenantId" | "partnerProgramId">,
    asOf: string | null,
  ): SandboxFallbackCostPolicyResolution {
    const partnerPolicy = this.findMatchingPolicy(
      "partner_program",
      order.partnerProgramId,
      asOf,
    );
    if (partnerPolicy) {
      return {
        fallbackCostAbsorber: partnerPolicy.defaultAbsorber,
        fallbackPolicyId: partnerPolicy.policyId,
        policyResolution: "partner_policy",
      };
    }

    const tenantPolicy = this.findMatchingPolicy(
      "tenant_contract",
      order.tenantId,
      asOf,
    );
    if (tenantPolicy) {
      return {
        fallbackCostAbsorber: tenantPolicy.defaultAbsorber,
        fallbackPolicyId: tenantPolicy.policyId,
        policyResolution: "tenant_policy",
      };
    }

    return {
      fallbackCostAbsorber: "platform",
      fallbackPolicyId: null,
      policyResolution: "default_platform_no_contract",
    };
  }

  private findMatchingPolicy(
    scope: SandboxFallbackCostPolicyRecord["scope"],
    scopeRef: string | null,
    asOf: string | null,
  ) {
    if (!scopeRef) {
      return null;
    }

    return (
      this.policies.find((policy) => {
        if (policy.scope !== scope || policy.scopeRef !== scopeRef) {
          return false;
        }

        if (!asOf) {
          return true;
        }

        const asOfTimestamp = Date.parse(asOf);
        const effectiveFromTimestamp = Date.parse(policy.effectiveFrom);
        const effectiveUntilTimestamp = policy.effectiveUntil
          ? Date.parse(policy.effectiveUntil)
          : null;

        if (
          Number.isNaN(asOfTimestamp) ||
          Number.isNaN(effectiveFromTimestamp)
        ) {
          return false;
        }

        return (
          asOfTimestamp >= effectiveFromTimestamp &&
          (effectiveUntilTimestamp === null ||
          Number.isNaN(effectiveUntilTimestamp)
            ? true
            : asOfTimestamp <= effectiveUntilTimestamp)
        );
      }) ?? null
    );
  }
}
