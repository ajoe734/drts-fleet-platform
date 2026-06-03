export interface LlmGatewayConfig {
  enabled: boolean;
  provider: "claude";
  defaultModel: string;
  reasoningModel: string;
  cheapModel: string;
  monthlyTokenBudget: number;
  promptCaching: boolean;
  timeoutMs: number;
  maxRetries: number;
  defaultMaxOutputTokens: number;
  defaultTemperature: number;
  anthropicApiKey: string | null;
  vertexProjectId: string | null;
  vertexRegion: string;
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parsePositiveInteger(
  value: string | null | undefined,
  fallback: number,
) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseNumber(value: string | null | undefined, fallback: number) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value: string | null | undefined, fallback: boolean) {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function resolveLlmGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmGatewayConfig {
  const defaultModel =
    normalizeString(env.OPS_ASSISTANT_MODEL) ?? "claude-opus-4-8";
  const reasoningModel =
    normalizeString(env.OPS_ASSISTANT_REASONING_MODEL) ?? defaultModel;

  return {
    enabled: parseBoolean(env.OPS_ASSISTANT_ENABLED, true),
    provider: "claude",
    defaultModel,
    reasoningModel,
    cheapModel:
      normalizeString(env.OPS_ASSISTANT_CHEAP_MODEL) ?? "claude-haiku-4-5",
    monthlyTokenBudget: parsePositiveInteger(
      env.OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET,
      Number.POSITIVE_INFINITY,
    ),
    promptCaching: parseBoolean(env.OPS_ASSISTANT_PROMPT_CACHING, true),
    timeoutMs: parsePositiveInteger(env.OPS_ASSISTANT_TIMEOUT_MS, 30_000),
    maxRetries: parsePositiveInteger(env.OPS_ASSISTANT_MAX_RETRIES, 2),
    defaultMaxOutputTokens: parsePositiveInteger(
      env.OPS_ASSISTANT_MAX_OUTPUT_TOKENS,
      1_024,
    ),
    defaultTemperature: parseNumber(env.OPS_ASSISTANT_TEMPERATURE, 0.2),
    anthropicApiKey: normalizeString(env.ANTHROPIC_API_KEY),
    vertexProjectId:
      normalizeString(env.OPS_ASSISTANT_VERTEX_PROJECT_ID) ??
      normalizeString(env.GOOGLE_CLOUD_PROJECT),
    vertexRegion: normalizeString(env.OPS_ASSISTANT_VERTEX_REGION) ?? "global",
  };
}
