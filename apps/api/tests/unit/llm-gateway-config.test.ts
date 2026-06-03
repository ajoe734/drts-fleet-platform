import { describe, expect, it } from "vitest";

import { resolveLlmGatewayConfig } from "../../src/common/llm-gateway";

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
      "LLM_GATEWAY_PROVIDER must be one of: mock, openai, anthropic, openrouter, ollama",
    );
  });
});
