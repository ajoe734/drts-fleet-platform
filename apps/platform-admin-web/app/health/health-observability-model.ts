import type {
  AdapterHealthRecord,
  ForwardedOrderRecord,
  OperationalAdapterDetailRecord,
  OperationalAlertRecord,
  OperationalObservabilitySnapshot,
} from "@drts/contracts";
import {
  formatHealthAdapterSource,
  formatHealthMetricValue,
  getHealthAlertRouteLabel,
  getHealthAlertTitle,
  getHealthPageCopy,
  getHealthStatusLabel,
  t,
  type Locale,
} from "../../lib/translations";

export const ADAPTER_ORDERS_WINDOW_MS = 24 * 60 * 60 * 1000;

export type HealthSourceReadStatus =
  | "initial"
  | "loading"
  | "permission_denied"
  | "unavailable"
  | "stale"
  | "ready";

export type HealthDataPosture =
  | "unknown"
  | "empty"
  | "successful_zero"
  | "nonzero";

export type HealthErrorClassification = "permission_denied" | "unavailable";

export type AdapterEventKind = "webhook" | "rate_limit" | "auth_failure";

export type AdapterTimestampProvenance =
  | "actual_event"
  | "check_only"
  | "unknown";

export type AdapterOrders24hProvenance =
  | "window_24h"
  | "stale_window_24h"
  | "permission_denied"
  | "unavailable"
  | "unknown";

export interface ClassifiedHealthError {
  status: HealthErrorClassification;
  code: string | null;
  statusCode: number | null;
  message: string;
}

export interface HealthSectionReadState<T> {
  status: HealthSourceReadStatus;
  posture: HealthDataPosture;
  data: T | null;
  sourceTimestamp: string | null;
  uiRefreshedAt: string | null;
  error: string | null;
  errorCode: string | null;
  errorStatusCode: number | null;
  errorClassification: HealthErrorClassification | null;
  staleReason: HealthErrorClassification | null;
}

export interface HealthPageLoadState {
  observability: HealthSectionReadState<OperationalObservabilitySnapshot>;
  adapters: HealthSectionReadState<AdapterHealthRecord[]>;
  forwardedOrders: HealthSectionReadState<ForwardedOrderRecord[]>;
  uiRefreshedAt: string | null;
}

export interface PlatformHealthSourceClient {
  getOperationalObservability: () => Promise<OperationalObservabilitySnapshot>;
  getForwarderAdaptersHealth: () => Promise<unknown[]>;
  listForwarderOrders?: () => Promise<ForwardedOrderRecord[]>;
}

export interface AdapterEventSelection {
  lastEventAt: string | null;
  lastEventKind: AdapterEventKind | null;
  lastCheckedAt: string | null;
  uiRefreshedAt: string | null;
  provenance: AdapterTimestampProvenance;
  formattedLastEvent: string;
  formattedLastCheckedAt: string;
}

export type AdapterInventoryRow = {
  adapter: string;
  source: string;
  kind: string;
  mode: OperationalAdapterDetailRecord["capabilitySummary"]["mode"];
  status: AdapterHealthRecord["status"];
  latency: string;
  lastEvent: string;
  lastEventAt: string | null;
  lastEventKind: AdapterEventKind | null;
  lastCheckedAt: string | null;
  uiRefreshedAt: string | null;
  timestampProvenance: AdapterTimestampProvenance;
  orders24h: string;
  orders24hCount: number | null;
  orders24hProvenance: AdapterOrders24hProvenance;
  note: string;
} & Record<string, unknown>;

export interface HealthKpiDescriptor {
  label: string;
  value: string;
  delta?: string | undefined;
  deltaTone: "up" | "down" | "neutral";
  sub: string;
}

export interface HealthSummaryItem {
  label: string;
  value: string;
}

export interface PlatformHealthBannerModel {
  tone: "danger" | "warn";
  title: string;
  body: string;
}

export interface PlatformHealthViewModel {
  loading: boolean;
  observabilityStatus: HealthSourceReadStatus;
  observabilityPosture: HealthDataPosture;
  adaptersStatus: HealthSourceReadStatus;
  forwardedOrdersStatus: HealthSourceReadStatus;
  sourceGeneratedAt: string | null;
  uiRefreshedAt: string | null;
  banner: PlatformHealthBannerModel | null;
  kpis: {
    dispatch: HealthKpiDescriptor;
    webhook: HealthKpiDescriptor;
    eligibility: HealthKpiDescriptor;
    reporting: HealthKpiDescriptor;
  };
  platformAlerts: OperationalAlertRecord[];
  activeAlerts: OperationalAlertRecord[];
  alertsEmptyState: {
    kind: "loading" | "permission_denied" | "unavailable" | "stale_empty" | "empty" | "none";
    message: string;
  };
  dispatchSummary: HealthSummaryItem[];
  webhookSummary: HealthSummaryItem[];
  filingSummary: HealthSummaryItem[];
  forwarderOpsSummary: {
    totalForwardedOrders: number | null;
    syncFailedOrders: number | null;
    acceptPendingOrders: number | null;
    manualFallbackQueue: number | null;
    reconciliationQueue: number | null;
  };
  adapterRows: AdapterInventoryRow[];
  adaptersEmptyState: {
    kind: "loading" | "permission_denied" | "unavailable" | "empty" | "none";
    message: string;
  };
}

