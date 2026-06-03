import { Controller, Get, Headers, Query } from "@nestjs/common";

import type { KnowledgeSearchResponse } from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../../common/auth";
import { KnowledgeSearchService } from "./knowledge-search.service";

@Controller("ops/assistant/knowledge")
export class KnowledgeController {
  constructor(
    private readonly knowledgeSearchService: KnowledgeSearchService,
  ) {}

  @Get("search")
  @RequireRealms("ops", "platform")
  @RequireScopes("audit:read")
  search(
    @Query("q") query: string | undefined,
    @Query("limit") limit: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const trimmedQuery = query?.trim() ?? "";
    if (!trimmedQuery) {
      throw new ApiRequestError(
        400,
        "bad_request",
        "q query parameter is required",
      );
    }

    const parsedLimit =
      typeof limit === "string" && limit.trim().length > 0 ? Number(limit) : 5;

    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      throw new ApiRequestError(
        400,
        "bad_request",
        "limit must be a positive number",
      );
    }

    return toApiSuccessEnvelope<KnowledgeSearchResponse>(
      this.knowledgeSearchService.search(trimmedQuery, parsedLimit),
      requestId,
    );
  }
}
