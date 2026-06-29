import type { ApiClient } from "@drts/api-client";
import type {
  EmptyStateEnvelope,
  OwnedOrderRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";

interface UiReadModelList<T> {
  items: T[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
}

interface UiReadModelResource<T> {
  item: T;
  refresh: UiRefreshMetadata;
}

export interface RocAlertReadModel {
  alertId: string;
  alertType: string;
  status: "open" | "acknowledged" | "resolved";
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  vehicleId: string | null;
  orderId: string | null;
  sandboxProgramId: string | null;
  openedAt: string;
  updatedAt: string;
  availableActions: readonly ResourceActionDescriptor[];
}

export interface RocTripReadModel {
  tripId: string;
  orderId: string | null;
  humanFallbackActive: boolean;
}

export type AvFallbackStage =
  | "triggered"
  | "reassigning"
  | "human_enroute"
  | "completed";

export interface AvFallbackMonitorItem {
  alert: RocAlertReadModel;
  order: OwnedOrderRecord | null;
  trip: RocTripReadModel | null;
  stage: AvFallbackStage;
  bookingContextId: string;
  passengerName: string;
  etaMinutes: number | null;
}

export interface AvFallbackRecoveryData {
  order: OwnedOrderRecord | null;
  orderRefresh: UiRefreshMetadata | null;
  alert: RocAlertReadModel | null;
  trip: RocTripReadModel | null;
  alertsRefresh: UiRefreshMetadata;
}

export interface SandboxExceptionData {
  alerts: RocAlertReadModel[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
  ordersById: Map<string, OwnedOrderRecord | null>;
  tripsByOrderId: Map<string, RocTripReadModel>;
}

export const AV_FALLBACK_STAGE_ORDER: readonly AvFallbackStage[] = [
  "triggered",
  "reassigning",
  "human_enroute",
  "completed",
] as const;

const MONITOR_ALERT_ACTIONS = [
  "fallback-to-human",
  "notify",
  "open-incident",
  "resolve",
  "ack",
  "assign",
  "operational-hold",
  "start-evidence-freeze",
  "stop-new-dispatch",
  "request-safety-action",
] as const;

const SANDBOX_EXCEPTION_ACTIONS = [
  "fallback-to-human",
  "resolve",
  "ack",
  "notify",
  "open-incident",
  "operational-hold",
  "start-evidence-freeze",
  "stop-new-dispatch",
  "request-safety-action",
  "assign",
] as const;

const HUMAN_ENROUTE_ORDER_STATUSES = new Set<OwnedOrderRecord["status"]>([
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

function matchesAvFallbackMonitorAlert(alert: RocAlertReadModel) {
  if (alert.alertType === "human_fallback") {
    return true;
  }

  return alert.availableActions.some(
    (descriptor) => descriptor.action === "fallback-to-human",
  );
}

function matchesSandboxExceptionAlert(alert: RocAlertReadModel) {
  if (alert.sandboxProgramId || alert.vehicleId) {
    return true;
  }

  return alert.availableActions.some((descriptor) =>
    SANDBOX_EXCEPTION_ACTIONS.includes(
      descriptor.action as (typeof SANDBOX_EXCEPTION_ACTIONS)[number],
    ),
  );
}

function buildTripsByOrderId(trips: RocTripReadModel[]) {
  return new Map(
    trips
      .filter((trip) => trip.orderId)
      .map((trip) => [trip.orderId!, trip] as const),
  );
}

function sortAlertsNewestFirst(left: RocAlertReadModel, right: RocAlertReadModel) {
  return right.updatedAt.localeCompare(left.updatedAt);
}

async function loadRocAlerts(client: ApiClient) {
  const envelope =
    await client.getEnvelope<UiReadModelList<RocAlertReadModel>>(
      "/api/roc/alerts",
    );
  return envelope.data;
}

async function loadRocTrips(client: ApiClient) {
  const envelope =
    await client.getEnvelope<UiReadModelList<RocTripReadModel>>("/api/roc/trips");
  return envelope.data;
}

async function loadOrder(
  client: ApiClient,
  orderId: string,
): Promise<{ order: OwnedOrderRecord | null; refresh: UiRefreshMetadata | null }> {
  try {
    const envelope =
      await client.getEnvelope<UiReadModelResource<OwnedOrderRecord>>(
        `/api/orders/${encodeURIComponent(orderId)}`,
      );
    return {
      order: envelope.data.item,
      refresh: envelope.data.refresh,
    };
  } catch {
    return {
      order: null,
      refresh: null,
    };
  }
}

async function loadOrdersByIds(client: ApiClient, orderIds: readonly string[]) {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueOrderIds.map(async (orderId) => {
      const { order } = await loadOrder(client, orderId);
      return [orderId, order] as const;
    }),
  );
  return new Map(entries);
}

function resolveMonitorStage(
  alert: RocAlertReadModel,
  order: OwnedOrderRecord | null,
  trip: RocTripReadModel | null,
): AvFallbackStage {
  if (order?.status === "completed" || alert.status === "resolved") {
    return "completed";
  }

  if (order && HUMAN_ENROUTE_ORDER_STATUSES.has(order.status)) {
    return "human_enroute";
  }

  if (trip?.humanFallbackActive || alert.alertType === "human_fallback") {
    return "reassigning";
  }

  return "triggered";
}

function resolvePassengerName(
  order: OwnedOrderRecord | null,
  alert: RocAlertReadModel,
) {
  return order?.passenger.name || order?.passenger.phone || alert.orderId || "—";
}

function resolveBookingContextId(
  order: OwnedOrderRecord | null,
  alert: RocAlertReadModel,
) {
  return order?.bookingId ?? order?.orderId ?? alert.orderId ?? alert.alertId;
}

function buildMonitorItems(
  alerts: RocAlertReadModel[],
  ordersById: Map<string, OwnedOrderRecord | null>,
  tripsByOrderId: Map<string, RocTripReadModel>,
): AvFallbackMonitorItem[] {
  return alerts
    .filter(matchesAvFallbackMonitorAlert)
    .sort(sortAlertsNewestFirst)
    .map((alert) => {
      const order = alert.orderId ? ordersById.get(alert.orderId) ?? null : null;
      const trip = alert.orderId ? tripsByOrderId.get(alert.orderId) ?? null : null;
      return {
        alert,
        order,
        trip,
        stage: resolveMonitorStage(alert, order, trip),
        bookingContextId: resolveBookingContextId(order, alert),
        passengerName: resolvePassengerName(order, alert),
        etaMinutes: order?.etaSnapshot?.etaMinutes ?? null,
      };
    });
}

function resolveRecoveryAlert(
  orderId: string,
  alerts: RocAlertReadModel[],
): RocAlertReadModel | null {
  const matchingAlerts = alerts
    .filter((alert) => alert.orderId === orderId)
    .sort(sortAlertsNewestFirst);

  return (
    matchingAlerts.find((alert) => alert.alertType === "human_fallback") ??
    matchingAlerts.find(matchesAvFallbackMonitorAlert) ??
    matchingAlerts[0] ??
    null
  );
}

export function resolveMonitorStageLabelKey(stage: AvFallbackStage) {
  switch (stage) {
    case "triggered":
      return "avFallback.stage.triggered";
    case "reassigning":
      return "avFallback.stage.reassigning";
    case "human_enroute":
      return "avFallback.stage.humanEnroute";
    case "completed":
      return "avFallback.stage.completed";
  }
}

export function resolveMonitorStageHelpKey(stage: AvFallbackStage) {
  switch (stage) {
    case "triggered":
      return "avFallback.stageHelp.triggered";
    case "reassigning":
      return "avFallback.stageHelp.reassigning";
    case "human_enroute":
      return "avFallback.stageHelp.humanEnroute";
    case "completed":
      return "avFallback.stageHelp.completed";
  }
}

export function selectAlertActions(
  alert: { availableActions: readonly ResourceActionDescriptor[] },
  allowed: readonly string[] = MONITOR_ALERT_ACTIONS,
): ResourceActionDescriptor[] {
  const order = new Map(allowed.map((action, index) => [action, index] as const));
  return alert.availableActions
    .filter((descriptor: ResourceActionDescriptor) =>
      order.has(descriptor.action),
    )
    .sort(
      (left: ResourceActionDescriptor, right: ResourceActionDescriptor) =>
        (order.get(left.action) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.action) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function buildAlertActionPath(
  alert: Pick<RocAlertReadModel, "alertId">,
  action: Pick<ResourceActionDescriptor, "action">,
) {
  return `/api/roc/alerts/${encodeURIComponent(alert.alertId)}/${action.action}`;
}

export async function loadAvFallbackMonitorData() {
  const client = await getServerOpsClient();
  const [alertsData, tripsData] = await Promise.all([
    loadRocAlerts(client),
    loadRocTrips(client),
  ]);
  const monitorAlerts = alertsData.items.filter(matchesAvFallbackMonitorAlert);
  const ordersById = await loadOrdersByIds(
    client,
    monitorAlerts
      .map((alert) => alert.orderId)
      .filter((orderId): orderId is string => Boolean(orderId)),
  );
  const tripsByOrderId = buildTripsByOrderId(tripsData.items);

  return {
    alertsRefresh: alertsData.refresh,
    emptyState: alertsData.emptyState,
    items: buildMonitorItems(monitorAlerts, ordersById, tripsByOrderId),
  };
}

export async function loadAvFallbackRecoveryData(
  orderId: string,
): Promise<AvFallbackRecoveryData> {
  const client = await getServerOpsClient();
  const [{ order, refresh: orderRefresh }, alertsData, tripsData] =
    await Promise.all([
      loadOrder(client, orderId),
      loadRocAlerts(client),
      loadRocTrips(client),
    ]);
  const alert = resolveRecoveryAlert(orderId, alertsData.items);
  const trip = tripsData.items.find((candidate) => candidate.orderId === orderId) ?? null;

  return {
    order,
    orderRefresh,
    alert,
    trip,
    alertsRefresh: alertsData.refresh,
  };
}

export async function loadSandboxExceptionData(): Promise<SandboxExceptionData> {
  const client = await getServerOpsClient();
  const [alertsData, tripsData] = await Promise.all([
    loadRocAlerts(client),
    loadRocTrips(client),
  ]);
  const alerts = alertsData.items
    .filter(matchesSandboxExceptionAlert)
    .sort(sortAlertsNewestFirst);
  const ordersById = await loadOrdersByIds(
    client,
    alerts
      .map((alert) => alert.orderId)
      .filter((orderId): orderId is string => Boolean(orderId)),
  );

  return {
    alerts,
    refresh: alertsData.refresh,
    ...(alertsData.emptyState
      ? { emptyState: alertsData.emptyState }
      : {}),
    ordersById,
    tripsByOrderId: buildTripsByOrderId(tripsData.items),
  };
}
