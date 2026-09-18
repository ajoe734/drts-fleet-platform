import {
  REALM_COLORS,
  STATUS_TONES,
  type ToneRamp,
} from "@drts/ui-tokens";

export interface UiCostLedgerItem {
  serviceType: string;
  provider: string;
  model?: string | undefined;
  quantity: number;
  billingUnit: string;
  unitPrice: number;
  estimatedCost: number;
  actualCost?: number | undefined;
  variance?: number | undefined;
  currency: string;
  unverified: boolean;
}

export interface UiCohortMetricsView {
  windowLabel: string;
  observationWindowClosed: boolean;
  totalIngressCalls: number;
  enteredAiCalls: number;
  coverageRateFormatted: string;
  effectiveIntakeCount: number;
  effectiveIntakeRateFormatted: string;
  driverAcceptedOrdersCount: number;
  dispatchRateFormatted: string;
  humanTransferRateFormatted: string;
  errorBookingRateFormatted: string;
  costPerEffectiveIntakeFormatted: string;
  costPerSuccessfulDispatchFormatted: string;
  costPerSuccessfulDispatchStatus: "settled" | "pending_observation_window";
  pendingReason?: string | undefined;
}

export interface UiDimensionalAlertBadge {
  alertId: string;
  alertName: string;
  severity: "critical" | "high" | "warning";
  language: string;
  routeProfileVersion: number;
  provider: string;
  brandId: string;
  summary: string;
  realmColor: ToneRamp;
  severityColor: ToneRamp;
}

export interface UiCallbackSlaSummary {
  totalCallbacks: number;
  completedWithinSla: number;
  breachedCount: number;
  complianceRateFormatted: string;
  averageFirstContactMinutes?: string | undefined;
  statusTone: "success" | "warning" | "danger";
}

/**
 * Formats a monetary amount into a clean currency string.
 */
export function formatVoiceCost(
  amount: number | null | undefined,
  currency = "TWD",
): string {
  if (amount === null || amount === undefined) {
    return "--";
  }
  return `${amount.toFixed(2)} ${currency}`;
}

/**
 * Derives UI view for SA §10.2 cohort metrics.
 * Separates autonomous intake rate from actual driver dispatch completion rate.
 */
