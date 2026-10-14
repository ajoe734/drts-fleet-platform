/** Explicit absolute deadline only: no inferred notice TTL or expiry defaults. */
export function paymentRecoveryNoticeExpiryFromEnv(
  env: NodeJS.ProcessEnv,
): string | null {
  const value = env.PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT;
  if (value === undefined) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= Date.now())
    throw new Error("payment_recovery_notice_configuration_invalid");
  return new Date(time).toISOString();
}
export const PAYMENT_RECOVERY_NOTICE_EXPIRY = Symbol(
  "PAYMENT_RECOVERY_NOTICE_EXPIRY",
);
export const PAYMENT_RECOVERY_NOTICE_OUTBOX = Symbol(
  "PAYMENT_RECOVERY_NOTICE_OUTBOX",
);
