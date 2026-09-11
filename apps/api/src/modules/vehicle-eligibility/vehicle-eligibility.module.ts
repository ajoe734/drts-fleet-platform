import { Module } from "@nestjs/common";

import { DriverAcademyModule } from "../driver-academy/driver-academy.module";
import { DriverLeaveModule } from "../driver-leave/driver-leave.module";
import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { EligibilityContextResolver } from "./eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "./runtime-eligibility-evaluator.service";
import { VehicleEligibilityController } from "./vehicle-eligibility.controller";
import { VehicleEligibilityRepository } from "./vehicle-eligibility.repository";
import { VehicleEligibilityService } from "./vehicle-eligibility.service";

@Module({
  imports: [
    DatabaseModule,
    DriverAcademyModule,
    DriverLeaveModule,
    AuditNotificationModule,
    RegulatoryRegistryModule,
    ServiceProductModule,
  ],
  controllers: [VehicleEligibilityController],
  providers: [
    VehicleEligibilityRepository,
    VehicleEligibilityService,
    EligibilityContextResolver,
    RuntimeEligibilityEvaluator,
  ],
  exports: [
    VehicleEligibilityService,
    EligibilityContextResolver,
    RuntimeEligibilityEvaluator,
  ],
})
export class VehicleEligibilityModule {}
