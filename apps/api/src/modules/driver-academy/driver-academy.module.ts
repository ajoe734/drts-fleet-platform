import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import {
  DriverAcademyController,
  FleetPartnerTrainingController,
} from "./academy.controller";
import { AcademyRepository } from "./academy.repository";
import { AcademyService } from "./academy.service";

/**
 * Not registered in the root app module by this task. Root wiring
 * (feature-contracts.md read_dependencies / schema-allocation.json
 * downstream_tasks) is owned by SR-WIRE-001.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DriverAcademyController, FleetPartnerTrainingController],
  providers: [AcademyRepository, AcademyService],
  exports: [AcademyService],
})
export class DriverAcademyModule {}
