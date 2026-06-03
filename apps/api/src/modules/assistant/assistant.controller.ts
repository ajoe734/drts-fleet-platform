import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type { ProposeActionToolInput } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ASSISTANT_PROPOSE_ACTION_TOOL } from "./assistant.instructions";
import { AssistantService } from "./assistant.service";

@Controller("assistant/tools")
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get("runtime-definition")
  getRuntimeDefinition(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.assistantService.getRuntimeDefinition(),
      requestId,
    );
  }

  @Post(":toolName")
  invokeTool(
    @Param("toolName") toolName: string,
    @Body() input: unknown,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.assistantService.invokeTool(toolName, input),
      requestId,
    );
  }

  @Post("propose-action")
  proposeAction(
    @Body() input: ProposeActionToolInput,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.assistantService.invokeTool(ASSISTANT_PROPOSE_ACTION_TOOL, input),
      requestId,
    );
  }
}
