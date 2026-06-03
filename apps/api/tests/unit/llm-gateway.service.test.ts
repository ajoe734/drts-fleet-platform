import { beforeEach, describe, expect, it, vi } from "vitest";

import { LlmGatewayService } from "../../src/common/llm-gateway/llm-gateway.service";
import type {
  LlmGatewayChatRequest,
  LlmGatewayProvider,
  LlmGatewayProviderRequest,
} from "../../src/common/llm-gateway/llm-gateway.types";

function createRequest(
  overrides: Partial<LlmGatewayChatRequest> = {},
): LlmGatewayChatRequest {
  return {
    messages: [
      {
        role: "system",
        content: "You are the ops assistant.",
      },
      {
        role: "user",
        content: "Summarize the incident.",
      },
    ],
    ...overrides,
  };
}

describe("LlmGatewayService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    process.env = {
      ...originalEnv,
      OPS_ASSISTANT_ENABLED: "true",
      OPS_ASSISTANT_MODEL: "claude-opus-4-8",
      OPS_ASSISTANT_REASONING_MODEL: "claude-opus-4-8",
      OPS_ASSISTANT_CHEAP_MODEL: "claude-haiku-4-5",
      OPS_ASSISTANT_PROMPT_CACHING: "true",
      OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET: "50",
      OPS_ASSISTANT_MAX_RETRIES: "1",
    };
  });

  it("uses the reasoning model and keeps prompt caching enabled", async () => {
    const provider: LlmGatewayProvider = {
      providerName: "claude",
      chat: vi.fn(async (request: LlmGatewayProviderRequest) => ({
        model: request.model,
        text: "Incident summary",
        stopReason: "end_turn",
        usage: {
          inputTokens: 10,
          outputTokens: 12,
          cacheReadInputTokens: 4,
        },
      })),
      stream: vi.fn(),
    };

    const service = new LlmGatewayService(provider);
    const response = await service.chat(createRequest());

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-8",
        promptCaching: true,
      }),
    );
    expect(response).toMatchObject({
      provider: "claude",
      model: "claude-opus-4-8",
      text: "Incident summary",
      degraded: false,
      degradedReason: null,
    });
    expect(service.getBudgetSnapshot().usedTokens).toBe(26);
  });

  it("falls back to the cheap model when the reasoning model call fails", async () => {
    const provider: LlmGatewayProvider = {
      providerName: "claude",
      chat: vi
        .fn()
        .mockRejectedValueOnce(new Error("primary failed"))
        .mockResolvedValueOnce({
          model: "claude-haiku-4-5",
          text: "Fallback summary",
          stopReason: "end_turn",
          usage: {
            inputTokens: 5,
            outputTokens: 6,
          },
        }),
      stream: vi.fn(),
    };

    const service = new LlmGatewayService(provider);
    const response = await service.chat(createRequest());

    expect(provider.chat).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: "claude-opus-4-8" }),
    );
    expect(provider.chat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
    expect(response).toMatchObject({
      degraded: true,
      degradedReason: "provider_error",
      model: "claude-haiku-4-5",
      text: "Fallback summary",
    });
  });

  it("returns a static degraded response when the monthly budget is already exhausted", async () => {
    process.env.OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET = "1";

    const provider: LlmGatewayProvider = {
      providerName: "claude",
      chat: vi.fn(async (request: LlmGatewayProviderRequest) => ({
        model: request.model,
        text: "First response",
        stopReason: "end_turn",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
        },
      })),
      stream: vi.fn(),
    };

    const service = new LlmGatewayService(provider);
    await service.chat(createRequest({ purpose: "cheap" }));
    const response = await service.chat(createRequest({ purpose: "cheap" }));

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      provider: "gateway",
      model: "degraded-fallback",
      degraded: true,
      degradedReason: "budget_exceeded",
    });
  });

  it("streams chunks and emits a final message event", async () => {
    const provider: LlmGatewayProvider = {
      providerName: "claude",
      chat: vi.fn(),
      stream: vi.fn(async function* () {
        yield { type: "chunk", text: "Hello " };
        yield { type: "chunk", text: "world" };
        yield {
          type: "response",
          response: {
            model: "claude-opus-4-8",
            text: "Hello world",
            stopReason: "end_turn",
            usage: {
              inputTokens: 9,
              outputTokens: 3,
            },
          },
        };
      }),
    };

    const service = new LlmGatewayService(provider);
    const events = [];

    for await (const event of service.stream(createRequest())) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "chunk",
        provider: "claude",
        model: "claude-opus-4-8",
        text: "Hello ",
        degraded: false,
        degradedReason: null,
      },
      {
        type: "chunk",
        provider: "claude",
        model: "claude-opus-4-8",
        text: "world",
        degraded: false,
        degradedReason: null,
      },
      {
        type: "message",
        response: {
          provider: "claude",
          model: "claude-opus-4-8",
          text: "Hello world",
          stopReason: "end_turn",
          usage: {
            inputTokens: 9,
            outputTokens: 3,
          },
          degraded: false,
          degradedReason: null,
        },
      },
    ]);
    expect(service.getBudgetSnapshot().usedTokens).toBe(12);
  });
});
