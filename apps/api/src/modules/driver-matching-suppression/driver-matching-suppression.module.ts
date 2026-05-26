import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverMatchingSuppressionController } from "./driver-matching-suppression.controller";
import { DriverMatchingSuppressionRepository } from "./driver-matching-suppression.repository";
import { DriverMatchingSuppressionService } from "./driver-matching-suppression.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [DriverMatchingSuppressionController],
  providers: [
    DriverMatchingSuppressionRepository,
    DriverMatchingSuppressionService,
  ],
  exports: [DriverMatchingSuppressionService],
})
export class DriverMatchingSuppressionModule {}
