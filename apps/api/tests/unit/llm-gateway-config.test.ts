import { describe, expect, it } from "vitest";

import {
  LlmGatewayService,
  resolveLlmGatewayConfig,
} from "../../src/common/llm-gateway";

describe("resolveLlmGatewayConfig", () => {
  it("defaults to a mock provider with conservative limits", () => {
    expect(resolveLlmGatewayConfig({})).toEqual({
      enabled: false,
      provider: "mock",
      requestedProvider: "mock",
      chatModel: "mock-chat-v1",
      summarizerModel: "mock-summary-v1",
      dailyBudgetUsd: 25,
      requestsPerMinute: 30,
      inputTokensPerMinute: 120000,
      outputTokensPerMinute: 16000,
      transcriptRetentionDays: 30,
    });
  });

  it("falls back to mock in local and CI runtimes when a real provider lacks an api key", () => {
    expect(
      resolveLlmGatewayConfig({
        PLATFORM_ADMIN_ASSISTANT_ENABLED: "true",
        LLM_GATEWAY_PROVIDER: "openai",
        NODE_ENV: "development",
      }),
    ).toMatchObject({
      enabled: true,
      provider: "mock",
      requestedProvider: "openai",
    });

    expect(
      resolveLlmGatewayConfig({
        PLATFORM_ADMIN_ASSISTANT_ENABLED: "true",
        LLM_GATEWAY_PROVIDER: "anthropic",
        NODE_ENV: "production",
        CI: "true",
      }),
    ).toMatchObject({
      enabled: true,
      provider: "mock",
      requestedProvider: "anthropic",
    });
  });

  it("keeps openclaw enabled without requiring an llm gateway api key", () => {
    expect(
      resolveLlmGatewayConfig({
        PLATFORM_ADMIN_ASSISTANT_ENABLED: "true",
        LLM_GATEWAY_PROVIDER: "openclaw",
        NODE_ENV: "production",
      }),
    ).toMatchObject({
      enabled: true,
      provider: "openclaw",
      requestedProvider: "openclaw",
      chatModel: "openai/gpt-5.5",
      summarizerModel: "openai/gpt-5.4-mini",
    });
  });

  it("keeps the requested real provider when an api key is present", () => {
    expect(
      resolveLlmGatewayConfig({
        PLATFORM_ADMIN_ASSISTANT_ENABLED: "true",
        LLM_GATEWAY_PROVIDER: "openai",
        LLM_GATEWAY_API_KEY: "sk-test",
        LLM_GATEWAY_BASE_URL: "https://gateway.example/v1",
        LLM_GATEWAY_CHAT_MODEL: "gpt-4.1-mini",
        LLM_GATEWAY_SUMMARIZER_MODEL: "gpt-4.1-nano",
        LLM_GATEWAY_DAILY_BUDGET_USD: "18.5",
        LLM_GATEWAY_REQUESTS_PER_MINUTE: "12",
        LLM_GATEWAY_INPUT_TOKENS_PER_MINUTE: "64000",
        LLM_GATEWAY_OUTPUT_TOKENS_PER_MINUTE: "8000",
        LLM_GATEWAY_TRANSCRIPT_RETENTION_DAYS: "14",
        NODE_ENV: "production",
      }),
    ).toEqual({
      enabled: true,
      provider: "openai",
      requestedProvider: "openai",
      apiKey: "sk-test",
      baseUrl: "https://gateway.example/v1",
      chatModel: "gpt-4.1-mini",
      summarizerModel: "gpt-4.1-nano",
      dailyBudgetUsd: 18.5,
      requestsPerMinute: 12,
      inputTokensPerMinute: 64000,
      outputTokensPerMinute: 8000,
      transcriptRetentionDays: 14,
    });
  });

  it("rejects an enabled production config that selects a real provider without an api key", () => {
    expect(() =>
      resolveLlmGatewayConfig({
        PLATFORM_ADMIN_ASSISTANT_ENABLED: "true",
        LLM_GATEWAY_PROVIDER: "openai",
        NODE_ENV: "production",
      }),
    ).toThrow(
      "LLM_GATEWAY_API_KEY is required when PLATFORM_ADMIN_ASSISTANT_ENABLED=true and LLM_GATEWAY_PROVIDER is not mock in production",
    );
  });

  it("rejects unsupported provider slugs", () => {
    expect(() =>
      resolveLlmGatewayConfig({
        LLM_GATEWAY_PROVIDER: "bedrock",
      }),
    ).toThrow(
      "LLM_GATEWAY_PROVIDER must be one of: mock, openclaw, openai, anthropic, openrouter, ollama",
    );
  });
});

