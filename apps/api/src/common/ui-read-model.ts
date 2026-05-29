import type {
  EmptyReason,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";

export interface UiReadModelList<T> {
  items: T[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
}

export interface UiReadModelResource<T> {
  item: T;
  refresh: UiRefreshMetadata;
}

export interface UiReadModelOptions {
  staleAfterMs: number;
  dataFreshness?: UiRefreshMetadata["dataFreshness"];
  source?: UiRefreshMetadata["source"];
  generatedAt?: string;
}

export interface UiReadModelListOptions extends UiReadModelOptions {
  emptyState?: EmptyStateEnvelope;
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

export function buildUiReadModelResource<T>(
  item: T,
  options: UiReadModelOptions,
): UiReadModelResource<T> {
  return {
    item,
    refresh: buildUiRefreshMetadata(options),
  };
}

export function buildUiRefreshMetadata(
  options: UiReadModelOptions,
): UiRefreshMetadata {
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    staleAfterMs: options.staleAfterMs,
    dataFreshness: options.dataFreshness ?? "fresh",
    source: options.source ?? "live",
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
