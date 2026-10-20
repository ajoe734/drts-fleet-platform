import type { CreateReferralPassengerBookingCommand } from "@drts/contracts";
import {
  referralErrorResponse,
  readReferralBody,
} from "../../../../lib/embed-booking-api";
import { NextResponse } from "next/server";
import { createReferralBookingServer } from "../../../../lib/embed-booking-api";

export async function POST(request: Request) {
  try {
    const body =
      await readReferralBody<CreateReferralPassengerBookingCommand>(request);
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      body.idempotencyKey ||
      undefined;
    const command = {
      ...body,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
    const result = await createReferralBookingServer(command);
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
