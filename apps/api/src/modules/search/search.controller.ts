import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { SearchService } from "./search.service";

@Controller("platform")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("search")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  search(
    @Query("q") q?: string,
    @Query("query") query?: string,
    @Query("types") types?: string | string[],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.searchService.search(q ?? query, types),
      requestId,
    );
  }
}
