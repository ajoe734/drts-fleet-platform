import type { MoneyAmount } from "@drts/contracts";

/**
 * Card-benefit airport-transfer settlement statement (CCAT).
 *
 * Distinct from the generic tenant `/invoices` surface: this is the
 * period reconciliation the issuer tenant (bank) reviews, itemising each
 * card-benefit trip with its subsidised-vs-paid split, benefit/issuer
 * references, and the masked cardholder reference. Money always flows in
 * the `issuer_pays_drts` direction — the issuer reimburses DRTS for the
 * sponsor-funded (benefit) portion while the driver/fleet payout stays
 * whole (settlement-matrix `partner_airport` card-benefit channel).
 *
 * Defined module-local (like {@link BillingSettlementTripRecord}) because
 * the record is derived from the in-module settlement ledger, not a shared
 * cross-app command/query contract.
 */

export const SETTLEMENT_STATEMENT_DIRECTION = "issuer_pays_drts" as const;
export type SettlementStatementDirection =
  typeof SETTLEMENT_STATEMENT_DIRECTION;

export const SETTLEMENT_STATEMENT_CHANNEL_KEY = "partner_airport" as const;

export type SettlementStatementStatus = "published" | "paid" | "due";

export interface SettlementStatementLine {
  /** Per-trip identifier (order id of the completed card-benefit trip). */
  tripId: string;
  settlementId: string;
  completedAt: string;
  driverId: string;
  partnerEntrySlug: string | null;
  /** Total trip fare (driver gross earning); payout stays whole. */
  fare: MoneyAmount;
  /** Sponsor-funded (benefit) portion the issuer reimburses DRTS for. */
  subsidisedAmount: MoneyAmount;
  /** Cardholder out-of-pocket portion. */
  paidAmount: MoneyAmount;
  /** Card-benefit program reference — present on every line. */
  benefitReference: string;
  /** Issuer authorization reference — present on every line. */
  issuerAuthorizationRef: string;
  /** Masked cardholder reference (PII; NFR-1). */
  cardholderRefMasked: string;
  eligibilityVerificationId: string | null;
}

export interface SettlementStatementTotals {
  tripCount: number;
  fareTotal: MoneyAmount;
  /** Sum of subsidised amounts = amount the issuer pays DRTS. */
  subsidisedTotal: MoneyAmount;
  paidTotal: MoneyAmount;
  /** Issuer-payable total in the `issuer_pays_drts` direction. */
  issuerPayable: MoneyAmount;
}

export interface SettlementStatementArtifactRef {
  artifactId: string;
  kind: "settlement_statement";
  /** Stable manifest hash over the canonical statement lines. */
  manifestHash: string;
}

export interface SettlementStatementRecord {
  statementId: string;
  tenantId: string;
  /** Statement period in `YYYY-MM` form. */
  period: string;
  periodStart: string;
  periodEnd: string;
  channelKey: typeof SETTLEMENT_STATEMENT_CHANNEL_KEY;
  /** Money direction — always `issuer_pays_drts` for card-benefit. */
  direction: SettlementStatementDirection;
  currency: string;
  status: SettlementStatementStatus;
  lines: SettlementStatementLine[];
  totals: SettlementStatementTotals;
  artifactRef: SettlementStatementArtifactRef;
  generatedAt: string;
}
