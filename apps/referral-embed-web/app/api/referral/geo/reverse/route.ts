import {
  readReferralBody,
  referralErrorResponse,
  referralResult,
} from "../../../../../lib/embed-booking-api";
import { reverseReferralPlaceServer } from "../../../../../lib/embed-geo-api";

/** The address at a point the rider picked on the map or shared from GPS. */
export async function POST(request: Request) {
  try {
    const body = await readReferralBody<{ lat?: unknown; lng?: unknown }>(
      request,
    );
    return referralResult(
      await reverseReferralPlaceServer(Number(body.lat), Number(body.lng)),
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
