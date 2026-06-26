import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { VehicleEvidenceController } from "./vehicle-evidence.controller";
import { VehicleEvidenceService } from "./vehicle-evidence.service";

@Module({
  imports: [AuditNotificationModule],
  controllers: [VehicleEvidenceController],
  providers: [VehicleEvidenceService],
  exports: [VehicleEvidenceService],
})
export class VehicleEvidenceModule {}
