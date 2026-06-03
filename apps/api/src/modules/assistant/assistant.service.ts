import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AssistantLlmGatewayService } from "./assistant-llm-gateway.service";
import {
  AssistantRepository,
  type PersistAssistantChanges,
} from "./assistant.repository";
import { AssistantReadToolRegistry } from "./tools/assistant-read-tool.registry";
import type {
  AssistantEventSink,
  AssistantGatewayEvent,
  AssistantMessageRecord,
  AssistantStreamEnvelope,
  CreateAssistantConversationCommand,
  CreateAssistantMessageCommand,
  UserAssistantSession,
} from "./assistant.types";

const MAX_MESSAGES_PER_CONVERSATION = 24;

@Injectable()
export class AssistantService implements OnModuleInit {
  private conversations: UserAssistantSession[] = [];

  private messages: AssistantMessageRecord[] = [];

  constructor(
    private readonly assistantLlmGatewayService: AssistantLlmGatewayService,
    @Optional()
    private readonly assistantReadToolRegistry?: AssistantReadToolRegistry,
    @Optional() private readonly assistantRepository?: AssistantRepository,
  ) {}

  async onModuleInit() {
    if (!this.assistantRepository) {
      return;
    }

    try {
      const state = await this.assistantRepository.loadState();
      this.conversations = state.conversations.map((conversation) => ({
        ...conversation,
      }));
      this.messages = state.messages.map((message) =>
        this.cloneMessage(message),
      );
    } catch (error) {
      this.assistantRepository.reportPersistenceFailure(error, "module init");
    }
  }

  createConversation(
    command: CreateAssistantConversationCommand,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedIdentity = this.requireIdentity(identity);
    const now = new Date().toISOString();
    const conversation: UserAssistantSession = {
      conversationId: `conv_${randomUUID()}`,
      realm: scopedIdentity.realm,
      tenantId: scopedIdentity.tenantId,
      createdBy: scopedIdentity.actorId,
      title: this.normalizeOptionalText(command.title),
      status: "active",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    };

    this.conversations.unshift(conversation);
    this.persistChanges(
      {
        conversations: [{ ...conversation }],
      },
      "create conversation",
    );

    return {
      conversation: { ...conversation },
    };
  }