const ALERT_SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  healthy: 2,
} as const;

const PERMISSION_CODE_PATTERN =
  /^(FORBIDDEN|UNAUTHORIZED|PERMISSION_DENIED|INSUFFICIENT_SCOPE|REALM_MISMATCH|HTTP_401|HTTP_403)$/i;
const PERMISSION_MESSAGE_PATTERN =
  /\b(401|403|forbidden|unauthorized|permission[_\s-]?denied|insufficient[_\s-]?scope|realm[_\s-]?mismatch)\b/i;

export function parseValidIsoTimestamp(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatValidHealthTimestamp(
  value: string | null | undefined,
  fallback = "—",
): string {
  const parsed = parseValidIsoTimestamp(value);
  if (parsed === null) {
    return fallback;
  }
  try {
    return new Date(parsed).toLocaleString();
  } catch {
    return fallback;
  }
}

export function classifyHealthReadError(error: unknown): ClassifiedHealthError {
  const errObj =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const rawStatusCode =
    typeof errObj?.statusCode === "number"
      ? errObj.statusCode
      : typeof errObj?.status === "number"
        ? errObj.status
        : null;
  const rawCode =
    typeof errObj?.code === "string" && errObj.code.trim()
      ? errObj.code.trim()
      : null;
  const rawMessage =
    typeof errObj?.apiMessage === "string" && errObj.apiMessage.trim()
      ? errObj.apiMessage.trim()
      : error instanceof Error && error.message.trim()
        ? error.message.trim()
        : String(error ?? "Unknown error");

  const isPermissionDenied =
    rawStatusCode === 401 ||
    rawStatusCode === 403 ||
    (rawCode !== null && PERMISSION_CODE_PATTERN.test(rawCode)) ||
    PERMISSION_MESSAGE_PATTERN.test(rawMessage);

  return {
    status: isPermissionDenied ? "permission_denied" : "unavailable",
    code: rawCode,
    statusCode: rawStatusCode,
    message: rawMessage,
  };
}

export function computeObservabilityPosture(
  snapshot: OperationalObservabilitySnapshot | null,
): HealthDataPosture {
  if (!snapshot) {
    return "unknown";
  }

  const hasNonZeroSignal =
    snapshot.alerts.some((alert) => alert.state !== "healthy") ||
    snapshot.dispatch.laggedOrders > 0 ||
    (snapshot.dispatch.oldestReadyOrderLagMinutes ?? 0) > 0 ||
    snapshot.dispatch.queueDepth > 0 ||
    snapshot.dispatch.redispatchOrders > 0 ||
    snapshot.dispatch.exceptionHoldOrders > 0 ||
    snapshot.dispatch.dispatchFailedOrders > 0 ||
    snapshot.webhook.queuedDeliveries > 0 ||
    snapshot.webhook.failedDeliveriesLastHour > 0 ||
    (snapshot.webhook.oldestQueuedDeliveryLagMinutes ?? 0) > 0 ||
    snapshot.eligibility.totalReviewQueue > 0 ||
    snapshot.eligibility.manualReviewQueue > 0 ||
    snapshot.eligibility.recentFailureCount24h > 0 ||
    snapshot.reporting.failedJobs > 0 ||
    snapshot.reporting.queuedJobs > 0 ||
    snapshot.recording.pendingOrders > 0 ||
    snapshot.driverState.staleLocationDrivers > 0 ||
    snapshot.adapters.degradedAdapters > 0 ||
    snapshot.adapters.downAdapters > 0 ||
    snapshot.forwarderOps.syncFailedOrders > 0 ||
    snapshot.forwarderOps.acceptPendingOrders > 0 ||
    snapshot.forwarderOps.manualFallbackQueue > 0 ||
    snapshot.forwarderOps.reconciliationQueue > 0;

  if (hasNonZeroSignal) {
    return "nonzero";
  }

  const totalProvisionedEntities =
    snapshot.adapters.totalAdapters +
    snapshot.adapterDetails.length +
    snapshot.dispatch.activeOrders +
    snapshot.recording.phoneOrders +
    snapshot.driverState.totalDrivers +
    snapshot.webhook.totalEndpoints +
    snapshot.forwarderOps.totalForwardedOrders +
    snapshot.alerts.length;

  if (totalProvisionedEntities === 0) {
    return "empty";
  }

  return "successful_zero";
}

function computeAdaptersPosture(
  adapters: AdapterHealthRecord[] | null,
): HealthDataPosture {
  if (!adapters) {
    return "unknown";
  }
  if (adapters.length === 0) {
    return "empty";
  }
  return adapters.some((adapter) => adapter.status !== "healthy")
    ? "nonzero"
    : "successful_zero";
}

function computeForwardedOrdersPosture(
  orders: ForwardedOrderRecord[] | null,
): HealthDataPosture {
  if (!orders) {
    return "unknown";
  }
  if (orders.length === 0) {
    return "empty";
  }
  return "nonzero";
}

function createInitialSectionState<T>(): HealthSectionReadState<T> {
  return {
    status: "initial",
    posture: "unknown",
    data: null,
    sourceTimestamp: null,
    uiRefreshedAt: null,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    errorClassification: null,
    staleReason: null,
  };
}

function beginSectionLoad<T>(
  prior: HealthSectionReadState<T>,
): HealthSectionReadState<T> {
  if (prior.data !== null) {
    return {
      ...prior,
    };
  }
  return {
    ...prior,
    status: "loading",
    posture: "unknown",
    error: null,
    errorCode: null,
    errorStatusCode: null,
    errorClassification: null,
    staleReason: null,
  };
}

export function createInitialHealthPageState(): HealthPageLoadState {
  return {
    observability: createInitialSectionState<OperationalObservabilitySnapshot>(),
    adapters: createInitialSectionState<AdapterHealthRecord[]>(),
    forwardedOrders: createInitialSectionState<ForwardedOrderRecord[]>(),
    uiRefreshedAt: null,
  };
}

export function beginHealthPageLoad(
  priorState: HealthPageLoadState,
): HealthPageLoadState {
  return {
    observability: beginSectionLoad(priorState.observability),
    adapters: beginSectionLoad(priorState.adapters),
    forwardedOrders: beginSectionLoad(priorState.forwardedOrders),
    uiRefreshedAt: priorState.uiRefreshedAt,
  };
}

function resolveFailedSectionState<T>(
  prior: HealthSectionReadState<T>,
  error: unknown,
  uiRefreshedAt: string,
): HealthSectionReadState<T> {
  const classified = classifyHealthReadError(error);
  if (prior.data !== null) {
    return {
      status: "stale",
      posture: prior.posture,
      data: prior.data,
      sourceTimestamp: prior.sourceTimestamp,
      uiRefreshedAt,
      error: classified.message,
      errorCode: classified.code,
      errorStatusCode: classified.statusCode,
      errorClassification: classified.status,
      staleReason: classified.status,
    };
  }

  return {
    status: classified.status,
    posture: "unknown",
    data: null,
    sourceTimestamp: null,
    uiRefreshedAt,
    error: classified.message,
    errorCode: classified.code,
    errorStatusCode: classified.statusCode,
    errorClassification: classified.status,
    staleReason: null,
  };
}

export function resolveObservabilitySectionState(
  result: PromiseSettledResult<OperationalObservabilitySnapshot>,
  prior: HealthSectionReadState<OperationalObservabilitySnapshot>,
  uiRefreshedAt: string,
): HealthSectionReadState<OperationalObservabilitySnapshot> {
  if (result.status === "rejected") {
    return resolveFailedSectionState(prior, result.reason, uiRefreshedAt);
  }

  const snapshot = result.value;
  const validGeneratedAtMs = parseValidIsoTimestamp(snapshot?.generatedAt);
  if (!snapshot || validGeneratedAtMs === null) {
    return resolveFailedSectionState(
      prior,
      new Error("Invalid or missing operational observability source timestamp"),
      uiRefreshedAt,
    );
  }

  return {
    status: "ready",
    posture: computeObservabilityPosture(snapshot),
    data: snapshot,
    sourceTimestamp: snapshot.generatedAt,
    uiRefreshedAt,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    errorClassification: null,
    staleReason: null,
  };
}

function pickLatestValidTimestamp(
  values: ReadonlyArray<string | null | undefined>,
): string | null {
  let latestRaw: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const raw of values) {
    const ms = parseValidIsoTimestamp(raw);
    if (ms !== null && ms > latestMs && typeof raw === "string") {
      latestMs = ms;
      latestRaw = raw;
    }
  }

  return latestRaw;
}