export function deriveCohortMetricsPresentation(params: {
  windowStart: string;
  windowEnd: string;
  observationWindowClosed: boolean;
  totalRealIngress: number;
  callsEnteredAi: number;
  expressedBookingIntent: number;
  validBookingIntakes: number;
  immediateDispatchOrders: number;
  driverAcceptedOrders: number;
  transferCalls: number;
  errorBookings: number;
  totalCostTwd: number;
}): UiCohortMetricsView {
  const coverageRate =
    params.totalRealIngress > 0
      ? (params.callsEnteredAi / params.totalRealIngress) * 100
      : 0;

  const intakeRate =
    params.expressedBookingIntent > 0
      ? (params.validBookingIntakes / params.expressedBookingIntent) * 100
      : 0;

  const dispatchRate =
    params.immediateDispatchOrders > 0
      ? (params.driverAcceptedOrders / params.immediateDispatchOrders) * 100
      : 0;

  const transferRate =
    params.callsEnteredAi > 0
      ? (params.transferCalls / params.callsEnteredAi) * 100
      : 0;

  const errorRate =
    params.immediateDispatchOrders > 0
      ? (params.errorBookings / params.immediateDispatchOrders) * 100
      : 0;

  // Cost per effective intake: null if 0 intakes, NEVER 0 TWD (SA §10.2)
  let costPerIntakeStr = "--";
  if (params.validBookingIntakes > 0) {
    if (params.totalCostTwd <= 0) {
      costPerIntakeStr = "N/A (尚無成本資料)";
    } else {
      const costPerIntake = params.totalCostTwd / params.validBookingIntakes;
      costPerIntakeStr = `${costPerIntake.toFixed(2)} TWD`;
    }
  } else {
    costPerIntakeStr = "N/A (無受理單)";
  }

  // Cost per successful dispatch: requires observation window closed (SA §10.2)
  let costPerDispatchStr = "--";
  let costStatus: "settled" | "pending_observation_window" = "settled";
  let pendingReason: string | undefined = undefined;

  if (!params.observationWindowClosed) {
    costStatus = "pending_observation_window";
    costPerDispatchStr = "待觀察窗口結算";
    pendingReason =
      "需等待固定觀察窗口結束，避免最近來電尚未派車造成偏差 (SA §10.2)";
  } else if (params.driverAcceptedOrders > 0) {
    if (params.totalCostTwd <= 0) {
      costPerDispatchStr = "N/A (尚無成本資料)";
    } else {
      const costPerDispatch =
        params.totalCostTwd / params.driverAcceptedOrders;
      costPerDispatchStr = `${costPerDispatch.toFixed(2)} TWD`;
    }
  } else {
    costPerDispatchStr = "N/A (無成功派車)";
  }

  return {
    windowLabel: `${params.windowStart.slice(0, 10)} ~ ${params.windowEnd.slice(0, 10)}`,
    observationWindowClosed: params.observationWindowClosed,
    totalIngressCalls: params.totalRealIngress,
    enteredAiCalls: params.callsEnteredAi,
    coverageRateFormatted: `${coverageRate.toFixed(1)}%`,
    effectiveIntakeCount: params.validBookingIntakes,
    effectiveIntakeRateFormatted: `${intakeRate.toFixed(1)}%`,
    driverAcceptedOrdersCount: params.driverAcceptedOrders,
    dispatchRateFormatted: `${dispatchRate.toFixed(1)}%`,
    humanTransferRateFormatted: `${transferRate.toFixed(1)}%`,
    errorBookingRateFormatted: `${errorRate.toFixed(2)}%`,
    costPerEffectiveIntakeFormatted: costPerIntakeStr,
    costPerSuccessfulDispatchFormatted: costPerDispatchStr,
    costPerSuccessfulDispatchStatus: costStatus,
    pendingReason,
  };
}

/**
 * Transforms a backend VoiceCohortMetricsReport into a UiCohortMetricsView.
 */
