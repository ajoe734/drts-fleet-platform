import { submitReferralPassengerRating } from "@/lib/embed-booking-api";

import {
  referralErrorResponse,
  referralJsonResponse,
  requireActiveReferralSession,
} from "../../../_route-utils";

export async function POST(
  request: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const session = await requireActiveReferralSession();
  if (session instanceof Response) {
    return session;
  }

  try {
    const { bookingId } = await context.params;
    const command = await request.json();
    const rating = await submitReferralPassengerRating(
      session,
      bookingId,
      command,
    );
    return referralJsonResponse({ ok: true, data: rating });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
