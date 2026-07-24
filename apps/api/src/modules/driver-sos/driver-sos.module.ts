import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import {
  DriverSosController,
  OpsDriverSosController,
} from "./driver-sos.controller";
import { DriverSosRepository } from "./driver-sos.repository";
import { DriverSosService } from "./driver-sos.service";
import { DriverSosVerificationRepository } from "./driver-sos-verification.repository";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, IncidentModule],
  controllers: [DriverSosController, OpsDriverSosController],
  providers: [
    DriverSosRepository,
    DriverSosVerificationRepository,
    DriverSosService,
  ],
  exports: [DriverSosService],
})
export class DriverSosModule {}
