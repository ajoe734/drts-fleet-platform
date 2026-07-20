import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import { DriverSosController } from "./driver-sos.controller";
import { DriverSosRepository } from "./driver-sos.repository";
import { DriverSosService } from "./driver-sos.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, IncidentModule],
  controllers: [DriverSosController],
  providers: [DriverSosRepository, DriverSosService],
  exports: [DriverSosService],
})
export class DriverSosModule {}
