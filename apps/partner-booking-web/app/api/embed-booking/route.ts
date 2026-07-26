import { NextRequest, NextResponse } from "next/server";
import { createEmbedPartnerBooking } from "@/lib/api-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantSlug,
      eligibilityVerificationId,
      pickup,
      dropoff,
      reservationWindowStart,
      passenger,
      notes,
      flightNumber,
      vehicleClass,
      apiKey,
    } = body ?? {};

    if (!tenantSlug || typeof tenantSlug !== "string") {
      return NextResponse.json(
        { error: "TENANT_SLUG_REQUIRED", message: "tenantSlug is required" },
        { status: 400 },
      );
    }

    const { booking } = await createEmbedPartnerBooking({
      tenantSlug,
      eligibilityVerificationId,
      pickup,
      dropoff,
      reservationWindowStart,
      passenger,
      notes,
      flightNumber,
      vehicleClass,
      apiKey,
    });

    return NextResponse.json({
      success: true,
      bookingId: booking.bookingId,
      booking,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "EMBED_BOOKING_CREATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
