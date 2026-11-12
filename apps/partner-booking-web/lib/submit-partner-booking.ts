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
  type PartnerEligibilitySubmission,
  type PartnerEligibilityActionResult,
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

/** Uses normal API-issued ingress/session and the existing eligibility authority. */
export async function verifyPartnerBookingEligibility(
  input: {
    tenantSlug: string;
    partnerUserRef: string | null;
    referenceToken: string | null;
    submission: PartnerEligibilitySubmission;
    locale: Locale;
  },
  dependencies: Pick<
    Dependencies,
    | "getPartnerRouteContext"
    | "createPartnerIngressHandoff"
    | "verifyPartnerEligibility"
  > = defaults,
): Promise<PartnerEligibilityActionResult> {
  try {
    const { entry } = await dependencies.getPartnerRouteContext(
      input.tenantSlug,
    );
    if (!entry || entry.status !== "active" || !entry.activeFlag)
      throw new PartnerAuthorityError(
        409,
        "PARTNER_ENTRY_INACTIVE",
        "Partner entry is unavailable.",
      );
    if (!input.partnerUserRef?.trim())
      throw new PartnerAuthorityError(
        400,
        "PARTNER_USER_REF_REQUIRED",
        "Partner ingress identity is missing.",
      );
    const handoff = await dependencies.createPartnerIngressHandoff({
      entrySlug: entry.entrySlug,
      partnerUserRef: input.partnerUserRef,
    });
    const session = createPartnerSessionFromIngressHandoff(handoff, entry);
    const referenceToken =
      input.referenceToken?.trim() || input.submission.referenceToken?.trim();
    const verification = await dependencies.verifyPartnerEligibility(session, {
      ...(referenceToken ? { referenceToken } : {}),
      ...(input.submission.cardLast4?.trim()
        ? { cardLast4: input.submission.cardLast4.trim() }
        : {}),
      ...(input.submission.cardholderName?.trim()
        ? { cardholderName: input.submission.cardholderName.trim() }
        : {}),
      ...(input.submission.benefitReference?.trim()
        ? { benefitReference: input.submission.benefitReference.trim() }
        : {}),
      ...(input.submission.flightNo?.trim()
        ? { flightNo: input.submission.flightNo.trim() }
        : {}),
    });
    return {
      ok: true,
      verification: {
        eligibilityVerificationId: verification.eligibilityVerificationId,
        verificationStatus: verification.verificationStatus,
        verificationReasonCode: verification.verificationReasonCode,
      },
    };
  } catch (error) {
    const { errorCode } = toAirportBookingOperationalError(error);
    return {
      ok: false,
      errorCode,
      errorMessage: t("eligibility.verify.failed", undefined, input.locale),
    };
  }
}

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
      subtype !== "credit_card_airport_transfer" &&
      subtype !== "travel_agency_transfer" &&
      subtype !== "insurance_replacement_vehicle"
    ) {
      throw new PartnerAuthorityError(
        400,
        "PARTNER_ENTRY_SUBTYPE_MISMATCH",
        "This form requires an airport, travel or insurance program.",
      );
    }

    const { draft } = input.submission;
    const mapGate = getPartnerMapSubmitGate({ ...input.submission, draft });
    if (
      Object.keys(getPartnerBookingFieldErrors({ draft, subtype })).length ||
      mapGate.blocking ||
      !input.submission.idempotencyKey.trim() ||
      (subtype === "credit_card_airport_transfer" &&
        draft.direction !== "pickup" &&
        draft.direction !== "dropoff")
    ) {
      throw new PartnerAuthorityError(
        400,
        "PARTNER_BOOKING_INVALID",
        "Complete the booking fields and locations.",
      );
    }

    if (
      subtype === "credit_card_airport_transfer" &&
      entry.eligibilityMode !== "none" &&
      !eligibilityVerificationId
    ) {
      throw new PartnerAuthorityError(
        400,
        "ELIGIBILITY_VERIFICATION_REQUIRED",
        "This airport program requires a verified eligibility record before booking.",
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

    const partnerBookingDetails: PartnerBookingDetails | undefined =
      subtype === "credit_card_airport_transfer"
        ? undefined
        : subtype === "travel_agency_transfer"
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
      ...(partnerBookingDetails ? { partnerBookingDetails } : {}),
      ...(subtype === "credit_card_airport_transfer"
        ? {
            direction: draft.direction as "pickup" | "dropoff",
            flightNo: draft.flightNo.trim(),
            terminal: draft.terminal.trim(),
          }
        : {}),
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
      (subtype !== "credit_card_airport_transfer" &&
        (!booking.partnerBookingDetails || !order.partnerBookingDetails)) ||
      (subtype === "credit_card_airport_transfer" &&
        (booking.businessDispatchSubtype !== subtype ||
          order.businessDispatchSubtype !== subtype ||
          booking.direction !== command.direction ||
          order.direction !== command.direction ||
          booking.flightNo !== command.flightNo ||
          order.flightNo !== command.flightNo ||
          booking.terminal !== command.terminal ||
          order.terminal !== command.terminal))
    ) {
      throw new PartnerAuthorityError(
        502,
        "PARTNER_BOOKING_READBACK_MISMATCH",
        "Booking readback did not match the created order.",
      );
    }
    if (partnerBookingDetails) {
      const expected = partnerBookingDetails as unknown as Record<
        string,
        unknown
      >;
      const sameDetails = (actual: unknown) => {
        if (!actual || typeof actual !== "object") return false;
        const record = actual as Record<string, unknown>;
        return Object.entries(expected).every(([field, value]) =>
          Array.isArray(value)
            ? Array.isArray(record[field]) &&
              value.length === (record[field] as unknown[]).length &&
              value.every(
                (item, index) => item === (record[field] as unknown[])[index],
              )
            : record[field] === value,
        );
      };
      if (
        !sameDetails(booking.partnerBookingDetails) ||
        !sameDetails(order.partnerBookingDetails)
      )
        throw new PartnerAuthorityError(
          502,
          "PARTNER_BOOKING_READBACK_MISMATCH",
          "Program details did not match the created booking.",
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
        ...(partnerBookingDetails
          ? { partnerBookingDetails: booking.partnerBookingDetails! }
          : {
              businessDispatchSubtype: booking.businessDispatchSubtype,
              direction: booking.direction,
              flightNo: booking.flightNo,
              terminal: booking.terminal,
            }),
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
