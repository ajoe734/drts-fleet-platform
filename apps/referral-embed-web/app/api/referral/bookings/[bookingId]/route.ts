import { getReferralPassengerBooking } from "@/lib/embed-booking-api";

import {
  referralErrorResponse,
  referralJsonResponse,
  requireActiveReferralSession,
} from "../../_route-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const session = await requireActiveReferralSession();
  if (session instanceof Response) {
    return session;
  }

  try {
    const { bookingId } = await context.params;
    const booking = await getReferralPassengerBooking(session, bookingId);
    return referralJsonResponse({ ok: true, data: booking });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
