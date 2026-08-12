import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Optional,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreateStepUpProofCommand,
  IamSessionInventoryQuery,
  IamSessionRevokeCommand,
  IdentityContext,
  StepUpProof,
  CreatePrivilegedRoleRequestCommand,
  ApprovePrivilegedRoleRequestCommand,
  RejectPrivilegedRoleRequestCommand,
  RemovePrivilegedRoleGrantCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  StepUpProofService,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  OPEN_ROUTE_RATE_LIMIT,
  READ_HEAVY_RATE_LIMIT,
} from "../../common/throttling/rate-limit.constants";
import { IdentityRepository } from "./identity.repository";
import { PrivilegedRoleGovernanceService } from "./privileged-role-governance.service";
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
  private readonly identityRepository: IdentityRepository | undefined;
  private readonly securityEventsService: SecurityEventsService | undefined;
  private readonly stepUpProofService: StepUpProofService | undefined;
  private readonly privilegedRoleGovernanceService:
    | PrivilegedRoleGovernanceService
    | undefined;

  constructor(
    @Optional() arg1?: IdentityRepository | PrivilegedRoleGovernanceService,
    @Optional() arg2?: SecurityEventsService | StepUpProofService,
    @Optional() arg3?: StepUpProofService,
    @Optional() arg4?: PrivilegedRoleGovernanceService,
  ) {
    if (arg1 && typeof (arg1 as any).expireStaleGrants === "function") {
      this.privilegedRoleGovernanceService =
        arg1 as PrivilegedRoleGovernanceService;
      this.stepUpProofService = arg2 as StepUpProofService;
    } else {
      this.identityRepository = arg1 as IdentityRepository;
      this.securityEventsService = arg2 as SecurityEventsService;
      this.stepUpProofService = arg3;
      this.privilegedRoleGovernanceService = arg4;
    }
  }

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

  @Post("step-up-proofs")
  @RequireRealms("platform", "tenant", "ops", "partner", "driver")
  createStepUpProof(
    @Body() command: CreateStepUpProofCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!this.stepUpProofService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Step-up proof service is not configured.",
      );
    }
    const proof: StepUpProof = this.stepUpProofService.createProof(
      identity,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(proof, requestId);
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

    this.assertAdminReadAuthority(identity);

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

    let sessions: import("@drts/contracts").CanonicalIdentitySessionRecord[] =
      [];
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

    this.assertAdminRevokeAuthority(identity);
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
        {
          sid,
          targetTenantId: targetSession.tenantId,
          callerTenantId: identity.tenantId,
        },
      );
    }

    const reason = command.reason?.trim() || "admin_revoke";
    const callerPrincipalId =
      identity.principalId ?? identity.actorId ?? undefined;
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

  @Post("privileged-role-requests")
  async createPrivilegedRoleRequest(
    @Body() command: CreatePrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_CREDENTIALS_INVALID",
        "Authenticated identity is required to request privileged role.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const result = await this.privilegedRoleGovernanceService.createRequest(
      command,
      identity,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Get("privileged-role-requests")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async listPrivilegedRoleRequests(
    @Query("tenantId") tenantId?: string,
    @CurrentIdentity() identity?: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_CREDENTIALS_INVALID",
        "Authenticated identity is required to list privileged role requests.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const items = await this.privilegedRoleGovernanceService.listRequests(
      identity,
      tenantId,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("privileged-role-requests/:requestId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getPrivilegedRoleRequest(
    @Param("requestId") requestIdParam: string,
    @CurrentIdentity() identity?: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_CREDENTIALS_INVALID",
        "Authenticated identity is required to view privileged role request.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const result = await this.privilegedRoleGovernanceService.getRequest(
      requestIdParam,
      identity,
    );
    if (!result) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "IAM_APPROVAL_NOT_FOUND",
        `Privileged role request '${requestIdParam}' not found.`,
      );
    }
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("privileged-role-requests/:requestId/approve")
  async approvePrivilegedRoleRequest(
    @Param("requestId") requestIdParam: string,
    @Body() command: ApprovePrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_CREDENTIALS_INVALID",
        "Authenticated identity is required to approve privileged role request.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const result = await this.privilegedRoleGovernanceService.approveRequest(
      requestIdParam,
      identity,
      command,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("privileged-role-requests/:requestId/reject")
  async rejectPrivilegedRoleRequest(
    @Param("requestId") requestIdParam: string,
    @Body() command: RejectPrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_CREDENTIALS_INVALID",
        "Authenticated identity is required to reject privileged role request.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const result = await this.privilegedRoleGovernanceService.rejectRequest(
      requestIdParam,
      identity,
      command,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("privileged-role-grants/remove")
  async removePrivilegedRoleGrant(
    @Body() command: RemovePrivilegedRoleGrantCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_CREDENTIALS_INVALID",
        "Authenticated identity is required to remove privileged role grant.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const result = await this.privilegedRoleGovernanceService.removeGrant(
      command,
      identity,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("privileged-role-grants/process-expiries")
  async processExpiredPrivilegedRoleGrants(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      !identity ||
      (identity.realm !== "system" && identity.actorType !== "system")
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Only internal system/scheduler authority can invoke process-expiries.",
      );
    }
    if (!this.privilegedRoleGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Privileged role governance service is not configured.",
      );
    }
    const expired =
      await this.privilegedRoleGovernanceService.expireStaleGrants();
    return toApiSuccessEnvelope(toApiListData(expired), requestId);
  }

  private assertAdminReadAuthority(identity: BootstrapRequestIdentity): void {
    const isPlatformOrOpsAdmin =
      (identity.realm === "platform" || identity.realm === "ops") &&
      (identity.actorType === "platform_admin" ||
        identity.roles.includes("platform_superadmin") ||
        identity.roles.includes("platform_user_admin") ||
        identity.roles.includes("ops_admin") ||
        identity.scopes.includes("platform:superadmin") ||
        identity.scopes.includes("identity:sessions:read") ||
        identity.scopes.includes("identity:sessions:write") ||
        identity.scopes.includes("identity:users:read") ||
        identity.scopes.includes("identity:users:write"));

    const isTenantAdmin =
      identity.realm === "tenant" &&
      (identity.actorType === "tenant_admin" ||
        identity.roles.includes("tenant_admin") ||
        identity.scopes.includes("identity:users:write") ||
        identity.scopes.includes("identity:sessions:read") ||
        identity.scopes.includes("identity:sessions:write"));

    if (!isPlatformOrOpsAdmin && !isTenantAdmin) {
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Administrative read privileges are required for session inventory operations.",
      );
    }
  }

  private assertAdminRevokeAuthority(identity: BootstrapRequestIdentity): void {
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
        "Administrative write privileges are required for session revocation.",
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
