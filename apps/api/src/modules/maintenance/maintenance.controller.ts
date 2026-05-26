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

import { toActionReceiptEnvelope } from "../../common/action-receipt";
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
    const result = this.maintenanceService.createMaintenanceLog(
      command,
      requestId,
      { captureAudit: true },
    );
    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        message: "Maintenance log created.",
      },
      requestId,
    );
  }

  @Get()
  listMaintenanceLogs(
    @Query("vehicleId") vehicleId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.maintenanceService.listMaintenanceLogs(vehicleId),
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
    const result = this.maintenanceService.updateMaintenanceLog(
      maintenanceId,
      command,
      requestId,
      { captureAudit: true },
    );
    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        message: "Maintenance log updated.",
      },
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
    const result = this.maintenanceService.deleteMaintenanceLog(
      maintenanceId,
      requestId,
      { captureAudit: true },
    );
    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        message: "Maintenance log deleted.",
      },
      requestId,
    );
  }
}
