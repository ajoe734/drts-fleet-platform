import { Inject, Injectable } from "@nestjs/common";

import { resolveLlmGatewayConfig } from "./llm-gateway.config";
import { InMemoryLlmGatewayBudgetTracker } from "./llm-gateway.budget-tracker";
import { LLM_GATEWAY_PROVIDER } from "./llm-gateway.tokens";
import type {
  LlmGatewayBudgetSnapshot,
  LlmGatewayBudgetTracker,
  LlmGatewayChatRequest,
  LlmGatewayChatResponse,
  LlmGatewayProvider,
  LlmGatewayProviderRequest,
  LlmGatewayProviderResponse,
  LlmGatewayStreamEvent,
} from "./llm-gateway.types";

@Injectable()
export class LlmGatewayService {
  private readonly config = resolveLlmGatewayConfig();
  private readonly budgetTracker: LlmGatewayBudgetTracker =
    new InMemoryLlmGatewayBudgetTracker();

  constructor(
    @Inject(LLM_GATEWAY_PROVIDER)
    private readonly provider: LlmGatewayProvider,
  ) {}

  async chat(request: LlmGatewayChatRequest): Promise<LlmGatewayChatResponse> {
    const attempt = this.prepareAttempt(request);
    if (attempt.staticResponse) {
      return attempt.staticResponse;
    }

    try {
      const response = await this.provider.chat(attempt.providerRequest);
      this.budgetTracker.recordUsage(response.usage);

      return {
        provider: this.provider.providerName,
        model: response.model,
        text: response.text,
        stopReason: response.stopReason,
        usage: response.usage,
        degraded: attempt.degraded,
        degradedReason: attempt.degradedReason,
      };
    } catch {
      return this.chatWithFallback(
        request,
        attempt.degradedReason ?? "provider_error",
      );
    }
  }

  async *stream(
    request: LlmGatewayChatRequest,
  ): AsyncIterable<LlmGatewayStreamEvent> {
    const attempt = this.prepareAttempt(request);
    if (attempt.staticResponse) {
      yield {
        type: "chunk",
        provider: attempt.staticResponse.provider,
        model: attempt.staticResponse.model,
        text: attempt.staticResponse.text,
        degraded: attempt.staticResponse.degraded,
        degradedReason: attempt.staticResponse.degradedReason,
      };
      yield {
        type: "message",
        response: attempt.staticResponse,
      };
      return;
    }

    try {
      let response: LlmGatewayChatResponse | null = null;
      for await (const event of this.provider.stream(attempt.providerRequest)) {
        if (event.type === "chunk") {
          yield {
            type: "chunk",
            provider: this.provider.providerName,
            model: attempt.providerRequest.model,
            text: event.text,
            degraded: attempt.degraded,
            degradedReason: attempt.degradedReason,
          };
          continue;
        }

        response = this.toChatResponse(
          event.response,
          attempt.degraded,
          attempt.degradedReason,
        );
      }

      const finalResponse =
        response ??
        this.toChatResponse(
          {
            model: attempt.providerRequest.model,
            text: "",
            stopReason: null,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
            },
          } satisfies LlmGatewayProviderResponse,
          attempt.degraded,
          attempt.degradedReason,
        );

      this.budgetTracker.recordUsage(finalResponse.usage);

      yield {
        type: "message",
        response: finalResponse,
      };
    } catch {
      const fallback = await this.chatWithFallback(
        request,
        attempt.degradedReason ?? "provider_error",
      );
      yield {
        type: "chunk",
        provider: fallback.provider,
        model: fallback.model,
        text: fallback.text,
        degraded: fallback.degraded,
        degradedReason: fallback.degradedReason,
      };
      yield {
        type: "message",
        response: fallback,
      };
    }
  }

  getBudgetSnapshot(): LlmGatewayBudgetSnapshot {
    return this.budgetTracker.getSnapshot(this.config.monthlyTokenBudget);
  }

  private prepareAttempt(request: LlmGatewayChatRequest) {
    if (!this.config.enabled) {
      return {
        providerRequest: null,
        degraded: true,
        degradedReason: "kill_switch_enabled",
        staticResponse: this.createStaticDegradedResponse(
          "kill_switch_enabled",
        ),
      };
    }

    const budgetSnapshot = this.budgetTracker.getSnapshot(
      this.config.monthlyTokenBudget,
    );

    let degraded = false;
    let degradedReason: string | null = null;
    let model = this.resolveModel(request.purpose);

    if (budgetSnapshot.remainingTokens <= 0) {
      if (model !== this.config.cheapModel) {
        model = this.config.cheapModel;
        degraded = true;
        degradedReason = "budget_exceeded";
      } else {
        return {
          providerRequest: null,
          degraded: true,
          degradedReason: "budget_exceeded",
          staticResponse: this.createStaticDegradedResponse("budget_exceeded"),
        };
      }
    }

    return {
      providerRequest: this.createProviderRequest(request, model),
      degraded,
      degradedReason,
      staticResponse: null,
    };
  }

  private async chatWithFallback(
    request: LlmGatewayChatRequest,
    reason: string,
  ) {
    const currentModel = this.resolveModel(request.purpose);
    if (currentModel !== this.config.cheapModel) {
      try {
        const response = await this.provider.chat(
          this.createProviderRequest(request, this.config.cheapModel),
        );
        this.budgetTracker.recordUsage(response.usage);

        return {
          provider: this.provider.providerName,
          model: response.model,
          text: response.text,
          stopReason: response.stopReason,
          usage: response.usage,
          degraded: true,
          degradedReason: reason,
        } satisfies LlmGatewayChatResponse;
      } catch {
        return this.createStaticDegradedResponse(reason);
      }
    }

    return this.createStaticDegradedResponse(reason);
  }

  private resolveModel(purpose: LlmGatewayChatRequest["purpose"]) {
    return purpose === "cheap"
      ? this.config.cheapModel
      : this.config.reasoningModel;
  }

  private createStaticDegradedResponse(reason: string): LlmGatewayChatResponse {
    return {
      provider: "gateway",
      model: "degraded-fallback",
      text: "The ops assistant is temporarily running in degraded mode. Please retry with a narrower request or use the manual ops flow.",
      stopReason: "degraded_fallback",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      degraded: true,
      degradedReason: reason,
    };
  }

  private toChatResponse(
    response: LlmGatewayProviderResponse,
    degraded: boolean,
    degradedReason: string | null,
  ): LlmGatewayChatResponse {
    return {
      provider: this.provider.providerName,
      model: response.model,
      text: response.text,
      stopReason: response.stopReason,
      usage: response.usage,
      degraded,
      degradedReason,
    };
  }

  private createProviderRequest(
    request: LlmGatewayChatRequest,
    model: string,
  ): LlmGatewayProviderRequest {
    return {
      model,
      messages: request.messages,
      maxOutputTokens:
        request.maxOutputTokens ?? this.config.defaultMaxOutputTokens,
      temperature: request.temperature ?? this.config.defaultTemperature,
      promptCaching: this.config.promptCaching,
      ...(request.metadata ? { metadata: request.metadata } : {}),
    };
  }
}
