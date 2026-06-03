import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
} from "@nestjs/common";

import type { KnowledgeSearchResponse } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../../common/auth";
import { KnowledgeSearchService } from "./knowledge-search.service";

@Controller("ops/assistant/knowledge")
export class KnowledgeSearchController {
  constructor(private readonly knowledgeSearch: KnowledgeSearchService) {}

  @Get("search")
  @RequireRealms("ops", "platform")
  @RequireScopes("audit:read")
  search(
    @Query("q") query: string,
    @Query("limit") limit?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!query || !query.trim()) {
      throw new BadRequestException("query parameter q is required");
    }

    const parsedLimit =
      limit && limit.trim() ? Number.parseInt(limit.trim(), 10) : undefined;
    return toApiSuccessEnvelope<KnowledgeSearchResponse>(
      this.knowledgeSearch.search(query, parsedLimit),
      requestId,
    );
  }
}
