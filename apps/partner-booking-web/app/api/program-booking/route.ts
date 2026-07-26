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

function requireText(value: unknown, field: string) {
  const normalized = getText(value);
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  return normalized;
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
  const tenantSlug = requireText(body.tenantSlug, "tenantSlug");
  const draft = body.draft ?? {};
  const businessDispatchSubtype = requireText(
    body.businessDispatchSubtype,
    "businessDispatchSubtype",
  ) as BusinessDispatchSubtype;
  const luggageCount = getOptionalNumber(draft.luggageCount);

  const command: CreateTenantBookingCommand = {
    businessDispatchSubtype,
    ...(getOptionalText(body.eligibilityVerificationId)
      ? { eligibilityVerificationId: getText(body.eligibilityVerificationId) }
      : {}),
    pickup: buildAddress(
      requireText(draft.pickupAddress, "draft.pickupAddress"),
      body.pickup,
    ),
    dropoff: buildAddress(
      requireText(draft.dropoffAddress, "draft.dropoffAddress"),
      body.dropoff,
    ),
    reservationWindowStart: new Date(
      requireText(draft.reservationWindowStart, "draft.reservationWindowStart"),
    ).toISOString(),
    reservationWindowEnd: new Date(
      requireText(draft.reservationWindowEnd, "draft.reservationWindowEnd"),
    ).toISOString(),
    passenger: {
      name: requireText(draft.passengerName, "draft.passengerName"),
      phone: requireText(draft.passengerPhone, "draft.passengerPhone"),
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
    ...(luggageCount !== undefined ? { luggageCount } : {}),
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
