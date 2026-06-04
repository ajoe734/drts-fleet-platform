import { Inject, Injectable, Optional } from "@nestjs/common";

import { ApiRequestError } from "../api-envelope";
import {
  type LlmGatewayConfig,
  type LlmGatewayProvider,
  resolveLlmGatewayConfig,
} from "./llm-gateway-config";

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

export interface LlmGatewayUsageSnapshot {
  requestsInCurrentMinute: number;
  inputTokensInCurrentMinute: number;
  outputTokensInCurrentMinute: number;
  estimatedDailySpendUsd: number;
}

export interface ReserveLlmGatewayRequestInput {
  actorKey: string;
  requestText: string;
}

export interface ReserveLlmGatewayRequestReservation {
  actorKey: string;
  reservedAt: number;
  estimatedInputTokens: number;
  estimatedInputCostUsd: number;
}

export interface CompleteLlmGatewayRequestInput {
  reservation: ReserveLlmGatewayRequestReservation;
  responseText: string;
}

export interface LlmGatewayServiceOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  fetchImpl?: LlmGatewayFetch;
}

export const LLM_GATEWAY_SERVICE_OPTIONS = "LLM_GATEWAY_SERVICE_OPTIONS";

interface LlmGatewayActorUsage {
  requestHits: number[];
  inputTokenEvents: Array<{ timestamp: number; tokens: number }>;
  outputTokenEvents: Array<{ timestamp: number; tokens: number }>;
  dailySpendByDay: Map<string, number>;
}

const MINUTE_MS = 60_000;
const INPUT_COST_USD_PER_1K_TOKENS = 0.002;
const OUTPUT_COST_USD_PER_1K_TOKENS = 0.008;

function resolveConstructorOptions(
  arg?: LlmGatewayFetch | LlmGatewayServiceOptions,
): LlmGatewayServiceOptions {
  if (typeof arg === "function") {
    return { fetchImpl: arg };
  }

  return arg ?? {};
}

@Injectable()
export class LlmGatewayService {
  private readonly config: LlmGatewayConfig;
  private readonly now: () => number;
  private readonly fetchImpl: LlmGatewayFetch;
  private readonly usageByActor = new Map<string, LlmGatewayActorUsage>();

