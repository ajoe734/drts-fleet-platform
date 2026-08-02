import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  forwardRef,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  AcceptTenantInvitationCommand,
  IdentityContext,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, OpenRoute } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

@Controller("identity")
export class IdentityController {
  constructor(
    @Inject(forwardRef(() => TenantPartnerService))
    private readonly tenantPartnerService: TenantPartnerService,
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

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Get("invitations/verify")
  async verifyInvitation(
    @Query("token") token?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.tenantPartnerService.verifyTenantInvitation(
      token ?? "",
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("invitations/accept")
  async acceptInvitation(
    @Body() command: AcceptTenantInvitationCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.tenantPartnerService.acceptTenantInvitation(
      command,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }
}

