import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { ApiRequestError } from "../../src/common/api-envelope";
import { AssistantLlmGatewayService } from "../../src/modules/assistant/assistant-llm-gateway.service";
import { AssistantService } from "../../src/modules/assistant/assistant.service";
import { AssistantReadToolRegistry } from "../../src/modules/assistant/tools/assistant-read-tool.registry";
import type {
  AssistantEventSink,
  AssistantGatewayContext,
  AssistantGatewayEvent,
} from "../../src/modules/assistant/assistant.types";
import { describe, expect, it, vi } from "vitest";

class FakeAssistantGatewayService extends AssistantLlmGatewayService {
  constructor(private readonly events: AssistantGatewayEvent[]) {
    super();
  }

  async *streamReply(
    context: AssistantGatewayContext,
  ): AsyncGenerator<AssistantGatewayEvent> {
    void context;
    for (const event of this.events) {
      yield event;
    }
  }
}

function createIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "tenant_admin",
    actorId: "tenant-admin-001",
    realm: "tenant",
    tenantId: "tenant-a",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["assistant:write"],
    requestId: "req-assistant-001",
    ...overrides,
  };
}

function createSink() {
  const events: unknown[] = [];

  const sink: AssistantEventSink = {
    emit(event) {
      events.push(event);
    },
  };

  return {
    sink,
    events,
  };
}

describe("AssistantService", () => {
  it("streams assistant events, persists messages, and enforces retention", async () => {
    const assistantRepository = {
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new AssistantService(
      new FakeAssistantGatewayService([
        {
          type: "tool_call",
          toolCallId: "tool-call-001",
          toolName: "ops.dispatch.lookup",
          arguments: { tenantId: "tenant-a" },
        },
        {
          type: "tool_result",
          toolCallId: "tool-call-001",
          toolName: "ops.dispatch.lookup",
          result: { status: "ok" },
        },
        {
          type: "action_intent",
          intent: "open_dispatch_console",
          label: "Open dispatch console",
          confidence: 0.95,
        },
        {
          type: "final",
          content: "Final assistant reply",
        },
      ]),
      undefined,
      assistantRepository as never,
    );
    const identity = createIdentity();
    const conversation = service.createConversation(
      {
        title: "Dispatch assistant",
      },
      identity,
    ).conversation;

    for (let index = 0; index < 9; index += 1) {
      const { sink, events } = createSink();
      await service.streamConversationMessage(
        conversation.conversationId,
        {
          content: `dispatch update ${index}`,
        },
        identity,
        sink,
      );

      expect(events.map((event) => (event as { type: string }).type)).toEqual([
        "tool_call",
        "tool_result",
        "action_intent",
        "final",
      ]);
    }

    const retainedMessages = service.getConversationMessages(
      conversation.conversationId,
      identity,
    );
    expect(retainedMessages).toHaveLength(24);
    expect(retainedMessages[0]?.content).toContain("dispatch update 1");
    expect(retainedMessages.at(-1)?.content).toBe("Final assistant reply");
    expect(assistantRepository.persistChanges).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversations: [
          expect.objectContaining({
            conversationId: conversation.conversationId,
            messageCount: 24,
          }),
        ],
        deletedMessageIds: expect.any(Array),
      }),
    );
  });

  it("rejects access outside the conversation realm or tenant scope", async () => {
    const service = new AssistantService(
      new FakeAssistantGatewayService([
        {
          type: "final",
          content: "Scoped reply",
        },
      ]),
      undefined,
    );
    const ownerIdentity = createIdentity();
    const otherTenantIdentity = createIdentity({
      tenantId: "tenant-b",
      actorId: "tenant-admin-002",
      requestId: "req-assistant-002",
    });
    const conversation = service.createConversation(
      {},
      ownerIdentity,
    ).conversation;

    await expect(
      service.streamConversationMessage(
        conversation.conversationId,
        {
          content: "hello",
        },
        otherTenantIdentity,
        createSink().sink,
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("registers read tools into the conversation loop context", async () => {
    const streamReply = vi.fn(async function* (
      context: AssistantGatewayContext,
    ): AsyncGenerator<AssistantGatewayEvent> {
      expect(context.availableTools.map((tool) => tool.name)).toContain(
        "get_order",
      );
      expect(context.identity.tenantId).toBe("tenant-a");

      yield {
        type: "final",
        content: "Scoped reply",
      };
    });
    const gateway = {
      streamReply,
    } as AssistantLlmGatewayService;
    const registry = {
      listDefinitions: vi.fn(() => [
        {
          name: "get_order",
          description: "Read an order",
          inputSchema: {
            type: "object" as const,
            properties: {
              orderId: {
                type: "string",
              },
            },
            required: ["orderId"],
            additionalProperties: false,
          },
        },
      ]),
    } as unknown as AssistantReadToolRegistry;
    const service = new AssistantService(gateway, registry);
    const identity = createIdentity();
    const conversation = service.createConversation({}, identity).conversation;

    await service.streamConversationMessage(
      conversation.conversationId,
      {
        content: "show order-tenant-001",
      },
      identity,
      createSink().sink,
    );

    expect(streamReply).toHaveBeenCalledTimes(1);
    expect(registry.listDefinitions).toHaveBeenCalledTimes(1);
  });
});
