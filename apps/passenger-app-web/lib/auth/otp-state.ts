import { PassengerApiError } from "@drts/passenger-client";
import { t } from "./translations";
export type OtpProvider = "phone" | "email";
export type OtpPurpose = "login" | "link" | "verify_contact_phone";
export interface OtpState {
  provider: OtpProvider;
  purpose: OtpPurpose;
  target: string;
  challenge: string;
  resendAt: number;
  expiresAt: number;
  attempts: number;
  subject: string;
}
export function normalizeTarget(provider: OtpProvider, target: string) {
  const value = target.trim();
  return provider === "email"
    ? value.toLowerCase()
    : value.replace(/[\s-]/g, "");
}
export function otpKey(
  provider: OtpProvider,
  purpose: OtpPurpose,
  subject: string,
) {
  return `pax.otp.${subject}.${provider}.${purpose}`;
}
export function readOtp(key: string, target?: string): OtpState | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(
        target === undefined ? key : `${key}.${encodeURIComponent(target)}`,
      ) ?? "null",
    );
    if (
      !value ||
      typeof value.target !== "string" ||
      typeof value.challenge !== "string" ||
      !Number.isFinite(value.resendAt) ||
      !Number.isFinite(value.expiresAt) ||
      !Number.isInteger(value.attempts)
    )
      return null;
    return value as OtpState;
  } catch {
    return null;
  }
}
export function saveOtp(key: string, state: OtpState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem(
      `${key}.${encodeURIComponent(state.target)}`,
      JSON.stringify(state),
    );
  } catch {
    /* In-memory guards remain active if storage is unavailable. */
  }
}
export function clearOtpState() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("pax.otp.")) sessionStorage.removeItem(key);
  } catch {
    /* Session termination remains authoritative on the server. */
  }
}
export function authError(error: unknown) {
  if (!(error instanceof PassengerApiError)) return t("failed");
  switch (error.code) {
    case "invalid_code":
      return t("invalid");
    case "challenge_locked":
      return t("locked");
    case "too_many_requests":
      return t("rate");
    case "not_configured":
    case "unsupported_provider":
      return t("noSms");
    case "conflict":
      return t("conflict");
    case "last_identity_error":
      return t("lastIdentity");
    case "pending_payment_block":
      return t("debt");
    case "unauthorized":
    case "invalid_grant":
      return t("changedSession");
    default:
      return t("failed");
  }
}
