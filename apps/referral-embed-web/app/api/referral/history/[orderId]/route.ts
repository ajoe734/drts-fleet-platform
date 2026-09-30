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
        { ok: false, error: { message: "Trip not found or access denied" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Trip history lookup failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 400 },
    );
  }
}
