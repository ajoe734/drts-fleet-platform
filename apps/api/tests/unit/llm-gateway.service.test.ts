import { describe, expect, it, vi } from "vitest";

import {
  LlmGatewayBudgetExceededError,
  LlmGatewayDisabledError,
  LlmGatewayProviderError,
} from "../../src/common/llm-gateway/llm-gateway.errors";
import { LlmGatewayService } from "../../src/common/llm-gateway/llm-gateway.service";
import type {
  LlmGatewayConfig,
  LlmGatewayProvider,
  LlmGatewayRequest,
  LlmGatewayResponse,
  LlmGatewayStreamEvent,
  ResolvedLlmGatewayRequest,
} from "../../src/common/llm-gateway/llm-gateway.types";

function createConfig(
  overrides: Partial<LlmGatewayConfig> = {},
): LlmGatewayConfig {
  const config: LlmGatewayConfig = {
    provider: "anthropic",
    reasoningModel: "claude-opus-4-8",
    cheapModel: "claude-haiku-4-5",
    timeoutMs: 30_000,
    maxRetries: 1,
    monthlyTokenBudget: 0,
    promptCachingEnabled: true,
    killSwitchEnabled: false,
    anthropicApiKey: "test-key",
    vertexRegion: "global",
  };

  return {
    ...config,
    ...overrides,
  };
}

function createRequest(
  overrides: Partial<LlmGatewayRequest> = {},
): LlmGatewayRequest {
  return {
    system: "You are a concise assistant.",
    messages: [{ role: "user", content: "Summarize fleet status" }],
    maxOutputTokens: 128,
    taskTier: "reasoning",
    ...overrides,
  };
}

function createResponse(
  request: ResolvedLlmGatewayRequest,
  overrides: Partial<LlmGatewayResponse> = {},
): LlmGatewayResponse {
  const response: LlmGatewayResponse = {
    provider: "anthropic",
    model: request.model,
    text: "ok",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
    },
    degraded: request.degraded,
    stopReason: "end_turn",
  };
  if (request.degradedReason) {
    response.degradedReason = request.degradedReason;
  }
  return {
    ...response,
    ...overrides,
  };
}

function createProviderMock(overrides?: Partial<LlmGatewayProvider>) {
  const chat = vi.fn(async (request: ResolvedLlmGatewayRequest) =>
    createResponse(request),
  );
  const stream = vi.fn(async function* (request: ResolvedLlmGatewayRequest) {
    yield {
      type: "text-delta",
      textDelta: "hel",
    } satisfies LlmGatewayStreamEvent;
    yield {
      type: "text-delta",
      textDelta: "lo",
    } satisfies LlmGatewayStreamEvent;
    yield {
      type: "response",
      response: createResponse(request, {
        text: "hello",
      }),
    } satisfies LlmGatewayStreamEvent;
  });

  return {
    name: "anthropic" as const,
    chat,
    stream,
    ...overrides,
  };
}

describe("LlmGatewayService", () => {
  it("pins reasoning requests to the configured default model", async () => {
    const provider = createProviderMock();
    const service = new LlmGatewayService(provider, createConfig());

    const response = await service.chat(createRequest());

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-8",
        promptCachingEnabled: true,
      }),
    );
    expect(response.model).toBe("claude-opus-4-8");
    expect(service.getSpentTokens()).toBe(15);
  });

  it("degrades to the cheap model when the monthly budget guard would be exceeded", async () => {
    const provider = createProviderMock();
    const service = new LlmGatewayService(
      provider,
      createConfig({
        monthlyTokenBudget: 120,
      }),
    );

    const response = await service.chat(
      createRequest({
        messages: [{ role: "user", content: "x".repeat(1000) }],
      }),
    );

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        degraded: true,
        degradedReason: "monthly_budget_guard",
      }),
    );
    expect(response.degraded).toBe(true);
  });

  it("falls back to the cheap model after a retryable provider failure", async () => {
    const provider = createProviderMock();
    provider.chat
      .mockRejectedValueOnce(
        new LlmGatewayProviderError("rate limited", 429, true),
      )
      .mockRejectedValueOnce(
        new LlmGatewayProviderError("still rate limited", 429, true),
      )
      .mockImplementationOnce(async (request: ResolvedLlmGatewayRequest) =>
        createResponse(request, { text: "fallback" }),
      );

    const service = new LlmGatewayService(provider, createConfig());
    const response = await service.chat(createRequest());

    expect(provider.chat).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        model: "claude-haiku-4-5",
        degraded: true,
        degradedReason: "provider_failure_fallback",
      }),
    );
    expect(response.text).toBe("fallback");
  });

  it("blocks cheap-model requests once the budget guard is exhausted", async () => {
    const provider = createProviderMock();
    const service = new LlmGatewayService(
      provider,
      createConfig({
        monthlyTokenBudget: 50,
      }),
    );

    await expect(
      service.chat(
        createRequest({
          taskTier: "cheap",
          messages: [{ role: "user", content: "x".repeat(400) }],
        }),
      ),
    ).rejects.toBeInstanceOf(LlmGatewayBudgetExceededError);
  });

  it("enforces the kill switch before reaching the provider", async () => {
    const provider = createProviderMock();
    const service = new LlmGatewayService(
      provider,
      createConfig({
        killSwitchEnabled: true,
      }),
    );

    await expect(service.chat(createRequest())).rejects.toBeInstanceOf(
      LlmGatewayDisabledError,
    );
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it("exposes a provider-agnostic streaming interface and records usage", async () => {
    const provider = createProviderMock();
    const service = new LlmGatewayService(provider, createConfig());

    const events: LlmGatewayStreamEvent[] = [];
    for await (const event of service.stream(createRequest())) {
      events.push(event);
    }

    expect(provider.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-8",
      }),
    );
    expect(events).toEqual([
      { type: "text-delta", textDelta: "hel" },
      { type: "text-delta", textDelta: "lo" },
      expect.objectContaining({
        type: "response",
        response: expect.objectContaining({
          text: "hello",
        }),
      }),
    ]);
    expect(service.getSpentTokens()).toBe(15);
  });

  it("streams events progressively instead of buffering the full provider response", async () => {
    const trace: string[] = [];
    const provider = createProviderMock({
      stream: vi.fn(async function* (request: ResolvedLlmGatewayRequest) {
        trace.push("start");
        yield {
          type: "text-delta",
          textDelta: "hel",
        } satisfies LlmGatewayStreamEvent;
        trace.push("after-first-yield");
        yield {
          type: "response",
          response: createResponse(request, {
            text: "hel",
          }),
        } satisfies LlmGatewayStreamEvent;
        trace.push("done");
      }),
    });
    const service = new LlmGatewayService(provider, createConfig());
    const iterator = service.stream(createRequest())[Symbol.asyncIterator]();

    const first = await iterator.next();

    expect(first).toEqual({
      done: false,
      value: { type: "text-delta", textDelta: "hel" },
    });
    expect(trace).toEqual(["start"]);

    const second = await iterator.next();
    expect(second.done).toBe(false);
    expect(second.value).toEqual(
      expect.objectContaining({
        type: "response",
      }),
    );
    expect(trace).toEqual(["start", "after-first-yield"]);
    expect(service.getSpentTokens()).toBe(15);

    const third = await iterator.next();
    expect(third.done).toBe(true);
    expect(trace).toEqual(["start", "after-first-yield", "done"]);
  });
});
