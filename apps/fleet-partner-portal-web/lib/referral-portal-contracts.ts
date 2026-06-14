import type { MoneyAmount } from "@drts/contracts";

export type PartnerReferralUsagePeriodRecord = {
  partnerEntrySlug: string;
  period: string;
  activeUserCount: number;
  tripCount: number;
  gmv: MoneyAmount;
};

export type PartnerReferralRevenuePeriodRecord = {
  partnerEntrySlug: string;
  period: string;
  currency: string;
  tripCount: number;
  gmv: MoneyAmount;
  shareAmount: MoneyAmount;
  statementId: string;
  statementStatus: ReferralStatementStatus;
  generatedAt: string;
};

export type PartnerReferralDashboardRecord = {
  partnerEntrySlug: string;
  period: string;
  activeUserCount: number;
  tripCount: number;
  gmv: MoneyAmount;
  estimatedShareAmount: MoneyAmount;
  statementId: string;
  statementStatus: ReferralStatementStatus;
  latestStatementPeriod: string | null;
  pendingStatementCount: number;
};

export type ReferralStatementStatus = "published" | "paid" | "due";

export type ReferralStatementLineRecord = {
  tripId: string;
  completedAt: string;
  partnerEntrySlug: string;
  fare: MoneyAmount;
  rateType: "percent" | "per_trip";
  rateValue: number;
  shareAmount: MoneyAmount;
};

export type ReferralStatementRecord = {
  statementId: string;
  partnerEntrySlug: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  channelKey: string;
  direction: string;
  currency: string;
  status: ReferralStatementStatus;
  lines: ReferralStatementLineRecord[];
  totals: {
    tripCount: number;
    activeRiderCount: number;
    gmv: MoneyAmount;
    shareTotal: MoneyAmount;
  };
  artifactRef: {
    artifactId: string;
    kind: "referral_settlement_statement";
    manifestHash: string;
  };
  generatedAt: string;
};
