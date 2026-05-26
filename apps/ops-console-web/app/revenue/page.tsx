"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  OPS_REVENUE_REVIEW_DATASET_KEYS,
  REFRESH_TIER_CADENCE_MS,
  CrossAppResourceLink,
  DriverStatementRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  type OpsRevenueReviewDatasetState,
  type OpsRevenueReviewSnapshot,
  OwnedOrderRecord,
  ReconciliationIssueRecord,
  type RefreshTier,
  ResourceActionDescriptor,
  SettlementMatrixRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTheme,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
  type RevenueFilters,
  type RevenuePeriod,
} from "@/lib/ops-analytics";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const DEFAULT_REFRESH_TIER: RefreshTier = "medium";
const DEFAULT_REFRESH_INTERVAL_MS =
  REFRESH_TIER_CADENCE_MS[DEFAULT_REFRESH_TIER];
const DEFAULT_PERIOD: RevenuePeriod = "7d";
const VISIBLE_PERIODS: RevenuePeriod[] = ["today", "yesterday", "7d", "30d"];
type CanvasIconKey = Parameters<typeof CanvasIcon>[0]["name"];
type CanvasButtonIcon = NonNullable<Parameters<typeof CanvasBtn>[0]["icon"]>;
const MATRIX_CHANNEL_ORDER = [
  "tenant_enterprise",
  "partner_airport",
  "phone_dispatch",
  "forwarded_shadow",
];
type RevenueDatasetKey = (typeof OPS_REVENUE_REVIEW_DATASET_KEYS)[number];

type DatasetFailure = {
  key: RevenueDatasetKey;
  message: string;
  statusCode: number | null;
  critical: boolean;
  external: boolean;
};

type RevenueReconciliationIssue = ReconciliationIssueRecord & {
  availableActions?: ResourceActionDescriptor[];
  ownerAppLink?: CrossAppResourceLink;
};

type RevenueSnapshot = {
  source: "contract" | "legacy";
  refreshTier: RefreshTier;
  refreshMetadata: UiRefreshMetadata | null;
  healthEnvelope: UiHealthEnvelope | null;
  availableActions: ResourceActionDescriptor[];
  paymentsLink: CrossAppResourceLink | null;
  datasets: Record<RevenueDatasetKey, OpsRevenueReviewDatasetState>;
  orders: OwnedOrderRecord[];
  tasks: DriverTaskRecord[];
  statements: DriverStatementRecord[];
  vehicles: VehicleRegistryRecord[];
  forwardedOrders: ForwardedOrderRecord[];
  settlementMatrix: SettlementMatrixRecord[];
  reconciliationIssues: RevenueReconciliationIssue[];
  forwarderIssues: ForwarderReconciliationIssue[];
  failures: DatasetFailure[];
  loadedAt: string | null;
};

type RevenueEntry = {
  order: OwnedOrderRecord | null;
  task: DriverTaskRecord;
  completedAt: string | null;
  revenueMinor: number;
};

type ChannelMixRow = {
  key: "platform" | "partner" | "phone" | "tenant";
  label: string;
  trips: number;
  revenueMinor: number;
  share: string;
};

type MatrixViewRow = SettlementMatrixRecord &
  Record<string, unknown> & {
  channelLabel: string;
  payerLabel: string;
  receiptLabel: string;
  payoutLabel: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "info";
  ledgerLabel: string;
};

type RevenueIssueView = ReconciliationIssueRecord &
  Record<string, unknown> & {
  platformLabel: string;
  ownerLabel: string;
  reasonLabel: string;
  ageLabel: string;
  touchedAtLabel: string;
  summaryLine: string;
  mirrorLine: string;
  financeLine: string;
  availableActions: ResourceActionDescriptor[];
  ownerAppLink: CrossAppResourceLink;
};

function buildEmptyDatasetStates(): Record<
  RevenueDatasetKey,
  OpsRevenueReviewDatasetState
> {
  const entries = OPS_REVENUE_REVIEW_DATASET_KEYS.map((key) => [
    key,
    { key },
  ]);
  return Object.fromEntries(entries) as Record<
    RevenueDatasetKey,
    OpsRevenueReviewDatasetState
  >;
}

const EMPTY_SNAPSHOT: RevenueSnapshot = {
  source: "legacy",
  refreshTier: DEFAULT_REFRESH_TIER,
  refreshMetadata: null,
  healthEnvelope: null,
  availableActions: [],
  paymentsLink: null,
  datasets: buildEmptyDatasetStates(),
  orders: [],
  tasks: [],
  statements: [],
  vehicles: [],
  forwardedOrders: [],
  settlementMatrix: [],
  reconciliationIssues: [],
  forwarderIssues: [],
  failures: [],
  loadedAt: null,
};

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | null) {
  return value ?? undefined;
}

function parseStatusCode(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const match = error.message.match(/API error (\d+)/);
  return match ? Number(match[1]) : null;
}

function formatDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) {
    return locale === "zh" ? "未載入" : "Not loaded";
  }
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

