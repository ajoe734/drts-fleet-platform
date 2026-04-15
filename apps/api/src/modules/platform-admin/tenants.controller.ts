import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TenantsService } from "./tenants.service";
import type { TenantSummary } from "./tenants.service";

@Controller("platform-admin")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get("tenants")
  list(@Headers("x-request-id") requestId?: string) {
    const items: TenantSummary[] = this.tenants.list();
    return toApiSuccessEnvelope({ items }, requestId);
  }

  @Post("tenants")
  create(
    @Body() body: { name: string; status?: "active" | "inactive" },
    @Headers("x-request-id") requestId?: string,
  ) {
    const created = this.tenants.create(body);
    return toApiSuccessEnvelope(created, requestId);
  }

  @Post("tenants/:tenantId/suspend")
  suspend(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.setStatus(tenantId, "paused");
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/activate")
  activate(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.setStatus(tenantId, "active");
    return toApiSuccessEnvelope(updated, requestId);
  }
}
