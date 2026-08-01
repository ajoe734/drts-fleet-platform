import { listReferralPassengerBookingHistory } from "@/lib/embed-booking-api";

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
    const history = await listReferralPassengerBookingHistory(session);
    return referralJsonResponse({ ok: true, data: history });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
