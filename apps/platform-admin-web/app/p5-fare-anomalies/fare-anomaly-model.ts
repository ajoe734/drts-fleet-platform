import {
  FARE_QUOTE_ANOMALIES,
  type FareQuoteAnomaly,
  type FareQuoteAnomalyAdminView,
  type FareQuoteAnomalyListReadModel,
  type FareQuoteAnomalyResourceReadModel,
  type EmptyStateEnvelope,
  type ResourceActionDescriptor,
} from "@drts/contracts";

export type FareAnomalyPageState =
  | "permission_denied"
  | "loading"
  | "error"
  | "empty"
  | "ready";

export const FARE_ANOMALY_REASON_COPY: Record<
  FareQuoteAnomaly,
  { title: string; guidance: string }
> = {
  quote_provider_unavailable: {
    title: "暫時無法取得預估車資",
    guidance: "等待報價服務恢復後，依伺服器提供的動作重新取得報價。",
  },
  quote_out_of_range: {
    title: "預估車資超出可接受範圍",
    guidance: "需由費率政策流程確認，不可人工輸入替代金額。",
  },
  route_unresolved: {
    title: "尚無法確認預估路線",
    guidance: "先完成路線解析，再依伺服器提供的動作重新取得報價。",
  },
  fare_policy_missing: {
    title: "目前沒有可用的生效費率",
    guidance: "需先完成費率生效流程，不可套用草稿或人工金額。",
  },
  calculation_mismatch: {
    title: "車資計算結果需要重新確認",
    guidance: "重新計算只能由正式報價服務執行，不可直接修改結果。",
  },
};

export function resolveFareAnomalyPageState(input: {
  canRead: boolean;
  loading: boolean;
  error: string | null;
  itemCount: number;
}): FareAnomalyPageState {
  if (!input.canRead) return "permission_denied";
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (input.itemCount === 0) return "empty";
  return "ready";
}

export function hasFareAnomalyReadScope(scopes: readonly string[]) {
  return scopes.includes("foundation:read");
}

export function hasFareAnomalyWriteScope(scopes: readonly string[]) {
  return scopes.includes("foundation:write");
}

export function resolveRetryAction(
  item: FareQuoteAnomalyAdminView,
  canWrite: boolean,
): ResourceActionDescriptor | null {
  const serverAction =
    item.availableActions.find((action) => action.action === "retry_quote") ??
    null;
  if (!serverAction) return null;
  if (!canWrite) {
    return {
      ...serverAction,
      enabled: false,
      disabledReasonCode: "PERMISSION_DENIED",
    };
  }
  return { ...serverAction };
}

export function formatFareMinor(value: number | null) {
  if (value === null) return "未取得";
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(value / 100)}`;
}

export function formatRoute(item: FareQuoteAnomalyAdminView) {
  const pickup =
    item.snapshot.pickup.maskedAddress ??
    item.snapshot.pickup.addressName ??
    item.snapshot.pickup.address;
  const dropoff =
    item.snapshot.dropoff.maskedAddress ??
    item.snapshot.dropoff.addressName ??
    item.snapshot.dropoff.address;
  return `${pickup} → ${dropoff}`;
}

export function parseFareAnomalyListReadModel(
  value: unknown,
): FareQuoteAnomalyListReadModel {
  if (!isObject(value) || !Array.isArray(value.items)) {
    throw new Error("FARE_ANOMALY_RESPONSE_INVALID");
  }
  const items = value.items.map(parseFareAnomalyItem);
  if (!isRefresh(value.refresh)) {
    throw new Error("FARE_ANOMALY_REFRESH_INVALID");
  }
  const emptyState = parseEmptyState(value.emptyState);
  return {
    items,
    refresh: value.refresh,
    ...(emptyState ? { emptyState } : {}),
  };
}

export function parseFareAnomalyResourceReadModel(
  value: unknown,
): FareQuoteAnomalyResourceReadModel {
  if (!isObject(value) || !isRefresh(value.refresh)) {
    throw new Error("FARE_ANOMALY_RESPONSE_INVALID");
  }
  return {
    item: parseFareAnomalyItem(value.item),
    refresh: value.refresh,
  };
}

function parseFareAnomalyItem(value: unknown): FareQuoteAnomalyAdminView {
  if (
    !isObject(value) ||
    !FARE_QUOTE_ANOMALIES.includes(value.reason as FareQuoteAnomaly) ||
    !isObject(value.snapshot) ||
    typeof value.snapshot.quoteSnapshotId !== "string" ||
    typeof value.snapshot.orderId !== "string" ||
    !isObject(value.snapshot.pickup) ||
    !isObject(value.snapshot.dropoff) ||
    !Array.isArray(value.availableActions) ||
    typeof value.recoveryPending !== "boolean" ||
    (value.lastRecoveryRequestedAt !== null &&
      typeof value.lastRecoveryRequestedAt !== "string")
  ) {
    throw new Error("FARE_ANOMALY_ITEM_INVALID");
  }
  if (value.snapshot.passengerConfirmedAt !== null) {
    throw new Error("FARE_ANOMALY_CONFIRMED_SNAPSHOT_REJECTED");
  }
  if (!value.availableActions.every(isActionDescriptor)) {
    throw new Error("FARE_ANOMALY_ACTION_AUTHORITY_INVALID");
  }
  return structuredClone(value) as unknown as FareQuoteAnomalyAdminView;
}

function parseEmptyState(value: unknown): EmptyStateEnvelope | null {
  if (value === undefined) return null;
  if (
    !isObject(value) ||
    typeof value.reason !== "string" ||
    typeof value.messageCode !== "string"
  ) {
    throw new Error("FARE_ANOMALY_EMPTY_STATE_INVALID");
  }
  return structuredClone(value) as unknown as EmptyStateEnvelope;
}

function isActionDescriptor(value: unknown): value is ResourceActionDescriptor {
  return (
    isObject(value) &&
    typeof value.action === "string" &&
    typeof value.enabled === "boolean" &&
    ["low", "medium", "high"].includes(String(value.riskLevel)) &&
    (value.disabledReasonCode === undefined ||
      typeof value.disabledReasonCode === "string")
  );
}

function isRefresh(
  value: unknown,
): value is FareQuoteAnomalyListReadModel["refresh"] {
  return (
    isObject(value) &&
    typeof value.generatedAt === "string" &&
    typeof value.staleAfterMs === "number" &&
    typeof value.dataFreshness === "string" &&
    typeof value.source === "string"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
