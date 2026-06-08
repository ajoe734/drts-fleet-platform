import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { VehicleEligibilityController } from "./vehicle-eligibility.controller";
import { VehicleEligibilityRepository } from "./vehicle-eligibility.repository";
import { VehicleEligibilityService } from "./vehicle-eligibility.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    RegulatoryRegistryModule,
    ServiceProductModule,
  ],
  controllers: [VehicleEligibilityController],
  providers: [VehicleEligibilityRepository, VehicleEligibilityService],
  exports: [VehicleEligibilityService],
})
export class VehicleEligibilityModule {}