  async streamConversationMessage(
    conversationId: string,
    command: CreateAssistantMessageCommand,
    identity: BootstrapRequestIdentity | null,
    sink: AssistantEventSink,
  ) {
    const scopedIdentity = this.requireIdentity(identity);
    const conversation = this.requireConversation(
      conversationId,
      scopedIdentity,
    );
    const prompt = command.content?.trim();

    if (!prompt) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_MESSAGE_REQUIRED",
        "Assistant messages must include non-empty content.",
      );
    }

    const now = new Date().toISOString();
    const userMessage: AssistantMessageRecord = {
      messageId: `msg_${randomUUID()}`,
      conversationId: conversation.conversationId,
      realm: conversation.realm,
      tenantId: conversation.tenantId,
      role: "user",
      content: prompt,
      requestId: scopedIdentity.requestId,
      createdAt: now,
      toolCallId: null,
      toolName: null,
      actionIntent: null,
      metadata: null,
    };

    this.messages.push(userMessage);
    const persistedMessages: AssistantMessageRecord[] = [
      this.cloneMessage(userMessage),
    ];
    let persistedAssistantMessage: AssistantMessageRecord | null = null;
    const fullHistory = this.listConversationMessages(
      conversation.conversationId,
    );

    for await (const gatewayEvent of this.assistantLlmGatewayService.streamReply(
      {
        conversation: { ...conversation },
        history: fullHistory.map((message) => this.cloneMessage(message)),
        identity: scopedIdentity,
        prompt,
        availableTools: this.assistantReadToolRegistry?.listDefinitions() ?? [],
      },
    )) {
      const envelope = this.materializeGatewayEvent(
        conversation.conversationId,
        gatewayEvent,
      );

      if (gatewayEvent.type === "tool_result") {
        const toolMessage = this.buildToolMessage(conversation, gatewayEvent);
        this.messages.push(toolMessage);
        persistedMessages.push(this.cloneMessage(toolMessage));
        envelope.messageId = toolMessage.messageId;
      }

      if (gatewayEvent.type === "final") {
        persistedAssistantMessage = this.buildAssistantMessage(
          conversation,
          gatewayEvent.content,
          scopedIdentity.requestId,
        );
        this.messages.push(persistedAssistantMessage);
        persistedMessages.push(this.cloneMessage(persistedAssistantMessage));
        envelope.messageId = persistedAssistantMessage.messageId;
      }

      sink.emit(envelope);
    }

    const deletedMessageIds = this.applyRetention(conversation.conversationId);
    const retainedCount = this.listConversationMessages(
      conversation.conversationId,
    ).length;
    conversation.messageCount = retainedCount;
    conversation.updatedAt = new Date().toISOString();
    conversation.lastMessageAt =
      persistedAssistantMessage?.createdAt ?? userMessage.createdAt;

    this.persistChanges(
      {
        conversations: [{ ...conversation }],
        messages: persistedMessages,
        deletedMessageIds,
      },
      "stream conversation message",
    );

    return {
      conversation: { ...conversation },
      userMessage: this.cloneMessage(userMessage),
      assistantMessage: persistedAssistantMessage
        ? this.cloneMessage(persistedAssistantMessage)
        : null,
    };
  }

  getConversationMessages(
    conversationId: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedIdentity = this.requireIdentity(identity);
    this.requireConversation(conversationId, scopedIdentity);

    return this.listConversationMessages(conversationId).map((message) =>
      this.cloneMessage(message),
    );
  }

  private buildToolMessage(
    conversation: UserAssistantSession,
    event: Extract<AssistantGatewayEvent, { type: "tool_result" }>,
  ): AssistantMessageRecord {
    return {
      messageId: `msg_${randomUUID()}`,
      conversationId: conversation.conversationId,
      realm: conversation.realm,
      tenantId: conversation.tenantId,
      role: "tool",
      content: JSON.stringify(event.result),
      requestId: null,
      createdAt: new Date().toISOString(),
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      actionIntent: null,
      metadata: {
        result: event.result,
      },
    };
  }

  private buildAssistantMessage(
    conversation: UserAssistantSession,
    content: string,
    requestId: string | null,
  ): AssistantMessageRecord {
    return {
      messageId: `msg_${randomUUID()}`,
      conversationId: conversation.conversationId,
      realm: conversation.realm,
      tenantId: conversation.tenantId,
      role: "assistant",
      content,
      requestId,
      createdAt: new Date().toISOString(),
      toolCallId: null,
      toolName: null,
      actionIntent: null,
      metadata: null,
    };
  }

  private materializeGatewayEvent(
    conversationId: string,
    gatewayEvent: AssistantGatewayEvent,
  ): AssistantStreamEnvelope<unknown> {
    const base = {
      eventId: `evt_${randomUUID()}`,
      conversationId,
      messageId: null,
      createdAt: new Date().toISOString(),
    };

    switch (gatewayEvent.type) {
      case "token":
        return {
          ...base,
          type: "token",
          data: {
            delta: gatewayEvent.delta,
          },
        };
      case "tool_call":
        return {
          ...base,
          type: "tool_call",
          data: {
            toolCallId: gatewayEvent.toolCallId,
            toolName: gatewayEvent.toolName,
            arguments: gatewayEvent.arguments,
          },
        };
      case "tool_result":
        return {
          ...base,
          type: "tool_result",
          data: {
            toolCallId: gatewayEvent.toolCallId,
            toolName: gatewayEvent.toolName,
            result: gatewayEvent.result,
          },
        };
      case "action_intent":
        return {
          ...base,
          type: "action_intent",
          data: {
            intent: gatewayEvent.intent,
            label: gatewayEvent.label,
            confidence: gatewayEvent.confidence,
          },
        };
      case "final":
        return {
          ...base,
          type: "final",
          data: {
            content: gatewayEvent.content,
          },
        };
    }
  }

  private requireIdentity(identity: BootstrapRequestIdentity | null) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTH_REQUIRED",
        "Assistant routes require authenticated identity context.",
      );
    }

    return identity;
  }

  private requireConversation(
    conversationId: string,
    identity: BootstrapRequestIdentity,
  ) {
    const conversation = this.conversations.find(
      (candidate) => candidate.conversationId === conversationId,
    );

    if (
      !conversation ||
      conversation.realm !== identity.realm ||
      conversation.tenantId !== identity.tenantId
    ) {
      throw new ApiRequestError(
        404,
        "ASSISTANT_CONVERSATION_NOT_FOUND",
        "Assistant conversation was not found within the caller scope.",
        {
          conversationId,
          realm: identity.realm,
          tenantId: identity.tenantId,
        },
      );
    }

    return conversation;
  }

  private listConversationMessages(conversationId: string) {
    return this.messages.filter(
      (message) => message.conversationId === conversationId,
    );
  }

  private applyRetention(conversationId: string) {
    const scopedMessages = this.listConversationMessages(conversationId);
    if (scopedMessages.length <= MAX_MESSAGES_PER_CONVERSATION) {
      return [] as string[];
    }

    const overflow = scopedMessages.length - MAX_MESSAGES_PER_CONVERSATION;
    const deletedMessageIds = scopedMessages
      .slice(0, overflow)
      .map((message) => message.messageId);

    this.messages = this.messages.filter(
      (message) => !deletedMessageIds.includes(message.messageId),
    );

    return deletedMessageIds;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private cloneMessage(
    message: AssistantMessageRecord,
  ): AssistantMessageRecord {
    return {
      ...message,
      metadata: message.metadata ? { ...message.metadata } : null,
    };
  }

  private persistChanges(changes: PersistAssistantChanges, context: string) {
    if (!this.assistantRepository) {
      return;
    }

    void this.assistantRepository.persistChanges(changes).catch((error) => {
      this.assistantRepository!.reportPersistenceFailure(error, context);
    });
  }
}
