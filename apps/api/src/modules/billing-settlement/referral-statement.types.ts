import type { MoneyAmount } from "@drts/contracts";
import {
  PARTNER_REFERRAL_CHANNEL_KEY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
} from "@drts/contracts";

/**
 * Referral-channel settlement statement.
 *
 * The mirror direction of the card-benefit {@link SettlementStatementRecord}:
 * money flows `drts_pays_partner` — DRTS pays the third-party referral channel
 * (e.g. a community / property-management app) a revenue share for each
 * completed ride attributed to that channel via `partnerEntrySlug`. Defined
 * module-local (like the card statement) because it is derived from the
 * in-module settlement ledger, not a shared cross-app contract.
 */

export const REFERRAL_STATEMENT_DIRECTION =
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER;
export type ReferralStatementDirection = typeof REFERRAL_STATEMENT_DIRECTION;

export const REFERRAL_STATEMENT_CHANNEL_KEY = PARTNER_REFERRAL_CHANNEL_KEY;
export type ReferralStatementChannelKey = typeof REFERRAL_STATEMENT_CHANNEL_KEY;

export type ReferralStatementStatus = "published" | "paid" | "due";

export interface ReferralStatementLine {
  /** Completed trip (owned order) attributed to the referral channel. */
  tripId: string;
  completedAt: string;
  partnerEntrySlug: string;
  /** Total trip fare (the GMV basis for the share). */
  fare: MoneyAmount;
  /** Share rate applied to this line (percent value, or flat per-trip minor). */
  rateType: "percent" | "per_trip";
  rateValue: number;
  /** The referral share DRTS owes the partner for this trip. */
  shareAmount: MoneyAmount;
}

export interface ReferralStatementTotals {
  tripCount: number;
  /** Distinct attributed riders in the period (the "active users" metric). */
  activeRiderCount: number;
  /** Gross merchandise value = sum of fares. */
  gmv: MoneyAmount;
  /** Total referral share payable to the partner (`drts_pays_partner`). */
  shareTotal: MoneyAmount;
}

export interface ReferralStatementArtifactRef {
  artifactId: string;
  kind: "referral_settlement_statement";
  /** Stable manifest hash over the canonical statement lines. */
  manifestHash: string;
}

export interface ReferralStatementRecord {
  statementId: string;
  partnerEntrySlug: string;
  /** Statement period in `YYYY-MM` form. */
  period: string;
  periodStart: string;
  periodEnd: string;
  channelKey: ReferralStatementChannelKey;
  /** Money direction — always `drts_pays_partner` for referral. */
  direction: ReferralStatementDirection;
  currency: string;
  status: ReferralStatementStatus;
  lines: ReferralStatementLine[];
  totals: ReferralStatementTotals;
  artifactRef: ReferralStatementArtifactRef;
  generatedAt: string;
}
