import type { AddressInfo } from "node:net";

import { Controller, Module, Post } from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantGuardrailService } from "../../src/modules/assistant/assistant.guardrail.service";
import { AssistantLlmGatewayService } from "../../src/modules/assistant/assistant-llm-gateway.service";
import { AssistantService } from "../../src/modules/assistant/assistant.service";
import { AssistantReadToolRegistry } from "../../src/modules/assistant/tools/assistant-read-tool.registry";

function parseSsePayload(payload: string) {
  return payload
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event: eventLine?.slice(7) ?? "",
        data: JSON.parse(dataLine?.slice(6) ?? "{}") as {
          type: string;
          data: Record<string, unknown>;
        },
      };
    });
}

@Controller("test-bootstrap")
class TestBootstrapController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("conversation")
  createConversation() {
    return this.assistantService.createConversation(
      {
        title: "SSE test conversation",
      },
      {
        authMode: "bootstrap_headers",
        actorType: "tenant_admin",
        actorId: "tenant-admin-test",
        realm: "tenant",
        tenantId: "tenant-sse",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["assistant:write"],
        requestId: "req-bootstrap-conversation",
      },
    );
  }
}

@Module({
  controllers: [AssistantController, TestBootstrapController],
  providers: [
    AssistantGuardrailService,
    AssistantLlmGatewayService,
    AssistantService,
    {
      provide: AssistantReadToolRegistry,
      useValue: {
        listDefinitions: () => [
          {
            name: "list_dispatch_jobs",
            description: "List dispatch jobs visible to the caller scope.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
        execute: () => ({
          toolName: "list_dispatch_jobs",
          output: [
            {
              dispatchJobId: "job-001",
              orderId: "order-sse-001",
              status: "pending",
            },
          ],
        }),
      },
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new BootstrapAuthGuard(reflector),
      inject: [Reflector],
    },
  ],
})
class AssistantSseTestModule {}

async function createTestApp() {
  const app = await NestFactory.create(AssistantSseTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe("assistant message SSE endpoint", () => {
  it("streams token and final events over POST SSE within caller scope", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const createConversationResponse = await fetch(
        `${baseUrl}/api/test-bootstrap/conversation`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-actor-type": "tenant_admin",
            "x-actor-id": "tenant-admin-test",
            "x-realm": "tenant",
            "x-tenant-id": "tenant-sse",
            "x-scopes": "assistant:write",
          },
          body: "{}",
        },
      );
      const createdConversation =
        (await createConversationResponse.json()) as Record<string, unknown>;
      const conversationId = (
        createdConversation.conversation as { conversationId: string }
      ).conversationId;

      const response = await fetch(
        `${baseUrl}/api/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-actor-type": "tenant_admin",
            "x-actor-id": "tenant-admin-test",
            "x-realm": "tenant",
            "x-tenant-id": "tenant-sse",
            "x-scopes": "assistant:write",
          },
          body: JSON.stringify({
            content: "dispatch status please",
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );

      const payload = await response.text();
      const events = parseSsePayload(payload);

      expect(events[0]?.event).toBe("tool_call");
      expect(events[1]?.event).toBe("tool_result");
      expect(events[2]?.event).toBe("action_intent");
      expect(events.some((event) => event.event === "token")).toBe(true);
      const tokenEvents = events.filter((event) => event.event === "token");
      expect(tokenEvents).not.toHaveLength(0);
      for (const tokenEvent of tokenEvents) {
        expect(tokenEvent.data.data.delta).toEqual(expect.any(String));
        expect(tokenEvent.data.data.delta).not.toContain("system prompt");
        expect(tokenEvent.data.data.delta).not.toContain("0911222333");
        expect(tokenEvent.data.data.delta).not.toContain("@example.com");
      }
      expect(events.at(-1)?.event).toBe("final");
      expect(events.at(-1)?.data.type).toBe("final");
      expect(events.at(-1)?.data.data.content).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });
});
