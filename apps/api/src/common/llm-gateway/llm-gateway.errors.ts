export class LlmGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class LlmGatewayDisabledError extends LlmGatewayError {}
export class LlmGatewayBudgetExceededError extends LlmGatewayError {}

export class LlmGatewayProviderError extends LlmGatewayError {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}
