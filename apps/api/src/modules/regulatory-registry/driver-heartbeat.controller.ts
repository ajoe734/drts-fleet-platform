import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";

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

  @Get("tracking-status")
  async getTrackingStatus(
    @Query("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.getDriverTrackingStatus(driverId),
      requestId,
    );
  }
}
