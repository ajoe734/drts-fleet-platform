import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
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
      this.maintenanceService.listMaintenanceView(vehicleId),
      requestId,
    );
  }

  @Get(":maintenanceId")
  getMaintenanceLog(
    @Param("maintenanceId") maintenanceId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.getMaintenanceLog(maintenanceId),
      requestId,
    );
  }

  @Patch(":maintenanceId")
  updateMaintenanceLog(
    @Param("maintenanceId") maintenanceId: string,
    @Body() command: UpdateMaintenanceLogCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.updateMaintenanceLog(
        maintenanceId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post(":maintenanceId/update")
  updateMaintenanceLogAlias(
    @Param("maintenanceId") maintenanceId: string,
    @Body() command: UpdateMaintenanceLogCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.updateMaintenanceLog(maintenanceId, command, requestId);
  }

  @Delete(":maintenanceId")
  deleteMaintenanceLog(
    @Param("maintenanceId") maintenanceId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.deleteMaintenanceLog(maintenanceId, requestId),
      requestId,
    );
  }
}
