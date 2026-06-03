import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  type LlmGatewayConfig,
  type LlmGatewayProvider,
  resolveLlmGatewayConfig,
} from "./llm-gateway-config";

export const LLM_GATEWAY_FETCH = Symbol("LLM_GATEWAY_FETCH");

export type LlmGatewayFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type LlmGatewayChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGatewayChatRequest = {
  messages: LlmGatewayChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export type LlmGatewayChatResponse = {
  provider: Exclude<LlmGatewayProvider, "mock">;
  model: string;
  text: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export class LlmGatewayError extends Error {
  constructor(
    readonly code:
      | "missing_api_key"
      | "provider_not_supported"
      | "provider_rate_limited"
      | "provider_quota_exceeded"
      | "provider_unavailable"
      | "provider_invalid_response",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmGatewayError";
  }
}

@Injectable()
export class LlmGatewayService {
  private readonly config: LlmGatewayConfig;

  constructor(
    @Optional()
    @Inject(LLM_GATEWAY_FETCH)
    private readonly fetchImpl: LlmGatewayFetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {
    this.config = resolveLlmGatewayConfig();
  }

  getConfig(): LlmGatewayConfig {
    return this.config;
  }

  isMockProvider(): boolean {
    return this.config.provider === "mock";
  }

  async completeChat(
    request: LlmGatewayChatRequest,
  ): Promise<LlmGatewayChatResponse> {
    if (this.config.provider === "mock") {
      throw new LlmGatewayError(
        "provider_not_supported",
        "Mock mode does not support live provider completions.",
      );
    }

    if (!this.config.apiKey && this.config.provider !== "ollama") {
      throw new LlmGatewayError(
        "missing_api_key",
        `LLM provider API key is missing for provider ${this.config.provider}.`,
      );
    }

    if (this.config.provider === "anthropic") {
      return this.completeAnthropic(request);
    }

    if (
      this.config.provider === "openai" ||
      this.config.provider === "openrouter" ||
      this.config.provider === "ollama"
    ) {
      return this.completeOpenAiCompatible(this.config.provider, request);
    }

    throw new LlmGatewayError(
      "provider_not_supported",
      `LLM provider ${this.config.provider} is not supported.`,
    );
  }

  private async completeOpenAiCompatible(
    provider: "openai" | "openrouter" | "ollama",
    request: LlmGatewayChatRequest,
  ): Promise<LlmGatewayChatResponse> {
    const endpoint = this.resolveOpenAiCompatibleEndpoint(provider);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: this.buildOpenAiCompatibleHeaders(),
      body: JSON.stringify({
        model: request.model || this.config.chatModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
        response_format: {
          type: "json_object",
        },
      }),
    });

    const payload = await this.parseJsonResponse(response);
    if (!response.ok) {
      throw this.toGatewayError(payload, response.status);
    }

    const text = this.extractOpenAiCompatibleText(payload);
    return {
      provider,
      model:
        this.readString(payload, "model") ||
        request.model ||
        this.config.chatModel,
      text,
      usage: {
        inputTokens: this.readNumber(payload, "usage", "prompt_tokens"),
        outputTokens: this.readNumber(payload, "usage", "completion_tokens"),
        totalTokens: this.readNumber(payload, "usage", "total_tokens"),
      },
    };
  }

  private async completeAnthropic(
    request: LlmGatewayChatRequest,
  ): Promise<LlmGatewayChatResponse> {
    const endpoint = this.resolveAnthropicEndpoint();
    const systemBlocks = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content);
    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model || this.config.chatModel,
        system: systemBlocks.join("\n\n"),
        messages,
        max_tokens: request.maxTokens ?? 900,
        temperature: request.temperature ?? 0.2,
      }),
    });

    const payload = await this.parseJsonResponse(response);
    if (!response.ok) {
      throw this.toGatewayError(payload, response.status);
    }

    const text = this.extractAnthropicText(payload);
    return {
      provider: "anthropic",
      model:
        this.readString(payload, "model") ||
        request.model ||
        this.config.chatModel,
      text,
      usage: {
        inputTokens: this.readNumber(payload, "usage", "input_tokens"),
        outputTokens: this.readNumber(payload, "usage", "output_tokens"),
        totalTokens: null,
      },
    };
  }

  private resolveOpenAiCompatibleEndpoint(
    provider: "openai" | "openrouter" | "ollama",
  ): string {
    const configuredBase = this.config.baseUrl?.replace(/\/+$/, "");
    if (configuredBase) {
      return configuredBase.endsWith("/chat/completions")
        ? configuredBase
        : `${configuredBase}/chat/completions`;
    }

    switch (provider) {
      case "openrouter":
        return "https://openrouter.ai/api/v1/chat/completions";
      case "ollama":
        return "http://127.0.0.1:11434/v1/chat/completions";
      case "openai":
      default:
        return "https://api.openai.com/v1/chat/completions";
    }
  }

  private resolveAnthropicEndpoint(): string {
    const configuredBase = this.config.baseUrl?.replace(/\/+$/, "");
    return configuredBase
      ? configuredBase.endsWith("/messages")
        ? configuredBase
        : `${configuredBase}/messages`
      : "https://api.anthropic.com/v1/messages";
  }

  private buildOpenAiCompatibleHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (this.config.apiKey) {
      headers.authorization = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private async parseJsonResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new LlmGatewayError(
        "provider_invalid_response",
        "LLM provider returned a non-JSON response.",
        response.status,
      );
    }
  }

  private extractOpenAiCompatibleText(payload: unknown): string {
    const choices =
      typeof payload === "object" &&
      payload !== null &&
      "choices" in payload &&
      Array.isArray((payload as { choices?: unknown }).choices)
        ? (payload as { choices: Array<Record<string, unknown>> }).choices
        : [];
    const firstChoice = choices[0];
    const message =
      firstChoice &&
      typeof firstChoice === "object" &&
      "message" in firstChoice &&
      typeof firstChoice.message === "object" &&
      firstChoice.message !== null
        ? (firstChoice.message as Record<string, unknown>)
        : null;
    const content =
      message && typeof message.content === "string" ? message.content : null;

    if (!content) {
      throw new LlmGatewayError(
        "provider_invalid_response",
        "LLM provider response did not include message content.",
      );
    }

    return content;
  }

  private extractAnthropicText(payload: unknown): string {
    const content =
      typeof payload === "object" &&
      payload !== null &&
      "content" in payload &&
      Array.isArray((payload as { content?: unknown }).content)
        ? (payload as { content: Array<Record<string, unknown>> }).content
        : [];
    const textBlocks = content
      .map((entry) =>
        entry.type === "text" && typeof entry.text === "string"
          ? entry.text
          : null,
      )
      .filter((entry): entry is string => Boolean(entry));

    if (textBlocks.length === 0) {
      throw new LlmGatewayError(
        "provider_invalid_response",
        "Anthropic provider response did not include text content.",
      );
    }

    return textBlocks.join("\n");
  }

  private toGatewayError(payload: unknown, status: number): LlmGatewayError {
    const message = this.extractErrorMessage(payload);
    const lowerMessage = message.toLowerCase();

    if (
      status === 401 ||
      status === 403 ||
      lowerMessage.includes("api key") ||
      lowerMessage.includes("authentication")
    ) {
      return new LlmGatewayError("missing_api_key", message, status);
    }

    if (status === 429) {
      return new LlmGatewayError(
        lowerMessage.includes("quota")
          ? "provider_quota_exceeded"
          : "provider_rate_limited",
        message,
        status,
      );
    }

    return new LlmGatewayError("provider_unavailable", message, status);
  }

  private extractErrorMessage(payload: unknown): string {
    if (typeof payload === "object" && payload !== null) {
      const nestedError =
        "error" in payload && typeof payload.error === "object"
          ? (payload.error as Record<string, unknown>)
          : null;
      const nestedMessage =
        nestedError && typeof nestedError.message === "string"
          ? nestedError.message
          : null;
      if (nestedMessage) {
        return nestedMessage;
      }

      if (typeof (payload as { message?: unknown }).message === "string") {
        return (payload as { message: string }).message;
      }
    }

    return "LLM provider request failed.";
  }

  private readString(payload: unknown, key: string): string | null {
    return typeof payload === "object" &&
      payload !== null &&
      typeof (payload as Record<string, unknown>)[key] === "string"
      ? ((payload as Record<string, unknown>)[key] as string)
      : null;
  }

  private readNumber(
    payload: unknown,
    containerKey: string,
    key: string,
  ): number | null {
    const container =
      typeof payload === "object" &&
      payload !== null &&
      containerKey in payload &&
      typeof (payload as Record<string, unknown>)[containerKey] === "object" &&
      (payload as Record<string, unknown>)[containerKey] !== null
        ? ((payload as Record<string, unknown>)[containerKey] as Record<
            string,
            unknown
          >)
        : null;

    return container && typeof container[key] === "number"
      ? (container[key] as number)
      : null;
  }
}
