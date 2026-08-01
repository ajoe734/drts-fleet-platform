import { Controller, Get, Headers, Query } from "@nestjs/common";

import type {
  IdentityContext,
  SecurityEventFamily,
  SecurityEventOutcome,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import { SecurityEventsService } from "./security-events.service";

@Controller("security-events")
export class SecurityEventsController {
  constructor(private readonly securityEventsService: SecurityEventsService) {}

  @Get()
  @RequireRealms("tenant", "platform", "ops")
  async listSecurityEvents(
    @CurrentIdentity() identity: IdentityContext | null,
    @Query("tenantId") tenantId?: string,
    @Query("partnerId") partnerId?: string,
    @Query("actorId") actorId?: string,
    @Query("eventFamily") eventFamily?: SecurityEventFamily,
    @Query("eventType") eventType?: string,
    @Query("outcome") outcome?: SecurityEventOutcome,
    @Query("limit") limit?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.securityEventsService.listEvents(identity, {
      tenantId: tenantId ?? null,
      partnerId: partnerId ?? null,
      actorId: actorId ?? null,
      eventFamily: eventFamily ?? null,
      eventType: eventType ?? null,
      outcome: outcome ?? null,
      limit: limit ? Number.parseInt(limit, 10) : null,
    });

    return toApiSuccessEnvelope({ items }, requestId);
  }

  @Get("matrix")
  @RequireRealms("tenant", "platform", "ops")
  listSecurityEventMatrix(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.securityEventsService.listMatrix(),
      },
      requestId,
    );
  }
}
