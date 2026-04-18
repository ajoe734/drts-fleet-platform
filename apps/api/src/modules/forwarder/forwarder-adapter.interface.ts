export const FORWARDER_ADAPTERS = Symbol("FORWARDER_ADAPTERS");

export interface ForwarderAdapterActionResult {
  acknowledged: boolean;
  platformCode: string;
  externalOrderId: string;
  detail?: string;
}

export interface ForwarderAdapterHeartbeatResult {
  acknowledged: boolean;
  platformCode: string;
  checkedAt: string;
}

export interface ForwarderAdapterEarningsResult {
  platformCode: string;
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

export interface ForwarderAdapterInterface {
  readonly platformCode: string;
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
}
