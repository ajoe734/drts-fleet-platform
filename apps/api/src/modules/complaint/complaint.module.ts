import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import { ComplaintController } from "./complaint.controller";
import { ComplaintRepository } from "./complaint.repository";
import { ComplaintService } from "./complaint.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    forwardRef(() => IncidentModule),
  ],
  controllers: [ComplaintController],
  providers: [ComplaintRepository, ComplaintService],
  exports: [ComplaintService],
})
export class ComplaintModule {}
