import type {
  BookingRecord,
  InvoiceLineRecord,
  ReportJobRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";

type SourceTone = "owned" | "external";

export type SourceVisibility = {
  tone: SourceTone;
  badge: string;
  summary: string;
  detail: string;
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
  if (isExternallyFulfilledBooking(booking)) {
    return {
      tone: "external",
      badge: "Externally fulfilled",
      summary: "Partner or external fulfillment path",
      detail:
        "This booking uses a partner or external fulfillment path. Tenant-facing status stays visible here without exposing adapter internals.",
    };
  }

  return {
    tone: "owned",
    badge: "DRTS operated",
    summary: "DRTS dispatch and fulfillment",
    detail:
      "This booking stays on the DRTS-operated dispatch path for routing, execution, and customer updates.",
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
      tone: "external",
      badge: "External finance authority",
      summary: "External platform settlement owner",
      detail:
        "Settlement, receipt ownership, and driver payout stay with the external platform. DRTS only mirrors audit-safe finance context locally.",
    };
  }

  if (line.partnerEntrySlug || line.partnerId || line.issuerAuthorizationRef) {
    return {
      tone: "external",
      badge: "Externally fulfilled",
      summary: "Partner-sponsored fulfillment path",
      detail:
        "This line carries partner-program provenance. Tenant billing stays visible here while partner-side sponsorship and fulfillment context remains distinct from DRTS-operated trips.",
    };
  }

  return {
    tone: "owned",
    badge: "DRTS finance authority",
    summary: "Platform-operated billing",
    detail:
      "DRTS remains the local billing and settlement authority for this line item.",
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

export function getReportJobSourceSummary(
  job: Pick<ReportJobRecord, "jobType">,
): SourceVisibility {
  if (job.jobType === "revenue_summary") {
    return {
      tone: "external",
      badge: "Owned + external finance",
      summary: "Cross-domain revenue reporting",
      detail:
        "Revenue summary reports combine DRTS-operated rows with externally fulfilled or externally settled rows when they are part of the tenant-visible finance picture.",
    };
  }

  return {
    tone: "owned",
    badge: "DRTS operated",
    summary: "Owned dispatch reporting",
    detail:
      "This report tracks DRTS-operated dispatch and service records rather than low-level external adapter behavior.",
  };
}

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
