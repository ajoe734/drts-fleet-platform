import { Controller, Get, Headers } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type { IdentityContext } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, OpenRoute } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";

@Controller("identity")
export class IdentityController {
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
}
