import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PlatformSearchService } from "./platform-search.service";

@Controller("platform")
export class PlatformSearchController {
  constructor(private readonly platformSearchService: PlatformSearchService) {}

  @Get("search")
  @RequireRealms("platform")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  search(
    @Query("q") query?: string,
    @Query("query") legacyQuery?: string,
    @Query("types") requestedTypes?: string | string[],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.platformSearchService.searchPlatform(
          query ?? legacyQuery,
          requestedTypes,
        ),
      },
      requestId,
    );
  }
}
