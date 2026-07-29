import type {
  BookingRecord,
  CreateTenantBookingCommand,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";
import type {
  AirportTransferBookingResult,
  AirportTransferBookingSubmission,
} from "@/components/airport-transfer-site";
import {
  createPartnerBooking,
  createPartnerIngressHandoff,
  createPartnerSessionFromIngressHandoff,
  getPartnerRouteContext,
  PartnerAuthorityError,
  verifyPartnerEligibility,
} from "@/lib/api-client";
import { t, type Locale } from "@/lib/translations";

type EmbedBookingDependencies = {
  createPartnerBooking: typeof createPartnerBooking;
  createPartnerIngressHandoff: typeof createPartnerIngressHandoff;
  getPartnerRouteContext: typeof getPartnerRouteContext;
  verifyPartnerEligibility: typeof verifyPartnerEligibility;
};

const defaultDependencies: EmbedBookingDependencies = {
  createPartnerBooking,
  createPartnerIngressHandoff,
  getPartnerRouteContext,
  verifyPartnerEligibility,
};

export type AirportBookingOperationalError = {
  errorCode: string;
  retryable: boolean;
  status: number;
};

const SAFE_OPERATIONAL_ERROR_CODE = /^[A-Z0-9][A-Z0-9_]{1,63}$/;

export function toAirportBookingOperationalError(
  error: unknown,
): AirportBookingOperationalError {
  const authorityError = error instanceof PartnerAuthorityError ? error : null;
  const authorityCode = authorityError?.code;

  return {
    errorCode:
      authorityCode && SAFE_OPERATIONAL_ERROR_CODE.test(authorityCode)
        ? authorityCode
        : "PARTNER_BOOKING_SUBMIT_FAILED",
    retryable: authorityError?.retryable ?? false,
    status: authorityError?.status ?? 500,
  };
}

type SubmitEmbeddedAirportBookingInput = {
  tenantSlug: string;
  partnerEntry?: PartnerChannelEntryRecord | null;
  partnerUserRef: string | null;
  referenceToken: string | null;
  cardLast4: string | null;
  cardholderName: string | null;
  benefitReference: string | null;
  flightNo: string | null;
  existingEligibilityVerificationId: string | null;
  locale: Locale;
  submission: AirportTransferBookingSubmission;
};

function hasValidDateTime(value: string | null | undefined) {
  return (
    typeof value === "string" && Number.isFinite(new Date(value).getTime())
  );
}

function buildReservationWindow(submission: AirportTransferBookingSubmission): {
  reservationWindowStart: string;
  reservationWindowEnd: string;
} {
  if (
    hasValidDateTime(submission.reservationWindowStart) &&
    hasValidDateTime(submission.reservationWindowEnd)
  ) {
    const reservationWindowStart = submission.reservationWindowStart!;
    const reservationWindowEnd = submission.reservationWindowEnd!;

    return {
      reservationWindowStart,
      reservationWindowEnd,
    };
  }

  const [year, month, day] = submission.date.split("-").map(Number);
  const [hour, minute] = submission.time.split(":").map(Number);
  const start = new Date(
    year || 1970,
    (month || 1) - 1,
    day || 1,
    hour || 0,
    minute || 0,
    0,
    0,
  );
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    reservationWindowStart: start.toISOString(),
    reservationWindowEnd: end.toISOString(),
  };
}

