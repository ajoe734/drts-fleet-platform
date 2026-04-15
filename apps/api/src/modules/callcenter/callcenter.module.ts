import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterController } from "./callcenter.controller";
import { CallcenterRepository } from "./callcenter.repository";
import { CallcenterService } from "./callcenter.service";
import { ComplaintModule } from "../complaint/complaint.module";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, ComplaintModule],
  controllers: [CallcenterController],
  providers: [CallcenterRepository, CallcenterService],
  exports: [CallcenterService],
})
export class CallcenterModule {}
