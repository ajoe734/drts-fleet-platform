import { Module } from "@nestjs/common";

import { VehicleEvidenceService } from "./vehicle-evidence.service";

@Module({
  providers: [VehicleEvidenceService],
  exports: [VehicleEvidenceService],
})
export class VehicleEvidenceModule {}
