import type { ActionIntent } from "@drts/contracts";

import type { BootstrapRequestIdentity } from "../../common/auth";
import type { AssistantToolDefinition } from "./assistant.instructions";

export const ASSISTANT_STREAM_EVENT_TYPES = [
  "token",
  "tool_call",
  "tool_result",
  "action_intent",
  "final",
  "error",
] as const;

export type AssistantStreamEventType =
  (typeof ASSISTANT_STREAM_EVENT_TYPES)[number];

export type AssistantMessageRole = "user" | "assistant" | "tool";

export interface UserAssistantSession {
  conversationId: string;
  realm: string;
  tenantId: string | null;
  createdBy: string | null;
  title: string | null;
  status: "active";
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface AssistantMessageRecord {
  messageId: string;
  conversationId: string;
  realm: string;
  tenantId: string | null;
  role: AssistantMessageRole;
  content: string;
  requestId: string | null;
  createdAt: string;
  toolCallId: string | null;
  toolName: string | null;
  actionIntent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateAssistantConversationCommand {
  title?: string | null;
}

export interface CreateAssistantMessageCommand {
  content: string;
}

export interface AssistantGatewayContext {
  conversation: UserAssistantSession;
  history: AssistantMessageRecord[];
  identity: BootstrapRequestIdentity;
  prompt: string;
  availableTools: AssistantToolDefinition[];
}

export type AssistantGatewayEvent =
  | {
      type: "token";
      delta: string;
    }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName: string;
      result: unknown;
    }
  | {
      type: "action_intent";
      intent: string | ActionIntent;
      label: string;
      confidence: number;
    }
  | {
      type: "final";
      content: string;
    };

export interface AssistantStreamEnvelope<T = unknown> {
  eventId: string;
  conversationId: string;
  messageId: string | null;
  type: AssistantStreamEventType;
  createdAt: string;
  data: T;
}

export interface AssistantEventSink {
  emit<T>(event: AssistantStreamEnvelope<T>): void;
}
