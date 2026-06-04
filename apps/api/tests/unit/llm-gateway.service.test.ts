import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LlmGatewayError,
  LlmGatewayService,
} from "../../src/common/llm-gateway";

describe("LlmGatewayService", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envBackup };
    delete process.env.CI;
    delete process.env.LLM_GATEWAY_BASE_URL;
    delete process.env.LLM_GATEWAY_API_KEY;
    delete process.env.LLM_GATEWAY_PROVIDER;
    delete process.env.LLM_GATEWAY_CHAT_MODEL;
    delete process.env.PLATFORM_ADMIN_ASSISTANT_ENABLED;
    process.env.NODE_ENV = "production";
  });

  it("calls the OpenAI-compatible provider and returns normalized text plus usage", async () => {
    process.env.PLATFORM_ADMIN_ASSISTANT_ENABLED = "true";
    process.env.LLM_GATEWAY_PROVIDER = "openai";
    process.env.LLM_GATEWAY_API_KEY = "sk-test";
    process.env.LLM_GATEWAY_CHAT_MODEL = "gpt-4.1-mini";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "gpt-4.1-mini",
          choices: [
            {
              message: {
                content:
                  '{"answer":"Live answer","citations":[],"suggestedPrompts":[],"actionPlan":null}',
              },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 24,
            total_tokens: 36,
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const service = new LlmGatewayService(fetchMock);
    const response = await service.completeChat({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer sk-test",
        }),
      }),
    );
    expect(response).toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
      text: '{"answer":"Live answer","citations":[],"suggestedPrompts":[],"actionPlan":null}',
      usage: {
        inputTokens: 12,
        outputTokens: 24,
        totalTokens: 36,
      },
    });
  });

  it("maps 429 quota failures to a provider quota error", async () => {
    process.env.PLATFORM_ADMIN_ASSISTANT_ENABLED = "true";
    process.env.LLM_GATEWAY_PROVIDER = "openai";
    process.env.LLM_GATEWAY_API_KEY = "sk-test";

    const service = new LlmGatewayService(
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Quota exceeded for this project.",
            },
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    await expect(
      service.completeChat({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      code: "provider_quota_exceeded",
      status: 429,
    } satisfies Partial<LlmGatewayError>);
  });

  it("uses the configured base URL for OpenAI-compatible providers", async () => {
    process.env.PLATFORM_ADMIN_ASSISTANT_ENABLED = "true";
    process.env.LLM_GATEWAY_PROVIDER = "openrouter";
    process.env.LLM_GATEWAY_API_KEY = "sk-test";
    process.env.LLM_GATEWAY_BASE_URL = "https://gateway.example/v1";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "openrouter/model",
          choices: [
            {
              message: {
                content: '{"answer":"Live answer"}',
              },
            },
          ],
          usage: {},
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const service = new LlmGatewayService(fetchMock);
    await service.completeChat({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/chat/completions",
      expect.any(Object),
    );
  });
});
