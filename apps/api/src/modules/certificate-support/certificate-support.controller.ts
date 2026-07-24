import { Controller, Get, Headers, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { CertificateSupportService } from "./certificate-support.service";

@RequireRealms("platform")
@RequireScopes("foundation:read")
@Controller("platform-admin/multi-taxi/certificates")
export class CertificateSupportController {
  constructor(private readonly service: CertificateSupportService) {}

  @Get()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async list(
    @Query("q") search?: string,
    @Query("state") state?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.service.list({
      ...(search !== undefined ? { search } : {}),
      ...(state !== undefined ? { state } : {}),
    });
    return toApiSuccessEnvelope(
      {
        items,
        total: items.length,
        query: search?.trim() || null,
      },
      requestId,
    );
  }

  @Get(":certificateId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async get(
    @Param("certificateId") certificateId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.get(certificateId),
      requestId,
    );
  }
}
