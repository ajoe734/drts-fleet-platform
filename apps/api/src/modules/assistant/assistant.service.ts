import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActionIntent,
  AuditLogRecord,
  ProposeActionToolInput,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { AssistantGuardrailService } from "./assistant.guardrail.service";
import {
  ASSISTANT_PROPOSE_ACTION_TOOL,
  buildActionIntent,
  buildAssistantRuntimeDefinition,
  type AssistantRuntimeDefinition,
} from "./assistant.instructions";
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
    private readonly assistantGuardrailService: AssistantGuardrailService,
    private readonly assistantLlmGatewayService: AssistantLlmGatewayService,
    @Optional()
    private readonly assistantReadToolRegistry?: AssistantReadToolRegistry,
    @Optional() private readonly assistantRepository?: AssistantRepository,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
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
    this.assistantGuardrailService.enforceRateLimit(
      scopedIdentity,
      "conversation_create",
    );
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

  getRuntimeDefinition(
    identity: BootstrapRequestIdentity | null,
  ): AssistantRuntimeDefinition {
    const scopedIdentity = this.requireIdentity(identity);
    this.assistantGuardrailService.enforceRateLimit(
      scopedIdentity,
      "tool_invoke",
    );
    return buildAssistantRuntimeDefinition(
      this.assistantReadToolRegistry?.listDefinitions() ?? [],
    );
  }

  invokeTool(
    toolName: string,
    input: unknown,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedIdentity = this.requireIdentity(identity);
    this.assistantGuardrailService.enforceRateLimit(
      scopedIdentity,
      "tool_invoke",
    );

    if (toolName === ASSISTANT_PROPOSE_ACTION_TOOL) {
      return this.proposeAction(
        this.coerceProposeActionInput(input),
        scopedIdentity,
      );
    }

    if (!this.assistantReadToolRegistry?.hasTool(toolName)) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_TOOL_UNSUPPORTED",
        `Assistant tool '${toolName}' is not supported.`,
        { toolName },
      );
    }

    const result = this.assistantReadToolRegistry.execute({
      toolName,
      input: this.coerceToolInput(input),
      identity: scopedIdentity,
    });
    return this.assistantGuardrailService.screenToolOutput(
      toolName,
      result.output,
    ).output;
  }

  proposeAction(
    input: ProposeActionToolInput,
    identity: BootstrapRequestIdentity,
  ): ActionIntent {
    const intent = buildActionIntent({
      resourceKind: this.requireNonBlank(input.resourceKind, "resourceKind"),
      resourceId: this.requireNonBlank(input.resourceId, "resourceId"),
      action: this.requireNonBlank(input.action, "action"),
      args: this.normalizeArgs(input.args),
    });
    const sanitizedIntent =
      this.assistantGuardrailService.sanitizeActionIntent(intent);
    this.auditActionProposal(identity, sanitizedIntent, "tool_route");
    return sanitizedIntent;
  }

  async streamConversationMessage(
    conversationId: string,
    command: CreateAssistantMessageCommand,
    identity: BootstrapRequestIdentity | null,
    sink: AssistantEventSink,
  ) {
    const scopedIdentity = this.requireIdentity(identity);
    this.assistantGuardrailService.enforceRateLimit(
      scopedIdentity,
      "message_stream",
    );
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
        availableTools: buildAssistantRuntimeDefinition(
          this.assistantReadToolRegistry?.listDefinitions() ?? [],
        ).tools,
      },
    )) {
      if (gatewayEvent.type === "tool_result") {
        const screenedOutput = this.assistantGuardrailService.screenToolOutput(
          gatewayEvent.toolName,
          gatewayEvent.result,
        );
        const sanitizedEvent = {
          ...gatewayEvent,
          result: screenedOutput.output,
        } satisfies Extract<AssistantGatewayEvent, { type: "tool_result" }>;
        const toolMessage = this.buildToolMessage(conversation, sanitizedEvent);
        this.messages.push(toolMessage);
        persistedMessages.push(this.cloneMessage(toolMessage));
        sink.emit(
          this.materializeGatewayEvent(
            conversation.conversationId,
            sanitizedEvent,
            toolMessage.messageId,
          ),
        );
        continue;
      }

      if (gatewayEvent.type === "action_intent") {
        this.auditSuggestedAction(scopedIdentity, gatewayEvent.intent);
        sink.emit(
          this.materializeGatewayEvent(
            conversation.conversationId,
            gatewayEvent,
          ),
        );
        continue;
      }

      if (gatewayEvent.type === "final") {
        const screenedContent =
          this.assistantGuardrailService.screenAssistantText(
            gatewayEvent.content,
          );
        persistedAssistantMessage = this.buildAssistantMessage(
          conversation,
          screenedContent.content,
          scopedIdentity.requestId,
        );
        this.messages.push(persistedAssistantMessage);
        persistedMessages.push(this.cloneMessage(persistedAssistantMessage));
        sink.emit(
          this.materializeGatewayEvent(
            conversation.conversationId,
            {
              ...gatewayEvent,
              content: screenedContent.content,
            },
            persistedAssistantMessage.messageId,
          ),
        );
        continue;
      }

      sink.emit(
        this.materializeGatewayEvent(conversation.conversationId, gatewayEvent),
      );
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
      metadata: this.assistantGuardrailService.sanitizeMetadata({
        result: event.result,
      }),
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
    messageId: string | null = null,
  ): AssistantStreamEnvelope<unknown> {
    const base = {
      eventId: `evt_${randomUUID()}`,
      conversationId,
      messageId,
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

  private auditActionProposal(
    identity: BootstrapRequestIdentity,
    intent: ActionIntent,
    source: "tool_route" | "conversation_tool",
  ) {
    const auditLog: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      actorId: identity.actorId,
      actorType: this.normalizeAuditActorType(identity.actorType),
      tenantId: identity.tenantId,
      moduleName: "assistant",
      actionName: "assistant.action.proposed",
      resourceType: intent.resourceKind,
      resourceId: intent.resourceId,
      newValuesSummary: {
        source,
        tool: intent.tool,
        action: intent.action,
        args: intent.args,
        confirmationRequired: intent.confirmationRequired,
        mutates: intent.mutates,
        realm: identity.realm,
      },
    };
    if (identity.requestId) {
      auditLog.requestId = identity.requestId;
    }
    this.auditNotificationService?.recordAuditLog(auditLog);
  }

  private auditSuggestedAction(
    identity: BootstrapRequestIdentity,
    intent: string | ActionIntent,
  ) {
    const newValuesSummary =
      typeof intent === "string"
        ? {
            realm: identity.realm,
            suggestedIntent: intent,
          }
        : {
            realm: identity.realm,
            suggestedIntent: intent.action,
            tool: intent.tool,
            resourceKind: intent.resourceKind,
            resourceId: intent.resourceId,
            args: intent.args,
          };
    const auditLog: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      actorId: identity.actorId,
      actorType: this.normalizeAuditActorType(identity.actorType),
      tenantId: identity.tenantId,
      moduleName: "assistant",
      actionName: "assistant.action.suggested",
      resourceType: "assistant_action_suggestion",
      resourceId: typeof intent === "string" ? null : intent.resourceId,
      newValuesSummary,
    };
    if (identity.requestId) {
      auditLog.requestId = identity.requestId;
    }
    this.auditNotificationService?.recordAuditLog(auditLog);
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

  private normalizeAuditActorType(actorType: BootstrapRequestIdentity["actorType"]) {
    return actorType === "driver_user" ? "system" : actorType;
  }

  private coerceToolInput(input: unknown) {
    if (input === undefined) {
      return undefined;
    }
    if (!this.isPlainObject(input)) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_TOOL_INPUT_INVALID",
        "Assistant tool input must be an object.",
      );
    }
    return structuredClone(input);
  }

  private coerceProposeActionInput(input: unknown): ProposeActionToolInput {
    if (!this.isPlainObject(input)) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_TOOL_INPUT_INVALID",
        "Assistant tool input must be an object.",
      );
    }

    const { resourceKind, resourceId, action, args } = input;

    if (
      typeof resourceKind !== "string" ||
      typeof resourceId !== "string" ||
      typeof action !== "string"
    ) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_TOOL_INPUT_INVALID",
        "Assistant tool input requires string resourceKind, resourceId, and action fields.",
      );
    }

    if (args !== undefined && !this.isPlainObject(args)) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_ACTION_ARGS_INVALID",
        "Assistant proposeAction args must be an object.",
      );
    }

    return {
      resourceKind,
      resourceId,
      action,
      ...(args === undefined ? {} : { args: structuredClone(args) }),
    };
  }

  private requireNonBlank(value: string, field: string) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }

    throw new ApiRequestError(
      400,
      "ASSISTANT_ACTION_FIELD_REQUIRED",
      `Assistant proposeAction requires a non-empty ${field}.`,
      { field },
    );
  }

  private normalizeArgs(
    args: ProposeActionToolInput["args"],
  ): Record<string, unknown> {
    if (args === undefined) {
      return {};
    }

    if (!this.isPlainObject(args)) {
      throw new ApiRequestError(
        400,
        "ASSISTANT_ACTION_ARGS_INVALID",
        "Assistant proposeAction args must be an object.",
      );
    }

    return structuredClone(args);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private cloneMessage(
    message: AssistantMessageRecord,
  ): AssistantMessageRecord {
    return {
      ...message,
      metadata: message.metadata
        ? this.assistantGuardrailService.sanitizeMetadata(message.metadata)
        : null,
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
