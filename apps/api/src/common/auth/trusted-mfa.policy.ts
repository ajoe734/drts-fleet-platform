import { detectAuthEnvironment } from "../../config/auth-startup-config";

/**
 * AMR values that establish a trusted, verifier-confirmed MFA assertion in
 * every environment, including production and staging.
 *
 * This is the single source of truth for what counts as "trusted MFA" for:
 * - the tenant_admin / tenant_ops_admin high-privilege login gate
 *   (`auth.controller.ts`, `isHighPrivilegeTenantRole`)
 * - the privileged-action step-up gate (`step-up-proof.service.ts`)
 *
 * Do not fork a third copy of this list or of `hasTrustedMfa`. Both gates
 * must call this module so they cannot silently diverge again.
 */
export const STRICT_TRUSTED_AMR = new Set([
  "mfa",
  "otp",
  "totp",
  "push",
  "webauthn",
  "fido2",
  "verified_iap_workforce",
]);

/**
 * Product decision (2026-09-15): in non-strict (dev/test) environments only,
 * also trust the tenant bootstrap fixture AMR so tenant_admin /
 * tenant_ops_admin logins can be exercised locally without a real IdP MFA
 * challenge. Production and staging always use `STRICT_TRUSTED_AMR` and must
 * reject `tenant_bootstrap_fixture`.
 */
export const NON_STRICT_TRUSTED_AMR = new Set([
  ...STRICT_TRUSTED_AMR,
  "tenant_bootstrap_fixture",
]);

export function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

export interface TrustedMfaAssertion {
  amr?: string[] | null;
  acr?: string | null;
}

export function hasTrustedMfa(identity: TrustedMfaAssertion): boolean {
  const normalizedAcr = identity.acr?.trim().toLowerCase() ?? null;
  if (normalizedAcr === "aal2" || normalizedAcr === "aal3") {
    return true;
  }

  const trustedAmr = isStrictAuthEnvironment()
    ? STRICT_TRUSTED_AMR
    : NON_STRICT_TRUSTED_AMR;
  return (identity.amr ?? []).some((method) =>
    trustedAmr.has(method.trim().toLowerCase()),
  );
}
