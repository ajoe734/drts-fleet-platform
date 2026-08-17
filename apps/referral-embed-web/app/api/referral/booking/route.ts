import { NextResponse } from "next/server";
import { createReferralBookingServer } from "@/lib/embed-booking-api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      body.idempotencyKey ||
      undefined;
    const command = {
      ...body,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
    const result = await createReferralBookingServer(command);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Booking request failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 400 },
    );
  }
}
