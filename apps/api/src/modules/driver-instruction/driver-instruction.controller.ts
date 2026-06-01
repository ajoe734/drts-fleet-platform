import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { CreateDriverOpsInstructionCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { DriverInstructionService } from "./driver-instruction.service";

@Controller("driver-instructions")
export class DriverInstructionController {
  constructor(
    private readonly driverInstructionService: DriverInstructionService,
  ) {}

  // --- Ops side -----------------------------------------------------------

  @Get()
  listAll(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.driverInstructionService.listAll() },
      requestId,
    );
  }

  @Post()
  create(
    @Body() command: CreateDriverOpsInstructionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.driverInstructionService.createInstruction(command, requestId),
      requestId,
    );
  }

  // --- Driver side --------------------------------------------------------

  @Get("driver/:driverId")
  listForDriver(
    @Param("driverId") driverId: string,
    @Query("includeAcknowledged") includeAcknowledged?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.driverInstructionService.listForDriver(driverId, {
          includeAcknowledged: includeAcknowledged !== "false",
        }),
      },
      requestId,
    );
  }

  @Post(":instructionId/ack")
  acknowledge(
    @Param("instructionId") instructionId: string,
    @Body() body: { driverId?: string } | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.driverInstructionService.acknowledge(
        instructionId,
        body?.driverId,
        requestId,
      ),
      requestId,
    );
  }
}
