import type { MoneyAmount } from "@drts/contracts";

import type { ReferralStatementRecord } from "../billing-settlement/referral-statement.types";

export interface PartnerReferralUsagePeriodRecord {
  partnerEntrySlug: string;
  period: string;
  activeUserCount: number;
  tripCount: number;
  gmv: MoneyAmount;
}

export interface PartnerReferralRevenuePeriodRecord {
  partnerEntrySlug: string;
  period: string;
  currency: string;
  tripCount: number;
  gmv: MoneyAmount;
  shareAmount: MoneyAmount;
  statementId: string;
  statementStatus: ReferralStatementRecord["status"];
  generatedAt: string;
}

export interface PartnerReferralDashboardRecord {
  partnerEntrySlug: string;
  period: string;
  activeUserCount: number;
  tripCount: number;
  gmv: MoneyAmount;
  estimatedShareAmount: MoneyAmount;
  statementId: string;
  statementStatus: ReferralStatementRecord["status"];
  latestStatementPeriod: string | null;
  pendingStatementCount: number;
}
