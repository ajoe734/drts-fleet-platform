import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope, ApiRequestError } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { TenantSearchService } from "./tenant-search.service";
import { parseTenantSearchTypes } from "./tenant-search.types";

@Controller()
export class TenantSearchController {
  constructor(private readonly tenantSearchService: TenantSearchService) {}

  private requireTenantId(tenantId?: string) {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant search endpoints.",
      );
    }

    return normalizedTenantId;
  }

  @Get("tenant/search")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  searchTenant(
    @Query("q") q = "",
    @Query("types") rawTypes?: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const types = parseTenantSearchTypes(rawTypes);

    return toApiSuccessEnvelope(
      this.tenantSearchService.searchTenant(this.requireTenantId(tenantId), {
        q,
        ...(types ? { types } : {}),
      }),
      requestId,
    );
  }
}
