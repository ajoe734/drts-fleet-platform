import { createReferralPassengerBooking } from "@/lib/embed-booking-api";

import {
  referralErrorResponse,
  referralJsonResponse,
  requireActiveReferralSession,
} from "../_route-utils";

export async function POST(request: Request) {
  const session = await requireActiveReferralSession();
  if (session instanceof Response) {
    return session;
  }

  try {
    const command = await request.json();
    const booking = await createReferralPassengerBooking(session, command, {
      idempotencyKey: request.headers.get("idempotency-key"),
    });
    return referralJsonResponse({ ok: true, data: booking });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
