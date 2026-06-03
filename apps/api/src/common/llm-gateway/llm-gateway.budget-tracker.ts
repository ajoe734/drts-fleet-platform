import type {
  LlmGatewayBudgetSnapshot,
  LlmGatewayBudgetTracker,
  LlmGatewayUsage,
} from "./llm-gateway.types";

function toMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function sumUsage(usage: LlmGatewayUsage) {
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.cacheCreationInputTokens ?? 0) +
    (usage.cacheReadInputTokens ?? 0)
  );
}

export class InMemoryLlmGatewayBudgetTracker implements LlmGatewayBudgetTracker {
  private monthKey = toMonthKey(new Date());
  private usedTokens = 0;

  getSnapshot(budgetTokens: number): LlmGatewayBudgetSnapshot {
    this.rotateIfNeeded();

    const remainingTokens = Number.isFinite(budgetTokens)
      ? Math.max(0, budgetTokens - this.usedTokens)
      : Number.POSITIVE_INFINITY;

    return {
      monthKey: this.monthKey,
      usedTokens: this.usedTokens,
      budgetTokens,
      remainingTokens,
    };
  }

  recordUsage(usage: LlmGatewayUsage) {
    this.rotateIfNeeded();
    this.usedTokens += sumUsage(usage);
    return this.getSnapshot(Number.POSITIVE_INFINITY);
  }

  private rotateIfNeeded() {
    const nextMonthKey = toMonthKey(new Date());
    if (nextMonthKey !== this.monthKey) {
      this.monthKey = nextMonthKey;
      this.usedTokens = 0;
    }
  }
}
