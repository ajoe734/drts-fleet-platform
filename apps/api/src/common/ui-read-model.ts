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

export interface UiReadModelListOptions {
  staleAfterMs: number;
  dataFreshness?: UiRefreshMetadata["dataFreshness"];
  source?: UiRefreshMetadata["source"];
  emptyState?: EmptyStateEnvelope;
  generatedAt?: string;
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
