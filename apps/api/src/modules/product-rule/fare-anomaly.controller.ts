import { Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
  buildUiReadModelResource,
} from "../../common/ui-read-model";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { FareAnomalyService } from "./fare-anomaly.service";

@RequireRealms("platform")
@Controller("product-rule/fare-anomalies")
export class FareAnomalyController {
  constructor(private readonly fareAnomalyService: FareAnomalyService) {}

  @Get()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  @RequireScopes("foundation:read")
  list(
    @Query("reason") reason?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.fareAnomalyService.list(reason);
    return toApiSuccessEnvelope(
      buildUiReadModelList(items, {
        staleAfterMs: 30_000,
        emptyState: buildEmptyStateEnvelope("no_data", "fareAnomalies.empty"),
      }),
      requestId,
    );
  }

  @Get(":quoteSnapshotId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  @RequireScopes("foundation:read")
  get(
    @Param("quoteSnapshotId") quoteSnapshotId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelResource(this.fareAnomalyService.get(quoteSnapshotId), {
        staleAfterMs: 30_000,
      }),
      requestId,
    );
  }

  @Post(":quoteSnapshotId/actions/retry-quote")
  @RequireScopes("foundation:write")
  async retryQuote(
    @Param("quoteSnapshotId") quoteSnapshotId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity?.actorId) {
      throw new ApiRequestError(
        401,
        "AUTH_REQUIRED",
        "Platform identity is required for fare quote recovery.",
      );
    }

    return toApiSuccessEnvelope(
      await this.fareAnomalyService.retryQuote(quoteSnapshotId, {
        actorId: identity.actorId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(requestId ? { requestId } : {}),
      }),
      requestId,
    );
  }
}
