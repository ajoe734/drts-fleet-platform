import { generate } from "otplib";

export const SIMULATED_AUTHENTICATOR_DEVICE_LABEL =
  "simulated_totp_authenticator_fixture (real_backend_rfc6238_verification)" as const;

export interface SimulatedTotpCodeResult {
  code: string;
  step: number;
  deviceLabel: typeof SIMULATED_AUTHENTICATOR_DEVICE_LABEL;
}

export interface SimulatedTotpNextCodeOptions {
  nowMs?: () => number;
  waitFn?: (ms: number) => Promise<void>;
}

/**
 * Simulated TOTP authenticator device for hosted browser rehearsals.
 *
 * Explicitly labeled as a fixture authenticator device while producing genuine
 * RFC 6238 6-digit codes verified by `TotpService` (`apps/api/src/modules/auth/totp.service.ts`)
 * against the real PostgreSQL `identity_principal_totp_credentials` row.
 *
 * `TotpService` accepts steps in `[nowStep - 1, nowStep, nowStep + 1]` and
 * persists `last_used_step = matchedStep`, rejecting any step `<= last_used_step`.
 * By tracking the last step issued per secret and selecting monotonically
 * increasing steps starting from `nowStep - 1`, a single test can confirm
 * enrollment, perform initial TOTP login, and perform post-password-reset TOTP
 * login without artificial 30-second sleeps.
 */
export class SimulatedTotpAuthenticatorDevice {
  readonly deviceLabel = SIMULATED_AUTHENTICATOR_DEVICE_LABEL;
  private readonly lastUsedStepBySecret = new Map<string, number>();

  async nextCode(
    secret: string,
    options: SimulatedTotpNextCodeOptions = {},
  ): Promise<SimulatedTotpCodeResult> {
    const normalizedSecret = secret.trim().replace(/\s+/g, "").toUpperCase();
    if (!normalizedSecret) {
      throw new Error("TOTP secret is required for simulated authenticator.");
    }
    const nowMs = options.nowMs ?? (() => Date.now());
    const waitFn =
      options.waitFn ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    let nowStep = Math.floor(nowMs() / 1000 / 30);
    const previousStep = this.lastUsedStepBySecret.get(normalizedSecret);
    let targetStep =
      previousStep === undefined
        ? nowStep - 1
        : Math.max(nowStep - 1, previousStep + 1);

    // Wait only if we have exhausted `[nowStep - 1, nowStep, nowStep + 1]`.
    while (targetStep > nowStep + 1) {
      const targetWindowOpensAtMs = (targetStep - 1) * 30 * 1000 + 25;
      const waitMs = Math.max(50, targetWindowOpensAtMs - nowMs());
      await waitFn(waitMs);
      nowStep = Math.floor(nowMs() / 1000 / 30);
    }

    // `TotpService.findMatchingStep` checks offsets -1, 0, +1 in ascending order.
    // Ensure no earlier step in the active window produces the identical 6-digit code.
    let code = await generate({
      secret: normalizedSecret,
      epoch: targetStep * 30,
    });
    for (
      let earlierStep = Math.max(nowStep - 1, 0);
      earlierStep < targetStep;
      earlierStep += 1
    ) {
      const earlierCode = await generate({
        secret: normalizedSecret,
        epoch: earlierStep * 30,
      });
      if (earlierCode === code) {
        targetStep += 1;
        while (targetStep > Math.floor(nowMs() / 1000 / 30) + 1) {
          const waitMs = Math.max(
            50,
            (targetStep - 1) * 30 * 1000 + 25 - nowMs(),
          );
          await waitFn(waitMs);
        }
        code = await generate({
          secret: normalizedSecret,
          epoch: targetStep * 30,
        });
      }
    }

    this.lastUsedStepBySecret.set(normalizedSecret, targetStep);
    return {
      code,
      step: targetStep,
      deviceLabel: this.deviceLabel,
    };
  }
}

function readMailLink(text: string, label: RegExp, expectedUrl: URL) {
  const match = label.exec(text);
  if (!match?.[1]) throw new Error("The email contained no link.");
  const url = new URL(match[1]);
  const token = url.searchParams.get("token");
  if (
    url.origin !== expectedUrl.origin ||
    url.pathname !== expectedUrl.pathname ||
    !token
  ) {
    throw new Error(
      "The email link did not reach the expected portal page with a token.",
    );
  }
  return { url, token };
}

