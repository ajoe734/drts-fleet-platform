import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import {
  DriverInstructionController,
  OpsDriverInstructionController,
} from "./driver-instruction.controller";
import { DriverInstructionRepository } from "./driver-instruction.repository";
import { DriverInstructionService } from "./driver-instruction.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [OpsDriverInstructionController, DriverInstructionController],
  providers: [DriverInstructionRepository, DriverInstructionService],
  exports: [DriverInstructionService],
})
export class DriverInstructionModule {}
