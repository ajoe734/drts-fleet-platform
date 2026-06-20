import { Controller, Get, Headers, Param } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Controller("ops/drivers")
export class OpsDriverTrackingController {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  @Get(":driverId/tracking-status")
  async getDriverTrackingStatus(
    @Param("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.getDriverTrackingStatus(driverId),
      requestId,
    );
  }
}
