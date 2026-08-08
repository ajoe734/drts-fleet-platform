import { Body, Controller, Get, Headers, Optional, Param, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CanonicalIdentitySessionRecord,
  CreatePartnerBootstrapSessionCommand,
  DriverDeviceProvisioningSession,
  CreateTenantBootstrapSessionCommand,
  IamSessionRevokeCommand,
  IdentityContext,
  PartnerBootstrapSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
  TenantBootstrapSession,
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
import type { AuthBootstrapHeaders } from "../../common/auth/auth.types";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { CurrentIdentity } from "../../common/auth";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { extractIapJwtAssertion } from "@drts/control-plane-auth";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { IAPSubjectAdapter } from "./iap-subject.adapter";
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
    private readonly identityRepository?: IdentityRepository,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    private readonly iapSubjectAdapter?: IAPSubjectAdapter,
    @Optional()
    private readonly serviceWorkloadIdentityAdapter?: ServiceWorkloadIdentityAdapter,
  ) {}

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
        authTime: new Date().toISOString(),
        amr: ["verified_iap_workforce"],
        acr: "aal2",
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
    const issued = await this.issueJwtSession(identity, {
      expiresIn,
      principalId: identity.principalId ?? identity.actorId,
      membershipId: identity.membershipId ?? null,
      subject: identity.subject ?? identity.actorId,
      ensurePrincipal: true,
      authTime: issuedAt,
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
    const isSelf =
      (callerPrincipalId && targetSession.principalId === callerPrincipalId) ||
      (identity.actorId && targetSession.actorId === identity.actorId) ||
      (identity.subject && targetSession.subject === identity.subject);

    if (!isSelf) {
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Self session revocation endpoints can only be used to revoke your own sessions. Use administrative session endpoints for remote revocation.",
      );
    }

    const reason = command.reason?.trim() || "self_revoke";
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