function formatAge(value: string, now: number, locale: "en" | "zh") {
  const deltaMs = Math.max(0, now - new Date(value).getTime());
  const minutes = Math.round(deltaMs / (1000 * 60));
  if (minutes < 60) {
    return locale === "zh" ? `${minutes} 分鐘` : `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return locale === "zh" ? `${hours} 小時` : `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return locale === "zh" ? `${days} 天` : `${days}d`;
}

function formatSince(value: string | null, now: number, locale: "en" | "zh") {
  if (!value) {
    return locale === "zh" ? "未載入" : "Not loaded";
  }
  const deltaMs = Math.max(0, now - new Date(value).getTime());
  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 60) {
    return locale === "zh" ? `${seconds} 秒前` : `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return locale === "zh" ? `${minutes} 分鐘前` : `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return locale === "zh" ? `${hours} 小時前` : `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return locale === "zh" ? `${days} 天前` : `${days}d ago`;
}

function startOfToday(reference = new Date()) {
  const copy = new Date(reference);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function periodStart(
  period: RevenuePeriod,
  reference = new Date(),
): Date | null {
  if (period === "all") {
    return null;
  }
  const base = startOfToday(reference);
  if (period === "yesterday") {
    base.setDate(base.getDate() - 1);
    return base;
  }
  const days = period === "today" ? 0 : period === "7d" ? 6 : 29;
  base.setDate(base.getDate() - days);
  return base;
}

function matchesPeriod(
  timestamp: string | null | undefined,
  period: RevenuePeriod,
  reference = new Date(),
) {
  if (!timestamp) {
    return false;
  }
  if (period === "all") {
    return true;
  }
  if (period === "yesterday") {
    const start = periodStart(period, reference);
    if (!start) {
      return false;
    }
    const end = startOfToday(reference);
    const value = new Date(timestamp).getTime();
    return value >= start.getTime() && value < end.getTime();
  }
  const start = periodStart(period, reference);
  return start ? new Date(timestamp).getTime() >= start.getTime() : true;
}

function resolveFilters(
  searchParams: URLSearchParams | ReturnType<typeof useSearchParams>,
): RevenueFilters {
  const rawPeriod = firstParam(searchParams.get("period"));
  const period: RevenuePeriod = VISIBLE_PERIODS.includes(
    rawPeriod as RevenuePeriod,
  )
    ? (rawPeriod as RevenuePeriod)
    : DEFAULT_PERIOD;
  const serviceBucket = firstParam(searchParams.get("serviceBucket")) ?? "all";
  const vehicleId = firstParam(searchParams.get("vehicleId")) ?? "all";
  return {
    period,
    serviceBucket:
      serviceBucket === "standard_taxi" || serviceBucket === "business_dispatch"
        ? serviceBucket
        : "all",
    vehicleId,
  };
}

function buildFilterQuery(filters: RevenueFilters) {
  const params = new URLSearchParams();
  if (filters.period !== DEFAULT_PERIOD) {
    params.set("period", filters.period);
  }
  if (filters.serviceBucket !== "all") {
    params.set("serviceBucket", filters.serviceBucket);
  }
  if (filters.vehicleId !== "all") {
    params.set("vehicleId", filters.vehicleId);
  }
  return params.toString();
}

function amountMinor(
  value: OwnedOrderRecord["quotedFare"] | DriverTaskRecord["fare"],
) {
  return value?.amountMinor ?? 0;
}

function revenueEntriesForFilters(
  orders: OwnedOrderRecord[],
  tasks: DriverTaskRecord[],
  filters: RevenueFilters,
) {
  const ordersById = new Map(orders.map((order) => [order.orderId, order]));
  return tasks
    .filter((task) => task.status === "completed")
    .map((task) => {
      const order = ordersById.get(task.orderId) ?? null;
      return {
        order,
        task,
        completedAt: task.completedAt,
        revenueMinor:
          amountMinor(task.fare) || amountMinor(order?.quotedFare ?? null),
      } satisfies RevenueEntry;
    })
    .filter((entry) => {
      if (!matchesPeriod(entry.completedAt, filters.period)) {
        return false;
      }
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
    });
}

function classifyRevenueChannel(entry: RevenueEntry): ChannelMixRow["key"] {
  const order = entry.order;
  if (order?.orderSource === "phone") {
    return "phone";
  }
  if (
    order?.serviceBucket === "business_dispatch" &&
    order.businessDispatchSubtype === "credit_card_airport_transfer"
  ) {
    return "partner";
  }
  if (
    order?.serviceBucket === "business_dispatch" &&
    order.businessDispatchSubtype === "enterprise_dispatch"
  ) {
    return "tenant";
  }
  return "platform";
}

function buildChannelMixRows(
  entries: RevenueEntry[],
  locale: "en" | "zh",
): ChannelMixRow[] {
  const labels: Record<ChannelMixRow["key"], string> = {
    platform: copy(locale, "Platform", "平台"),
    partner: copy(locale, "Partner", "合作夥伴"),
    phone: copy(locale, "Phone", "電話"),
    tenant: copy(locale, "Tenant", "企業租戶"),
  };
  const totals = new Map<
    ChannelMixRow["key"],
    { trips: number; revenueMinor: number }
  >();
  for (const entry of entries) {
    const key = classifyRevenueChannel(entry);
    const current = totals.get(key) ?? { trips: 0, revenueMinor: 0 };
    current.trips += 1;
    current.revenueMinor += entry.revenueMinor;
    totals.set(key, current);
  }
  const allRevenue = entries.reduce(
    (sum, entry) => sum + entry.revenueMinor,
    0,
  );
  return (["platform", "partner", "phone", "tenant"] as const).map((key) => {
    const value = totals.get(key) ?? { trips: 0, revenueMinor: 0 };
    return {
      key,
      label: labels[key],
      trips: value.trips,
      revenueMinor: value.revenueMinor,
      share:
        allRevenue > 0
          ? `${Math.round((value.revenueMinor / allRevenue) * 100)}%`
          : "0%",
    };
  });
}

function settlementMatrixKey(
  category:
    | "channel"
    | "payer"
    | "receipt"
    | "payout"
    | "reconciliation"
    | "ledger",
  channelKey: string,
) {
  return `revenue.matrix.${category}.${channelKey}`;
}

function sortSettlementMatrix(rows: SettlementMatrixRecord[]) {
  const priority = new Map(
    MATRIX_CHANNEL_ORDER.map((channelKey, index) => [channelKey, index]),
  );
  return [...rows].sort(
    (left, right) =>
      (priority.get(left.channelKey) ?? Number.MAX_SAFE_INTEGER) -
      (priority.get(right.channelKey) ?? Number.MAX_SAFE_INTEGER),
  );
}

function buildHealthEnvelope(snapshot: RevenueSnapshot): UiHealthEnvelope {
  if (snapshot.failures.length === 0) {
    return {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: snapshot.loadedAt ?? new Date().toISOString(),
    };
  }
  const criticalFailures = snapshot.failures.filter(
    (failure) => failure.critical,
  );
  const status =
    criticalFailures.length >= 4 &&
    criticalFailures.length === snapshot.failures.length
      ? "down"
      : "degraded";
  return {
    status,
    degradedServices: snapshot.failures.map((failure) => ({
      service: failure.key,
      impact: failure.external
        ? "external dependency unavailable"
        : failure.message,
      severity:
        failure.statusCode === 403 || failure.statusCode === 404
          ? "warning"
          : "critical",
    })),
    lastCheckedAt: snapshot.loadedAt ?? new Date().toISOString(),
  };
}

function buildRefreshMetadata(
  snapshot: RevenueSnapshot,
  health: UiHealthEnvelope,
  staleAfterMs: number,
  now: number,
): UiRefreshMetadata {
  const generatedAt = snapshot.loadedAt ?? new Date(now).toISOString();
  const ageMs = now - new Date(generatedAt).getTime();
  let dataFreshness: UiRefreshMetadata["dataFreshness"] = "unknown";
  if (health.status === "down") {
    dataFreshness = "degraded";
  } else if (snapshot.loadedAt) {
    dataFreshness =
      ageMs > staleAfterMs
        ? "stale"
        : health.status === "degraded"
          ? "degraded"
          : "fresh";
  }
  return {
    generatedAt,
    staleAfterMs,
    dataFreshness,
    source: "live",
  };
}

function openPlatformAdminHref(link: CrossAppResourceLink) {
  const origin =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ??
    "";
  return origin ? `${origin.replace(/\/$/, "")}${link.route}` : link.route;
}

function actionDescriptor(
  action: string,
  overrides?: Partial<ResourceActionDescriptor>,
): ResourceActionDescriptor {
  return {
    action,
    enabled: true,
    riskLevel: "low",
    ...overrides,
  };
}

function resolveAvailableAction(
  actions: ResourceActionDescriptor[],
  candidates: string[],
  fallback: ResourceActionDescriptor,
) {
  for (const candidate of candidates) {
    const exact = actions.find((descriptor) => descriptor.action === candidate);
    if (exact) {
      return exact;
    }
  }
  for (const candidate of candidates) {
    const partial = actions.find((descriptor) =>
      descriptor.action.startsWith(candidate),
    );
    if (partial) {
      return partial;
    }
  }
  return fallback;
}

function revenuePaymentsLink(locale: "en" | "zh"): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: "/payments",
    resourceType: "reconciliation_queue",
    resourceId: "payments",
    openMode: "new_tab",
    label: copy(locale, "Platform Admin /payments", "Platform Admin /payments"),
  };
}

function issueDeepLink(
  issueId: string,
  locale: "en" | "zh",
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/payments/reconciliation/${encodeURIComponent(issueId)}`,
    resourceType: "reconciliation_issue",
    resourceId: issueId,
    openMode: "new_tab",
    label: copy(locale, "Open in Platform Admin", "前往 Platform Admin"),
  };
}

function refreshTierLabel(tier: RefreshTier, locale: "en" | "zh") {
  switch (tier) {
    case "dispatch":
      return copy(locale, "T2 / 5s", "T2 / 5 秒");
    case "manual":
      return copy(locale, "T6 / manual", "T6 / 手動");
    case "urgent":
      return copy(locale, "T1 / urgent", "T1 / 緊急");
    case "fast":
      return copy(locale, "T1 / 3s", "T1 / 3 秒");
    case "medium_slow":
      return copy(locale, "T4 / 30s", "T4 / 30 秒");
    case "slow":
      return copy(locale, "T5 / 30s", "T5 / 30 秒");
    case "medium":
    default:
      return copy(locale, "T3 / 15s", "T3 / 15 秒");
  }
}

function actionButtonIcon(action: string): CanvasButtonIcon {
  if (action.includes("refresh")) {
    return "refresh";
  }
  if (action.includes("open_platform_admin")) {
    return "ext";
  }
  if (action.includes("drawer")) {
    return "arrow";
  }
  if (action.includes("filter") || action.includes("clear")) {
    return "filter";
  }
  return "arrow";
}

function actionButtonLabel(action: string, locale: "en" | "zh") {
  switch (action) {
    case "clear_filters":
      return copy(locale, "Clear filters", "清除篩選");
    case "open_platform_admin_payments":
      return copy(locale, "Open Platform Admin", "打開 Platform Admin");
    case "open_platform_admin_reconciliation":
      return copy(locale, "Owner app", "Owner app");
    case "open_mismatch_drawer":
      return copy(locale, "Drawer", "Drawer");
    case "refresh_snapshot":
      return copy(locale, "Refresh", "重新整理");
    default:
      return action.startsWith("filter_")
        ? copy(locale, "Apply filter", "套用篩選")
        : copy(locale, "Continue", "繼續");
  }
}

