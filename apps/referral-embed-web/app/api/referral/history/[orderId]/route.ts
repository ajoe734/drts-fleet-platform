import { referralErrorResponse } from "../../../../../lib/embed-booking-api";
import { NextResponse } from "next/server";
import { getReferralTripHistoryServer } from "../../../../../lib/embed-booking-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const history = await getReferralTripHistoryServer();
    const item = history?.items?.find((i) => i.orderId === orderId);

    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "ORDER_NOT_FOUND", message: "找不到這筆行程。" },
        },
        { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: item },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
