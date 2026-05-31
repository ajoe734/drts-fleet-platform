import { NextRequest, NextResponse } from "next/server";
import type {
  CreateTenantBookingCommand,
  TenantBookingCommandResult,
} from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTenantBookingCommand;
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
    // Q-TEN04 — createTenantBooking resolves to a TenantBookingCommandResult
    // command envelope ({ commandId, command, status, pendingReasonCode,
    // bookingId, booking }). The envelope carries a top-level `bookingId`, so it
    // is *not* a BookingRecord; the UI booking record lives under `.booking`.
    const result: TenantBookingCommandResult =
      await client.createTenantBooking(body);
    const booking = result.booking;

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
