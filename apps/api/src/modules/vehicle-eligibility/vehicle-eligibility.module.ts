import { Module } from "@nestjs/common";

import { VehicleEligibilityController } from "./vehicle-eligibility.controller";

@Module({
  controllers: [VehicleEligibilityController],
})
export class VehicleEligibilityModule {}
