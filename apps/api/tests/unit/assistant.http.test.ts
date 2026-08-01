import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantGuardrailService } from "../../src/modules/assistant/assistant.guardrail.service";
import { AssistantLlmGatewayService } from "../../src/modules/assistant/assistant-llm-gateway.service";
import { AssistantService } from "../../src/modules/assistant/assistant.service";

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantGuardrailService,
    AssistantLlmGatewayService,
    AssistantService,
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new BootstrapAuthGuard(reflector),
      inject: [Reflector],
    },
  ],
})
class AssistantHttpTestModule {}

describe("AssistantController HTTP routing", () => {
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const app = await NestFactory.create(AssistantHttpTestModule, {
      logger: false,
    });
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral HTTP server address.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    closeApplication = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeApplication?.();
  });

  it("routes /assistant/tools/propose-action to the dedicated proposeAction handler", async () => {
    const response = await fetch(`${baseUrl}/assistant/tools/propose-action`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-type": "ops_user",
        "x-actor-id": "ops-001",
        "x-realm": "ops",
        "x-scopes": "assistant:write",
      },
      body: JSON.stringify({
        resourceKind: "incident",
        resourceId: "inc-001",
        action: "resolve",
        args: {
          callbackPhone: "0911222333",
        },
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        type: "action_intent",
        tool: "proposeAction",
        resourceKind: "incident",
        resourceId: "inc-001",
        action: "resolve",
        args: {
          callbackPhone: "******2333",
        },
        confirmationRequired: true,
        mutates: false,
      },
      meta: {
        requestId: expect.any(String),
        timestamp: expect.any(String),
      },
    });
  });

  it("keeps generic tool routing for unknown tools and rejects them", async () => {
    const response = await fetch(`${baseUrl}/assistant/tools/mutateState`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-type": "ops_user",
        "x-actor-id": "ops-001",
        "x-realm": "ops",
        "x-scopes": "assistant:write",
      },
      body: JSON.stringify({
        resourceKind: "incident",
        resourceId: "inc-001",
        action: "resolve",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ASSISTANT_TOOL_UNSUPPORTED",
        message: "Assistant tool 'mutateState' is not supported.",
        details: {
          toolName: "mutateState",
        },
        retryable: false,
        traceId: expect.any(String),
      },
    });
  });

  it("routes GET /assistant/tools/runtime-definition with assistant:read scope", async () => {
    const response = await fetch(`${baseUrl}/assistant/tools/runtime-definition`, {
      method: "GET",
      headers: {
        "x-actor-type": "ops_user",
        "x-actor-id": "ops-001",
        "x-realm": "ops",
        "x-scopes": "assistant:read",
      },
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: { tools: unknown[] } };
    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data.tools)).toBe(true);
  });
});
