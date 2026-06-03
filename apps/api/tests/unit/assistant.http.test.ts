import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantService } from "../../src/modules/assistant/assistant.service";

@Module({
  controllers: [AssistantController],
  providers: [AssistantService],
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
        "x-request-id": "req-assist-http-001",
      },
      body: JSON.stringify({
        resourceKind: "incident",
        resourceId: "inc-001",
        action: "resolve",
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
        args: {},
        confirmationRequired: true,
        mutates: false,
      },
      meta: {
        requestId: "req-assist-http-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("keeps generic tool routing for unknown tools and rejects them without mutation", async () => {
    const response = await fetch(`${baseUrl}/assistant/tools/mutateState`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
});
