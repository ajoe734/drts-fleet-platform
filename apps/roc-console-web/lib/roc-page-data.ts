import type {
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  RocAlertReadModel,
  RocOverviewReadModel,
  RocProviderHealthReadModel,
  RocProviderHealthSnapshot,
  RocTripReadModel,
  RocTripStatus,
  RocVehicleReadModel,
  UiRefreshMetadata,
} from "@drts/contracts";
import { t, type Locale } from "@/lib/translations";
import { getServerRocClient } from "./api-client.server";
import {
  FALLBACK_ALERTS,
  FALLBACK_EVIDENCE_FILES,
  FALLBACK_HANDOVER_NOTE,
  FALLBACK_OVERVIEW,
  FALLBACK_PROVIDER_HEALTH,
  FALLBACK_REFRESH,
  FALLBACK_TRIPS,
  FALLBACK_VEHICLES,
  ROC_ALERT_CANVAS_META,
  ROC_TRIP_CANVAS_META,
  ROC_VEHICLE_CANVAS_META,
  type RocEvidenceFile,
  type RocEvidenceSource,
} from "./roc-fixtures";

type RuntimeListEnvelope<T> = {
  items: T[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
};

type RuntimeResourceEnvelope<T> = {
  item: T;
  refresh: UiRefreshMetadata;
};

export interface RocVehicleViewModel extends RocVehicleReadModel {
  model: string;
  areaLabel: string;
  safetyOperatorLabel: string;
  speedKmh: number;
  approvedRouteLabel: string;
  mapLeft: string;
  mapTop: string;
}

export interface RocTripViewModel extends RocTripReadModel {
  routeLabel: string;
  startLabel: string;
  distanceLabel: string;
  takeoverCount: number;
  safetyOperatorLabel: string;
}

export interface RocAlertViewModel extends RocAlertReadModel {
  source: RocEvidenceSource;
}

export interface RocOverviewPageData {
  overview: RocOverviewReadModel;
  vehicles: RocVehicleViewModel[];
  alerts: RocAlertViewModel[];
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
}

export interface RocLiveBoardPageData {
  vehicles: RocVehicleViewModel[];
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
}

export interface RocTripsPageData {
  trips: RocTripViewModel[];
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
}

export interface RocVehiclesPageData {
  vehicles: RocVehicleViewModel[];
  alerts: RocAlertViewModel[];
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
}

export interface RocVehicleDetailPageData {
  vehicle: RocVehicleViewModel | null;
  alerts: RocAlertViewModel[];
  providerHealth: RocProviderHealthSnapshot;
  evidenceFiles: RocEvidenceFile[];
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
}

export interface RocProviderPageData {
  snapshot: RocProviderHealthSnapshot;
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
}

export interface RocHandoverOpenItem {
  title: string;
  vehicleId: string;
  status: string;
  tone: "warn" | "danger" | "info" | "success" | "neutral";
}

export interface RocHandoverPageData {
  overview: RocOverviewReadModel;
  openItems: RocHandoverOpenItem[];
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
  nextOperatorLabel: string;
  currentOperatorLabel: string;
  note: string;
}

function resolveVehicleViewModel(vehicle: RocVehicleReadModel): RocVehicleViewModel {
  const meta = ROC_VEHICLE_CANVAS_META[vehicle.vehicleId];
  return {
    ...vehicle,
    model: meta?.model ?? "Tesla",
    areaLabel: meta?.areaLabel ?? vehicle.sandboxProgramId ?? "Sandbox",
    safetyOperatorLabel:
      meta?.safetyOperatorLabel ?? vehicle.safetyOperatorId ?? "—",
    speedKmh: meta?.speedKmh ?? 0,
    approvedRouteLabel: meta?.approvedRouteLabel ?? "—",
    mapLeft: meta?.mapLeft ?? "50%",
    mapTop: meta?.mapTop ?? "50%",
  };
}

function resolveTripViewModel(trip: RocTripReadModel): RocTripViewModel {
  const meta = ROC_TRIP_CANVAS_META[trip.tripId];
  const vehicleMeta = ROC_VEHICLE_CANVAS_META[trip.vehicleId];
  return {
    ...trip,
    routeLabel: meta?.routeLabel ?? trip.orderId ?? trip.tripId,
    startLabel: meta?.startLabel ?? "—",
    distanceLabel: meta?.distanceLabel ?? "—",
    takeoverCount:
      meta?.takeoverCount ??
      (trip.latestTakeoverOccurredAt ? 1 : 0),
    safetyOperatorLabel:
      vehicleMeta?.safetyOperatorLabel ?? trip.safetyOperatorId ?? "—",
  };
}

function resolveAlertViewModel(alert: RocAlertReadModel): RocAlertViewModel {
  return {
    ...alert,
    source: ROC_ALERT_CANVAS_META[alert.alertId]?.source ?? "roc_assessed",
  };
}

function buildFallbackList<T>(items: T[]): RuntimeListEnvelope<T> {
  return {
    items,
    refresh: FALLBACK_REFRESH,
  };
}

async function loadList<T>(
  path: string,
  fallback: RuntimeListEnvelope<T>,
): Promise<{ payload: RuntimeListEnvelope<T>; usingFallback: boolean }> {
  try {
    const client = await getServerRocClient();
    const payload = await client.get<RuntimeListEnvelope<T>>(path);
    return { payload, usingFallback: false };
  } catch {
    return { payload: fallback, usingFallback: true };
  }
}

async function loadResource<T>(
  path: string,
  fallback: RuntimeResourceEnvelope<T>,
): Promise<{ payload: RuntimeResourceEnvelope<T>; usingFallback: boolean }> {
  try {
    const client = await getServerRocClient();
    const payload = await client.get<RuntimeResourceEnvelope<T>>(path);
    return { payload, usingFallback: false };
  } catch {
    return { payload: fallback, usingFallback: true };
  }
}

export async function getRocOverviewPageData(): Promise<RocOverviewPageData> {
  const [overviewResult, vehiclesResult, alertsResult] = await Promise.all([
    loadResource("/api/roc/overview", {
      item: FALLBACK_OVERVIEW,
      refresh: FALLBACK_REFRESH,
    }),
    loadList("/api/roc/vehicles", buildFallbackList(FALLBACK_VEHICLES)),
    loadList("/api/roc/alerts", buildFallbackList(FALLBACK_ALERTS)),
  ]);

  return {
    overview: overviewResult.payload.item,
    vehicles: vehiclesResult.payload.items.map(resolveVehicleViewModel),
    alerts: alertsResult.payload.items.map(resolveAlertViewModel),
    refresh: overviewResult.payload.refresh,
    usingFallback:
      overviewResult.usingFallback ||
      vehiclesResult.usingFallback ||
      alertsResult.usingFallback,
  };
}

export async function getRocLiveBoardPageData(): Promise<RocLiveBoardPageData> {
  const vehiclesResult = await loadList(
    "/api/roc/vehicles",
    buildFallbackList(FALLBACK_VEHICLES),
  );

  return {
    vehicles: vehiclesResult.payload.items.map(resolveVehicleViewModel),
    refresh: vehiclesResult.payload.refresh,
    usingFallback: vehiclesResult.usingFallback,
  };
}

export async function getRocTripsPageData(): Promise<RocTripsPageData> {
  const tripsResult = await loadList(
    "/api/roc/trips",
    buildFallbackList(FALLBACK_TRIPS),
  );

  return {
    trips: tripsResult.payload.items.map(resolveTripViewModel),
    refresh: tripsResult.payload.refresh,
    usingFallback: tripsResult.usingFallback,
  };
}

export async function getRocVehiclesPageData(): Promise<RocVehiclesPageData> {
  const [vehiclesResult, alertsResult] = await Promise.all([
    loadList("/api/roc/vehicles", buildFallbackList(FALLBACK_VEHICLES)),
    loadList("/api/roc/alerts", buildFallbackList(FALLBACK_ALERTS)),
  ]);

  return {
    vehicles: vehiclesResult.payload.items.map(resolveVehicleViewModel),
    alerts: alertsResult.payload.items.map(resolveAlertViewModel),
    refresh: vehiclesResult.payload.refresh,
    usingFallback: vehiclesResult.usingFallback || alertsResult.usingFallback,
  };
}

export async function getRocVehicleDetailPageData(
  vehicleId: string,
): Promise<RocVehicleDetailPageData> {
  const [vehiclesResult, alertsResult, providerResult] = await Promise.all([
    loadList("/api/roc/vehicles", buildFallbackList(FALLBACK_VEHICLES)),
    loadList("/api/roc/alerts", buildFallbackList(FALLBACK_ALERTS)),
    loadResource("/api/roc/provider-health", {
      item: FALLBACK_PROVIDER_HEALTH,
      refresh: {
        ...FALLBACK_REFRESH,
        staleAfterMs: 15_000,
      },
    }),
  ]);

  const vehicles = vehiclesResult.payload.items.map(resolveVehicleViewModel);
  const alerts = alertsResult.payload.items
    .map(resolveAlertViewModel)
    .filter((alert) => alert.vehicleId === vehicleId);

  return {
    vehicle: vehicles.find((item) => item.vehicleId === vehicleId) ?? null,
    alerts,
    providerHealth: providerResult.payload.item,
    evidenceFiles: FALLBACK_EVIDENCE_FILES.filter(
      (file) => file.vehicleId === vehicleId,
    ),
    refresh: vehiclesResult.payload.refresh,
    usingFallback:
      vehiclesResult.usingFallback ||
      alertsResult.usingFallback ||
      providerResult.usingFallback,
  };
}

export async function getRocProviderPageData(): Promise<RocProviderPageData> {
  const providerResult = await loadResource("/api/roc/provider-health", {
    item: FALLBACK_PROVIDER_HEALTH,
    refresh: {
      ...FALLBACK_REFRESH,
      staleAfterMs: 15_000,
    },
  });

  return {
    snapshot: providerResult.payload.item,
    refresh: providerResult.payload.refresh,
    usingFallback: providerResult.usingFallback,
  };
}

function buildHandoverOpenItems(
  alerts: RocAlertViewModel[],
  providers: RocProviderHealthReadModel[],
): RocHandoverOpenItem[] {
  const alertItems = alerts
    .filter((alert) => alert.status !== "resolved")
    .slice(0, 3)
    .map((alert) => ({
      title: alert.title,
      vehicleId: alert.vehicleId ?? "—",
      status: alert.status,
      tone:
        alert.severity === "critical"
          ? "danger"
          : alert.severity === "warning"
            ? "warn"
            : "info",
    }));
  const providerItem = providers.find(
    (item) => item.status === "degraded" || item.status === "down",
  );

  if (!providerItem) {
    return alertItems;
  }

  return [
    ...alertItems,
    {
      title: providerItem.displayName,
      vehicleId: providerItem.affectedVehicleIds[0] ?? "—",
      status: providerItem.status,
      tone: providerItem.status === "down" ? "danger" : "warn",
    },
  ].slice(0, 4);
}

export async function getRocHandoverPageData(): Promise<RocHandoverPageData> {
  const [overviewResult, alertsResult, providerResult] = await Promise.all([
    loadResource("/api/roc/overview", {
      item: FALLBACK_OVERVIEW,
      refresh: FALLBACK_REFRESH,
    }),
    loadList("/api/roc/alerts", buildFallbackList(FALLBACK_ALERTS)),
    loadResource("/api/roc/provider-health", {
      item: FALLBACK_PROVIDER_HEALTH,
      refresh: {
        ...FALLBACK_REFRESH,
        staleAfterMs: 15_000,
      },
    }),
  ]);

  const alerts = alertsResult.payload.items.map(resolveAlertViewModel);

  return {
    overview: overviewResult.payload.item,
    openItems: buildHandoverOpenItems(alerts, providerResult.payload.item.items),
    refresh: overviewResult.payload.refresh,
    usingFallback:
      overviewResult.usingFallback ||
      alertsResult.usingFallback ||
      providerResult.usingFallback,
    currentOperatorLabel: "徐文凱 · roc_operator",
    nextOperatorLabel: "葉俊賢 · roc_operator",
    note: FALLBACK_HANDOVER_NOTE,
  };
}

export function formatRelativeAge(
  observedAt: string | null | undefined,
  now = Date.now(),
): string {
  if (!observedAt) {
    return "—";
  }

  const diffMs = Math.max(0, now - new Date(observedAt).getTime());
  const diffSeconds = Math.floor(diffMs / 1_000);
  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h`;
}

export function formatShortTime(
  value: string | null | undefined,
  locale: "en" | "zh",
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

export function resolveVehicleStateTone(vehicle: RocVehicleReadModel) {
  if (vehicle.humanFallbackActive) {
    return "danger";
  }
  if (vehicle.operationalHoldActive || vehicle.stopNewDispatchActive) {
    return "warn";
  }
  if (vehicle.autonomyState === "fsd_engaged") {
    return "success";
  }
  if (vehicle.currentOrderId) {
    return "warn";
  }
  return "neutral";
}

export function resolveVehicleStateKey(vehicle: RocVehicleReadModel) {
  if (vehicle.humanFallbackActive) {
    return "fallback";
  }
  if (vehicle.operationalHoldActive || vehicle.currentOrderId) {
    return vehicle.autonomyState === "fsd_engaged" ? "autonomous" : "takeover";
  }
  if (vehicle.autonomyState === "fsd_engaged") {
    return "autonomous";
  }
  return "idle";
}

export function resolveTripStateKey(trip: RocTripReadModel): RocTripStatus {
  return trip.status;
}

export function buildSupportedAlertActionItems(
  alerts: RocAlertViewModel[],
  locale: Locale,
): Array<{
  descriptor: ResourceActionDescriptor;
  label: string;
  path: string;
  resourceType: string;
  resourceId: string;
  reason?: string;
}> {
  const supportedActions = new Set([
    "ack",
    "stop-new-dispatch",
    "operational-hold",
    "open-incident",
    "start-evidence-freeze",
    "fallback-to-human",
    "notify",
    "resolve",
  ]);

  return alerts.flatMap((alert) =>
    alert.availableActions
      .filter((action) => supportedActions.has(action.action))
      .map((descriptor) => ({
        descriptor,
        label: `${t(`actionLabel.${descriptor.action}`, locale)} · ${
          alert.vehicleId ?? alert.alertId
        }`,
        path: `/api/roc/alerts/${alert.alertId}/${descriptor.action}`,
        resourceType: "roc_alert",
        resourceId: alert.alertId,
        ...(descriptor.requiresReason
          ? {
              reason:
                locale === "zh"
                  ? `ROC 車輛詳情動作：${alert.alertId}`
                  : `ROC vehicle detail action: ${alert.alertId}`,
            }
          : {}),
      })),
  );
}
