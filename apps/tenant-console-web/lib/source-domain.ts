import type { BookingRecord } from "@drts/contracts";

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

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
