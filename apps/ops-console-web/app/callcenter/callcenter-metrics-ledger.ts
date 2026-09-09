import {
  REALM_COLORS,
  STATUS_TONES,
  type RealmName,
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
