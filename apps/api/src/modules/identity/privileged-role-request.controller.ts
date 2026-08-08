import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApprovePrivilegedRoleRequestCommand,
  CreatePrivilegedRoleRequestCommand,
  ListPrivilegedRoleRequestsQuery,
  RejectPrivilegedRoleRequestCommand,
  RemovePrivilegedRoleGrantCommand,
} from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { IdentityContext } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PrivilegedRoleRequestService } from "./privileged-role-request.service";

@Controller("identity/privileged-role-requests")
export class PrivilegedRoleRequestController {
  constructor(
    private readonly privilegedRoleRequestService: PrivilegedRoleRequestService,
  ) {}

  @Post()
  async createRequest(
    @Body() command: CreatePrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.privilegedRoleRequestService.createRequest(
      tenantId ?? command.tenantId ?? null,
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Get()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listRequests(
    @Query() query: ListPrivilegedRoleRequestsQuery,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.privilegedRoleRequestService.listRequests({
      ...query,
      tenantId: tenantId ?? query.tenantId ?? undefined,
    });
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get(":requestId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getRequest(
    @Param("requestId") requestIdParam: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const item = this.privilegedRoleRequestService.getRequest(requestIdParam);
    return toApiSuccessEnvelope(item, requestId);
  }

  @Post(":requestId/approve")
  async approveRequest(
    @Param("requestId") requestIdParam: string,
    @Body() command: ApprovePrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.privilegedRoleRequestService.approveRequest(
      requestIdParam,
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post(":requestId/reject")
  async rejectRequest(
    @Param("requestId") requestIdParam: string,
    @Body() command: RejectPrivilegedRoleRequestCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.privilegedRoleRequestService.rejectRequest(
      requestIdParam,
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post(":requestId/remove")
  async removeGrant(
    @Param("requestId") requestIdParam: string,
    @Body() command: RemovePrivilegedRoleGrantCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.privilegedRoleRequestService.removeGrant(
      requestIdParam,
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("process-expiries")
  async processExpiries(
    @Body() body?: { now?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.privilegedRoleRequestService.processExpiries(
      body?.now,
    );
    return toApiSuccessEnvelope(result, requestId);
  }
}