export function buildAirportTransferBookingCommand(
  entry: PartnerChannelEntryRecord,
  submission: AirportTransferBookingSubmission,
  benefitReference: string | null,
  eligibilityVerificationId: string | null,
): CreateTenantBookingCommand {
  const { reservationWindowStart, reservationWindowEnd } =
    buildReservationWindow(submission);
  const terminalAddress = `${submission.terminal} ${submission.direction === "out" ? "出發" : "抵達"}接送區`;
  const pickupAddress =
    submission.direction === "out" ? submission.address : terminalAddress;
  const dropoffAddress =
    submission.direction === "out" ? terminalAddress : submission.address;

  return {
    businessDispatchSubtype: "credit_card_airport_transfer",
    partnerEntrySlug: entry.entrySlug,
    ...(eligibilityVerificationId ? { eligibilityVerificationId } : {}),
    pickup: {
      address: pickupAddress,
      surface: "partner_booking",
    },
    dropoff: {
      address: dropoffAddress,
      surface: "partner_booking",
    },
    reservationWindowStart,
    reservationWindowEnd,
    passenger: {
      name: submission.passengerName,
      phone: submission.phone,
    },
    ...(benefitReference ? { benefitReference } : {}),
    vehiclePreference: submission.vehicleId,
    direction: submission.direction === "out" ? "dropoff" : "pickup",
    flightNo: submission.flightNo,
    terminal: submission.terminal,
    luggageCount: submission.luggageCount,
    notes: submission.vehicleName,
  };
}

function buildResult(params: {
  booking: BookingRecord;
  confirmation: BookingRecord;
  receipt: OwnedOrderRecord;
  eligibility: PartnerEligibilityVerificationRecord | null;
}): AirportTransferBookingResult {
  return {
    bookingId: params.booking.bookingId,
    orderId: params.booking.orderId,
    eligibilityVerificationId:
      params.eligibility?.eligibilityVerificationId ??
      params.booking.eligibilityVerificationId ??
      null,
    confirmation: params.confirmation,
    receipt: params.receipt,
  };
}

export async function submitEmbeddedAirportBooking(
  input: SubmitEmbeddedAirportBookingInput,
  dependencies: EmbedBookingDependencies = defaultDependencies,
): Promise<AirportTransferBookingResult> {
  if (!input.partnerUserRef) {
    throw new Error(
      t("airport.embed.error.missingCredentials", undefined, input.locale),
    );
  }

  let entry = input.partnerEntry;
  if (!entry) {
    entry = (await dependencies.getPartnerRouteContext(input.tenantSlug)).entry;
  }

  if (!entry || entry.status !== "active" || !entry.activeFlag) {
    throw new Error(
      t("airport.embed.error.programUnavailable", undefined, input.locale),
    );
  }

  const handoff = await dependencies.createPartnerIngressHandoff({
    entrySlug: entry.entrySlug,
    partnerUserRef: input.partnerUserRef,
  });

  const session = createPartnerSessionFromIngressHandoff(handoff, entry);

  let eligibility: PartnerEligibilityVerificationRecord | null = null;
  let eligibilityVerificationId = input.existingEligibilityVerificationId;

  if (!eligibilityVerificationId && entry.eligibilityMode !== "none") {
    const eligibilityCommand = {
      ...(input.referenceToken ? { referenceToken: input.referenceToken } : {}),
      ...(input.cardLast4 ? { cardLast4: input.cardLast4 } : {}),
      ...(input.cardholderName ? { cardholderName: input.cardholderName } : {}),
      ...(input.benefitReference
        ? { benefitReference: input.benefitReference }
        : {}),
      ...(input.submission.flightNo || input.flightNo
        ? { flightNo: input.submission.flightNo || input.flightNo || "" }
        : {}),
    };
    eligibility = await dependencies.verifyPartnerEligibility(session, {
      ...eligibilityCommand,
    });
    eligibilityVerificationId = eligibility.eligibilityVerificationId;

    if (eligibility.verificationStatus !== "eligible") {
      throw new Error(
        eligibility.verificationStatus === "manual_review"
          ? t("airport.embed.error.manualReview", undefined, input.locale)
          : t("airport.embed.error.eligibilityFailed", undefined, input.locale),
      );
    }
  }

  const creation = await dependencies.createPartnerBooking(
    session,
    buildAirportTransferBookingCommand(
      entry,
      {
        ...input.submission,
        flightNo: input.submission.flightNo || input.flightNo || "",
      },
      input.benefitReference,
      eligibilityVerificationId,
    ),
  );

  return buildResult({
    booking: creation.booking,
    confirmation: creation.booking,
    receipt: creation.order,
    eligibility,
  });
}
