import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TeslaIntegrationController } from "./tesla-integration.controller";
import { TeslaIntegrationRepository } from "./tesla-integration.repository";
import { TeslaIntegrationService } from "./tesla-integration.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, RegulatoryRegistryModule],
  controllers: [TeslaIntegrationController],
  providers: [TeslaIntegrationRepository, TeslaIntegrationService],
  exports: [TeslaIntegrationService],
})
export class TeslaIntegrationModule {}
