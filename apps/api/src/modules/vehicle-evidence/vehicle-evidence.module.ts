import { Module } from "@nestjs/common";

import { VehicleEvidenceController } from "./vehicle-evidence.controller";
import { VehicleEvidenceService } from "./vehicle-evidence.service";

@Module({
  controllers: [VehicleEvidenceController],
  providers: [VehicleEvidenceService],
  exports: [VehicleEvidenceService],
})
export class VehicleEvidenceModule {}
