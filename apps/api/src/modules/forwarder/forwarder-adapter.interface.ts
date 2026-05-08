import type {
  AdapterAuthStatus,
  AdapterCredentialStatus,
  AdapterHealthReason,
  AdapterHealthStatus,
  AdapterRateLimitStatus,
  AdapterWebhookStatus,
  ForwarderAdapterCapabilitySummary,
  PlatformCode,
} from "@drts/contracts";

export const FORWARDER_ADAPTERS = Symbol("FORWARDER_ADAPTERS");

export interface ForwarderAdapterActionResult {
  acknowledged: boolean;
  platformCode: PlatformCode;
  externalOrderId: string;
  detail?: string;
}

export interface ForwarderAdapterHeartbeatResult {
  acknowledged: boolean;
  platformCode: PlatformCode;
  checkedAt: string;
}

export interface ForwarderAdapterEarningsResult {
  platformCode: PlatformCode;
  currency: string;
  totalAmount: number;
  asOf: string;
}

export interface ForwarderAdapterAcceptInput {
  externalOrderId: string;
  driverId: string;
  payload?: Record<string, unknown>;
}

export interface ForwarderAdapterRejectInput {
  externalOrderId: string;
  reason: string;
  payload?: Record<string, unknown>;
}

export interface ForwarderAdapterCompleteInput {
  externalOrderId: string;
  payload?: Record<string, unknown>;
}

export interface ForwarderAdapterHeartbeatInput {
  payload?: Record<string, unknown>;
}

export interface ForwarderAdapterFetchEarningsInput {
  driverId?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface ForwarderAdapterWebhookVerificationInput {
  headers: Record<string, string | string[] | undefined>;
  payload: Record<string, unknown>;
}

export interface ForwarderAdapterWebhookVerificationResult {
  accepted: boolean;
  detail?: string;
  credentialStatus?: AdapterCredentialStatus;
  authStatus?: AdapterAuthStatus;
  webhookStatus?: AdapterWebhookStatus;
}

export interface ForwarderAdapterHealthSnapshot {
  status: AdapterHealthStatus;
  reason: AdapterHealthReason;
  credentialStatus: AdapterCredentialStatus;
  authStatus: AdapterAuthStatus;
  webhookStatus: AdapterWebhookStatus;
  rateLimitStatus: AdapterRateLimitStatus;
  message?: string | null;
  checkedAt?: string;
}

export interface ForwarderAdapterInterface {
  readonly platformCode: PlatformCode;
  readonly capabilitySummary: ForwarderAdapterCapabilitySummary;
  accept(
    input: ForwarderAdapterAcceptInput,
  ): Promise<ForwarderAdapterActionResult>;
  reject(
    input: ForwarderAdapterRejectInput,
  ): Promise<ForwarderAdapterActionResult>;
  complete(
    input: ForwarderAdapterCompleteInput,
  ): Promise<ForwarderAdapterActionResult>;
  heartbeat(
    input?: ForwarderAdapterHeartbeatInput,
  ): Promise<ForwarderAdapterHeartbeatResult>;
  fetchEarnings(
    input?: ForwarderAdapterFetchEarningsInput,
  ): Promise<ForwarderAdapterEarningsResult>;
  verifyWebhook?(
    input: ForwarderAdapterWebhookVerificationInput,
  ): Promise<ForwarderAdapterWebhookVerificationResult>;
  getHealthSnapshot?(): Promise<ForwarderAdapterHealthSnapshot>;
}
