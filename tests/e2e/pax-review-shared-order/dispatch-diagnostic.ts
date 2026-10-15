// Literal public codes from the existing Owned assignment/disclosure guards,
// HTTP preparation and idempotency contract. Never reflect an unknown value.
const PUBLIC_DISPATCH_CODES = new Set([
  "DISPATCH_JOB_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "SUPERSEDED_ASSIGNMENT_ALREADY_CLOSED",
  "DISPATCH_JOB_NOT_ASSIGNABLE",
  "MULTI_TAXI_VEHICLE_NOT_AUTHORIZED",
  "DISPATCH_RESOURCE_RESERVATION_CONFLICT",
  "ACTIVE_ASSIGNMENT_REQUIRED",
  "REASSIGN_REASON_REQUIRED",
  "P5_RATING_STATE_UNINITIALIZED",
  "P5_VEHICLE_DISCLOSURE_INCOMPLETE",
  "P5_DRIVER_REGISTRATION_NOT_ACTIVE",
  "P5_VEHICLE_REGISTRY_MISSING",
  "P5_QUOTE_PROVIDER_UNAVAILABLE",
  "P5_QUOTE_OUT_OF_RANGE",
  "P5_ROUTE_SNAPSHOT_UNRESOLVED",
  "P5_FARE_POLICY_MISSING",
  "P5_FARE_CALCULATION_MISMATCH",
  "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_TOO_LONG",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_PROGRESS",
]);

// This one public error wraps the changed eligibility condition. Inspect only
// its declared reasonCodes array, projecting these literal enums; ignore every
// other detail, including latestEligibility, identities, messages and tokens.
const PUBLIC_ELIGIBILITY_REASONS = [
  "SERVICE_PRODUCT_INACTIVE",
  "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
  "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
  "DRIVER_ON_LEAVE",
  "DRIVER_TRAINING_INCOMPLETE",
  "DRIVER_BUSY_ON_OTHER_PLATFORM",
  "DRIVER_DISCONNECTED_ON_OTHER_PLATFORM",
] as const;

/** Failure-message diagnostic only. Preserve the caller's original 2xx
 * assertion and commands; never print a raw response or parsing exception.
 */
export async function dispatchResponseDiagnostic(
  response: { status(): number; json(): Promise<unknown> },
  reassign: boolean,
): Promise<string> {
  const status = response.status();
  let code = "unclassified";
  let reasons = "";
  if (status >= 400) {
    try {
      const body = (await response.json()) as {
        error?: string | { code?: unknown; details?: { reasonCodes?: unknown } };
      } | null;
      const error = body?.error;
      const candidate = typeof error === "string" ? error : error?.code;
      if (typeof candidate === "string" && PUBLIC_DISPATCH_CODES.has(candidate)) {
        code = candidate;
        const reported = typeof error === "object" ? error?.details?.reasonCodes : null;
        if (
          code === "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT" &&
          Array.isArray(reported)
        ) {
          const known = PUBLIC_ELIGIBILITY_REASONS.filter((reason) =>
            reported.includes(reason),
          );
          if (known.length) reasons = ` reasons=${known.join(",")}`;
        }
      }
    } catch {
      // Keep the original HTTP assertion even when a proxy returns non-JSON.
    }
  }
  return `Ops ${reassign ? "reassign" : "assign"} status=${status} code=${code}${reasons}`;
}
