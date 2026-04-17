import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileController } from "./driver-profile.controller";
import { DriverProfileRepository } from "./driver-profile.repository";
import { DriverProfileService } from "./driver-profile.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [DriverProfileController],
  providers: [DriverProfileRepository, DriverProfileService],
  exports: [DriverProfileService],
})
export class DriverProfileModule {}
