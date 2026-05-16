import { NextRequest, NextResponse } from "next/server";
import type {
  AddressPayload,
  BookingRecord,
  CreateTenantBookingCommand,
  PassengerProfile,
} from "@drts/contracts";
import { buildPartnerClient, getPartnerSession } from "@/lib/partner-session";

type BookingPayload = {
  pickup?: Partial<AddressPayload> & Record<string, unknown>;
  dropoff?: Partial<AddressPayload> & Record<string, unknown>;
  reservationWindowStart?: unknown;
  reservationWindowEnd?: unknown;
  passenger?: Partial<PassengerProfile> & Record<string, unknown>;
  benefitReference?: unknown;
  flightNo?: unknown;
  terminal?: unknown;
  notes?: unknown;
  costCenter?: unknown;
  vehiclePreference?: unknown;
  eligibilityVerificationId?: unknown;
  direction?: unknown;
};

function ensureString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${label}`);
  }
  return value.trim();
}

function ensureAddress(raw: unknown, label: string): AddressPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Missing ${label} address payload.`);
  }
  const record = raw as Record<string, unknown>;
  const address = ensureString(record.address, `${label}.address`);
  const lat =
    typeof record.lat === "number"
      ? record.lat
      : Number.parseFloat(String(record.lat ?? ""));
  const lng =
    typeof record.lng === "number"
      ? record.lng
      : Number.parseFloat(String(record.lng ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`${label} requires numeric lat and lng.`);
  }
  return { address, lat, lng };
}

function ensurePassenger(raw: unknown): PassengerProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Missing passenger payload.");
  }
  const record = raw as Record<string, unknown>;
  return {
    name: ensureString(record.name, "passenger.name"),
    phone: ensureString(record.phone, "passenger.phone"),
  };
}

export async function POST(request: NextRequest) {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Partner session expired or missing." },
      { status: 401 },
    );
  }

  if (session.partnerEntry.status !== "active") {
    return NextResponse.json(
      {
        error: `Partner entry status is "${session.partnerEntry.status}". Booking creation is blocked until the entry is reactivated by platform admin.`,
      },
      { status: 403 },
    );
  }

  let body: BookingPayload;
  try {
    body = (await request.json()) as BookingPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let command: CreateTenantBookingCommand;
  try {
    const reservationWindowStart = ensureString(
      body.reservationWindowStart,
      "reservationWindowStart",
    );
    const reservationWindowEnd = ensureString(
      body.reservationWindowEnd,
      "reservationWindowEnd",
    );
    const direction =
      body.direction === "pickup" || body.direction === "dropoff"
        ? body.direction
        : undefined;

    command = {
      businessDispatchSubtype: session.partnerEntry.businessDispatchSubtype,
      partnerEntrySlug: session.partnerEntry.entrySlug,
      pickup: ensureAddress(body.pickup, "pickup"),
      dropoff: ensureAddress(body.dropoff, "dropoff"),
      reservationWindowStart,
      reservationWindowEnd,
      passenger: ensurePassenger(body.passenger),
    };

    if (typeof body.eligibilityVerificationId === "string") {
      const trimmed = body.eligibilityVerificationId.trim();
      if (trimmed) {
        command.eligibilityVerificationId = trimmed;
      }
    }
    if (
      typeof body.benefitReference === "string" &&
      body.benefitReference.trim()
    ) {
      command.benefitReference = body.benefitReference.trim();
    }
    if (typeof body.flightNo === "string" && body.flightNo.trim()) {
      command.flightNo = body.flightNo.trim();
    }
    if (typeof body.terminal === "string" && body.terminal.trim()) {
      command.terminal = body.terminal.trim();
    }
    if (typeof body.notes === "string" && body.notes.trim()) {
      command.notes = body.notes.trim();
    }
    if (typeof body.costCenter === "string" && body.costCenter.trim()) {
      command.costCenter = body.costCenter.trim();
    }
    if (
      typeof body.vehiclePreference === "string" &&
      body.vehiclePreference.trim()
    ) {
      command.vehiclePreference = body.vehiclePreference.trim();
    }
    if (direction) {
      command.direction = direction;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid booking payload.",
      },
      { status: 400 },
    );
  }

  if (
    session.partnerEntry.eligibilityMode !== "none" &&
    !command.eligibilityVerificationId
  ) {
    return NextResponse.json(
      {
        error:
          "Eligibility verification id is required for this entry. Run the eligibility step first.",
      },
      { status: 422 },
    );
  }

  try {
    const client = buildPartnerClient(session);
    const response = (await client.createTenantBooking(command)) as
      | BookingRecord
      | { booking?: BookingRecord };

    const booking =
      response && typeof response === "object" && "bookingId" in response
        ? (response as BookingRecord)
        : (response as { booking?: BookingRecord }).booking;

    if (!booking) {
      return NextResponse.json(
        { error: "Backend did not return a booking record." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Booking create rejected by backend.",
      },
      { status: 502 },
    );
  }
}
