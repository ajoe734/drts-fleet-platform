import { notFound } from "next/navigation";
import type {
  BookingRecord,
  CreateTenantBookingCommand,
  OwnedOrderRecord,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";
import {
  AirportTransferSite,
  type AirportTransferBookingResult,
  type AirportTransferBookingSubmission,
} from "@/components/airport-transfer-site";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import {
  createPartnerBooking,
  createPartnerIngressHandoff,
  getPartnerConfirmation,
  getPartnerReceipt,
  getPartnerRouteContext,
  verifyPartnerEligibility,
} from "@/lib/api-client";
import { getAirportBank } from "@/lib/airport-site-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    apiKey?: string | string[];
    benefitReference?: string | string[];
    cardLast4?: string | string[];
    cardholderName?: string | string[];
    eligibilityVerificationId?: string | string[];
    flightNo?: string | string[];
    partnerUserRef?: string | string[];
    referenceToken?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function buildReservationWindow(date: string, time: string) {
  const start = new Date(`${date}T${time}:00+08:00`);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    reservationWindowStart: start.toISOString(),
    reservationWindowEnd: end.toISOString(),
  };
}

function buildBookingCommand(
  entrySlug: string,
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
    partnerEntrySlug: entrySlug,
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

export default async function ProgramEmbedFlowPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const theme = await getTenantProgramTheme(tenantSlug);
  const bank = getAirportBank(tenantSlug);

  if (theme.kind !== "card" || !bank) {
    notFound();
  }

  const apiKey = getSingleValue(resolvedSearchParams.apiKey)?.trim() ?? null;
  const partnerUserRef =
    getSingleValue(resolvedSearchParams.partnerUserRef)?.trim() ?? null;
  const referenceToken =
    getSingleValue(resolvedSearchParams.referenceToken)?.trim() ?? null;
  const cardLast4 =
    getSingleValue(resolvedSearchParams.cardLast4)?.trim() ?? null;
  const cardholderName =
    getSingleValue(resolvedSearchParams.cardholderName)?.trim() ?? null;
  const benefitReference =
    getSingleValue(resolvedSearchParams.benefitReference)?.trim() ?? null;
  const flightNo =
    getSingleValue(resolvedSearchParams.flightNo)?.trim() ?? null;
  const existingEligibilityVerificationId =
    getSingleValue(resolvedSearchParams.eligibilityVerificationId)?.trim() ??
    null;

  async function submitBooking(
    submission: AirportTransferBookingSubmission,
  ): Promise<AirportTransferBookingResult> {
    "use server";

    const { entry } = await getPartnerRouteContext(tenantSlug);
    if (!entry) {
      throw new Error("Partner entry is unavailable for this embed route.");
    }
    if (!apiKey || !partnerUserRef) {
      throw new Error(
        "Embedded booking is missing handoff credentials. Reopen from the banking app.",
      );
    }

    const handoff = await createPartnerIngressHandoff({
      entrySlug: entry.entrySlug,
      apiKey,
      partnerUserRef,
    });
    const session = {
      accessToken: handoff.accessToken,
      expiresIn: handoff.expiresIn,
      partnerEntry: entry,
      identity: handoff.identity,
    };

    let eligibility: PartnerEligibilityVerificationRecord | null = null;
    let eligibilityVerificationId = existingEligibilityVerificationId;

    if (!eligibilityVerificationId && entry.eligibilityMode !== "none") {
      eligibility = await verifyPartnerEligibility(session, {
        ...(referenceToken ? { referenceToken } : {}),
        ...(cardLast4 ? { cardLast4 } : {}),
        ...(cardholderName ? { cardholderName } : {}),
        ...(benefitReference ? { benefitReference } : {}),
        flightNo: submission.flightNo || flightNo || undefined,
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

    const booking = await createPartnerBooking(
      session,
      buildBookingCommand(
        entry.entrySlug,
        {
          ...submission,
          flightNo: submission.flightNo || flightNo || "",
        },
        eligibilityVerificationId,
      ),
    );
    const confirmation = await getPartnerConfirmation(
      session,
      booking.bookingId,
    );
    const receipt = await getPartnerReceipt(session, booking.orderId);

    return buildResult({
      booking,
      confirmation,
      receipt,
      eligibility,
    });
  }

  return (
    <AirportTransferSite
      bank={bank}
      mode="embed"
      onSubmitBooking={submitBooking}
      embedSessionReady={Boolean(apiKey && partnerUserRef)}
      embeddedPassengerName={cardholderName ?? partnerUserRef}
      embeddedCardLast4={cardLast4}
      initialFlightNo={flightNo}
    />
  );
}
