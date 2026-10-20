import type { CancelReferralPassengerTripCommand } from "@drts/contracts";
import {
  referralErrorResponse,
  readReferralBody,
} from "../../../../../lib/embed-booking-api";
import { NextResponse } from "next/server";
import { cancelReferralTripServer } from "../../../../../lib/embed-booking-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const body =
      await readReferralBody<CancelReferralPassengerTripCommand>(request);
    const data = await cancelReferralTripServer(orderId, { ...body, orderId });
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
