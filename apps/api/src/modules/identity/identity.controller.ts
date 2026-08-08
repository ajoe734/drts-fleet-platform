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
  IamSessionInventoryQuery,
  IamSessionRevokeCommand,
  IdentityContext,
} from "@drts/contracts";

import { ApiRequestError, toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, OpenRoute } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { IdentityRepository } from "./identity.repository";
import { SecurityEventsService } from "../security-events/security-events.service";
import {
  maskSessionRecord,
  validateCsrfHeader,
} from "../auth/session-masking.utility";

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
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
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: IamSessionInventoryQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to query admin sessions.",
      );
    }

    this.assertAdminAuthority(identity);

    const effectiveQuery: IamSessionInventoryQuery = { ...query };

    if (identity.realm === "tenant") {
      const requestedTenantId = query.tenantId?.trim();
      if (requestedTenantId && requestedTenantId !== identity.tenantId) {
        throw new ApiRequestError(
          403,
          "RESOURCE_SCOPE_DENIED",
          "Tenant administrators cannot query session inventory for another tenant boundary.",
          { requestedTenantId, callerTenantId: identity.tenantId },
        );
      }
      effectiveQuery.tenantId = identity.tenantId;
    }

    let sessions: import("@drts/contracts").CanonicalIdentitySessionRecord[] = [];
    if (this.identityRepository) {
      sessions = await this.identityRepository.listSessions(effectiveQuery);
    }

    const masked = sessions.map((session) =>
      maskSessionRecord(session, identity.sessionId),
    );

    return toApiSuccessEnvelope(masked, requestId);
  }

  @Post("sessions/:sid/revoke")
  async revokeAdminSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("sid") sid: string,
    @Body() command: IamSessionRevokeCommand,
    @Req() request: RequestWithHeaders,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to perform admin session revoke.",
      );
    }

    this.assertAdminAuthority(identity);
    validateCsrfHeader(request.headers);

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

    if (
      identity.realm === "tenant" &&
      targetSession.tenantId !== identity.tenantId
    ) {
      throw new ApiRequestError(
        403,
        "RESOURCE_SCOPE_DENIED",
        "Tenant administrators cannot revoke session outside their tenant boundary.",
        { sid, targetTenantId: targetSession.tenantId, callerTenantId: identity.tenantId },
      );
    }

    const reason = command.reason?.trim() || "admin_revoke";
    const callerPrincipalId = identity.principalId ?? identity.actorId ?? undefined;
    const updated = await this.identityRepository.revokeSession(
      sid,
      reason,
      callerPrincipalId,
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
      eventType: "session.admin_revoke",
      eventFamily: "auth",
      outcome: "success",
      severity: "high",
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
      afterSummary: {
        status: "revoked",
        isCompromised: Boolean(command.isCompromised),
      },
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

  private assertAdminAuthority(identity: BootstrapRequestIdentity): void {
    const isPlatformOrOps =
      identity.realm === "platform" || identity.realm === "ops";
    const isTenantAdmin =
      identity.realm === "tenant" &&
      (identity.actorType === "tenant_admin" ||
        identity.roles.includes("tenant_admin") ||
        identity.scopes.includes("identity:users:write") ||
        identity.scopes.includes("identity:sessions:read"));

    if (!isPlatformOrOps && !isTenantAdmin) {
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Administrative privileges are required for session inventory operations.",
      );
    }
  }

  private resolveSourceIp(
    forwardedFor?: string | null,
    realIp?: string | null,
  ): string | null {
    return forwardedFor?.trim() || realIp?.trim() || null;
  }
}
