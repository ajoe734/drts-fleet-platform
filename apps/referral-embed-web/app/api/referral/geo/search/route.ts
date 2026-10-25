import {
  referralErrorResponse,
  referralResult,
} from "../../../../../lib/embed-booking-api";
import { searchReferralPlacesServer } from "../../../../../lib/embed-geo-api";

/** Address suggestions for the booking form's pickup and drop-off fields. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return referralResult(
      await searchReferralPlacesServer(
        url.searchParams.get("q") ?? "",
        Number(url.searchParams.get("limit") ?? 5),
      ),
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