export function resolveAdaptersSectionState(
  result: PromiseSettledResult<AdapterHealthRecord[]>,
  prior: HealthSectionReadState<AdapterHealthRecord[]>,
  uiRefreshedAt: string,
): HealthSectionReadState<AdapterHealthRecord[]> {
  if (result.status === "rejected") {
    return resolveFailedSectionState(prior, result.reason, uiRefreshedAt);
  }

  if (!Array.isArray(result.value)) {
    return resolveFailedSectionState(
      prior,
      new Error("Invalid forwarder adapter health payload"),
      uiRefreshedAt,
    );
  }

  const items = result.value;
  const sourceTimestamp = pickLatestValidTimestamp(
    items.map((item) => item.lastCheckedAt),
  );

  return {
    status: "ready",
    posture: computeAdaptersPosture(items),
    data: items,
    sourceTimestamp,
    uiRefreshedAt,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    errorClassification: null,
    staleReason: null,
  };
}

export function resolveForwardedOrdersSectionState(
  result: PromiseSettledResult<ForwardedOrderRecord[]>,
  prior: HealthSectionReadState<ForwardedOrderRecord[]>,
  uiRefreshedAt: string,
): HealthSectionReadState<ForwardedOrderRecord[]> {
  if (result.status === "rejected") {
    return resolveFailedSectionState(prior, result.reason, uiRefreshedAt);
  }

  if (!Array.isArray(result.value)) {
    return resolveFailedSectionState(
      prior,
      new Error("Invalid forwarded orders payload"),
      uiRefreshedAt,
    );
  }

  const orders = result.value;
  const sourceTimestamp = pickLatestValidTimestamp(
    orders.map((order) => order.updatedAt ?? order.createdAt),
  );

  return {
    status: "ready",
    posture: computeForwardedOrdersPosture(orders),
    data: orders,
    sourceTimestamp,
    uiRefreshedAt,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    errorClassification: null,
    staleReason: null,
  };
}

