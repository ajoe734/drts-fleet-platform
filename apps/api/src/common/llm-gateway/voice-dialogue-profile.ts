import { LlmGatewayError } from "./llm-gateway.service";
import type { LlmGatewayProvider } from "./llm-gateway-config";

export type VoiceDialogueProviderType = Exclude<LlmGatewayProvider, "openclaw">;

export interface VoiceDialogueProfileConfig {
  profileVersion: number;
  provider: VoiceDialogueProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
  maxToolIterations: number;
  dailyBudgetUsd: number;
  requestsPerMinute: number;
  inputTokensPerMinute: number;
  outputTokensPerMinute: number;
  allowMockInProduction: false;
  isProduction: boolean;
}

export interface ResolveVoiceDialogueProfileOptions {
  env?: NodeJS.ProcessEnv;
  profileVersion?: number;
}

const DEFAULT_VOICE_PROFILE_VERSION = 1;
const DEFAULT_VOICE_TIMEOUT_MS = 8_000;
const DEFAULT_VOICE_MAX_TOOL_ITERATIONS = 3;
const DEFAULT_VOICE_DAILY_BUDGET_USD = 100;
const DEFAULT_VOICE_REQUESTS_PER_MINUTE = 60;
const DEFAULT_VOICE_INPUT_TOKENS_PER_MINUTE = 200_000;
const DEFAULT_VOICE_OUTPUT_TOKENS_PER_MINUTE = 30_000;

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parsePositiveNumber(
  value: string | undefined,
  defaultValue: number,
  paramName: string,
): number {
  const normalized = normalizeString(value);
  if (!normalized) {
    return defaultValue;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${paramName} must be a positive number when provided`);
  }
  return parsed;
}

/**
 * SD §3.5: Voice dialogue configuration resolution.
 * Reuses the transport/secret pattern from the shared gateway, but does NOT
 * share the ops assistant's rate limits, mock fallback, or fixed token rates.
 * In production, mock providers are strictly forbidden ("正式 voice profile 禁用 mock，
 * production 不使用 synthetic gateway 回覆冒充完成").
 */
export function resolveVoiceDialogueConfig(
  options: ResolveVoiceDialogueProfileOptions = {},
): VoiceDialogueProfileConfig {
  const env = options.env ?? process.env;
  const isProduction = env.NODE_ENV === "production";

  const requestedProvider = (
    normalizeString(env.VOICE_LLM_PROVIDER) ||
    normalizeString(env.LLM_GATEWAY_PROVIDER) ||
    (isProduction ? "openai" : "mock")
  ).toLowerCase() as VoiceDialogueProviderType;

  const apiKey =
    normalizeString(env.VOICE_LLM_API_KEY) ||
    normalizeString(env.OPENAI_API_KEY) ||
    normalizeString(env.ANTHROPIC_API_KEY) ||
    normalizeString(env.LLM_GATEWAY_API_KEY);

  const baseUrl =
    normalizeString(env.VOICE_LLM_BASE_URL) ||
    normalizeString(env.LLM_GATEWAY_BASE_URL);

  const model =
    normalizeString(env.VOICE_LLM_MODEL) ||
    (requestedProvider === "anthropic"
      ? "claude-3-5-sonnet-20241022"
      : requestedProvider === "openai"
      ? "gpt-4o"
      : "mock-voice-v1");

  // Production Gate: SD §3.5 & Acceptance: "正式 voice profile 禁用 mock，production 不使用 synthetic gateway 回覆冒充完成"
  if (isProduction && requestedProvider === "mock") {
    throw new LlmGatewayError(
      "provider_not_supported",
      "Production voice profile strictly forbids mock or synthetic providers; live voice provider configuration is required.",
    );
  }

  if (
    isProduction &&
    !apiKey &&
    requestedProvider !== "ollama"
  ) {
    throw new LlmGatewayError(
      "missing_api_key",
      `Voice LLM provider API key is missing for provider ${requestedProvider} in production.`,
    );
  }

  return {
    profileVersion: options.profileVersion ?? DEFAULT_VOICE_PROFILE_VERSION,
    provider: requestedProvider,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    timeoutMs: parsePositiveNumber(
      env.VOICE_LLM_TIMEOUT_MS,
      DEFAULT_VOICE_TIMEOUT_MS,
      "VOICE_LLM_TIMEOUT_MS",
    ),
    maxToolIterations: parsePositiveNumber(
      env.VOICE_LLM_MAX_TOOL_ITERATIONS,
      DEFAULT_VOICE_MAX_TOOL_ITERATIONS,
      "VOICE_LLM_MAX_TOOL_ITERATIONS",
    ),
    dailyBudgetUsd: parsePositiveNumber(
      env.VOICE_LLM_DAILY_BUDGET_USD,
      DEFAULT_VOICE_DAILY_BUDGET_USD,
      "VOICE_LLM_DAILY_BUDGET_USD",
    ),
    requestsPerMinute: parsePositiveNumber(
      env.VOICE_LLM_REQUESTS_PER_MINUTE,
      DEFAULT_VOICE_REQUESTS_PER_MINUTE,
      "VOICE_LLM_REQUESTS_PER_MINUTE",
    ),
    inputTokensPerMinute: parsePositiveNumber(
      env.VOICE_LLM_INPUT_TOKENS_PER_MINUTE,
      DEFAULT_VOICE_INPUT_TOKENS_PER_MINUTE,
      "VOICE_LLM_INPUT_TOKENS_PER_MINUTE",
    ),
    outputTokensPerMinute: parsePositiveNumber(
      env.VOICE_LLM_OUTPUT_TOKENS_PER_MINUTE,
      DEFAULT_VOICE_OUTPUT_TOKENS_PER_MINUTE,
      "VOICE_LLM_OUTPUT_TOKENS_PER_MINUTE",
    ),
    allowMockInProduction: false,
    isProduction,
  };
}
