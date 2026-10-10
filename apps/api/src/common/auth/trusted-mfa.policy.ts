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

/**
 * Truthful marker recorded on a workforce identity's `amr` when the dev MFA
 * waiver (below) let a privileged action through without a real MFA signal.
 * Deliberately NOT a member of `STRICT_TRUSTED_AMR` / `NON_STRICT_TRUSTED_AMR`:
 * `hasTrustedMfa` must keep returning false for it, so the only way it can
 * ever satisfy the step-up gate is through the explicit, audited waiver check
 * in `StepUpProofService.createProof`, not by silently passing as MFA.
 */
export const DEV_MFA_WAIVED_AMR = "dev_mfa_waived";

/**
 * Product decision (2026-10-05): dev deployments of the platform-admin /
 * ops-console workforce entry do not require a second verification factor.
 * This must never be satisfied by fabricating `verified_iap_workforce` /
 * `aal2` on an identity that never produced that evidence (see
 * `resolveBootstrapTokenAssurance` in `auth.controller.ts`) -- it is instead
 * an explicit, named waiver that `StepUpProofService` consults directly and
 * that every use must record as a security event.
 *
 * Staging and production reject this flag outright regardless of its value
 * (also enforced at startup by `buildAuthStartupConfigReport` in
 * `auth-startup-config.ts`, mirroring `ALLOW_INSECURE_DEV_AUTH`), so this
 * function can only ever return true in a non-strict (dev/test) environment.
 */
export function isDevWorkforceMfaWaiverEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isStrictAuthEnvironment()) {
    return false;
  }
  return (env.DRTS_DEV_MFA_WAIVED ?? "").trim().toLowerCase() === "true";
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
