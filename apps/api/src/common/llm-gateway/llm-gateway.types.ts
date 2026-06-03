export type LlmGatewayProviderName = "claude";

export type LlmGatewayRequestPurpose = "reasoning" | "cheap";

export type LlmGatewayMessageRole = "system" | "user" | "assistant";

export interface LlmGatewayMessage {
  role: LlmGatewayMessageRole;
  content: string;
}

export interface LlmGatewayUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface LlmGatewayChatRequest {
  messages: LlmGatewayMessage[];
  purpose?: LlmGatewayRequestPurpose;
  maxOutputTokens?: number;
  temperature?: number;
  metadata?: Record<string, string>;
}

export interface LlmGatewayChatResponse {
  provider: LlmGatewayProviderName | "gateway";
  model: string;
  text: string;
  stopReason: string | null;
  usage: LlmGatewayUsage;
  degraded: boolean;
  degradedReason: string | null;
}

export interface LlmGatewayStreamChunkEvent {
  type: "chunk";
  provider: LlmGatewayProviderName | "gateway";
  model: string;
  text: string;
  degraded: boolean;
  degradedReason: string | null;
}

export interface LlmGatewayStreamMessageEvent {
  type: "message";
  response: LlmGatewayChatResponse;
}

export type LlmGatewayStreamEvent =
  | LlmGatewayStreamChunkEvent
  | LlmGatewayStreamMessageEvent;

export interface LlmGatewayBudgetSnapshot {
  monthKey: string;
  usedTokens: number;
  budgetTokens: number;
  remainingTokens: number;
}

export interface LlmGatewayProviderRequest {
  model: string;
  messages: LlmGatewayMessage[];
  maxOutputTokens: number;
  temperature: number;
  metadata?: Record<string, string>;
  promptCaching: boolean;
}

export interface LlmGatewayProviderResponse {
  model: string;
  text: string;
  stopReason: string | null;
  usage: LlmGatewayUsage;
}

export interface LlmGatewayProviderStreamChunk {
  type: "chunk";
  text: string;
}

export interface LlmGatewayProviderStreamResponse {
  type: "response";
  response: LlmGatewayProviderResponse;
}

export type LlmGatewayProviderStreamEvent =
  | LlmGatewayProviderStreamChunk
  | LlmGatewayProviderStreamResponse;

export interface LlmGatewayProvider {
  readonly providerName: LlmGatewayProviderName;
  chat(request: LlmGatewayProviderRequest): Promise<LlmGatewayProviderResponse>;
  stream(
    request: LlmGatewayProviderRequest,
  ): AsyncIterable<LlmGatewayProviderStreamEvent>;
}

export interface LlmGatewayBudgetTracker {
  getSnapshot(budgetTokens: number): LlmGatewayBudgetSnapshot;
  recordUsage(usage: LlmGatewayUsage): LlmGatewayBudgetSnapshot;
}
