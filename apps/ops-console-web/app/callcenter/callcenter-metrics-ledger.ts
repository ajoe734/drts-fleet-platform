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
 * Wire shape of GET callcenter/voice/metrics/cohort
 * (apps/api VoiceCohortMetricsReport, camelCased by the API client).
 */
export interface VoiceCohortMetricsReportWire {
  cohortWindow: {
    windowStart: string;
    windowEnd: string;
    observationWindowClosed: boolean;
  };
  allCallCoverage: {
    rate: number;
    numeratorEnteredAi: number;
    denominatorRealIngress: number;
  };
  unattendedEffectiveIntake: {
    rate: number;
    numeratorValidIntakes: number;
  };
  unattendedDispatchCompletion: {
    rate: number;
    numeratorDriverAcceptedUniqueOrders: number;
  };
  humanTransfer: { rate: number };
  errorBooking: { rate: number };
  costPerEffectiveIntake: {
    cost: number | null;
    zeroDenominatorReason?: string | undefined;
  };
  costPerSuccessfulDispatch: {
    cost: number | null;
    status: "settled" | "pending_observation_window";
    pendingReason?: string | undefined;
  };
}

/**
 * Wire shape of one item from GET callcenter/voice/usage/records
 * (apps/api VoiceUsageRecord, camelCased by the API client).
 */
export interface VoiceUsageRecordWire {
  serviceType: string;
  provider: string;
  model?: string | undefined;
  quantity: number;
  billingUnit: string;
  currency: string;
  estimatedCost: number;
  actualCost?: number | undefined;
  unverified: boolean;
}

/**
 * Wire shape of one item from GET callcenter/voice/metrics/alerts
 * (apps/api VoiceDimensionalAlert, camelCased by the API client).
 */
export interface VoiceDimensionalAlertWire {
  alertId: string;
  alertName: string;
  severity: "critical" | "high" | "warning";
  dimensions: {
    language: string;
    routeProfileVersion: number;
    provider: string;
    brandId: string;
  };
  summary: string;
}

/**
 * Maps the authoritative server-computed cohort report (SA §10.2 evaluator,
 * durable-evidence joined) onto the UI view. Formats the server's own
 * rate/cost decisions rather than recomputing them, so the zero-denominator
 * and observation-window gating rules stay in one place (the backend).
 */
export function mapCohortReportToView(
  report: VoiceCohortMetricsReportWire,
): UiCohortMetricsView {
  const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  const costPerIntake = report.costPerEffectiveIntake;
  const costPerEffectiveIntakeFormatted =
    costPerIntake.cost !== null
      ? formatVoiceCost(costPerIntake.cost)
      : (costPerIntake.zeroDenominatorReason ?? "N/A (無受理單)");

  const costPerDispatch = report.costPerSuccessfulDispatch;
  const costPerSuccessfulDispatchFormatted =
    costPerDispatch.status === "pending_observation_window"
      ? "待觀察窗口結算"
      : costPerDispatch.cost !== null
        ? formatVoiceCost(costPerDispatch.cost)
        : "N/A (無成功派車)";

  return {
    windowLabel: `${report.cohortWindow.windowStart.slice(0, 10)} ~ ${report.cohortWindow.windowEnd.slice(0, 10)}`,
    observationWindowClosed: report.cohortWindow.observationWindowClosed,
    totalIngressCalls: report.allCallCoverage.denominatorRealIngress,
    enteredAiCalls: report.allCallCoverage.numeratorEnteredAi,
    coverageRateFormatted: pct(report.allCallCoverage.rate),
    effectiveIntakeCount: report.unattendedEffectiveIntake.numeratorValidIntakes,
    effectiveIntakeRateFormatted: pct(report.unattendedEffectiveIntake.rate),
    driverAcceptedOrdersCount:
      report.unattendedDispatchCompletion.numeratorDriverAcceptedUniqueOrders,
    dispatchRateFormatted: pct(report.unattendedDispatchCompletion.rate),
    humanTransferRateFormatted: pct(report.humanTransfer.rate),
    errorBookingRateFormatted: `${(report.errorBooking.rate * 100).toFixed(2)}%`,
    costPerEffectiveIntakeFormatted,
    costPerSuccessfulDispatchFormatted,
    costPerSuccessfulDispatchStatus: costPerDispatch.status,
    pendingReason: costPerDispatch.pendingReason,
  };
}

