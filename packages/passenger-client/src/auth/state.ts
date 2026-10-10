import type { PassengerAccount } from "@drts/contracts";
import { PassengerAuthError } from "./index";
import { AUTH_COPY as C } from "./copy";

export interface ConsentPolicy {
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string;
  privacyUrl: string;
}
export function consentDecision(
  account: PassengerAccount,
  policy: ConsentPolicy,
) {
  if (
    !policy.termsVersion ||
    !policy.privacyVersion ||
    !policy.termsUrl ||
    !policy.privacyUrl
  )
    return "unconfigured";
  return account.termsVersion === policy.termsVersion &&
    account.privacyVersion === policy.privacyVersion
    ? "accepted"
    : "required";
}
export function authErrorCopy(error: unknown): string {
  if (!(error instanceof PassengerAuthError)) return C.unavailable;
  const copy: Record<string, string> = {
    invalid_code: C.invalidCode,
    challenge_locked: C.locked,
    challenge_expired: C.expired,
    too_many_requests: C.rateLimit,
    unsupported_provider: C.unsupported,
    not_configured: C.unsupported,
    conflict: C.conflict,
    last_identity_error: C.lastIdentity,
    unauthorized: C.unauthorized,
    invalid_grant: C.invalidGrant,
    oauth_denied: C.denied,
    validation_error: C.invalidInput,
    pending_payment_block: C.pendingPayment,
  };
  return (
    copy[error.code] ??
    (error.status === 429
      ? C.rateLimit
      : error.status === 401
        ? C.unauthorized
        : C.unavailable)
  );
}
export function normalizedOtpTarget(
  provider: "phone" | "email",
  target: string,
) {
  return provider === "email" ? target.trim().toLowerCase() : target.trim();
}
