import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { DriverMatchingSuppressionController } from "./driver-matching-suppression.controller";
import { DriverMatchingSuppressionRepository } from "./driver-matching-suppression.repository";
import { DriverMatchingSuppressionService } from "./driver-matching-suppression.service";
import { IncidentController } from "./incident.controller";
import { IncidentRepository } from "./incident.repository";
import { IncidentService } from "./incident.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    forwardRef(() => ComplaintModule),
  ],
  controllers: [IncidentController, DriverMatchingSuppressionController],
  providers: [
    IncidentRepository,
    DriverMatchingSuppressionRepository,
    DriverMatchingSuppressionService,
    IncidentService,
  ],
  exports: [IncidentService, DriverMatchingSuppressionService],
})
export class IncidentModule {}
