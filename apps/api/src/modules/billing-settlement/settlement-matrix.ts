import type { SettlementMatrixRecord } from "@drts/contracts";

const SETTLEMENT_MATRIX: readonly SettlementMatrixRecord[] = Object.freeze([
  Object.freeze({
    channelKey: "tenant_enterprise",
    channelLabel: "Tenant enterprise dispatch",
    orderDomain: "owned" as const,
    orderSources: ["portal", "api"],
    payerType: "tenant",
    sponsorType: "tenant contract owner",
    invoiceOwner: "platform finance for tenant billing",
    invoicePath: "tenant invoice + cost-center export",
    receiptOwner: "tenant / partner channel",
    driverPayoutAuthority: "platform settlement engine",
    discountFundingSource:
      "tenant-approved contract pricing; no external sponsor subsidy",
    reimbursementRule:
      "No reimbursement batch unless a platform-funded discount is explicitly recorded on the trip.",
    reconciliationPath: "tenant invoice review + monthly trip report",
    reportingArtifacts: ["monthly_trip_report", "revenue_summary"],
    localLedgerMode: "full_service" as const,
    notes:
      "Owned enterprise reservations stay on the platform ledger and reconcile through tenant billing periods.",
  }),
  Object.freeze({
    channelKey: "partner_airport",
    channelLabel: "Partner / card-benefit airport transfer",
    orderDomain: "owned" as const,
    orderSources: ["portal", "api"],
    payerType: "partner program / card-benefit sponsor",
    sponsorType: "partner bank / issuer benefit program",
    invoiceOwner: "platform finance with partner statement owner",
    invoicePath: "partner statement + tenant invoice cross-check",
    receiptOwner: "credit-card / service platform / partner channel",
    driverPayoutAuthority: "platform settlement engine",
    discountFundingSource:
      "sponsor-funded benefit subsidy with issuer and eligibility trace",
    reimbursementRule:
      "Platform-funded discounts create reimbursement batches so driver payout stays whole while sponsor settlement closes later.",
    reconciliationPath: "partner revenue summary + benefit reference audit",
    reportingArtifacts: ["revenue_summary", "monthly_trip_report"],
    localLedgerMode: "full_service" as const,
    notes:
      "Partner provenance, eligibility, and issuer references must survive settlement and reporting end to end.",
  }),
  Object.freeze({
    channelKey: "phone_dispatch",
    channelLabel: "Phone / operator-created owned order",
    orderDomain: "owned" as const,
    orderSources: ["phone"],
    payerType: "passenger or backoffice collection",
    sponsorType: "none by default; ops backoffice if manual takeover applies",
    invoiceOwner: "platform backoffice finance",
    invoicePath: "operator lookup / admin download only",
    receiptOwner: "backoffice / tenant portal",
    driverPayoutAuthority: "platform settlement engine",
    discountFundingSource:
      "manual fare adjustments or waivers require named backoffice approval",
    reimbursementRule:
      "Driver reimbursement only applies when finance records a platform-funded concession for the call-created order.",
    reconciliationPath: "dispatch recording index + ops trace review",
    reportingArtifacts: ["dispatch_recording_index", "revenue_summary"],
    localLedgerMode: "full_service" as const,
    notes:
      "Phone-origin orders require call and recording traceability even when no passenger receipt center exists.",
  }),
  Object.freeze({
    channelKey: "forwarded_shadow",
    channelLabel: "Forwarded external-platform mirror",
    orderDomain: "forwarded" as const,
    orderSources: ["external_platform"],
    payerType: "external platform",
    sponsorType: "external platform / forwarder contract",
    invoiceOwner: "external platform settlement owner",
    invoicePath: "external-platform settlement file / API",
    receiptOwner: "external platform",
    driverPayoutAuthority: "external platform payout program",
    discountFundingSource:
      "external-platform promotions and compensation stay off-platform",
    reimbursementRule:
      "No local reimbursement batch; the platform stores shadow payout context only for audit and dispute handling.",
    reconciliationPath:
      "forwarder reconciliation job + shadow-ledger exception handling",
    reportingArtifacts: ["revenue_summary", "six_month_statistics"],
    localLedgerMode: "shadow_only" as const,
    notes:
      "The platform keeps finance, driver-payout, and receipt ownership at the external source and only mirrors audit-safe settlement context locally.",
  }),
]);

export function buildSettlementMatrix(): SettlementMatrixRecord[] {
  return SETTLEMENT_MATRIX.map((row) => ({
    ...row,
    orderSources: [...row.orderSources],
    reportingArtifacts: [...row.reportingArtifacts],
  }));
}

export function settlementChannelKeyForTrip(input: {
  orderSource?: string | null;
  businessDispatchSubtype?: string | null;
  partnerId?: string | null;
}) {
  if (input.orderSource === "external_platform") {
    return "forwarded_shadow";
  }

  if (input.orderSource === "phone") {
    return "phone_dispatch";
  }

  if (
    input.businessDispatchSubtype === "credit_card_airport_transfer" ||
    input.partnerId
  ) {
    return "partner_airport";
  }

  return "tenant_enterprise";
}
