import { Body, Controller, Headers, Post } from "@nestjs/common";

import type { ProposeActionToolInput } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { AssistantService } from "./assistant.service";

@Controller("assistant/tools")
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("propose-action")
  proposeAction(
    @Body() input: ProposeActionToolInput,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.assistantService.proposeAction(input),
      requestId,
    );
  }
}
