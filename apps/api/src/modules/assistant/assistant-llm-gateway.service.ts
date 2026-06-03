import { Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { AssistantReadToolRegistry } from "./tools/assistant-read-tool.registry";
import type { AssistantReadToolName } from "./tools/assistant-read-tool.types";
import type {
  AssistantGatewayContext,
  AssistantGatewayEvent,
} from "./assistant.types";

function splitIntoChunks(content: string) {
  const chunks = content.match(/.{1,24}/g);
  return chunks && chunks.length > 0 ? chunks : [content];
}

function extractOrderId(prompt: string) {
  return prompt.match(/\border-[a-z0-9-]+\b/i)?.[0] ?? null;
}

function extractComplaintCaseNo(prompt: string) {
  return prompt.match(/\bCMP-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase() ?? null;
}

@Injectable()
export class AssistantLlmGatewayService {
  constructor(
    @Optional()
    private readonly assistantReadToolRegistry?: AssistantReadToolRegistry,
  ) {}

  async *streamReply(
    context: AssistantGatewayContext,
  ): AsyncGenerator<AssistantGatewayEvent> {
    const normalizedPrompt = context.prompt.trim();
    const lowerPrompt = normalizedPrompt.toLowerCase();
    const toolSelection = this.selectTool(context);

    if (toolSelection && this.assistantReadToolRegistry) {
      const toolCallId = `tool_call_${randomUUID()}`;
      const result = this.assistantReadToolRegistry.execute({
        toolName: toolSelection.toolName,
        input: toolSelection.input,
        identity: context.identity,
      });
      yield {
        type: "tool_call",
        toolCallId,
        toolName: toolSelection.toolName,
        arguments: toolSelection.input,
      };
      yield {
        type: "tool_result",
        toolCallId,
        toolName: result.toolName,
        result: result.output,
      };

      if (toolSelection.toolName === "list_dispatch_jobs") {
        yield {
          type: "action_intent",
          intent: "open_dispatch_console",
          label: "Open dispatch console",
          confidence: 0.93,
        };
      }
    }

    const reply = toolSelection
      ? `已依目前 caller scope 執行 ${toolSelection.toolName}，結果已回寫到本次對話。若需要其他資料可繼續提出。`
      : `已收到你的請求：${normalizedPrompt}。目前依 conversation realm/tenant 範圍保留上下文，若需要進一步操作可繼續提出。`;
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

  private selectTool(context: AssistantGatewayContext): {
    toolName: AssistantReadToolName;
    input: Record<string, unknown>;
  } | null {
    const prompt = context.prompt.trim();
    const lowerPrompt = prompt.toLowerCase();
    const availableTools = new Set(
      context.availableTools.map((tool) => tool.name),
    );

    if (
      availableTools.has("get_complaint_export_view") &&
      (lowerPrompt.includes("export") ||
        lowerPrompt.includes("audit") ||
        prompt.includes("匯出")) &&
      extractComplaintCaseNo(prompt)
    ) {
      return {
        toolName: "get_complaint_export_view",
        input: {
          caseNo: extractComplaintCaseNo(prompt)!,
        },
      };
    }

    if (
      availableTools.has("get_complaint_timeline") &&
      (lowerPrompt.includes("timeline") ||
        lowerPrompt.includes("history") ||
        prompt.includes("時間軸")) &&
      extractComplaintCaseNo(prompt)
    ) {
      return {
        toolName: "get_complaint_timeline",
        input: {
          caseNo: extractComplaintCaseNo(prompt)!,
        },
      };
    }

    if (availableTools.has("get_complaint_case") && extractComplaintCaseNo(prompt)) {
      return {
        toolName: "get_complaint_case",
        input: {
          caseNo: extractComplaintCaseNo(prompt)!,
        },
      };
    }

    if (availableTools.has("get_order") && extractOrderId(prompt)) {
      return {
        toolName: "get_order",
        input: {
          orderId: extractOrderId(prompt)!,
        },
      };
    }

    if (
      availableTools.has("list_dispatch_jobs") &&
      (lowerPrompt.includes("dispatch") ||
        prompt.includes("派遣") ||
        lowerPrompt.includes("booking"))
    ) {
      return {
        toolName: "list_dispatch_jobs",
        input: {},
      };
    }

    return null;
  }
}
