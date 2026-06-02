export type LlmGatewayProvider = string;

export type LlmGatewayConfig = {
  enabled: boolean;
  provider: LlmGatewayProvider;
  requestedProvider: LlmGatewayProvider;
  apiKey?: string;
  chatModel: string;
  summarizerModel: string;
  dailyBudgetUsd: number;
  requestsPerMinute: number;
  inputTokensPerMinute: number;
  outputTokensPerMinute: number;
  transcriptRetentionDays: number;
};

type EnvLike = NodeJS.ProcessEnv;

const DEFAULT_PROVIDER = "mock";
const DEFAULT_CHAT_MODEL = "mock-chat-v1";
const DEFAULT_SUMMARIZER_MODEL = "mock-summary-v1";
const DEFAULT_DAILY_BUDGET_USD = 25;
const DEFAULT_REQUESTS_PER_MINUTE = 30;
const DEFAULT_INPUT_TOKENS_PER_MINUTE = 120_000;
const DEFAULT_OUTPUT_TOKENS_PER_MINUTE = 16_000;
const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 30;

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
  envName: string,
): boolean {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${envName} must be "true" or "false" when provided`);
}

function parsePositiveNumber(
  value: string | undefined,
  defaultValue: number,
  envName: string,
): number {
  const normalized = normalizeString(value);
  if (!normalized) {
    return defaultValue;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive number when provided`);
  }

  return parsed;
}

function isLocalOrCiRuntime(env: EnvLike): boolean {
  return env.NODE_ENV !== "production" || env.CI === "true";
}

export function resolveLlmGatewayConfig(env: EnvLike = process.env): LlmGatewayConfig {
  const enabled = parseBoolean(
    env.PLATFORM_ADMIN_ASSISTANT_ENABLED,
    false,
    "PLATFORM_ADMIN_ASSISTANT_ENABLED",
  );
  const requestedProvider =
    normalizeString(env.LLM_GATEWAY_PROVIDER)?.toLowerCase() || DEFAULT_PROVIDER;
  const apiKey = normalizeString(env.LLM_GATEWAY_API_KEY);
  const allowMockFallback = !enabled || isLocalOrCiRuntime(env);

  let provider = requestedProvider;

  if (provider !== DEFAULT_PROVIDER && !apiKey) {
    if (!allowMockFallback) {
      throw new Error(
        "LLM_GATEWAY_API_KEY is required when PLATFORM_ADMIN_ASSISTANT_ENABLED=true and LLM_GATEWAY_PROVIDER is not mock in production",
      );
    }

    provider = DEFAULT_PROVIDER;
  }

  return {
    enabled,
    provider,
    requestedProvider,
    ...(apiKey ? { apiKey } : {}),
    chatModel: normalizeString(env.LLM_GATEWAY_CHAT_MODEL) || DEFAULT_CHAT_MODEL,
    summarizerModel:
      normalizeString(env.LLM_GATEWAY_SUMMARIZER_MODEL) ||
      DEFAULT_SUMMARIZER_MODEL,
    dailyBudgetUsd: parsePositiveNumber(
      env.LLM_GATEWAY_DAILY_BUDGET_USD,
      DEFAULT_DAILY_BUDGET_USD,
      "LLM_GATEWAY_DAILY_BUDGET_USD",
    ),
    requestsPerMinute: parsePositiveNumber(
      env.LLM_GATEWAY_REQUESTS_PER_MINUTE,
      DEFAULT_REQUESTS_PER_MINUTE,
      "LLM_GATEWAY_REQUESTS_PER_MINUTE",
    ),
    inputTokensPerMinute: parsePositiveNumber(
      env.LLM_GATEWAY_INPUT_TOKENS_PER_MINUTE,
      DEFAULT_INPUT_TOKENS_PER_MINUTE,
      "LLM_GATEWAY_INPUT_TOKENS_PER_MINUTE",
    ),
    outputTokensPerMinute: parsePositiveNumber(
      env.LLM_GATEWAY_OUTPUT_TOKENS_PER_MINUTE,
      DEFAULT_OUTPUT_TOKENS_PER_MINUTE,
      "LLM_GATEWAY_OUTPUT_TOKENS_PER_MINUTE",
    ),
    transcriptRetentionDays: parsePositiveNumber(
      env.LLM_GATEWAY_TRANSCRIPT_RETENTION_DAYS,
      DEFAULT_TRANSCRIPT_RETENTION_DAYS,
      "LLM_GATEWAY_TRANSCRIPT_RETENTION_DAYS",
    ),
  };
}
