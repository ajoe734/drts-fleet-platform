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

    return {
      verificationStatus: "eligible",
      decisionSource: "issuer_reference_lookup",
      verificationReasonCode: "REFERENCE_ACCEPTED",
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
