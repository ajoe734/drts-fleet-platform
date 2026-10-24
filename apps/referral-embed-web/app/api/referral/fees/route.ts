import type { AcknowledgeReferralFeesCommand } from "@drts/contracts";
import {
  acknowledgeReferralFeesServer,
  getReferralFeesServer,
  referralResult,
  referralErrorResponse,
  readReferralBody,
  ReferralBookingApiError,
} from "../../../../lib/embed-booking-api";
import { resolveReferralRequestUrl } from "../../../../lib/embed-request-origin";

export async function GET() {
  try {
    return referralResult(await getReferralFeesServer());
  } catch (error) {
    return referralErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const url = resolveReferralRequestUrl(
      new URL(request.url),
      request.headers,
    );
    const origin = request.headers.get("origin");
    if (!url || (origin && origin !== url.origin))
      throw new ReferralBookingApiError(403, "CROSS_ORIGIN_FORBIDDEN");
    return referralResult(
      await acknowledgeReferralFeesServer(
        await readReferralBody<AcknowledgeReferralFeesCommand>(request),
      ),
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
