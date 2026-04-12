import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";

import { RegulatoryRegistryController } from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Module({
  imports: [DatabaseModule],
  controllers: [RegulatoryRegistryController],
  providers: [RegulatoryRegistryService, RegulatoryRegistryRepository],
  exports: [RegulatoryRegistryService],
})
export class RegulatoryRegistryModule {}
