import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  CreateMaintenanceLogCommand,
  UpdateMaintenanceLogCommand,
} from "./maintenance.types";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { MaintenanceService } from "./maintenance.service";

@Controller("maintenance")
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  createMaintenanceLog(
    @Body() command: CreateMaintenanceLogCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.createMaintenanceLog(command, requestId),
      requestId,
    );
  }

  @Get()
  listMaintenanceLogs(
    @Query("vehicleId") vehicleId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.maintenanceService.listMaintenanceLogs(vehicleId) },
      requestId,
    );
  }

  @Get(":logId")
  getMaintenanceLog(
    @Param("logId") logId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.getMaintenanceLog(logId),
      requestId,
    );
  }

  @Post(":logId/update")
  updateMaintenanceLog(
    @Param("logId") logId: string,
    @Body() command: UpdateMaintenanceLogCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.updateMaintenanceLog(logId, command, requestId),
      requestId,
    );
  }
}