/**
 * Maps one raw metering/rate-card usage record onto the ledger row view.
 * Preserves the `unverified` flag and never derives a unit price that would
 * imply the estimate has already been reconciled against a real invoice.
 */
export function mapUsageRecordToLedgerItem(
  record: VoiceUsageRecordWire,
): UiCostLedgerItem {
  return {
    serviceType: record.serviceType,
    provider: record.provider,
    model: record.model,
    quantity: record.quantity,
    billingUnit: record.billingUnit,
    unitPrice:
      record.quantity > 0 ? record.estimatedCost / record.quantity : 0,
    estimatedCost: record.estimatedCost,
    actualCost: record.actualCost,
    variance:
      record.actualCost !== undefined
        ? Number((record.actualCost - record.estimatedCost).toFixed(4))
        : undefined,
    currency: record.currency,
    unverified: record.unverified,
  };
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
    const costPerIntake = params.totalCostTwd / params.validBookingIntakes;
    costPerIntakeStr = `${costPerIntake.toFixed(2)} TWD`;
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
    const costPerDispatch =
      params.totalCostTwd / params.driverAcceptedOrders;
    costPerDispatchStr = `${costPerDispatch.toFixed(2)} TWD`;
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
 * Minimal transport surface the voice ledger loader depends on. Matches the
 * subset of `@drts/api-client`'s `ApiClient` actually used here, so the
 * loader stays testable against a plain mock without importing the full
 * client.
 */
export interface VoiceLedgerClient {
  get<T>(path: string): Promise<T>;
  getList<T>(path: string): Promise<T[]>;
}

export interface VoiceLedgerWindowParams {
  windowStart: string;
  windowEnd: string;
}

/**
 * Builds the explicit `?windowStart=...&windowEnd=...` query for
 * `callcenter/voice/metrics/cohort`. `observationWindowClosed` is
 * deliberately omitted so the backend derives it from `windowEnd` (SA
 * §10.2) rather than the caller guessing whether the window has closed.
 */
export function buildVoiceCohortQuery(params: VoiceLedgerWindowParams): string {
  const search = new URLSearchParams({
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });
  return `?${search.toString()}`;
}

/**
 * True when `responseRequestId` is not the most recently issued request,
 * i.e. an earlier in-flight fetch resolved after a newer one and its
 * result must be discarded rather than overwriting fresher state.
 */
export function isStaleVoiceLedgerResponse(
  latestRequestId: string,
  responseRequestId: string,
): boolean {
  return latestRequestId !== responseRequestId;
}

export type VoiceLedgerLoadResult =
  | {
      ok: true;
      requestId: string;
      cohort: UiCohortMetricsView;
      usageRecords: UiCostLedgerItem[];
      alerts: VoiceDimensionalAlertWire[];
    }
  | {
      ok: false;
      requestId: string;
      error: string;
    };

/**
 * The actual data-loading function backing the callcenter page's voice
 * ledger panel: real typed GET requests against `client`, real response
 * mapping, and an explicit window binding. Isolated from React so it can be
 * unit tested with a mocked transport that resolves or rejects like a real
 * fetch would, instead of only exercising the pure formatters below.
 */
export async function loadVoiceLedgerAndAlerts(
  client: VoiceLedgerClient,
  requestId: string,
  windowParams: VoiceLedgerWindowParams,
): Promise<VoiceLedgerLoadResult> {
  try {
    const cohortQuery = buildVoiceCohortQuery(windowParams);
    const [cohortReport, records, alerts] = await Promise.all([
      client.get<VoiceCohortMetricsReportWire>(
        `/api/callcenter/voice/metrics/cohort${cohortQuery}`,
      ),
      client.getList<VoiceUsageRecordWire>("/api/callcenter/voice/usage/records"),
      client.getList<VoiceDimensionalAlertWire>("/api/callcenter/voice/metrics/alerts"),
    ]);

    return {
      ok: true,
      requestId,
      cohort: mapCohortReportToView(cohortReport),
      usageRecords: records.map(mapUsageRecordToLedgerItem),
      alerts,
    };
  } catch (error) {
    return {
      ok: false,
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
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