export function adaptCohortReportToUiView(report: any): UiCohortMetricsView {
  const windowStart = report?.cohortWindow?.windowStart ?? "";
  const windowEnd = report?.cohortWindow?.windowEnd ?? "";
  const windowLabel =
    windowStart && windowEnd
      ? `${windowStart.slice(0, 10)} ~ ${windowEnd.slice(0, 10)}`
      : "--";
  const observationWindowClosed = Boolean(
    report?.cohortWindow?.observationWindowClosed ?? true,
  );

  let costPerIntakeStr = "--";
  if (
    report?.costPerEffectiveIntake?.cost !== null &&
    report?.costPerEffectiveIntake?.cost !== undefined &&
    Number(report.costPerEffectiveIntake.cost) > 0
  ) {
    costPerIntakeStr = `${Number(report.costPerEffectiveIntake.cost).toFixed(2)} TWD`;
  } else if (report?.costPerEffectiveIntake?.zeroDenominatorReason) {
    costPerIntakeStr = `N/A (${report.costPerEffectiveIntake.zeroDenominatorReason})`;
  } else if (
    report?.unattendedEffectiveIntake?.numeratorValidIntakes === 0 ||
    report?.costPerEffectiveIntake?.denominatorValidIntakes === 0
  ) {
    costPerIntakeStr = "N/A (無受理單)";
  } else {
    costPerIntakeStr = "N/A (尚無成本資料)";
  }

  let costPerDispatchStr = "--";
  const costStatus: "settled" | "pending_observation_window" =
    report?.costPerSuccessfulDispatch?.status === "pending_observation_window"
      ? "pending_observation_window"
      : "settled";

  if (costStatus === "pending_observation_window") {
    costPerDispatchStr = "待觀察窗口結算";
  } else if (
    report?.costPerSuccessfulDispatch?.cost !== null &&
    report?.costPerSuccessfulDispatch?.cost !== undefined &&
    Number(report.costPerSuccessfulDispatch.cost) > 0
  ) {
    costPerDispatchStr = `${Number(report.costPerSuccessfulDispatch.cost).toFixed(2)} TWD`;
  } else if (
    report?.unattendedDispatchCompletion?.numeratorDriverAcceptedUniqueOrders === 0 ||
    report?.costPerSuccessfulDispatch?.denominatorDriverAcceptedOrders === 0
  ) {
    costPerDispatchStr = "N/A (無成功派車)";
  } else {
    costPerDispatchStr = "N/A (尚無成本資料)";
  }

  return {
    windowLabel,
    observationWindowClosed,
    totalIngressCalls: Number(report?.allCallCoverage?.denominatorRealIngress ?? 0),
    enteredAiCalls: Number(report?.allCallCoverage?.numeratorEnteredAi ?? 0),
    coverageRateFormatted: `${Number(report?.allCallCoverage?.rate ?? 0).toFixed(1)}%`,
    effectiveIntakeCount: Number(report?.unattendedEffectiveIntake?.numeratorValidIntakes ?? 0),
    effectiveIntakeRateFormatted: `${Number(report?.unattendedEffectiveIntake?.rate ?? 0).toFixed(1)}%`,
    driverAcceptedOrdersCount: Number(
      report?.unattendedDispatchCompletion?.numeratorDriverAcceptedUniqueOrders ?? 0,
    ),
    dispatchRateFormatted: `${Number(report?.unattendedDispatchCompletion?.rate ?? 0).toFixed(1)}%`,
    humanTransferRateFormatted: `${Number(report?.humanTransfer?.rate ?? 0).toFixed(1)}%`,
    errorBookingRateFormatted: `${Number(report?.errorBooking?.rate ?? 0).toFixed(2)}%`,
    costPerEffectiveIntakeFormatted: costPerIntakeStr,
    costPerSuccessfulDispatchFormatted: costPerDispatchStr,
    costPerSuccessfulDispatchStatus: costStatus,
    pendingReason: report?.costPerSuccessfulDispatch?.pendingReason,
  };
}

/**
 * Maps a backend VoiceUsageRecord to a UiCostLedgerItem.
 */
export function mapVoiceUsageRecordToUiItem(r: any): UiCostLedgerItem {
  const estimated = Number(r?.estimatedCost ?? 0);
  const actual =
    r?.actualCost !== undefined && r?.actualCost !== null
      ? Number(r.actualCost)
      : undefined;
  const variance =
    actual !== undefined ? actual - estimated : undefined;
  const qty = Number(r?.quantity ?? 1);
  const unitPrice =
    r?.unitPrice !== undefined
      ? Number(r.unitPrice)
      : qty > 0
        ? estimated / qty
        : estimated;

  return {
    serviceType: String(r?.serviceType ?? "unknown"),
    provider: String(r?.provider ?? "unknown"),
    model: r?.model ? String(r.model) : undefined,
    quantity: qty,
    billingUnit: String(r?.billingUnit ?? "call"),
    unitPrice,
    estimatedCost: estimated,
    actualCost: actual,
    variance,
    currency: String(r?.currency ?? "TWD"),
    unverified: Boolean(r?.unverified),
  };
}

/**
 * Derives UI presentation for a dimensional alert item.
 * Realm tokens from @drts/ui-tokens are used for badge styling.
 */
