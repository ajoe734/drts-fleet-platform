import type {
  BookingRecord,
  InvoiceLineRecord,
  ReportJobRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { type Locale, t } from "./translations";

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
  locale: Locale = "zh",
): SourceVisibility {
  if (booking.issuerAuthorizationRef) {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: t("source.booking.forwarded.badge", locale),
      summary: t("source.booking.forwarded.summary", locale),
      detail: t("source.booking.forwarded.detail", locale),
      statusBoundary: t("source.booking.forwarded.statusBoundary", locale),
      escalationHint: t("source.booking.forwarded.escalationHint", locale),
      financeAuthority: t("source.booking.forwarded.financeAuthority", locale),
    };
  }

  if (isExternallyFulfilledBooking(booking)) {
    return {
      domain: "partner_external",
      tone: "external",
      badge: t("source.booking.partner.badge", locale),
      summary: t("source.booking.partner.summary", locale),
      detail: t("source.booking.partner.detail", locale),
      statusBoundary: t("source.booking.partner.statusBoundary", locale),
      escalationHint: t("source.booking.partner.escalationHint", locale),
      financeAuthority: t("source.booking.partner.financeAuthority", locale),
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: t("source.booking.owned.badge", locale),
    summary: t("source.booking.owned.summary", locale),
    detail: t("source.booking.owned.detail", locale),
    statusBoundary: t("source.booking.owned.statusBoundary", locale),
    escalationHint: t("source.booking.owned.escalationHint", locale),
    financeAuthority: t("source.booking.owned.financeAuthority", locale),
  };
}

export function getInvoiceLineSourceVisibility(
  line: Pick<
    InvoiceLineRecord,
    "channelKey" | "partnerEntrySlug" | "partnerId" | "issuerAuthorizationRef"
  >,
  locale: Locale = "zh",
): SourceVisibility {
  if (line.channelKey === "forwarded_shadow") {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: t("source.line.forwarded.badge", locale),
      summary: t("source.line.forwarded.summary", locale),
      detail: t("source.line.forwarded.detail", locale),
      statusBoundary: t("source.line.forwarded.statusBoundary", locale),
      escalationHint: t("source.line.forwarded.escalationHint", locale),
      financeAuthority: t("source.line.forwarded.financeAuthority", locale),
    };
  }

  if (line.partnerEntrySlug || line.partnerId || line.issuerAuthorizationRef) {
    return {
      domain: "partner_external",
      tone: "external",
      badge: t("source.line.partner.badge", locale),
      summary: t("source.line.partner.summary", locale),
      detail: t("source.line.partner.detail", locale),
      statusBoundary: t("source.line.partner.statusBoundary", locale),
      escalationHint: t("source.line.partner.escalationHint", locale),
      financeAuthority: t("source.line.partner.financeAuthority", locale),
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: t("source.line.owned.badge", locale),
    summary: t("source.line.owned.summary", locale),
    detail: t("source.line.owned.detail", locale),
    statusBoundary: t("source.line.owned.statusBoundary", locale),
    escalationHint: t("source.line.owned.escalationHint", locale),
    financeAuthority: t("source.line.owned.financeAuthority", locale),
  };
}

export function summarizeInvoiceSourceDomains(
  invoice: Pick<TenantInvoiceRecord, "lines">,
  locale: Locale = "zh",
) {
  const counts = invoice.lines.reduce(
    (summary, line) => {
      const visibility = getInvoiceLineSourceVisibility(line, locale);
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
      badge: t("source.summary.externalFinance.badge", locale),
      detail: t("source.summary.externalFinance.detail", locale, {
        count: counts.externalFinanceAuthority,
      }),
    };
  }

  if (counts.external > 0) {
    return {
      badge: t("source.summary.mixed.badge", locale),
      detail: t("source.summary.mixed.detail", locale, {
        owned: counts.owned,
        external: counts.external,
      }),
    };
  }

  return {
    badge: t("source.summary.owned.badge", locale),
    detail: t("source.summary.owned.detail", locale, {
      owned: counts.owned,
    }),
  };
}

export function getReportJobSourceSummary(
  job: Pick<ReportJobRecord, "jobType">,
  locale: Locale = "zh",
): SourceVisibility {
  if (job.jobType === "revenue_summary") {
    return {
      domain: "forwarded_authority",
      tone: "external",
      badge: t("source.report.revenue.badge", locale),
      summary: t("source.report.revenue.summary", locale),
      detail: t("source.report.revenue.detail", locale),
      statusBoundary: t("source.report.revenue.statusBoundary", locale),
      escalationHint: t("source.report.revenue.escalationHint", locale),
      financeAuthority: t("source.report.revenue.financeAuthority", locale),
    };
  }

  return {
    domain: "owned",
    tone: "owned",
    badge: t("source.report.owned.badge", locale),
    summary: t("source.report.owned.summary", locale),
    detail: t("source.report.owned.detail", locale),
    statusBoundary: t("source.report.owned.statusBoundary", locale),
    escalationHint: t("source.report.owned.escalationHint", locale),
    financeAuthority: t("source.report.owned.financeAuthority", locale),
  };
}

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
