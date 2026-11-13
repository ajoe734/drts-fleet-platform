import type {
  CreateTenantBookingCommand,
  PartnerBookingDetails,
} from "@drts/contracts";
import {
  getPartnerGeoHealth,
  searchPartnerGeo,
  resolvePartnerGeo,
  reversePartnerGeo,
  routePartnerGeo,
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
  buildPartnerTravelBookingDetails,
  getPartnerBookingFieldErrors,
  getPartnerMapSubmitGate,
  type PartnerAirportMapRequest,
  type PartnerAirportMapResult,
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
              ...buildPartnerTravelBookingDetails(draft),
              ...(input.submission.routeStops?.length
                ? {
                    routeStops: input.submission.routeStops.filter(
                      (stop): stop is NonNullable<typeof stop> => stop !== null,
                    ),
                  }
                : {}),
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
    const guideContact =
      subtype === "travel_agency_transfer"
        ? { name: draft.guideName.trim(), phone: draft.guidePhone.trim() }
        : null;
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
      ...(guideContact ? { onsiteContact: guideContact } : {}),
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
        : subtype === "travel_agency_transfer" && draft.flightNo.trim()
          ? { flightNo: draft.flightNo.trim() }
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
    if (
      guideContact &&
      (booking.onsiteContact?.name !== guideContact.name ||
        booking.onsiteContact?.phone !== guideContact.phone ||
        order.onsiteContact?.name !== guideContact.name ||
        order.onsiteContact?.phone !== guideContact.phone)
    ) {
      throw new PartnerAuthorityError(
        502,
        "PARTNER_BOOKING_READBACK_MISMATCH",
        "Guide contact did not match the created booking.",
      );
    }
    if (partnerBookingDetails) {
      const expected = partnerBookingDetails as unknown as Record<
        string,
        unknown
      >;
      const sameValue = (value: unknown, actual: unknown): boolean => {
        if (Array.isArray(value))
          return (
            Array.isArray(actual) &&
            value.length === actual.length &&
            value.every((item, index) => sameValue(item, actual[index]))
          );
        if (value && typeof value === "object")
          return (
            !!actual &&
            typeof actual === "object" &&
            Object.entries(value).every(([key, item]) =>
              sameValue(item, (actual as Record<string, unknown>)[key]),
            )
          );
        return value === actual;
      };
      const sameDetails = (actual: unknown) => {
        if (!actual || typeof actual !== "object") return false;
        const record = actual as Record<string, unknown>;
        return Object.entries(expected).every(([field, value]) =>
          sameValue(value, record[field]),
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
        ...(subtype === "travel_agency_transfer" && booking.flightNo
          ? { flightNo: booking.flightNo }
          : {}),
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

type MapDependencies = Pick<
  typeof import("./api-client"),
  | "getPartnerRouteContext"
  | "createPartnerIngressHandoff"
  | "getPartnerGeoHealth"
  | "searchPartnerGeo"
  | "resolvePartnerGeo"
  | "reversePartnerGeo"
  | "routePartnerGeo"
>;
const mapDependencies: MapDependencies = {
  getPartnerRouteContext,
  createPartnerIngressHandoff,
  getPartnerGeoHealth,
  searchPartnerGeo,
  resolvePartnerGeo,
  reversePartnerGeo,
  routePartnerGeo,
};

/** Normal per-request ingress, just like the existing booking/eligibility actions. */
export async function readPartnerAirportMap(
  input: {
    tenantSlug: string;
    partnerUserRef: string | null;
    request: PartnerAirportMapRequest;
    locale: Locale;
  },
  dependencies: MapDependencies = mapDependencies,
): Promise<PartnerAirportMapResult> {
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
    if (entry.businessDispatchSubtype !== "credit_card_airport_transfer")
      throw new PartnerAuthorityError(
        400,
        "PARTNER_ENTRY_SUBTYPE_MISMATCH",
        "This map belongs to an airport program.",
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
    const request = input.request;
    switch (request.operation) {
      case "health": {
        const health = await dependencies.getPartnerGeoHealth(session);
        return {
          ok: true,
          data: {
            provider: health.provider,
            mode: health.mode,
            status: health.status,
            failClosed: health.failClosed,
            mockAllowed: health.mockAllowed,
          },
        };
      }
      case "search":
        return {
          ok: true,
          data: await dependencies.searchPartnerGeo(session, {
            q: request.query.q,
            ...(request.query.limit !== undefined
              ? { limit: request.query.limit }
              : {}),
            ...(request.query.near
              ? {
                  near: {
                    lat: request.query.near.lat,
                    lng: request.query.near.lng,
                  },
                }
              : {}),
            locale: input.locale,
            surface: "partner_booking",
            requestedByActorId: session.identity.actorId,
          }),
        };
      case "resolve":
        return {
          ok: true,
          data: await dependencies.resolvePartnerGeo(session, {
            addressText: request.command.addressText,
            ...(request.command.candidateId
              ? { candidateId: request.command.candidateId }
              : {}),
            ...(request.command.providerCandidateId
              ? { providerCandidateId: request.command.providerCandidateId }
              : {}),
            ...(request.command.placeId
              ? { placeId: request.command.placeId }
              : {}),
            ...(request.command.selectedPoint
              ? {
                  selectedPoint: {
                    lat: request.command.selectedPoint.lat,
                    lng: request.command.selectedPoint.lng,
                  },
                }
              : {}),
            ...(request.command.manualOverrideReason
              ? { manualOverrideReason: request.command.manualOverrideReason }
              : {}),
            surface: "partner_booking",
            selectedByActorId: session.identity.actorId,
          }),
        };
      case "reverse":
        return {
          ok: true,
          data: await dependencies.reversePartnerGeo(session, {
            location: {
              lat: request.command.location.lat,
              lng: request.command.location.lng,
            },
            locale: input.locale,
            surface: "partner_booking",
            requestedByActorId: session.identity.actorId,
          }),
        };
      case "route": {
        if (request.direction !== "pickup" && request.direction !== "dropoff")
          throw new PartnerAuthorityError(
            400,
            "PARTNER_BOOKING_INVALID",
            "Choose an airport direction.",
          );
        const route = await dependencies.routePartnerGeo(session, {
          origin: { lat: request.origin.lat, lng: request.origin.lng },
          destination: {
            lat: request.destination.lat,
            lng: request.destination.lng,
          },
          travelMode: "drive",
          locale: input.locale,
          requestedByActorId: session.identity.actorId,
          airportTransfer: { direction: request.direction },
        });
        if (!route.serviceAreaEvaluation)
          throw new PartnerAuthorityError(
            503,
            "PARTNER_MAP_PREVIEW_UNAVAILABLE",
            "The route result is unavailable.",
          );
        return { ok: true, data: route };
      }
    }
  } catch (error) {
    return {
      ok: false,
      errorCode:
        error instanceof PartnerAuthorityError
          ? error.code
          : "PARTNER_MAP_UNAVAILABLE",
    };
  }
}
