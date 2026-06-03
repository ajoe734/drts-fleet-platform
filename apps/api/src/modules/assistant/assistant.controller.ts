import { Body, Controller, Headers, Param, Post, Res } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AssistantService } from "./assistant.service";
import type {
  AssistantStreamEnvelope,
  CreateAssistantConversationCommand,
  CreateAssistantMessageCommand,
} from "./assistant.types";

type SseResponseLike = {
  status: (code: number) => SseResponseLike;
  setHeader: (name: string, value: string) => void;
  flushHeaders?: () => void;
  write: (chunk: string) => void;
  end: (chunk?: string) => void;
  headersSent?: boolean;
};

function formatSseEvent<T>(event: AssistantStreamEnvelope<T>) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("conversations")
  @RequireRealms("system", "platform", "ops", "tenant")
  @RequireScopes("assistant:write")
  createConversation(
    @Body() command: CreateAssistantConversationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.assistantService.createConversation(command, identity),
      requestId,
    );
  }

  @Post("conversations/:conversationId/messages")
  @RequireRealms("system", "platform", "ops", "tenant")
  @RequireScopes("assistant:write")
  async createMessage(
    @Param("conversationId") conversationId: string,
    @Body() command: CreateAssistantMessageCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Res() response: SseResponseLike,
  ) {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    try {
      await this.assistantService.streamConversationMessage(
        conversationId,
        command,
        identity,
        {
          emit: (event) => {
            response.write(formatSseEvent(event));
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown assistant error";
      response.write(
        formatSseEvent({
          eventId: "evt_error",
          conversationId,
          messageId: null,
          type: "error",
          createdAt: new Date().toISOString(),
          data: {
            message,
          },
        }),
      );
    } finally {
      response.end();
    }
  }
}
