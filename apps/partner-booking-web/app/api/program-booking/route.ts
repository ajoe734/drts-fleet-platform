import { NextRequest, NextResponse } from "next/server";
import type {
  AddressPayload,
  BusinessDispatchSubtype,
  CreateTenantBookingCommand,
} from "@drts/contracts";
import { createProgramBooking } from "@/lib/partner-booking-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingDraftPayload = {
  tenantSlug?: unknown;
  businessDispatchSubtype?: unknown;
  eligibilityVerificationId?: unknown;
  draft?: Record<string, unknown> | null;
  pickup?: AddressPayload | null;
  dropoff?: AddressPayload | null;
};

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalText(value: unknown) {
  const normalized = getText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function getOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function buildAddress(
  fallbackAddress: string,
  payload: AddressPayload | null | undefined,
): AddressPayload {
  return {
    address: payload?.address?.trim() || fallbackAddress,
    ...(typeof payload?.lat === "number" ? { lat: payload.lat } : {}),
    ...(typeof payload?.lng === "number" ? { lng: payload.lng } : {}),
  };
}

function toCreateCommand(body: BookingDraftPayload): {
  tenantSlug: string;
  command: CreateTenantBookingCommand;
} {
  const tenantSlug = getText(body.tenantSlug);
  const draft = body.draft ?? {};

  if (!tenantSlug) {
    throw new Error("tenantSlug is required.");
  }

  const command: CreateTenantBookingCommand = {
    businessDispatchSubtype:
      getText(body.businessDispatchSubtype) as BusinessDispatchSubtype,
    ...(getOptionalText(body.eligibilityVerificationId)
      ? { eligibilityVerificationId: getText(body.eligibilityVerificationId) }
      : {}),
    pickup: buildAddress(getText(draft.pickupAddress), body.pickup),
    dropoff: buildAddress(getText(draft.dropoffAddress), body.dropoff),
    reservationWindowStart: new Date(
      getText(draft.reservationWindowStart),
    ).toISOString(),
    reservationWindowEnd: new Date(
      getText(draft.reservationWindowEnd),
    ).toISOString(),
    passenger: {
      name: getText(draft.passengerName),
      phone: getText(draft.passengerPhone),
    },
    ...(getOptionalText(draft.direction)
      ? {
          direction: getText(draft.direction) as
            | "pickup"
            | "dropoff",
        }
      : {}),
    ...(getOptionalText(draft.flightNo)
      ? { flightNo: getText(draft.flightNo) }
      : {}),
    ...(getOptionalText(draft.terminal)
      ? { terminal: getText(draft.terminal) }
      : {}),
    ...(getOptionalNumber(draft.luggageCount) !== undefined
      ? { luggageCount: getOptionalNumber(draft.luggageCount) }
      : {}),
    ...(getOptionalText(draft.notes) ? { notes: getText(draft.notes) } : {}),
    ...(getOptionalText(draft.claimReference ?? draft.groupCode ?? draft.cardTier)
      ? {
          benefitReference: getText(
            draft.claimReference ?? draft.groupCode ?? draft.cardTier,
          ),
        }
      : {}),
  };

  return { tenantSlug, command };
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as BookingDraftPayload;
    const result = await createProgramBooking(toCreateCommand(payload));
    return NextResponse.json({ data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create booking.";
    return NextResponse.json(
      { error: { message } },
      {
        status: 400,
      },
    );
  }
}
