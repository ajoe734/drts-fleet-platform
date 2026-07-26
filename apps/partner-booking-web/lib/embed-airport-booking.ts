import type {
  BookingRecord,
  CreateTenantBookingCommand,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
  PartnerIngressHandoffSession,
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
  getPartnerConfirmation,
  getPartnerReceipt,
  getPartnerRouteContext,
  verifyPartnerEligibility,
} from "@/lib/api-client";

type EmbedBookingDependencies = {
  createPartnerBooking: typeof createPartnerBooking;
  createPartnerIngressHandoff: typeof createPartnerIngressHandoff;
  getPartnerConfirmation: typeof getPartnerConfirmation;
  getPartnerReceipt: typeof getPartnerReceipt;
  getPartnerRouteContext: typeof getPartnerRouteContext;
  verifyPartnerEligibility: typeof verifyPartnerEligibility;
};

const defaultDependencies: EmbedBookingDependencies = {
  createPartnerBooking,
  createPartnerIngressHandoff,
  getPartnerConfirmation,
  getPartnerReceipt,
  getPartnerRouteContext,
  verifyPartnerEligibility,
};

function buildFallbackPartnerEntry(
  tenantSlug: string,
  handoff: PartnerIngressHandoffSession,
): PartnerChannelEntryRecord {
  const entrySlug = handoff.partnerEntrySlug || tenantSlug;

  return {
    partnerId: handoff.identity.partnerId ?? `partner-${entrySlug}`,
    partnerCode: entrySlug.toUpperCase(),
    partnerType: "bank",
    programId:
      handoff.identity.partnerProgramId ?? `program-${entrySlug}-embed`,
    programCode: entrySlug.toUpperCase(),
    tenantId: handoff.identity.tenantId ?? `tenant-${entrySlug}`,
    bankCode: entrySlug.toUpperCase(),
    entrySlug,
    displayName: `${entrySlug.toUpperCase()} Embedded Booking`,
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    entryHost: null,
    entryPath: null,
    themeAccent: null,
    brandingMetadata: null,
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "",
    updatedAt: "",
    auditMetadata: {
      source: "partner_embed_fallback",
      requestId: null,
      createdBy: "partner-booking-web",
      updatedBy: "partner-booking-web",
    },
  };
}

type SubmitEmbeddedAirportBookingInput = {
  tenantSlug: string;
  partnerEntry?: PartnerChannelEntryRecord | null;
  apiKey: string | null;
  partnerUserRef: string | null;
  referenceToken: string | null;
  cardLast4: string | null;
  cardholderName: string | null;
  benefitReference: string | null;
  flightNo: string | null;
  existingEligibilityVerificationId: string | null;
  submission: AirportTransferBookingSubmission;
};

function buildReservationWindow(date: string, time: string) {
  const start = new Date(`${date}T${time}:00+08:00`);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    reservationWindowStart: start.toISOString(),
    reservationWindowEnd: end.toISOString(),
  };
}

export function buildAirportTransferBookingCommand(
  entry: PartnerChannelEntryRecord,
  submission: AirportTransferBookingSubmission,
  eligibilityVerificationId: string | null,
): CreateTenantBookingCommand {
  const { reservationWindowStart, reservationWindowEnd } =
    buildReservationWindow(submission.date, submission.time);
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
    benefitReference: submission.vehicleId,
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
  if (!input.apiKey || !input.partnerUserRef) {
    throw new Error(
      "Embedded booking is missing handoff credentials. Reopen from the banking app.",
    );
  }

  let entry = input.partnerEntry;
  if (!entry) {
    entry = (await dependencies.getPartnerRouteContext(input.tenantSlug)).entry;
  }

  const handoff = await dependencies.createPartnerIngressHandoff({
    entrySlug: entry?.entrySlug ?? input.tenantSlug,
    apiKey: input.apiKey,
    partnerUserRef: input.partnerUserRef,
  });
  entry ??= buildFallbackPartnerEntry(input.tenantSlug, handoff);
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
          ? "Eligibility is under manual review. Booking cannot be created yet."
          : "Eligibility verification failed. Booking was not created.",
      );
    }
  }

  const booking = await dependencies.createPartnerBooking(
    session,
    buildAirportTransferBookingCommand(
      entry,
      {
        ...input.submission,
        flightNo: input.submission.flightNo || input.flightNo || "",
      },
      eligibilityVerificationId,
    ),
  );
  const confirmation = await dependencies.getPartnerConfirmation(
    session,
    booking.bookingId,
  );
  const receipt = await dependencies.getPartnerReceipt(
    session,
    booking.orderId,
  );

  return buildResult({
    booking,
    confirmation,
    receipt,
    eligibility,
  });
}
