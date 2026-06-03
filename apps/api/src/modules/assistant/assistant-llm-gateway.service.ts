import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  AssistantGatewayContext,
  AssistantGatewayEvent,
} from "./assistant.types";

function splitIntoChunks(content: string) {
  const chunks = content.match(/.{1,24}/g);
  return chunks && chunks.length > 0 ? chunks : [content];
}

@Injectable()
export class AssistantLlmGatewayService {
  async *streamReply(
    context: AssistantGatewayContext,
  ): AsyncGenerator<AssistantGatewayEvent> {
    const normalizedPrompt = context.prompt.trim();
    const lowerPrompt = normalizedPrompt.toLowerCase();

    if (
      lowerPrompt.includes("dispatch") ||
      normalizedPrompt.includes("派遣") ||
      lowerPrompt.includes("booking")
    ) {
      const toolCallId = `tool_call_${randomUUID()}`;
      yield {
        type: "tool_call",
        toolCallId,
        toolName: "ops.dispatch.lookup",
        arguments: {
          realm: context.conversation.realm,
          tenantId: context.conversation.tenantId,
        },
      };
      yield {
        type: "tool_result",
        toolCallId,
        toolName: "ops.dispatch.lookup",
        result: {
          status: "ok",
          queueDepth: 3,
          recommendedAction: "review_dispatch_console",
        },
      };
      yield {
        type: "action_intent",
        intent: "open_dispatch_console",
        label: "Open dispatch console",
        confidence: 0.93,
      };
    }

    const reply = `已收到你的請求：${normalizedPrompt}。目前依 conversation realm/tenant 範圍保留上下文，若需要進一步操作可繼續提出。`;
    for (const chunk of splitIntoChunks(reply)) {
      yield {
        type: "token",
        delta: chunk,
      };
    }

    yield {
      type: "final",
      content: reply,
    };
  }
}
