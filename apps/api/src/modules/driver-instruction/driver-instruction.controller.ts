import { Controller, Post, Get, Body, Param, UseGuards } from "@nestjs/common";
import { DriverInstructionService } from "./driver-instruction.service";
import { BootstrapAuthGuard } from "../../common/auth";

@Controller("driver-instructions")
export class DriverInstructionController {
  constructor(private readonly service: DriverInstructionService) {}

  @Post("ops/create")
  @UseGuards(BootstrapAuthGuard) // Assuming ops need authentication
  async createInstruction(
    @Body() body: { driverId: string; instructionText: string; expiresAt: string }
  ) {
    return this.service.createInstruction(body.driverId, body.instructionText, body.expiresAt);
  }

  @Get("driver/:driverId")
  @UseGuards(BootstrapAuthGuard) // Assuming driver needs authentication
  async getInstructions(@Param("driverId") driverId: string) {
    return this.service.getInstructionsForDriver(driverId);
  }

  @Post("driver/:driverId/acknowledge/:id")
  @UseGuards(BootstrapAuthGuard)
  async acknowledge(@Param("driverId") driverId: string, @Param("id") id: string) {
    return this.service.acknowledgeInstruction(id, driverId);
  }
}