export function extractInvitationLink(
  emailText: string,
  expectedInviteUrl: string,
) {
  const { url, token } = readMailLink(
    emailText,
    /Accept your invitation:\s*(https?:\/\/\S+)/i,
    new URL(expectedInviteUrl),
  );
  const redacted = new URL(url);
  redacted.searchParams.set("token", "[REDACTED_INVITATION_TOKEN]");
  return {
    acceptUrl: url.toString(),
    redactedAcceptUrl: redacted.toString(),
    rawTokenForNavigationOnly: token,
  };
}

export function extractPasswordResetTarget(
  emailText: string,
  expectedOrigin: string,
) {
  const { url, token } = readMailLink(
    emailText,
    /Reset your password:\s*(https?:\/\/\S+)/i,
    new URL("/reset-password", expectedOrigin),
  );
  return {
    resetUrl: url.toString(),
    redactedResetUrl: `${url.origin}/reset-password?token=[REDACTED_RESET_TOKEN]`,
    rawTokenForNavigationOnly: token,
  };
}

const SENSITIVE_KEY_PATTERN =
  /^(password|currentPassword|newPassword|secret|otpauthUri|otpauth_uri|recoveryCodes|recovery_codes|rawToken|invitationToken|resetToken|accessToken|access_token|cookie|set-cookie|authorization)$/i;

const TOKEN_QUERY_PATTERN = /([?&]token=)[^&\s"']+/gi;
const OTPAUTH_URI_PATTERN = /otpauth:\/\/totp\/[^\s"']+/gi;
const OPAQUE_PREFIXED_TOKEN_PATTERN =
  /\b(?:ai|ti|fi|prt)_[A-Za-z0-9_-]{12,}\b/g;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const RECOVERY_CODE_PATTERN = /\b[A-Z2-9]{4}-[A-Z2-9]{4}\b/g;

export function redactStringSecrets(
  input: string,
  extraForbiddenLiterals: readonly string[] = [],
): string {
  let output = input
    .replace(TOKEN_QUERY_PATTERN, "$1[REDACTED_TOKEN]")
    .replace(OTPAUTH_URI_PATTERN, "otpauth://totp/[REDACTED_OTPAUTH_URI]")
    .replace(OPAQUE_PREFIXED_TOKEN_PATTERN, "[REDACTED_TOKEN]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(RECOVERY_CODE_PATTERN, "[REDACTED_RECOVERY_CODE]");

  for (const literal of extraForbiddenLiterals) {
    const trimmed = literal?.trim();
    if (trimmed && trimmed.length >= 6) {
      output = output.split(trimmed).join("[REDACTED_SECRET]");
    }
  }
  return output;
}

export function redactHostedJourneySecrets<T>(
  value: T,
  extraForbiddenLiterals: readonly string[] = [],
): T {
  if (typeof value === "string") {
    return redactStringSecrets(value, extraForbiddenLiterals) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      redactHostedJourneySecrets(item, extraForbiddenLiterals),
    ) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = Array.isArray(entryValue)
          ? ["[REDACTED_SECRET_LIST]"]
          : "[REDACTED_SECRET]";
      } else {
        out[key] = redactHostedJourneySecrets(
          entryValue,
          extraForbiddenLiterals,
        );
      }
    }
    return out as T;
  }
  return value;
}

export function assertNoLeakedSecretsInEvidence(
  serializedJson: string,
  forbiddenLiterals: readonly string[],
): void {
  if (OTPAUTH_URI_PATTERN.test(serializedJson)) {
    OTPAUTH_URI_PATTERN.lastIndex = 0;
    if (
      serializedJson.includes("secret=") ||
      !/otpauth:\/\/totp\/\[REDACTED_OTPAUTH_URI\]/.test(serializedJson)
    ) {
      throw new Error("Evidence contains an unredacted otpauth:// URI.");
    }
  }
  OTPAUTH_URI_PATTERN.lastIndex = 0;

  if (OPAQUE_PREFIXED_TOKEN_PATTERN.test(serializedJson)) {
    OPAQUE_PREFIXED_TOKEN_PATTERN.lastIndex = 0;
    throw new Error(
      "Evidence contains an unredacted invitation or password-reset token.",
    );
  }
  OPAQUE_PREFIXED_TOKEN_PATTERN.lastIndex = 0;

  if (JWT_PATTERN.test(serializedJson)) {
    JWT_PATTERN.lastIndex = 0;
    throw new Error("Evidence contains an unredacted JWT bearer token.");
  }
  JWT_PATTERN.lastIndex = 0;

  for (const literal of forbiddenLiterals) {
    const trimmed = literal?.trim();
    if (trimmed && trimmed.length >= 6 && serializedJson.includes(trimmed)) {
      throw new Error(
        "Evidence contains an unredacted secret value from the rehearsal.",
      );
    }
  }
}

