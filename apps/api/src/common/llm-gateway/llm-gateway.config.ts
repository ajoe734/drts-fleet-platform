import type { LlmGatewayConfig } from "./llm-gateway.types";

function readBoolean(value: string | undefined, defaultValue: boolean) {
  if (value == null) {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return defaultValue;
  }
}

function readNumber(value: string | undefined, defaultValue: number) {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function readLlmGatewayConfig(env: NodeJS.ProcessEnv): LlmGatewayConfig {
  const config: LlmGatewayConfig = {
    provider: "anthropic",
    reasoningModel: env.OPS_ASSISTANT_MODEL ?? "claude-opus-4-8",
    cheapModel: env.OPS_ASSISTANT_CHEAP_MODEL ?? "claude-haiku-4-5",
    timeoutMs: readNumber(env.OPS_ASSISTANT_TIMEOUT_MS, 30_000),
    maxRetries: readNumber(env.OPS_ASSISTANT_MAX_RETRIES, 2),
    monthlyTokenBudget: Math.max(
      0,
      readNumber(env.OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET, 0),
    ),
    promptCachingEnabled: readBoolean(env.OPS_ASSISTANT_PROMPT_CACHING, true),
    killSwitchEnabled: readBoolean(env.OPS_ASSISTANT_KILL_SWITCH, false),
    vertexRegion: env.OPS_ASSISTANT_VERTEX_REGION ?? "global",
  };

  if (env.ANTHROPIC_API_KEY) {
    config.anthropicApiKey = env.ANTHROPIC_API_KEY;
  }

  const vertexProjectId =
    env.OPS_ASSISTANT_VERTEX_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT;
  if (vertexProjectId) {
    config.vertexProjectId = vertexProjectId;
  }

  return config;
}
