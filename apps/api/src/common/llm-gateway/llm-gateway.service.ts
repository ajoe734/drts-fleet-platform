import { Injectable } from "@nestjs/common";

import { ApiRequestError } from "../api-envelope";

import {
  type LlmGatewayConfig,
  resolveLlmGatewayConfig,
} from "./llm-gateway-config";

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
}

interface LlmGatewayActorUsage {
  requestHits: number[];
  inputTokenEvents: Array<{ timestamp: number; tokens: number }>;
  outputTokenEvents: Array<{ timestamp: number; tokens: number }>;
  dailySpendByDay: Map<string, number>;
}

const MINUTE_MS = 60_000;
const INPUT_COST_USD_PER_1K_TOKENS = 0.002;
const OUTPUT_COST_USD_PER_1K_TOKENS = 0.008;

@Injectable()
export class LlmGatewayService {
  private readonly config: LlmGatewayConfig;
  private readonly now: () => number;
  private readonly usageByActor = new Map<string, LlmGatewayActorUsage>();

  constructor(options: LlmGatewayServiceOptions = {}) {
    this.config = resolveLlmGatewayConfig(options.env);
    this.now = options.now ?? (() => Date.now());
  }

  getConfig(): LlmGatewayConfig {
    return this.config;
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
    usage.outputTokenEvents.push({
      timestamp: now,
      tokens: estimatedOutputTokens,
    });

    const outputCostUsd =
      (estimatedOutputTokens / 1000) * OUTPUT_COST_USD_PER_1K_TOKENS;
    const dayKey = this.dayKey(now);
    const currentDailySpend = usage.dailySpendByDay.get(dayKey) ?? 0;
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
