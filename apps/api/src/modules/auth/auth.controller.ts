import { Body, Controller, Get, Headers, Optional, Param, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import jwt from "jsonwebtoken";

import type {
  CanonicalIdentitySessionRecord,
  CreatePartnerBootstrapSessionCommand,
  DriverDeviceProvisioningSession,
  CreateTenantBootstrapSessionCommand,
  IamCallbackSessionExchangeCommand,
  IamSessionRevokeCommand,
  IdentityContext,
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
import { OpenRoute } from "../../common/auth";
import { getTenantRoleScopes } from "../../common/auth/auth.constants";
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
import type { AuthBootstrapHeaders, AuthRealm } from "../../common/auth/auth.types";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { CurrentIdentity } from "../../common/auth";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { extractIapJwtAssertion } from "@drts/control-plane-auth";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { IAPSubjectAdapter } from "./iap-subject.adapter";
import { OidcPkceService } from "./oidc-pkce.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { IdentityRepository } from "../identity/identity.repository";
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
const TENANT_OIDC_SESSION_EXPIRES_IN: JwtExpiresIn = "8h";

function resolveBootstrapTokenAssurance(identity: BootstrapRequestIdentity): {
  amr?: string[];
  acr?: string;
} {
  switch (identity.actorType) {
    case "platform_admin":
    case "ops_user":
      return {
        amr: ["verified_iap_workforce"],
        acr: "aal2",
      };
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
    // Appended, and optional, so the positional contract the existing tests
    // construct this controller with is unchanged. The module always provides
    // it; `requireOidcPkceService` turns its absence into a clear failure
    // rather than a property access on undefined.
    @Optional()
    private readonly oidcPkceService?: OidcPkceService,
    @Optional()
    private readonly identityRepository?: IdentityRepository,
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
    if (realm !== "tenant" && realm !== "partner") {
      throw new ApiRequestError(
        400,
        "AUTH_REALM_INVALID",
        `Unsupported OIDC realm '${realm}'. Only 'tenant' and 'partner' are supported.`,
      );
    }
    const result = this.requireOidcPkceService().generateLoginParameters(realm, {
      redirectUri: redirectUri ?? null,
      tenantId: tenantId ?? null,
      partnerId: partnerId ?? null,
    });
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
      const session = await this.requireOidcPkceService().exchangeTenantCallbackSession(
        command,
        meta,
      );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
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
      const session = await this.requireOidcPkceService().exchangePartnerCallbackSession(
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

  @OpenRoute()
  @Post("logout")
  revokeAuthSession(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        loggedOut: true,
        message: "Session successfully revoked.",
      },
      requestId,
    );
  }

  @OpenRoute()
  @Post("token")
  async issueToken(@Req() request: TokenRequest): Promise<{
    token: string;
    expiresIn: string;
  }> {
    const strictEnvironment = isStrictAuthEnvironment();
    const isStrictIap =
      process.env.STRICT_IAP_MODE === "true" || strictEnvironment;
    const rawWorkloadAssertion = extractWorkloadIdentityAssertion(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const rawAssertion = extractIapJwtAssertion(request.headers);
    const bootstrapIdentity = extractBootstrapRequestIdentity(request.headers, {
      allowAnonymous: false,
      method: request.method,
      requestUrl: request.originalUrl ?? request.url,
    });

    if (strictEnvironment && bootstrapIdentity) {
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

    // Require internal key to issue tokens when workload proof is not used.
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);

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
          autoProvision: !isStrictIap,
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

    if (isStrictIap) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
      );
    }

    const expiresIn: JwtExpiresIn =
      identity.actorType === "system" ? "15m" : "8h";
    const issuedAt = new Date().toISOString();
    const assurance = resolveBootstrapTokenAssurance(identity);
    const issued = await this.issueJwtSession(identity, {
      expiresIn,
      principalId: identity.principalId ?? identity.actorId,
      membershipId: identity.membershipId ?? null,
      subject: identity.subject ?? identity.actorId,
      ensurePrincipal: true,
      authTime: issuedAt,
      ...(assurance.amr ? { amr: assurance.amr } : {}),
      ...(assurance.acr ? { acr: assurance.acr } : {}),
      tokenVersion: Date.parse(issuedAt),
    });
    return { token: issued.token, expiresIn };
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

  @Post("logout")
  async logout(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "UNAUTHENTICATED",
        "Authentication is required to log out.",
      );
    }
    const sessionId = identity.sessionId ?? null;
    if (sessionId) {
      await this.jwtAuthService.revokeCurrentSession(
        sessionId,
        "user_logout",
        identity.principalId ?? identity.actorId ?? undefined,
      );
    }
    return toApiSuccessEnvelope({ loggedOut: true, sessionId }, requestId);
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "UNAUTHENTICATED",
        "Authentication is required to log out all sessions.",
      );
    }
    const principalId = identity.principalId ?? identity.actorId;
    if (!principalId) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Principal identity is required to logout all sessions.",
      );
    }
    const revokedCount = await this.jwtAuthService.revokeAllSessionsForPrincipal(
      principalId,
      "user_logout_all",
      principalId,
    );

    if (identity.realm === "tenant" && identity.tenantId && identity.actorId) {
      const user = this.tenantPartnerService.findTenantUser(
        identity.tenantId,
        identity.actorId,
      );
      if (user) {
        const identityContext: IdentityContext = {
          actorType: identity.actorType,
          actorId: identity.actorId,
          realm: identity.realm,
          authMode: identity.authMode,
          roleFamilies: identity.roleFamilies,
          roles: identity.roles,
          scopes: identity.scopes,
          tenantId: identity.tenantId,
          supportedExecutionModes: [
            "discussion_planning",
            "supervisor_managed_execution",
          ],
        };
        this.tenantPartnerService.updateTenantUserRole(
          identity.tenantId,
          user.userId,
          { roleCode: user.roleCode, status: user.status },
          requestId,
          identityContext,
        );
      }
    }

    return toApiSuccessEnvelope(
      { loggedOutAll: true, revokedCount },
      requestId,
    );
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
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);
    let tenantId: string | null = null;
    let email: string | null = null;

    try {
      const oidcIdentity = this.verifyTenantOidcIdToken(command.idToken);
      const resolvedEmail = oidcIdentity.email;
      email = resolvedEmail;
      const resolvedTenantId =
        command.tenantId?.trim() || this.tenantPartnerService.getDefaultTenantId();
      tenantId = resolvedTenantId;
      const existingUser = this.tenantPartnerService
        .listTenantUsers(resolvedTenantId)
        .find((user) => user.email === resolvedEmail) ?? null;

      if (!existingUser || !this.isTenantBootstrapEligibleStatus(existingUser.status)) {
        throw this.buildTenantBootstrapDeniedError();
      }

      const roleCode = this.resolveExistingUserRoleCode(
        this.tenantPartnerService.listTenantRoles(),
        existingUser,
      );
      if (this.isHighPrivilegeTenantRole(roleCode) && !oidcIdentity.hasTrustedMfa) {
        throw new ApiRequestError(
          403,
          "AUTH_MFA_REQUIRED",
          "A trusted OIDC MFA assertion is required for this tenant role.",
        );
      }

      const profile = this.buildTenantPortalProfile(
        resolvedTenantId,
        resolvedEmail,
        existingUser,
        roleCode,
      );
      const identity = this.buildIdentityContext(profile);
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: identity.actorType,
          actorId: identity.actorId,
          principalId: identity.actorId,
          subject: oidcIdentity.subject,
          realm: identity.realm,
          tenantId: identity.tenantId,
          roleFamilies: identity.roleFamilies,
          roles: identity.roles,
          scopes: identity.scopes,
          requestId: requestId ?? null,
        },
        {
          expiresIn: TENANT_OIDC_SESSION_EXPIRES_IN,
          principalId: identity.actorId,
          subject: oidcIdentity.subject,
          ensurePrincipal: true,
          authTime: oidcIdentity.authTime,
          amr: oidcIdentity.amr,
          acr: oidcIdentity.acr,
          tokenVersion: Date.parse(existingUser.updatedAt),
        },
      );
      const session: TenantBootstrapSession = {
        accessToken: issued.token,
        tokenType: "Bearer",
        expiresIn: TENANT_OIDC_SESSION_EXPIRES_IN,
        profile,
        identity,
      };
      this.securityEventsService?.recordEvent({
        actorId: identity.actorId, actorType: identity.actorType, subjectId: oidcIdentity.subject,
        realm: "tenant", tenantId, partnerId: null, eventType: "tenant_oidc_session.issued",
        eventFamily: "auth", outcome: "success", severity: "low", targetType: "tenant_portal_session",
        targetId: profile.id, sessionId: issued.sessionId, tokenId: issued.tokenId,
        authMethods: issued.amr, sourceIp, userAgent: userAgent ?? null, requestId: requestId ?? null,
        traceId: null, reasonCode: null, approvalId: null, beforeSummary: null,
        afterSummary: { actorId: identity.actorId, roleCode, tenantId },
        maskedContext: { email },
      });
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      this.securityEventsService?.recordEvent({
        actorId: null, actorType: "system", subjectId: email, realm: "tenant", tenantId,
        partnerId: null, eventType: "tenant_oidc_session.denied", eventFamily: "auth",
        outcome: "denied", severity: "medium", targetType: "tenant_portal_session", targetId: null,
        sessionId: null, tokenId: null, authMethods: ["oidc"], sourceIp, userAgent: userAgent ?? null,
        requestId: requestId ?? null, traceId: null, reasonCode: this.extractErrorCode(error), approvalId: null,
        beforeSummary: null, afterSummary: null, maskedContext: { email, tenantId },
      });
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
      const resolved = this.tenantPartnerService.authenticatePartnerBootstrap(
        command,
        requestId,
      );
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
    @Body() body: { reason?: string },
    @Req() request: TokenRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity || !identity.sessionId) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to perform logout.",
      );
    }

    validateCsrfHeader(
      request.headers as Record<string, string | string[] | undefined>,
    );

    const reason = body?.reason?.trim() || "self_logout";
    const principalId = identity.principalId ?? identity.actorId ?? undefined;

    if (this.identityRepository) {
      await this.identityRepository.revokeSession(
        identity.sessionId,
        reason,
        principalId,
      );
    }

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
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { status: "active" },
      afterSummary: { status: "revoked" },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { revoked: true, sessionId: identity.sessionId },
      requestId,
    );
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: { reason?: string },
    @Req() request: TokenRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required for logout-all.",
      );
    }

    validateCsrfHeader(
      request.headers as Record<string, string | string[] | undefined>,
    );

    const principalId = identity.principalId ?? identity.actorId;
    if (!principalId) {
      throw new ApiRequestError(
        400,
        "PRINCIPAL_REQUIRED",
        "Principal identifier is required for logout-all.",
      );
    }
    const reason = body?.reason?.trim() || "self_logout_all";
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
      revokedCount = 1;
      revokedSessionIds.push(identity.sessionId);
    }

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
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { revokedCount },
      afterSummary: { revokedCount, sessionIds: revokedSessionIds },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { revokedCount, sessionIds: revokedSessionIds },
      requestId,
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

  private verifyTenantOidcIdToken(idToken: string) {
    const issuer = process.env.TENANT_OIDC_ISSUER?.trim() || process.env.OIDC_ISSUER?.trim();
    const audience = process.env.TENANT_OIDC_AUDIENCE?.trim() || process.env.OIDC_AUDIENCE?.trim();
    const key = process.env.TENANT_OIDC_JWT_PUBLIC_KEY?.trim() || process.env.TENANT_OIDC_JWT_SECRET?.trim();
    if (!issuer || !audience || !key) {
      throw new ApiRequestError(503, "TENANT_OIDC_NOT_CONFIGURED", "Tenant OIDC validation is not configured.");
    }
    if (!idToken?.trim()) {
      throw new ApiRequestError(400, "FIELD_REQUIRED", "idToken is required.", { field: "idToken" });
    }
    const algorithms = (process.env.TENANT_OIDC_ALGORITHMS?.split(/[;,]/).map((value) => value.trim()).filter(Boolean) ??
      [/BEGIN (PUBLIC KEY|CERTIFICATE|RSA PUBLIC KEY)/.test(key) ? "RS256" : "HS256"]) as jwt.Algorithm[];
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(idToken, key, { issuer, audience, algorithms }) as jwt.JwtPayload;
    } catch {
      throw new ApiRequestError(401, "AUTH_CREDENTIALS_INVALID", "OIDC ID token is invalid or expired.");
    }
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!email || !subject || payload.email_verified === false) {
      throw new ApiRequestError(401, "AUTH_CREDENTIALS_INVALID", "OIDC ID token is missing a verified subject or email claim.");
    }
    const amr = Array.isArray(payload.amr) ? payload.amr.filter((value): value is string => typeof value === "string") : [];
    const acr = typeof payload.acr === "string" && payload.acr.trim() ? payload.acr.trim() : "aal1";
    const hasTrustedMfa = amr.some((method) => ["mfa", "otp", "webauthn", "hwk", "fido2"].includes(method.toLowerCase())) || /(?:aal|urn:.*:aal)[2-9]/i.test(acr);
    return {
      email,
      subject,
      amr: [...new Set(["oidc", ...amr])],
      acr,
      hasTrustedMfa,
      authTime: typeof payload.auth_time === "number" ? new Date(payload.auth_time * 1000).toISOString() : new Date().toISOString(),
    };
  }

  private isHighPrivilegeTenantRole(roleCode: string): boolean {
    return ["tenant_admin", "tenant_ops_admin"].includes(roleCode);
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
