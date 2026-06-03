export type LlmGatewayProviderName = "anthropic";
export type LlmGatewayAuthMode = "anthropic_api_key" | "vertex_adc";
export type LlmGatewayTaskTier = "reasoning" | "cheap";
export type LlmGatewayStopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "budget_guard"
  | "kill_switch"
  | "error";

export interface LlmGatewayMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmGatewayUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface LlmGatewayRequest {
  system?: string;
  messages: LlmGatewayMessage[];
  maxOutputTokens: number;
  temperature?: number;
  taskTier?: LlmGatewayTaskTier;
  metadata?: Record<string, string>;
}

export interface LlmGatewayResponse {
  provider: LlmGatewayProviderName;
  model: string;
  text: string;
  usage: LlmGatewayUsage;
  degraded: boolean;
  degradedReason?: string;
  stopReason: LlmGatewayStopReason;
}

export type LlmGatewayStreamEvent =
  | {
      type: "text-delta";
      textDelta: string;
    }
  | {
      type: "response";
      response: LlmGatewayResponse;
    };

export interface LlmGatewayConfig {
  provider: LlmGatewayProviderName;
  reasoningModel: string;
  cheapModel: string;
  timeoutMs: number;
  maxRetries: number;
  monthlyTokenBudget: number;
  promptCachingEnabled: boolean;
  killSwitchEnabled: boolean;
  anthropicApiKey?: string;
  vertexProjectId?: string;
  vertexRegion?: string;
}

export interface ResolvedLlmGatewayRequest {
  request: LlmGatewayRequest;
  model: string;
  timeoutMs: number;
  promptCachingEnabled: boolean;
  degraded: boolean;
  degradedReason?: string;
}

export interface LlmGatewayProvider {
  readonly name: LlmGatewayProviderName;
  chat(request: ResolvedLlmGatewayRequest): Promise<LlmGatewayResponse>;
  stream(
    request: ResolvedLlmGatewayRequest,
  ): AsyncIterable<LlmGatewayStreamEvent>;
}
