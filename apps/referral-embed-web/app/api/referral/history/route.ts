import { referralErrorResponse } from "../../../../lib/embed-booking-api";
import { NextResponse } from "next/server";
import { getReferralTripHistoryServer } from "../../../../lib/embed-booking-api";

export async function GET() {
  try {
    const data = await getReferralTripHistoryServer();
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