export function deriveDimensionalAlertPresentation(params: {
  alertId: string;
  alertName: string;
  severity: "critical" | "high" | "warning";
  language: string;
  routeProfileVersion: number;
  provider: string;
  brandId: string;
  summary: string;
  mode?: "light" | "dark" | undefined;
}): UiDimensionalAlertBadge {
  const mode = params.mode ?? "dark";
  const tenantRealm = REALM_COLORS.tenant[mode];

  // Severity colors strictly from @drts/ui-tokens STATUS_TONES
  let severityColor: ToneRamp;
  if (params.severity === "critical") {
    severityColor = STATUS_TONES.danger[mode];
  } else if (params.severity === "high") {
    severityColor = STATUS_TONES.warning[mode];
  } else {
    severityColor = STATUS_TONES.info[mode];
  }

  return {
    alertId: params.alertId,
    alertName: params.alertName,
    severity: params.severity,
    language: params.language,
    routeProfileVersion: params.routeProfileVersion,
    provider: params.provider,
    brandId: params.brandId,
    summary: params.summary,
    realmColor: tenantRealm,
    severityColor,
  };
}

/**
 * Derives UI presentation for human callback SLA tracking.
 */
export function deriveCallbackSlaPresentation(params: {
  totalCallbacks: number;
  completedCount: number;
  breachedCount: number;
  averageFirstContactSeconds?: number | null | undefined;
}): UiCallbackSlaSummary {
  const completedWithinSla = Math.max(
    0,
    params.completedCount - params.breachedCount,
  );
  const compliance =
    params.totalCallbacks > 0
      ? ((params.totalCallbacks - params.breachedCount) /
          params.totalCallbacks) *
        100
      : 100;

  let statusTone: "success" | "warning" | "danger" = "success";
  if (compliance < 85) {
    statusTone = "danger";
  } else if (compliance < 95) {
    statusTone = "warning";
  }

  const avgMins =
    params.averageFirstContactSeconds !== null &&
    params.averageFirstContactSeconds !== undefined
      ? `${(params.averageFirstContactSeconds / 60).toFixed(1)} 分鐘`
      : undefined;

  return {
    totalCallbacks: params.totalCallbacks,
    completedWithinSla,
    breachedCount: params.breachedCount,
    complianceRateFormatted: `${compliance.toFixed(1)}%`,
    averageFirstContactMinutes: avgMins,
    statusTone,
  };
}

/**
 * Explicit shared observation window for the cohort + usage ledger queries.
 * Both endpoints must be called with the identical window so KPIs and cost
 * totals are never computed against mismatched slices of time.
 */
export interface VoiceObservationWindow {
  windowStart: string;
  windowEnd: string;
  observationWindowClosed: boolean;
}

export interface VoiceDimensionFilter {
  language?: string | undefined;
  routeProfileVersion?: number | undefined;
  provider?: string | undefined;
  brandId?: string | undefined;
}

/**
 * A trailing window ending "now" is still accumulating calls; it must never
 * be reported to the cohort endpoint as a closed/settled observation window
 * (the backend defaults omitted windows to closed=true, which would mislabel
 * cost-per-dispatch as settled before it is).
 */
export function buildDefaultVoiceObservationWindow(
  now: Date = new Date(),
): VoiceObservationWindow {
  return {
    windowStart: new Date(now.getTime() - 86400000).toISOString(),
    windowEnd: now.toISOString(),
    observationWindowClosed: false,
  };
}

export function buildVoiceCohortQueryParams(
  window: VoiceObservationWindow,
  dims: VoiceDimensionFilter = {},
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("windowStart", window.windowStart);
  params.set("windowEnd", window.windowEnd);
  params.set(
    "observationWindowClosed",
    String(window.observationWindowClosed),
  );
  if (dims.language) params.set("language", dims.language);
  if (dims.routeProfileVersion !== undefined) {
    params.set("routeProfileVersion", String(dims.routeProfileVersion));
  }
  if (dims.provider) params.set("provider", dims.provider);
  if (dims.brandId) params.set("brandId", dims.brandId);
  return params;
}

