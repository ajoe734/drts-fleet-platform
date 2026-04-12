import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterController } from "./callcenter.controller";
import { CallcenterRepository } from "./callcenter.repository";
import { CallcenterService } from "./callcenter.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [CallcenterController],
  providers: [CallcenterRepository, CallcenterService],
  exports: [CallcenterService],
})
export class CallcenterModule {}
