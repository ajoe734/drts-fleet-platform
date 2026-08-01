import { NextResponse } from "next/server";
import { getReferralTripHistoryServer } from "@/lib/embed-booking-api";

export async function GET() {
  try {
    const data = await getReferralTripHistoryServer();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Trip history lookup failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 400 },
    );
  }
}
