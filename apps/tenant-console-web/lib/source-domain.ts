import type {
  BookingRecord,
  InvoiceLineRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";

type SourceTone = "owned" | "external";
type SourceDomain = "owned" | "partner_external" | "forwarded_authority";

export type SourceVisibility = {
  domain: SourceDomain;
  tone: SourceTone;
  badge: string;
  summary: string;
  detail: string;
  statusBoundary: string;
  escalationHint: string;
  financeAuthority: string;
};

function isExternallyFulfilledBooking(
  booking: Pick<
    BookingRecord,
    "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
) {
  return Boolean(
    booking.partnerEntrySlug ||
    booking.partnerId ||
    booking.issuerAuthorizationRef,
  );
}

export function getBookingSourceVisibility(
  booking: Pick<
    BookingRecord,
    "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
): SourceVisibility {
  if (booking.issuerAuthorizationRef) {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: "Forwarded authority",
      summary: "External platform dispatch authority",
      detail:
        "This booking is mirrored from an external-platform authority lane. Tenant-visible status remains readable here without exposing driver assignment or adapter internals.",
      statusBoundary:
        "Tenant routes show the canonical booking and order record only. Adapter-native states such as accept_pending, confirmed_by_platform, lost_race, cancelled_by_platform, and sync_failed remain on the ops and driver authority lanes.",
      escalationHint:
        "If execution looks stale or contradictory, escalate through the ops console for reconciliation, reauth recovery, or platform-side intervention.",
      financeAuthority:
        "Quoted fare may still be visible here, but settlement, payout, and external-platform lifecycle ownership remain outside tenant authority.",
    };
  }

  if (isExternallyFulfilledBooking(booking)) {
    return {
      domain: "partner_external",
      tone: "external",
      badge: "Externally fulfilled",
      summary: "Partner or external fulfillment path",
      detail:
        "This booking uses a partner or external fulfillment path. Tenant-facing status stays visible here without exposing adapter internals.",
      statusBoundary:
        "Tenant routes keep the canonical booking record visible, while partner-side routing, sponsorship, and dispatch coordination stay outside this surface.",
      escalationHint:
        "Use partner support or ops escalation when fulfillment context needs intervention beyond tenant-safe commands.",
      financeAuthority:
        "Billing visibility can remain tenant-readable even when partner-side fulfillment or sponsorship owns part of the downstream execution.",
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: "DRTS operated",
    summary: "DRTS dispatch and fulfillment",
    detail:
      "This booking stays on the DRTS-operated dispatch path for routing, execution, and customer updates.",
    statusBoundary:
      "Tenant routes and DRTS operations share the same owned booking lifecycle, so published status changes can be acted on through tenant-safe commands when policy allows.",
    escalationHint:
      "Escalate only when the owned dispatch workflow itself needs manual intervention or policy override.",
    financeAuthority:
      "DRTS remains the local pricing, dispatch, and settlement authority for this booking unless a later finance artifact says otherwise.",
  };
}

export function getInvoiceLineSourceVisibility(
  line: Pick<
    InvoiceLineRecord,
    "channelKey" | "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
): SourceVisibility {
  if (line.channelKey === "forwarded_shadow") {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: "External finance authority",
      summary: "External platform settlement owner",
      detail:
        "Settlement, receipt ownership, and driver payout stay with the external platform. DRTS only mirrors audit-safe finance context locally.",
      statusBoundary:
        "Invoice visibility can remain tenant-safe while external-platform reconciliation states stay on ops and finance operations surfaces.",
      escalationHint:
        "Use ops or finance reconciliation lanes when a mirrored settlement row looks stale, missing, or disputed.",
      financeAuthority:
        "External platform settlement, payout, and receipt issuance remain authoritative for this line.",
    };
  }

  if (line.partnerEntrySlug || line.partnerId || line.issuerAuthorizationRef) {
    return {
      domain: "partner_external",
      tone: "external",
      badge: "Externally fulfilled",
      summary: "Partner-sponsored fulfillment path",
      detail:
        "This line carries partner-program provenance. Tenant billing stays visible here while partner-side sponsorship and fulfillment context remains distinct from DRTS-operated trips.",
      statusBoundary:
        "Tenant billing keeps the business artifact visible, while partner-side fulfillment and sponsorship state remain outside this route.",
      escalationHint:
        "Use partner support or ops escalation when the sponsorship or fulfillment side needs intervention.",
      financeAuthority:
        "Tenant billing remains readable, but downstream sponsor or partner obligations can still sit outside DRTS-owned execution.",
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: "DRTS finance authority",
    summary: "Platform-operated billing",
    detail:
      "DRTS remains the local billing and settlement authority for this line item.",
    statusBoundary:
      "Owned billing artifacts stay within the same tenant-visible lifecycle and do not depend on external-platform reconciliation.",
    escalationHint:
      "Escalate only when the owned DRTS billing or settlement workflow itself needs manual intervention.",
    financeAuthority:
      "DRTS remains the authoritative billing, settlement, and payout lane for this line item.",
  };
}

export function summarizeInvoiceSourceDomains(
  invoice: Pick<TenantInvoiceRecord, "lines">,
) {
  const counts = invoice.lines.reduce(
    (summary, line) => {
      const visibility = getInvoiceLineSourceVisibility(line);
      if (visibility.tone === "external") {
        summary.external += 1;
      } else {
        summary.owned += 1;
      }

      if (line.channelKey === "forwarded_shadow") {
        summary.externalFinanceAuthority += 1;
      }

      return summary;
    },
    { owned: 0, external: 0, externalFinanceAuthority: 0 },
  );

  if (counts.externalFinanceAuthority > 0) {
    return {
      badge: "External finance authority present",
      detail: `${counts.externalFinanceAuthority} line(s) remain under external-platform settlement ownership.`,
    };
  }

  if (counts.external > 0) {
    return {
      badge: "Mixed source domain",
      detail: `${counts.owned} DRTS-operated line(s), ${counts.external} externally fulfilled line(s).`,
    };
  }

  return {
    badge: "DRTS operated only",
    detail: `${counts.owned} DRTS-operated line(s).`,
  };
}

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
