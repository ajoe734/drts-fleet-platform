import { Controller, Get, Headers } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  FeatureGated,
  RequireRealms,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { OPS_ASSISTANT_FLAG_KEY } from "./assistant.constants";
import { AssistantService } from "./assistant.service";

@Controller("assistant")
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  /**
   * Ungated read of assistant availability. The ops-console widget calls this
   * to decide whether to render itself for the current realm/tenant; it returns
   * the resolved flag value rather than a 403 so the UI can hide silently when
   * disabled.
   */
  @Get("availability")
  async getAvailability(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantHeader?: string,
  ) {
    const tenantId = identity?.tenantId ?? tenantHeader ?? null;
    const availability = await this.service.getAvailability(tenantId);
    return toApiSuccessEnvelope(availability, requestId);
  }

  /**
   * Backend assistant entrypoint. Requires an authenticated ops (or system)
   * bootstrap identity — without it the route is NOT public: BootstrapAuthGuard
   * returns 401 AUTH_REQUIRED for anonymous callers and 403 AUTH_REALM_DENIED
   * for other realms. Layered on top, the same flag gates availability so the
   * assistant backend is only reachable where ops.assistant.enabled is on for
   * the realm; the FeatureGateGuard returns 403 FEATURE_FLAG_DISABLED otherwise.
   */
  @RequireRealms("system", "ops")
  @FeatureGated(OPS_ASSISTANT_FLAG_KEY)
  @Get("session")
  async getSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        flagKey: OPS_ASSISTANT_FLAG_KEY,
        tenantId: identity?.tenantId ?? null,
        status: "ready" as const,
      },
      requestId,
    );
  }
}
