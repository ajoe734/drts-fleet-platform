import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CanonicalIdentitySessionRecord,
  IdentityContext,
  MaskedIdentitySessionRecord,
  RevokeSessionCommand,
} from "@drts/contracts";

import { ApiRequestError, toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, OpenRoute } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import type { AuthBootstrapHeaders } from "../../common/auth/auth.types";
import { maskSessionRecord } from "../../common/auth/session-masking.util";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { SecurityEventsService } from "../security-events/security-events.service";
import { IdentityRepository } from "./identity.repository";

interface RequestWithHeaders {
  headers: AuthBootstrapHeaders & {
    "x-csrf-token"?: string;
    "x-xsrf-token"?: string;
    cookie?: string;
  };
}

function checkCsrfProtection(
  identity: BootstrapRequestIdentity,
  req: RequestWithHeaders,
  csrfHeader?: string,
  xsrfHeader?: string,
) {
  const isCookieAuth =
    (identity.authMode as string) === "cookie" ||
    Boolean(
      req.headers &&
        req.headers.cookie &&
        !(req.headers as Record<string, string | undefined>).authorization,
    );

  if (isCookieAuth) {
    const token = csrfHeader || xsrfHeader;
    if (!token || !token.trim()) {
      throw new ApiRequestError(
        403,
        "CSRF_TOKEN_INVALID",
        "CSRF token missing or invalid for browser cookie session mutation",
      );
    }
  }
}

@Controller("identity")
export class IdentityController {
  constructor(
    @Optional() private readonly identityRepository?: IdentityRepository,
    @Optional() private readonly securityEventsService?: SecurityEventsService,
  ) {}

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Get("context")
  getContext(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const context: IdentityContext = {
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

    return toApiSuccessEnvelope(context, requestId);
  }

  @Get("sessions")
  async listAdminSessions(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Query("tenantId") queryTenantId?: string,
    @Query("principalId") queryPrincipalId?: string,
    @Query("status") queryStatus?: string,
    @Query("limit") queryLimit?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const isAdmin =
      identity.roles?.includes("platform_superadmin") ||
      identity.roles?.includes("platform_user_admin") ||
      identity.roles?.includes("tenant_admin") ||
      identity.actorType === "platform_admin" ||
      identity.actorType === "tenant_admin" ||
      identity.actorType === "ops_user" ||
      identity.scopes?.includes("identity:sessions:read");

    if (!isAdmin) {
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Admin session inventory permission denied",
      );
    }

    let effectiveTenantId = queryTenantId?.trim() || null;
    if (
      (identity.actorType === "tenant_admin" || identity.realm === "tenant") &&
      identity.tenantId
    ) {
      if (effectiveTenantId && effectiveTenantId !== identity.tenantId) {
        throw new ApiRequestError(
          403,
          "AUTHZ_REALM_DENIED",
          "Tenant admins cannot access session inventory outside their tenant",
        );
      }
      effectiveTenantId = identity.tenantId;
    }

    const limit = queryLimit ? parseInt(queryLimit, 10) : 50;

    let sessions: CanonicalIdentitySessionRecord[] = [];
    if (this.identityRepository) {
      sessions = await this.identityRepository.listSessionsForAdmin({
        tenantId: effectiveTenantId,
        principalId: queryPrincipalId?.trim() || null,
        status: queryStatus?.trim() || null,
        limit,
      });
    }

    const items: MaskedIdentitySessionRecord[] = sessions.map((s) =>
      maskSessionRecord(s, identity.sessionId),
    );

    return toApiSuccessEnvelope({ items }, requestId);
  }

  @Post("sessions/:sid/revoke")
  async revokeAdminSession(
    @Param("sid") sid: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Body() body: RevokeSessionCommand,
    @Req() req: RequestWithHeaders,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-csrf-token") csrfHeader?: string,
    @Headers("x-xsrf-token") xsrfHeader?: string,
  ) {
    checkCsrfProtection(identity, req, csrfHeader, xsrfHeader);

    if (!sid) {
      throw new ApiRequestError(
        400,
        "IAM_SESSION_ID_REQUIRED",
        "Session ID required",
      );
    }

    const isAdmin =
      identity.roles?.includes("platform_superadmin") ||
      identity.roles?.includes("platform_user_admin") ||
      identity.roles?.includes("tenant_admin") ||
      identity.actorType === "platform_admin" ||
      identity.actorType === "tenant_admin" ||
      identity.scopes?.includes("identity:sessions:write");

    if (!isAdmin) {
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Admin session revoke permission denied",
      );
    }

    const targetSession = this.identityRepository
      ? await this.identityRepository.getSession(sid)
      : null;

    if (!targetSession) {
      throw new ApiRequestError(
        404,
        "IAM_CREDENTIAL_NOT_FOUND",
        `Session ${sid} not found`,
      );
    }

    if (
      (identity.actorType === "tenant_admin" || identity.realm === "tenant") &&
      identity.tenantId &&
      targetSession.tenantId !== identity.tenantId
    ) {
      throw new ApiRequestError(
        403,
        "AUTHZ_REALM_DENIED",
        "Tenant admins cannot revoke sessions outside their tenant",
      );
    }

    if (!body?.reason || !body.reason.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "Revoke reason is required for administrator session revocation",
      );
    }

    if (targetSession.status !== "active") {
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        "Session is not active or has already been revoked",
      );
    }

    if (
      typeof body?.expectedVersion === "number" &&
      targetSession.tokenVersion !== body.expectedVersion
    ) {
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        `Expected version ${body.expectedVersion} does not match current version ${targetSession.tokenVersion}`,
      );
    }

    const reason = body.reason.trim();
    const principalId = identity.principalId || identity.actorId;

    let updatedSession: CanonicalIdentitySessionRecord | null = null;
    if (this.identityRepository) {
      updatedSession = await this.identityRepository.revokeSession(
        sid,
        reason,
        principalId || undefined,
        body?.expectedVersion,
      );
    }

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        eventType: "ADMIN_SESSION_REVOKED",
        eventFamily: "session",
        outcome: "success",
        severity: "medium",
        actorId: identity.actorId ?? null,
        actorType: identity.actorType,
        realm: identity.realm,
        tenantId: targetSession.tenantId || identity.tenantId || null,
        partnerId: identity.partnerId ?? null,
        targetType: "session",
        targetId: sid,
        sessionId: identity.sessionId ?? null,
        authMethods: ["bearer"],
        reasonCode: "ADMIN_SESSION_REVOKED",
        maskedContext: { reason },
        requestId: requestId ?? null,
        traceId: null,
        approvalId: null,
      });
    }

    return toApiSuccessEnvelope(
      {
        success: true,
        sessionId: sid,
        status: "revoked",
        session: updatedSession
          ? maskSessionRecord(updatedSession, identity.sessionId)
          : null,
      },
      requestId,
    );
  }
}
