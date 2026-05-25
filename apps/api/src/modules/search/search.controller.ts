import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { SearchService } from "./search.service";

@Controller("ops")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("search")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  searchOps(
    @Query("q") query: string,
    @Query("types") types?: string | string[],
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.searchService.searchOps(query, types),
      requestId,
    );
  }
}
