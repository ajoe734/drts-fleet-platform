import Link from "next/link";
import type {
  DriverStatementLineRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ReconciliationIssueRecord,
  SettlementMatrixRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t, type Locale } from "@/lib/translations";
import {
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
  type RevenueFilters,
  type RevenuePeriod,
} from "@/lib/ops-analytics";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type RevenuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SupportedChannelKey =
  | "tenant_enterprise"
  | "partner_airport"
  | "phone_dispatch"
  | "forwarded_shadow";

type RevenueTaskEntry = {
  task: DriverTaskRecord;
  order: OwnedOrderRecord | undefined;
  channelKey: SupportedChannelKey;
  billedMinor: number;
};

type ChannelMixRow = Record<string, unknown> & {
  channelKey: string;
  channelLabel: string;
  trips: string;
  billed: string;
  share: string;
  evidence: string;
};

type SettlementTableRow = Record<string, unknown> & {
  channelKey: string;
  channelLabel: string;
  channelMeta: string;
  billed: string;
  driverFee: string;
  serviceFee: string;
  reconOpen: string;
  statusLabel: string;
  statusTone: CanvasTone;
};

type IssueTableRow = Record<string, unknown> & {
  mirrorOrderId: string;
  platform: string;
  statusLabel: string;
  statusTone: CanvasTone;
  statusMeta: string;
  errorCode: string;
  errorMeta: string;
  driver: string;
  financeLabel: string;
  financeTone: CanvasTone;
  financeMeta: string;
  fareAuthority: string;
  ledgerLabel: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const MATRIX_CHANNEL_ORDER: SupportedChannelKey[] = [
  "tenant_enterprise",
  "partner_airport",
  "phone_dispatch",
  "forwarded_shadow",
];

const DAY_MS = 24 * 60 * 60 * 1000;

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): RevenueFilters {
  const rawPeriod = firstParam(searchParams?.period);
  const period: RevenuePeriod =
    rawPeriod === "today" ||
    rawPeriod === "7d" ||
    rawPeriod === "30d" ||
    rawPeriod === "all"
      ? rawPeriod
      : "7d";
  const serviceBucket = firstParam(searchParams?.serviceBucket) ?? "all";
  const vehicleId = firstParam(searchParams?.vehicleId) ?? "all";
  return {
    period,
    serviceBucket:
      serviceBucket === "standard_taxi" || serviceBucket === "business_dispatch"
        ? serviceBucket
        : "all",
    vehicleId,
  };
}

function buildHref(
  filters: RevenueFilters,
  overrides: Partial<RevenueFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.period !== "7d") params.set("period", next.period);
  if (next.serviceBucket !== "all") {
    params.set("serviceBucket", next.serviceBucket);
  }
  if (next.vehicleId !== "all") params.set("vehicleId", next.vehicleId);
  const query = params.toString();
  return query ? `/revenue?${query}` : "/revenue";
}

function sortSettlementMatrix(rows: SettlementMatrixRecord[]) {
  const priority = new Map(
    MATRIX_CHANNEL_ORDER.map((channelKey, index) => [channelKey, index]),
  );
  return [...rows].sort(
    (left, right) =>
      (priority.get(left.channelKey as SupportedChannelKey) ??
        Number.MAX_SAFE_INTEGER) -
      (priority.get(right.channelKey as SupportedChannelKey) ??
        Number.MAX_SAFE_INTEGER),
  );
}

function settlementMatrixKey(
  category:
    | "channel"
    | "payer"
    | "sponsor"
    | "invoiceOwner"
    | "receipt"
    | "payout"
    | "discount"
    | "reimbursement"
    | "reconciliation",
  channelKey: string,
) {
  return `revenue.matrix.${category}.${channelKey}`;
}

