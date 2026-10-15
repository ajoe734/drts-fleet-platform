// These are literal public codes from the existing BFF / PassengerBooking /
// MultiTaxi / ServiceProduct / payment guards. Unknown values never leave the
// response boundary: even a syntactically valid code could contain a secret.
const PUBLIC_BOOKING_CODES = new Set([
  "CSRF_CHECK_FAILED",
  "PASSENGER_ACCOUNT_NOT_FOUND",
  "PASSENGER_PHONE_REQUIRED",
  "FARE_QUOTE_NOT_FOUND",
  "FARE_QUOTE_EXPIRED",
  "PASSENGER_NOT_CONFIRMED",
  "FARE_QUOTE_NOT_SCHEDULED",
  "FARE_QUOTE_MISMATCH",
  "TOO_SOON_TO_BOOK",
  "MULTI_TAXI_AUTHORIZATION_AMBIGUOUS",
  "MULTI_TAXI_AUTHORIZATION_UNAVAILABLE",
  "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
  "SERVICE_PRODUCT_INACTIVE",
  "FIRST_PARTY_NOTIFICATION_ROUTE_CONFLICT",
  "PASSENGER_BOOKING_COMMIT_REQUIRED",
  "PASSENGER_BOOKING_STORAGE_UNAVAILABLE",
  "PASSENGER_BOOKING_HISTORY_FAILED",
  "PASSENGER_ACCESS_TOKEN_PERSISTENCE_FAILED",
  "pending_payment_block",
  "invalid_method",
  "not_found",
  "payment_persistence_unavailable",
]);

/** Used only as the existing HTTP assertion's failure message. It neither
 * accepts a failed booking nor logs raw bodies, details, headers or URLs.
 */
export async function bookingResponseDiagnostic(response: {
  status(): number;
  json(): Promise<unknown>;
}): Promise<string> {
  const status = response.status();
  let code = "unclassified";
  if (status >= 400) {
    try {
      const body = (await response.json()) as {
        error?: string | { code?: unknown };
      } | null;
      const candidate =
        typeof body?.error === "string" ? body.error : body?.error?.code;
      if (typeof candidate === "string" && PUBLIC_BOOKING_CODES.has(candidate))
        code = candidate;
    } catch {
      // Diagnostic parsing must never replace the original HTTP assertion.
    }
  }
  return `Passenger booking status=${status} code=${code}`;
}
