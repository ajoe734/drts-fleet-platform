import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceRepository } from "./maintenance.repository";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceRepository, MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
