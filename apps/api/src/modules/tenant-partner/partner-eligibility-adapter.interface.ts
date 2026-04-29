import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityDecisionSource,
  PartnerEligibilityIntegrationContractRecord,
  PartnerEligibilityStatus,
  VerifyPartnerEligibilityCommand,
} from "@drts/contracts";

export const PARTNER_ELIGIBILITY_ADAPTERS = Symbol(
  "PARTNER_ELIGIBILITY_ADAPTERS",
);

export interface PartnerEligibilityAdapterInput {
  entry: PartnerChannelEntryRecord;
  contract: PartnerEligibilityIntegrationContractRecord;
  command: VerifyPartnerEligibilityCommand;
  requestId?: string;
}

export interface PartnerEligibilityAdapterResult {
  verificationStatus: PartnerEligibilityStatus;
  decisionSource: PartnerEligibilityDecisionSource;
  verificationReasonCode: string;
  cardProgramCode: string | null;
  benefitReference: string | null;
  issuerAuthorizationRef: string | null;
  referenceTokenHash: string | null;
  expiresInSeconds: number | null;
  upstreamHttpStatus: number | null;
}

type PartnerEligibilityAdapterErrorOptions = {
  retryable: boolean;
  timedOut?: boolean;
  upstreamHttpStatus?: number | null;
  manualFallbackReasonCode?: string | null;
};

export class PartnerEligibilityAdapterError extends Error {
  readonly retryable: boolean;
  readonly timedOut: boolean;
  readonly upstreamHttpStatus: number | null;
  readonly manualFallbackReasonCode: string | null;

  constructor(
    readonly code: string,
    message: string,
    options: PartnerEligibilityAdapterErrorOptions,
  ) {
    super(message);
    this.name = "PartnerEligibilityAdapterError";
    this.retryable = options.retryable;
    this.timedOut = options.timedOut ?? false;
    this.upstreamHttpStatus = options.upstreamHttpStatus ?? null;
    this.manualFallbackReasonCode = options.manualFallbackReasonCode ?? null;
  }
}

export interface PartnerEligibilityAdapterInterface {
  readonly adapterCode: string;
  readonly adapterVersion: string;
  supports(
    contract: PartnerEligibilityIntegrationContractRecord,
    entry: PartnerChannelEntryRecord,
  ): boolean;
  verify(
    input: PartnerEligibilityAdapterInput,
  ): Promise<PartnerEligibilityAdapterResult>;
}
