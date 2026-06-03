import { describe, expect, it, vi } from "vitest";

import { AnthropicLlmGatewayProvider } from "../../src/common/llm-gateway/providers/anthropic.provider";
import type {
  LlmGatewayConfig,
  ResolvedLlmGatewayRequest,
} from "../../src/common/llm-gateway/llm-gateway.types";

function createConfig(
  overrides: Partial<LlmGatewayConfig> = {},
): LlmGatewayConfig {
  return {
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
    ...overrides,
  };
}

function createResolvedRequest(
  overrides: Partial<ResolvedLlmGatewayRequest> = {},
): ResolvedLlmGatewayRequest {
  return {
    request: {
      system: "You are a concise assistant.",
      messages: [{ role: "user", content: "Summarize fleet status" }],
      maxOutputTokens: 128,
      temperature: 0.2,
      metadata: {
        traceId: "trace-123",
      },
      taskTier: "reasoning",
    },
    model: "claude-opus-4-8",
    timeoutMs: 30_000,
    promptCachingEnabled: true,
    degraded: false,
    ...overrides,
  };
}

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => null,
    },
    body: null,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

function createSseResponse(frames: string[]) {
  const encoded = new TextEncoder().encode(frames.join(""));
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => "text/event-stream",
    },
    body: (async function* () {
      yield encoded;
    })(),
    text: async () => frames.join(""),
    json: async () => ({}),
  };
}

describe("AnthropicLlmGatewayProvider", () => {
  it("sends prompt caching via Anthropic content blocks instead of a top-level cache_control field", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        model: "claude-opus-4-8",
        content: [{ type: "text", text: "ok" }],
        usage: {
          input_tokens: 12,
          output_tokens: 4,
        },
      }),
    );
    const provider = new AnthropicLlmGatewayProvider(createConfig(), fetchImpl);

    await provider.chat(createResolvedRequest());

    const [, init] = fetchImpl.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as {
      system?: Array<{ type: string; text?: string; cache_control?: unknown }>;
      messages: Array<{
        role: string;
        content: Array<{
          type: string;
          text?: string;
          cache_control?: unknown;
        }>;
      }>;
      cache_control?: unknown;
    };

    expect(body.cache_control).toBeUndefined();
    expect(body.system).toEqual([
      {
        type: "text",
        text: "You are a concise assistant.",
      },
    ]);
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Summarize fleet status",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ]);
  });

  it("captures streaming usage from Anthropic SSE events in the final response", async () => {
    const fetchImpl = vi.fn(async () =>
      createSseResponse([
        "event: message_start\n",
        'data: {"type":"message_start","message":{"usage":{"input_tokens":11,"cache_creation_input_tokens":7}}}\n\n',
        "event: content_block_delta\n",
        'data: {"type":"content_block_delta","delta":{"text":"hel"}}\n\n',
        "event: message_delta\n",
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5,"cache_read_input_tokens":3}}\n\n',
      ]),
    );
    const provider = new AnthropicLlmGatewayProvider(createConfig(), fetchImpl);

    const events = [];
    for await (const event of provider.stream(createResolvedRequest())) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "text-delta",
        textDelta: "hel",
      },
      {
        type: "response",
        response: expect.objectContaining({
          text: "hel",
          usage: {
            inputTokens: 11,
            outputTokens: 5,
            cacheCreationInputTokens: 7,
            cacheReadInputTokens: 3,
          },
          stopReason: "end_turn",
        }),
      },
    ]);
  });
});
