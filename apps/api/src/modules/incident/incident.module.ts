import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsModule } from "../../common/ops-dispatch-events.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { IncidentController } from "./incident.controller";
import { IncidentRepository } from "./incident.repository";
import { IncidentService } from "./incident.service";

@Module({
  imports: [
    DatabaseModule,
    OpsDispatchEventsModule,
    AuditNotificationModule,
    forwardRef(() => ComplaintModule),
  ],
  controllers: [IncidentController],
  providers: [IncidentRepository, IncidentService],
  exports: [IncidentService],
})
export class IncidentModule {}
