import { Injectable } from "@nestjs/common";

import type {
  PartnerEligibilityAdapterInput,
  PartnerEligibilityAdapterInterface,
  PartnerEligibilityAdapterResult,
} from "./partner-eligibility-adapter.interface";

export const BANK_CARD_INLINE_ELIGIBILITY_ADAPTER_CODE =
  "issuer_bank_card_inline_v1";

@Injectable()
export class BankCardInlineEligibilityAdapter implements PartnerEligibilityAdapterInterface {
  readonly adapterCode = BANK_CARD_INLINE_ELIGIBILITY_ADAPTER_CODE;
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
    const cardLast4 = input.command.cardLast4?.trim() ?? "";
    const lastDigit = Number(cardLast4.at(-1) ?? "");
    const eligible = Number.isFinite(lastDigit) && lastDigit % 2 === 0;

    return {
      verificationStatus: eligible ? "eligible" : "ineligible",
      decisionSource: "issuer_realtime",
      verificationReasonCode: eligible
        ? "CARD_PROGRAM_MATCHED"
        : "CARD_PROGRAM_NOT_ELIGIBLE",
      cardProgramCode:
        input.entry.programCode ??
        input.entry.bankCode ??
        input.entry.partnerCode,
      benefitReference:
        input.command.benefitReference?.trim() ||
        `benefit-${input.entry.partnerCode}-${cardLast4}`,
      issuerAuthorizationRef: `issuer-auth-${input.entry.partnerCode}-${cardLast4}`,
      referenceTokenHash: null,
      expiresInSeconds: input.contract.decisionTtlSeconds,
      upstreamHttpStatus: 200,
    };
  }
}
