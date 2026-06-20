import { Body, Controller, Headers, Post } from "@nestjs/common";

import type { DriverLocationHeartbeatBatchRequest } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Controller("driver")
export class DriverHeartbeatController {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  @Post("location-heartbeats/batch")
  async recordHeartbeatBatch(
    @Body() request: DriverLocationHeartbeatBatchRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.recordDriverLocationBatch(request),
      requestId,
    );
  }
}