  constructor(
    @Optional()
    @Inject(LLM_GATEWAY_SERVICE_OPTIONS)
    arg?: LlmGatewayFetch | LlmGatewayServiceOptions,
  ) {
    const options = resolveConstructorOptions(arg);
    this.config = resolveLlmGatewayConfig(options.env);
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
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

  reserveRequest(
    input: ReserveLlmGatewayRequestInput,
  ): ReserveLlmGatewayRequestReservation {
    const usage = this.getUsage(input.actorKey);
    const now = this.now();

    this.pruneMinuteWindow(usage.requestHits, now);
    this.pruneTokenWindow(usage.inputTokenEvents, now);
    this.pruneTokenWindow(usage.outputTokenEvents, now);
    this.pruneDailySpend(usage, now);

    if (usage.requestHits.length >= this.config.requestsPerMinute) {
      throw new ApiRequestError(
        429,
        "ASSISTANT_RATE_LIMITED",
        "Platform Admin assistant request rate limit exceeded.",
        {
          actorKey: input.actorKey,
          limit: this.config.requestsPerMinute,
          windowMs: MINUTE_MS,
        },
      );
    }

    const estimatedInputTokens = this.estimateTokens(input.requestText);
    const minuteInputTokens = this.sumTokenWindow(usage.inputTokenEvents);
    if (
      minuteInputTokens + estimatedInputTokens >
      this.config.inputTokensPerMinute
    ) {
      throw new ApiRequestError(
        429,
        "ASSISTANT_INPUT_TOKEN_RATE_LIMITED",
        "Platform Admin assistant input token rate limit exceeded.",
        {
          actorKey: input.actorKey,
          limit: this.config.inputTokensPerMinute,
          windowMs: MINUTE_MS,
        },
      );
    }

    const estimatedInputCostUsd =
      (estimatedInputTokens / 1000) * INPUT_COST_USD_PER_1K_TOKENS;
    const dayKey = this.dayKey(now);
    const currentDailySpend = usage.dailySpendByDay.get(dayKey) ?? 0;
    if (
      currentDailySpend + estimatedInputCostUsd >
      this.config.dailyBudgetUsd
    ) {
      throw new ApiRequestError(
        429,
        "ASSISTANT_DAILY_BUDGET_EXCEEDED",
        "Platform Admin assistant daily budget exceeded.",
        {
          actorKey: input.actorKey,
          estimatedDailySpendUsd: currentDailySpend,
          dailyBudgetUsd: this.config.dailyBudgetUsd,
        },
      );
    }

    usage.requestHits.push(now);
    usage.inputTokenEvents.push({
      timestamp: now,
      tokens: estimatedInputTokens,
    });
    usage.dailySpendByDay.set(
      dayKey,
      currentDailySpend + estimatedInputCostUsd,
    );

    return {
      actorKey: input.actorKey,
      reservedAt: now,
      estimatedInputTokens,
      estimatedInputCostUsd,
    };
  }

  completeRequest(input: CompleteLlmGatewayRequestInput): void {
    const usage = this.getUsage(input.reservation.actorKey);
    const now = this.now();

    this.pruneTokenWindow(usage.outputTokenEvents, now);
    this.pruneDailySpend(usage, now);

    const estimatedOutputTokens = this.estimateTokens(input.responseText);
    const minuteOutputTokens = this.sumTokenWindow(usage.outputTokenEvents);
    if (
      minuteOutputTokens + estimatedOutputTokens >
      this.config.outputTokensPerMinute
    ) {
      throw new ApiRequestError(
        429,
        "ASSISTANT_OUTPUT_TOKEN_RATE_LIMITED",
        "Platform Admin assistant output token rate limit exceeded.",
        {
          actorKey: input.reservation.actorKey,
          limit: this.config.outputTokensPerMinute,
          windowMs: MINUTE_MS,
        },
      );
    }

    const outputCostUsd =
      (estimatedOutputTokens / 1000) * OUTPUT_COST_USD_PER_1K_TOKENS;
    const dayKey = this.dayKey(now);
    const currentDailySpend = usage.dailySpendByDay.get(dayKey) ?? 0;
    if (currentDailySpend + outputCostUsd > this.config.dailyBudgetUsd) {
      throw new ApiRequestError(
        429,
        "ASSISTANT_DAILY_BUDGET_EXCEEDED",
        "Platform Admin assistant daily budget exceeded.",
        {
          actorKey: input.reservation.actorKey,
          estimatedDailySpendUsd: currentDailySpend,
          dailyBudgetUsd: this.config.dailyBudgetUsd,
        },
      );
    }

    usage.outputTokenEvents.push({
      timestamp: now,
      tokens: estimatedOutputTokens,
    });
    usage.dailySpendByDay.set(dayKey, currentDailySpend + outputCostUsd);
  }

  getUsageSnapshot(actorKey: string): LlmGatewayUsageSnapshot {
    const usage = this.getUsage(actorKey);
    const now = this.now();
    this.pruneMinuteWindow(usage.requestHits, now);
    this.pruneTokenWindow(usage.inputTokenEvents, now);
    this.pruneTokenWindow(usage.outputTokenEvents, now);
    this.pruneDailySpend(usage, now);

    return {
      requestsInCurrentMinute: usage.requestHits.length,
      inputTokensInCurrentMinute: this.sumTokenWindow(usage.inputTokenEvents),
      outputTokensInCurrentMinute: this.sumTokenWindow(usage.outputTokenEvents),
      estimatedDailySpendUsd: usage.dailySpendByDay.get(this.dayKey(now)) ?? 0,
    };
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

    return {
      provider,
      model:
        this.readString(payload, "model") ||
        request.model ||
        this.config.chatModel,
      text: this.extractOpenAiCompatibleText(payload),
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

    return {
      provider: "anthropic",
      model:
        this.readString(payload, "model") ||
        request.model ||
        this.config.chatModel,
      text: this.extractAnthropicText(payload),
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
      typeof (firstChoice as { message?: unknown }).message === "object" &&
      (firstChoice as { message: Record<string, unknown> }).message !== null
        ? (firstChoice as { message: Record<string, unknown> }).message
        : null;

    const content = message ? message.content : null;
    if (typeof content === "string") {
      return content;
    }

    throw new LlmGatewayError(
      "provider_invalid_response",
      "LLM provider returned an unexpected chat completion payload.",
    );
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
      .map((block) => (typeof block?.text === "string" ? block.text : null))
      .filter((value): value is string => value !== null);

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }

    throw new LlmGatewayError(
      "provider_invalid_response",
      "Anthropic provider returned no text content.",
    );
  }

  private toGatewayError(payload: unknown, status: number): LlmGatewayError {
    const message =
      this.readString(payload, "error", "message") ||
      this.readString(payload, "message") ||
      "LLM provider request failed.";
    const normalized = message.toLowerCase();

    if (status === 429 && normalized.includes("quota")) {
      return new LlmGatewayError("provider_quota_exceeded", message, status);
    }
    if (status === 429) {
      return new LlmGatewayError("provider_rate_limited", message, status);
    }
    if (status >= 500) {
      return new LlmGatewayError("provider_unavailable", message, status);
    }

    return new LlmGatewayError("provider_invalid_response", message, status);
  }

  private readString(payload: unknown, ...path: string[]): string | null {
    let cursor: unknown = payload;
    for (const key of path) {
      if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
        return null;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }

    return typeof cursor === "string" ? cursor : null;
  }

  private readNumber(payload: unknown, ...path: string[]): number | null {
    let cursor: unknown = payload;
    for (const key of path) {
      if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
        return null;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }

    return typeof cursor === "number" && Number.isFinite(cursor)
      ? cursor
      : null;
  }

  private estimateTokens(text: string): number {
    const normalized = text.trim();
    if (!normalized) {
      return 1;
    }
    return Math.max(1, Math.ceil(normalized.length / 4));
  }

  private getUsage(actorKey: string): LlmGatewayActorUsage {
    let usage = this.usageByActor.get(actorKey);
    if (!usage) {
      usage = {
        requestHits: [],
        inputTokenEvents: [],
        outputTokenEvents: [],
        dailySpendByDay: new Map<string, number>(),
      };
      this.usageByActor.set(actorKey, usage);
    }
    return usage;
  }

  private pruneMinuteWindow(events: number[], now: number): void {
    const cutoff = now - MINUTE_MS;
    while (events.length > 0 && events[0]! <= cutoff) {
      events.shift();
    }
  }

  private pruneTokenWindow(
    events: Array<{ timestamp: number; tokens: number }>,
    now: number,
  ): void {
    const cutoff = now - MINUTE_MS;
    while (events.length > 0 && events[0]!.timestamp <= cutoff) {
      events.shift();
    }
  }

  private sumTokenWindow(
    events: Array<{ timestamp: number; tokens: number }>,
  ): number {
    return events.reduce((total, event) => total + event.tokens, 0);
  }

  private pruneDailySpend(usage: LlmGatewayActorUsage, now: number): void {
    const activeDay = this.dayKey(now);
    for (const day of usage.dailySpendByDay.keys()) {
      if (day !== activeDay) {
        usage.dailySpendByDay.delete(day);
      }
    }
  }

  private dayKey(timestampMs: number): string {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }
}