export async function loadPlatformHealthSources(
  client: PlatformHealthSourceClient,
  priorState: HealthPageLoadState = createInitialHealthPageState(),
  options?: { uiRefreshedAt?: string },
): Promise<HealthPageLoadState> {
  const uiRefreshedAt = options?.uiRefreshedAt ?? new Date().toISOString();

  const [observabilityResult, adaptersResult] = await Promise.allSettled([
    client.getOperationalObservability(),
    client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
  ]);

  const observability = resolveObservabilitySectionState(
    observabilityResult,
    priorState.observability,
    uiRefreshedAt,
  );
  const adapters = resolveAdaptersSectionState(
    adaptersResult,
    priorState.adapters,
    uiRefreshedAt,
  );

  let forwardedOrders: HealthSectionReadState<ForwardedOrderRecord[]>;
  if (
    observability.status === "ready" &&
    observability.data !== null &&
    observability.data.forwarderOps.totalForwardedOrders === 0
  ) {
    forwardedOrders = {
      status: "ready",
      posture: "empty",
      data: [],
      sourceTimestamp: observability.sourceTimestamp,
      uiRefreshedAt,
      error: null,
      errorCode: null,
      errorStatusCode: null,
      errorClassification: null,
      staleReason: null,
    };
  } else {
    const ordersPromise =
      typeof client.listForwarderOrders === "function"
        ? client.listForwarderOrders()
        : Promise.reject(
            new Error("Forwarded orders source endpoint is not configured"),
          );
    const [ordersResult] = await Promise.allSettled([ordersPromise]);
    forwardedOrders = resolveForwardedOrdersSectionState(
      ordersResult,
      priorState.forwardedOrders,
      uiRefreshedAt,
    );
  }

  return {
    observability,
    adapters,
    forwardedOrders,
    uiRefreshedAt,
  };
}

export function mergeAdapterDetails(
  adapterDetails: OperationalAdapterDetailRecord[] | null | undefined,
  fallbackAdapters: AdapterHealthRecord[] | null | undefined,
): OperationalAdapterDetailRecord[] {
  const primary = adapterDetails ?? [];
  const secondary = fallbackAdapters ?? [];

  if (primary.length === 0 && secondary.length === 0) {
    return [];
  }

  const secondaryByCode = new Map<string, AdapterHealthRecord>();
  for (const adapter of secondary) {
    secondaryByCode.set(adapter.platformCode, adapter);
  }

  if (primary.length > 0) {
    const merged: OperationalAdapterDetailRecord[] = primary.map((detail) => {
      const match = secondaryByCode.get(detail.platformCode);
      if (!match) {
        return detail;
      }
      secondaryByCode.delete(detail.platformCode);
      return {
        ...detail,
        lastWebhookReceivedAt:
          detail.lastWebhookReceivedAt ?? match.lastWebhookReceivedAt,
        lastRateLimitAt: detail.lastRateLimitAt ?? match.lastRateLimitAt,
        lastAuthFailureAt: detail.lastAuthFailureAt ?? match.lastAuthFailureAt,
      };
    });

    for (const remaining of secondaryByCode.values()) {
      merged.push({
        platformCode: remaining.platformCode,
        status: remaining.status,
        reason: remaining.reason,
        credentialStatus: remaining.credentialStatus,
        authStatus: remaining.authStatus,
        webhookStatus: remaining.webhookStatus,
        rateLimitStatus: remaining.rateLimitStatus,
        capabilitySummary: remaining.capabilitySummary,
        lastCheckedAt: remaining.lastCheckedAt,
        lastError: remaining.lastError,
        lastWebhookReceivedAt: remaining.lastWebhookReceivedAt,
        lastRateLimitAt: remaining.lastRateLimitAt,
        lastAuthFailureAt: remaining.lastAuthFailureAt,
      });
    }

    return merged;
  }

  return secondary.map((adapter) => ({
    platformCode: adapter.platformCode,
    status: adapter.status,
    reason: adapter.reason,
    credentialStatus: adapter.credentialStatus,
    authStatus: adapter.authStatus,
    webhookStatus: adapter.webhookStatus,
    rateLimitStatus: adapter.rateLimitStatus,
    capabilitySummary: adapter.capabilitySummary,
    lastCheckedAt: adapter.lastCheckedAt,
    lastError: adapter.lastError,
    lastWebhookReceivedAt: adapter.lastWebhookReceivedAt,
    lastRateLimitAt: adapter.lastRateLimitAt,
    lastAuthFailureAt: adapter.lastAuthFailureAt,
  }));
}

