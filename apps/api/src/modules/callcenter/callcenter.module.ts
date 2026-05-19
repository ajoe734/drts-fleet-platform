import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { IncidentModule } from "../incident/incident.module";
import { CallcenterController } from "./callcenter.controller";
import { CallcenterRepository } from "./callcenter.repository";
import { SandboxWebhookAdapter } from "./sandbox-webhook.adapter";
import { CallcenterService } from "./callcenter.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    ComplaintModule,
    IncidentModule,
  ],
  controllers: [CallcenterController],
  providers: [CallcenterRepository, CallcenterService, SandboxWebhookAdapter],
  exports: [CallcenterService],
})
export class CallcenterModule {}