describe("LlmGatewayService usage enforcement", () => {
  it("tracks per-actor request and token usage", () => {
    const now = Date.parse("2026-06-03T00:00:00.000Z");
    const service = new LlmGatewayService({
      env: {
        LLM_GATEWAY_REQUESTS_PER_MINUTE: "3",
        LLM_GATEWAY_INPUT_TOKENS_PER_MINUTE: "1000",
        LLM_GATEWAY_OUTPUT_TOKENS_PER_MINUTE: "1000",
      },
      now: () => now,
    });

    const reservation = service.reserveRequest({
      actorKey: "pa-admin-1",
      requestText: "hello world",
    });
    service.completeRequest({
      reservation,
      responseText: "reply text",
    });

    expect(service.getUsageSnapshot("pa-admin-1")).toMatchObject({
      requestsInCurrentMinute: 1,
    });
    expect(
      service.getUsageSnapshot("pa-admin-1").inputTokensInCurrentMinute,
    ).toBeGreaterThan(0);
    expect(
      service.getUsageSnapshot("pa-admin-1").outputTokensInCurrentMinute,
    ).toBeGreaterThan(0);
  });

  it("rejects requests once the configured daily budget is exhausted", () => {
    const service = new LlmGatewayService({
      env: {
        LLM_GATEWAY_DAILY_BUDGET_USD: "0.000001",
      },
      now: () => Date.parse("2026-06-03T00:00:00.000Z"),
    });

    expect(() =>
      service.reserveRequest({
        actorKey: "pa-admin-2",
        requestText:
          "This request is intentionally long enough to exceed the tiny budget.",
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_DAILY_BUDGET_EXCEEDED",
          }),
        }),
      }),
    );
  });

  it("rejects responses once the configured output token rate limit is exhausted", () => {
    const service = new LlmGatewayService({
      env: {
        LLM_GATEWAY_OUTPUT_TOKENS_PER_MINUTE: "2",
      },
      now: () => Date.parse("2026-06-03T00:00:00.000Z"),
    });

    const reservation = service.reserveRequest({
      actorKey: "pa-admin-3",
      requestText: "ok",
    });

    expect(() =>
      service.completeRequest({
        reservation,
        responseText: "this response is too long",
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_OUTPUT_TOKEN_RATE_LIMITED",
          }),
        }),
      }),
    );
  });

  it("rejects responses that would push spend past the configured daily budget", () => {
    const service = new LlmGatewayService({
      env: {
        LLM_GATEWAY_DAILY_BUDGET_USD: "0.00001",
      },
      now: () => Date.parse("2026-06-03T00:00:00.000Z"),
    });

    const reservation = service.reserveRequest({
      actorKey: "pa-admin-4",
      requestText: "ok",
    });

    expect(() =>
      service.completeRequest({
        reservation,
        responseText:
          "This response is intentionally long enough to exceed the remaining daily budget.",
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_DAILY_BUDGET_EXCEEDED",
          }),
        }),
      }),
    );

    expect(service.getUsageSnapshot("pa-admin-4")).toMatchObject({
      outputTokensInCurrentMinute: 0,
    });
    expect(service.getUsageSnapshot("pa-admin-4").estimatedDailySpendUsd).toBe(
      reservation.estimatedInputCostUsd,
    );
  });
});
