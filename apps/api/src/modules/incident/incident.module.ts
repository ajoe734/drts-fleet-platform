import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { IncidentController } from "./incident.controller";
import { IncidentRepository } from "./incident.repository";
import { IncidentService } from "./incident.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    forwardRef(() => ComplaintModule),
  ],
  controllers: [IncidentController],
  providers: [IncidentRepository, IncidentService],
  exports: [IncidentService],
})
export class IncidentModule {}
