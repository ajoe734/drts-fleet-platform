import { Body, Controller, Get, Headers, Param, Patch } from "@nestjs/common";

import type { UpdateDriverSettingsCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { DriverSettingsService } from "./driver-settings.service";

@Controller("driver-settings")
export class DriverSettingsController {
  constructor(private readonly driverSettingsService: DriverSettingsService) {}

  @Get()
  listAll(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.driverSettingsService.listAll() },
      requestId,
    );
  }

  @Get(":driverId")
  getSettings(
    @Param("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.driverSettingsService.getSettings(driverId),
      requestId,
    );
  }

  @Patch(":driverId")
  updateSettings(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverSettingsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.driverSettingsService.updateSettings(driverId, command, requestId),
      requestId,
    );
  }
}
