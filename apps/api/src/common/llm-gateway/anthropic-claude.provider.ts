import { GoogleAuth } from "google-auth-library";
import { Inject, Injectable, Optional } from "@nestjs/common";

import type { LlmGatewayConfig } from "./llm-gateway.config";
import { resolveLlmGatewayConfig } from "./llm-gateway.config";
import { LLM_GATEWAY_FETCH } from "./llm-gateway.tokens";
import type {
  LlmGatewayProvider,
  LlmGatewayProviderRequest,
  LlmGatewayProviderResponse,
  LlmGatewayProviderStreamEvent,
  LlmGatewayUsage,
} from "./llm-gateway.types";

type GatewayFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "body" | "json" | "ok" | "status">>;

interface AnthropicTransport {
  label: "anthropic_api_key" | "vertex_adc";
  buildRequest(
    model: string,
    stream: boolean,
    body: Record<string, unknown>,
  ): Promise<{ url: string; init: RequestInit }>;
}

class AnthropicApiKeyTransport implements AnthropicTransport {
  readonly label = "anthropic_api_key" as const;

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async buildRequest(
    _model: string,
    _stream: boolean,
    body: Record<string, unknown>,
  ) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    };
  }
}

class VertexAdcTransport implements AnthropicTransport {
  readonly label = "vertex_adc" as const;

  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  constructor(
    private readonly projectId: string,
    private readonly region: string,
    private readonly timeoutMs: number,
  ) {}

  async buildRequest(
    model: string,
    stream: boolean,
    body: Record<string, unknown>,
  ) {
    const client = await this.auth.getClient();
    const headers = await client.getRequestHeaders();

    return {
      url: `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models/${model}:${stream ? "streamRawPredict" : "rawPredict"}`,
      init: {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          anthropic_version: "vertex-2023-10-16",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    };
  }
}

function extractText(content: unknown) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (
        block &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text;
      }

      return "";
    })
    .join("");
}

function normalizeUsage(input: Record<string, unknown> | null | undefined) {
  const usage = input ?? {};

  return {
    inputTokens:
      typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens:
      typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
    cacheCreationInputTokens:
      typeof usage.cache_creation_input_tokens === "number"
        ? usage.cache_creation_input_tokens
        : 0,
    cacheReadInputTokens:
      typeof usage.cache_read_input_tokens === "number"
        ? usage.cache_read_input_tokens
        : 0,
  } satisfies LlmGatewayUsage;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function readErrorMessage(response: {
  json: () => Promise<unknown>;
  status: number;
}) {
  try {
    const payload = (await response.json()) as
      | { error?: { message?: string } }
      | undefined;
    return (
      payload?.error?.message ??
      `LLM provider request failed (${response.status})`
    );
  } catch {
    return `LLM provider request failed (${response.status})`;
  }
}

async function* parseServerSentEvents(
  body: ReadableStream<Uint8Array> | null | undefined,
) {
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary === -1) {
        break;
      }

      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const line of dataLines) {
        if (line === "[DONE]") {
          return;
        }

        yield JSON.parse(line) as Record<string, unknown>;
      }
    }
  }
}

@Injectable()
export class AnthropicClaudeProvider implements LlmGatewayProvider {
  readonly providerName = "claude" as const;

  constructor(
    @Optional()
    @Inject(LLM_GATEWAY_FETCH)
    private readonly fetchImpl: GatewayFetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {}

  async chat(
    request: LlmGatewayProviderRequest,
  ): Promise<LlmGatewayProviderResponse> {
    const config = resolveLlmGatewayConfig();
    const body = this.buildRequestBody(request, false);
    const response = await this.executeWithRetry(
      config,
      request.model,
      false,
      body,
    );
    const payload = (await response.json()) as Record<string, unknown>;

    return {
      model: typeof payload.model === "string" ? payload.model : request.model,
      text: extractText(payload.content),
      stopReason:
        typeof payload.stop_reason === "string" ? payload.stop_reason : null,
      usage: normalizeUsage(
        payload.usage as Record<string, unknown> | undefined,
      ),
    };
  }

  async *stream(
    request: LlmGatewayProviderRequest,
  ): AsyncIterable<LlmGatewayProviderStreamEvent> {
    const config = resolveLlmGatewayConfig();
    const body = this.buildRequestBody(request, true);
    const response = await this.executeWithRetry(
      config,
      request.model,
      true,
      body,
    );

    let model = request.model;
    let stopReason: string | null = null;
    let usage: LlmGatewayUsage = {
      inputTokens: 0,
      outputTokens: 0,
    };
    let text = "";

    for await (const event of parseServerSentEvents(response.body)) {
      if (event.type === "message_start") {
        const message = (
          event.message && typeof event.message === "object"
            ? event.message
            : {}
        ) as Record<string, unknown>;
        if (typeof message.model === "string") {
          model = message.model;
        }
        usage = normalizeUsage(
          message.usage as Record<string, unknown> | undefined,
        );
        continue;
      }

      if (event.type === "message_delta") {
        if (typeof event.stop_reason === "string") {
          stopReason = event.stop_reason;
        }
        usage = normalizeUsage(
          event.usage as Record<string, unknown> | undefined,
        );
        continue;
      }

      if (event.type !== "content_block_delta") {
        continue;
      }

      const delta = event.delta;
      if (
        delta &&
        typeof delta === "object" &&
        "type" in delta &&
        delta.type === "text_delta" &&
        "text" in delta &&
        typeof delta.text === "string"
      ) {
        text += delta.text;
        yield { type: "chunk", text: delta.text };
      }
    }

    yield {
      type: "response",
      response: {
        model,
        text,
        stopReason,
        usage,
      },
    };
  }

  private buildRequestBody(
    request: LlmGatewayProviderRequest,
    stream: boolean,
  ) {
    return {
      model: request.model,
      stream,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
      messages: request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      system: request.messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n"),
      metadata: request.metadata,
      cache_control: request.promptCaching ? { type: "ephemeral" } : undefined,
    };
  }

  private async executeWithRetry(
    config: LlmGatewayConfig,
    model: string,
    stream: boolean,
    body: Record<string, unknown>,
  ) {
    const transport = this.resolveTransport(config);
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < config.maxRetries) {
      attempt += 1;

      try {
        const request = await transport.buildRequest(model, stream, body);
        const response = await this.fetchImpl(request.url, request.init);

        if (response.ok) {
          return response;
        }

        const message = await readErrorMessage(response);
        if (
          !isRetryableStatus(response.status) ||
          attempt >= config.maxRetries
        ) {
          throw new Error(message);
        }

        lastError = new Error(message);
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Unknown LLM provider error");
        if (attempt >= config.maxRetries) {
          break;
        }
      }
    }

    throw lastError ?? new Error("LLM provider request failed");
  }

  private resolveTransport(config: LlmGatewayConfig): AnthropicTransport {
    if (config.anthropicApiKey) {
      return new AnthropicApiKeyTransport(
        config.anthropicApiKey,
        config.timeoutMs,
      );
    }

    if (config.vertexProjectId) {
      return new VertexAdcTransport(
        config.vertexProjectId,
        config.vertexRegion,
        config.timeoutMs,
      );
    }

    throw new Error(
      "Configure either ANTHROPIC_API_KEY or OPS_ASSISTANT_VERTEX_PROJECT_ID/GOOGLE_CLOUD_PROJECT before using the LLM gateway.",
    );
  }
}
