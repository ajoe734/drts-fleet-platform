import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ForwarderController } from "./forwarder.controller";
import { ForwarderRepository } from "./forwarder.repository";
import { ForwarderService } from "./forwarder.service";

@Module({
  imports: [DatabaseModule, RegulatoryRegistryModule, AuditNotificationModule],
  controllers: [ForwarderController],
  providers: [ForwarderService, ForwarderRepository],
  exports: [ForwarderService],
})
export class ForwarderModule {}
