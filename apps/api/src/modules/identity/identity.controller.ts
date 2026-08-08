import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreatePrivilegedRoleRequestCommand,
  IdentityContext,
  ListPrivilegedRoleRequestsQuery,
  PrivilegedRoleRequestDecisionCommand,
  PrivilegedRoleRequestRemovalCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PrivilegedRoleRequestService } from "./privileged-role-request.service";

@Controller("identity")
export class IdentityController {
  constructor(
    private readonly privilegedRoleRequestService: PrivilegedRoleRequestService,
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

  @Get("privileged-role-requests")
  @RequireRealms("platform", "ops", "tenant")
  @RequireScopes("identity:read")
  async listPrivilegedRoleRequests(
    @Query() query: ListPrivilegedRoleRequestsQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.privilegedRoleRequestService.listRequests(query),
      },
      requestId,
    );
  }

  @Post("privileged-role-requests")
  @RequireRealms("platform", "ops", "tenant")
  @RequireScopes("identity:write")
  async createPrivilegedRoleRequest(
    @Body() command: CreatePrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.privilegedRoleRequestService.createRequest(command, identity),
      requestId,
    );
  }

  @Get("privileged-role-requests/:requestId")
  @RequireRealms("platform", "ops", "tenant")
  @RequireScopes("identity:read")
  async getPrivilegedRoleRequest(
    @Param("requestId") requestId: string,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.privilegedRoleRequestService.getRequest(requestId),
      requestIdHeader,
    );
  }

  @Post("privileged-role-requests/:requestId/approve")
  @RequireRealms("platform", "ops", "tenant")
  @RequireScopes("identity:write")
  async approvePrivilegedRoleRequest(
    @Param("requestId") requestId: string,
    @Body() command: PrivilegedRoleRequestDecisionCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.privilegedRoleRequestService.approveRequest(
        requestId,
        command,
        identity,
      ),
      requestIdHeader,
    );
  }

  @Post("privileged-role-requests/:requestId/reject")
  @RequireRealms("platform", "ops", "tenant")
  @RequireScopes("identity:write")
  async rejectPrivilegedRoleRequest(
    @Param("requestId") requestId: string,
    @Body() command: PrivilegedRoleRequestDecisionCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.privilegedRoleRequestService.rejectRequest(
        requestId,
        command,
        identity,
      ),
      requestIdHeader,
    );
  }

  @Post("privileged-role-requests/:requestId/remove")
  @RequireRealms("platform", "ops", "tenant")
  @RequireScopes("identity:write")
  async removePrivilegedRoleRequest(
    @Param("requestId") requestId: string,
    @Body() command: PrivilegedRoleRequestRemovalCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.privilegedRoleRequestService.removeGrant(
        requestId,
        command,
        identity,
      ),
      requestIdHeader,
    );
  }
}
