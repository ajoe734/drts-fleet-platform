import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverSettingsController } from "./driver-settings.controller";
import { DriverSettingsRepository } from "./driver-settings.repository";
import { DriverSettingsService } from "./driver-settings.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [DriverSettingsController],
  providers: [DriverSettingsRepository, DriverSettingsService],
  exports: [DriverSettingsService],
})
export class DriverSettingsModule {}