export function buildVoiceUsageQueryParams(
  window: VoiceObservationWindow,
  dims: VoiceDimensionFilter = {},
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("windowStart", window.windowStart);
  params.set("windowEnd", window.windowEnd);
  if (dims.language) params.set("language", dims.language);
  if (dims.provider) params.set("provider", dims.provider);
  if (dims.brandId) params.set("brandId", dims.brandId);
  // routeProfileVersion is intentionally omitted: the usage ledger contract
  // does not carry a route-profile-version field on raw metering rows.
  return params;
}

export type VoiceMetricsSectionStatus = "fresh" | "stale" | "unavailable";

export interface VoiceMetricsLoadResult {
  serverCohort: UiCohortMetricsView | null;
  usageRecords: UiCostLedgerItem[];
  cohortStatus: VoiceMetricsSectionStatus;
  usageStatus: VoiceMetricsSectionStatus;
  cohortErrorMessage: string | null;
  usageErrorMessage: string | null;
}

export interface VoiceMetricsTransportClient {
  get<T>(path: string): Promise<T>;
}

function describeVoiceTransportFailure(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return typeof reason === "string" ? reason : "unknown transport failure";
}

/**
 * Fetches call-cohort and usage-ledger data for the given shared observation
 * window/dimension filter. On transport failure the previous section value
 * is retained but the returned status is explicitly "stale" (if there was
 * previous data) or "unavailable" (if there wasn't) — a failed refresh is
 * never silently reported as fresh/healthy, and the denominator is never
 * fabricated as zero.
 */
export async function loadVoiceCohortAndUsage(
  client: VoiceMetricsTransportClient,
  window: VoiceObservationWindow,
  dims: VoiceDimensionFilter,
  previous: {
    serverCohort: UiCohortMetricsView | null;
    usageRecords: UiCostLedgerItem[];
  },
): Promise<VoiceMetricsLoadResult> {
  const cohortQuery = buildVoiceCohortQueryParams(window, dims);
  const usageQuery = buildVoiceUsageQueryParams(window, dims);

  const [cohortSettled, usageSettled] = await Promise.allSettled([
    client.get<any>(
      `/api/callcenter/voice/metrics/cohort?${cohortQuery.toString()}`,
    ),
    client.get<any>(
      `/api/callcenter/voice/usage/records?${usageQuery.toString()}`,
    ),
  ]);

  let serverCohort = previous.serverCohort;
  let cohortStatus: VoiceMetricsSectionStatus = "fresh";
  let cohortErrorMessage: string | null = null;
  if (cohortSettled.status === "fulfilled" && cohortSettled.value) {
    const raw = cohortSettled.value;
    serverCohort =
      raw && typeof raw === "object" && "allCallCoverage" in raw
        ? adaptCohortReportToUiView(raw)
        : (raw as UiCohortMetricsView);
  } else {
    cohortStatus = previous.serverCohort ? "stale" : "unavailable";
    cohortErrorMessage =
      cohortSettled.status === "rejected"
        ? describeVoiceTransportFailure(cohortSettled.reason)
        : "cohort metrics response was empty";
  }

  let usageRecords = previous.usageRecords;
  let usageStatus: VoiceMetricsSectionStatus = "fresh";
  let usageErrorMessage: string | null = null;
  if (usageSettled.status === "fulfilled" && usageSettled.value) {
    const raw = usageSettled.value;
    const rawItems = Array.isArray(raw) ? raw : raw?.items;
    if (Array.isArray(rawItems)) {
      usageRecords = rawItems.map(mapVoiceUsageRecordToUiItem);
    } else {
      usageStatus = previous.usageRecords.length > 0 ? "stale" : "unavailable";
      usageErrorMessage = "usage ledger response was malformed";
    }
  } else {
    usageStatus = previous.usageRecords.length > 0 ? "stale" : "unavailable";
    usageErrorMessage =
      usageSettled.status === "rejected"
        ? describeVoiceTransportFailure(usageSettled.reason)
        : "usage ledger response was empty";
  }

  return {
    serverCohort,
    usageRecords,
    cohortStatus,
    usageStatus,
    cohortErrorMessage,
    usageErrorMessage,
  };
}
