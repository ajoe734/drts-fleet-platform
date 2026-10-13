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
  storageType: string;
  calls: number;
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
  middleware(
    request: ThrottleRequest,
    response: ThrottleResponse,
    next: () => unknown,
  ): unknown;
  stop(): void;
  assertComplete(): void;
  summary(): ThrottleObservationSummary;
  snapshot(): ThrottleObservationSummary & { trace: Record<string, unknown>[] };
};
export function observeCapacityThrottle(
  storage: unknown,
  runTag: string,
  maxEvents?: number,
): CapacityThrottleObserver;
