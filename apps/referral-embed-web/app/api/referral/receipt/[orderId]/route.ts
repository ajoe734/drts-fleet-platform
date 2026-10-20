import { referralErrorResponse } from "../../../../../lib/embed-booking-api";
import { NextResponse } from "next/server";
import { getReferralTripReceiptServer } from "../../../../../lib/embed-booking-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const data = await getReferralTripReceiptServer(orderId);
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
