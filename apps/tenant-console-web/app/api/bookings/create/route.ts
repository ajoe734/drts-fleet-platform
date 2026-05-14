import { NextRequest, NextResponse } from "next/server";
import type {
  BookingRecord,
  CreateTenantBookingCommand,
} from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTenantBookingCommand;
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
    const response = (await client.createTenantBooking(body)) as
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
