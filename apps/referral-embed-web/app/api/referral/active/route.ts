import { NextResponse } from "next/server";
import { getReferralActiveTripServer } from "@/lib/embed-booking-api";

export async function GET() {
  try {
    const data = await getReferralActiveTripServer();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Active trip lookup failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 400 },
    );
  }
}
