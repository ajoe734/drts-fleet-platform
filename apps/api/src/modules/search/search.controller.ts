import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { SearchService } from "./search.service";

@Controller("tenant")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("search")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  searchTenant(
    @Headers("x-tenant-id") tenantId: string | undefined,
    @Query("q") query: string,
    @Query("types") types?: string | string[],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.searchService.searchTenant(tenantId ?? "", query, types),
      requestId,
    );
  }
}
