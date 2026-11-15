import { Body, Controller, Headers, Param, Post } from "@nestjs/common";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  hasTrustedMfa,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { validateCsrfHeader } from "./session-masking.utility";
import {
  TotpEnrollmentNotFoundError,
  TotpInvalidCodeError,
  TotpSecretAlreadyConfirmedError,
  TotpSecretNotConfirmedError,
  TotpService,
} from "./totp.service";

/**
 * Freshness window for the recovery-code regeneration action. Regenerating
 * hands the caller a brand-new set of 10 single-use codes that can each log
 * in past TOTP on their own, so -- like the privileged actions gated by
 * StepUpProofService (common/auth/step-up.policy.ts) -- it requires the
 * session's own trusted-MFA assertion (`hasTrustedMfa`, the single source of
 * truth shared with the login and step-up gates) to be both genuinely
 * trusted and recent. This mirrors the tenant-realm step-up freshness
 * windows rather than adding a parallel policy module.
 */
const RECOVERY_CODE_REGENERATE_FRESHNESS_MS = 15 * 60 * 1000;

/**
 * Requires that this session's own authentication (never a request-body
 * claim) included a trusted MFA factor and that it happened recently. Used
 * only for the recovery-code regeneration action below.
 */
function requireFreshTrustedMfa(
  identity: BootstrapRequestIdentity | null,
): void {
  if (!identity || !hasTrustedMfa(identity)) {
    throw new ApiRequestError(
      403,
      "MFA_REQUIRED",
      "Trusted multi-factor authentication is required for this action.",
    );
  }
  const authTimeMs = identity.authTime ? Date.parse(identity.authTime) : NaN;
  if (
    !Number.isFinite(authTimeMs) ||
    Date.now() - authTimeMs > RECOVERY_CODE_REGENERATE_FRESHNESS_MS
  ) {
    throw new ApiRequestError(
      403,
      "STEP_UP_REQUIRED",
      "A fresh authentication is required for this privileged action.",
    );
  }
}

const SUPPORTED_TOTP_REALMS = ["tenant", "agency", "partner"] as const;
type SupportedTotpRealm = (typeof SUPPORTED_TOTP_REALMS)[number];

function requireSupportedRealm(realm: string): SupportedTotpRealm {
  if (!(SUPPORTED_TOTP_REALMS as readonly string[]).includes(realm)) {
    throw new ApiRequestError(
      400,
      "AUTH_REALM_INVALID",
      `Unsupported MFA realm '${realm}'.`,
    );
  }
  return realm as SupportedTotpRealm;
}

/** A session's realm must match the `:realm` route segment it is acting
 * through; the `@RequireRealms` guard already restricts which realms can
 * reach this controller at all, this is the per-route cross-realm check. */
function requireMatchingPrincipal(
  identity: BootstrapRequestIdentity | null,
  realm: SupportedTotpRealm,
): string {
  if (!identity?.principalId || identity.realm !== realm) {
    throw new ApiRequestError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Active session required.",
    );
  }
  return identity.principalId;
}

/**
 * TOTP enrollment/confirmation and recovery-code regeneration (SA/SD
 * docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md §7).
 * Login-time verification and recovery-code consumption are exposed via
 * TotpService for the password-login endpoint (PWD-LOGIN-005/008) to call
 * directly; they are not separate HTTP routes.
 */
@Controller("auth")
@RequireRealms("tenant", "agency", "partner")
export class TotpController {
  constructor(private readonly totpService: TotpService) {}

  @Post(":realm/mfa/totp/enroll")
  async enroll(
    @Param("realm") realmParam: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    const realm = requireSupportedRealm(realmParam);
    const principalId = requireMatchingPrincipal(identity, realm);
    validateCsrfHeader(headers);

    const accountLabel = `${realm}:${identity?.subject ?? principalId}`;
    const enrollment = await this.totpService.enroll(principalId, accountLabel);
    return toApiSuccessEnvelope(
      { otpauthUri: enrollment.otpauthUri, secret: enrollment.secret },
      requestId,
    );
  }

  @Post(":realm/mfa/totp/confirm")
  async confirm(
    @Param("realm") realmParam: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: { code?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    const realm = requireSupportedRealm(realmParam);
    const principalId = requireMatchingPrincipal(identity, realm);
    validateCsrfHeader(headers);

    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "A TOTP confirmation code is required.",
      );
    }

    try {
      const result = await this.totpService.confirm(principalId, code);
      return toApiSuccessEnvelope(
        { recoveryCodes: result.recoveryCodes },
        requestId,
      );
    } catch (error) {
      if (
        error instanceof TotpEnrollmentNotFoundError ||
        error instanceof TotpInvalidCodeError ||
        error instanceof TotpSecretAlreadyConfirmedError
      ) {
        throw new ApiRequestError(
          400,
          "TOTP_CONFIRMATION_FAILED",
          error.message,
        );
      }
      throw error;
    }
  }

  /**
   * Replaces the complete recovery-code set for the caller's own confirmed
   * TOTP credential (account-security action distinct from the
   * enroll/confirm contract above). Requires a fresh, trusted-MFA session
   * bound to the same realm/principal as the credential being regenerated;
   * never trusts anything from the request body for that decision.
   */
  @Post(":realm/mfa/totp/recovery-codes/regenerate")
  async regenerateRecoveryCodes(
    @Param("realm") realmParam: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    const realm = requireSupportedRealm(realmParam);
    const principalId = requireMatchingPrincipal(identity, realm);
    validateCsrfHeader(headers);
    requireFreshTrustedMfa(identity);

    try {
      const result = await this.totpService.regenerateRecoveryCodes(
        principalId,
      );
      return toApiSuccessEnvelope(
        { recoveryCodes: result.recoveryCodes },
        requestId,
      );
    } catch (error) {
      if (error instanceof TotpSecretNotConfirmedError) {
        throw new ApiRequestError(400, "TOTP_NOT_CONFIRMED", error.message);
      }
      throw error;
    }
  }
}
