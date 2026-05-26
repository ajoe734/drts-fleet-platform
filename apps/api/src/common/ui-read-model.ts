import type {
  EmptyReason,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";

export interface UiReadModelList<T> {
  items: T[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
}

export interface UiReadModelListOptions {
  staleAfterMs: number;
  dataFreshness?: UiRefreshMetadata["dataFreshness"];
  source?: UiRefreshMetadata["source"];
  emptyState?: EmptyStateEnvelope;
  generatedAt?: string;
}

export interface UiReadModelEnvelope<T> {
  data: T;
  refresh: UiRefreshMetadata;
  health: UiHealthEnvelope;
}

export interface UiReadModelEnvelopeOptions extends Omit<
  UiReadModelListOptions,
  "emptyState"
> {
  health?: Partial<UiHealthEnvelope>;
}

export function buildUiReadModelList<T>(
  items: T[],
  options: UiReadModelListOptions,
): UiReadModelList<T> {
  const refresh = buildUiRefreshMetadata(options);
  return {
    items,
    refresh,
    ...(items.length === 0 && options.emptyState
      ? { emptyState: options.emptyState }
      : {}),
  };
}

export function buildUiReadModelEnvelope<T>(
  data: T,
  options: UiReadModelEnvelopeOptions,
): UiReadModelEnvelope<T> {
  return {
    data,
    refresh: buildUiRefreshMetadata(options),
    health: buildUiHealthEnvelope(options.health),
  };
}

export function buildUiRefreshMetadata(
  options: Omit<UiReadModelListOptions, "emptyState">,
): UiRefreshMetadata {
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    staleAfterMs: options.staleAfterMs,
    dataFreshness: options.dataFreshness ?? "fresh",
    source: options.source ?? "live",
  };
}

export function buildUiHealthEnvelope(
  health?: Partial<UiHealthEnvelope>,
): UiHealthEnvelope {
  return {
    status: health?.status ?? "healthy",
    degradedServices: health?.degradedServices ?? [],
    lastCheckedAt: health?.lastCheckedAt ?? new Date().toISOString(),
  };
}

export function buildEmptyStateEnvelope(
  reason: EmptyReason,
  messageCode: string,
  nextAction?: ResourceActionDescriptor,
): EmptyStateEnvelope {
  return {
    reason,
    messageCode,
    ...(nextAction ? { nextAction } : {}),
  };
}