function copyText(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function normalizeChannelKey(
  value: string | null | undefined,
): SupportedChannelKey | null {
  if (
    value === "tenant_enterprise" ||
    value === "partner_airport" ||
    value === "phone_dispatch" ||
    value === "forwarded_shadow"
  ) {
    return value;
  }
  return null;
}

function settlementChannelKeyForOrder(input: {
  orderSource?: string | null;
  businessDispatchSubtype?: string | null;
  partnerId?: string | null;
}): SupportedChannelKey {
  if (input.orderSource === "external_platform") {
    return "forwarded_shadow";
  }
  if (input.orderSource === "phone") {
    return "phone_dispatch";
  }
  if (
    input.businessDispatchSubtype === "credit_card_airport_transfer" ||
    input.partnerId
  ) {
    return "partner_airport";
  }
  return "tenant_enterprise";
}

function periodDays(period: RevenuePeriod): number | null {
  if (period === "today") return 1;
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  return null;
}

function currentPeriodStart(period: RevenuePeriod, reference = new Date()) {
  const days = periodDays(period);
  if (!days) return null;
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.getTime();
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function matchesCurrentPeriod(
  value: string | null | undefined,
  period: RevenuePeriod,
  reference = new Date(),
) {
  if (period === "all") {
    return true;
  }
  const time = parseTime(value);
  const start = currentPeriodStart(period, reference);
  return time !== null && start !== null && time >= start;
}

function matchesPreviousPeriod(
  value: string | null | undefined,
  period: RevenuePeriod,
  reference = new Date(),
) {
  const days = periodDays(period);
  const currentStart = currentPeriodStart(period, reference);
  const time = parseTime(value);
  if (!days || currentStart === null || time === null) {
    return false;
  }
  const previousStart = currentStart - days * DAY_MS;
  return time >= previousStart && time < currentStart;
}

function matchesScope(entry: RevenueTaskEntry, filters: RevenueFilters) {
  if (
    filters.serviceBucket !== "all" &&
    entry.order?.serviceBucket !== filters.serviceBucket
  ) {
    return false;
  }
  if (
    filters.vehicleId !== "all" &&
    entry.task.vehicleId !== filters.vehicleId
  ) {
    return false;
  }
  return true;
}

function channelFromStatementLine(
  line: DriverStatementLineRecord,
  ordersById: Map<string, OwnedOrderRecord>,
) {
  const explicit = normalizeChannelKey(line.channelKey);
  if (explicit) {
    return explicit;
  }
  const order = ordersById.get(line.orderId);
  if (order) {
    return settlementChannelKeyForOrder(order);
  }
  return normalizeChannelKey(
    line.orderSource === "phone" ? "phone_dispatch" : null,
  );
}

function growthDelta(current: number, previous: number) {
  if (previous <= 0) return undefined;
  const diff = ((current - previous) / previous) * 100;
  return {
    label: `${diff >= 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(1)}%`,
    tone:
      diff > 0
        ? ("up" as const)
        : diff < 0
          ? ("down" as const)
          : ("neutral" as const),
  };
}

function pointDelta(
  current: number,
  previous: number,
  favorableDirection: "up" | "down",
) {
  if (!Number.isFinite(previous)) return undefined;
  const diff = current - previous;
  return {
    label: `${diff >= 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(1)} pp`,
    tone:
      diff === 0
        ? ("neutral" as const)
        : favorableDirection === "up"
          ? diff > 0
            ? ("up" as const)
            : ("down" as const)
          : diff < 0
            ? ("up" as const)
            : ("down" as const),
  };
}

function formatPercent(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

function financeIssueTone(
  status: ReconciliationIssueRecord["status"],
): CanvasTone {
  switch (status) {
    case "resolved":
      return "success";
    case "assigned":
      return "info";
    case "reopened":
      return "danger";
    case "open":
    default:
      return "warn";
  }
}

function forwardedStatusTone(
  status: ForwarderReconciliationIssue["status"],
): CanvasTone {
  return status === "sync_failed" ? "danger" : "warn";
}

function matrixStatusLabel(
  locale: Locale,
  localLedgerMode: SettlementMatrixRecord["localLedgerMode"],
  openCount: number,
) {
  if (openCount > 0) {
    return copyText(locale, "pending", "待處理");
  }
  if (localLedgerMode === "shadow_only") {
    return copyText(locale, "shadow", "影子帳");
  }
  return copyText(locale, "reconciled", "已平");
}

function matrixStatusTone(
  localLedgerMode: SettlementMatrixRecord["localLedgerMode"],
  openCount: number,
): CanvasTone {
  if (openCount > 0) return "warn";
  if (localLedgerMode === "shadow_only") return "info";
  return "success";
}

function describeSelectedProduct(locale: Locale, filters: RevenueFilters) {
  if (filters.serviceBucket === "all") {
    return t("revenue.bucket.all", locale);
  }
  return t(`revenue.bucket.${filters.serviceBucket}`, locale);
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function cellStackStyle(options?: { mono?: boolean }) {
  return {
    display: "grid",
    gap: 4,
    minWidth: 0,
    whiteSpace: "normal" as const,
    fontFamily: options?.mono ? theme.monoFamily : undefined,
  };
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [
    orders,
    tasks,
    statements,
    vehicles,
    forwardedOrders,
    settlementMatrix,
    forwarderIssues,
    settlementReconciliationIssues,
  ] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(
      () => client.listDriverStatements(),
      [] as DriverStatementRecord[],
    ),
    resolveOrFallback(
      () => client.listVehicles(),
      [] as VehicleRegistryRecord[],
    ),
    resolveOrFallback(
      () => client.listForwarderOrders(),
      [] as ForwardedOrderRecord[],
    ),
    resolveOrFallback(
      () => client.listSettlementMatrix(),
      [] as SettlementMatrixRecord[],
    ),
    resolveOrFallback(
      () => client.listForwarderReconciliationIssues(),
      [] as ForwarderReconciliationIssue[],
    ),
    resolveOrFallback(
      () => client.listReconciliationIssues(),
      [] as ReconciliationIssueRecord[],
    ),
  ]);

  const reference = new Date();
  const ordersById = new Map(orders.map((order) => [order.orderId, order]));
  const financeIssueByJobId = new Map(
    settlementReconciliationIssues
      .filter(
        (issue) =>
          issue.issueType === "forwarder_status_mismatch" &&
          issue.linkedReconciliationJobId,
      )
      .map((issue) => [issue.linkedReconciliationJobId!, issue]),
  );

  const allRevenueEntries = tasks
    .filter((task) => task.status === "completed")
    .map((task) => {
      const order = ordersById.get(task.orderId);
      const channelKey = order
        ? settlementChannelKeyForOrder(order)
        : (normalizeChannelKey(
            task.sourcePlatform ? "forwarded_shadow" : null,
          ) ?? "tenant_enterprise");
      return {
        task,
        order,
        channelKey,
        billedMinor:
          task.fare?.amountMinor ?? order?.quotedFare?.amountMinor ?? 0,
      } satisfies RevenueTaskEntry;
    })
    .filter((entry) => matchesScope(entry, filters));

  const currentRevenueEntries = allRevenueEntries.filter((entry) =>
    matchesCurrentPeriod(entry.task.completedAt, filters.period, reference),
  );
  const previousRevenueEntries = allRevenueEntries.filter((entry) =>
    matchesPreviousPeriod(entry.task.completedAt, filters.period, reference),
  );
  const currentOrderIds = new Set(
    currentRevenueEntries.map((entry) => entry.task.orderId),
  );

  const insights = buildRevenueInsights(orders, tasks, statements, filters);
  const previousTotalBilledMinor = previousRevenueEntries.reduce(
    (sum, entry) => sum + entry.billedMinor,
    0,
  );
  const currentTotalBilledMinor = currentRevenueEntries.reduce(
    (sum, entry) => sum + entry.billedMinor,
    0,
  );
  const currentOwnedBilledMinor = currentRevenueEntries
    .filter((entry) => entry.channelKey !== "forwarded_shadow")
    .reduce((sum, entry) => sum + entry.billedMinor, 0);
  const previousOwnedBilledMinor = previousRevenueEntries
    .filter((entry) => entry.channelKey !== "forwarded_shadow")
    .reduce((sum, entry) => sum + entry.billedMinor, 0);
  const currentOwnedShare =
    currentTotalBilledMinor > 0
      ? (currentOwnedBilledMinor / currentTotalBilledMinor) * 100
      : 0;
  const previousOwnedShare =
    previousTotalBilledMinor > 0
      ? (previousOwnedBilledMinor / previousTotalBilledMinor) * 100
      : 0;

  const currentForwardedOrders = forwardedOrders.filter((order) =>
    matchesCurrentPeriod(order.updatedAt, filters.period, reference),
  );
  const previousForwardedOrders = forwardedOrders.filter((order) =>
    matchesPreviousPeriod(order.updatedAt, filters.period, reference),
  );
  const currentSyncFailedCount = currentForwardedOrders.filter(
    (order) => order.status === "sync_failed",
  ).length;
  const previousSyncFailedCount = previousForwardedOrders.filter(
    (order) => order.status === "sync_failed",
  ).length;
  const currentSyncFailedRate =
    currentForwardedOrders.length > 0
      ? (currentSyncFailedCount / currentForwardedOrders.length) * 100
      : 0;
  const previousSyncFailedRate =
    previousForwardedOrders.length > 0
      ? (previousSyncFailedCount / previousForwardedOrders.length) * 100
      : 0;

  const statementLineTotals = new Map<
    string,
    { driverFeeMinor: number; serviceFeeMinor: number }
  >();
  for (const statement of statements) {
    for (const line of statement.lines) {
      if (!currentOrderIds.has(line.orderId)) {
        continue;
      }
      const channelKey = channelFromStatementLine(line, ordersById);
      if (!channelKey) {
        continue;
      }
      const current = statementLineTotals.get(channelKey) ?? {
        driverFeeMinor: 0,
        serviceFeeMinor: 0,
      };
      current.driverFeeMinor += line.netAmount.amountMinor;
      current.serviceFeeMinor += line.serviceFee.amountMinor;
      statementLineTotals.set(channelKey, current);
    }
  }

  const billedByChannel = new Map<
    string,
    { trips: number; billedMinor: number }
  >();
  for (const entry of currentRevenueEntries) {
    const current = billedByChannel.get(entry.channelKey) ?? {
      trips: 0,
      billedMinor: 0,
    };
    current.trips += 1;
    current.billedMinor += entry.billedMinor;
    billedByChannel.set(entry.channelKey, current);
  }

  const vehicleOptions = vehicles
    .map((vehicle) => vehicle.vehicleId)
    .sort((left, right) => left.localeCompare(right));
  const partnerBenefitRows = orders
    .filter(
      (order) =>
        order.status === "completed" &&
        order.serviceBucket === "business_dispatch" &&
        order.businessDispatchSubtype === "credit_card_airport_transfer" &&
        order.partnerId,
    )
    .filter((order) => {
      if (
        filters.serviceBucket !== "all" &&
        order.serviceBucket !== filters.serviceBucket
      ) {
        return false;
      }
      if (filters.vehicleId !== "all" && !currentOrderIds.has(order.orderId)) {
        return false;
      }
      return matchesCurrentPeriod(order.updatedAt, filters.period, reference);
    });
  const enterpriseOrders = orders.filter(
    (order) =>
      order.serviceBucket === "business_dispatch" &&
      order.businessDispatchSubtype === "enterprise_dispatch",
  );
  const phoneOrders = orders.filter((order) => order.orderSource === "phone");
  const shadowLedgerCount = settlementMatrix.filter(
    (row) => row.localLedgerMode === "shadow_only",
  ).length;

  const describeMatrixChannel = (channelKey: string) => {
    const key = settlementMatrixKey("channel", channelKey);
    const value = t(key, locale);
    return value === key ? channelKey : value;
  };

  const describeEvidence = (channelKey: string) => {
    switch (channelKey) {
      case "tenant_enterprise":
        return t("revenue.matrix.evidence.tenant_enterprise", locale, {
          orders: String(enterpriseOrders.length),
          statements: String(statements.length),
        });
      case "partner_airport":
        return t("revenue.matrix.evidence.partner_airport", locale, {
          trips: String(partnerBenefitRows.length),
        });
      case "phone_dispatch":
        return t("revenue.matrix.evidence.phone_dispatch", locale, {
          orders: String(phoneOrders.length),
        });
      case "forwarded_shadow":
        return t("revenue.matrix.evidence.forwarded_shadow", locale, {
          mirrors: String(forwardedOrders.length),
          syncFailed: String(currentSyncFailedCount),
        });
      default:
        return t("common.noData", locale);
    }
  };

  const openSettlementIssues = settlementReconciliationIssues.filter(
    (issue) => issue.status !== "resolved",
  );
  const openCountByChannel = new Map<string, number>();
  for (const issue of openSettlementIssues) {
    if (issue.channelKey === "forwarded_shadow") {
      continue;
    }
    openCountByChannel.set(
      issue.channelKey,
      (openCountByChannel.get(issue.channelKey) ?? 0) + 1,
    );
  }
  const forwardedOpenKeys = new Set<string>();
  for (const issue of openSettlementIssues) {
    if (issue.channelKey !== "forwarded_shadow") {
      continue;
    }
    forwardedOpenKeys.add(issue.linkedReconciliationJobId ?? issue.issueId);
  }
  for (const issue of forwarderIssues) {
    forwardedOpenKeys.add(issue.reconciliationJob.reconciliationJobId);
  }
  const forwardedOpenCount = forwardedOpenKeys.size;
  openCountByChannel.set("forwarded_shadow", forwardedOpenCount);

  const partnerOpenCount = openSettlementIssues.filter(
    (issue) => issue.channelKey === "partner_airport",
  ).length;
  const tenantOpenCount = openSettlementIssues.filter(
    (issue) => issue.channelKey === "tenant_enterprise",
  ).length;
  const phoneOpenCount = openSettlementIssues.filter(
    (issue) => issue.channelKey === "phone_dispatch",
  ).length;
  const totalOpenReviewCount =
    partnerOpenCount + tenantOpenCount + phoneOpenCount + forwardedOpenCount;

  const sortedSettlementChannels = sortSettlementMatrix(settlementMatrix);
  const channelMixRows: ChannelMixRow[] = sortedSettlementChannels.map(
    (row) => {
      const channelTotals = billedByChannel.get(row.channelKey) ?? {
        trips: 0,
        billedMinor: 0,
      };
      const share =
        currentTotalBilledMinor > 0
          ? (channelTotals.billedMinor / currentTotalBilledMinor) * 100
          : 0;
      return {
        channelKey: row.channelKey,
        channelLabel: describeMatrixChannel(row.channelKey),
        trips: formatCompactNumber(channelTotals.trips),
        billed: formatMinorCurrency(channelTotals.billedMinor),
        share: formatPercent(share, share > 0 && share < 10 ? 1 : 0),
        evidence: describeEvidence(row.channelKey),
      };
    },
  );

  const settlementRows: SettlementTableRow[] = sortedSettlementChannels.map(
    (row) => {
      const channelTotals = billedByChannel.get(row.channelKey) ?? {
        trips: 0,
        billedMinor: 0,
      };
      const feeTotals = statementLineTotals.get(row.channelKey) ?? {
        driverFeeMinor: 0,
        serviceFeeMinor: 0,
      };
      const openCount = openCountByChannel.get(row.channelKey) ?? 0;
      return {
        channelKey: row.channelKey,
        channelLabel: describeMatrixChannel(row.channelKey),
        channelMeta: `${row.orderDomain} · ${row.orderSources.join(" / ")}`,
        billed: formatMinorCurrency(channelTotals.billedMinor),
        driverFee: formatMinorCurrency(feeTotals.driverFeeMinor),
        serviceFee: formatMinorCurrency(feeTotals.serviceFeeMinor),
        reconOpen: formatCompactNumber(openCount),
        statusLabel: matrixStatusLabel(locale, row.localLedgerMode, openCount),
        statusTone: matrixStatusTone(row.localLedgerMode, openCount),
      };
    },
  );

  const issueRows: IssueTableRow[] = forwarderIssues.map((issue) => {
    const financeIssue = financeIssueByJobId.get(
      issue.reconciliationJob.reconciliationJobId,
    );
    return {
      mirrorOrderId: issue.mirrorOrderId,
      platform: formatOpsCodeLabel(locale, issue.platformCode),
      statusLabel: formatOpsCodeLabel(locale, issue.status),
      statusTone: forwardedStatusTone(issue.status),
      statusMeta: formatOpsCodeLabel(locale, issue.reconciliationJob.reason),
      errorCode: issue.lastSyncError?.code ?? "—",
      errorMeta: issue.lastSyncError
        ? issue.lastSyncError.retryable
          ? t("revenue.reconciliation.retryable", locale)
          : t("revenue.reconciliation.notRetryable", locale)
        : formatDateTime(locale, issue.reconciliationJob.createdAt),
      driver: issue.acceptedDriverId ?? "—",
      financeLabel: financeIssue
        ? formatOpsCodeLabel(locale, financeIssue.status)
        : t("revenue.reconciliation.notCreated", locale),
      financeTone: financeIssue
        ? financeIssueTone(financeIssue.status)
        : "neutral",
      financeMeta: financeIssue
        ? (financeIssue.ownerId ??
          t("revenue.reconciliation.unassigned", locale))
        : "—",
      fareAuthority: t("revenue.reconciliation.fareExternal", locale),
      ledgerLabel: t("revenue.reconciliation.shadowOnly", locale),
    };
  });

  const selectedPeriodLabel = t(`revenue.period.${filters.period}`, locale);
  const billedDelta = growthDelta(
    currentTotalBilledMinor,
    previousTotalBilledMinor,
  );
  const ownedShareDelta = pointDelta(
    currentOwnedShare,
    previousOwnedShare,
    "up",
  );
  const syncFailedDelta = pointDelta(
    currentSyncFailedRate,
    previousSyncFailedRate,
    "down",
  );

  const topServiceBucket = insights.serviceBuckets[0];
  const topVehicle = insights.vehicles[0];
  const summaryItems = [
    {
      k: copyText(locale, "Scope", "檢視範圍"),
      v: `${selectedPeriodLabel} · ${describeSelectedProduct(locale, filters)}`,
    },
    {
      k: copyText(locale, "Vehicle", "車輛"),
      v:
        filters.vehicleId === "all"
          ? t("revenue.vehicle.all", locale)
          : filters.vehicleId,
      mono: filters.vehicleId !== "all",
    },
    {
      k: t("revenue.completedTrips", locale),
      v: formatCompactNumber(insights.completedTrips),
      mono: true,
    },
    {
      k: t("revenue.recognizedRevenue", locale),
      v: formatMinorCurrency(insights.totalRevenueMinor),
      mono: true,
    },
    {
      k: t("revenue.breakdownByProduct", locale),
      v: topServiceBucket
        ? `${topServiceBucket.label} · ${formatCompactNumber(topServiceBucket.trips)}`
        : t("common.noData", locale),
    },
    {
      k: t("revenue.breakdownByVehicle", locale),
      v: topVehicle
        ? `${topVehicle.label} · ${formatCompactNumber(topVehicle.trips)}`
        : t("common.noData", locale),
      mono: Boolean(topVehicle),
    },
  ];

  const payoutPills = insights.payoutStatuses.length > 0 && (
    <div style={pillRowStyle}>
      {insights.payoutStatuses.map((item) => (
        <Pill
          key={item.status}
          theme={theme}
          tone={item.status === "paid" ? "success" : "warn"}
          dot
        >
          {`${formatOpsCodeLabel(locale, item.status)} ${formatCompactNumber(item.count)} · ${formatMinorCurrency(item.netMinor)}`}
        </Pill>
      ))}
    </div>
  );

  const channelMixColumns: CanvasTableColumn<ChannelMixRow>[] = [
    {
      h: t("revenue.matrix.col.channel", locale),
      w: 180,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>{row.channelLabel}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.channelKey}
          </span>
        </div>
      ),
    },
    {
      h: t("revenue.col.trips", locale),
      k: "trips",
      w: 88,
      mono: true,
      align: "right",
    },
    {
      h: "BILLED",
      k: "billed",
      w: 120,
      mono: true,
      align: "right",
    },
    {
      h: copyText(locale, "Share", "佔比"),
      k: "share",
      w: 88,
      mono: true,
      align: "right",
    },
    {
      h: t("revenue.matrix.col.evidence", locale),
      w: 320,
      r: (row) => (
        <div style={{ ...cellStackStyle(), maxWidth: 320 }}>{row.evidence}</div>
      ),
    },
  ];

  const settlementColumns: CanvasTableColumn<SettlementTableRow>[] = [
    {
      h: t("revenue.matrix.col.channel", locale),
      w: 198,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>{row.channelLabel}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.channelMeta}
          </span>
        </div>
      ),
    },
    { h: "BILLED", k: "billed", w: 124, mono: true, align: "right" },
    {
      h: "DRIVER FEE",
      k: "driverFee",
      w: 128,
      mono: true,
      align: "right",
    },
    {
      h: "SERVICE FEE",
      k: "serviceFee",
      w: 128,
      mono: true,
      align: "right",
    },
    {
      h: "RECON OPEN",
      k: "reconOpen",
      w: 104,
      mono: true,
      align: "right",
    },
    {
      h: "STATUS",
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {row.statusLabel}
        </Pill>
      ),
    },
  ];

  const issueColumns: CanvasTableColumn<IssueTableRow>[] = [
    {
      h: t("revenue.reconciliation.col.mirror", locale),
      w: 152,
      mono: true,
      r: (row) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{`${row.mirrorOrderId.slice(0, 12)}...`}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.platform}
          </span>
        </div>
      ),
    },
    {
      h: t("revenue.reconciliation.col.platform", locale),
      k: "platform",
      w: 110,
    },
    {
      h: t("revenue.reconciliation.col.status", locale),
      w: 140,
      r: (row) => (
        <div style={cellStackStyle()}>
          <Pill theme={theme} tone={row.statusTone} dot>
            {row.statusLabel}
          </Pill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.statusMeta}
          </span>
        </div>
      ),
    },
    {
      h: t("revenue.reconciliation.col.error", locale),
      w: 136,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>{row.errorCode}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.errorMeta}
          </span>
        </div>
      ),
    },
    { h: t("revenue.reconciliation.col.driver", locale), k: "driver", w: 112 },
    {
      h: t("revenue.reconciliation.col.finance", locale),
      w: 144,
      r: (row) => (
        <div style={cellStackStyle()}>
          <Pill theme={theme} tone={row.financeTone}>
            {row.financeLabel}
          </Pill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.financeMeta}
          </span>
        </div>
      ),
    },
    {
      h: t("revenue.reconciliation.col.fareAuthority", locale),
      k: "fareAuthority",
      w: 132,
    },
    {
      h: t("revenue.reconciliation.col.ledger", locale),
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone="info">
          {row.ledgerLabel}
        </Pill>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("revenue.title", locale)}
        subtitle={t("revenue.subtitle", locale)}
        tabs={[
          "Insight",
          "Channel mix",
          "Settlement matrix",
          "Mismatch review",
        ]}
        activeTab="Settlement matrix"
        actions={
          <>
            <Btn theme={theme} icon="filter">
              {selectedPeriodLabel}
            </Btn>
            <Btn theme={theme} icon="export">
              {copyText(locale, "Export", "匯出")}
            </Btn>
          </>
        }
      />

      <div style={pageStackStyle}>
        <Banner
          theme={theme}
          tone={totalOpenReviewCount > 0 ? "warn" : "info"}
          icon="warn"
          title={
            totalOpenReviewCount > 0
              ? copyText(
                  locale,
                  `${totalOpenReviewCount} open reconciliation item(s)`,
                  `目前有 ${totalOpenReviewCount} 筆待處理對帳`,
                )
              : copyText(
                  locale,
                  "Settlement review is clear",
                  "目前沒有待處理對帳",
                )
          }
          body={
            totalOpenReviewCount > 0
              ? copyText(
                  locale,
                  `${partnerOpenCount} partner · ${forwardedOpenCount} forwarded · ${tenantOpenCount} tenant · ${phoneOpenCount} phone`,
                  `${partnerOpenCount} partner · ${forwardedOpenCount} forwarded · ${tenantOpenCount} tenant · ${phoneOpenCount} phone`,
                )
              : copyText(
                  locale,
                  "Canvas revenue view is driven by the same server filters and finance queues as the prior page.",
                  "Canvas revenue 視圖維持原本 server filter 與 finance queue 的資料來源。",
                )
          }
        />

        <Card
          theme={theme}
          title={copyText(locale, "Review scope", "檢視範圍")}
          subtitle={copyText(
            locale,
            "Keep the original server query filters while rebuilding the canvas treatment.",
            "保留原本 server query filter，並改成 canvas 版式。",
          )}
        >
          <div style={filterGridStyle}>
            <Field theme={theme} label={t("revenue.periodLabel", locale)}>
              <div style={pillRowStyle}>
                {(["today", "7d", "30d", "all"] as RevenuePeriod[]).map(
                  (period) => (
                    <Link
                      key={period}
                      href={buildHref(filters, { period })}
                      style={{ textDecoration: "none" }}
                    >
                      <Pill
                        theme={theme}
                        tone={period === filters.period ? "info" : "neutral"}
                        dot={period === filters.period}
                      >
                        {t(`revenue.period.${period}`, locale)}
                      </Pill>
                    </Link>
                  ),
                )}
              </div>
            </Field>

            <Field theme={theme} label={t("revenue.productLabel", locale)}>
              <div style={pillRowStyle}>
                {(["all", "standard_taxi", "business_dispatch"] as const).map(
                  (serviceBucket) => (
                    <Link
                      key={serviceBucket}
                      href={buildHref(filters, { serviceBucket })}
                      style={{ textDecoration: "none" }}
                    >
                      <Pill
                        theme={theme}
                        tone={
                          serviceBucket === filters.serviceBucket
                            ? "info"
                            : "neutral"
                        }
                        dot={serviceBucket === filters.serviceBucket}
                      >
                        {serviceBucket === "all"
                          ? t("revenue.bucket.all", locale)
                          : t(`revenue.bucket.${serviceBucket}`, locale)}
                      </Pill>
                    </Link>
                  ),
                )}
              </div>
            </Field>

            <Field theme={theme} label={t("common.vehicle", locale)}>
              <div style={pillRowStyle}>
                <Link
                  href={buildHref(filters, { vehicleId: "all" })}
                  style={{ textDecoration: "none" }}
                >
                  <Pill
                    theme={theme}
                    tone={filters.vehicleId === "all" ? "info" : "neutral"}
                    dot={filters.vehicleId === "all"}
                  >
                    {t("revenue.vehicle.all", locale)}
                  </Pill>
                </Link>
                {vehicleOptions.map((vehicleId) => (
                  <Link
                    key={vehicleId}
                    href={buildHref(filters, { vehicleId })}
                    style={{ textDecoration: "none" }}
                  >
                    <Pill
                      theme={theme}
                      tone={
                        vehicleId === filters.vehicleId ? "info" : "neutral"
                      }
                      dot={vehicleId === filters.vehicleId}
                    >
                      {vehicleId}
                    </Pill>
                  </Link>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copyText(
              locale,
              `Current billed (${selectedPeriodLabel})`,
              `當期 billed（${selectedPeriodLabel}）`,
            )}
            value={formatMinorCurrency(currentTotalBilledMinor)}
            {...(billedDelta
              ? {
                  delta: billedDelta.label,
                  deltaTone: billedDelta.tone,
                }
              : {})}
            sub={t("revenue.recognizedRevenueSub", locale)}
          />
          <KPI
            theme={theme}
            label={copyText(locale, "Owned share", "自營佔比")}
            value={formatPercent(currentOwnedShare, 0)}
            {...(ownedShareDelta
              ? {
                  delta: ownedShareDelta.label,
                  deltaTone: ownedShareDelta.tone,
                }
              : {})}
            sub={copyText(
              locale,
              "Owned channels vs forwarded shadow",
              "自營通道對比 shadow forwarded",
            )}
          />
          <KPI
            theme={theme}
            label={copyText(
              locale,
              "Forwarded sync_failed",
              "forwarded sync_failed",
            )}
            value={formatPercent(
              currentSyncFailedRate,
              currentSyncFailedRate > 0 && currentSyncFailedRate < 10 ? 1 : 0,
            )}
            {...(syncFailedDelta
              ? {
                  delta: syncFailedDelta.label,
                  deltaTone: syncFailedDelta.tone,
                }
              : {})}
            sub={copyText(
              locale,
              `${currentSyncFailedCount} mirror order(s) in scope`,
              `${currentSyncFailedCount} 筆鏡像訂單在目前範圍`,
            )}
          />
          <KPI
            theme={theme}
            label={copyText(
              locale,
              "Open reconciliation",
              "未結 reconciliation",
            )}
            value={formatCompactNumber(totalOpenReviewCount)}
            sub={copyText(
              locale,
              `${partnerOpenCount} partner · ${forwardedOpenCount} forwarded`,
              `${partnerOpenCount} partner · ${forwardedOpenCount} forwarded`,
            )}
          />
        </div>

        <div style={summaryGridStyle}>
          <Card
            theme={theme}
            title="Insight"
            subtitle={copyText(locale, "Current review slice", "目前檢視切面")}
          >
            <DL theme={theme} cols={2} items={summaryItems} />
            <div style={{ height: 14 }} />
            <Field
              theme={theme}
              label={t("revenue.settlementSub", locale)}
              hint={t("revenue.statementNet", locale, {
                value: formatMinorCurrency(insights.statementNetMinor),
              })}
            >
              {payoutPills ?? (
                <div style={emptyStateStyle}>
                  {t("revenue.emptySettlement", locale)}
                </div>
              )}
            </Field>
            <Field
              theme={theme}
              label={t("revenue.partnerBenefitTitle", locale)}
              hint={t("revenue.partnerBenefitSub", locale)}
            >
              <div style={emptyStateStyle}>
                {partnerBenefitRows.length > 0
                  ? copyText(
                      locale,
                      `${partnerBenefitRows.length} partner-benefit trip(s) remain visible with eligibility and sponsor references intact.`,
                      `目前有 ${partnerBenefitRows.length} 筆合作福利行程保留 eligibility 與 sponsor reference。`,
                    )
                  : t("revenue.emptyPartnerBenefit", locale)}
              </div>
            </Field>
          </Card>

          <Card
            theme={theme}
            title="Channel mix"
            subtitle={copyText(
              locale,
              "Completed-trip and settlement evidence by channel",
              "依通道查看 completed trip 與結算證據",
            )}
            padding={0}
          >
            {channelMixRows.length > 0 ? (
              <Table
                theme={theme}
                columns={channelMixColumns}
                rows={channelMixRows}
              />
            ) : (
              <div style={{ ...emptyStateStyle, padding: 16 }}>
                {t("revenue.matrix.empty", locale)}
              </div>
            )}
          </Card>
        </div>

        <Card
          theme={theme}
          title={t("revenue.matrix.title", locale)}
          subtitle={t("revenue.matrix.subtitle", locale)}
          padding={0}
        >
          {settlementRows.length > 0 ? (
            <Table
              theme={theme}
              columns={settlementColumns}
              rows={settlementRows}
            />
          ) : (
            <div style={{ ...emptyStateStyle, padding: 16 }}>
              {t("revenue.matrix.empty", locale)}
            </div>
          )}
        </Card>

        <Card
          theme={theme}
          title={t("revenue.reconciliation.title", locale)}
          subtitle={t("revenue.reconciliation.subtitle", locale)}
        >
          <DL
            theme={theme}
            cols={2}
            items={[
              {
                k: copyText(locale, "Open review count", "待處理總數"),
                v: formatCompactNumber(totalOpenReviewCount),
                mono: true,
              },
              {
                k: copyText(locale, "Forwarded shadow", "Forwarded shadow"),
                v: formatCompactNumber(forwardedOpenCount),
                mono: true,
              },
              {
                k: copyText(locale, "Partner sponsor", "Partner sponsor"),
                v: formatCompactNumber(partnerOpenCount),
                mono: true,
              },
              {
                k: copyText(locale, "Tenant / phone", "Tenant / phone"),
                v: `${formatCompactNumber(tenantOpenCount)} / ${formatCompactNumber(phoneOpenCount)}`,
                mono: true,
              },
              {
                k: copyText(locale, "Shadow ledger lanes", "影子帳務通道"),
                v: formatCompactNumber(shadowLedgerCount),
                mono: true,
              },
              {
                k: copyText(locale, "Mirror issue rows", "鏡像問題列"),
                v: formatCompactNumber(forwarderIssues.length),
                mono: true,
              },
            ]}
          />

          <div style={{ height: 14 }} />
          <Field
            theme={theme}
            label={copyText(locale, "Mirror-order queue", "鏡像訂單佇列")}
            hint={copyText(
              locale,
              "Forwarder mismatches stay visible here with linked finance ownership and ledger mode.",
              "Forwarder mismatch 會保留 linked finance owner 與 ledger mode。",
            )}
          >
            {issueRows.length > 0 ? (
              <>
                <Banner
                  theme={theme}
                  tone="warn"
                  icon="warn"
                  title={t("revenue.reconciliation.title", locale)}
                  body={t("revenue.reconciliation.banner", locale, {
                    count: String(forwarderIssues.length),
                  })}
                />
                <div style={{ height: 12 }} />
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <Table
                    theme={theme}
                    columns={issueColumns}
                    rows={issueRows}
                  />
                </div>
              </>
            ) : (
              <div style={emptyStateStyle}>
                {t("revenue.reconciliation.empty", locale)}
              </div>
            )}
          </Field>
        </Card>
      </div>
    </>
  );
}
