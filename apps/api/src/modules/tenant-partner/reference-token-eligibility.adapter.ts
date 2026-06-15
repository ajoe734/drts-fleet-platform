import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type {
  PartnerEligibilityAdapterInput,
  PartnerEligibilityAdapterInterface,
  PartnerEligibilityAdapterResult,
} from "./partner-eligibility-adapter.interface";

export const REFERENCE_TOKEN_ELIGIBILITY_ADAPTER_CODE =
  "issuer_reference_lookup_v1";

@Injectable()
export class ReferenceTokenEligibilityAdapter implements PartnerEligibilityAdapterInterface {
  readonly adapterCode = REFERENCE_TOKEN_ELIGIBILITY_ADAPTER_CODE;
  readonly adapterVersion = "v1";

  supports(
    contract: PartnerEligibilityAdapterInput["contract"],
    entry: PartnerEligibilityAdapterInput["entry"],
  ) {
    void entry;
    return contract.adapterCode === this.adapterCode;
  }

  async verify(
    input: PartnerEligibilityAdapterInput,
  ): Promise<PartnerEligibilityAdapterResult> {
    const referenceTokenHash =
      input.command.referenceToken?.trim() &&
      input.command.referenceToken.trim()
        ? `sha256:${createHash("sha256")
            .update(input.command.referenceToken.trim())
            .digest("hex")}`
        : null;
    const hashSuffix = referenceTokenHash?.slice(-8) ?? "unknown";

    // Demo issuer-reference lookup: a real issuer returns per-reference decisions.
    // Until a live issuer is wired, derive the decision deterministically from a
    // reference-token convention so the non-eligible governance paths
    // (pending review / not found / expired / cancelled) are exercisable. Tokens
    // without a decision marker resolve to "eligible" (the default happy path).
    const rawToken = input.command.referenceToken?.trim().toLowerCase() ?? "";
    const decision = rawToken.includes("-pending")
      ? { verificationStatus: "manual_review" as const, verificationReasonCode: "REFERENCE_PENDING_REVIEW" }
      : rawToken.includes("-missing")
        ? { verificationStatus: "ineligible" as const, verificationReasonCode: "REFERENCE_NOT_FOUND" }
        : rawToken.includes("-expired")
          ? { verificationStatus: "ineligible" as const, verificationReasonCode: "REFERENCE_EXPIRED" }
          : rawToken.includes("-cancelled")
            ? { verificationStatus: "ineligible" as const, verificationReasonCode: "REFERENCE_CANCELLED" }
            : { verificationStatus: "eligible" as const, verificationReasonCode: "REFERENCE_ACCEPTED" };

    return {
      verificationStatus: decision.verificationStatus,
      decisionSource: "issuer_reference_lookup",
      verificationReasonCode: decision.verificationReasonCode,
      cardProgramCode:
        input.entry.programCode ??
        input.entry.bankCode ??
        input.entry.partnerCode,
      benefitReference:
        input.command.benefitReference?.trim() ||
        `benefit-${input.entry.partnerCode}-${hashSuffix}`,
      issuerAuthorizationRef: `issuer-ref-${hashSuffix}`,
      referenceTokenHash,
      expiresInSeconds: input.contract.decisionTtlSeconds,
      upstreamHttpStatus: 200,
    };
  }
}
