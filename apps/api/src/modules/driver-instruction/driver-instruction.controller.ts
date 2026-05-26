import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  CreateDriverOpsInstructionCommand,
  IdentityContext,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import { DriverInstructionService } from "./driver-instruction.service";

@Controller("ops/driver-instructions")
export class OpsDriverInstructionController {
  constructor(private readonly service: DriverInstructionService) {}

  @Post()
  @RequireRealms("platform", "ops")
  async createInstruction(
    @Body() command: CreateDriverOpsInstructionCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.createInstruction(command, identity, requestId),
      requestId,
    );
  }
}

@Controller("driver/ops-instructions")
export class DriverInstructionController {
  constructor(private readonly service: DriverInstructionService) {}

  @Get()
  @RequireRealms("driver")
  listInstructions(
    @CurrentIdentity() identity: IdentityContext | null,
    @Query("taskId") taskId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.service.listInstructionsForDriver(identity, taskId),
      },
      requestId,
    );
  }

  @Post(":instructionId/acknowledge")
  @RequireRealms("driver")
  async acknowledgeInstruction(
    @Param("instructionId") instructionId: string,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.acknowledgeInstruction(
        instructionId,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
