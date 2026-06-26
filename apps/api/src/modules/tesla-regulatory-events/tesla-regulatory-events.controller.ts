import { Controller, Get, Headers, Param, Query } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TeslaRegulatoryEventsService } from "./tesla-regulatory-events.service";

@Controller("tesla")
export class TeslaRegulatoryEventsController {
  constructor(
    private readonly teslaRegulatoryEventsService: TeslaRegulatoryEventsService,
  ) {}

  @Get("vehicles/:vin/capabilities")
  async getVehicleCapabilities(
    @Param("vin") vin: string,
    @Query("refresh") refresh?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.teslaRegulatoryEventsService.getVehicleCapabilities(vin, {
        refresh: refresh === "true",
      }),
      requestId,
    );
  }
}
