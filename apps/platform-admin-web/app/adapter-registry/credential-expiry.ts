import { CredentialStatus, type PlatformAdapter } from "@drts/contracts";

export type CredentialExpiryState =
  | "valid"
  | "expiring_soon"
  | "expired"
  | "unknown";

export interface CredentialExpiryEvaluation {
  state: CredentialExpiryState;
  daysRemaining: number | null;
  expiryDate: Date | null;
  formattedExpiryDate: string | null;
  statusLabel: string;
}

export const DEFAULT_WARNING_THRESHOLD_DAYS = 30;

/**
 * Calculates the true credential expiry state and days remaining based on the
 * adapter's real credential timestamp and status, evaluated at `referenceDate`.
 *
 * Four states:
 * - `valid`: credential is active/valid and not within the warning threshold
 * - `expiring_soon`: credential is valid but expires within `warningThresholdDays`
 * - `expired`: credential expiry date is in the past or status is EXPIRED
 * - `unknown`: credential expiry timestamp is missing, invalid, or unverified
 */
export function evaluateCredentialExpiry(
  adapterOrExpiresAt:
    | (Partial<PlatformAdapter> & {
        credentialExpiresAt?: string | null;
      })
    | string
    | null
    | undefined,
  referenceDate: Date = new Date(),
  warningThresholdDays = DEFAULT_WARNING_THRESHOLD_DAYS,
): CredentialExpiryEvaluation {
  let expiresAtStr: string | null | undefined = null;
  let status: string | undefined = undefined;

  if (typeof adapterOrExpiresAt === "string") {
    expiresAtStr = adapterOrExpiresAt;
  } else if (adapterOrExpiresAt && typeof adapterOrExpiresAt === "object") {
    expiresAtStr =
      adapterOrExpiresAt.credentialExpiresAt ??
      ((adapterOrExpiresAt as Record<string, unknown>).expiresAt as
        | string
        | null
        | undefined);
    status = adapterOrExpiresAt.credentialStatus;
  }

  // If status is explicitly EXPIRED, classify as expired
  if (status === CredentialStatus.EXPIRED || status === "EXPIRED") {
    const expiryDate = expiresAtStr ? new Date(expiresAtStr) : null;
    const isValidDate = expiryDate && !isNaN(expiryDate.getTime());
    return {
      state: "expired",
      daysRemaining: 0,
      expiryDate: isValidDate ? expiryDate : null,
      formattedExpiryDate: isValidDate
        ? expiryDate.toISOString().slice(0, 10)
        : null,
      statusLabel: "已到期",
    };
  }

  if (!expiresAtStr) {
    return {
      state: "unknown",
      daysRemaining: null,
      expiryDate: null,
      formattedExpiryDate: null,
      statusLabel: "未知",
    };
  }

  const expiryTime = new Date(expiresAtStr).getTime();
  if (isNaN(expiryTime)) {
    return {
      state: "unknown",
      daysRemaining: null,
      expiryDate: null,
      formattedExpiryDate: null,
      statusLabel: "未知",
    };
  }

  const nowTime = referenceDate.getTime();
  const diffMs = expiryTime - nowTime;
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const expiryDate = new Date(expiryTime);
  const formattedExpiryDate = expiryDate.toISOString().slice(0, 10);

  if (daysRemaining <= 0) {
    return {
      state: "expired",
      daysRemaining,
      expiryDate,
      formattedExpiryDate,
      statusLabel: "已到期",
    };
  }

  if (daysRemaining <= warningThresholdDays) {
    return {
      state: "expiring_soon",
      daysRemaining,
      expiryDate,
      formattedExpiryDate,
      statusLabel: "即將到期",
    };
  }

  return {
    state: "valid",
    daysRemaining,
    expiryDate,
    formattedExpiryDate,
    statusLabel: "未到期",
  };
}