export function buildFourPortalHostedJourneyClassification() {
  return {
    acceptanceKey:
      "four_portal_password_hosted_rehearsal_and_real_surface_readback_classified" as const,
    taskId: "FOUR-PORTAL-PASSWORD-HOSTED-JOURNEY-20261123",
    sourceTaskId: "PWD-LOGIN-012",
    authenticatorDevice: {
      deviceLabel: SIMULATED_AUTHENTICATOR_DEVICE_LABEL,
      simulatedDeviceOperation: true,
      backendTotpVerification: "real_totp_service_rfc6238_and_pg_anti_replay",
      modifiesExistingHumanTestAccounts: false,
    },
    smtpDeliveryInHostedRehearsal: {
      transport: "local_smtp_sim_127_0_0_1_2526",
      reusesAgencySmtpInboxHelper:
        "tests/e2e/agency-portal-business/smtp-inbox.ts",
      rawTokensAndSecretsRedacted: true,
    },
    fourPortalScopes: {
      tenantConsoleWeb: {
        portal: "tenant-console-web",
        realm: "tenant",
        bffPackage: "@drts/tenant-auth",
        invitationUri: "/invite?token=[REDACTED_TOKEN]",
        loginUri: "/login",
        totpSetupUri: "/account/security/totp",
        accountSecurityUri: "/account/security",
        forgotPasswordUri: "/forgot-password",
        resetPasswordUri: "/reset-password?token=[REDACTED_TOKEN]",
      },
      enterpriseDispatchWeb: {
        portal: "enterprise-dispatch-web",
        realm: "tenant",
        bffPackage: "@drts/tenant-auth",
        sharesTenantMemberWith: "tenant-console-web",
        passwordResetEmailPortal: "tenant-console-web",
        inventsSeparateInvitationUri: false,
        unauthenticatedLandingGate:
          "EnterpriseGatePage(kind='auth-required') -> /login",
        loginUri: "/login",
        totpSetupUri: "/account/security/totp",
        accountSecurityUri: "/account/security",
        forgotPasswordUri: "/forgot-password",
        resetPasswordUri: "/reset-password?token=[REDACTED_TOKEN]",
      },
      agencyPortalWeb: {
        portal: "agency-portal-web",
        realm: "agency",
        bffPackage: "@drts/agency-auth",
        invitationUri: "/invite?token=[REDACTED_TOKEN]",
        loginUri: "/login",
        totpSetupUri: "/account/security/totp",
        accountSecurityUri: "/account/security",
        forgotPasswordUri: "/forgot-password",
        resetPasswordUri: "/reset-password?token=[REDACTED_TOKEN]",
        preservesExistingGoogleOidcExporterJourney: true,
        preservesPr3367SharedAgencyJob: true,
      },
      fleetPartnerPortalWeb: {
        portal: "fleet-partner-portal-web",
        realm: "partner",
        bffRoute:
          "apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts",
        invitationUri: "/invite?token=[REDACTED_TOKEN]",
        loginUri: "/login",
        totpSetupUri: "/account/security/totp",
        accountSecurityUri: "/account/security",
        forgotPasswordUri: "/forgot-password",
        resetPasswordUri: "/reset-password?token=[REDACTED_TOKEN]",
      },
    },
    separateExternalAndSharedDevFormalAcceptance: {
      classification:
        "hosted_rehearsal_uses_smtp_sim_and_simulated_totp_fixture__real_smtp_and_physical_authenticator_shared_dev_formal_acceptance_tracked_separately",
      trackedItems: [
        {
          id: "PWD-LOGIN-012",
          scope:
            "Four-portal shared-dev live SMTP inbox delivery, physical TOTP authenticator enrollment/login, and forgot/reset password formal acceptance across tenant-console-web, enterprise-dispatch-web, agency-portal-web, and fleet-partner-portal-web",
          reference:
            "docs/02-architecture/portal-password-login-20261113/02_implementation_tasks.md",
        },
        {
          id: "FLEET-ONB-009",
          scope:
            "Fleet Partner Portal shared-dev live onboarding, real SMTP invitation delivery, and physical authenticator/OIDC formal acceptance",
          reference:
            ".local/system-gap-inventory-20261122/external-execution-packet.csv",
        },
      ],
    },
  };
}
