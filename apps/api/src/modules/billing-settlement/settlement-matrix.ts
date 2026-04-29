import type { SettlementMatrixRecord } from "@drts/contracts";

const SETTLEMENT_MATRIX: readonly SettlementMatrixRecord[] = Object.freeze([
  Object.freeze({
    channelKey: "tenant_enterprise",
    channelLabel: "Tenant enterprise dispatch",
    orderDomain: "owned" as const,
    orderSources: ["portal", "api"],
    payerType: "tenant",
    invoicePath: "tenant invoice + cost-center export",
    receiptOwner: "tenant / partner channel",
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
    invoicePath: "partner statement + tenant invoice cross-check",
    receiptOwner: "credit-card / service platform / partner channel",
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
    invoicePath: "operator lookup / admin download only",
    receiptOwner: "backoffice / tenant portal",
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
    invoicePath: "external-platform settlement file / API",
    receiptOwner: "external platform",
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
