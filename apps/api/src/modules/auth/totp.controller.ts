import { Body, Controller, Headers, Param, Post } from "@nestjs/common";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { validateCsrfHeader } from "./session-masking.utility";
import {
  TotpEnrollmentNotFoundError,
  TotpInvalidCodeError,
  TotpSecretAlreadyConfirmedError,
  TotpService,
} from "./totp.service";

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
 * TOTP enrollment/confirmation (SA/SD
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
}
