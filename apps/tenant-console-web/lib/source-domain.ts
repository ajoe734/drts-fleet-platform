import type { BookingRecord } from "@drts/contracts";

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

export function getSourceToneClassName(tone: SourceTone) {
  return tone === "external"
    ? "source-pill source-pill-external"
    : "source-pill";
}
