import { getReferralPassengerReceipt } from "@/lib/embed-booking-api";

import {
  referralErrorResponse,
  referralJsonResponse,
  requireActiveReferralSession,
} from "../../../_route-utils";

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
    const receipt = await getReferralPassengerReceipt(session, bookingId);
    return referralJsonResponse({ ok: true, data: receipt });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
