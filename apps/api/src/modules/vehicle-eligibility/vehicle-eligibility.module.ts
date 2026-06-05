import { Module } from "@nestjs/common";

import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { VehicleEligibilityController } from "./vehicle-eligibility.controller";
import { VehicleEligibilityService } from "./vehicle-eligibility.service";

@Module({
  imports: [RegulatoryRegistryModule],
  controllers: [VehicleEligibilityController],
  providers: [VehicleEligibilityService],
  exports: [VehicleEligibilityService],
})
export class VehicleEligibilityModule {}
