import type {
  CreateTenantBookingCommand,
  PartnerBookingDetails,
} from "@drts/contracts";
import {
  createPartnerBooking,
  createPartnerIngressHandoff,
  createPartnerSessionFromIngressHandoff,
  getPartnerConfirmation,
  getPartnerRouteContext,
  getPartnerTrip,
  PartnerAuthorityError,
  verifyPartnerEligibility,
} from "./api-client";
import {
  getPartnerBookingFieldErrors,
  getPartnerMapSubmitGate,
  type PartnerBookingActionResult,
  type PartnerBookingSubmission,
} from "./partner-booking-form";
import { toAirportBookingOperationalError } from "./embed-airport-booking";
import { t, type Locale } from "./translations";

type Dependencies = Pick<
  typeof import("./api-client"),
  | "createPartnerBooking"
  | "createPartnerIngressHandoff"
  | "getPartnerConfirmation"
  | "getPartnerRouteContext"
  | "getPartnerTrip"
  | "verifyPartnerEligibility"
>;

const defaults: Dependencies = {
  createPartnerBooking,
  createPartnerIngressHandoff,
  getPartnerConfirmation,
  getPartnerRouteContext,
  getPartnerTrip,
  verifyPartnerEligibility,
};

/** Uses the same caller-supplied partnerUserRef ingress as the airport ServerAction. */
export async function submitPartnerProgramBooking(
  input: {
    tenantSlug: string;
    partnerUserRef: string | null;
    referenceToken: string | null;
    eligibilityVerificationId: string | null;
    submission: PartnerBookingSubmission;
    locale: Locale;
  },
  dependencies: Dependencies = defaults,
): Promise<PartnerBookingActionResult> {
  let eligibilityVerificationId =
    input.submission.eligibilityVerificationId ??
    input.eligibilityVerificationId;
  try {
    const { entry } = await dependencies.getPartnerRouteContext(
      input.tenantSlug,
    );
    if (!entry || entry.status !== "active" || !entry.activeFlag) {
      throw new PartnerAuthorityError(
        409,
        "PARTNER_ENTRY_INACTIVE",
        "Partner entry is unavailable.",
      );
    }
    if (!input.partnerUserRef?.trim()) {
      throw new PartnerAuthorityError(
        400,
        "PARTNER_USER_REF_REQUIRED",
        "Partner ingress identity is missing.",
      );
    }
    const subtype = entry.businessDispatchSubtype;
    if (
      subtype !== "travel_agency_transfer" &&
      subtype !== "insurance_replacement_vehicle"
    ) {
      throw new PartnerAuthorityError(
        400,
        "PARTNER_ENTRY_SUBTYPE_MISMATCH",
        "This form requires a travel or insurance program.",
      );
    }

    const { draft } = input.submission;
    const mapGate = getPartnerMapSubmitGate({ ...input.submission, draft });
    if (
      Object.keys(getPartnerBookingFieldErrors({ draft, subtype })).length ||
      mapGate.blocking ||
      !input.submission.idempotencyKey.trim()
    ) {
      throw new PartnerAuthorityError(
        400,
        "PARTNER_BOOKING_INVALID",
        "Complete the booking fields and locations.",
      );
    }

    const handoff = await dependencies.createPartnerIngressHandoff({
      entrySlug: entry.entrySlug,
      partnerUserRef: input.partnerUserRef,
    });
    const session = createPartnerSessionFromIngressHandoff(handoff, entry);
    if (entry.eligibilityMode !== "none" && !eligibilityVerificationId) {
      const eligibility = await dependencies.verifyPartnerEligibility(session, {
        ...(input.referenceToken
          ? { referenceToken: input.referenceToken }
          : {}),
      });
      if (eligibility.verificationStatus !== "eligible") {
        throw new PartnerAuthorityError(
          409,
          eligibility.verificationStatus === "manual_review"
            ? "ELIGIBILITY_MANUAL_REVIEW"
            : "ELIGIBILITY_NOT_APPROVED",
          "Eligibility must be resolved before booking.",
        );
      }
      eligibilityVerificationId = eligibility.eligibilityVerificationId;
    }

    const partnerBookingDetails: PartnerBookingDetails =
      subtype === "travel_agency_transfer"
        ? {
            subtype,
            groupCode: draft.groupCode.trim(),
            groupSize: Number(draft.groupSize),
            itineraryLink: draft.itineraryLink.trim(),
            rosterPassengers: draft.rosterPassengers
              .split(/\r?\n/)
              .map((name) => name.trim())
              .filter(Boolean),
            meetingPoint: draft.meetingPoint.trim(),
          }
        : {
            subtype,
            claimNumber: draft.claimNumber.trim(),
            policyNumber: draft.policyNumber.trim(),
            claimReference: draft.claimReference.trim(),
            claimantName: draft.claimantName.trim(),
            replacementStart: new Date(draft.replacementStart).toISOString(),
            replacementEnd: new Date(draft.replacementEnd).toISOString(),
            replacementVehicleClass: draft.replacementVehicleClass.trim(),
            caseHandler: draft.caseHandler.trim(),
          };
    const command: CreateTenantBookingCommand = {
      businessDispatchSubtype: subtype,
      partnerEntrySlug: entry.entrySlug,
      ...(eligibilityVerificationId ? { eligibilityVerificationId } : {}),
      idempotencyKey: input.submission.idempotencyKey,
      pickup: input.submission.pickup ?? {
        address: draft.pickupAddress.trim(),
        surface: "partner_booking",
      },
      dropoff: input.submission.dropoff ?? {
        address: draft.dropoffAddress.trim(),
        surface: "partner_booking",
      },
      reservationWindowStart: new Date(
        draft.reservationWindowStart,
      ).toISOString(),
      reservationWindowEnd: new Date(draft.reservationWindowEnd).toISOString(),
      passenger: {
        name: draft.passengerName.trim(),
        phone: draft.passengerPhone.trim(),
      },
      ...(draft.luggageCount.trim()
        ? { luggageCount: Number(draft.luggageCount) }
        : {}),
      notes: draft.notes.trim(),
      ...(mapGate.code === "dispatch_manual_review_required"
        ? {
            mapFallbackReview: {
              reasonCode: "dispatch_manual_review_required",
              providerAvailable: input.submission.providerState.available,
              providerDegraded: input.submission.providerState.degraded,
              providerReasonCode: input.submission.providerState.reasonCode,
            },
          }
        : {}),
      partnerBookingDetails,
    };
    const created = await dependencies.createPartnerBooking(session, command);
    // These normal GETs re-read the owned booking; a local prepared banner is not a receipt.
    const booking = await dependencies.getPartnerConfirmation(
      session,
      created.booking.bookingId,
    );
    const order = await dependencies.getPartnerTrip(
      session,
      created.order.orderId,
    );
    if (
      booking.bookingId !== created.booking.bookingId ||
      booking.orderId !== created.order.orderId ||
      order.orderId !== booking.orderId ||
      order.bookingId !== booking.bookingId ||
      !booking.partnerBookingDetails ||
      !order.partnerBookingDetails
    ) {
      throw new PartnerAuthorityError(
        502,
        "PARTNER_BOOKING_READBACK_MISMATCH",
        "Booking readback did not match the created order.",
      );
    }
    return {
      ok: true,
      confirmation: {
        bookingId: booking.bookingId,
        orderId: order.orderId,
        orderStatus: booking.orderStatus,
        reservationWindowStart: booking.reservationWindowStart,
        reservationWindowEnd: booking.reservationWindowEnd,
        partnerBookingDetails: booking.partnerBookingDetails,
        eligibilityVerificationId: booking.eligibilityVerificationId,
      },
    };
  } catch (error) {
    const { errorCode } = toAirportBookingOperationalError(error);
    return {
      ok: false,
      errorCode,
      errorMessage: t("book.create.failed", undefined, input.locale),
      ...(eligibilityVerificationId ? { eligibilityVerificationId } : {}),
    };
  }
}
