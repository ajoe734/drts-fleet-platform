import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Optional,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  AgencyBootstrapSession,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentitySessionRecord,
  CreatePartnerBootstrapSessionCommand,
  DriverDeviceProvisioningSession,
  CreateTenantBootstrapSessionCommand,
  IamCallbackSessionExchangeCommand,
  IamSessionRevokeCommand,
  IdentityContext,
  IssueDriverDeviceInvitationCommand,
  PartnerBootstrapSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
  TenantBootstrapSession,
  TenantOidcSessionExchangeCommand,
  TenantPortalProfile,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import {
  getAgencyRoleScopes,
  getTenantRoleScopes,
  AUTH_SCOPE_PRESETS,
  AUTH_TENANT_ROLE_SCOPE_PRESETS,
} from "../../common/auth/auth.constants";
import { getIamFleetRoleScopes } from "@drts/contracts";
import {
  toPublicPartnerAuthError,
  toPublicTenantAuthError,
} from "../../common/iam-error-codes";
import {
  isJwtKeyMaterialNotConfiguredError,
  JwtAuthService,
} from "../../common/auth/jwt-auth.service";
import { validateInternalKey } from "../../common/auth/internal-key.middleware";
import { extractBootstrapRequestIdentity } from "../../common/auth/auth.extractor";
import type {
  AuthBootstrapHeaders,
  AuthRealm,
  AuthActorType,
} from "../../common/auth/auth.types";
import {
  OPEN_ROUTE_RATE_LIMIT,
  READ_HEAVY_RATE_LIMIT,
} from "../../common/throttling/rate-limit.constants";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  DEV_MFA_WAIVED_AMR,
  hasTrustedMfa,
  isDevWorkforceMfaWaiverEnabled,
} from "../../common/auth/trusted-mfa.policy";
import {
  detectAuthEnvironment,
  isOrdinaryLoginMfaRequired,
} from "../../config/auth-startup-config";
import { extractIapJwtAssertion } from "@drts/control-plane-auth";
import { DatabaseService } from "../../common/db/database.service";
import {
  PasswordHashingService,
  PasswordPepperNotConfiguredError,
} from "../../common/auth/password-hashing.service";
import { PASSWORD_MAX_LENGTH } from "../../common/auth/password-policy.service";
import { AgencyDirectoryRepository } from "../agency-access/agency-directory.repository";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { IAPSubjectAdapter } from "./iap-subject.adapter";
import { OidcPkceService } from "./oidc-pkce.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import {
  IdentityRepository,
  type OidcBoundTenantUser,
} from "../identity/identity.repository";
import {
  maskSessionRecord,
  validateCsrfHeader,
} from "./session-masking.utility";
import {
  extractWorkloadIdentityExchangeNonce,
  extractRequestedWorkloadTokenAudience,
  extractWorkloadIdentityAssertion,
  ServiceWorkloadIdentityAdapter,
} from "./service-workload-identity.adapter";
import {
  extractGoogleWorkloadIdentityAssertion,
  GoogleWorkloadIdentityAdapter,
  isCiTenantActorGateEnabled,
  resolveCiTenantActorGrant,
  isGoogleWorkloadIdentityNotConfigured,
  isGoogleWorkloadIdentityPrincipalNotRegistered,
} from "./google-workload-identity.adapter";
import { IdempotencyService } from "../../common/idempotency";
import { randomUUID } from "node:crypto";
import { PasswordPolicyService } from "../../common/auth/password-policy.service";
import { TenantInvitationDeliveryService } from "../tenant-partner/tenant-invitation-delivery.service";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import type { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { TotpCredentialRepository } from "./totp-credential.repository";
import {
  TotpCodeReplayedError,
  TotpInvalidCodeError,
  TotpRecoveryCodeInvalidError,
  TotpSecretNotConfirmedError,
  TotpService,
} from "./totp.service";

interface TokenRequest {
  headers: AuthBootstrapHeaders & { "x-drts-internal-key"?: string };
  method?: string;
  originalUrl?: string;
  url?: string;
}

type JwtExpiresIn = NonNullable<
  Extract<
    NonNullable<Parameters<JwtAuthService["sign"]>[1]>["expiresIn"],
    string
  >
>;

const TENANT_BOOTSTRAP_EXPIRES_IN: JwtExpiresIn = "8h";
const TENANT_BOOTSTRAP_FIXTURE_MODE = "fixture";
const TENANT_BOOTSTRAP_FIXTURE_MODE_ENV = "DRTS_TENANT_BOOTSTRAP_MODE" as const;

function resolveBootstrapTokenAssurance(identity: BootstrapRequestIdentity): {
  amr?: string[];
  acr?: string;
} {
  switch (identity.actorType) {
    case "platform_admin":
    case "ops_user":
      // Bootstrap headers (`x-actor-type: platform_admin|ops_user`) are a dev
      // fixture, not a verified IAP assertion: stamping `verified_iap_workforce`
      // / `aal2` here was a fabricated MFA claim (ENTRY-IAP-WORKFORCE-AUTH-20261005).
      // The real IAP path (`issueToken`'s `rawAssertion` branch) derives amr/acr
      // from `IAPSubjectAdapter.resolveSubject`'s verified assertion instead.
      // An explicit, audited dev waiver is the only way this identity clears
      // the workforce step-up gate without a real MFA signal; see
      // `isDevWorkforceMfaWaiverEnabled` in trusted-mfa.policy.ts.
      return isDevWorkforceMfaWaiverEnabled()
        ? { amr: [DEV_MFA_WAIVED_AMR] }
        : {};
    case "tenant_admin":
      return {
        amr: ["tenant_bootstrap_fixture"],
        acr: "aal1",
      };
    case "partner_api_key":
      return {
        amr: ["partner_api_key"],
        acr: "aal1",
      };
    default:
      return {};
  }
}

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  // Lazily built, not DI-provided: this controller only has IdentityRepository
  // injected, not a wired NotificationDeliveryService/TenantInvitationDeliveryService.
  // Built the same way PasswordHashingService is used elsewhere in this
  // codebase -- a direct `new`, reading live env on first use -- rather than
  // widening the module's provider graph for one feature.
  private passwordResetDelivery?: TenantInvitationDeliveryService;

  // PasswordPolicyService.constructor synchronously reads the bundled
  // common/breached password list from disk; one instance per controller
  // lifetime instead of per request.
  private readonly passwordPolicyService = new PasswordPolicyService();

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly driverDeviceSessionService: DriverDeviceSessionService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    private readonly iapSubjectAdapter?: IAPSubjectAdapter,
    @Optional()
    private readonly serviceWorkloadIdentityAdapter?: ServiceWorkloadIdentityAdapter,
    @Optional()
    private readonly identityRepository?: IdentityRepository,
    // Appended, and optional, so the positional contract the existing tests
    // construct this controller with is unchanged. The module always provides
    // it; `requireOidcPkceService` turns its absence into a clear failure
    // rather than a property access on undefined.
    @Optional()
    private readonly oidcPkceService?: OidcPkceService,
    // Appended, and optional, for the same reason as `oidcPkceService` above.
    @Optional()
    private readonly googleWorkloadIdentityAdapter?: GoogleWorkloadIdentityAdapter,
    @Optional()
    private readonly idempotencyService?: IdempotencyService,
    // Appended, and optional, for the same reason as `oidcPkceService` above
    // (PWD-LOGIN-005). `DatabaseService` and `AgencyDirectoryRepository` are
    // both `@Global()`-provided, so no `AuthModule` wiring is needed for
    // Nest to supply them here.
    @Optional()
    private readonly databaseService?: DatabaseService,
    @Optional()
    private readonly agencyDirectoryRepository?: AgencyDirectoryRepository,
    // Appended, and optional, for the same reason as `oidcPkceService` above
    // (PWD-LOGIN-008). Both are always provided by `AuthModule`; `@Optional`
    // only lets existing fixtures that construct this controller with the
    // pre-PWD-LOGIN-008 positional argument list keep compiling, in which
    // case `resolvePasswordLoginAmr` below falls back to the pre-TOTP
    // password-only `amr`.
    @Optional()
    private readonly totpService?: TotpService,
    @Optional()
    private readonly totpCredentialRepository?: TotpCredentialRepository,
  ) {}

  private requireOidcPkceService(): OidcPkceService {
    if (!this.oidcPkceService) {
      throw new ApiRequestError(
        503,
        "AUTH_OIDC_UNAVAILABLE",
        "OIDC login is not configured on this deployment.",
      );
    }
    return this.oidcPkceService;
  }

  private requireIdempotencyService(): IdempotencyService {
    if (!this.idempotencyService) {
      throw new ApiRequestError(
        500,
        "IDEMPOTENCY_UNAVAILABLE",
        "Idempotency service is required for this operation.",
      );
    }
    return this.idempotencyService;
  }

  /**
   * PWD-LOGIN-005 (SA/SD §4,
   * docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md):
   * account-not-found, wrong-password, not-yet-invited and disabled all
   * deny through this single path so every response carries the exact same
   * code/message/status. Only `security_events.password_login.denied`
   * (reasonCode, never persisted to the client) distinguishes them.
   *
   * `partner` is supported for the `fleet_partner` business type (Fleet269,
   * `FLEET-STAFF-ONBOARDING-20261114` SA/SD §3): role/scope resolution goes
   * directly through `findMembershipsByPrincipalId` (same query shape as
   * `manageFleetHumanRole`), never through `exchangePartnerCallbackSession`'s
   * `partner_user_identity_links` lookup, since a password-login principal
   * has no Google `sub` to link. No production invitation-acceptance branch
   * writes a partner-realm `identity_password_credentials` row yet (that is
   * `FLEET-ONB-004`, which depends on this task); until it ships, a
   * partner-realm attempt simply finds no matching membership and falls
   * through to the same uniform denial as every other realm.
   */
  private denyPasswordLogin(): never {
    throw new ApiRequestError(
      401,
      "AUTHENTICATION_FAILED",
      "The email or password is incorrect, or the account is not available.",
    );
  }

  private recordPasswordLoginEvent(params: {
    outcome: "success" | "denied";
    realm: "tenant" | "agency" | "partner";
    reasonCode?: string | null;
    actorId?: string | null;
    tokenId?: string | null;
    tenantId?: string | null;
    partnerId?: string | null;
    meta: { sourceIp?: string; userAgent?: string; requestId?: string };
  }): void {
    this.securityEventsService?.recordEvent({
      actorId: params.actorId ?? null,
      actorType:
        params.realm === "agency"
          ? "agency_user"
          : params.realm === "partner"
            ? "partner_user"
            : "tenant_admin",
      subjectId: params.actorId ?? null,
      realm: params.realm,
      tenantId: params.tenantId ?? null,
      partnerId: params.partnerId ?? null,
      eventType:
        params.outcome === "success"
          ? "password_login.issued"
          : "password_login.denied",
      eventFamily: "auth",
      outcome: params.outcome,
      severity: params.outcome === "success" ? "low" : "medium",
      targetType: "password_login",
      targetId: null,
      sessionId: null,
      tokenId: params.tokenId ?? null,
      authMethods: ["password"],
      sourceIp: params.meta.sourceIp ?? null,
      userAgent: params.meta.userAgent ?? null,
      requestId: params.meta.requestId ?? null,
      traceId: null,
      reasonCode: params.reasonCode ?? null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: null,
      maskedContext: null,
    });
  }

  private requirePasswordHashingService(): PasswordHashingService {
    try {
      return new PasswordHashingService();
    } catch (error) {
      if (error instanceof PasswordPepperNotConfiguredError) {
        throw new ApiRequestError(
          503,
          "PASSWORD_LOGIN_UNAVAILABLE",
          "Password login is not available on this deployment.",
        );
      }
      throw error;
    }
  }

  /**
   * SA/SD §4 (docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md:116)
   * requires `totp.verified`/`totp.denied`/`totp.recovery_used` alongside the
   * `password_login.*` events; this is the single seam `resolvePasswordLoginAmr`
   * routes all three realms' TOTP outcomes through.
   */
  private recordTotpEvent(params: {
    outcome: "success" | "denied";
    eventType: "totp.verified" | "totp.denied" | "totp.recovery_used";
    realm: "tenant" | "agency" | "partner";
    reasonCode?: string | null;
    actorId: string;
    authMethod: "totp" | "recovery_code";
    tenantId?: string | null | undefined;
    partnerId?: string | null | undefined;
    meta: { sourceIp?: string; userAgent?: string; requestId?: string };
  }): void {
    this.securityEventsService?.recordEvent({
      actorId: params.actorId,
      actorType:
        params.realm === "agency"
          ? "agency_user"
          : params.realm === "partner"
            ? "partner_user"
            : "tenant_admin",
      subjectId: params.actorId,
      realm: params.realm,
      tenantId: params.tenantId ?? null,
      partnerId: params.partnerId ?? null,
      eventType: params.eventType,
      eventFamily: "auth",
      outcome: params.outcome,
      severity: params.outcome === "success" ? "low" : "medium",
      targetType: "totp",
      targetId: null,
      sessionId: null,
      tokenId: null,
      authMethods: [params.authMethod],
      sourceIp: params.meta.sourceIp ?? null,
      userAgent: params.meta.userAgent ?? null,
      requestId: params.meta.requestId ?? null,
      traceId: null,
      reasonCode: params.reasonCode ?? null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: null,
      maskedContext: null,
    });
  }

  /**
   * PWD-LOGIN-008 (SA/SD §7/§8): the password-login session's `amr` must
   * reflect what the server itself verified, never a client-asserted
   * boolean. Returns `["pwd"]` when the principal has no *confirmed* TOTP
   * credential (SA/SD §7: login still succeeds; the UI is responsible for
   * forcing enrollment for roles that require it -- PWD-LOGIN-009's scope,
   * not this one). Once a confirmed credential exists, a bypass of the
   * second factor must be rejected outright (SA/SD §11 "MFA 繞過"): returns
   * `null` if no code (or an invalid/replayed one) was presented, which the
   * caller turns into the same uniform `denyPasswordLogin()` response used
   * for every other password-login failure.
   */
  private async resolvePasswordLoginAmr(
    principalId: string,
    mfa: { totpCode?: string; recoveryCode?: string },
    context: {
      realm: "tenant" | "agency" | "partner";
      tenantId?: string | null | undefined;
      partnerId?: string | null | undefined;
      meta: { sourceIp?: string; userAgent?: string; requestId?: string };
    },
  ): Promise<string[] | null> {
    if (!this.totpService || !this.totpCredentialRepository) {
      return ["pwd"];
    }
    const credential =
      await this.totpCredentialRepository.findCredential(principalId);
    if (!credential?.confirmedAt) {
      return ["pwd"];
    }
    try {
      if (mfa.recoveryCode) {
        await this.totpService.verifyRecoveryCode(
          principalId,
          mfa.recoveryCode,
        );
        this.recordTotpEvent({
          outcome: "success",
          eventType: "totp.recovery_used",
          realm: context.realm,
          actorId: principalId,
          authMethod: "recovery_code",
          tenantId: context.tenantId,
          partnerId: context.partnerId,
          meta: context.meta,
        });
      } else if (mfa.totpCode) {
        await this.totpService.verifyLoginCode(principalId, mfa.totpCode);
        this.recordTotpEvent({
          outcome: "success",
          eventType: "totp.verified",
          realm: context.realm,
          actorId: principalId,
          authMethod: "totp",
          tenantId: context.tenantId,
          partnerId: context.partnerId,
          meta: context.meta,
        });
      } else {
        return null;
      }
    } catch (error) {
      if (
        error instanceof TotpSecretNotConfirmedError ||
        error instanceof TotpInvalidCodeError ||
        error instanceof TotpCodeReplayedError ||
        error instanceof TotpRecoveryCodeInvalidError
      ) {
        this.recordTotpEvent({
          outcome: "denied",
          eventType: "totp.denied",
          realm: context.realm,
          reasonCode: this.totpDenialReasonCode(error),
          actorId: principalId,
          authMethod: mfa.recoveryCode ? "recovery_code" : "totp",
          tenantId: context.tenantId,
          partnerId: context.partnerId,
          meta: context.meta,
        });
        return null;
      }
      throw error;
    }
    return ["pwd", "otp"];
  }

  private totpDenialReasonCode(error: unknown): string {
    if (error instanceof TotpSecretNotConfirmedError) {
      return "TOTP_NOT_CONFIRMED";
    }
    if (error instanceof TotpCodeReplayedError) {
      return "TOTP_CODE_REPLAYED";
    }
    if (error instanceof TotpRecoveryCodeInvalidError) {
      return "TOTP_RECOVERY_CODE_INVALID";
    }
    return "TOTP_INVALID_CODE";
  }

  private async issueTenantPasswordSession(
    principal: CanonicalIdentityPrincipalRecord,
    membership: CanonicalIdentityMembershipRecord,
    existingUser: OidcBoundTenantUser,
    mfa: { totpCode?: string; recoveryCode?: string },
    meta: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<TenantBootstrapSession | null> {
    const amr = await this.resolvePasswordLoginAmr(principal.principalId, mfa, {
      realm: "tenant",
      tenantId: existingUser.tenantId,
      meta,
    });
    if (!amr) {
      this.recordPasswordLoginEvent({
        outcome: "denied",
        realm: "tenant",
        reasonCode: "MFA_REQUIRED",
        actorId: existingUser.userId,
        tenantId: existingUser.tenantId,
        meta,
      });
      return null;
    }

    const scopes = [...(getTenantRoleScopes(existingUser.roleCode) ?? [])];
    const tokenVersion = Date.parse(existingUser.updatedAt);
    const authTimeIso = new Date().toISOString();
    const acr = "aal1";

    const issued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: existingUser.userId,
        principalId: principal.principalId,
        membershipId: membership.membershipId,
        subject: principal.principalId,
        realm: "tenant",
        tenantId: existingUser.tenantId,
        roleFamilies: ["tenant"],
        roles: [existingUser.roleCode],
        scopes,
        tokenVersion,
        authTime: authTimeIso,
        amr,
        acr,
        policyVersion: "v1",
        requestId: meta.requestId ?? null,
      },
      { expiresIn: "8h", tokenVersion },
    );

    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: existingUser.userId,
      realm: "tenant",
      tenantId: existingUser.tenantId,
      roleFamilies: ["tenant"],
      roles: [existingUser.roleCode],
      scopes,
      sessionId: issued.sessionId,
      tokenId: issued.tokenId,
      tokenVersion,
      authTime: issued.authTime,
      amr,
      acr,
      policyVersion: issued.policyVersion,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    this.recordPasswordLoginEvent({
      outcome: "success",
      realm: "tenant",
      actorId: existingUser.userId,
      tokenId: issued.tokenId,
      tenantId: existingUser.tenantId,
      meta,
    });

    const profile: TenantPortalProfile = {
      id: existingUser.userId,
      tenantId: existingUser.tenantId,
      fullName: existingUser.displayName,
      email: existingUser.email,
      roleCode: existingUser.roleCode,
    };

    return {
      accessToken: issued.token,
      tokenType: "Bearer",
      expiresIn: "8h",
      profile,
      identity,
    };
  }

  private async issueAgencyPasswordSession(
    snapshot: NonNullable<
      Awaited<
        ReturnType<IdentityRepository["findAgencyMembershipForPrincipal"]>
      >
    >,
    mfa: { totpCode?: string; recoveryCode?: string },
    meta: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<AgencyBootstrapSession | null> {
    const now = Date.now();
    const binding = snapshot.roleBindings.find(
      (candidate) =>
        Boolean(getAgencyRoleScopes(candidate.roleCode)) &&
        Boolean(candidate.validTo) &&
        Date.parse(candidate.validFrom) <= now &&
        now < Date.parse(candidate.validTo!),
    );
    if (!binding) {
      this.recordPasswordLoginEvent({
        outcome: "denied",
        realm: "agency",
        reasonCode: "AGENCY_ACCESS_NOT_ACTIVE",
        actorId: snapshot.principal.principalId,
        meta,
      });
      return null;
    }

    const agency = await this.agencyDirectoryRepository?.findById(
      snapshot.agencyId,
    );
    if (!agency || agency.status !== "active") {
      this.recordPasswordLoginEvent({
        outcome: "denied",
        realm: "agency",
        reasonCode: "AGENCY_ACCESS_NOT_ACTIVE",
        actorId: snapshot.principal.principalId,
        meta,
      });
      return null;
    }

    const amr = await this.resolvePasswordLoginAmr(
      snapshot.principal.principalId,
      mfa,
      { realm: "agency", meta },
    );
    if (!amr) {
      this.recordPasswordLoginEvent({
        outcome: "denied",
        realm: "agency",
        reasonCode: "MFA_REQUIRED",
        actorId: snapshot.principal.principalId,
        meta,
      });
      return null;
    }

    const scopes = [...(getAgencyRoleScopes(binding.roleCode) ?? [])];
    const tokenVersion = Math.max(
      ...[
        snapshot.principal.updatedAt,
        snapshot.membership.updatedAt,
        ...snapshot.roleBindings.map((candidate) => candidate.updatedAt),
      ].map((timestamp) => Date.parse(timestamp)),
    );
    const authTimeIso = new Date().toISOString();
    const acr = "aal1";

    const issued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "agency_user",
        actorId: snapshot.principal.principalId,
        principalId: snapshot.principal.principalId,
        membershipId: snapshot.membership.membershipId,
        subject: snapshot.principal.principalId,
        realm: "agency",
        tenantId: null,
        agencyId: snapshot.agencyId,
        roleFamilies: ["agency"],
        roles: [binding.roleCode],
        scopes,
        tokenVersion,
        authTime: authTimeIso,
        amr,
        acr,
        policyVersion: "v1",
        requestId: meta.requestId ?? null,
      },
      { expiresIn: "8h", ensurePrincipal: false, tokenVersion },
    );

    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "agency_user",
      actorId: snapshot.principal.principalId,
      principalId: snapshot.principal.principalId,
      membershipId: snapshot.membership.membershipId,
      realm: "agency",
      tenantId: null,
      agencyId: snapshot.agencyId,
      roleFamilies: ["agency"],
      roles: [binding.roleCode],
      scopes,
      sessionId: issued.sessionId,
      tokenId: issued.tokenId,
      tokenVersion,
      authTime: issued.authTime,
      amr,
      acr,
      policyVersion: issued.policyVersion,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    this.recordPasswordLoginEvent({
      outcome: "success",
      realm: "agency",
      actorId: snapshot.principal.principalId,
      tokenId: issued.tokenId,
      meta,
    });

    return {
      accessToken: issued.token,
      tokenType: "Bearer",
      expiresIn: "8h",
      identity,
      agency: { agencyId: agency.agencyId, displayName: agency.displayName },
      roleCode: binding.roleCode,
      accessValidTo: binding.validTo!,
    };
  }

  private async verifyPasswordAndLockout(
    hasher: PasswordHashingService,
    principal: CanonicalIdentityPrincipalRecord,
    password: string,
  ): Promise<"locked" | "no_credential" | "mismatch" | "ok"> {
    if (principal.status !== "active") {
      return "no_credential";
    }
    const credential =
      await this.identityRepository!.findPasswordCredentialByPrincipalId(
        principal.principalId,
      );
    if (!credential) {
      return "no_credential";
    }
    const state = await this.identityRepository!.getPasswordLoginLockoutState(
      principal.principalId,
    );
    if (state.lockedUntil && Date.parse(state.lockedUntil) > Date.now()) {
      return "locked";
    }
    const verification = await hasher.verify(password, {
      hash: credential.passwordHash,
      pepperVersion: credential.pepperVersion,
    });
    if (!verification.valid) {
      await this.identityRepository!.recordPasswordLoginFailure(
        principal.principalId,
      );
      return "mismatch";
    }
    await this.identityRepository!.recordPasswordLoginSuccess(
      principal.principalId,
    );
    if (verification.needsRehash) {
      const rehashed = await hasher.hash(password);
      await this.identityRepository!.updatePasswordCredentialHash(
        principal.principalId,
        rehashed,
      );
    }
    return "ok";
  }

  private async attemptTenantPasswordLogin(
    email: string,
    password: string,
    tenantId: string | undefined,
    mfa: { totpCode?: string; recoveryCode?: string },
    meta: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<TenantBootstrapSession | null> {
    const hasher = this.requirePasswordHashingService();
    const principals =
      await this.identityRepository!.findPrincipalsByEmail(email);
    for (const principal of principals) {
      const memberships =
        await this.identityRepository!.findMembershipsByPrincipalId(
          principal.principalId,
        );
      const membership = memberships.find(
        (candidate) =>
          candidate.realm === "tenant" &&
          (!tenantId || candidate.tenantId === tenantId),
      );
      if (!membership || !membership.tenantId) continue;
      const userId = /^tenant_user_role:(.+):membership$/.exec(
        membership.sourceRef ?? "",
      )?.[1];
      if (!userId) continue;

      const verifyOutcome = await this.verifyPasswordAndLockout(
        hasher,
        principal,
        password,
      );
      if (verifyOutcome !== "ok") {
        this.recordPasswordLoginEvent({
          outcome: "denied",
          realm: "tenant",
          reasonCode: verifyOutcome.toUpperCase(),
          actorId: principal.principalId,
          tenantId: membership.tenantId,
          meta,
        });
        return null;
      }

      const existingUser =
        await this.tenantPartnerService.findTenantUserForAuthentication(
          membership.tenantId,
          userId,
        );
      if (!existingUser || existingUser.status !== "active") {
        this.recordPasswordLoginEvent({
          outcome: "denied",
          realm: "tenant",
          reasonCode: "TENANT_USER_NOT_ACTIVE",
          actorId: principal.principalId,
          tenantId: membership.tenantId,
          meta,
        });
        return null;
      }

      return this.issueTenantPasswordSession(
        principal,
        membership,
        existingUser,
        mfa,
        meta,
      );
    }

    this.recordPasswordLoginEvent({
      outcome: "denied",
      realm: "tenant",
      reasonCode: "USER_NOT_FOUND",
      meta,
    });
    return null;
  }

  private async attemptAgencyPasswordLogin(
    email: string,
    password: string,
    agencyId: string | undefined,
    mfa: { totpCode?: string; recoveryCode?: string },
    meta: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<AgencyBootstrapSession | null> {
    const hasher = this.requirePasswordHashingService();
    const principals =
      await this.identityRepository!.findPrincipalsByEmail(email);
    for (const principal of principals) {
      const snapshot =
        await this.identityRepository!.findAgencyMembershipForPrincipal(
          principal.principalId,
        );
      if (!snapshot) continue;
      if (agencyId && agencyId !== snapshot.agencyId) continue;

      const verifyOutcome = await this.verifyPasswordAndLockout(
        hasher,
        principal,
        password,
      );
      if (verifyOutcome !== "ok") {
        this.recordPasswordLoginEvent({
          outcome: "denied",
          realm: "agency",
          reasonCode: verifyOutcome.toUpperCase(),
          actorId: principal.principalId,
          meta,
        });
        return null;
      }

      // `issueAgencyPasswordSession` records its own denial event (with the
      // specific reason: inactive access or failed MFA) before returning
      // null; it must not be re-recorded here with a generic reason.
      return this.issueAgencyPasswordSession(snapshot, mfa, meta);
    }

    this.recordPasswordLoginEvent({
      outcome: "denied",
      realm: "agency",
      reasonCode: "USER_NOT_FOUND",
      meta,
    });
    return null;
  }

  /** Fleet269 §3 (FLEET-STAFF-ONBOARDING-20261114 SA/SD): a partner-realm
   * password login has no Google `sub`, so it cannot go through
   * `exchangePartnerCallbackSession`'s `partner_user_identity_links` lookup.
   * It resolves the fleet-staff membership directly, the same way
   * `manageFleetHumanRole` does: `realm === "partner"` and
   * `scopeRef === "fleet:" + entrySlug` on a membership whose `sourceRef`
   * follows the `fleet_member:<entrySlug>:<principalId>` convention. */
  private async attemptPartnerPasswordLogin(
    email: string,
    password: string,
    partnerId: string | undefined,
    mfa: { totpCode?: string; recoveryCode?: string },
    meta: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<PartnerBootstrapSession | null> {
    const hasher = this.requirePasswordHashingService();
    const principals =
      await this.identityRepository!.findPrincipalsByEmail(email);
    for (const principal of principals) {
      if (
        principal.sourceRef !== `jwt_principal:partner:${principal.principalId}`
      ) {
        continue;
      }
      const memberships =
        await this.identityRepository!.findMembershipsByPrincipalId(
          principal.principalId,
        );
      const membership = memberships.find((candidate) => {
        if (candidate.realm !== "partner") return false;
        const entrySlug = /^fleet:(.+)$/.exec(candidate.scopeRef ?? "")?.[1];
        if (!entrySlug) return false;
        if (
          candidate.sourceRef !==
          `fleet_member:${entrySlug}:${principal.principalId}`
        ) {
          return false;
        }
        return (
          !partnerId ||
          entrySlug === partnerId ||
          candidate.partnerId === partnerId
        );
      });
      if (!membership) continue;

      const verifyOutcome = await this.verifyPasswordAndLockout(
        hasher,
        principal,
        password,
      );
      if (verifyOutcome !== "ok") {
        this.recordPasswordLoginEvent({
          outcome: "denied",
          realm: "partner",
          reasonCode: verifyOutcome.toUpperCase(),
          actorId: principal.principalId,
          partnerId: membership.partnerId,
          meta,
        });
        return null;
      }

      // `issuePartnerPasswordSession` records its own denial event (with the
      // specific reason: inactive access or failed MFA) before returning
      // null; it must not be re-recorded here with a generic reason.
      return this.issuePartnerPasswordSession(principal, membership, mfa, meta);
    }

    this.recordPasswordLoginEvent({
      outcome: "denied",
      realm: "partner",
      reasonCode: "USER_NOT_FOUND",
      meta,
    });
    return null;
  }

  /** Mirrors `exchangePartnerCallbackSession`'s fleet-staff session shape
   * (same `actorType`/`realm`/`roleFamilies`, same single-active-role rule)
   * but starting from an already-resolved membership instead of a
   * `partner_user_identity_links` row. */
  private async issuePartnerPasswordSession(
    principal: CanonicalIdentityPrincipalRecord,
    membership: CanonicalIdentityMembershipRecord,
    mfa: { totpCode?: string; recoveryCode?: string },
    meta: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<PartnerBootstrapSession | null> {
    const denyPartnerAccessNotActive = () => {
      this.recordPasswordLoginEvent({
        outcome: "denied",
        realm: "partner",
        reasonCode: "PARTNER_ACCESS_NOT_ACTIVE",
        actorId: principal.principalId,
        partnerId: membership.partnerId,
        meta,
      });
      return null;
    };
    if (membership.status !== "active") return denyPartnerAccessNotActive();
    const entrySlug = /^fleet:(.+)$/.exec(membership.scopeRef)?.[1];
    if (!entrySlug) return denyPartnerAccessNotActive();
    const matchedEntry = this.tenantPartnerService
      .listPartnerEntries(entrySlug)
      .find(
        (entry) =>
          entry.entrySlug === entrySlug &&
          entry.partnerId === membership.partnerId,
      );
    if (!matchedEntry) return denyPartnerAccessNotActive();

    const amr = await this.resolvePasswordLoginAmr(principal.principalId, mfa, {
      realm: "partner",
      partnerId: matchedEntry.partnerId,
      meta,
    });
    if (!amr) {
      this.recordPasswordLoginEvent({
        outcome: "denied",
        realm: "partner",
        reasonCode: "MFA_REQUIRED",
        actorId: principal.principalId,
        partnerId: matchedEntry.partnerId,
        meta,
      });
      return null;
    }

    const now = Date.now();
    const roleBindings =
      await this.identityRepository!.findRoleBindingsByMembershipId(
        membership.membershipId,
      );
    const activeRoles = roleBindings.filter(
      (binding) =>
        Boolean(getIamFleetRoleScopes(binding.roleCode)) &&
        binding.sourceRef ===
          `fleet_role:${entrySlug}:${principal.principalId}` &&
        Number.isFinite(Date.parse(binding.validFrom)) &&
        Date.parse(binding.validFrom) <= now &&
        (!binding.validTo ||
          (Number.isFinite(Date.parse(binding.validTo)) &&
            now < Date.parse(binding.validTo))),
    );
    const [role] = activeRoles;
    if (!role || activeRoles.length !== 1) return denyPartnerAccessNotActive();
    const scopes = [...getIamFleetRoleScopes(role.roleCode)!];
    const roles = [role.roleCode];
    const tokenVersion = Math.max(
      ...[
        principal.updatedAt,
        membership.updatedAt,
        role.updatedAt,
        matchedEntry.updatedAt,
      ].map((timestamp) => Date.parse(timestamp)),
    );
    const authTimeIso = new Date().toISOString();
    const acr = "aal1";

    const issued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "partner_user",
        actorId: principal.principalId,
        principalId: principal.principalId,
        membershipId: membership.membershipId,
        subject: principal.principalId,
        realm: "partner",
        tenantId: matchedEntry.tenantId ?? null,
        partnerId: matchedEntry.partnerId,
        partnerEntrySlug: matchedEntry.entrySlug,
        roleFamilies: ["partner"],
        roles,
        scopes,
        tokenVersion,
        authTime: authTimeIso,
        amr,
        acr,
        policyVersion: "v1",
        requestId: meta.requestId ?? null,
      },
      { expiresIn: "8h", tokenVersion },
    );

    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "partner_user",
      actorId: principal.principalId,
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      realm: "partner",
      tenantId: matchedEntry.tenantId ?? null,
      partnerId: matchedEntry.partnerId,
      partnerEntrySlug: matchedEntry.entrySlug,
      roleFamilies: ["partner"],
      roles,
      scopes,
      sessionId: issued.sessionId,
      tokenId: issued.tokenId,
      tokenVersion,
      authTime: issued.authTime,
      amr,
      acr,
      policyVersion: issued.policyVersion,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    this.recordPasswordLoginEvent({
      outcome: "success",
      realm: "partner",
      actorId: principal.principalId,
      tokenId: issued.tokenId,
      partnerId: matchedEntry.partnerId,
      meta,
    });

    return {
      accessToken: issued.token,
      tokenType: "Bearer",
      expiresIn: "8h",
      partnerEntry: matchedEntry,
      identity,
    };
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post(":realm/password-login")
  async passwordLogin(
    @Param("realm") realm: string,
    @Body()
    command: {
      email?: string;
      password?: string;
      tenantId?: string;
      agencyId?: string;
      partnerId?: string;
      totpCode?: string;
      recoveryCode?: string;
    },
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (realm !== "tenant" && realm !== "agency" && realm !== "partner") {
      throw new ApiRequestError(
        400,
        "AUTH_REALM_INVALID",
        `Password login is not supported for realm '${realm}'.`,
      );
    }
    if (
      typeof command?.email !== "string" ||
      !command.email.trim() ||
      typeof command?.password !== "string" ||
      !command.password ||
      command.password.length > PASSWORD_MAX_LENGTH
    ) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "Email and password are required.",
      );
    }
    if (!this.identityRepository) {
      throw new ApiRequestError(
        503,
        "AUTH_IDENTITY_UNAVAILABLE",
        "Identity authority is not available.",
      );
    }

    const email = command.email.trim().toLowerCase();
    const meta = this.buildMeta(forwardedFor, realIp, userAgent, requestId);
    // Server-verified only (SA/SD §9): these are raw candidate codes that
    // `resolvePasswordLoginAmr` cryptographically verifies before any `amr`
    // is derived from them. No client-asserted boolean (e.g. `mfa: true`)
    // is ever accepted here.
    const MFA_CODE_MAX_LENGTH = 64;
    const mfa: { totpCode?: string; recoveryCode?: string } = {};
    if (
      typeof command.totpCode === "string" &&
      command.totpCode.trim() &&
      command.totpCode.length <= MFA_CODE_MAX_LENGTH
    ) {
      mfa.totpCode = command.totpCode.trim();
    }
    if (
      typeof command.recoveryCode === "string" &&
      command.recoveryCode.trim() &&
      command.recoveryCode.length <= MFA_CODE_MAX_LENGTH
    ) {
      mfa.recoveryCode = command.recoveryCode.trim();
    }

    const session =
      realm === "tenant"
        ? await this.attemptTenantPasswordLogin(
            email,
            command.password,
            command.tenantId?.trim() || undefined,
            mfa,
            meta,
          )
        : realm === "agency"
          ? await this.attemptAgencyPasswordLogin(
              email,
              command.password,
              command.agencyId?.trim() || undefined,
              mfa,
              meta,
            )
          : await this.attemptPartnerPasswordLogin(
              email,
              command.password,
              command.partnerId?.trim() || undefined,
              mfa,
              meta,
            );

    if (!session) {
      this.denyPasswordLogin();
    }
    return toApiSuccessEnvelope(session, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Get(":realm/login")
  getOidcLoginUrl(
    @Param("realm") realm: AuthRealm,
    @Query("redirect_uri") redirectUri?: string,
    @Query("tenant_id") tenantId?: string,
    @Query("partner_id") partnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (realm !== "tenant" && realm !== "partner" && realm !== "agency") {
      throw new ApiRequestError(
        400,
        "AUTH_REALM_INVALID",
        `Unsupported OIDC realm '${realm}'. Only 'tenant', 'partner' and 'agency' are supported.`,
      );
    }
    const result = this.requireOidcPkceService().generateLoginParameters(
      realm,
      {
        redirectUri: redirectUri ?? null,
        tenantId: tenantId ?? null,
        partnerId: partnerId ?? null,
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  private assertPasswordLoginRealm(
    realm: string,
  ): "tenant" | "agency" | "partner" {
    if (realm !== "tenant" && realm !== "partner" && realm !== "agency") {
      throw new ApiRequestError(
        400,
        "AUTH_REALM_INVALID",
        `Unsupported password-login realm '${realm}'. Only 'tenant', 'partner' and 'agency' are supported.`,
      );
    }
    return realm;
  }

  /** Lazily built (see field doc comment): read live env on first use rather
   * than at controller construction, so tests and dev fixtures that set
   * notification env vars after construction still take effect. */
  private resolvePasswordResetDelivery(): TenantInvitationDeliveryService {
    if (!this.passwordResetDelivery) {
      let notificationDeliveryService: NotificationDeliveryService | null;
      try {
        notificationDeliveryService = createNotificationDeliveryServiceFromEnv(
          process.env,
          this.identityRepository?.getDatabaseService(),
        );
      } catch {
        notificationDeliveryService = null;
      }
      this.passwordResetDelivery = new TenantInvitationDeliveryService(
        notificationDeliveryService ?? null,
      );
    }
    return this.passwordResetDelivery;
  }

  /** The public response for password-reset/request must never depend on
   * whether this succeeds, throws, or finds nothing (SA/SD §6, mirroring the
   * unified-response rule in §4): every branch below is swallowed by the
   * caller, never surfaced as a different status or body. */
  private async dispatchPasswordResetEmail(
    realm: "tenant" | "agency" | "partner",
    email: string,
  ): Promise<void> {
    if (!this.identityRepository) return;
    const match =
      await this.identityRepository.findActivePrincipalAndMembershipForRealmByEmail(
        email,
        realm,
      );
    if (!match) return;
    const credential =
      await this.identityRepository.findPasswordCredentialByPrincipalId(
        match.principal.principalId,
      );
    // No password credential (e.g. Google-only principal): nothing to reset,
    // but the caller still returns the same 200 either way.
    if (!credential) return;

    const { rawToken, expiresAt } =
      await this.identityRepository.createPasswordResetToken(
        match.principal.principalId,
      );
    await this.resolvePasswordResetDelivery().sendPasswordReset({
      dedupeKey: `${match.principal.principalId}:${randomUUID()}`,
      realm,
      tenantId: realm === "tenant" ? match.membership.tenantId : null,
      recipientEmail: match.principal.email ?? email,
      expiresAt,
      rawToken,
    });

    this.securityEventsService?.recordEvent({
      actorId: match.principal.principalId,
      actorType: "system",
      subjectId: match.principal.principalId,
      realm,
      tenantId: match.membership.tenantId,
      partnerId: match.membership.partnerId,
      eventType: "password_reset.requested",
      eventFamily: "credential",
      outcome: "success",
      severity: "medium",
      targetType: "principal",
      targetId: match.principal.principalId,
      sessionId: null,
      tokenId: null,
      authMethods: [],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: "self_service_password_reset_request",
      approvalId: null,
      beforeSummary: null,
      afterSummary: null,
      maskedContext: null,
    });
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post(":realm/password-reset/request")
  async requestPasswordReset(
    @Param("realm") realm: AuthRealm,
    @Body() command: { email?: string } | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const resolvedRealm = this.assertPasswordLoginRealm(realm);
    const email = command?.email?.trim();
    if (email) {
      try {
        await this.dispatchPasswordResetEmail(resolvedRealm, email);
      } catch (error) {
        this.logger.warn(
          `password-reset/request for realm '${resolvedRealm}' did not complete internally, but the public response is unaffected: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    // Always the same 200 body: this must never reveal whether the email
    // matched an account, whether that account has a password set, or
    // whether delivery actually succeeded (SA/SD §6).
    return toApiSuccessEnvelope({ accepted: true }, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post(":realm/password-reset/confirm")
  async confirmPasswordReset(
    @Param("realm") realm: AuthRealm,
    @Body() command: { token?: string; password?: string } | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const resolvedRealm = this.assertPasswordLoginRealm(realm);
    const token = command?.token?.trim();
    const password = command?.password;
    if (!token || !password) {
      throw new ApiRequestError(
        400,
        "PASSWORD_RESET_INVALID",
        "A reset token and new password are required.",
      );
    }
    // PWD-LOGIN-007 (TOTP enrollment/confirmation) has not merged yet, so
    // there is no confirmed-TOTP lookup available here; always applying the
    // stricter single-factor minimum (SA/SD §3) is conservative -- it can
    // only reject passwords the final MFA-aware policy would also accept
    // under the shorter bound, never the reverse.
    const policyResult = this.passwordPolicyService.evaluate(password, {
      totpEnabled: false,
    });
    if (!policyResult.valid) {
      throw new ApiRequestError(
        400,
        "PASSWORD_POLICY_VIOLATION",
        "Password does not meet the policy requirements.",
        { reason: policyResult.reason },
      );
    }
    if (!this.identityRepository) {
      throw new ApiRequestError(
        503,
        "AUTH_IDENTITY_UNAVAILABLE",
        "Password reset is not available on this deployment.",
      );
    }

    const tokenInvalidError = () =>
      new ApiRequestError(
        400,
        "PASSWORD_RESET_TOKEN_INVALID",
        "This password reset link is invalid or has expired.",
      );

    const consumed =
      await this.identityRepository.consumePasswordResetToken(token);
    if (!consumed) throw tokenInvalidError();

    const principal = await this.identityRepository.findPrincipalById(
      consumed.principalId,
    );
    // A token issued for a principal that is no longer active (e.g.
    // suspended between request and confirm) must fail the same generic way
    // as an unknown/expired token -- never a more specific error.
    if (!principal || principal.status !== "active") throw tokenInvalidError();

    const memberships =
      await this.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) =>
        candidate.realm === resolvedRealm && candidate.status === "active",
    );
    if (!membership) throw tokenInvalidError();

    let hashed: Awaited<ReturnType<PasswordHashingService["hash"]>>;
    try {
      hashed = await new PasswordHashingService().hash(password);
    } catch (error) {
      if (error instanceof PasswordPepperNotConfiguredError) {
        throw new ApiRequestError(
          503,
          "PASSWORD_LOGIN_UNAVAILABLE",
          "Password-based login is not available on this deployment.",
        );
      }
      throw error;
    }

    await this.identityRepository.setPasswordCredentialForPrincipal(
      principal.principalId,
      {
        passwordHash: hashed.hash,
        passwordAlgo: hashed.algo,
        pepperVersion: hashed.pepperVersion,
      },
    );

    const revokedCount =
      await this.identityRepository.revokeAllSessionsForPrincipal(
        principal.principalId,
        "password_reset",
        principal.principalId,
      );

    if (principal.email) {
      try {
        await this.resolvePasswordResetDelivery().sendPasswordResetCompletedNotice(
          {
            dedupeKey: `${principal.principalId}:${randomUUID()}`,
            realm: resolvedRealm,
            tenantId: resolvedRealm === "tenant" ? membership.tenantId : null,
            recipientEmail: principal.email,
          },
        );
      } catch (error) {
        this.logger.warn(
          `password-reset/confirm completion notice did not send for principal ${principal.principalId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.securityEventsService?.recordEvent({
      actorId: principal.principalId,
      actorType: "system",
      subjectId: principal.principalId,
      realm: resolvedRealm,
      tenantId: membership.tenantId,
      partnerId: membership.partnerId,
      eventType: "password_reset.completed",
      eventFamily: "credential",
      outcome: "success",
      severity: "medium",
      targetType: "principal",
      targetId: principal.principalId,
      sessionId: null,
      tokenId: null,
      authMethods: [],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: "self_service_password_reset_confirm",
      approvalId: null,
      beforeSummary: null,
      afterSummary: { revokedSessionCount: revokedCount },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { passwordReset: true, revokedSessionCount: revokedCount },
      requestId,
    );
  }

  // PWD-LOGIN-SESSION-ADD-PASSWORD-20261114 (SA/SD §1/§9/§12,
  // docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md):
  // a fresh, trusted-MFA session for a role that requires it, used both to
  // gate a Google-only principal's first password (§1) and as the
  // `currentPassword`-less fallback for an existing password's change (§9).
  private static readonly ACCOUNT_SECURITY_FRESH_SESSION_MS = 15 * 60 * 1000;

  private isFreshSessionAuthTime(
    identity: BootstrapRequestIdentity,
    windowMs: number,
  ): boolean {
    const authTimeMs = identity.authTime ? Date.parse(identity.authTime) : NaN;
    return Number.isFinite(authTimeMs) && Date.now() - authTimeMs <= windowMs;
  }

  /** Mirrors the tenant_admin/tenant_ops_admin role-sensitivity
   * `exchangeTenantCallbackSession` already enforces at OIDC login time
   * (oidc-pkce.service.ts) plus the existing ordinary-login MFA switch
   * (`isOrdinaryLoginMfaRequired`), rather than inventing a third MFA-role
   * policy for this one route. */
  private accountSecurityMfaRequired(
    realm: "tenant" | "agency" | "partner",
    roles: readonly string[],
  ): boolean {
    return (
      isOrdinaryLoginMfaRequired() ||
      (realm === "tenant" &&
        roles.some((role) =>
          ["tenant_admin", "tenant_ops_admin"].includes(role),
        ))
    );
  }

  /**
   * SA/SD §1: adding a *first* password credential to a Google-only
   * principal only needs fresh, trusted MFA when the session's role is one
   * this deployment already requires MFA for; an ordinary role's plain
   * active session (already asserted by the caller) is sufficient on its
   * own, exactly as the existing session is already enough for every other
   * action that role can take.
   */
  private hasQualifyingFreshMfaForRoleSensitiveSetup(
    identity: BootstrapRequestIdentity,
    realm: "tenant" | "agency" | "partner",
  ): boolean {
    if (!this.accountSecurityMfaRequired(realm, identity.roles ?? [])) {
      return true;
    }
    return (
      hasTrustedMfa(identity) &&
      this.isFreshSessionAuthTime(
        identity,
        AuthController.ACCOUNT_SECURITY_FRESH_SESSION_MS,
      )
    );
  }

  /**
   * SA/SD §9: changing an *existing* password credential without supplying
   * `currentPassword` instead requires the session itself to be recently
   * authenticated ("fresh session"), regardless of role -- unlike the
   * role-sensitive MFA gate above, this is the same bar for every realm.
   */
  private hasQualifyingFreshSessionForChange(
    identity: BootstrapRequestIdentity,
  ): boolean {
    return this.isFreshSessionAuthTime(
      identity,
      AuthController.ACCOUNT_SECURITY_FRESH_SESSION_MS,
    );
  }

  private denyCredentialPasswordChange(message: string): never {
    throw new ApiRequestError(401, "AUTHENTICATION_FAILED", message);
  }

  private recordCredentialPasswordEvent(params: {
    outcome: "success" | "denied";
    action: "created" | "changed";
    realm: "tenant" | "agency" | "partner";
    reasonCode?: string | null;
    principalId: string;
    tenantId?: string | null;
    partnerId?: string | null;
  }): void {
    this.securityEventsService?.recordEvent({
      actorId: params.principalId,
      actorType:
        params.realm === "agency"
          ? "agency_user"
          : params.realm === "partner"
            ? "partner_user"
            : "tenant_admin",
      subjectId: params.principalId,
      realm: params.realm,
      tenantId: params.tenantId ?? null,
      partnerId: params.partnerId ?? null,
      eventType:
        params.outcome === "success"
          ? `password_credential.${params.action}`
          : "password_credential.denied",
      eventFamily: "credential",
      outcome: params.outcome,
      severity: params.outcome === "success" ? "low" : "medium",
      targetType: "password_credential",
      targetId: params.principalId,
      sessionId: null,
      tokenId: null,
      authMethods: ["password"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: params.reasonCode ?? null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: null,
      maskedContext: null,
    });
  }

  /**
   * SA/SD §1 (docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md:34),
   * §9 (:169) and §12 (:193): the one way an already-authenticated session
   * adds a first password credential (Google-only principal) or changes an
   * existing one. `principalId`/`realm`/`tenantId` all come from the
   * verified session (`identity`); nothing in the request body can select a
   * different identity, assert MFA, or bypass `PASSWORD_LOGIN_ENABLED`'s
   * fail-closed pepper gate (`requirePasswordHashingService`). Reuses
   * `IdentityRepository.setPasswordCredentialForPrincipal` -- the same
   * upsert the invitation-accept and password-reset/confirm paths already
   * write through -- so there is exactly one credential-write path, never a
   * second table or auth model.
   */
  @RequireRealms("tenant", "agency", "partner")
  @Post(":realm/credentials/password")
  async setAccountPassword(
    @Param("realm") realmParam: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body()
    body: { password?: string; currentPassword?: string } | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    const realm = this.assertPasswordLoginRealm(realmParam);
    if (!identity?.principalId || identity.realm !== realm) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Active session required.",
      );
    }
    validateCsrfHeader(headers);

    const password = body?.password;
    if (typeof password !== "string" || !password) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "A new password is required.",
      );
    }
    if (!this.identityRepository) {
      throw new ApiRequestError(
        503,
        "AUTH_IDENTITY_UNAVAILABLE",
        "Identity authority is not available.",
      );
    }
    const hasher = this.requirePasswordHashingService();

    const totpCredential = await this.totpCredentialRepository?.findCredential(
      identity.principalId,
    );
    const policyResult = this.passwordPolicyService.evaluate(password, {
      totpEnabled: Boolean(totpCredential?.confirmedAt),
    });
    if (!policyResult.valid) {
      throw new ApiRequestError(
        400,
        "PASSWORD_POLICY_VIOLATION",
        "Password does not meet the policy requirements.",
        { reason: policyResult.reason },
      );
    }

    // Session-derived only: `identity.principalId`/`identity.realm` were
    // verified by `JwtAuthService`, never trusted from the request body
    // (an `email`/`principalId`/`amr` field on `body` would otherwise let a
    // caller pick someone else's identity).
    const principal = await this.identityRepository.findPrincipalById(
      identity.principalId,
    );
    if (!principal || principal.status !== "active") {
      this.denyCredentialPasswordChange("Active session required.");
    }

    const membership = identity.membershipId
      ? await this.identityRepository.findMembershipById(identity.membershipId)
      : null;
    if (
      !membership ||
      membership.principalId !== principal.principalId ||
      membership.realm !== realm ||
      membership.status !== "active"
    ) {
      this.denyCredentialPasswordChange("Active session required.");
    }

    const existingCredential =
      await this.identityRepository.findPasswordCredentialByPrincipalId(
        principal.principalId,
      );
    const action: "created" | "changed" = existingCredential
      ? "changed"
      : "created";

    if (existingCredential) {
      const currentPassword = body?.currentPassword;
      if (typeof currentPassword === "string" && currentPassword) {
        const verifyOutcome = await this.verifyPasswordAndLockout(
          hasher,
          principal,
          currentPassword,
        );
        if (verifyOutcome !== "ok") {
          this.recordCredentialPasswordEvent({
            outcome: "denied",
            action,
            realm,
            reasonCode: `CURRENT_PASSWORD_${verifyOutcome.toUpperCase()}`,
            principalId: principal.principalId,
            tenantId: membership.tenantId,
            partnerId: membership.partnerId,
          });
          this.denyCredentialPasswordChange(
            "The current password is incorrect, or this account is not eligible for this change.",
          );
        }
      } else if (!this.hasQualifyingFreshSessionForChange(identity)) {
        this.recordCredentialPasswordEvent({
          outcome: "denied",
          action,
          realm,
          reasonCode: "STEP_UP_REQUIRED",
          principalId: principal.principalId,
          tenantId: membership.tenantId,
          partnerId: membership.partnerId,
        });
        throw new ApiRequestError(
          403,
          "STEP_UP_REQUIRED",
          "Changing your password requires your current password or a recent, verified session.",
        );
      }
    } else if (
      !this.hasQualifyingFreshMfaForRoleSensitiveSetup(identity, realm)
    ) {
      this.recordCredentialPasswordEvent({
        outcome: "denied",
        action,
        realm,
        reasonCode: "MFA_REQUIRED",
        principalId: principal.principalId,
        tenantId: membership.tenantId,
        partnerId: membership.partnerId,
      });
      throw new ApiRequestError(
        403,
        "MFA_REQUIRED",
        "Adding a password credential requires a recent, trusted multi-factor authentication proof.",
      );
    }

    const hashed = await hasher.hash(password);
    await this.identityRepository.setPasswordCredentialForPrincipal(
      principal.principalId,
      {
        passwordHash: hashed.hash,
        passwordAlgo: hashed.algo,
        pepperVersion: hashed.pepperVersion,
      },
    );

    this.recordCredentialPasswordEvent({
      outcome: "success",
      action,
      realm,
      principalId: principal.principalId,
      tenantId: membership.tenantId,
      partnerId: membership.partnerId,
    });

    return toApiSuccessEnvelope({ action }, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/invitation-login")
  getTenantInvitationLoginUrl(
    @Body()
    command: {
      invitationToken: string;
      redirectUri: string;
      tenantId?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      typeof command.invitationToken !== "string" ||
      !command.invitationToken.trim() ||
      command.invitationToken.length > 512
    ) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "Invitation token is required.",
      );
    }
    const result = this.requireOidcPkceService().generateLoginParameters(
      "tenant",
      {
        redirectUri: command.redirectUri,
        tenantId: command.tenantId || null,
        invitationToken: command.invitationToken.trim(),
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/callback-session")
  async exchangeTenantCallbackSession(
    @Body() command: IamCallbackSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-oidc-state-token") stateTokenHeader?: string,
  ) {
    const stateToken = stateTokenHeader?.trim();
    if (!stateToken) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing x-oidc-state-token header. Managed HttpOnly BFF boundary requires state token in header.",
      );
    }
    const meta = this.buildMeta(
      forwardedFor,
      realIp,
      userAgent,
      requestId,
      stateToken,
    );
    try {
      const session =
        await this.requireOidcPkceService().exchangeTenantCallbackSession(
          command,
          meta,
        );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      throw toPublicTenantAuthError(error);
    }
  }

  /** BUREAU-R13 §3.1: agency invitation login binds the state to the proof. */
  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("agency/invitation-login")
  getAgencyInvitationLoginUrl(
    @Body()
    command: {
      invitationToken: string;
      redirectUri: string;
      agencyId?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      typeof command?.invitationToken !== "string" ||
      !command.invitationToken.trim() ||
      command.invitationToken.length > 512
    ) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "Invitation token is required.",
      );
    }
    const result = this.requireOidcPkceService().generateLoginParameters(
      "agency",
      {
        redirectUri: command.redirectUri,
        invitationToken: command.invitationToken.trim(),
        agencyId:
          typeof command.agencyId === "string" ? command.agencyId : null,
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("agency/callback-session")
  async exchangeAgencyCallbackSession(
    @Body() command: IamCallbackSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-oidc-state-token") stateTokenHeader?: string,
  ) {
    const stateToken = stateTokenHeader?.trim();
    if (!stateToken) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing x-oidc-state-token header. Managed HttpOnly BFF boundary requires state token in header.",
      );
    }
    const meta = this.buildMeta(
      forwardedFor,
      realIp,
      userAgent,
      requestId,
      stateToken,
    );
    try {
      const session =
        await this.requireOidcPkceService().exchangeAgencyCallbackSession(
          command,
          meta,
        );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      // Same opaque public error as tenant: no account-existence oracle.
      throw toPublicTenantAuthError(error);
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("partner/callback-session")
  async exchangePartnerCallbackSession(
    @Body() command: IamCallbackSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-oidc-state-token") stateTokenHeader?: string,
  ) {
    const stateToken = stateTokenHeader?.trim();
    if (!stateToken) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing x-oidc-state-token header. Managed HttpOnly BFF boundary requires state token in header.",
      );
    }
    const meta = this.buildMeta(
      forwardedFor,
      realIp,
      userAgent,
      requestId,
      stateToken,
    );
    try {
      const session =
        await this.requireOidcPkceService().exchangePartnerCallbackSession(
          command,
          meta,
        );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      throw toPublicPartnerAuthError(error);
    }
  }

  private buildMeta(
    forwardedFor?: string,
    realIp?: string,
    userAgent?: string,
    requestId?: string,
    stateToken?: string,
  ) {
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);
    const meta: {
      sourceIp?: string;
      userAgent?: string;
      requestId?: string;
      stateToken?: string;
    } = {};
    if (sourceIp) meta.sourceIp = sourceIp;
    if (userAgent) meta.userAgent = userAgent;
    if (requestId) meta.requestId = requestId;
    if (stateToken) meta.stateToken = stateToken;
    return meta;
  }

  @Get("session")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getAuthSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Active session required.",
      );
    }
    return toApiSuccessEnvelope(
      {
        active: true,
        identity,
      },
      requestId,
    );
  }

  /** A dev proxy is proof of the private web caller, never a user session. */
  private async issueDevControlPlaneSession(request: TokenRequest): Promise<{
    token: string;
    expiresIn: string;
    sessionId?: string;
    principalId?: string;
    realm?: AuthRealm;
    actorType?: AuthActorType;
  }> {
    const deny = (): never => {
      throw new ApiRequestError(
        403,
        "DEV_WORKFORCE_SESSION_EXCHANGE_DENIED",
        "The verified dev workforce caller cannot establish a session.",
      );
    };
    if (
      !isDevWorkforceMfaWaiverEnabled() ||
      process.env.STRICT_IAP_MODE === "true" ||
      process.env.CONTROL_PLANE_IAP_ENABLED?.trim().toLowerCase() === "true"
    )
      deny();

    // The open-route guard also accepts bootstrap identities and intentionally
    // drops the proxy purpose claim. Reverify the actual signed inner proof.
    const headers = request.headers as Record<
      string,
      string | string[] | undefined
    >;
    const mixedHeaders = [
      "x-actor-type",
      "x-actor-id",
      "x-realm",
      "x-tenant-id",
      "x-roles",
      "x-role-families",
      "x-scopes",
      "x-auth-mode",
      "x-partner-id",
      "x-partner-program-id",
      "x-partner-entry-slug",
      "x-principal-id",
      "x-membership-id",
      "x-subject",
      "x-issuer",
      "x-audience",
      "x-goog-authenticated-user-email",
      "x-goog-authenticated-user-id",
      "x-session-id",
      "x-token-id",
      "x-token-version",
      "x-auth-time",
      "x-amr",
      "x-acr",
      "x-policy-version",
      "x-drts-internal-key",
      "x-drts-workload-assertion",
      "x-drts-google-id-token",
      "x-drts-workload-exchange-nonce",
      "x-drts-token-audience",
    ];
    if (mixedHeaders.some((name) => headers[name] !== undefined)) deny();
    const bearer = headers["x-drts-authorization"];
    if (typeof bearer !== "string" || !/^Bearer [^\s]+$/.test(bearer)) deny();
    const payload = await this.jwtAuthService.verifyAccessToken(
      (bearer as string).slice(7),
      { allowControlPlaneProxyToken: true },
    );
    if (
      !payload ||
      payload.controlPlaneProxy !== true ||
      !(
        (payload.actorType === "platform_admin" &&
          payload.realm === "platform") ||
        (payload.actorType === "ops_user" && payload.realm === "ops")
      ) ||
      !payload.sub?.trim() ||
      payload.tenantId ||
      payload.partnerId ||
      payload.partnerProgramId ||
      payload.partnerEntrySlug ||
      (payload.principalId && payload.principalId !== payload.sub) ||
      payload.sid !== undefined ||
      payload.jti !== undefined ||
      payload.tokenVersion !== undefined ||
      payload.auth_time !== undefined ||
      (payload.amr?.length ?? 0) > 0 ||
      payload.acr !== undefined ||
      payload.policyVersion !== undefined
    )
      deny();
    if (!this.identityRepository?.isEnabled()) deny();
    const repository = this.identityRepository!;
    const proxy = payload!;
    const principal = await repository.findPrincipalById(proxy.sub!);
    if (
      !principal ||
      principal.principalId !== proxy.sub ||
      principal.status !== "active"
    )
      deny();
    const memberships = await repository.findMembershipsByPrincipalId(
      principal!.principalId,
    );
    const candidates = memberships
      .filter(
        (membership) =>
          membership.principalId === principal!.principalId &&
          membership.realm === proxy.realm &&
          membership.status === "active" &&
          !membership.tenantId &&
          !membership.partnerId,
      )
      .sort((a, b) => a.membershipId.localeCompare(b.membershipId));
    for (const membership of candidates) {
      const bindings = await repository.findRoleBindingsByMembershipId(
        membership.membershipId,
      );
      const now = Date.now();
      const roles = [
        ...new Set(
          bindings
            .filter(
              (binding) =>
                binding.membershipId === membership.membershipId &&
                Date.parse(binding.validFrom) <= now &&
                (binding.validTo === null ||
                  Date.parse(binding.validTo) > now) &&
                (proxy.realm === "platform"
                  ? binding.roleCode === "platform_admin"
                  : binding.roleCode === "ops_user" ||
                    binding.roleCode === "ops_observer"),
            )
            .map((binding) => binding.roleCode),
        ),
      ];
      // A read-only observer binding cannot acquire an ops_user session.
      if (!roles.includes(proxy.actorType)) continue;
      const scopes = [
        ...new Set(
          roles.flatMap((role) => [
            ...(AUTH_SCOPE_PRESETS[role as AuthActorType] ?? []),
          ]),
        ),
      ];
      const timestamps = [
        principal!.updatedAt,
        membership.updatedAt,
        ...bindings.map((binding) => binding.updatedAt),
      ];
      const tokenVersion = Math.max(...timestamps.map(Date.parse));
      if (!Number.isFinite(tokenVersion)) deny();
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: proxy.actorType,
          actorId: principal!.principalId,
          principalId: principal!.principalId,
          membershipId: membership.membershipId,
          subject: principal!.subject,
          realm: proxy.realm,
          tenantId: null,
          roleFamilies: [proxy.realm === "platform" ? "platform" : "ops"],
          roles,
          scopes,
          requestId: (headers["x-request-id"] as string) ?? null,
        },
        {
          expiresIn: "8h",
          principalId: principal!.principalId,
          membershipId: membership.membershipId,
          subject: principal!.subject,
          ensurePrincipal: false,
          tokenVersion,
          authTime: new Date().toISOString(),
          amr: [DEV_MFA_WAIVED_AMR],
          acr: "aal1",
        },
      );
      return {
        token: issued.token,
        expiresIn: "8h",
        sessionId: issued.sessionId,
        principalId: principal!.principalId,
        realm: proxy.realm,
        actorType: proxy.actorType,
      };
    }
    return deny();
  }

  @OpenRoute()
  @Post("token")
  async issueToken(@Req() request: TokenRequest): Promise<{
    token: string;
    expiresIn: string;
    sessionId?: string;
    principalId?: string;
    realm?: AuthRealm;
    actorType?: AuthActorType;
  }> {
    // A real IAP assertion keeps its original verifier/role authority. The dev
    // exchange never uses raw identity headers or an outer IAM token as a user.
    if (
      request.headers["x-drts-authorization"] !== undefined &&
      !extractIapJwtAssertion(request.headers)
    ) {
      return this.issueDevControlPlaneSession(request);
    }
    const strictEnvironment = isStrictAuthEnvironment();
    const isStrictIap =
      process.env.STRICT_IAP_MODE === "true" || strictEnvironment;
    const rawWorkloadAssertion = extractWorkloadIdentityAssertion(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const rawAssertion = extractIapJwtAssertion(request.headers);
    const rawGoogleAssertion = extractGoogleWorkloadIdentityAssertion(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const bootstrapIdentity = extractBootstrapRequestIdentity(request.headers, {
      allowAnonymous: false,
      method: request.method,
      requestUrl: request.originalUrl ?? request.url,
      // This endpoint mints a durable iam.identity_sessions row below; it
      // must never fall back to the deterministic bootstrap:<actorId>
      // session id, or two independent exchanges for the same actor (e.g.
      // a mail bootstrap call and a running deploy acceptance session)
      // collide on one session row and the newer exchange revokes the
      // older, still-valid one.
      requireExplicitSessionId: true,
    });

    if (strictEnvironment && bootstrapIdentity && !rawGoogleAssertion) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
      );
    }

    if (rawWorkloadAssertion && bootstrapIdentity) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled when workload identity proof is provided.",
      );
    }

    if (rawGoogleAssertion && rawWorkloadAssertion) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Google workload identity proof cannot be combined with the service workload identity assertion.",
      );
    }

    if (rawWorkloadAssertion) {
      const requestedTokenAudience = extractRequestedWorkloadTokenAudience(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const exchangeNonce = extractWorkloadIdentityExchangeNonce(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const resolved =
        await this.serviceWorkloadIdentityAdapter?.resolveSubject(
          request.headers as Record<string, string | string[] | undefined>,
          {
            requestedTokenAudience,
            exchangeNonce,
          },
        );
      if (!resolved) {
        throw new ApiRequestError(
          503,
          "WORKLOAD_IDENTITY_NOT_CONFIGURED",
          "Workload identity validation is not configured for this environment.",
        );
      }

      const expiresIn: JwtExpiresIn = "15m";
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: "system",
          actorId: resolved.actorId,
          principalId: resolved.principalId,
          subject: resolved.subject,
          realm: "system",
          tenantId: null,
          roleFamilies: [],
          roles: resolved.roles,
          scopes: resolved.scopes,
          requestId:
            (request.headers["x-request-id"] as string | undefined) ?? null,
        },
        {
          expiresIn,
          principalId: resolved.principalId,
          subject: resolved.subject,
          ensurePrincipal: false,
          authTime: resolved.authTime,
          amr: ["workload_identity"],
          acr: "aal2",
          tokenVersion: resolved.tokenVersion,
          audience: [resolved.tokenAudience],
          workloadExchangeNonceHash: resolved.exchangeNonceHash,
        },
      );
      return { token: issued.token, expiresIn };
    }

    // Verified Google proof authorizes fixed tenant grants, direct ops actors,
    // or the driver-targeted provisioning session below. It never creates a
    // general platform-admin or system session from caller-supplied headers.
    // Transitional dual-send fallback remains for existing non-system callers
    // only when the registry/identity is absent; provisioning fails closed.
    let googleCiTenantActorVerified = false;
    let googleOpsActorVerified = false;
    if (rawGoogleAssertion) {
      if (!bootstrapIdentity) {
        throw new ApiRequestError(
          400,
          "IDENTITY_REQUIRED",
          "Bootstrap identity headers (x-actor-type, x-actor-id, x-realm) are required.",
          {},
        );
      }

      let resolvedGoogle = null;
      try {
        if (!this.googleWorkloadIdentityAdapter) {
          throw new ApiRequestError(
            503,
            "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED",
            "Google workload identity validation is not configured for this environment.",
          );
        }
        resolvedGoogle =
          await this.googleWorkloadIdentityAdapter.verifyServicePrincipal(
            request.headers as Record<string, string | string[] | undefined>,
            {
              requestPath: request.originalUrl ?? request.url,
              requestMethod: request.method,
            },
          );
      } catch (error) {
        if (
          bootstrapIdentity.actorType !== "system" &&
          (isGoogleWorkloadIdentityNotConfigured(error) ||
            isGoogleWorkloadIdentityPrincipalNotRegistered(error))
        ) {
          // Registry not configured yet, or this caller's verified identity
          // has no registry entry yet: ignore the Google assertion and let
          // issuance fall back to the internal key below (same dual-send
          // transition safety as InternalKeyMiddleware). Any other failure
          // (bad signature, issuer/audience mismatch, replay, route scope
          // denial) for an already-registered principal stays fail-closed.
          resolvedGoogle = null;
        } else {
          throw error;
        }
      }

      if (resolvedGoogle) {
        if (bootstrapIdentity.actorType === "system") {
          const grant = resolvedGoogle.driverProvisioningGrant;
          if (
            !grant ||
            !isCiTenantActorGateEnabled() ||
            strictEnvironment ||
            bootstrapIdentity.realm !== "system" ||
            bootstrapIdentity.actorId !== resolvedGoogle.principalId ||
            bootstrapIdentity.tenantId ||
            bootstrapIdentity.partnerId ||
            rawAssertion ||
            (request.headers["x-scopes"] &&
              request.headers["x-scopes"] !== "driver:provision") ||
            request.headers["x-roles"] ||
            request.headers["x-role-families"]
          ) {
            throw new ApiRequestError(
              403,
              "WORKLOAD_DRIVER_PROVISIONING_DENIED",
              "The workload is not granted the requested driver provisioning session.",
            );
          }
          // Never spread bootstrap headers here: all authority comes from the
          // verified registry grant, and the signed target survives JWT decode.
          const expiresIn: JwtExpiresIn = "15m";
          const issued = await this.issueJwtSession(
            {
              authMode: "jwt_bearer",
              actorType: "system",
              actorId: resolvedGoogle.principalId,
              principalId: resolvedGoogle.principalId,
              realm: "system",
              tenantId: null,
              roleFamilies: [],
              roles: [],
              scopes: ["driver:provision"],
              requestId: null,
              driverProvisioningDriverId: grant.driverId,
            },
            {
              expiresIn,
              ensurePrincipal: false,
              principalId: resolvedGoogle.principalId,
              subject: resolvedGoogle.principalId,
              authTime: resolvedGoogle.authTime,
              amr: ["google_workload_identity"],
              acr: "aal1",
            },
          );
          return { token: issued.token, expiresIn };
        }
        if (
          (bootstrapIdentity.actorId === resolvedGoogle.principalId ||
            bootstrapIdentity.actorId === resolvedGoogle.actorId) &&
          resolvedGoogle.roles.includes(bootstrapIdentity.actorType) &&
          (bootstrapIdentity.actorType === "ops_user" ||
            bootstrapIdentity.actorType === "ops_observer") &&
          bootstrapIdentity.realm === "ops" &&
          !bootstrapIdentity.tenantId &&
          !bootstrapIdentity.partnerId
        ) {
          // Direct authentication! The Google SA is asking for a token for ITSELF.
          googleCiTenantActorVerified = true;
          googleOpsActorVerified = true;
          bootstrapIdentity.principalId = resolvedGoogle.principalId;
          bootstrapIdentity.roleFamilies = ["ops"];
        } else if (
          isCiTenantActorGateEnabled() &&
          bootstrapIdentity.realm === "tenant" &&
          bootstrapIdentity.actorType === "tenant_admin"
        ) {
          const grant = resolveCiTenantActorGrant(resolvedGoogle, {
            tenantId: bootstrapIdentity.tenantId ?? "",
            actorType: bootstrapIdentity.actorType,
            actorId: bootstrapIdentity.actorId ?? "",
          });
          if (!grant) {
            throw new ApiRequestError(
              403,
              "WORKLOAD_CI_TENANT_ACTOR_DENIED",
              "Verified Google workload identity is not granted session issuance for the requested tenant actor.",
            );
          }
          googleCiTenantActorVerified = true;
        } else {
          throw new ApiRequestError(
            403,
            "WORKLOAD_CI_TENANT_ACTOR_DENIED",
            "Verified Google workload identity is not granted session issuance.",
          );
        }
      }
    }
    if (!googleCiTenantActorVerified) {
      // Require internal key to issue tokens when no workload proof is used.
      await validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
    }

    if (rawAssertion && this.iapSubjectAdapter) {
      const expectedAudience =
        process.env.IAP_EXPECTED_AUDIENCE ||
        process.env.IAP_AUDIENCE ||
        process.env.JWT_AUDIENCE;
      const expectedIssuer = process.env.IAP_EXPECTED_ISSUER;
      const jwtSecretOrPublicKey =
        process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY || process.env.IAP_JWT_SECRET;

      const resolved = await this.iapSubjectAdapter.resolveSubject(
        request.headers,
        {
          strictIapMode: isStrictIap,
          ...(expectedAudience ? { expectedAudience } : {}),
          ...(expectedIssuer ? { expectedIssuer } : {}),
          ...(jwtSecretOrPublicKey ? { jwtSecretOrPublicKey } : {}),
        },
      );

      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType:
          resolved.membership.realm === "platform"
            ? "platform_admin"
            : "ops_user",
        actorId: resolved.principal.principalId,
        principalId: resolved.principal.principalId,
        membershipId: resolved.membership.membershipId,
        subject: resolved.principal.subject,
        realm: resolved.membership.realm as "platform" | "ops",
        tenantId: null,
        tokenVersion: resolved.tokenVersion,
        roleFamilies: [resolved.membership.realm as "platform" | "ops"],
        roles: resolved.effectiveRoles,
        scopes: resolved.effectiveScopes,
        requestId:
          (request.headers["x-request-id"] as string | undefined) ?? null,
      };

      const expiresIn: JwtExpiresIn = "8h";
      const issued = await this.issueJwtSession(identity, {
        expiresIn,
        principalId: resolved.principal.principalId,
        membershipId: resolved.membership.membershipId,
        subject: resolved.principal.subject,
        ensurePrincipal: false,
        authTime: resolved.authTime ?? null,
        amr: resolved.authMethods,
        acr: resolved.assurance,
        tokenVersion: resolved.tokenVersion,
      });
      return { token: issued.token, expiresIn };
    }

    const identity = bootstrapIdentity;

    if (!identity) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Bootstrap identity headers (x-actor-type, x-actor-id, x-realm) are required.",
        {},
      );
    }

    if (isStrictIap && !googleCiTenantActorVerified) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
      );
    }

    const tenantUser =
      identity.realm === "tenant" && identity.tenantId && identity.actorId
        ? this.tenantPartnerService.findTenantUser(
            identity.tenantId,
            identity.actorId,
          )
        : null;
    if (
      identity.realm === "tenant" &&
      (!tenantUser || tenantUser.status !== "active")
    ) {
      throw new ApiRequestError(
        401,
        "TENANT_SESSION_SUBJECT_INVALID",
        "The requested tenant session subject is not active.",
      );
    }

    const durableTenantScopes = tenantUser
      ? getTenantRoleScopes(tenantUser.roleCode)
      : undefined;
    if (tenantUser && !durableTenantScopes) {
      throw new ApiRequestError(
        403,
        "TENANT_ROLE_INVALID",
        "The requested tenant session role is not configured.",
      );
    }

    // Tenant session claims come from the durable user record, rather than
    // caller-controlled bootstrap headers, so later JWT verification agrees.
    const durableIdentity =
      tenantUser && durableTenantScopes
        ? {
            ...identity,
            roles: [tenantUser.roleCode],
            scopes: [...durableTenantScopes],
          }
        : identity;

    // Bootstrap issuance still ensures its principal and needs the post-write
    // timestamp. Google ops issuance instead preserves the verifier's principal
    // and signs the version of the existing durable rows.
    let workforceVersionTimestamps: string[] | undefined;
    let verifiedGoogleWorkforceVersion: number | undefined;
    if (
      (durableIdentity.realm === "ops" ||
        durableIdentity.realm === "platform") &&
      !durableIdentity.membershipId &&
      durableIdentity.actorId
    ) {
      if (!this.identityRepository) {
        throw new ApiRequestError(
          500,
          "IDENTITY_REPOSITORY_UNAVAILABLE",
          "Identity repository is required for ops/platform session issuance.",
        );
      }
      const principalToLookup =
        durableIdentity.principalId ?? durableIdentity.actorId;
      let verifiedGooglePrincipalUpdatedAt: string | undefined;
      if (googleOpsActorVerified) {
        const principal =
          await this.identityRepository.findPrincipalById(principalToLookup);
        if (!principal || principal.status !== "active") {
          this.denyWorkloadSessionIdentity("principal_not_active");
        }
        verifiedGooglePrincipalUpdatedAt = principal.updatedAt;
      }
      const memberships =
        await this.identityRepository.findMembershipsByPrincipalId(
          principalToLookup,
        );
      const membership = memberships.find(
        (m) => m.realm === durableIdentity.realm && m.status === "active",
      );
      if (!membership) {
        if (googleOpsActorVerified) {
          this.denyWorkloadSessionIdentity("membership_not_active");
        }
        throw new ApiRequestError(
          401,
          "MEMBERSHIP_NOT_FOUND",
          "The requested ops/platform session subject has no active membership.",
        );
      }
      durableIdentity.membershipId = membership.membershipId;

      const roleBindings =
        await this.identityRepository.findRoleBindingsByMembershipId(
          membership.membershipId,
        );
      const now = new Date();
      const activeBindings = roleBindings.filter(
        (b) =>
          (!b.validTo || new Date(b.validTo) > now) &&
          new Date(b.validFrom) <= now,
      );
      if (
        googleOpsActorVerified &&
        !activeBindings.some(
          (binding) => binding.roleCode === durableIdentity.actorType,
        )
      ) {
        this.denyWorkloadSessionIdentity("role_binding_not_active");
      }

      const allowedRoles = activeBindings.map((b) => b.roleCode);
      const allowedScopes = new Set<string>();
      for (const binding of activeBindings) {
        const presets =
          AUTH_SCOPE_PRESETS[binding.roleCode as AuthActorType] ||
          AUTH_TENANT_ROLE_SCOPE_PRESETS[binding.roleCode];
        if (presets) {
          presets.forEach((s) => allowedScopes.add(s));
        }
      }

      durableIdentity.roles = allowedRoles;
      durableIdentity.scopes = Array.from(allowedScopes);
      // Mirrors the full (not just active-filtered) binding set that
      // validateDurableState recomputes from at verification time.
      workforceVersionTimestamps = [
        membership.updatedAt,
        ...roleBindings.map((b) => b.updatedAt),
      ];
      if (verifiedGooglePrincipalUpdatedAt) {
        verifiedGoogleWorkforceVersion = Math.max(
          ...[
            verifiedGooglePrincipalUpdatedAt,
            ...workforceVersionTimestamps,
          ].map(Date.parse),
        );
      }
    }

    const expiresIn: JwtExpiresIn =
      durableIdentity.actorType === "system" ? "15m" : "8h";
    const issuedAt = new Date().toISOString();
    const assurance = resolveBootstrapTokenAssurance(durableIdentity);
    const issued = await this.issueJwtSession(durableIdentity, {
      expiresIn,
      principalId: durableIdentity.principalId ?? durableIdentity.actorId,
      membershipId: durableIdentity.membershipId ?? null,
      subject: durableIdentity.subject ?? durableIdentity.actorId,
      // The Google verifier already persisted this principal under its own
      // source_ref. Bootstrap-upserting it again changes that authority and
      // collides with the principal_id PK in PostgreSQL (V0068).
      ensurePrincipal: !googleOpsActorVerified,
      authTime: issuedAt,
      ...(assurance.amr ? { amr: assurance.amr } : {}),
      ...(assurance.acr ? { acr: assurance.acr } : {}),
      tokenVersion:
        verifiedGoogleWorkforceVersion ??
        (tenantUser ? Date.parse(tenantUser.updatedAt) : Date.parse(issuedAt)),
      ...(workforceVersionTimestamps && !googleOpsActorVerified
        ? { workforceVersionTimestamps }
        : {}),
    });
    return { token: issued.token, expiresIn };
  }

  private denyWorkloadSessionIdentity(
    reason:
      | "principal_not_active"
      | "membership_not_active"
      | "role_binding_not_active",
  ): never {
    // Detailed reason stays server-side. Never include proof, tokens, headers,
    // database errors or caller identifiers in either the log or response.
    this.logger.warn(
      `[WORKLOAD_SESSION_IDENTITY_UNAVAILABLE] reason=${reason}`,
    );
    throw new ApiRequestError(
      403,
      "WORKLOAD_SESSION_IDENTITY_UNAVAILABLE",
      "The verified workload cannot establish an active session.",
    );
  }

  @Post("driver/device/invite")
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("driver:provision") // Fits the control path requirement for driver identity overrides
  async issueDriverDeviceInvitation(
    @Body() command: IssueDriverDeviceInvitationCommand,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
  ) {
    const driverId = identity?.driverProvisioningDriverId;
    if (
      driverId &&
      (command.driverId !== driverId ||
        command.registrationCode !== undefined ||
        command.expiresInHours !== undefined)
    ) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_DRIVER_TARGET_DENIED",
        "Driver provisioning grant does not allow this invitation.",
      );
    }
    const result = await this.requireIdempotencyService().execute({
      scope: identity?.driverProvisioningDriverId
        ? `auth:driver_invite:issue:${identity.principalId}:${identity.driverProvisioningDriverId}`
        : "auth:driver_invite:issue",
      idempotencyKey,
      required: false,
      requestPath: "auth/driver/device/invite",
      payload: command,
      execute: async () =>
        this.driverDeviceSessionService.issueRegistrationInvitation(command),
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Post("driver/device/invite/revoke")
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("driver:provision")
  async revokeDriverDeviceInvitation(
    @Body() command: { registrationCode: string },
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
  ) {
    const result = await this.requireIdempotencyService().execute({
      scope: identity?.driverProvisioningDriverId
        ? `auth:driver_invite:revoke:${identity.principalId}:${identity.driverProvisioningDriverId}`
        : "auth:driver_invite:revoke",
      idempotencyKey,
      required: false,
      requestPath: "auth/driver/device/invite/revoke",
      payload: command,
      execute: async () =>
        this.driverDeviceSessionService.revokeInvitation(
          command,
          identity?.driverProvisioningDriverId,
        ),
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("driver/device/register")
  async issueDriverDeviceSession(
    @Body() command: RegisterDriverDeviceCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = await this.driverDeviceSessionService.register(
      command,
      requestId,
    );
    return toApiSuccessEnvelope<DriverDeviceProvisioningSession>(
      session,
      requestId,
    );
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("driver/device/refresh")
  async refreshDriverDeviceSession(
    @Body() command: RefreshDriverDeviceSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = await this.driverDeviceSessionService.refresh(command);
    return toApiSuccessEnvelope<DriverDeviceProvisioningSession>(
      session,
      requestId,
    );
  }

  @Post("driver/device/revoke")
  @RequireRealms("system", "platform", "ops", "driver")
  async revokeDriverDeviceSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: RevokeDriverDeviceBindingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.driverDeviceSessionService.revoke(
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("sessions/revoke")
  async revokeSessionSelf(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: { sessionId?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "UNAUTHENTICATED",
        "Authentication is required to revoke session.",
      );
    }
    const sessionId = command?.sessionId?.trim();
    if (!sessionId) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "sessionId is required.",
      );
    }
    const callerPrincipalId = identity.principalId ?? identity.actorId;
    if (!callerPrincipalId) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Principal identity is required to revoke session.",
      );
    }
    const result = await this.jwtAuthService.revokeSessionSelf(
      sessionId,
      callerPrincipalId,
      "user_self_revocation",
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/oidc-session")
  async issueTenantOidcSession(
    @Body() command: TenantOidcSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    try {
      const session =
        await this.requireOidcPkceService().exchangeTenantIdTokenSession(
          command,
          this.buildMeta(forwardedFor, realIp, userAgent, requestId),
        );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      throw toPublicTenantAuthError(error);
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/bootstrap-session")
  async issueTenantBootstrapSession(
    @Body() command: CreateTenantBootstrapSessionCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const normalizedEmail = command.email?.trim().toLowerCase() ?? null;
    const requestedTenantId = command.tenantId?.trim() || null;
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);

    try {
      if (!normalizedEmail) {
        throw new ApiRequestError(400, "FIELD_REQUIRED", "email is required.", {
          field: "email",
        });
      }

      this.assertTenantBootstrapFixtureModeEnabled();

      const tenantId =
        requestedTenantId || this.tenantPartnerService.getDefaultTenantId();
      const existingUser =
        this.tenantPartnerService
          .listTenantUsers(tenantId)
          .find((user) => user.email === normalizedEmail) ?? null;

      if (!existingUser) {
        const crossTenantUser =
          requestedTenantId &&
          this.tenantPartnerService.findTenantUserByEmail(normalizedEmail);
        if (crossTenantUser && crossTenantUser.tenantId !== tenantId) {
          throw this.buildTenantBootstrapDeniedError();
        }

        throw this.buildTenantBootstrapDeniedError();
      }

      if (!this.isTenantBootstrapEligibleStatus(existingUser.status)) {
        throw this.buildTenantBootstrapDeniedError();
      }

      const roleCatalog = this.tenantPartnerService.listTenantRoles();
      const resolvedRoleCode = this.resolveExistingUserRoleCode(
        roleCatalog,
        existingUser,
      );
      const profile = this.buildTenantPortalProfile(
        tenantId,
        normalizedEmail,
        existingUser,
        resolvedRoleCode,
      );
      const identity = this.buildIdentityContext(profile);
      const issuedAt = new Date().toISOString();
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: identity.actorType,
          actorId: identity.actorId,
          principalId: identity.actorId,
          subject: profile.id,
          realm: identity.realm,
          tenantId: identity.tenantId,
          roleFamilies: identity.roleFamilies,
          roles: identity.roles,
          scopes: identity.scopes,
          requestId: requestId ?? null,
        },
        {
          expiresIn: TENANT_BOOTSTRAP_EXPIRES_IN,
          principalId: identity.actorId,
          subject: profile.id,
          ensurePrincipal: true,
          authTime: issuedAt,
          amr: ["tenant_bootstrap_fixture"],
          acr: "aal1",
          tokenVersion: Date.parse(existingUser.updatedAt),
        },
      );
      const session: TenantBootstrapSession = {
        accessToken: issued.token,
        tokenType: "Bearer",
        expiresIn: TENANT_BOOTSTRAP_EXPIRES_IN,
        profile,
        identity,
      };

      this.securityEventsService?.recordEvent({
        actorId: identity.actorId,
        actorType: identity.actorType,
        subjectId: normalizedEmail,
        realm: "tenant",
        tenantId,
        partnerId: null,
        eventType: "tenant_bootstrap_session.issued",
        eventFamily: "auth",
        outcome: "success",
        severity: "low",
        targetType: "tenant_portal_session",
        targetId: profile.id,
        sessionId: issued.sessionId,
        tokenId: issued.tokenId,
        authMethods: issued.amr,
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: null,
        approvalId: null,
        beforeSummary: null,
        afterSummary: {
          actorId: identity.actorId,
          roleCode: profile.roleCode,
          tenantId,
        },
        maskedContext: {
          email: normalizedEmail,
        },
      });

      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      this.securityEventsService?.recordEvent({
        actorId: null,
        actorType: "system",
        subjectId: normalizedEmail,
        realm: "tenant",
        tenantId: requestedTenantId,
        partnerId: null,
        eventType: "tenant_bootstrap_session.denied",
        eventFamily: "auth",
        outcome: "denied",
        severity: "medium",
        targetType: "tenant_portal_session",
        targetId: null,
        sessionId: null,
        tokenId: null,
        authMethods: ["tenant_bootstrap_exchange"],
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: this.extractErrorCode(error),
        approvalId: null,
        beforeSummary: null,
        afterSummary: null,
        maskedContext: {
          email: normalizedEmail,
          requestedTenantId,
        },
      });
      throw toPublicTenantAuthError(error);
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("partner/bootstrap-session")
  async issuePartnerBootstrapSession(
    @Body() command: CreatePartnerBootstrapSessionCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);

    try {
      const resolved = await (this.tenantPartnerService
        .resolvePartnerBootstrapAuthentication
        ? this.tenantPartnerService.resolvePartnerBootstrapAuthentication(
            command,
            requestId,
          )
        : this.tenantPartnerService.authenticatePartnerBootstrap(
            command,
            requestId,
          ));
      const issuedAt = new Date().toISOString();
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: resolved.identity.actorType,
          actorId: resolved.identity.actorId,
          principalId: resolved.identity.actorId,
          subject: resolved.identity.actorId,
          realm: resolved.identity.realm,
          tenantId: resolved.identity.tenantId,
          partnerId: resolved.identity.partnerId ?? null,
          partnerProgramId: resolved.identity.partnerProgramId ?? null,
          partnerEntrySlug: resolved.identity.partnerEntrySlug ?? null,
          roleFamilies: resolved.identity.roleFamilies,
          roles: resolved.identity.roles,
          scopes: resolved.identity.scopes,
          requestId: requestId ?? null,
        },
        {
          expiresIn: "1h",
          principalId: resolved.identity.actorId,
          subject: resolved.identity.actorId,
          ensurePrincipal: true,
          authTime: issuedAt,
          amr: ["partner_api_key"],
          acr: "aal1",
          tokenVersion: Date.parse(resolved.partnerEntry.updatedAt),
        },
      );
      const session: PartnerBootstrapSession = {
        accessToken: issued.token,
        tokenType: "Bearer",
        expiresIn: "1h",
        partnerEntry: resolved.partnerEntry,
        identity: {
          ...resolved.identity,
          authMode: "jwt_bearer",
        },
      };

      this.securityEventsService?.recordEvent({
        actorId: resolved.identity.actorId,
        actorType: resolved.identity.actorType,
        subjectId: resolved.identity.actorId,
        realm: "partner",
        tenantId: resolved.identity.tenantId,
        partnerId: resolved.identity.partnerId ?? null,
        eventType: "partner_bootstrap_session.issued",
        eventFamily: "auth",
        outcome: "success",
        severity: "low",
        targetType: "partner_entry",
        targetId: resolved.partnerEntry.entrySlug,
        sessionId: issued.sessionId,
        tokenId: issued.tokenId,
        authMethods: issued.amr,
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: null,
        approvalId: null,
        beforeSummary: null,
        afterSummary: {
          partnerEntrySlug: resolved.partnerEntry.entrySlug,
          partnerProgramId: resolved.identity.partnerProgramId ?? null,
        },
        maskedContext: {
          entrySlug: command.entrySlug,
          apiKey: command.apiKey,
        },
      });

      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      this.securityEventsService?.recordEvent({
        actorId: null,
        actorType: "system",
        subjectId: command.entrySlug,
        realm: "partner",
        tenantId: null,
        partnerId: null,
        eventType: "partner_bootstrap_session.denied",
        eventFamily: "auth",
        outcome: "denied",
        severity: "medium",
        targetType: "partner_entry",
        targetId: command.entrySlug?.trim() || null,
        sessionId: null,
        tokenId: null,
        authMethods: ["partner_api_key"],
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: this.extractErrorCode(error),
        approvalId: null,
        beforeSummary: null,
        afterSummary: null,
        maskedContext: {
          entrySlug: command.entrySlug,
          apiKey: command.apiKey,
        },
      });
      throw toPublicPartnerAuthError(error);
    }
  }

  @Post("logout")
  async logout(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body?: { reason?: string } | string,
    @Req() request?: TokenRequest | string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity || !identity.sessionId) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to perform logout.",
      );
    }

    const bodyObj = (typeof body === "object" && body !== null ? body : {}) as {
      reason?: string;
    };
    const reqObj = (
      typeof request === "object" && request !== null ? request : {}
    ) as TokenRequest;
    const reqHeaders = reqObj.headers as
      | Record<string, string | string[] | undefined>
      | undefined;
    const effectiveRequestId =
      typeof body === "string"
        ? body
        : typeof request === "string"
          ? request
          : requestId;

    validateCsrfHeader(reqHeaders);

    const reason = bodyObj.reason?.trim() || "self_logout";
    const principalId = identity.principalId ?? identity.actorId ?? undefined;

    if (this.identityRepository) {
      await this.identityRepository.revokeSession(
        identity.sessionId,
        reason,
        principalId,
      );
    } else {
      await this.jwtAuthService.revokeCurrentSession(
        identity.sessionId,
        reason,
        principalId,
      );
    }

    const sourceIp = this.resolveSourceIp(
      reqHeaders?.["x-forwarded-for"] as string | undefined,
      reqHeaders?.["x-real-ip"] as string | undefined,
    );
    const userAgent =
      (reqHeaders?.["user-agent"] as string | undefined) ?? null;

    this.securityEventsService?.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.subject ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      eventType: "session.logout",
      eventFamily: "auth",
      outcome: "success",
      severity: "low",
      targetType: "session",
      targetId: identity.sessionId,
      sessionId: identity.sessionId ?? null,
      tokenId: identity.tokenId ?? null,
      authMethods: identity.amr ?? [],
      sourceIp,
      userAgent,
      requestId: effectiveRequestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { status: "active" },
      afterSummary: { status: "revoked" },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { revoked: true, loggedOut: true, sessionId: identity.sessionId },
      effectiveRequestId,
    );
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body?: { reason?: string } | string,
    @Req() request?: TokenRequest | string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required for logout-all.",
      );
    }

    const bodyObj = (typeof body === "object" && body !== null ? body : {}) as {
      reason?: string;
    };
    const reqObj = (
      typeof request === "object" && request !== null ? request : {}
    ) as TokenRequest;
    const reqHeaders = reqObj.headers as
      | Record<string, string | string[] | undefined>
      | undefined;
    const effectiveRequestId =
      typeof body === "string"
        ? body
        : typeof request === "string"
          ? request
          : requestId;

    validateCsrfHeader(reqHeaders);

    const principalId = identity.principalId ?? identity.actorId;
    if (!principalId) {
      throw new ApiRequestError(
        400,
        "PRINCIPAL_REQUIRED",
        "Principal identifier is required for logout-all.",
      );
    }
    const reason = bodyObj.reason?.trim() || "self_logout_all";
    let revokedCount = 0;
    const revokedSessionIds: string[] = [];

    if (this.identityRepository) {
      const activeSessions =
        await this.identityRepository.listSessionsByPrincipal(principalId);
      for (const session of activeSessions) {
        if (session.status === "active") {
          await this.identityRepository.revokeSession(
            session.sessionId,
            reason,
            principalId,
          );
          revokedCount++;
          revokedSessionIds.push(session.sessionId);
        }
      }
    } else if (identity.sessionId) {
      revokedCount = await this.jwtAuthService.revokeAllSessionsForPrincipal(
        principalId,
        reason,
        principalId,
      );
      revokedSessionIds.push(identity.sessionId);
    }

    const sourceIp = this.resolveSourceIp(
      reqHeaders?.["x-forwarded-for"] as string | undefined,
      reqHeaders?.["x-real-ip"] as string | undefined,
    );
    const userAgent =
      (reqHeaders?.["user-agent"] as string | undefined) ?? null;

    this.securityEventsService?.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.subject ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      eventType: "session.logout_all",
      eventFamily: "auth",
      outcome: "success",
      severity: "medium",
      targetType: "principal",
      targetId: principalId,
      sessionId: identity.sessionId ?? null,
      tokenId: identity.tokenId ?? null,
      authMethods: identity.amr ?? [],
      sourceIp,
      userAgent,
      requestId: effectiveRequestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { revokedCount },
      afterSummary: { revokedCount, sessionIds: revokedSessionIds },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { loggedOutAll: true, revokedCount, sessionIds: revokedSessionIds },
      effectiveRequestId,
    );
  }

  @Get("sessions")
  async listSelfSessions(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to list sessions.",
      );
    }

    const principalId = identity.principalId ?? identity.actorId;
    let sessions: CanonicalIdentitySessionRecord[] = [];

    if (this.identityRepository && principalId) {
      sessions =
        await this.identityRepository.listSessionsByPrincipal(principalId);
    }

    const activeSessions = sessions.filter((s) => s.status === "active");
    const masked = activeSessions.map((session) =>
      maskSessionRecord(session, identity.sessionId),
    );

    return toApiSuccessEnvelope(masked, requestId);
  }

  @Post("sessions/:sid/revoke")
  async revokeSelfSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("sid") sid: string,
    @Body() command: IamSessionRevokeCommand,
    @Req() request: TokenRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to revoke session.",
      );
    }

    validateCsrfHeader(
      request.headers as Record<string, string | string[] | undefined>,
    );

    if (!this.identityRepository) {
      throw new ApiRequestError(
        503,
        "IDENTITY_REPOSITORY_NOT_AVAILABLE",
        "Identity repository is not available.",
      );
    }

    const targetSession = await this.identityRepository.getSession(sid);
    if (!targetSession) {
      throw new ApiRequestError(
        404,
        "SESSION_NOT_FOUND",
        "Target session to revoke was not found.",
        { sid },
      );
    }

    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== null
    ) {
      if (
        targetSession.status === "revoked" ||
        targetSession.tokenVersion !== command.expectedVersion
      ) {
        throw new ApiRequestError(
          409,
          "IAM_CONCURRENCY_CONFLICT",
          "Session token version mismatch or session already revoked.",
          {
            sid,
            expectedVersion: command.expectedVersion,
            currentVersion: targetSession.tokenVersion,
            status: targetSession.status,
          },
        );
      }
    }

    const callerPrincipalId = identity.principalId ?? identity.actorId;
    const isSelf = targetSession.principalId === callerPrincipalId;

    if (!isSelf) {
      const isPlatformOrOpsAdmin =
        (identity.realm === "platform" || identity.realm === "ops") &&
        (identity.actorType === "platform_admin" ||
          identity.roles.includes("platform_superadmin") ||
          identity.roles.includes("platform_user_admin") ||
          identity.roles.includes("ops_admin") ||
          identity.scopes.includes("platform:superadmin") ||
          identity.scopes.includes("identity:sessions:write") ||
          identity.scopes.includes("identity:users:write"));

      const isTenantAdmin =
        identity.realm === "tenant" &&
        (identity.actorType === "tenant_admin" ||
          identity.roles.includes("tenant_admin") ||
          identity.scopes.includes("identity:users:write") ||
          identity.scopes.includes("identity:sessions:write"));

      if (!isPlatformOrOpsAdmin && !isTenantAdmin) {
        throw new ApiRequestError(
          403,
          "AUTHZ_SCOPE_DENIED",
          "You are not authorized to revoke another user's session.",
        );
      }

      if (
        identity.realm === "tenant" &&
        targetSession.tenantId !== identity.tenantId
      ) {
        throw new ApiRequestError(
          403,
          "RESOURCE_SCOPE_DENIED",
          "Tenant administrators cannot revoke sessions outside their tenant boundary.",
        );
      }
    }

    const reason = command.reason?.trim() || "remote_revoke";
    const updated = await this.identityRepository.revokeSession(
      sid,
      reason,
      callerPrincipalId ?? undefined,
    );

    const sourceIp = this.resolveSourceIp(
      request.headers["x-forwarded-for"] as string | undefined,
      request.headers["x-real-ip"] as string | undefined,
    );
    const userAgent =
      (request.headers["user-agent"] as string | undefined) ?? null;

    this.securityEventsService?.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.subject ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      eventType: "session.revoke",
      eventFamily: "auth",
      outcome: "success",
      severity: "medium",
      targetType: "session",
      targetId: sid,
      sessionId: identity.sessionId ?? null,
      tokenId: identity.tokenId ?? null,
      authMethods: identity.amr ?? [],
      sourceIp,
      userAgent,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { status: targetSession.status },
      afterSummary: { status: "revoked" },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      {
        revoked: true,
        sessionId: sid,
        session: updated ? maskSessionRecord(updated) : null,
      },
      requestId,
    );
  }

  private extractErrorCode(error: unknown) {
    if (!(error instanceof ApiRequestError)) {
      return null;
    }

    return (
      (error.getResponse() as { error?: { code?: string } })?.error?.code ??
      null
    );
  }

  private resolveSourceIp(
    forwardedFor?: string | null,
    realIp?: string | null,
  ) {
    return forwardedFor?.trim() || realIp?.trim() || null;
  }

  private assertTenantBootstrapFixtureModeEnabled() {
    if (this.isTenantBootstrapFixtureModeEnabled()) {
      return;
    }

    throw new ApiRequestError(
      403,
      "AUTH_SESSION_EXCHANGE_DENIED",
      "The authentication proof could not be matched to an active session exchange.",
      {},
    );
  }

  private isTenantBootstrapFixtureModeEnabled() {
    const environment = detectAuthEnvironment(process.env);
    if (environment !== "local" && environment !== "test") {
      return false;
    }

    const mode =
      process.env[TENANT_BOOTSTRAP_FIXTURE_MODE_ENV]?.trim().toLowerCase() ??
      "";
    return mode === TENANT_BOOTSTRAP_FIXTURE_MODE;
  }

  private buildTenantBootstrapDeniedError() {
    return new ApiRequestError(
      403,
      "AUTH_SESSION_EXCHANGE_DENIED",
      "The authentication proof could not be matched to an active session exchange.",
      {},
    );
  }

  private isTenantBootstrapEligibleStatus(status: string | null | undefined) {
    return status?.trim().toLowerCase() === "active";
  }

  private resolveExistingUserRoleCode(
    roleCatalog: TenantRoleCatalogRecord[],
    existingUser: TenantUserRoleRecord,
  ): string {
    const existingRoleCode = existingUser.roleCode?.trim();
    if (!existingRoleCode) {
      throw new ApiRequestError(
        500,
        "TENANT_USER_ROLE_MISCONFIGURED",
        "The tenant user is missing a supported role assignment.",
        {
          email: existingUser.email,
          tenantId: existingUser.tenantId,
        },
      );
    }

    const supportedRole = roleCatalog.some(
      (role) => role.roleCode === existingRoleCode,
    );
    if (!supportedRole) {
      throw new ApiRequestError(
        500,
        "TENANT_USER_ROLE_MISCONFIGURED",
        "The tenant user references an unsupported role assignment.",
        {
          email: existingUser.email,
          tenantId: existingUser.tenantId,
          roleCode: existingRoleCode,
        },
      );
    }

    return existingRoleCode;
  }

  private buildTenantPortalProfile(
    tenantId: string,
    email: string,
    existingUser: TenantUserRoleRecord,
    roleCode: string,
  ): TenantPortalProfile {
    const fullName =
      existingUser.displayName?.trim() || this.deriveFallbackDisplayName(email);

    return {
      id: existingUser.userId?.trim() || this.deriveActorId(email),
      tenantId,
      fullName,
      email,
      roleCode,
    };
  }

  private buildIdentityContext(profile: TenantPortalProfile): IdentityContext {
    const scopes = getTenantRoleScopes(profile.roleCode);
    if (!scopes) {
      throw new ApiRequestError(
        500,
        "TENANT_ROLE_SCOPE_MISCONFIGURED",
        "No scope preset is configured for the tenant role.",
        {
          roleCode: profile.roleCode,
        },
      );
    }

    return {
      actorType: "tenant_admin",
      actorId: profile.id,
      realm: "tenant",
      authMode: "jwt_bearer",
      roleFamilies: ["tenant"],
      roles: [profile.roleCode],
      scopes: [...scopes],
      tenantId: profile.tenantId,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };
  }

  private deriveFallbackDisplayName(email: string): string {
    const localPart = email.split("@", 1)[0]?.trim();
    if (!localPart) {
      return "Tenant User";
    }

    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  }

  private deriveActorId(email: string): string {
    const slug =
      email
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "tenant-portal-user";
    return `tenant-portal-${slug}`;
  }

  private async issueJwtSession(
    identity: Parameters<JwtAuthService["issueSessionToken"]>[0],
    options?: Parameters<JwtAuthService["issueSessionToken"]>[1],
  ) {
    try {
      return await this.jwtAuthService.issueSessionToken(identity, options);
    } catch (error) {
      if (isJwtKeyMaterialNotConfiguredError(error)) {
        throw new ApiRequestError(
          503,
          "JWT_NOT_CONFIGURED",
          "JWT session issuance is not configured for this environment.",
          {
            requiredEnv: error.requiredEnv.join(" or "),
          },
        );
      }

      throw error;
    }
  }
}
