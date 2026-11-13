import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { IncidentModule } from "../incident/incident.module";
import { CallcenterAssistModule } from "../callcenter-assist/callcenter-assist.module";
import { VoiceBookingModule } from "../voice-booking/voice-booking.module";
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
    CallcenterAssistModule,
    forwardRef(() => VoiceBookingModule),
  ],
  controllers: [CallcenterController],
  providers: [CallcenterRepository, CallcenterService, SandboxWebhookAdapter],
  exports: [CallcenterService, CallcenterAssistModule],
})
export class CallcenterModule {}