export function selectAdapterLatestEvent(
  adapter: Pick<
    OperationalAdapterDetailRecord,
    | "lastWebhookReceivedAt"
    | "lastRateLimitAt"
    | "lastAuthFailureAt"
    | "lastCheckedAt"
  >,
  locale: Locale,
  uiRefreshedAt: string | null = null,
): AdapterEventSelection {
  const candidates: Array<{
    kind: AdapterEventKind;
    raw: string;
    ms: number;
  }> = [];

  const rawCandidates: Array<{
    kind: AdapterEventKind;
    raw: string | null | undefined;
  }> = [
    { kind: "webhook", raw: adapter.lastWebhookReceivedAt },
    { kind: "rate_limit", raw: adapter.lastRateLimitAt },
    { kind: "auth_failure", raw: adapter.lastAuthFailureAt },
  ];

  for (const candidate of rawCandidates) {
    const ms = parseValidIsoTimestamp(candidate.raw);
    if (ms !== null && typeof candidate.raw === "string") {
      candidates.push({
        kind: candidate.kind,
        raw: candidate.raw,
        ms,
      });
    }
  }

  candidates.sort((left, right) => right.ms - left.ms);

  const validCheckedMs = parseValidIsoTimestamp(adapter.lastCheckedAt);
  const lastCheckedAt =
    validCheckedMs !== null && typeof adapter.lastCheckedAt === "string"
      ? adapter.lastCheckedAt
      : null;
  const formattedLastCheckedAt =
    lastCheckedAt !== null
      ? formatValidHealthTimestamp(lastCheckedAt)
      : getHealthStatusLabel(locale, "unknown");

  const validUiRefreshedAt =
    parseValidIsoTimestamp(uiRefreshedAt) !== null ? uiRefreshedAt : null;

  if (candidates.length > 0) {
    const latest = candidates[0]!;
    return {
      lastEventAt: latest.raw,
      lastEventKind: latest.kind,
      lastCheckedAt,
      uiRefreshedAt: validUiRefreshedAt,
      provenance: "actual_event",
      formattedLastEvent: formatValidHealthTimestamp(
        latest.raw,
        getHealthStatusLabel(locale, "unknown"),
      ),
      formattedLastCheckedAt,
    };
  }

  if (lastCheckedAt !== null) {
    return {
      lastEventAt: null,
      lastEventKind: null,
      lastCheckedAt,
      uiRefreshedAt: validUiRefreshedAt,
      provenance: "check_only",
      formattedLastEvent: "—",
      formattedLastCheckedAt,
    };
  }

  return {
    lastEventAt: null,
    lastEventKind: null,
    lastCheckedAt: null,
    uiRefreshedAt: validUiRefreshedAt,
    provenance: "unknown",
    formattedLastEvent: getHealthStatusLabel(locale, "unknown"),
    formattedLastCheckedAt,
  };
}

export function computePerAdapterOrders24h(input: {
  adapters: ReadonlyArray<{
    platformCode: string;
    lastCheckedAt?: string | null;
  }>;
  forwardedOrdersState: Pick<
    HealthSectionReadState<ForwardedOrderRecord[]>,
    "status" | "data"
  >;
  referenceTimestamp: string | null | undefined;
  locale: Locale;
}): Map<
  string,
  {
    count: number | null;
    formatted: string;
    provenance: AdapterOrders24hProvenance;
  }
> {
  const result = new Map<
    string,
    {
      count: number | null;
      formatted: string;
      provenance: AdapterOrders24hProvenance;
    }
  >();

  const { adapters, forwardedOrdersState, referenceTimestamp, locale } = input;
  const orders = forwardedOrdersState.data;

  if (orders === null) {
    const provenance: AdapterOrders24hProvenance =
      forwardedOrdersState.status === "permission_denied"
        ? "permission_denied"
        : forwardedOrdersState.status === "unavailable"
          ? "unavailable"
          : "unknown";
    for (const adapter of adapters) {
      result.set(adapter.platformCode, {
        count: null,
        formatted: "—",
        provenance,
      });
    }
    return result;
  }

  const fallbackAnchorRaw = pickLatestValidTimestamp([
    ...adapters.map((adapter) => adapter.lastCheckedAt),
    ...orders.map((order) => order.updatedAt ?? order.createdAt),
  ]);
  const windowEndMs =
    parseValidIsoTimestamp(referenceTimestamp) ??
    parseValidIsoTimestamp(fallbackAnchorRaw);

  const provenance: AdapterOrders24hProvenance =
    forwardedOrdersState.status === "stale"
      ? "stale_window_24h"
      : "window_24h";

  if (windowEndMs === null && orders.length > 0) {
    for (const adapter of adapters) {
      result.set(adapter.platformCode, {
        count: null,
        formatted: "—",
        provenance: "unknown",
      });
    }
    return result;
  }

  const windowStartMs =
    windowEndMs !== null ? windowEndMs - ADAPTER_ORDERS_WINDOW_MS : 0;
  const countsByNormalizedCode = new Map<string, number>();

  for (const order of orders) {
    if (!order || typeof order.platformCode !== "string") {
      continue;
    }
    const createdAtMs = parseValidIsoTimestamp(order.createdAt);
    if (createdAtMs === null) {
      continue;
    }
    if (
      windowEndMs !== null &&
      (createdAtMs < windowStartMs || createdAtMs > windowEndMs)
    ) {
      continue;
    }
    const normalizedCode = order.platformCode.trim().toLowerCase();
    countsByNormalizedCode.set(
      normalizedCode,
      (countsByNormalizedCode.get(normalizedCode) ?? 0) + 1,
    );
  }

  for (const adapter of adapters) {
    const normalizedCode = adapter.platformCode.trim().toLowerCase();
    const count = countsByNormalizedCode.get(normalizedCode) ?? 0;
    result.set(adapter.platformCode, {
      count,
      formatted: formatHealthMetricValue(locale, count, "count"),
      provenance,
    });
  }

  return result;
}

