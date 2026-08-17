import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ShiftAttendanceController } from "./shift-attendance.controller";
import { ShiftAttendanceRepository } from "./shift-attendance.repository";
import { ShiftAttendanceService } from "./shift-attendance.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, RegulatoryRegistryModule],
  controllers: [ShiftAttendanceController],
  providers: [ShiftAttendanceRepository, ShiftAttendanceService],
  exports: [ShiftAttendanceService],
})
export class ShiftAttendanceModule {}