function compareIssuePriority(left: RevenueIssueView, right: RevenueIssueView) {
  const leftOwner = left.ownerId ?? "";
  const rightOwner = right.ownerId ?? "";
  if (leftOwner === "" && rightOwner !== "") {
    return -1;
  }
  if (leftOwner !== "" && rightOwner === "") {
    return 1;
  }
  const ownerCompare = leftOwner.localeCompare(rightOwner);
  if (ownerCompare !== 0) {
    return ownerCompare;
  }
  return (
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function datasetEmptyState(
  snapshot: RevenueSnapshot,
  keys: RevenueDatasetKey[],
): EmptyStateEnvelope | null {
  for (const key of keys) {
    const emptyState = snapshot.datasets[key]?.emptyState;
    if (emptyState) {
      return emptyState;
    }
  }
  return null;
}

function normalizeRevenueSnapshot(
  snapshot: OpsRevenueReviewSnapshot,
): RevenueSnapshot {
  const datasets = buildEmptyDatasetStates();
  for (const key of OPS_REVENUE_REVIEW_DATASET_KEYS) {
    datasets[key] = snapshot.datasets[key] ?? { key };
  }
  return {
    source: "contract",
    refreshTier: snapshot.refreshTier,
    refreshMetadata: snapshot.refreshMetadata,
    healthEnvelope: snapshot.healthEnvelope,
    availableActions: snapshot.availableActions,
    paymentsLink: snapshot.paymentsLink,
    datasets,
    orders: snapshot.orders,
    tasks: snapshot.tasks,
    statements: snapshot.statements,
    vehicles: snapshot.vehicles,
    forwardedOrders: snapshot.forwardedOrders,
    settlementMatrix: snapshot.settlementMatrix,
    reconciliationIssues: snapshot.reconciliationIssues,
    forwarderIssues: snapshot.forwarderIssues,
    failures: [],
    loadedAt: snapshot.refreshMetadata.generatedAt,
  };
}

function buildIssueViews(
  snapshot: RevenueSnapshot,
  filters: RevenueFilters,
  locale: "en" | "zh",
  now: number,
) {
  const ordersById = new Map(
    snapshot.orders.map((order) => [order.orderId, order]),
  );
  const taskByOrderId = new Map(
    snapshot.tasks.map((task) => [task.orderId, task]),
  );
  const forwarderByJobId = new Map(
    snapshot.forwarderIssues.map((issue) => [
      issue.reconciliationJob.reconciliationJobId,
      issue,
    ]),
  );

  return snapshot.reconciliationIssues
    .filter((issue) => {
      const order = issue.orderId ? ordersById.get(issue.orderId) : undefined;
      const task = issue.orderId ? taskByOrderId.get(issue.orderId) : undefined;
      if (filters.period && !matchesPeriod(issue.updatedAt, filters.period)) {
        return false;
      }
      if (
        filters.serviceBucket !== "all" &&
        order?.serviceBucket &&
        order.serviceBucket !== filters.serviceBucket
      ) {
        return false;
      }
      if (
        filters.vehicleId !== "all" &&
        task?.vehicleId &&
        task.vehicleId !== filters.vehicleId
      ) {
        return false;
      }
      return true;
    })
    .map((issue) => {
      const forwarderIssue =
        (issue.linkedReconciliationJobId
          ? forwarderByJobId.get(issue.linkedReconciliationJobId)
          : undefined) ?? null;
      const platformCode =
        forwarderIssue?.platformCode ??
        issue.forwardedFinanceContext?.platformCode ??
        issue.channelKey;
      const reason =
        forwarderIssue?.reconciliationJob.reason ??
        issue.issueType ??
        issue.channelKey;
      const financeLine = issue.forwardedFinanceContext
        ? `${copy(locale, "Fare", "車資")}: ${formatOpsCodeLabel(
            locale,
            issue.forwardedFinanceContext.fareAuthority,
          )} · ${copy(locale, "Settlement", "結算")}: ${formatOpsCodeLabel(
            locale,
            issue.forwardedFinanceContext.settlementAuthority,
          )}`
        : (issue.resolutionSummary ?? issue.summary);
      const availableActions =
        issue.availableActions && issue.availableActions.length > 0
          ? issue.availableActions
          : [
              actionDescriptor("open_mismatch_drawer"),
              actionDescriptor("open_platform_admin_reconciliation"),
            ];
      return {
        ...issue,
        platformLabel: formatOpsCodeLabel(locale, platformCode),
        ownerLabel:
          issue.ownerId ??
          copy(locale, "Unassigned finance owner", "未指派財務 owner"),
        reasonLabel: formatOpsCodeLabel(locale, reason),
        ageLabel: formatAge(issue.createdAt, now, locale),
        touchedAtLabel: formatDateTime(issue.updatedAt, locale),
        summaryLine: issue.summary,
        mirrorLine:
          issue.mirrorOrderId || issue.externalOrderId
            ? `${issue.mirrorOrderId ?? "—"} / ${issue.externalOrderId ?? "—"}`
            : copy(locale, "No order linkage", "無訂單關聯"),
        financeLine,
        ownerAppLink: issue.ownerAppLink ?? issueDeepLink(issue.issueId, locale),
        availableActions,
      } satisfies RevenueIssueView;
    })
    .sort(compareIssuePriority);
}

function buildMatrixRows(rows: SettlementMatrixRecord[], locale: "en" | "zh") {
  return sortSettlementMatrix(rows).map((row) => {
    const channelLabel = formatOpsCodeLabel(locale, row.channelKey);
    const statusLabel =
      row.localLedgerMode === "shadow_only"
        ? copy(locale, "Pending owner handoff", "待 owner 接手")
        : copy(locale, "Reconciled in-platform", "站內結算");
    const statusTone =
      row.localLedgerMode === "shadow_only" ? "warn" : "success";
    return {
      ...row,
      channelLabel,
      payerLabel: row.payerType,
      receiptLabel: `${row.receiptOwner} · ${row.reconciliationPath}`,
      payoutLabel: row.driverPayoutAuthority,
      statusLabel,
      statusTone,
      ledgerLabel:
        row.localLedgerMode === "shadow_only"
          ? copy(locale, "Shadow only", "影子帳")
          : copy(locale, "Full service", "完整結算"),
    } satisfies MatrixViewRow;
  });
}

function sectionEmptyState(
  reason: EmptyReason,
  messageCode: string,
  nextAction?: ResourceActionDescriptor,
) {
  return {
    reason,
    messageCode,
    ...(nextAction ? { nextAction } : {}),
  } satisfies EmptyStateEnvelope;
}

function emptyStateMeta(reason: EmptyReason, locale: "en" | "zh") {
  switch (reason) {
    case "not_provisioned":
      return {
        icon: "flags" as CanvasIconKey,
        tone: "info" as const,
        title: copy(locale, "Finance view not provisioned", "財務檢視尚未開通"),
        body: copy(
          locale,
          "Settlement matrix and statement feeds are not enabled for this realm yet.",
          "此 realm 尚未開啟 settlement matrix 與 statement feed。",
        ),
      };
    case "fetch_failed":
      return {
        icon: "warn" as CanvasIconKey,
        tone: "danger" as const,
        title: copy(
          locale,
          "Revenue snapshot failed to load",
          "收益快照載入失敗",
        ),
        body: copy(
          locale,
          "The backend returned an error for this slice. Refresh after the dependency recovers.",
          "此區塊的後端讀模型回傳錯誤，請待依賴恢復後重新整理。",
        ),
      };
    case "permission_denied":
      return {
        icon: "users" as CanvasIconKey,
        tone: "warn" as const,
        title: copy(
          locale,
          "Scope does not allow this data",
          "目前權限無法檢視此資料",
        ),
        body: copy(
          locale,
          "The current actor can see the page shell but not the requested finance slice.",
          "目前 actor 可進入頁面，但沒有此財務切片的讀取權限。",
        ),
      };
    case "external_unavailable":
      return {
        icon: "health" as CanvasIconKey,
        tone: "warn" as const,
        title: copy(
          locale,
          "External owner is unavailable",
          "外部 owner 目前不可用",
        ),
        body: copy(
          locale,
          "Read-only mirror data is waiting on an external adapter or finance owner service.",
          "read-only mirror 正等待外部 adapter 或 finance owner service 恢復。",
        ),
      };
    case "filtered_empty":
      return {
        icon: "filter" as CanvasIconKey,
        tone: "accent" as const,
        title: copy(
          locale,
          "Filters narrowed the result to zero",
          "篩選條件把結果收斂為 0",
        ),
        body: copy(
          locale,
          "Clear period, service bucket, or vehicle filters to widen the review set.",
          "請放寬期別、服務桶或車輛條件，以恢復檢視範圍。",
        ),
      };
    case "no_data":
    default:
      return {
        icon: "revenue" as CanvasIconKey,
        tone: "info" as const,
        title: copy(
          locale,
          "No revenue activity in this period",
          "此期別沒有收益活動",
        ),
        body: copy(
          locale,
          "This is a legitimate empty period, not a transport or permission error.",
          "這是合法的空期間，不是傳輸或權限錯誤。",
        ),
      };
  }
}

function pageBodyStyle(canvasTheme: CanvasTheme): CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "grid",
    gap: canvasTheme.sectGap,
  };
}

function sectionGridStyle(columns: string): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    gap: 16,
    alignItems: "start",
  };
}

