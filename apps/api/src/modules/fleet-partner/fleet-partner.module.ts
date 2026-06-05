import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { FleetPartnerController } from "./fleet-partner.controller";
import { FleetPartnerRepository } from "./fleet-partner.repository";
import { FleetPartnerService } from "./fleet-partner.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, DriverProfileModule],
  controllers: [FleetPartnerController],
  providers: [FleetPartnerRepository, FleetPartnerService],
  exports: [FleetPartnerService],
})
export class FleetPartnerModule {}
