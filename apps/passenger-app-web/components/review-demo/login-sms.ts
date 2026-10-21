import { PassengerApiError } from "@drts/passenger-client";
import { passengerFetch } from "../../lib/runtime-fetch";
import type { RequestOtpResponse } from "../../lib/auth/types";

/** Reuse the existing external SMS inbox; verification still uses the normal client. */
export async function requestReviewLoginSms(target: string) {
  const response = await passengerFetch("/api/passenger-app/review-demo/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const body = await response.json();
  if (!response.ok)
    throw new PassengerApiError(
      response.status,
      body.error?.code ?? "request_failed",
      body.error?.message ?? "Unable to receive the rehearsal SMS.",
    );
  return body.data as RequestOtpResponse & { code: string };
}
