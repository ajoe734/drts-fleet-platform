import { Module } from "@nestjs/common";
import { DriverInstructionController } from "./driver-instruction.controller";
import { DriverInstructionService } from "./driver-instruction.service";
import { DriverInstructionRepository } from "./driver-instruction.repository";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [CommonModule],
  controllers: [DriverInstructionController],
  providers: [DriverInstructionService, DriverInstructionRepository],
  exports: [DriverInstructionService],
})
export class DriverInstructionModule {}
