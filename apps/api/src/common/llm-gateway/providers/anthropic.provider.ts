import { Logger } from "@nestjs/common";
import { GoogleAuth } from "google-auth-library";

import { LlmGatewayProviderError } from "../llm-gateway.errors";
import type {
  LlmGatewayConfig,
  LlmGatewayProvider,
  LlmGatewayResponse,
  LlmGatewayStreamEvent,
  LlmGatewayUsage,
  ResolvedLlmGatewayRequest,
} from "../llm-gateway.types";

interface FetchHeaders {
  get(name: string): string | null;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  headers: FetchHeaders;
  body?: AsyncIterable<Uint8Array> | null;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FetchResponse>;

interface AnthropicContentBlock {
  type: string;
  text?: string;
  cache_control?: {
    type: "ephemeral";
  };
}

interface AnthropicMessageResponse {
  model?: string;
  stop_reason?: string;
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface AnthropicStreamEventPayload {
  type?: string;
  delta?: {
    text?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  message?: AnthropicMessageResponse;
}

export class AnthropicLlmGatewayProvider implements LlmGatewayProvider {
  readonly name = "anthropic" as const;
  private readonly logger = new Logger(AnthropicLlmGatewayProvider.name);
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: LlmGatewayConfig,
    fetchImpl?: FetchLike,
  ) {
    this.fetchImpl =
      fetchImpl ??
      ((input, init) =>
        globalThis.fetch(input, init as never) as Promise<FetchResponse>);
  }

  async chat(request: ResolvedLlmGatewayRequest): Promise<LlmGatewayResponse> {
    const response = await this.sendRequest(request, false);
    const payload = (await response.json()) as AnthropicMessageResponse;

    return this.buildResponse(request, payload, this.extractText(payload));
  }

  async *stream(
    request: ResolvedLlmGatewayRequest,
  ): AsyncIterable<LlmGatewayStreamEvent> {
    const response = await this.sendRequest(request, true);
    if (!response.body) {
      throw new LlmGatewayProviderError("Anthropic stream body was empty");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let usage: LlmGatewayUsage = { inputTokens: 0, outputTokens: 0 };
    let stopReason: LlmGatewayResponse["stopReason"] = "end_turn";

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        for (const event of this.parseStreamFrame(frame, {
          text,
          usage,
          stopReason,
        })) {
          text = event.text;
          usage = event.usage;
          stopReason = event.stopReason;
          if (event.streamEvent) {
            yield event.streamEvent;
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      for (const event of this.parseStreamFrame(buffer, {
        text,
        usage,
        stopReason,
      })) {
        text = event.text;
        usage = event.usage;
        stopReason = event.stopReason;
        if (event.streamEvent) {
          yield event.streamEvent;
        }
      }
    }

    const finalResponse: LlmGatewayResponse = {
      provider: this.name,
      model: request.model,
      text,
      usage,
      degraded: request.degraded,
      stopReason,
    };
    if (request.degradedReason) {
      finalResponse.degradedReason = request.degradedReason;
    }

    yield {
      type: "response",
      response: finalResponse,
    };
  }

  private async sendRequest(
    request: ResolvedLlmGatewayRequest,
    stream: boolean,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const authHeaders = await this.buildAuthHeaders();
      const endpoint = this.buildEndpoint(request.model, stream);
      const body = this.buildRequestBody(request, stream);
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new LlmGatewayProviderError(
          `Anthropic request failed with status ${response.status}: ${raw}`,
          response.status,
          this.isRetryableStatus(response.status),
        );
      }

      return response;
    } catch (error) {
      if (error instanceof LlmGatewayProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmGatewayProviderError(
          `Anthropic request timed out after ${request.timeoutMs}ms`,
          408,
          true,
        );
      }

      throw new LlmGatewayProviderError(
        error instanceof Error ? error.message : "Unknown Anthropic error",
        undefined,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async buildAuthHeaders() {
    if (this.config.anthropicApiKey) {
      return {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": this.config.anthropicApiKey,
      };
    }

    if (!this.config.vertexProjectId) {
      throw new LlmGatewayProviderError(
        "OPS_ASSISTANT_VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required when ANTHROPIC_API_KEY is not set",
      );
    }

    const accessToken = await this.auth.getAccessToken();
    if (!accessToken) {
      throw new LlmGatewayProviderError(
        "Failed to obtain Vertex AI access token from ADC",
      );
    }

    return {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    };
  }

  private buildEndpoint(model: string, stream: boolean) {
    if (this.config.anthropicApiKey) {
      return "https://api.anthropic.com/v1/messages";
    }

    const region = this.config.vertexRegion ?? "global";
    const method = stream ? "streamRawPredict" : "rawPredict";

    return `https://${region}-aiplatform.googleapis.com/v1/projects/${this.config.vertexProjectId}/locations/${region}/publishers/anthropic/models/${model}:${method}`;
  }

  private buildRequestBody(
    request: ResolvedLlmGatewayRequest,
    stream: boolean,
  ) {
    const messages = request.request.messages.map(
      (message, index, allMessages) => {
        const isLastMessage = index === allMessages.length - 1;
        return {
          role: message.role,
          content: [
            this.buildTextContentBlock(
              message.content,
              request.promptCachingEnabled && isLastMessage,
            ),
          ],
        };
      },
    );

    const body: Record<string, unknown> = {
      messages,
      max_tokens: request.request.maxOutputTokens,
      temperature: request.request.temperature,
      metadata: request.request.metadata,
      stream,
    };

    if (request.request.system) {
      body.system = [
        this.buildTextContentBlock(
          request.request.system,
          request.promptCachingEnabled && messages.length === 0,
        ),
      ];
    }

    if (this.config.anthropicApiKey) {
      body.model = request.model;
    } else {
      body.anthropic_version = "vertex-2023-10-16";
    }

    return body;
  }

  private buildTextContentBlock(
    text: string,
    enableCaching: boolean,
  ): AnthropicContentBlock {
    const block: AnthropicContentBlock = {
      type: "text",
      text,
    };

    if (enableCaching) {
      block.cache_control = { type: "ephemeral" };
    }

    return block;
  }

  private buildResponse(
    request: ResolvedLlmGatewayRequest,
    payload: AnthropicMessageResponse,
    text: string,
  ): LlmGatewayResponse {
    const usage: LlmGatewayUsage = {
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
    };
    if (payload.usage?.cache_creation_input_tokens != null) {
      usage.cacheCreationInputTokens =
        payload.usage.cache_creation_input_tokens;
    }
    if (payload.usage?.cache_read_input_tokens != null) {
      usage.cacheReadInputTokens = payload.usage.cache_read_input_tokens;
    }

    const response: LlmGatewayResponse = {
      provider: this.name,
      model: payload.model ?? request.model,
      text,
      usage,
      degraded: request.degraded,
      stopReason: this.mapStopReason(payload.stop_reason),
    };

    if (request.degradedReason) {
      response.degradedReason = request.degradedReason;
    }

    return response;
  }

  private extractText(payload: AnthropicMessageResponse) {
    return (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
  }

  private parseSseFrame(frame: string) {
    const dataLines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join("\n");
    if (payload === "[DONE]") {
      return null;
    }

    try {
      return JSON.parse(payload) as AnthropicStreamEventPayload;
    } catch (error) {
      this.logger.warn(
        `Failed to parse Anthropic stream event: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return null;
    }
  }

  private *parseStreamFrame(
    frame: string,
    state: {
      text: string;
      usage: LlmGatewayUsage;
      stopReason: LlmGatewayResponse["stopReason"];
    },
  ): Iterable<{
    text: string;
    usage: LlmGatewayUsage;
    stopReason: LlmGatewayResponse["stopReason"];
    streamEvent?: LlmGatewayStreamEvent;
  }> {
    const payload = this.parseSseFrame(frame);
    if (!payload) {
      return;
    }

    let text = state.text;
    let usage = this.mergeUsage(state.usage, payload.usage);
    usage = this.mergeUsage(usage, payload.message?.usage);

    let stopReason = state.stopReason;
    if (payload.delta?.stop_reason) {
      stopReason = this.mapStopReason(payload.delta.stop_reason);
    } else if (payload.message?.stop_reason) {
      stopReason = this.mapStopReason(payload.message.stop_reason);
    }

    if (payload.type === "content_block_delta" && payload.delta?.text) {
      text += payload.delta.text;
      yield {
        text,
        usage,
        stopReason,
        streamEvent: {
          type: "text-delta",
          textDelta: payload.delta.text,
        },
      };
      return;
    }

    yield {
      text,
      usage,
      stopReason,
    };
  }

  private mergeUsage(
    current: LlmGatewayUsage,
    next:
      | AnthropicStreamEventPayload["usage"]
      | AnthropicMessageResponse["usage"]
      | undefined,
  ): LlmGatewayUsage {
    const usage: LlmGatewayUsage = {
      inputTokens: next?.input_tokens ?? current.inputTokens,
      outputTokens: next?.output_tokens ?? current.outputTokens,
    };

    const cacheCreationInputTokens =
      next?.cache_creation_input_tokens ?? current.cacheCreationInputTokens;
    if (cacheCreationInputTokens != null) {
      usage.cacheCreationInputTokens = cacheCreationInputTokens;
    }

    const cacheReadInputTokens =
      next?.cache_read_input_tokens ?? current.cacheReadInputTokens;
    if (cacheReadInputTokens != null) {
      usage.cacheReadInputTokens = cacheReadInputTokens;
    }

    return usage;
  }

  private mapStopReason(
    reason: string | undefined,
  ): LlmGatewayResponse["stopReason"] {
    switch (reason) {
      case "max_tokens":
      case "stop_sequence":
      case "end_turn":
        return reason;
      default:
        return "end_turn";
    }
  }

  private isRetryableStatus(status: number) {
    return [408, 409, 429, 500, 502, 503, 504].includes(status);
  }
}
