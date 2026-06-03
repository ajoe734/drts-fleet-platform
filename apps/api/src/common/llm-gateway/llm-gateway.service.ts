import { Inject, Injectable, Logger } from "@nestjs/common";

import { LLM_GATEWAY_CONFIG, LLM_GATEWAY_PROVIDER } from "./llm-gateway.tokens";
import { LlmGatewayBudgetTracker } from "./llm-gateway.budget";
import {
  LlmGatewayBudgetExceededError,
  LlmGatewayDisabledError,
  LlmGatewayProviderError,
} from "./llm-gateway.errors";
import type {
  LlmGatewayConfig,
  LlmGatewayProvider,
  LlmGatewayRequest,
  LlmGatewayResponse,
  LlmGatewayStreamEvent,
  ResolvedLlmGatewayRequest,
} from "./llm-gateway.types";

@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private readonly budgetTracker: LlmGatewayBudgetTracker;

  constructor(
    @Inject(LLM_GATEWAY_PROVIDER)
    private readonly provider: LlmGatewayProvider,
    @Inject(LLM_GATEWAY_CONFIG)
    private readonly config: LlmGatewayConfig,
  ) {
    this.budgetTracker = new LlmGatewayBudgetTracker(config.monthlyTokenBudget);
  }

  async chat(request: LlmGatewayRequest): Promise<LlmGatewayResponse> {
    this.assertEnabled();

    const resolved = this.resolveRequest(request);
    const response = await this.runWithRetry(resolved, (current) =>
      this.provider.chat(current),
    );
    this.budgetTracker.recordUsage(response.usage);
    return response;
  }

  async *stream(
    request: LlmGatewayRequest,
  ): AsyncIterable<LlmGatewayStreamEvent> {
    this.assertEnabled();

    const resolved = this.resolveRequest(request);
    let finalResponse: LlmGatewayResponse | undefined;

    for await (const event of this.runStreamWithRetry(resolved)) {
      if (event.type === "response") {
        finalResponse = event.response;
      }
      yield event;
    }

    if (finalResponse) {
      this.budgetTracker.recordUsage(finalResponse.usage);
    }
  }

  getSpentTokens() {
    return this.budgetTracker.getSpentTokens();
  }

  private assertEnabled() {
    if (this.config.killSwitchEnabled) {
      throw new LlmGatewayDisabledError(
        "OPS_ASSISTANT_KILL_SWITCH is enabled; llm gateway is disabled",
      );
    }
  }

  private resolveRequest(
    request: LlmGatewayRequest,
  ): ResolvedLlmGatewayRequest {
    const preferredModel =
      request.taskTier === "cheap"
        ? this.config.cheapModel
        : this.config.reasoningModel;
    const estimatedTokens = this.budgetTracker.estimateRequestTokens(request);

    if (this.budgetTracker.canAfford(estimatedTokens)) {
      return {
        request,
        model: preferredModel,
        timeoutMs: this.config.timeoutMs,
        promptCachingEnabled: this.config.promptCachingEnabled,
        degraded: false,
      };
    }

    if (preferredModel !== this.config.cheapModel) {
      this.logger.warn(
        `Monthly budget guard degraded request from ${preferredModel} to ${this.config.cheapModel}`,
      );
      return {
        request: { ...request, taskTier: "cheap" },
        model: this.config.cheapModel,
        timeoutMs: this.config.timeoutMs,
        promptCachingEnabled: this.config.promptCachingEnabled,
        degraded: true,
        degradedReason: "monthly_budget_guard",
      };
    }

    throw new LlmGatewayBudgetExceededError(
      "OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET exceeded for cheap fallback model",
    );
  }

  private async runWithRetry<T>(
    request: ResolvedLlmGatewayRequest,
    operation: (request: ResolvedLlmGatewayRequest) => Promise<T>,
  ) {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await operation(request);
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof LlmGatewayProviderError) ||
          !error.retryable ||
          attempt === this.config.maxRetries
        ) {
          break;
        }
      }
    }

    if (request.model !== this.config.cheapModel) {
      const degradedRequest: ResolvedLlmGatewayRequest = {
        ...request,
        request: { ...request.request, taskTier: "cheap" },
        model: this.config.cheapModel,
        degraded: true,
        degradedReason: "provider_failure_fallback",
      };
      this.logger.warn(
        `Falling back to cheaper model ${this.config.cheapModel} after provider failure`,
      );
      return operation(degradedRequest);
    }

    throw lastError;
  }

  private async *runStreamWithRetry(
    request: ResolvedLlmGatewayRequest,
  ): AsyncIterable<LlmGatewayStreamEvent> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      let emittedAnyEvent = false;

      try {
        for await (const event of this.provider.stream(request)) {
          emittedAnyEvent = true;
          yield event;
        }
        return;
      } catch (error) {
        lastError = error;
        if (
          emittedAnyEvent ||
          !(error instanceof LlmGatewayProviderError) ||
          !error.retryable ||
          attempt === this.config.maxRetries
        ) {
          break;
        }
      }
    }

    if (request.model !== this.config.cheapModel) {
      const degradedRequest: ResolvedLlmGatewayRequest = {
        ...request,
        request: { ...request.request, taskTier: "cheap" },
        model: this.config.cheapModel,
        degraded: true,
        degradedReason: "provider_failure_fallback",
      };
      this.logger.warn(
        `Falling back to cheaper model ${this.config.cheapModel} after provider failure`,
      );

      for await (const event of this.provider.stream(degradedRequest)) {
        yield event;
      }
      return;
    }

    throw lastError;
  }
}
