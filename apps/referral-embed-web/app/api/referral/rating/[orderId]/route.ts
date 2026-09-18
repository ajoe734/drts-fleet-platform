import { NextResponse } from "next/server";
import { submitReferralTripRatingServer } from "@/lib/embed-booking-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const body = await request.json();
    const data = await submitReferralTripRatingServer(orderId, {
      orderId,
      ...body,
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Submit rating failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 400 },
    );
  }
}
