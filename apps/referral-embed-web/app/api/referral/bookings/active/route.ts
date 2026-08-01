import { getReferralPassengerActiveBooking } from "@/lib/embed-booking-api";

import {
  referralErrorResponse,
  referralJsonResponse,
  requireActiveReferralSession,
} from "../../_route-utils";

export async function GET() {
  const session = await requireActiveReferralSession();
  if (session instanceof Response) {
    return session;
  }

  try {
    const booking = await getReferralPassengerActiveBooking(session);
    return referralJsonResponse({ ok: true, data: booking });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
