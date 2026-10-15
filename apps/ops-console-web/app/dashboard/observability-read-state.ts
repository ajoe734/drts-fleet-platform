import type {
  EmptyStateEnvelope,
  OperationalAdapterDetailRecord,
  OperationalAlertRecord,
  OperationalObservabilitySnapshot,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";
import { formatOpsCodeLabel } from "../../lib/localized-labels";
import { formatCompactNumber } from "../../lib/ops-analytics";
import { t, type Locale } from "../../lib/translations";

export const OPS_DASHBOARD_REFRESH_WINDOW_MS = 15_000;

export type OpsObservabilityReadStatus =
  | "initial"
  | "loading"
  | "permission_denied"
  | "unavailable"
  | "stale"
  | "ready";

export type OpsObservabilityDataPosture =
  | "unknown"
  | "empty"
  | "successful_zero"
  | "nonzero";

export type OpsErrorClassification = "permission_denied" | "unavailable";

export interface OpsLivenessPayload {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
}

export interface OpsEnvelopeLike<T> {
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

export interface OpsObservabilityReadState {
  status: OpsObservabilityReadStatus;
  posture: OpsObservabilityDataPosture;
  snapshot: OperationalObservabilitySnapshot | null;
  sourceGeneratedAt: string | null;
  envelopeTimestamp: string | null;
  uiRefreshedAt: string | null;
  error: string | null;
  errorCode: string | null;
  errorStatusCode: number | null;
  staleReason: OpsErrorClassification | null;
}

export interface OpsSignalItem {
  label: string;
  value: string;
  tone: CanvasTone;
}

export interface OpsStaleLocationKpiModel {
  value: string;
  delta: string | undefined;
  deltaTone: "up" | "down" | "neutral";
  hint: string | undefined;
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

export function parseValidOpsTimestamp(
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

export function classifyOpsReadError(error: unknown): {
  status: OpsErrorClassification;
  code: string | null;
  statusCode: number | null;
  message: string;
} {
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

export function computeOpsObservabilityPosture(
  snapshot: OperationalObservabilitySnapshot | null,
): OpsObservabilityDataPosture {
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
    snapshot.forwarderOps.acceptPendingOrders > 0;

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

export function createInitialOpsObservabilityReadState(): OpsObservabilityReadState {
  return {
    status: "initial",
    posture: "unknown",
    snapshot: null,
    sourceGeneratedAt: null,
    envelopeTimestamp: null,
    uiRefreshedAt: null,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    staleReason: null,
  };
}

export function createLoadingOpsObservabilityReadState(
  priorState?: OpsObservabilityReadState | null,
): OpsObservabilityReadState {
  if (priorState?.snapshot && priorState.sourceGeneratedAt) {
    return {
      ...priorState,
    };
  }
  return {
    status: "loading",
    posture: "unknown",
    snapshot: null,
    sourceGeneratedAt: null,
    envelopeTimestamp: null,
    uiRefreshedAt: priorState?.uiRefreshedAt ?? null,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    errorClassification: undefined,
    staleReason: null,
  } as OpsObservabilityReadState;
}

function isEnvelopeLike(
  value: unknown,
): value is OpsEnvelopeLike<OperationalObservabilitySnapshot> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "data" in (value as Record<string, unknown>) &&
    Boolean((value as Record<string, unknown>).data)
  );
}

export function resolveOpsObservabilityReadState(
  result: PromiseSettledResult<
    | OpsEnvelopeLike<OperationalObservabilitySnapshot>
    | OperationalObservabilitySnapshot
  >,
  options?: {
    priorState?: OpsObservabilityReadState | null;
    uiRefreshedAt?: string | null;
  },
): OpsObservabilityReadState {
  const prior = options?.priorState ?? null;
  const uiRefreshedAt = options?.uiRefreshedAt ?? null;

  if (result.status === "rejected") {
    const classified = classifyOpsReadError(result.reason);
    if (prior?.snapshot && prior.sourceGeneratedAt) {
      return {
        status: "stale",
        posture: prior.posture,
        snapshot: prior.snapshot,
        sourceGeneratedAt: prior.sourceGeneratedAt,
        envelopeTimestamp: prior.envelopeTimestamp,
        uiRefreshedAt,
        error: classified.message,
        errorCode: classified.code,
        errorStatusCode: classified.statusCode,
        staleReason: classified.status,
      };
    }

    return {
      status: classified.status,
      posture: "unknown",
      snapshot: null,
      sourceGeneratedAt: null,
      envelopeTimestamp: null,
      uiRefreshedAt,
      error: classified.message,
      errorCode: classified.code,
      errorStatusCode: classified.statusCode,
      staleReason: null,
    };
  }

  const rawValue = result.value;
  const snapshot = isEnvelopeLike(rawValue) ? rawValue.data : rawValue;
  const rawEnvelopeTimestamp = isEnvelopeLike(rawValue)
    ? rawValue.meta?.timestamp ?? null
    : null;

  const validSourceMs = parseValidOpsTimestamp(snapshot?.generatedAt);
  if (!snapshot || validSourceMs === null) {
    return resolveOpsObservabilityReadState(
      {
        status: "rejected",
        reason: new Error(
          "Invalid or missing operational observability generatedAt timestamp",
        ),
      },
      options,
    );
  }

  const validEnvelopeTimestamp =
    parseValidOpsTimestamp(rawEnvelopeTimestamp) !== null
      ? rawEnvelopeTimestamp
      : snapshot.generatedAt;

  return {
    status: "ready",
    posture: computeOpsObservabilityPosture(snapshot),
    snapshot,
    sourceGeneratedAt: snapshot.generatedAt,
    envelopeTimestamp: validEnvelopeTimestamp,
    uiRefreshedAt,
    error: null,
    errorCode: null,
    errorStatusCode: null,
    staleReason: null,
  };
}

export async function loadOpsObservabilityReadState(
  loader: () => Promise<
    | OpsEnvelopeLike<OperationalObservabilitySnapshot>
    | OperationalObservabilitySnapshot
  >,
  options?: {
    priorState?: OpsObservabilityReadState | null;
    uiRefreshedAt?: string | null;
  },
): Promise<OpsObservabilityReadState> {
  const uiRefreshedAt =
    options?.uiRefreshedAt !== undefined
      ? options.uiRefreshedAt
      : new Date().toISOString();
  const [settled] = await Promise.allSettled([loader()]);
  return resolveOpsObservabilityReadState(settled, {
    priorState: options?.priorState ?? null,
    uiRefreshedAt,
  });
}

export function selectOpsActiveAlerts(
  snapshot: OperationalObservabilitySnapshot | null,
): OperationalAlertRecord[] {
  if (!snapshot) {
    return [];
  }

  const opsAlertKeys = new Set(
    snapshot.roleViews.find((view) => view.route === "ops")?.alertKeys ?? [],
  );

  return snapshot.alerts
    .filter(
      (alert) =>
        (opsAlertKeys.has(alert.key) || alert.routes.includes("ops")) &&
        alert.state !== "healthy",
    )
    .sort(
      (left, right) =>
        ALERT_SEVERITY_ORDER[left.state] - ALERT_SEVERITY_ORDER[right.state],
    );
}

export function buildOpsHealthEnvelope(
  health: OpsLivenessPayload,
  observabilityState: OpsObservabilityReadState,
): UiHealthEnvelope {
  const degradedServices: UiHealthEnvelope["degradedServices"] = [];

  if (health.status !== "healthy") {
    degradedServices.push({
      service: health.service || "api",
      impact:
        health.status === "down"
          ? "dashboard.section.banner.serviceImpact.unavailable"
          : "dashboard.section.banner.serviceImpact.stale",
      severity: health.status === "down" ? "critical" : "warning",
    });
  }

  if (observabilityState.status !== "ready") {
    const impact =
      observabilityState.status === "permission_denied"
        ? "permission_denied"
        : observabilityState.status === "stale"
          ? "dashboard.section.banner.serviceImpact.stale"
          : "dashboard.section.banner.serviceImpact.unavailable";
    degradedServices.push({
      service: "operational-observability",
      impact,
      severity: "warning",
    });
  }

  const adapters = observabilityState.snapshot?.adapterDetails ?? [];
  for (const adapter of adapters.filter((item) => item.status !== "healthy")) {
    degradedServices.push({
      service: adapter.platformCode,
      impact: adapter.reason,
      severity: adapter.status === "down" ? "critical" : "warning",
    });
  }

  const validCheckedAt =
    parseValidOpsTimestamp(health.timestamp) !== null ? health.timestamp : "";

  return {
    status:
      health.status === "down"
        ? "down"
        : degradedServices.length > 0
          ? "degraded"
          : "healthy",
    degradedServices,
    lastCheckedAt: validCheckedAt,
  };
}

export function getOldestValidOpsTimestamp(
  timestamps: ReadonlyArray<string | null | undefined>,
): string | null {
  const validEntries: Array<{ raw: string; ms: number }> = [];
  for (const raw of timestamps) {
    const ms = parseValidOpsTimestamp(raw);
    if (ms !== null && typeof raw === "string") {
      validEntries.push({ raw, ms });
    }
  }
  if (validEntries.length === 0) {
    return null;
  }
  validEntries.sort((left, right) => left.ms - right.ms);
  return validEntries[0]!.raw;
}

export function buildOpsRefreshMetadata(input: {
  observabilityState: OpsObservabilityReadState;
  otherSourceTimestamps?: ReadonlyArray<string | null | undefined>;
  healthEnvelope: UiHealthEnvelope;
  nowMs?: number;
  staleAfterMs?: number;
}): UiRefreshMetadata {
  const {
    observabilityState,
    otherSourceTimestamps = [],
    healthEnvelope,
    nowMs = Date.now(),
    staleAfterMs = OPS_DASHBOARD_REFRESH_WINDOW_MS,
  } = input;

  if (
    observabilityState.status === "initial" ||
    observabilityState.status === "loading" ||
    observabilityState.status === "permission_denied" ||
    observabilityState.status === "unavailable" ||
    !observabilityState.sourceGeneratedAt
  ) {
    return {
      generatedAt: "",
      staleAfterMs,
      dataFreshness: healthEnvelope.status === "down" ? "degraded" : "unknown",
      source: "static",
    };
  }

  if (observabilityState.status === "stale") {
    return {
      generatedAt: observabilityState.sourceGeneratedAt,
      staleAfterMs,
      dataFreshness: healthEnvelope.status === "down" ? "degraded" : "stale",
      source: "cache",
    };
  }

  const oldestTimestamp =
    getOldestValidOpsTimestamp([
      observabilityState.sourceGeneratedAt,
      ...otherSourceTimestamps,
    ]) ?? observabilityState.sourceGeneratedAt;

  const generatedMs = parseValidOpsTimestamp(oldestTimestamp);
  const ageMs =
    generatedMs !== null ? Math.max(0, nowMs - generatedMs) : Number.POSITIVE_INFINITY;

  return {
    generatedAt: oldestTimestamp,
    staleAfterMs,
    dataFreshness:
      healthEnvelope.status === "down"
        ? "degraded"
        : ageMs > staleAfterMs
          ? "stale"
          : "fresh",
    source: healthEnvelope.status === "down" ? "cache" : "live",
  };
}

export function resolveOpsAdapterEmptyState(
  observabilityState: OpsObservabilityReadState,
): EmptyStateEnvelope {
  if (observabilityState.status === "permission_denied") {
    return {
      reason: "permission_denied",
      messageCode: "dashboard.adapters.permission_denied",
    };
  }
  if (observabilityState.status === "stale") {
    return {
      reason: "external_unavailable",
      messageCode: "dashboard.adapters.stale",
    };
  }
  if (observabilityState.status !== "ready") {
    return {
      reason: "fetch_failed",
      messageCode: "dashboard.adapters.fetch_failed",
    };
  }
  return {
    reason: "not_provisioned",
    messageCode: "dashboard.adapters.not_provisioned",
  };
}

export function resolveOpsStaleLocationKpi(input: {
  observabilityState: OpsObservabilityReadState;
  offlineVehicles: number;
  locale: Locale;
}): OpsStaleLocationKpiModel {
  const { observabilityState, offlineVehicles, locale } = input;
  const snapshot = observabilityState.snapshot;

  if (!snapshot) {
    const statusLabel =
      observabilityState.status === "permission_denied"
        ? formatOpsCodeLabel(locale, "permission_denied")
        : t("dashboard.freshness.unknown", locale);
    return {
      value: "—",
      delta: statusLabel,
      deltaTone: "neutral",
      hint: undefined,
    };
  }

  const staleCount = snapshot.driverState.staleLocationDrivers;
  const isStale = observabilityState.status === "stale";
  const staleDelta =
    staleCount > 0
      ? t("dashboard.kpi.staleLocation.delta", locale, {
          count: formatCompactNumber(staleCount),
        })
      : undefined;
  const delta = isStale
    ? [t("dashboard.freshness.stale", locale), staleDelta]
        .filter(Boolean)
        .join(" · ")
    : staleDelta;

  const hint =
    snapshot.driverState.oldestLocationLagMinutes !== null
      ? t("dashboard.kpi.staleLocation.oldest", locale, {
          minutes: snapshot.driverState.oldestLocationLagMinutes,
        })
      : undefined;

  return {
    value: formatCompactNumber(staleCount),
    delta,
    deltaTone:
      isStale || staleCount > 0 || offlineVehicles > 0 ? "down" : "neutral",
    hint,
  };
}

function getOpsSignalTone(status: string): CanvasTone {
  if (status === "healthy" || status === "ok") {
    return "success";
  }
  if (status === "warning" || status === "degraded") {
    return "warn";
  }
  if (status === "critical" || status === "down") {
    return "danger";
  }
  return "info";
}

export function buildOpsObservabilitySignals(input: {
  observabilityState: OpsObservabilityReadState;
  sortedAdapterDetails: OperationalAdapterDetailRecord[];
  identity: { realm?: string; actorType?: string } | null;
  health: OpsLivenessPayload;
  locale: Locale;
}): OpsSignalItem[] {
  const {
    observabilityState,
    sortedAdapterDetails,
    identity,
    health,
    locale,
  } = input;
  const snapshot = observabilityState.snapshot;
  const topAdapter = sortedAdapterDetails[0] ?? null;
  const healthSignalAdapters = sortedAdapterDetails.slice(0, 2);

  if (!snapshot) {
    const unavailableText =
      observabilityState.status === "permission_denied"
        ? formatOpsCodeLabel(locale, "permission_denied")
        : t("dashboard.freshness.unknown", locale);
    const unavailableTone: CanvasTone =
      observabilityState.status === "permission_denied" ? "warn" : "danger";

    return [
      {
        label: t("dashboard.health.dispatchLag.label", locale),
        value: unavailableText,
        tone: unavailableTone,
      },
      {
        label: t("dashboard.health.webhookP95.label", locale),
        value: unavailableText,
        tone: unavailableTone,
      },
      {
        label: t("dashboard.health.credential.default", locale),
        value: unavailableText,
        tone: "warn",
      },
      {
        label: t("dashboard.health.identityRuntime", locale),
        value: `${identity?.realm ?? "ops"} / ${identity?.actorType ?? "ops_user"} · ${formatOpsCodeLabel(locale, health.status)}`,
        tone: getOpsSignalTone(health.status),
      },
    ];
  }

  const isStale = observabilityState.status === "stale";
  const staleSuffix = isStale
    ? ` (${t("dashboard.freshness.stale", locale)})`
    : "";

  const dispatchLagRaw =
    snapshot.dispatch.oldestReadyOrderLagMinutes !== null
      ? t("dashboard.health.dispatchLag.minutes", locale, {
          minutes: snapshot.dispatch.oldestReadyOrderLagMinutes,
        })
      : t("dashboard.health.dispatchLag.withinSla", locale);
  const dispatchLagWarn =
    Boolean(
      snapshot.dispatch.oldestReadyOrderLagMinutes &&
        snapshot.dispatch.oldestReadyOrderLagMinutes > 10,
    ) || snapshot.dispatch.laggedOrders > 0;

  const webhookRaw =
    snapshot.webhook.oldestQueuedDeliveryLagMinutes !== null
      ? t("dashboard.health.webhookP95.queued", locale, {
          minutes: snapshot.webhook.oldestQueuedDeliveryLagMinutes,
        })
      : t("dashboard.health.webhookP95.healthy", locale);
  const webhookWarn =
    snapshot.webhook.failedDeliveriesLastHour > 0 ||
    snapshot.webhook.oldestQueuedDeliveryLagMinutes !== null;

  const credentialRaw = topAdapter
    ? topAdapter.credentialStatus !== "valid"
      ? formatOpsCodeLabel(locale, topAdapter.credentialStatus)
      : formatOpsCodeLabel(locale, topAdapter.authStatus)
    : "—";
  const credentialDanger = Boolean(
    topAdapter &&
      (topAdapter.credentialStatus !== "valid" ||
        topAdapter.authStatus !== "authenticated"),
  );

  const activeOpsAlerts = selectOpsActiveAlerts(snapshot);

  return [
    {
      label: t("dashboard.health.dispatchLag.label", locale),
      value: `${dispatchLagRaw}${staleSuffix}`,
      tone: dispatchLagWarn || isStale ? "warn" : "success",
    },
    {
      label: t("dashboard.health.webhookP95.label", locale),
      value: `${webhookRaw}${staleSuffix}`,
      tone: webhookWarn || isStale ? "warn" : "success",
    },
    ...healthSignalAdapters.map((adapter) => ({
      label: t("dashboard.health.forwarder.label", locale, {
        platform: formatOpsCodeLabel(locale, adapter.platformCode),
      }),
      value: `${formatOpsCodeLabel(locale, adapter.status)}${staleSuffix}`,
      tone:
        isStale && adapter.status === "healthy"
          ? ("warn" as const)
          : getOpsSignalTone(adapter.status),
    })),
    ...activeOpsAlerts.map((alert) => ({
      label: formatOpsCodeLabel(locale, alert.key),
      value: `${formatOpsCodeLabel(locale, alert.state)}${staleSuffix}`,
      tone: getOpsSignalTone(alert.state),
    })),
    {
      label:
        topAdapter?.credentialStatus && topAdapter.credentialStatus !== "valid"
          ? t("dashboard.health.credential.platform", locale, {
              platform: formatOpsCodeLabel(locale, topAdapter.platformCode),
            })
          : t("dashboard.health.credential.default", locale),
      value: `${credentialRaw}${staleSuffix}`,
      tone: credentialDanger ? "danger" : isStale ? "warn" : "success",
    },
    {
      label: t("dashboard.health.identityRuntime", locale),
      value: `${identity?.realm ?? "ops"} / ${identity?.actorType ?? "ops_user"} · ${formatOpsCodeLabel(locale, health.status)}`,
      tone: getOpsSignalTone(health.status),
    },
  ];
}
