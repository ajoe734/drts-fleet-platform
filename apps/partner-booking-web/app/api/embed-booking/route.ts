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
      reservationWindowEnd,
      passenger,
      notes,
      flightNumber,
      vehicleClass,
    } = body ?? {};

    if (!tenantSlug || typeof tenantSlug !== "string" || !tenantSlug.trim()) {
      return NextResponse.json(
        { error: "TENANT_SLUG_REQUIRED", message: "tenantSlug is required" },
        { status: 400 },
      );
    }

    if (
      !eligibilityVerificationId ||
      typeof eligibilityVerificationId !== "string" ||
      !eligibilityVerificationId.trim()
    ) {
      return NextResponse.json(
        {
          error: "ELIGIBILITY_VERIFICATION_REQUIRED",
          message: "eligibilityVerificationId is required",
        },
        { status: 422 },
      );
    }

    if (
      !pickup ||
      typeof pickup.address !== "string" ||
      !pickup.address.trim()
    ) {
      return NextResponse.json(
        {
          error: "PICKUP_ADDRESS_REQUIRED",
          message: "pickup with a valid address is required",
        },
        { status: 400 },
      );
    }

    if (
      !dropoff ||
      typeof dropoff.address !== "string" ||
      !dropoff.address.trim()
    ) {
      return NextResponse.json(
        {
          error: "DROPOFF_ADDRESS_REQUIRED",
          message: "dropoff with a valid address is required",
        },
        { status: 400 },
      );
    }

    if (
      !passenger ||
      typeof passenger.name !== "string" ||
      !passenger.name.trim() ||
      typeof passenger.phone !== "string" ||
      !passenger.phone.trim()
    ) {
      return NextResponse.json(
        {
          error: "PASSENGER_INFO_REQUIRED",
          message: "passenger with name and phone is required",
        },
        { status: 400 },
      );
    }

    const { booking } = await createEmbedPartnerBooking({
      tenantSlug,
      eligibilityVerificationId,
      pickup,
      dropoff,
      reservationWindowStart,
      reservationWindowEnd,
      passenger,
      notes,
      flightNumber,
      vehicleClass,
    });

    return NextResponse.json({
      success: true,
      bookingId: booking.bookingId,
      booking,
    });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error.status as number)
        : 500;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error.code as string)
        : "EMBED_BOOKING_CREATE_FAILED";

    return NextResponse.json(
      {
        error: code,
        message: error instanceof Error ? error.message : String(error),
      },
      { status },
    );
  }
}
