import { NextResponse } from "next/server";

import type { ReferralEmbedSession } from "@drts/contracts";

import { isEmbedBookingAuthorityError } from "@/lib/embed-booking-api";
import { getReferralEmbedSession } from "@/lib/embed-partner-session";

export function referralJsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function requireActiveReferralSession(): Promise<
  ReferralEmbedSession | NextResponse
> {
  const session = await getReferralEmbedSession();
  if (!session) {
    return referralJsonResponse(
      {
        ok: false,
        code: "REFERRAL_SESSION_REQUIRED",
        message: "Referral embed session is required.",
      },
      401,
    );
  }
  if (!session.identityActive) {
    return referralJsonResponse(
      {
        ok: false,
        code: "REFERRAL_SESSION_INACTIVE",
        message: "Referral embed session is inactive.",
      },
      403,
    );
  }
  return session;
}

export function referralErrorResponse(error: unknown) {
  if (isEmbedBookingAuthorityError(error)) {
    return referralJsonResponse(
      {
        ok: false,
        code: error.code,
        message: error.message,
        details: error.details,
        retryable: error.retryable ?? false,
      },
      error.status,
    );
  }

  return referralJsonResponse(
    {
      ok: false,
      code: "REFERRAL_BOOKING_ROUTE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Referral booking route failed.",
    },
    500,
  );
}
