import type { ReferralPassengerQuoteCommand } from "@drts/contracts";
import {
  quoteReferralFareServer,
  referralResult,
  referralErrorResponse,
  readReferralBody,
} from "../../../../lib/embed-booking-api";
export async function POST(request: Request) {
  try {
    return referralResult(
      await quoteReferralFareServer(
        await readReferralBody<ReferralPassengerQuoteCommand>(request),
      ),
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