function getStatusBannerLabel(
  locale: Locale,
  status: HealthSourceReadStatus,
): string {
  if (status === "permission_denied") {
    return t("partnerNotification.permissionDenied", locale);
  }
  if (status === "stale") {
    return getHealthStatusLabel(locale, "stale");
  }
  if (status === "unavailable") {
    return t("fleetUi.unavailable", locale);
  }
  return getHealthStatusLabel(locale, "unknown");
}

export function buildPlatformHealthViewModel(
  state: HealthPageLoadState,
  locale: Locale,
): PlatformHealthViewModel {
  const copy = getHealthPageCopy(locale);
  const obs = state.observability;
  const adaptersSection = state.adapters;
  const ordersSection = state.forwardedOrders;
  const snapshot = obs.data;

  const isInitialOrLoading =
    (obs.status === "initial" || obs.status === "loading") &&
    (adaptersSection.status === "initial" ||
      adaptersSection.status === "loading");

  const statusLabel = getStatusBannerLabel(locale, obs.status);
  const unknownValueLabel = getHealthStatusLabel(locale, "unknown");

  const staleDeltaLabel =
    obs.status === "stale"
      ? `${getHealthStatusLabel(locale, "stale")} · ${formatValidHealthTimestamp(obs.sourceTimestamp)}`
      : undefined;

  let kpis: PlatformHealthViewModel["kpis"];
  if (!snapshot) {
    const unavailableValue =
      obs.status === "initial" || obs.status === "loading"
        ? "—"
        : unknownValueLabel;
    const unavailableDelta =
      obs.status === "initial" || obs.status === "loading"
        ? undefined
        : statusLabel;
    const unavailableSub =
      obs.status === "initial" || obs.status === "loading"
        ? copy.loadingAlerts
        : obs.status === "permission_denied"
          ? t("partnerNotification.permissionDenied", locale)
          : copy.refreshError;

    kpis = {
      dispatch: {
        label: copy.kpis.dispatch.label,
        value: unavailableValue,
        delta: unavailableDelta,
        deltaTone: "neutral",
        sub: unavailableSub,
      },
      webhook: {
        label: copy.kpis.webhook.label,
        value: unavailableValue,
        delta: unavailableDelta,
        deltaTone: "neutral",
        sub: unavailableSub,
      },
      eligibility: {
        label: copy.kpis.eligibility.label,
        value: unavailableValue,
        delta: unavailableDelta,
        deltaTone: "neutral",
        sub: unavailableSub,
      },
      reporting: {
        label: copy.kpis.reporting.label,
        value: unavailableValue,
        delta: unavailableDelta,
        deltaTone: "neutral",
        sub: unavailableSub,
      },
    };
  } else {
    const isStale = obs.status === "stale";
    const dispatchHasLag =
      snapshot.dispatch.laggedOrders > 0 ||
      (snapshot.dispatch.oldestReadyOrderLagMinutes ?? 0) > 0;
    const webhookHasFailures = snapshot.webhook.failedDeliveriesLastHour > 0;
    const reportingHasFailures = snapshot.reporting.failedJobs > 0;

    kpis = {
      dispatch: {
        label: copy.kpis.dispatch.label,
        value: formatHealthMetricValue(
          locale,
          snapshot.dispatch.oldestReadyOrderLagMinutes,
          "minutes",
        ),
        delta: isStale
          ? staleDeltaLabel
          : dispatchHasLag
            ? "watch"
            : "ok",
        deltaTone: isStale ? "neutral" : dispatchHasLag ? "down" : "up",
        sub: copy.kpis.dispatch.sub(snapshot.dispatch.laggedOrders),
      },
      webhook: {
        label: copy.kpis.webhook.label,
        value: formatHealthMetricValue(
          locale,
          snapshot.webhook.queuedDeliveries,
          "count",
        ),
        delta: isStale
          ? staleDeltaLabel
          : webhookHasFailures
            ? `↑ ${snapshot.webhook.failedDeliveriesLastHour}`
            : "ok",
        deltaTone: isStale ? "neutral" : webhookHasFailures ? "down" : "up",
        sub: copy.kpis.webhook.sub(snapshot.webhook.failedDeliveriesLastHour),
      },
      eligibility: {
        label: copy.kpis.eligibility.label,
        value: formatHealthMetricValue(
          locale,
          snapshot.eligibility.totalReviewQueue,
          "count",
        ),
        delta: isStale ? staleDeltaLabel : undefined,
        deltaTone: "neutral",
        sub: copy.kpis.eligibility.sub(snapshot.eligibility.manualReviewQueue),
      },
      reporting: {
        label: copy.kpis.reporting.label,
        value: formatHealthMetricValue(
          locale,
          snapshot.reporting.failedJobs,
          "count",
        ),
        delta: isStale
          ? staleDeltaLabel
          : reportingHasFailures
            ? "attention"
            : "ok",
        deltaTone: isStale ? "neutral" : reportingHasFailures ? "down" : "up",
        sub: copy.kpis.reporting.sub(snapshot.reporting.queuedJobs),
      },
    };
  }

  const summaryFallback =
    obs.status === "initial" || obs.status === "loading"
      ? "—"
      : unknownValueLabel;

  const dispatchSummary: HealthSummaryItem[] = [
    {
      label: copy.summary.dispatch.queueDepth,
      value: snapshot
        ? formatHealthMetricValue(locale, snapshot.dispatch.queueDepth, "count")
        : summaryFallback,
    },
    {
      label: copy.summary.dispatch.redispatchOrders,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.dispatch.redispatchOrders,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.dispatch.exceptionHolds,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.dispatch.exceptionHoldOrders,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.dispatch.failedOrders,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.dispatch.dispatchFailedOrders,
            "count",
          )
        : summaryFallback,
    },
  ];

  const webhookSummary: HealthSummaryItem[] = [
    {
      label: copy.summary.webhook.activeEndpoints,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.webhook.activeEndpoints,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.webhook.disabledEndpoints,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.webhook.disabledEndpoints,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.webhook.queuedDeliveries,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.webhook.queuedDeliveries,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.webhook.oldestQueuedLag,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.webhook.oldestQueuedDeliveryLagMinutes,
            "minutes",
          )
        : summaryFallback,
    },
  ];

  const filingSummary: HealthSummaryItem[] = [
    {
      label: copy.summary.filing.reportingQueuedJobs,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.reporting.queuedJobs,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.filing.recordingBacklog,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.recording.pendingOrders,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.filing.manualReviewQueue,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.eligibility.manualReviewQueue,
            "count",
          )
        : summaryFallback,
    },
    {
      label: copy.summary.filing.eligibilityFailures24h,
      value: snapshot
        ? formatHealthMetricValue(
            locale,
            snapshot.eligibility.recentFailureCount24h,
            "count",
          )
        : summaryFallback,
    },
  ];

  const platformAlertKeys = new Set(
    snapshot?.roleViews.find((view) => view.route === "platform")?.alertKeys ??
      [],
  );

  const platformAlerts = (snapshot?.alerts ?? [])
    .filter(
      (alert) =>
        platformAlertKeys.has(alert.key) || alert.routes.includes("platform"),
    )
    .sort(
      (left, right) =>
        ALERT_SEVERITY_ORDER[left.state] - ALERT_SEVERITY_ORDER[right.state],
    );

  const activeAlerts = platformAlerts.filter(
    (alert) => alert.state !== "healthy",
  );

  let alertsEmptyState: PlatformHealthViewModel["alertsEmptyState"];
  if (obs.status === "initial" || obs.status === "loading") {
    alertsEmptyState = {
      kind: "loading",
      message: copy.loadingAlerts,
    };
  } else if (!snapshot && obs.status === "permission_denied") {
    alertsEmptyState = {
      kind: "permission_denied",
      message: `${t("partnerNotification.permissionDenied", locale)} · ${obs.error ?? copy.refreshError}`,
    };
  } else if (!snapshot) {
    alertsEmptyState = {
      kind: "unavailable",
      message: `${t("fleetUi.unavailable", locale)} · ${obs.error ?? copy.refreshError}`,
    };
  } else if (activeAlerts.length === 0 && obs.status === "stale") {
    alertsEmptyState = {
      kind: "stale_empty",
      message: `${getHealthStatusLabel(locale, "stale")} (${formatValidHealthTimestamp(obs.sourceTimestamp)}) · ${obs.error ?? copy.refreshError}`,
    };
  } else if (activeAlerts.length === 0) {
    alertsEmptyState = {
      kind: "empty",
      message: copy.alertsEmpty,
    };
  } else {
    alertsEmptyState = {
      kind: "none",
      message: "",
    };
  }

  const mergedAdapters = mergeAdapterDetails(
    snapshot?.adapterDetails,
    adaptersSection.data,
  );
  const perAdapterOrders24h = computePerAdapterOrders24h({
    adapters: mergedAdapters,
    forwardedOrdersState: ordersSection,
    referenceTimestamp: obs.sourceTimestamp ?? adaptersSection.sourceTimestamp,
    locale,
  });

  const adapterRows: AdapterInventoryRow[] = mergedAdapters.map((adapter) => {
    const eventSelection = selectAdapterLatestEvent(
      adapter,
      locale,
      state.uiRefreshedAt,
    );
    const ordersMetric = perAdapterOrders24h.get(adapter.platformCode) ?? {
      count: null,
      formatted: "—",
      provenance: "unknown" as const,
    };
    const baseNote =
      adapter.lastError ?? getHealthStatusLabel(locale, adapter.reason);
    const note =
      eventSelection.provenance === "check_only" &&
      eventSelection.lastCheckedAt !== null
        ? `${baseNote} · ${t("health.lastRefresh", locale, { time: eventSelection.formattedLastCheckedAt })}`
        : baseNote;

    return {
      adapter: adapter.platformCode,
      source: formatHealthAdapterSource(locale, adapter.platformCode),
      kind: adapter.capabilitySummary.mode.toUpperCase(),
      mode: adapter.capabilitySummary.mode,
      status: adapter.status,
      latency: "—",
      lastEvent: eventSelection.formattedLastEvent,
      lastEventAt: eventSelection.lastEventAt,
      lastEventKind: eventSelection.lastEventKind,
      lastCheckedAt: eventSelection.lastCheckedAt,
      uiRefreshedAt: eventSelection.uiRefreshedAt,
      timestampProvenance: eventSelection.provenance,
      orders24h: ordersMetric.formatted,
      orders24hCount: ordersMetric.count,
      orders24hProvenance: ordersMetric.provenance,
      note,
    };
  });

  let adaptersEmptyState: PlatformHealthViewModel["adaptersEmptyState"];
  if (
    adapterRows.length === 0 &&
    (adaptersSection.status === "initial" ||
      adaptersSection.status === "loading") &&
    (obs.status === "initial" || obs.status === "loading")
  ) {
    adaptersEmptyState = {
      kind: "loading",
      message: copy.loadingAdapters,
    };
  } else if (
    adapterRows.length === 0 &&
    (adaptersSection.status === "permission_denied" ||
      (!snapshot && obs.status === "permission_denied"))
  ) {
    adaptersEmptyState = {
      kind: "permission_denied",
      message: `${t("partnerNotification.permissionDenied", locale)} · ${adaptersSection.error ?? obs.error ?? copy.refreshError}`,
    };
  } else if (
    adapterRows.length === 0 &&
    (adaptersSection.status === "unavailable" ||
      (!snapshot && obs.status === "unavailable"))
  ) {
    adaptersEmptyState = {
      kind: "unavailable",
      message: t("adapterRegistry.unavailable", locale),
    };
  } else if (adapterRows.length === 0) {
    adaptersEmptyState = {
      kind: "empty",
      message: copy.adaptersEmpty,
    };
  } else {
    adaptersEmptyState = {
      kind: "none",
      message: "",
    };
  }

  const errorParts: string[] = [];
  if (obs.error) {
    const prefix =
      obs.status === "stale" && obs.sourceTimestamp
        ? `${getHealthStatusLabel(locale, "stale")} (${formatValidHealthTimestamp(obs.sourceTimestamp)}): `
        : "";
    errorParts.push(`${prefix}${obs.error}`);
  }
  if (adaptersSection.error && adaptersSection.error !== obs.error) {
    errorParts.push(adaptersSection.error);
  }
  if (
    ordersSection.error &&
    ordersSection.error !== obs.error &&
    ordersSection.error !== adaptersSection.error
  ) {
    errorParts.push(ordersSection.error);
  }

  const banner: PlatformHealthBannerModel | null =
    errorParts.length > 0
      ? {
          tone:
            obs.status === "ready" || obs.status === "stale"
              ? "warn"
              : "danger",
          title: copy.refreshError,
          body: errorParts.join(" · "),
        }
      : null;

  return {
    loading: isInitialOrLoading,
    observabilityStatus: obs.status,
    observabilityPosture: obs.posture,
    adaptersStatus: adaptersSection.status,
    forwardedOrdersStatus: ordersSection.status,
    sourceGeneratedAt: obs.sourceTimestamp,
    uiRefreshedAt: state.uiRefreshedAt,
    banner,
    kpis,
    platformAlerts,
    activeAlerts,
    alertsEmptyState,
    dispatchSummary,
    webhookSummary,
    filingSummary,
    forwarderOpsSummary: {
      totalForwardedOrders: snapshot
        ? snapshot.forwarderOps.totalForwardedOrders
        : null,
      syncFailedOrders: snapshot
        ? snapshot.forwarderOps.syncFailedOrders
        : null,
      acceptPendingOrders: snapshot
        ? snapshot.forwarderOps.acceptPendingOrders
        : null,
      manualFallbackQueue: snapshot
        ? snapshot.forwarderOps.manualFallbackQueue
        : null,
      reconciliationQueue: snapshot
        ? snapshot.forwarderOps.reconciliationQueue
        : null,
    },
    adapterRows,
    adaptersEmptyState,
  };
}

export function formatAlertMeasure(
  locale: Locale,
  alert: OperationalAlertRecord,
): string {
  return formatHealthMetricValue(
    locale,
    alert.measuredValue,
    alert.thresholds.unit,
  );
}

export function formatAlertTitle(
  locale: Locale,
  key: OperationalAlertRecord["key"],
): string {
  return getHealthAlertTitle(locale, key);
}

export function formatAlertRoute(
  locale: Locale,
  routes: OperationalAlertRecord["routes"],
): string {
  return routes
    .map((route) => getHealthAlertRouteLabel(locale, route))
    .join(" · ");
}
