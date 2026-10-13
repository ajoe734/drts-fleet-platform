export type ThrottleRequest = {
  headers?: Record<string, unknown>;
  url?: string;
  identity?: {
    realm?: unknown;
    actorType?: unknown;
    actorId?: unknown;
    tenantId?: unknown;
  };
};
export type ThrottleResponse = {
  statusCode: number;
  once(event: "finish", callback: () => void): unknown;
};
export type ThrottleObservationSummary = {
  clockOriginMs: number;
  startedAt: string;
  storageType: string;
  calls: number;
  inboundRequests: number;
  completedResponses: number;
  correlatedCalls: number;
  events: number;
  observedEntries: number;
  dropped: number;
  recordingFailures: number;
  restorationFailures: number;
  stopped: boolean;
  complete: boolean;
  scope: string;
};
export type CapacityThrottleObserver = {
  admission: {
    tryReserve(
      family: "booking" | "dispatch" | "report",
      requestId: string,
    ): {
      allowed?: boolean;
      reservedMs?: number;
      waitMs?: number;
      error?: string;
    };
    complete(requestId: string): {
      error: string | null;
      guardMs?: number | null;
      keyHash?: string | null;
      result?: { totalHits: number; isBlocked: boolean } | null;
    };
  };
  middleware(
    request: ThrottleRequest,
    response: ThrottleResponse,
    next: () => unknown,
  ): unknown;
  stop(): void;
  assertComplete(options?: { requireOwnedTraffic?: boolean }): void;
  summary(): ThrottleObservationSummary;
  snapshot(): ThrottleObservationSummary & { trace: Record<string, unknown>[] };
};
export function observeCapacityThrottle(
  storage: unknown,
  runTag: string,
  maxEvents?: number,
): CapacityThrottleObserver;
