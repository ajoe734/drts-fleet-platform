import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
} from "@nestjs/common";

import type { UpdateDriverSettingsCommand } from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { DriverSettingsService } from "./driver-settings.service";

@Controller("driver-settings")
export class DriverSettingsController {
  constructor(private readonly driverSettingsService: DriverSettingsService) {}

  @Get()
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("driver:read")
  listAll(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (identity?.realm === "driver") {
      const driverId = identity.actorId;
      const items = driverId
        ? [this.driverSettingsService.getSettings(driverId)]
        : [];
      return toApiSuccessEnvelope({ items }, requestId);
    }
    return toApiSuccessEnvelope(
      { items: this.driverSettingsService.listAll() },
      requestId,
    );
  }

  @Get(":driverId")
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("driver:read")
  getSettings(
    @Param("driverId") driverId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      identity?.realm === "driver" &&
      identity.actorId &&
      identity.actorId !== driverId
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SETTINGS_NOT_FOUND",
        "Driver settings not found.",
        { driverId },
      );
    }
    return toApiSuccessEnvelope(
      this.driverSettingsService.getSettings(driverId),
      requestId,
    );
  }

  @Patch(":driverId")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  updateSettings(
    @Param("driverId") driverId: string,
    @Body() command: UpdateDriverSettingsCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      identity?.realm === "driver" &&
      identity.actorId &&
      identity.actorId !== driverId
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SETTINGS_NOT_FOUND",
        "Driver settings not found.",
        { driverId },
      );
    }
    return toApiSuccessEnvelope(
      this.driverSettingsService.updateSettings(driverId, command, requestId),
      requestId,
    );
  }
}

