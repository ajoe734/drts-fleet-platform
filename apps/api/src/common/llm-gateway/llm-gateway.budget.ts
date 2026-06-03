import type { LlmGatewayRequest, LlmGatewayUsage } from "./llm-gateway.types";

export class LlmGatewayBudgetTracker {
  private spentTokens = 0;

  constructor(private readonly monthlyTokenBudget: number) {}

  getSpentTokens() {
    return this.spentTokens;
  }

  isEnabled() {
    return this.monthlyTokenBudget > 0;
  }

  canAfford(estimatedTokens: number) {
    if (!this.isEnabled()) {
      return true;
    }

    return this.spentTokens + estimatedTokens <= this.monthlyTokenBudget;
  }

  recordUsage(usage: LlmGatewayUsage) {
    this.spentTokens +=
      usage.inputTokens +
      usage.outputTokens +
      (usage.cacheCreationInputTokens ?? 0) +
      (usage.cacheReadInputTokens ?? 0);
  }

  estimateRequestTokens(request: LlmGatewayRequest) {
    const systemLength = request.system?.length ?? 0;
    const messageLength = request.messages.reduce(
      (sum, message) => sum + message.content.length,
      0,
    );
    const promptTokens = Math.ceil((systemLength + messageLength) / 4);

    return promptTokens + request.maxOutputTokens;
  }
}