function nativeSelectStyle(canvasTheme: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${canvasTheme.border}`,
    background: canvasTheme.bgRaised,
    color: canvasTheme.text,
    fontSize: 12.5,
    fontFamily: canvasTheme.fontFamily,
  };
}

function EmptyStateCard({
  locale,
  emptyState,
  onAction,
}: {
  locale: "en" | "zh";
  emptyState: EmptyStateEnvelope;
  onAction: (action: ResourceActionDescriptor) => void;
}) {
  const meta = emptyStateMeta(emptyState.reason, locale);
  return (
    <div
      style={{
        padding: 18,
        display: "grid",
        gap: 12,
        alignContent: "start",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              meta.tone === "danger"
                ? theme.dangerBg
                : meta.tone === "warn"
                  ? theme.warnBg
                  : meta.tone === "accent"
                    ? theme.accentBg
                    : theme.infoBg,
            color:
              meta.tone === "danger"
                ? theme.danger
                : meta.tone === "warn"
                  ? theme.warn
                  : meta.tone === "accent"
                    ? theme.accent
                    : theme.info,
          }}
        >
          <CanvasIcon name={meta.icon} size={16} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.title}</div>
          <div
            style={{
              fontSize: 10.5,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {emptyState.messageCode}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.45 }}>
        {meta.body}
      </div>
      {emptyState.nextAction ? (
        <div>
          <CanvasBtn
            theme={theme}
            size="xs"
            icon={actionButtonIcon(emptyState.nextAction.action)}
            disabled={!emptyState.nextAction.enabled}
            onClick={() => onAction(emptyState.nextAction!)}
            style={{ minWidth: 0 }}
          >
            {actionButtonLabel(emptyState.nextAction.action, locale)}
          </CanvasBtn>
        </div>
      ) : null}
    </div>
  );
}

function RefreshTierBadge({
  refresh,
  refreshTier,
  locale,
}: {
  refresh: UiRefreshMetadata;
  refreshTier: RefreshTier;
  locale: "en" | "zh";
}) {
  const tone =
    refresh.dataFreshness === "degraded"
      ? { fg: theme.danger, bg: theme.dangerBg, bd: theme.dangerBorder }
      : refresh.dataFreshness === "stale"
        ? { fg: theme.warn, bg: theme.warnBg, bd: theme.warnBorder }
        : { fg: theme.success, bg: theme.successBg, bd: theme.successBorder };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 6,
        border: `1px solid ${tone.bd}`,
        background: tone.bg,
        color: tone.fg,
        fontSize: 10.5,
        fontWeight: 600,
        fontFamily: theme.monoFamily,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: tone.fg,
        }}
      />
      {refreshTierLabel(refreshTier, locale)}
      {refresh.dataFreshness !== "fresh" ? ` · ${refresh.dataFreshness}` : ""}
    </div>
  );
}

function HealthBanner({
  locale,
  health,
}: {
  locale: "en" | "zh";
  health: UiHealthEnvelope;
}) {
  if (health.status === "healthy") {
    return null;
  }
  return (
    <CanvasBanner
      theme={theme}
      tone={health.status === "down" ? "danger" : "warn"}
      icon="health"
      title={copy(
        locale,
        "Page-critical dependency is degraded",
        "頁面關鍵依賴已降級",
      )}
      body={
        health.degradedServices.length > 0
          ? health.degradedServices
              .map(
                (service: UiHealthEnvelope["degradedServices"][number]) =>
                  `${service.service} (${service.impact})`,
              )
              .join(" · ")
          : copy(
              locale,
              "The page may continue in a degraded read-only mode.",
              "頁面會以降級的 read-only 模式繼續顯示。",
            )
      }
    />
  );
}

function StaleBanner({
  locale,
  refresh,
  onRefresh,
  busy,
}: {
  locale: "en" | "zh";
  refresh: UiRefreshMetadata;
  onRefresh: () => void;
  busy: boolean;
}) {
  if (
    refresh.dataFreshness === "fresh" ||
    refresh.dataFreshness === "unknown"
  ) {
    return null;
  }
  return (
    <CanvasBanner
      theme={theme}
      tone={refresh.dataFreshness === "degraded" ? "danger" : "warn"}
      icon="clock"
      title={copy(locale, "Revenue snapshot is stale", "收益快照已過時")}
      body={`${copy(locale, "Generated at", "產生時間")} ${formatDateTime(
        refresh.generatedAt,
        locale,
      )} · dataFreshness=${refresh.dataFreshness}`}
      actions={
        <CanvasBtn
          theme={theme}
          size="xs"
          icon="refresh"
          disabled={busy}
          onClick={onRefresh}
        >
          {busy
            ? copy(locale, "Refreshing…", "更新中…")
            : copy(locale, "Refresh", "重新整理")}
        </CanvasBtn>
      }
    />
  );
}

function RuntimeStrip({
  locale,
  refresh,
  refreshTier,
  health,
}: {
  locale: "en" | "zh";
  refresh: UiRefreshMetadata;
  refreshTier: RefreshTier;
  health: UiHealthEnvelope;
}) {
  const healthTone =
    health.status === "healthy"
      ? "success"
      : health.status === "down"
        ? "danger"
        : "warn";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <CanvasPill theme={theme} tone="accent">
          ops / production / OC / finance reviewer
        </CanvasPill>
        <CanvasPill theme={theme} tone={healthTone} dot>
          {copy(locale, "API", "API")} {health.status}
        </CanvasPill>
        <CanvasPill theme={theme} tone="info">
          {copy(locale, "Read-only mirror", "Read-only mirror")}
        </CanvasPill>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RefreshTierBadge
          refresh={refresh}
          refreshTier={refreshTier}
          locale={locale}
        />
        <span
          style={{
            fontSize: 11,
            color: theme.textDim,
            fontFamily: theme.monoFamily,
          }}
        >
          {copy(locale, "last checked", "last checked")}{" "}
          {formatDateTime(health.lastCheckedAt, locale)}
        </span>
      </div>
    </div>
  );
}

async function loadLegacyRevenueSnapshot(
  previous: RevenueSnapshot | null,
): Promise<RevenueSnapshot> {
  const client = getOpsClient();
  const loaders: Array<{
    key: RevenueDatasetKey;
    critical: boolean;
    external: boolean;
    load: () => Promise<
      | OwnedOrderRecord[]
      | DriverTaskRecord[]
      | DriverStatementRecord[]
      | VehicleRegistryRecord[]
      | ForwardedOrderRecord[]
      | SettlementMatrixRecord[]
      | ReconciliationIssueRecord[]
      | ForwarderReconciliationIssue[]
    >;
  }> = [
    {
      key: "orders",
      critical: true,
      external: false,
      load: () => client.listOrders(),
    },
    {
      key: "tasks",
      critical: true,
      external: false,
      load: () => client.listDriverTasks(),
    },
    {
      key: "statements",
      critical: true,
      external: false,
      load: () => client.listDriverStatements(),
    },
    {
      key: "vehicles",
      critical: false,
      external: false,
      load: () => client.listVehicles(),
    },
    {
      key: "forwardedOrders",
      critical: false,
      external: true,
      load: () => client.listForwarderOrders(),
    },
    {
      key: "settlementMatrix",
      critical: true,
      external: false,
      load: () => client.listSettlementMatrix(),
    },
    {
      key: "reconciliationIssues",
      critical: true,
      external: false,
      load: () => client.listReconciliationIssues(),
    },
    {
      key: "forwarderIssues",
      critical: false,
      external: true,
      load: () => client.listForwarderReconciliationIssues(),
    },
  ];

  const results = await Promise.allSettled(
    loaders.map((loader) => loader.load()),
  );
  const next: RevenueSnapshot = {
    ...EMPTY_SNAPSHOT,
    source: "legacy",
    loadedAt: new Date().toISOString(),
    failures: [],
  };

  loaders.forEach((loader, index) => {
    const result = results[index];
    if (result?.status === "fulfilled") {
      (next[loader.key] as RevenueSnapshot[typeof loader.key]) =
        result.value as RevenueSnapshot[typeof loader.key];
      return;
    }
    next.failures.push({
      key: loader.key,
      message:
        result?.status === "rejected" && result.reason instanceof Error
          ? result.reason.message
          : "Unknown error",
      statusCode:
        result?.status === "rejected" ? parseStatusCode(result.reason) : null,
      critical: loader.critical,
      external: loader.external,
    });
    (next[loader.key] as RevenueSnapshot[typeof loader.key]) =
      previous?.[loader.key] ?? EMPTY_SNAPSHOT[loader.key];
  });

  return next;
}

async function loadRevenueSnapshot(
  previous: RevenueSnapshot | null,
): Promise<RevenueSnapshot> {
  const client = getOpsClient();
  try {
    return normalizeRevenueSnapshot(await client.getOpsRevenueReview());
  } catch {
    return loadLegacyRevenueSnapshot(previous);
  }
}

export default function RevenuePage() {
  const { locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = resolveFilters(searchParams);
  const [snapshot, setSnapshot] = useState<RevenueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "insight" | "channel" | "matrix" | "mismatch"
  >("matrix");
  const [now, setNow] = useState(() => Date.now());
  const [routing, startRoutingTransition] = useTransition();
  const snapshotRef = useRef<RevenueSnapshot | null>(null);
  const loadTokenRef = useRef(0);
  const data = snapshot ?? EMPTY_SNAPSHOT;
  const refreshTier = data.refreshTier;
  const refreshCadenceMs =
    REFRESH_TIER_CADENCE_MS[refreshTier] || DEFAULT_REFRESH_INTERVAL_MS;

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    void refreshRevenue("initial");
    const pollId =
      refreshCadenceMs > 0
        ? window.setInterval(() => {
            void refreshRevenue("poll");
          }, refreshCadenceMs)
        : null;
    const clockId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      if (pollId !== null) {
        window.clearInterval(pollId);
      }
      window.clearInterval(clockId);
    };
  }, [refreshCadenceMs]);

  async function refreshRevenue(mode: "initial" | "poll" | "manual") {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    if (mode === "initial") {
      setLoading(true);
    } else if (mode === "manual") {
      setRefreshing(true);
    }
    try {
      const nextSnapshot = await loadRevenueSnapshot(snapshotRef.current);
      if (loadTokenRef.current !== token) {
        return;
      }
      setSnapshot(nextSnapshot);
    } finally {
      if (loadTokenRef.current === token) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  function applyFilters(nextFilters: RevenueFilters) {
    const query = buildFilterQuery(nextFilters);
    startRoutingTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  const health = data.healthEnvelope ?? buildHealthEnvelope(data);
  const refresh =
    data.refreshMetadata ??
    buildRefreshMetadata(data, health, refreshCadenceMs, now);
  const filteredEntries = revenueEntriesForFilters(
    data.orders,
    data.tasks,
    filters,
  );
  const allEntries = revenueEntriesForFilters(data.orders, data.tasks, {
    period: "all",
    serviceBucket: "all",
    vehicleId: "all",
  });
  const insights = buildRevenueInsights(
    data.orders,
    data.tasks,
    data.statements,
    filters,
  );
  const channelMixRows = buildChannelMixRows(filteredEntries, locale);
  const matrixRows = buildMatrixRows(data.settlementMatrix, locale);
  const issueViews = buildIssueViews(data, filters, locale, now);
  const selectedIssue =
    issueViews.find((issue) => issue.issueId === selectedIssueId) ?? null;
  const vehicleOptions = Array.from(
    new Set(
      [
        ...data.vehicles.map((vehicle) => vehicle.vehicleId),
        ...data.tasks.map((task) => task.vehicleId),
      ].filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const syncFailedCount = data.forwardedOrders.filter(
    (order) =>
      order.status === "sync_failed" &&
      matchesPeriod(order.updatedAt, filters.period),
  ).length;
  const openReconciliationCount = issueViews.filter(
    (issue) => issue.status !== "resolved",
  ).length;
  const ownedShare = channelMixRows[0]
    ? Math.round(
        channelMixRows[0].revenueMinor > 0 && insights.totalRevenueMinor > 0
          ? (channelMixRows[0].revenueMinor / insights.totalRevenueMinor) * 100
          : 0,
      )
    : 0;
  const hasFilters =
    filters.period !== DEFAULT_PERIOD ||
    filters.serviceBucket !== "all" ||
    filters.vehicleId !== "all";

  const refreshAction = resolveAvailableAction(
    data.availableActions,
    ["refresh_snapshot", "refresh"],
    actionDescriptor("refresh_snapshot"),
  );
  const clearFiltersAction = resolveAvailableAction(
    data.availableActions,
    ["clear_filters"],
    actionDescriptor("clear_filters", {
      enabled: hasFilters,
      ...(hasFilters ? {} : { disabledReasonCode: "already_default_filters" }),
    }),
  );
  const openPaymentsAction = resolveAvailableAction(
    data.availableActions,
    ["open_platform_admin_payments", "open_payments"],
    actionDescriptor("open_platform_admin_payments"),
  );
  const periodFilterAction = resolveAvailableAction(
    data.availableActions,
    [`filter_period_${filters.period}`, "filter_period"],
    actionDescriptor(`filter_period_${filters.period}`),
  );
  const serviceBucketFilterAction = resolveAvailableAction(
    data.availableActions,
    [
      `filter_service_bucket_${filters.serviceBucket}`,
      "filter_service_bucket",
      "filter_serviceBucket",
    ],
    actionDescriptor(`filter_service_bucket_${filters.serviceBucket}`),
  );
  const vehicleFilterAction = resolveAvailableAction(
    data.availableActions,
    [`filter_vehicle_${filters.vehicleId}`, "filter_vehicle"],
    actionDescriptor(`filter_vehicle_${filters.vehicleId}`),
  );
  const paymentsLink = data.paymentsLink ?? revenuePaymentsLink(locale);
  const ordersTasksEmptyState = datasetEmptyState(data, ["orders", "tasks"]);
  const vehicleDatasetEmptyState = datasetEmptyState(data, [
    "vehicles",
    "tasks",
  ]);
  const matrixDatasetEmptyState = datasetEmptyState(data, ["settlementMatrix"]);
  const statementDatasetEmptyState = datasetEmptyState(data, ["statements"]);
  const mismatchDatasetEmptyState = datasetEmptyState(data, [
    "reconciliationIssues",
    "forwarderIssues",
  ]);

  const serviceBucketEmptyState =
    insights.serviceBuckets.length > 0
      ? null
      : hasFilters && allEntries.length > 0
        ? sectionEmptyState(
            "filtered_empty",
            "revenue.breakdown.service_bucket",
            clearFiltersAction,
          )
        : ordersTasksEmptyState ??
          sectionEmptyState(
            data.failures.some(
              (failure) => failure.key === "orders" || failure.key === "tasks",
            )
              ? "fetch_failed"
              : allEntries.length === 0 && data.settlementMatrix.length === 0
                ? "not_provisioned"
                : "no_data",
            "revenue.breakdown.service_bucket",
            refreshAction,
          );

  const vehicleEmptyState =
    insights.vehicles.length > 0
      ? null
      : hasFilters && data.tasks.length > 0
        ? sectionEmptyState(
            "filtered_empty",
            "revenue.breakdown.vehicle",
            clearFiltersAction,
          )
        : vehicleDatasetEmptyState ??
          sectionEmptyState(
            data.failures.some((failure) => failure.key === "vehicles")
              ? "fetch_failed"
              : data.vehicles.length === 0 && data.tasks.length === 0
                ? "not_provisioned"
                : "no_data",
            "revenue.breakdown.vehicle",
            undefined,
          );

  const channelEmptyState = channelMixRows.some((row) => row.trips > 0)
    ? null
    : hasFilters && allEntries.length > 0
      ? sectionEmptyState(
          "filtered_empty",
          "revenue.channel_mix",
          clearFiltersAction,
        )
      : ordersTasksEmptyState ??
        sectionEmptyState(
          data.failures.some(
            (failure) => failure.key === "orders" || failure.key === "tasks",
          )
            ? "fetch_failed"
            : "no_data",
          "revenue.channel_mix",
          refreshAction,
        );

  const matrixEmptyState =
    matrixRows.length > 0
      ? null
      : matrixDatasetEmptyState ??
        sectionEmptyState(
          data.failures.some((failure) => failure.key === "settlementMatrix")
            ? data.failures.some(
                (failure) =>
                  failure.key === "settlementMatrix" &&
                  failure.statusCode === 403,
              )
              ? "permission_denied"
              : "fetch_failed"
            : data.orders.length === 0 && data.statements.length === 0
              ? "not_provisioned"
              : "no_data",
          "revenue.settlement_matrix",
          data.failures.some((failure) => failure.key === "settlementMatrix")
            ? refreshAction
            : undefined,
        );

  const mismatchEmptyState =
    issueViews.length > 0
      ? null
      : hasFilters && data.reconciliationIssues.length > 0
        ? sectionEmptyState(
            "filtered_empty",
            "revenue.mismatch_queue",
            clearFiltersAction,
          )
        : mismatchDatasetEmptyState ??
          sectionEmptyState(
            data.failures.some(
              (failure) =>
                failure.key === "reconciliationIssues" &&
                failure.statusCode === 403,
            )
              ? "permission_denied"
              : data.failures.some(
                    (failure) => failure.key === "reconciliationIssues",
                  )
                ? "fetch_failed"
                : data.failures.some(
                      (failure) =>
                        failure.key === "forwardedOrders" ||
                        failure.key === "forwarderIssues",
                    )
                  ? "external_unavailable"
                  : "no_data",
            "revenue.mismatch_queue",
            data.failures.some(
              (failure) =>
                failure.key === "reconciliationIssues" ||
                failure.key === "forwarderIssues",
            )
              ? refreshAction
              : openPaymentsAction,
          );

  const payoutRows = insights.payoutStatuses.map((item) => ({
    key: item.status,
    label: formatOpsCodeLabel(locale, item.status),
    count: item.count,
    value: formatMinorCurrency(item.netMinor),
  }));

  const tabs = [
    <button
      key="insight"
      type="button"
      onClick={() => {
        setActiveTab("insight");
        document.getElementById("revenue-insight")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }}
      style={tabButtonStyle()}
    >
      {copy(locale, "Insight", "Insight")}
    </button>,
    <button
      key="channel"
      type="button"
      onClick={() => {
        setActiveTab("channel");
        document.getElementById("revenue-channel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }}
      style={tabButtonStyle()}
    >
      {copy(locale, "Channel mix", "Channel mix")}
    </button>,
    <button
      key="matrix"
      type="button"
      onClick={() => {
        setActiveTab("matrix");
        document.getElementById("revenue-matrix")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }}
      style={tabButtonStyle()}
    >
      {copy(locale, "Settlement matrix", "Settlement matrix")}
    </button>,
    <button
      key="mismatch"
      type="button"
      onClick={() => {
        setActiveTab("mismatch");
        document.getElementById("revenue-mismatch")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }}
      style={tabButtonStyle()}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {copy(locale, "Mismatch review", "Mismatch review")}
        <CanvasPill
          theme={theme}
          tone={openReconciliationCount > 0 ? "warn" : "neutral"}
        >
          {String(openReconciliationCount)}
        </CanvasPill>
      </span>
    </button>,
  ];

  useEffect(() => {
    if (
      selectedIssueId &&
      !issueViews.some((issue) => issue.issueId === selectedIssueId)
    ) {
      setSelectedIssueId(null);
    }
  }, [issueViews, selectedIssueId]);

  function runEmptyStateAction(action: ResourceActionDescriptor) {
    switch (action.action) {
      case "clear_filters":
        applyFilters({
          period: DEFAULT_PERIOD,
          serviceBucket: "all",
          vehicleId: "all",
        });
        return;
      case "open_platform_admin_payments":
        window.open(
          openPlatformAdminHref(paymentsLink),
          "_blank",
          "noopener,noreferrer",
        );
        return;
      case "refresh_snapshot":
      default:
        void refreshRevenue("manual");
    }
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy(locale, "Revenue review", "收益審視")}
        subtitle={copy(
          locale,
          "period · service bucket · vehicle · channel mix · settlement matrix — mismatch mutation stays in Platform Admin",
          "period · service bucket · vehicle · channel mix · settlement matrix — mismatch mutation 在 Platform Admin 完成",
        )}
        tabs={tabs}
        activeTab={
          activeTab === "insight"
            ? tabs[0]
            : activeTab === "channel"
              ? tabs[1]
              : activeTab === "matrix"
                ? tabs[2]
                : tabs[3]
        }
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="refresh"
              disabled={refreshing || !refreshAction.enabled}
              onClick={() => void refreshRevenue("manual")}
            >
              {refreshing
                ? copy(locale, "Refreshing…", "更新中…")
                : copy(locale, "Refresh", "重新整理")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="ext"
              disabled={!openPaymentsAction.enabled}
              onClick={() => runEmptyStateAction(openPaymentsAction)}
            >
              {paymentsLink.label}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle(theme)}>
        <RuntimeStrip
          locale={locale}
          refresh={refresh}
          refreshTier={refreshTier}
          health={health}
        />
        <HealthBanner locale={locale} health={health} />
        <StaleBanner
          locale={locale}
          refresh={refresh}
          onRefresh={() => void refreshRevenue("manual")}
          busy={refreshing}
        />

        <CanvasCard
          theme={theme}
          title={copy(locale, "Review controls", "審視控制")}
          subtitle={copy(
            locale,
            "availableActions drive period, service-bucket, and vehicle review pivots.",
            "period、service bucket、vehicle 的切換由 availableActions 驅動。",
          )}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <div style={fieldLabelStyle()}>
                {copy(locale, "Period", "期別")}
              </div>
              <div style={chipRowStyle()}>
                {VISIBLE_PERIODS.map((period) => {
                  const descriptor = resolveAvailableAction(
                    data.availableActions,
                    [`filter_period_${period}`, "filter_period"],
                    periodFilterAction,
                  );
                  return (
                    <CanvasBtn
                      key={period}
                      theme={theme}
                      size="xs"
                      variant={
                        filters.period === period ? "primary" : "secondary"
                      }
                      disabled={!descriptor.enabled}
                      onClick={() => applyFilters({ ...filters, period })}
                      style={{ minWidth: 0 }}
                    >
                      {period === "today"
                        ? copy(locale, "Today", "今天")
                        : period === "yesterday"
                          ? copy(locale, "Yesterday", "昨天")
                          : period === "7d"
                            ? copy(locale, "Last 7", "近 7 天")
                            : copy(locale, "Last 30", "近 30 天")}
                    </CanvasBtn>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={fieldLabelStyle()}>
                {copy(locale, "Service bucket", "服務桶")}
              </div>
              <div style={chipRowStyle()}>
                {(["all", "standard_taxi", "business_dispatch"] as const).map(
                  (serviceBucket) => {
                    const descriptor = resolveAvailableAction(
                      data.availableActions,
                      [
                        `filter_service_bucket_${serviceBucket}`,
                        "filter_service_bucket",
                        "filter_serviceBucket",
                      ],
                      serviceBucketFilterAction,
                    );
                    return (
                      <CanvasBtn
                        key={serviceBucket}
                        theme={theme}
                        size="xs"
                        variant={
                          filters.serviceBucket === serviceBucket
                            ? "primary"
                            : "secondary"
                        }
                        disabled={!descriptor.enabled}
                        onClick={() =>
                          applyFilters({ ...filters, serviceBucket })
                        }
                        style={{ minWidth: 0 }}
                      >
                        {serviceBucket === "all"
                          ? copy(locale, "All", "全部")
                          : formatOpsCodeLabel(locale, serviceBucket)}
                      </CanvasBtn>
                    );
                  },
                )}
              </div>
            </div>

            <div>
              <div style={fieldLabelStyle()}>
                {copy(locale, "Vehicle", "車輛")}
              </div>
              <select
                value={filters.vehicleId}
                disabled={!vehicleFilterAction.enabled}
                onChange={(event) =>
                  applyFilters({
                    ...filters,
                    vehicleId: event.target.value || "all",
                  })
                }
                style={nativeSelectStyle(theme)}
              >
                <option value="all">
                  {copy(locale, "All vehicles", "全部車輛")}
                </option>
                {vehicleOptions.map((vehicleId) => (
                  <option key={vehicleId} value={vehicleId}>
                    {vehicleId}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CanvasCard>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={copy(locale, "Current billed", "當期 billed")}
            value={formatMinorCurrency(insights.totalRevenueMinor)}
            delta={`${formatCompactNumber(insights.completedTrips)} ${copy(locale, "trips", "趟")}`}
            sub={copy(
              locale,
              `generated ${formatDateTime(refresh.generatedAt, locale)}`,
              `快照產生於 ${formatDateTime(refresh.generatedAt, locale)}`,
            )}
          />
          <CanvasKPI
            theme={theme}
            label={copy(locale, "Owned share", "自營佔比")}
            value={`${ownedShare}%`}
            delta={channelMixRows[3]?.share ?? "0%"}
            deltaTone="neutral"
            sub={copy(
              locale,
              "tenant share shown as delta",
              "delta 顯示租戶佔比",
            )}
          />
          <CanvasKPI
            theme={theme}
            label="forwarded sync_failed"
            value={String(syncFailedCount)}
            delta={
              syncFailedCount > 0
                ? copy(locale, "watch threshold", "需注意閾值")
                : copy(locale, "within range", "目前正常")
            }
            deltaTone={syncFailedCount > 0 ? "down" : "up"}
            sub={copy(
              locale,
              "period-scoped mirror failures",
              "期別內 mirror 失敗",
            )}
          />
          <CanvasKPI
            theme={theme}
            label={copy(locale, "Open reconciliation", "未結 reconciliation")}
            value={String(openReconciliationCount)}
            sub={copy(
              locale,
              "mutation remains in Platform Admin",
              "mutation 在 Platform Admin",
            )}
          />
        </div>

        <CanvasBanner
          theme={theme}
          tone="info"
          icon="info"
          title={copy(
            locale,
            "This page is a read-only mirror for Q-OPS14",
            "此頁是 Q-OPS14 的 read-only mirror",
          )}
          body={copy(
            locale,
            "ops_finance_reviewer may inspect mismatch and settlement authority here, but every mutation follows the platform-admin finance owner flow.",
            "ops_finance_reviewer 可在此檢視 mismatch 與 settlement authority，但所有 mutation 都必須走 platform-admin finance owner 流程。",
          )}
          actions={
            <CanvasBtn
              theme={theme}
              variant="secondary"
              size="xs"
              icon="ext"
              disabled={!openPaymentsAction.enabled}
              onClick={() => runEmptyStateAction(openPaymentsAction)}
            >
              {paymentsLink.label}
            </CanvasBtn>
          }
        />

        <div id="revenue-matrix">
          <CanvasCard
            theme={theme}
            title={copy(locale, "Settlement matrix", "Settlement matrix")}
            subtitle={copy(
              locale,
              "Matrix-first review keeps payer, receipt, payout, and reconciliation authority visible before close.",
              "以 matrix-first 的順序審視 payer、receipt、payout 與 reconciliation authority。",
            )}
            padding={0}
          >
            {matrixRows.length > 0 ? (
              <CanvasTable<MatrixViewRow>
                theme={theme}
                columns={[
                  {
                    h: copy(locale, "Channel", "渠道"),
                    r: (row: MatrixViewRow) => (
                      <div style={cellStackStyle()}>
                        <span>{row.channelLabel}</span>
                        <span style={mutedLineStyle()}>
                          {row.orderDomain} · {row.orderSources.join(" / ")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Payer",
                    r: (row: MatrixViewRow) => (
                      <div style={cellStackStyle()}>
                        <span>
                          {formatOpsCodeLabel(locale, row.payerLabel)}
                        </span>
                        <span style={mutedLineStyle()}>
                          {formatOpsCodeLabel(locale, row.sponsorType)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Receipt / recon", "收據 / 對帳"),
                    r: (row: MatrixViewRow) => (
                      <div style={cellStackStyle()}>
                        <span>
                          {formatOpsCodeLabel(locale, row.receiptOwner)}
                        </span>
                        <span style={mutedLineStyle()}>
                          {formatOpsCodeLabel(locale, row.reconciliationPath)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Payout", "Payout"),
                    r: (row: MatrixViewRow) => (
                      <div style={cellStackStyle()}>
                        <span>
                          {formatOpsCodeLabel(
                            locale,
                            row.driverPayoutAuthority,
                          )}
                        </span>
                        <span style={mutedLineStyle()}>
                          {formatOpsCodeLabel(
                            locale,
                            row.discountFundingSource,
                          )}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Ledger",
                    r: (row: MatrixViewRow) => (
                      <CanvasPill theme={theme} tone={row.statusTone}>
                        {row.ledgerLabel}
                      </CanvasPill>
                    ),
                  },
                  {
                    h: "Status",
                    r: (row: MatrixViewRow) => (
                      <CanvasPill theme={theme} tone={row.statusTone} dot>
                        {row.statusLabel}
                      </CanvasPill>
                    ),
                  },
                ]}
                rows={matrixRows}
              />
            ) : (
              <EmptyStateCard
                locale={locale}
                emptyState={matrixEmptyState!}
                onAction={runEmptyStateAction}
              />
            )}
          </CanvasCard>
        </div>

        <div style={sectionGridStyle("repeat(auto-fit, minmax(320px, 1fr))")}>
          <div id="revenue-insight">
            <CanvasCard
              theme={theme}
              title={copy(locale, "Service bucket breakdown", "服務桶拆解")}
              subtitle={copy(
                locale,
                "Period revenue by product bucket.",
                "依產品桶查看期別收益。",
              )}
              padding={0}
            >
              {insights.serviceBuckets.length > 0 ? (
                <CanvasTable
                  theme={theme}
                  columns={[
                    { h: copy(locale, "Bucket", "服務桶"), k: "label" },
                    {
                      h: copy(locale, "Trips", "趟次"),
                      align: "right",
                      r: (row) => formatCompactNumber(row.trips),
                    },
                    {
                      h: copy(locale, "Revenue", "收益"),
                      align: "right",
                      r: (row) => formatMinorCurrency(row.revenueMinor),
                    },
                    {
                      h: copy(locale, "Average", "平均"),
                      align: "right",
                      r: (row) => formatMinorCurrency(row.averageMinor),
                    },
                  ]}
                  rows={insights.serviceBuckets}
                />
              ) : (
                <EmptyStateCard
                  locale={locale}
                  emptyState={serviceBucketEmptyState!}
                  onAction={runEmptyStateAction}
                />
              )}
            </CanvasCard>
          </div>

          <div id="revenue-channel">
            <CanvasCard
              theme={theme}
              title={copy(locale, "Channel mix", "Channel mix")}
              subtitle={copy(
                locale,
                "Platform / partner / phone / tenant revenue share.",
                "平台 / 合作夥伴 / 電話 / 企業租戶的收益分布。",
              )}
              padding={0}
            >
              {channelMixRows.some((row) => row.trips > 0) ? (
                <CanvasTable
                  theme={theme}
                  columns={[
                    { h: copy(locale, "Channel", "渠道"), k: "label" },
                    {
                      h: copy(locale, "Trips", "趟次"),
                      align: "right",
                      r: (row) => formatCompactNumber(row.trips),
                    },
                    {
                      h: copy(locale, "Revenue", "收益"),
                      align: "right",
                      r: (row) => formatMinorCurrency(row.revenueMinor),
                    },
                    {
                      h: copy(locale, "Share", "佔比"),
                      align: "right",
                      k: "share",
                    },
                  ]}
                  rows={channelMixRows}
                />
              ) : (
                <EmptyStateCard
                  locale={locale}
                  emptyState={channelEmptyState!}
                  onAction={runEmptyStateAction}
                />
              )}
            </CanvasCard>
          </div>
        </div>

        <div style={sectionGridStyle("repeat(auto-fit, minmax(320px, 1fr))")}>
          <CanvasCard
            theme={theme}
            title={copy(locale, "Vehicle breakdown", "車輛拆解")}
            subtitle={copy(
              locale,
              "Revenue-bearing vehicles in the selected review window.",
              "在目前檢視視窗內有收益的車輛。",
            )}
            padding={0}
          >
            {insights.vehicles.length > 0 ? (
              <CanvasTable
                theme={theme}
                columns={[
                  { h: copy(locale, "Vehicle", "車輛"), k: "label" },
                  {
                    h: copy(locale, "Trips", "趟次"),
                    align: "right",
                    r: (row) => formatCompactNumber(row.trips),
                  },
                  {
                    h: copy(locale, "Revenue", "收益"),
                    align: "right",
                    r: (row) => formatMinorCurrency(row.revenueMinor),
                  },
                  {
                    h: copy(locale, "Average", "平均"),
                    align: "right",
                    r: (row) => formatMinorCurrency(row.averageMinor),
                  },
                ]}
                rows={insights.vehicles}
              />
            ) : (
              <EmptyStateCard
                locale={locale}
                emptyState={vehicleEmptyState!}
                onAction={runEmptyStateAction}
              />
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy(locale, "Settlement pulse", "Settlement pulse")}
            subtitle={copy(
              locale,
              "Statement and payout posture for this slice.",
              "此切片的 statement 與 payout 狀態。",
            )}
          >
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                {
                  k: copy(locale, "Generated at", "快照時間"),
                  v: formatDateTime(refresh.generatedAt, locale),
                  mono: true,
                },
                {
                  k: copy(locale, "Freshness", "新鮮度"),
                  v: refresh.dataFreshness,
                  mono: true,
                },
                {
                  k: copy(locale, "Shadow-only channels", "影子帳通道"),
                  v: String(
                    matrixRows.filter(
                      (row) => row.localLedgerMode === "shadow_only",
                    ).length,
                  ),
                  mono: true,
                },
                {
                  k: copy(locale, "Sync-failed mirrors", "sync_failed 鏡像"),
                  v: String(syncFailedCount),
                  mono: true,
                },
              ]}
            />

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gap: 8,
              }}
            >
              {payoutRows.length > 0 ? (
                payoutRows.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: theme.bgRaised,
                    }}
                  >
                    <div style={{ display: "grid", gap: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>
                        {copy(locale, "payout items", "付款項目")} {row.count}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontFamily: theme.monoFamily,
                        color: theme.text,
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyStateCard
                  locale={locale}
                  emptyState={
                    statementDatasetEmptyState ??
                    sectionEmptyState(
                      data.failures.some(
                        (failure) => failure.key === "statements",
                      )
                        ? "fetch_failed"
                        : data.statements.length === 0 &&
                            data.orders.length === 0
                          ? "not_provisioned"
                          : "no_data",
                      "revenue.settlement_pulse",
                      refreshAction,
                    )
                  }
                  onAction={runEmptyStateAction}
                />
              )}
            </div>
          </CanvasCard>
        </div>

        <div id="revenue-mismatch">
          <CanvasCard
            theme={theme}
            title={copy(locale, "Mismatch review", "Mismatch review")}
            subtitle={copy(
              locale,
              "Read-only backlog sorted by owner and age. Open the drawer, then continue mutation in Platform Admin.",
              "read-only backlog 依 owner 與 age 排序；先開 drawer，再到 Platform Admin 執行 mutation。",
            )}
            padding={0}
          >
            {issueViews.length > 0 ? (
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Issue",
                    r: (row: RevenueIssueView) => (
                      <div style={cellStackStyle()}>
                        <span>{row.issueId}</span>
                        <span style={mutedLineStyle()}>{row.summaryLine}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Platform",
                    r: (row: RevenueIssueView) => (
                      <div style={cellStackStyle()}>
                        <span>{row.platformLabel}</span>
                        <span style={mutedLineStyle()}>{row.reasonLabel}</span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Mirror / external", "鏡像 / 外部"),
                    r: (row: RevenueIssueView) => (
                      <div style={cellStackStyle()}>
                        <span>{row.mirrorOrderId ?? "—"}</span>
                        <span style={mutedLineStyle()}>
                          {row.externalOrderId ?? "—"}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Owner", "Owner"),
                    r: (row: RevenueIssueView) => (
                      <div style={cellStackStyle()}>
                        <span>{row.ownerLabel}</span>
                        <span style={mutedLineStyle()}>
                          {row.touchedAtLabel}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Status",
                    r: (row: RevenueIssueView) => (
                      <CanvasPill
                        theme={theme}
                        tone={
                          row.status === "resolved"
                            ? "success"
                            : row.status === "assigned"
                              ? "warn"
                              : row.status === "reopened"
                                ? "danger"
                                : "info"
                        }
                        dot
                      >
                        {formatOpsCodeLabel(locale, row.status)}
                      </CanvasPill>
                    ),
                  },
                  {
                    h: copy(locale, "Age", "Age"),
                    r: (row: RevenueIssueView) => (
                      <div style={cellStackStyle()}>
                        <span>{row.ageLabel}</span>
                        <span style={mutedLineStyle()}>
                          {copy(locale, "opened", "建立")}{" "}
                          {formatDateTime(row.createdAt, locale)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Action", "動作"),
                    r: (row: RevenueIssueView) => (
                      <div style={{ display: "flex", gap: 6 }}>
                        {row.availableActions.map(
                          (descriptor: ResourceActionDescriptor) => (
                            <CanvasBtn
                              key={`${row.issueId}-${descriptor.action}`}
                              theme={theme}
                              size="xs"
                              variant={
                                descriptor.action === "open_mismatch_drawer"
                                  ? "secondary"
                                  : "ghost"
                              }
                              icon={actionButtonIcon(descriptor.action)}
                              disabled={!descriptor.enabled}
                              onClick={() => {
                                if (
                                  descriptor.action === "open_mismatch_drawer"
                                ) {
                                  setSelectedIssueId(row.issueId);
                                  return;
                                }
                                window.open(
                                  openPlatformAdminHref(row.ownerAppLink),
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }}
                            >
                              {actionButtonLabel(descriptor.action, locale)}
                            </CanvasBtn>
                          ),
                        )}
                      </div>
                    ),
                  },
                ]}
                rows={issueViews}
              />
            ) : (
              <EmptyStateCard
                locale={locale}
                emptyState={mismatchEmptyState!}
                onAction={runEmptyStateAction}
              />
            )}
          </CanvasCard>
        </div>

        {loading && !snapshot ? (
          <CanvasCard
            theme={theme}
            title={copy(locale, "Loading revenue snapshot", "載入收益快照")}
            subtitle={copy(
              locale,
              "Waiting for orders, tasks, statements, matrix, and reconciliation data.",
              "等待 orders、tasks、statements、matrix 與 reconciliation 資料。",
            )}
          >
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {copy(locale, "Loading…", "載入中…")}
            </div>
          </CanvasCard>
        ) : null}

        {routing ? (
          <div
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              fontFamily: theme.monoFamily,
            }}
          >
            {copy(locale, "Updating filters…", "更新篩選中…")}
          </div>
        ) : null}
      </div>

      {selectedIssue ? (
        <div style={drawerOverlayStyle()}>
          <div
            style={{
              marginLeft: "auto",
              width: "min(420px, 100vw)",
              height: "100%",
              background: theme.surface,
              borderLeft: `1px solid ${theme.border}`,
              display: "grid",
              gridTemplateRows: "auto 1fr",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                borderBottom: `1px solid ${theme.border}`,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {selectedIssue.issueId}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: theme.textMuted,
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedIssue.summaryLine}
                  </div>
                </div>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant="ghost"
                  icon="x"
                  onClick={() => setSelectedIssueId(null)}
                >
                  {copy(locale, "Close", "關閉")}
                </CanvasBtn>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <CanvasPill theme={theme} tone="info">
                  {copy(locale, "Read-only mirror", "Read-only mirror")}
                </CanvasPill>
                <CanvasPill
                  theme={theme}
                  tone={
                    selectedIssue.status === "resolved"
                      ? "success"
                      : selectedIssue.status === "assigned"
                        ? "warn"
                        : selectedIssue.status === "reopened"
                          ? "danger"
                          : "info"
                  }
                  dot
                >
                  {formatOpsCodeLabel(locale, selectedIssue.status)}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {selectedIssue.platformLabel}
                </CanvasPill>
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                padding: 18,
                display: "grid",
                gap: 16,
              }}
            >
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="ext"
                title={copy(
                  locale,
                  "Mutation continues in Platform Admin",
                  "mutation 需在 Platform Admin 繼續",
                )}
                body={copy(
                  locale,
                  "This drawer is a read-only mirror. Use the owner-app deep link for assignment, comment, resolve, or reopen.",
                  "此 drawer 只提供 mirror 檢視。若要指派、留言、解決或 reopen，請改走 owner app deep link。",
                )}
                actions={
                  <CanvasBtn
                    theme={theme}
                    size="xs"
                    variant="secondary"
                    icon="ext"
                    onClick={() =>
                      window.open(
                        openPlatformAdminHref(selectedIssue.ownerAppLink),
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    {selectedIssue.ownerAppLink.label}
                  </CanvasBtn>
                }
              />

              <CanvasCard
                theme={theme}
                title={copy(locale, "Issue detail", "Issue 詳情")}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: copy(locale, "Owner", "Owner"),
                      v: selectedIssue.ownerLabel,
                    },
                    {
                      k: copy(locale, "Reason", "原因"),
                      v: selectedIssue.reasonLabel,
                    },
                    {
                      k: copy(locale, "Mirror / external", "鏡像 / 外部"),
                      v: selectedIssue.mirrorLine,
                      mono: true,
                    },
                    {
                      k: copy(locale, "Opened", "建立時間"),
                      v: formatDateTime(selectedIssue.createdAt, locale),
                      mono: true,
                    },
                    {
                      k: copy(locale, "Updated", "更新時間"),
                      v: formatDateTime(selectedIssue.updatedAt, locale),
                      mono: true,
                    },
                    {
                      k: copy(locale, "Finance context", "財務脈絡"),
                      v: selectedIssue.financeLine,
                    },
                  ]}
                />
              </CanvasCard>

              {selectedIssue.comments.length > 0 ? (
                <CanvasCard
                  theme={theme}
                  title={copy(locale, "Latest comments", "最新留言")}
                  subtitle={`${selectedIssue.comments.length}`}
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedIssue.comments
                      .slice(-3)
                      .reverse()
                      .map(
                        (
                          comment: ReconciliationIssueRecord["comments"][number],
                        ) => (
                          <div
                            key={comment.commentId}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1px solid ${theme.border}`,
                              background: theme.bgRaised,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                marginBottom: 6,
                                fontSize: 11,
                                color: theme.textMuted,
                              }}
                            >
                              <span>{comment.actorId}</span>
                              <span style={{ fontFamily: theme.monoFamily }}>
                                {formatDateTime(comment.createdAt, locale)}
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                              {comment.message}
                            </div>
                          </div>
                        ),
                      )}
                  </div>
                </CanvasCard>
              ) : null}

              {selectedIssue.evidenceArtifactIds.length > 0 ? (
                <CanvasCard
                  theme={theme}
                  title={copy(
                    locale,
                    "Evidence artifact ids",
                    "證據 artifact ids",
                  )}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {selectedIssue.evidenceArtifactIds.map(
                      (artifactId: string) => (
                        <CanvasPill
                          key={artifactId}
                          theme={theme}
                          tone="neutral"
                        >
                          {artifactId}
                        </CanvasPill>
                      ),
                    )}
                  </div>
                </CanvasCard>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function tabButtonStyle(): CSSProperties {
  return {
    appearance: "none",
    background: "transparent",
    border: 0,
    padding: 0,
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  };
}

function fieldLabelStyle(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  };
}

function chipRowStyle(): CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  };
}

function cellStackStyle(): CSSProperties {
  return {
    display: "grid",
    gap: 3,
    minWidth: 0,
  };
}

function mutedLineStyle(): CSSProperties {
  return {
    fontSize: 11,
    color: theme.textMuted,
    lineHeight: 1.35,
    whiteSpace: "normal",
  };
}

function drawerOverlayStyle(): CSSProperties {
  return {
    position: "fixed",
    top: 46,
    right: 0,
    bottom: 0,
    left: 224,
    zIndex: 30,
    background: "rgba(10, 19, 36, 0.28)",
    display: "flex",
  };
}
