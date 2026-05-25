import { Controller, Get, Headers } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { TenantIntegrationService } from "./tenant-integration.service";

@Controller()
export class TenantIntegrationController {
  constructor(
    private readonly tenantIntegrationService: TenantIntegrationService,
  ) {}

  private requireTenantId(tenantId?: string) {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant integration endpoints.",
      );
    }

    return normalizedTenantId;
  }

  @Get("tenant/integration-governance/readiness")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getTenantIntegrationReadiness(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantIntegrationService.getTenantIntegrationReadiness(
        this.requireTenantId(tenantId),
      ),
      requestId,
    );
  }
}
