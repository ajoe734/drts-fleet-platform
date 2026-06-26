import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { TeslaRegulatoryEventsController } from "./tesla-regulatory-events.controller";
import { TeslaRegulatoryEventsRepository } from "./tesla-regulatory-events.repository";
import { TeslaRegulatoryEventsService } from "./tesla-regulatory-events.service";

@Module({
  imports: [AuditNotificationModule],
  controllers: [TeslaRegulatoryEventsController],
  providers: [TeslaRegulatoryEventsRepository, TeslaRegulatoryEventsService],
  exports: [TeslaRegulatoryEventsService],
})
export class TeslaRegulatoryEventsModule {}
