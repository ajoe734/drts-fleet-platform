import type {
  ActionReceipt,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";

type UiMutationMetadata<T> = T & {
  availableActions: ResourceActionDescriptor[];
  receipt: ActionReceipt;
  refresh: UiRefreshMetadata;
};

type AttachUiMutationMetadataInput = {
  actionId: string;
  availableActions: ResourceActionDescriptor[];
  generatedAt?: string;
  message: string;
  resourceId: string;
  resourceType: string;
  staleAfterMs?: number;
  status?: ActionReceipt["status"];
};

export function createResourceActionDescriptor(
  action: string,
  options: {
    disabledReasonCode?: string;
    enabled?: boolean;
    requiresReason?: boolean;
    riskLevel?: ResourceActionDescriptor["riskLevel"];
  } = {},
): ResourceActionDescriptor {
  return {
    action,
    enabled: options.enabled ?? true,
    ...(options.disabledReasonCode
      ? { disabledReasonCode: options.disabledReasonCode }
      : {}),
    ...(options.requiresReason !== undefined
      ? { requiresReason: options.requiresReason }
      : {}),
    riskLevel: options.riskLevel ?? "low",
  };
}

export function createUiRefreshMetadata(
  options: {
    dataFreshness?: UiRefreshMetadata["dataFreshness"];
    generatedAt?: string;
    source?: UiRefreshMetadata["source"];
    staleAfterMs?: number;
  } = {},
): UiRefreshMetadata {
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    staleAfterMs: options.staleAfterMs ?? 30_000,
    dataFreshness: options.dataFreshness ?? "fresh",
    source: options.source ?? "live",
  };
}

export function attachUiMutationMetadata<T extends Record<string, unknown>>(
  resource: T,
  input: AttachUiMutationMetadataInput,
): UiMutationMetadata<T> {
  return {
    ...resource,
    availableActions: input.availableActions,
    receipt: {
      actionId: input.actionId,
      auditId: `audit:${input.actionId}:${input.resourceId}`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      status: input.status ?? "completed",
      message: input.message,
    },
    refresh: createUiRefreshMetadata({
      generatedAt: input.generatedAt,
      staleAfterMs: input.staleAfterMs,
    }),
  };
}
