import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  DriverStatementRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ReconciliationIssueRecord,
  ResourceActionDescriptor,
  SettlementMatrixRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
  type RevenueFilters,
  type RevenuePeriod,
} from "@/lib/ops-analytics";
import {
  crossAppHref,
  platformAdminPaymentsLink,
  platformAdminReconciliationLink,
} from "@/lib/ops-cross-app-links";
import {
  buildEmptyEnvelope,
  emptyStateCopy,
  fetchListWithOutcome,
  resolveEmptyReason,
} from "@/lib/ops-empty-state";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

// Refresh tier T3 per packet §5.11 — RefreshTier "medium" == 15s polling.
const REVENUE_STALE_AFTER_MS = 15_000;

type RevenueTab = "insight" | "channel" | "matrix" | "mismatch";
const TAB_KEYS: readonly RevenueTab[] = [
  "insight",
  "channel",
  "matrix",
  "mismatch",
] as const;

const MATRIX_CHANNEL_ORDER = [
  "tenant_enterprise",
  "partner_airport",
  "phone_dispatch",
  "forwarded_shadow",
] as const;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const drawerLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 380px",
  gap: 16,
};

type RevenuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTab(value: string | undefined): RevenueTab {
  return (TAB_KEYS as readonly string[]).includes(value ?? "")
    ? (value as RevenueTab)
    : "matrix";
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

function filtersAreDefault(filters: RevenueFilters): boolean {
  return (
    filters.period === "7d" &&
    filters.serviceBucket === "all" &&
    filters.vehicleId === "all"
  );
}

function buildHref(
  filters: RevenueFilters,
  tab: RevenueTab,
  overrides: Partial<
    RevenueFilters & { tab: RevenueTab; mismatch: string | null }
  > = {},
) {
  const next = { ...filters, ...overrides };
  const nextTab = overrides.tab ?? tab;
  const params = new URLSearchParams();
  if (nextTab !== "matrix") params.set("tab", nextTab);
  if (next.period !== "7d") params.set("period", next.period);
  if (next.serviceBucket !== "all")
    params.set("serviceBucket", next.serviceBucket);
  if (next.vehicleId !== "all") params.set("vehicleId", next.vehicleId);
  if (overrides.mismatch) params.set("mismatch", overrides.mismatch);
  const query = params.toString();
  return query ? `/revenue?${query}` : "/revenue";
}

function pctLabel(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  const pct = (numerator / denominator) * 100;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

function sortSettlementMatrix(rows: readonly SettlementMatrixRecord[]) {
  const priority = new Map(
    MATRIX_CHANNEL_ORDER.map(
      (channelKey, index) => [channelKey, index] as const,
    ),
  );
  return [...rows].sort(
    (left, right) =>
      (priority.get(left.channelKey as (typeof MATRIX_CHANNEL_ORDER)[number]) ??
        Number.MAX_SAFE_INTEGER) -
      (priority.get(
        right.channelKey as (typeof MATRIX_CHANNEL_ORDER)[number],
      ) ?? Number.MAX_SAFE_INTEGER),
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

function classifyOrderChannel(order: OwnedOrderRecord): string {
  if (order.businessDispatchSubtype === "enterprise_dispatch") return "tenant";
  if (order.partnerId) return "partner";
  if (order.orderSource === "phone") return "phone";
  return "platform";
}

function isoMinusMs(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function buildRefreshMetadata(anyFetchFailed: boolean): UiRefreshMetadata {
  return {
    generatedAt: isoMinusMs(REVENUE_STALE_AFTER_MS / 5),
    staleAfterMs: REVENUE_STALE_AFTER_MS,
    dataFreshness: anyFetchFailed ? "degraded" : "stale",
    source: "cache",
  };
}

function dataFreshnessSummary(metadata: UiRefreshMetadata): {
  minutesOld: number;
  secondsUntilNextTick: number;
  isStale: boolean;
} {
  const ageMs = Math.max(
    0,
    Date.now() - new Date(metadata.generatedAt).getTime(),
  );
  const minutesOld = Math.floor(ageMs / 60_000);
  const secondsUntilNextTick = Math.max(
    0,
    Math.ceil((metadata.staleAfterMs - ageMs) / 1000),
  );
  return {
    minutesOld,
    secondsUntilNextTick,
    isStale: metadata.dataFreshness !== "fresh",
  };
}

function buildHealthEnvelope(args: {
  ordersOk: boolean;
  matrixOk: boolean;
  forwardedOk: boolean;
}): UiHealthEnvelope {
  const degraded: UiHealthEnvelope["degradedServices"] = [];
  if (!args.ordersOk) {
    degraded.push({
      service: "orders",
      impact: "revenue.kpi.billed",
      severity: "warning",
    });
  }
  if (!args.matrixOk) {
    degraded.push({
      service: "settlement_matrix",
      impact: "revenue.tab.matrix",
      severity: "warning",
    });
  }
  if (!args.forwardedOk) {
    degraded.push({
      service: "forwarder_reconciliation",
      impact: "revenue.tab.mismatch",
      severity: "critical",
    });
  }
  return {
    status: degraded.length === 0 ? "healthy" : "degraded",
    degradedServices: degraded,
    lastCheckedAt: new Date().toISOString(),
  };
}

function CrossAppLink({
  href,
  label,
  variant = "secondary",
}: {
  href: string;
  label: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          border: `1px solid ${theme.accent}`,
        }
      : {
          background: theme.surface,
          color: theme.text,
          border: `1px solid ${theme.border}`,
        };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        fontSize: 12,
        height: 28,
        boxSizing: "border-box",
        fontWeight: 500,
        borderRadius: 7,
        textDecoration: "none",
        lineHeight: 1,
        fontFamily: theme.fontFamily,
        ...styles,
      }}
    >
      <CanvasIcon name="ext" size={13} />
      {label}
    </a>
  );
}

function emptyToneFor(reason: EmptyReason): {
  borderTone: string;
  pillTone: CanvasTone;
} {
  switch (reason) {
    case "fetch_failed":
    case "permission_denied":
      return { borderTone: theme.danger, pillTone: "danger" };
    case "not_provisioned":
    case "external_unavailable":
      return { borderTone: theme.warn, pillTone: "warn" };
    case "filtered_empty":
      return { borderTone: theme.info, pillTone: "info" };
    case "driver_not_eligible":
      return { borderTone: theme.border, pillTone: "neutral" };
    default:
      return { borderTone: theme.border, pillTone: "neutral" };
  }
}

function EmptyStatePanel({
  envelope,
  locale,
  filters,
  tab,
  themeRef,
}: {
  envelope: EmptyStateEnvelope;
  locale: Locale;
  filters: RevenueFilters;
  tab: RevenueTab;
  themeRef: CanvasTheme;
}) {
  const copy = emptyStateCopy(envelope, locale, "revenue");
  const { borderTone, pillTone } = emptyToneFor(envelope.reason);

  return (
    <div
      role="status"
      data-empty-reason={envelope.reason}
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "20px 18px",
        border: `1px dashed ${borderTone}`,
        borderRadius: 10,
        background: themeRef.surfaceLo,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          borderRadius: 10,
          background: themeRef.bg,
          color: themeRef.text,
          border: `1px solid ${borderTone}`,
        }}
      >
        {copy.icon}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: themeRef.text,
            }}
          >
            {copy.title}
          </div>
          <Pill theme={themeRef} tone={pillTone} dot>
            {envelope.reason}
          </Pill>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: themeRef.textMuted,
            lineHeight: 1.4,
          }}
        >
          {copy.body}
        </div>
        <EmptyStateActions
          reason={envelope.reason}
          locale={locale}
          filters={filters}
          tab={tab}
        />
      </div>
    </div>
  );
}

function EmptyStateActions({
  reason,
  locale,
  filters,
  tab,
}: {
  reason: EmptyReason;
  locale: Locale;
  filters: RevenueFilters;
  tab: RevenueTab;
}) {
  switch (reason) {
    case "fetch_failed":
      return (
        <div style={filterRowStyle}>
          <Link
            href={buildHref(filters, tab)}
            style={{ textDecoration: "none" }}
          >
            <Btn theme={theme} icon="arrow">
              {t("revenue.action.retry", locale)}
            </Btn>
          </Link>
        </div>
      );
    case "filtered_empty":
      return (
        <div style={filterRowStyle}>
          <Link
            href={buildHref(filters, tab, {
              period: "7d",
              serviceBucket: "all",
              vehicleId: "all",
            })}
            style={{ textDecoration: "none" }}
          >
            <Btn theme={theme} icon="filter">
              {t("revenue.action.clearFilters", locale)}
            </Btn>
          </Link>
        </div>
      );
    case "external_unavailable":
    case "not_provisioned":
      return (
        <div style={filterRowStyle}>
          <CrossAppLink
            href={crossAppHref(
              platformAdminPaymentsLink(
                t("revenue.action.openPlatformAdminPayments", locale),
              ),
            )}
            label={t("revenue.action.contactPlatform", locale)}
          />
        </div>
      );
    case "permission_denied":
      return (
        <div style={filterRowStyle}>
          <Btn theme={theme} variant="secondary" icon="users">
            {t("revenue.action.requestAccess", locale)}
          </Btn>
        </div>
      );
    default:
      return null;
  }
}

function MismatchDrawer({
  issue,
  financeIssue,
  locale,
  closeHref,
}: {
  issue: ForwarderReconciliationIssue | null;
  financeIssue: ReconciliationIssueRecord | undefined;
  locale: Locale;
  closeHref: string;
}) {
  if (!issue) {
    return (
      <aside
        role="complementary"
        aria-label="mismatch-drawer-notfound"
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, color: theme.textMuted }}>
          {t("revenue.mismatch.drawer.eyebrow", locale)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
          {t("revenue.mismatch.drawer.notFound", locale)}
        </div>
        <Link href={closeHref} style={{ textDecoration: "none" }}>
          <Btn theme={theme} variant="ghost" icon="x">
            {t("revenue.mismatch.drawer.close", locale)}
          </Btn>
        </Link>
      </aside>
    );
  }

  const detailRow = (label: string, value: ReactNode) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px minmax(0, 1fr)",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: theme.textMuted, paddingTop: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: theme.text, minWidth: 0 }}>
        {value}
      </div>
    </div>
  );

  const link = platformAdminReconciliationLink(
    financeIssue?.issueId ?? null,
    financeIssue
      ? t("revenue.mismatch.drawer.openPlatformAdmin", locale)
      : t("revenue.mismatch.drawer.openPlatformAdminCreate", locale),
  );

  return (
    <aside
      role="complementary"
      aria-label="mismatch-drawer"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: theme.textMuted,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {t("revenue.mismatch.drawer.eyebrow", locale)}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: theme.text,
              marginTop: 4,
            }}
          >
            {t("revenue.mismatch.drawer.title", locale)}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {t("revenue.mismatch.drawer.subtitle", locale)}
          </div>
        </div>
        <Link href={closeHref} style={{ textDecoration: "none" }}>
          <Btn theme={theme} variant="ghost" icon="x">
            {t("revenue.mismatch.drawer.close", locale)}
          </Btn>
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 4,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        {detailRow(
          t("revenue.mismatch.drawer.platform", locale),
          formatOpsCodeLabel(locale, issue.platformCode),
        )}
        {detailRow(
          t("revenue.mismatch.drawer.mirror", locale),
          <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
            {issue.mirrorOrderId}
          </span>,
        )}
        {detailRow(
          t("revenue.mismatch.drawer.external", locale),
          <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
            {issue.externalOrderId}
          </span>,
        )}
        {detailRow(
          t("revenue.mismatch.drawer.reason", locale),
          formatOpsCodeLabel(locale, issue.reconciliationJob.reason),
        )}
        {detailRow(
          t("revenue.mismatch.drawer.status", locale),
          <Pill
            theme={theme}
            tone={issue.status === "sync_failed" ? "danger" : "warn"}
            dot
          >
            {formatOpsCodeLabel(locale, issue.status)}
          </Pill>,
        )}
        {detailRow(
          t("revenue.mismatch.drawer.lastError", locale),
          issue.lastSyncError ? (
            <div>
              <div style={{ fontWeight: 600 }}>{issue.lastSyncError.code}</div>
              <div style={{ color: theme.textMuted, fontSize: 11 }}>
                {issue.lastSyncError.retryable
                  ? t("revenue.mismatch.drawer.lastErrorRetryable", locale)
                  : t("revenue.mismatch.drawer.lastErrorNotRetryable", locale)}
              </div>
            </div>
          ) : (
            <span style={{ color: theme.textMuted }}>—</span>
          ),
        )}
        {detailRow(
          t("revenue.mismatch.drawer.financeStatus", locale),
          financeIssue ? (
            <Pill
              theme={theme}
              tone={
                financeIssue.status === "resolved"
                  ? "success"
                  : financeIssue.status === "assigned"
                    ? "warn"
                    : "danger"
              }
              dot
            >
              {formatOpsCodeLabel(locale, financeIssue.status)}
            </Pill>
          ) : (
            <span style={{ color: theme.textMuted }}>
              {t("revenue.mismatch.drawer.financeMissing", locale)}
            </span>
          ),
        )}
        {financeIssue
          ? detailRow(
              t("revenue.mismatch.drawer.financeOwner", locale),
              financeIssue.ownerId ?? (
                <span style={{ color: theme.textMuted }}>—</span>
              ),
            )
          : null}
      </div>

      <div style={{ paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
        <CrossAppLink
          href={crossAppHref(link)}
          label={link.label}
          variant="primary"
        />
      </div>
    </aside>
  );
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const client = getOpsClient();
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const tab = resolveTab(firstParam(resolvedSearchParams.tab));
  const mismatchId = firstParam(resolvedSearchParams.mismatch) ?? null;
  const filtersActive = !filtersAreDefault(filters);
  const locale = await getServerLocale();

  const [
    ordersOutcome,
    tasksOutcome,
    statementsOutcome,
    vehiclesOutcome,
    forwardedOutcome,
    matrixOutcome,
    forwarderIssuesOutcome,
    financeIssuesOutcome,
  ] = await Promise.all([
    fetchListWithOutcome<OwnedOrderRecord>(() => client.listOrders()),
    fetchListWithOutcome<DriverTaskRecord>(() => client.listDriverTasks()),
    fetchListWithOutcome<DriverStatementRecord>(() =>
      client.listDriverStatements(),
    ),
    fetchListWithOutcome<VehicleRegistryRecord>(() => client.listVehicles()),
    fetchListWithOutcome<ForwardedOrderRecord>(() =>
      client.listForwarderOrders(),
    ),
    fetchListWithOutcome<SettlementMatrixRecord>(() =>
      client.listSettlementMatrix(),
    ),
    fetchListWithOutcome<ForwarderReconciliationIssue>(() =>
      client.listForwarderReconciliationIssues(),
    ),
    fetchListWithOutcome<ReconciliationIssueRecord>(() =>
      client.listReconciliationIssues(),
    ),
  ]);

  const anyFailed =
    !ordersOutcome.ok ||
    !tasksOutcome.ok ||
    !matrixOutcome.ok ||
    !forwarderIssuesOutcome.ok ||
    !financeIssuesOutcome.ok;

  const refreshMetadata = buildRefreshMetadata(anyFailed);
  const healthEnvelope = buildHealthEnvelope({
    ordersOk: ordersOutcome.ok,
    matrixOk: matrixOutcome.ok,
    forwardedOk:
      forwardedOutcome.ok &&
      forwarderIssuesOutcome.ok &&
      financeIssuesOutcome.ok,
  });
  const freshness = dataFreshnessSummary(refreshMetadata);

  const orders = ordersOutcome.data;
  const tasks = tasksOutcome.data;
  const statements = statementsOutcome.data;
  const vehicles = vehiclesOutcome.data;
  const forwardedOrders = forwardedOutcome.data;
  const settlementMatrix = matrixOutcome.data;
  const forwarderIssues = forwarderIssuesOutcome.data;
  const financeIssues = financeIssuesOutcome.data;

  const insights = buildRevenueInsights(orders, tasks, statements, filters);
  const vehicleOptions = vehicles
    .map((vehicle) => vehicle.vehicleId)
    .sort((left, right) => left.localeCompare(right));

  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );
  const periodOrders = completedOrders.filter((order) => {
    if (filters.period === "all") return true;
    const days =
      filters.period === "today" ? 0 : filters.period === "7d" ? 6 : 29;
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - days);
    return new Date(order.updatedAt).getTime() >= threshold.getTime();
  });

  const ownedTrips = periodOrders.filter((order) => !order.partnerId).length;
  const totalTrips = periodOrders.length;
  const forwardedSyncFailedCount = forwardedOrders.filter(
    (order) => order.status === "sync_failed",
  ).length;
  const forwardedActiveCount = forwardedOrders.length;
  const forwardedSyncFailedPct = pctLabel(
    forwardedSyncFailedCount,
    Math.max(forwardedActiveCount, 1),
  );

  const settlementChannels = sortSettlementMatrix(settlementMatrix);
  const openReconCount = financeIssues.filter(
    (issue) => issue.status === "open" || issue.status === "assigned",
  ).length;
  const mismatchCount = forwarderIssues.length;
  const recognisedRevenueMinor = insights.totalRevenueMinor;

  const financeIssueByJobId = new Map(
    financeIssues
      .filter(
        (issue) =>
          issue.issueType === "forwarder_status_mismatch" &&
          issue.linkedReconciliationJobId,
      )
      .map((issue) => [issue.linkedReconciliationJobId!, issue] as const),
  );

  const selectedMismatch =
    mismatchId !== null
      ? (forwarderIssues.find(
          (issue) => issue.reconciliationJob.reconciliationJobId === mismatchId,
        ) ?? null)
      : null;
  const selectedFinanceIssue =
    selectedMismatch !== null
      ? financeIssueByJobId.get(
          selectedMismatch.reconciliationJob.reconciliationJobId,
        )
      : undefined;

  const channelBuckets = (() => {
    const counts = new Map<string, { trips: number; revenueMinor: number }>();
    for (const order of periodOrders) {
      const key = classifyOrderChannel(order);
      const previous = counts.get(key) ?? { trips: 0, revenueMinor: 0 };
      counts.set(key, {
        trips: previous.trips + 1,
        revenueMinor:
          previous.revenueMinor + (order.quotedFare?.amountMinor ?? 0),
      });
    }
    const totalRevenue = Array.from(counts.values()).reduce(
      (sum, item) => sum + item.revenueMinor,
      0,
    );
    return Array.from(counts.entries()).map(([key, value]) => ({
      key,
      label: t(`revenue.channelMix.channel.${key}`, locale),
      trips: value.trips,
      revenueMinor: value.revenueMinor,
      shareLabel: pctLabel(value.revenueMinor, Math.max(totalRevenue, 1)),
    }));
  })();

  const tabs = TAB_KEYS.map((key) => {
    const isActive = key === tab;
    const label = (() => {
      switch (key) {
        case "insight":
          return t("revenue.tab.insight", locale);
        case "channel":
          return t("revenue.tab.channelMix", locale);
        case "matrix":
          return t("revenue.tab.matrix", locale);
        case "mismatch":
          return mismatchCount > 0
            ? `${t("revenue.tab.mismatch", locale)} · ${formatCompactNumber(mismatchCount)}`
            : t("revenue.tab.mismatch", locale);
      }
    })();
    return (
      <Link
        key={key}
        href={buildHref(filters, tab, { tab: key, mismatch: null })}
        style={{
          color: "inherit",
          textDecoration: "none",
          fontWeight: isActive ? 600 : 500,
        }}
      >
        {label}
      </Link>
    );
  });
  const activeTab = tabs[TAB_KEYS.indexOf(tab)];

  // availableActions[] drives all CTAs per Q-X13. 0-length list means
  // the surface is read-only for the current actor. Until backend wires
  // per-actor scopes, period/serviceBucket/vehicle filters and refresh
  // are always enabled (low risk); export is gated as not-yet-enabled.
  const pageActions: ResourceActionDescriptor[] = [
    {
      action: "filterPeriod",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "export",
      enabled: false,
      disabledReasonCode: "phase1_no_export",
      riskLevel: "low",
    },
  ];

  const renderTabBody = () => {
    switch (tab) {
      case "insight":
        return renderInsight();
      case "channel":
        return renderChannelMix();
      case "matrix":
        return renderMatrix();
      case "mismatch":
        return renderMismatch();
    }
  };

  const drawerOpen = tab === "mismatch" && mismatchId !== null;
  const closeDrawerHref = buildHref(filters, tab, { mismatch: null });
  const tabContent = renderTabBody();
  const bodySlot = drawerOpen ? (
    <div style={drawerLayoutStyle}>
      <div style={{ minWidth: 0 }}>{tabContent}</div>
      <MismatchDrawer
        issue={selectedMismatch}
        financeIssue={selectedFinanceIssue}
        locale={locale}
        closeHref={closeDrawerHref}
      />
    </div>
  ) : (
    tabContent
  );

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("revenue.canvas.title", locale)}
        subtitle={t("revenue.canvas.subtitle", locale)}
        tabs={tabs}
        activeTab={activeTab}
        actions={renderHeaderActions()}
      />

      <div style={pageStackStyle}>
        {healthEnvelope.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={`API health: ${healthEnvelope.status}`}
            body={healthEnvelope.degradedServices
              .map((service) => `${service.service} (${service.severity})`)
              .join(" · ")}
          />
        ) : null}

        <Banner
          theme={theme}
          tone={freshness.isStale ? "warn" : "info"}
          icon="clock"
          title={t("revenue.banner.staleTitle", locale, {
            minutes: freshness.minutesOld,
            seconds: freshness.secondsUntilNextTick,
          })}
          body={t("revenue.banner.staleBody", locale, {
            seconds: freshness.secondsUntilNextTick,
          })}
        />

        <Banner
          theme={theme}
          tone="info"
          icon="warn"
          title={t("revenue.banner.readOnlyTitle", locale)}
          body={t("revenue.banner.readOnlyBody", locale)}
          actions={
            <CrossAppLink
              href={crossAppHref(
                platformAdminPaymentsLink(
                  t("revenue.action.openPlatformAdminPayments", locale),
                ),
              )}
              label={t("revenue.action.openPlatformAdminPayments", locale)}
            />
          }
        />

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("revenue.kpi.billed", locale)}
            value={formatMinorCurrency(recognisedRevenueMinor)}
            sub={t("revenue.kpi.billedSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("revenue.kpi.ownedShare", locale)}
            value={pctLabel(ownedTrips, Math.max(totalTrips, 1))}
            sub={t("revenue.kpi.ownedShareSub", locale)}
            hint={`${formatCompactNumber(ownedTrips)} / ${formatCompactNumber(totalTrips)}`}
          />
          <KPI
            theme={theme}
            label={t("revenue.kpi.forwardedSyncFailed", locale)}
            value={forwardedSyncFailedPct}
            delta={
              forwardedSyncFailedCount > 0
                ? `${formatCompactNumber(forwardedSyncFailedCount)} sync_failed`
                : undefined
            }
            deltaTone={forwardedSyncFailedCount > 0 ? "down" : "neutral"}
            sub={t("revenue.kpi.forwardedSyncFailedSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("revenue.kpi.openRecon", locale)}
            value={formatCompactNumber(openReconCount)}
            deltaTone={openReconCount > 0 ? "down" : "neutral"}
            sub={t("revenue.kpi.openReconSub", locale)}
          />
        </div>

        {renderFilterChips()}

        {bodySlot}
      </div>
    </>
  );

  function renderHeaderActions() {
    return (
      <>
        {pageActions
          .filter((descriptor) => descriptor.enabled)
          .map((descriptor) => {
            if (descriptor.action === "refresh") {
              return (
                <Link
                  key={descriptor.action}
                  href={buildHref(filters, tab, { mismatch: mismatchId })}
                  style={{ textDecoration: "none" }}
                >
                  <Btn theme={theme} icon="arrow">
                    {t(`revenue.action.${descriptor.action}`, locale)}
                  </Btn>
                </Link>
              );
            }
            return (
              <Btn
                key={descriptor.action}
                theme={theme}
                icon={descriptor.action === "filterPeriod" ? "filter" : "ext"}
              >
                {t(`revenue.action.${descriptor.action}`, locale)}
              </Btn>
            );
          })}
      </>
    );
  }

  function renderFilterChips() {
    return (
      <div style={filterRowStyle}>
        <span style={{ fontSize: 11.5, color: theme.textMuted }}>
          {t("revenue.action.filterPeriod", locale)}
        </span>
        {(["today", "7d", "30d", "all"] as RevenuePeriod[]).map((p) => (
          <Link
            key={`period-${p}`}
            href={buildHref(filters, tab, { period: p, mismatch: null })}
            style={{ textDecoration: "none" }}
          >
            <Pill
              theme={theme}
              tone={p === filters.period ? "accent" : "neutral"}
              dot={p === filters.period}
            >
              {t(`revenue.period.${p}`, locale)}
            </Pill>
          </Link>
        ))}
        <span style={{ fontSize: 11.5, color: theme.textMuted, marginLeft: 8 }}>
          {t("revenue.action.filterServiceBucket", locale)}
        </span>
        {(["all", "standard_taxi", "business_dispatch"] as const).map((sb) => (
          <Link
            key={`bucket-${sb}`}
            href={buildHref(filters, tab, {
              serviceBucket: sb,
              mismatch: null,
            })}
            style={{ textDecoration: "none" }}
          >
            <Pill
              theme={theme}
              tone={sb === filters.serviceBucket ? "accent" : "neutral"}
              dot={sb === filters.serviceBucket}
            >
              {sb === "all"
                ? t("revenue.bucket.all", locale)
                : t(`revenue.bucket.${sb}`, locale)}
            </Pill>
          </Link>
        ))}
        {vehicleOptions.length > 0 ? (
          <>
            <span
              style={{
                fontSize: 11.5,
                color: theme.textMuted,
                marginLeft: 8,
              }}
            >
              {t("revenue.action.filterVehicle", locale)}
            </span>
            <Link
              href={buildHref(filters, tab, {
                vehicleId: "all",
                mismatch: null,
              })}
              style={{ textDecoration: "none" }}
            >
              <Pill
                theme={theme}
                tone={filters.vehicleId === "all" ? "accent" : "neutral"}
              >
                {t("revenue.vehicle.all", locale)}
              </Pill>
            </Link>
            {vehicleOptions.slice(0, 8).map((vid) => (
              <Link
                key={`vehicle-${vid}`}
                href={buildHref(filters, tab, {
                  vehicleId: vid,
                  mismatch: null,
                })}
                style={{ textDecoration: "none" }}
              >
                <Pill
                  theme={theme}
                  tone={vid === filters.vehicleId ? "accent" : "neutral"}
                >
                  {vid}
                </Pill>
              </Link>
            ))}
          </>
        ) : null}
      </div>
    );
  }

  function renderInsight() {
    const productEmpty = resolveEmptyReason({
      ok: ordersOutcome.ok && tasksOutcome.ok,
      itemCount: insights.serviceBuckets.length,
      filtersActive,
    });
    const vehicleEmpty = resolveEmptyReason({
      ok: ordersOutcome.ok && tasksOutcome.ok && vehiclesOutcome.ok,
      itemCount: insights.vehicles.length,
      filtersActive,
    });

    const productColumns: CanvasTableColumn<{
      label: string;
      trips: number;
      revenue: number;
      average: number;
    }>[] = [
      { h: t("revenue.col.product", locale), k: "label" },
      {
        h: t("revenue.col.trips", locale),
        k: "trips",
        align: "right",
        r: (row) => formatCompactNumber(row.trips),
      },
      {
        h: t("revenue.col.revenue", locale),
        k: "revenue",
        mono: true,
        align: "right",
        r: (row) => formatMinorCurrency(row.revenue),
      },
      {
        h: t("revenue.col.average", locale),
        k: "average",
        mono: true,
        align: "right",
        r: (row) => formatMinorCurrency(row.average),
      },
    ];

    const vehicleColumns: CanvasTableColumn<{
      label: string;
      trips: number;
      revenue: number;
      average: number;
    }>[] = [
      { h: t("revenue.col.vehicle", locale), k: "label", mono: true },
      {
        h: t("revenue.col.trips", locale),
        k: "trips",
        align: "right",
        r: (row) => formatCompactNumber(row.trips),
      },
      {
        h: t("revenue.col.revenue", locale),
        k: "revenue",
        mono: true,
        align: "right",
        r: (row) => formatMinorCurrency(row.revenue),
      },
      {
        h: t("revenue.col.average", locale),
        k: "average",
        mono: true,
        align: "right",
        r: (row) => formatMinorCurrency(row.average),
      },
    ];

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <Card
          theme={theme}
          title={t("revenue.breakdownByProduct", locale)}
          subtitle={t("revenue.breakdownLabel", locale)}
          padding={productEmpty ? 16 : 0}
        >
          {productEmpty ? (
            <EmptyStatePanel
              envelope={buildEmptyEnvelope(productEmpty, "revenue")}
              locale={locale}
              filters={filters}
              tab={tab}
              themeRef={theme}
            />
          ) : (
            <Table
              theme={theme}
              columns={productColumns}
              rows={insights.serviceBuckets.map((row) => ({
                label: row.label,
                trips: row.trips,
                revenue: row.revenueMinor,
                average: row.averageMinor,
              }))}
            />
          )}
        </Card>
        <Card
          theme={theme}
          title={t("revenue.breakdownByVehicle", locale)}
          subtitle={t("revenue.breakdownLabel", locale)}
          padding={vehicleEmpty ? 16 : 0}
        >
          {vehicleEmpty ? (
            <EmptyStatePanel
              envelope={buildEmptyEnvelope(vehicleEmpty, "revenue")}
              locale={locale}
              filters={filters}
              tab={tab}
              themeRef={theme}
            />
          ) : (
            <Table
              theme={theme}
              columns={vehicleColumns}
              rows={insights.vehicles.map((row) => ({
                label: row.label,
                trips: row.trips,
                revenue: row.revenueMinor,
                average: row.averageMinor,
              }))}
            />
          )}
        </Card>
      </div>
    );
  }

  function renderChannelMix() {
    const channelEmpty = resolveEmptyReason({
      ok: ordersOutcome.ok,
      itemCount: channelBuckets.length,
      filtersActive,
    });

    const columns: CanvasTableColumn<{
      key: string;
      label: string;
      trips: number;
      revenueMinor: number;
      shareLabel: string;
    }>[] = [
      { h: t("revenue.channelMix.col.channel", locale), k: "label" },
      {
        h: t("revenue.channelMix.col.trips", locale),
        k: "trips",
        align: "right",
        r: (row) => formatCompactNumber(row.trips),
      },
      {
        h: t("revenue.channelMix.col.share", locale),
        k: "shareLabel",
        align: "right",
      },
      {
        h: t("revenue.channelMix.col.revenue", locale),
        k: "revenueMinor",
        mono: true,
        align: "right",
        r: (row) => formatMinorCurrency(row.revenueMinor),
      },
    ];

    return (
      <Card
        theme={theme}
        title={t("revenue.channelMix.title", locale)}
        subtitle={t("revenue.channelMix.subtitle", locale)}
        padding={channelEmpty ? 16 : 0}
      >
        {channelEmpty ? (
          <EmptyStatePanel
            envelope={buildEmptyEnvelope(channelEmpty, "revenue")}
            locale={locale}
            filters={filters}
            tab={tab}
            themeRef={theme}
          />
        ) : (
          <Table theme={theme} columns={columns} rows={channelBuckets} />
        )}
      </Card>
    );
  }

  function renderMatrix() {
    const matrixEmpty = resolveEmptyReason({
      ok: matrixOutcome.ok,
      itemCount: settlementChannels.length,
      filtersActive: false,
      provisioned: matrixOutcome.ok,
    });

    if (matrixEmpty) {
      return (
        <Card
          theme={theme}
          title={t("revenue.matrix.title", locale)}
          subtitle={t("revenue.matrix.subtitle", locale)}
        >
          <EmptyStatePanel
            envelope={buildEmptyEnvelope(matrixEmpty, "revenue")}
            locale={locale}
            filters={filters}
            tab={tab}
            themeRef={theme}
          />
        </Card>
      );
    }

    const describeMatrixChannel = (channelKey: string) => {
      const key = settlementMatrixKey("channel", channelKey);
      const value = t(key, locale);
      return value === key ? channelKey : value;
    };

    const describeMatrixField = (
      category:
        | "payer"
        | "sponsor"
        | "invoiceOwner"
        | "receipt"
        | "payout"
        | "discount"
        | "reimbursement"
        | "reconciliation",
      row: SettlementMatrixRecord,
      fallback: string,
    ) => {
      const key = settlementMatrixKey(category, row.channelKey);
      const value = t(key, locale);
      return value === key ? fallback : value;
    };

    const matrixRows = settlementChannels.map((row) => ({
      channelKey: row.channelKey,
      channelLabel: describeMatrixChannel(row.channelKey),
      orderDomain: row.orderDomain,
      orderSources: row.orderSources.join(" / "),
      payer: describeMatrixField("payer", row, row.payerType),
      sponsor: describeMatrixField("sponsor", row, row.sponsorType),
      invoiceOwner: describeMatrixField("invoiceOwner", row, row.invoiceOwner),
      receiptOwner: describeMatrixField("receipt", row, row.receiptOwner),
      reconciliationPath: describeMatrixField(
        "reconciliation",
        row,
        row.reconciliationPath,
      ),
      payoutAuthority: describeMatrixField(
        "payout",
        row,
        row.driverPayoutAuthority,
      ),
      discountFunding: describeMatrixField(
        "discount",
        row,
        row.discountFundingSource,
      ),
      reimbursementRule: describeMatrixField(
        "reimbursement",
        row,
        row.reimbursementRule,
      ),
      ledgerMode: row.localLedgerMode,
    }));

    const columns: CanvasTableColumn<(typeof matrixRows)[number]>[] = [
      {
        h: t("revenue.matrix.col.channel", locale),
        w: 220,
        r: (row) => (
          <div>
            <div style={{ color: theme.text, fontWeight: 600 }}>
              {row.channelLabel}
            </div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {row.orderDomain} · {row.orderSources}
            </div>
          </div>
        ),
      },
      { h: t("revenue.matrix.col.payer", locale), k: "payer" },
      { h: t("revenue.matrix.col.sponsor", locale), k: "sponsor" },
      {
        h: t("revenue.matrix.col.documents", locale),
        r: (row) => (
          <div>
            <div>{row.invoiceOwner}</div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {row.receiptOwner}
            </div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {row.reconciliationPath}
            </div>
          </div>
        ),
      },
      { h: t("revenue.matrix.col.payout", locale), k: "payoutAuthority" },
      {
        h: t("revenue.matrix.col.discount", locale),
        r: (row) => (
          <div>
            <div>{row.discountFunding}</div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {row.reimbursementRule}
            </div>
          </div>
        ),
      },
      {
        h: t("revenue.matrix.col.ledger", locale),
        w: 130,
        r: (row) => (
          <Pill
            theme={theme}
            tone={row.ledgerMode === "shadow_only" ? "warn" : "success"}
            dot
          >
            {row.ledgerMode === "shadow_only"
              ? t("revenue.matrix.ledger.shadow_only", locale)
              : t("revenue.matrix.ledger.full_service", locale)}
          </Pill>
        ),
      },
    ];

    return (
      <Card
        theme={theme}
        title={t("revenue.matrix.title", locale)}
        subtitle={t("revenue.matrix.subtitle", locale)}
        padding={0}
      >
        <Table theme={theme} columns={columns} rows={matrixRows} />
      </Card>
    );
  }

  function renderMismatch() {
    const mismatchEmpty = resolveEmptyReason({
      ok: forwarderIssuesOutcome.ok,
      itemCount: forwarderIssues.length,
      filtersActive,
      externalAvailable: forwardedOutcome.ok,
    });

    if (mismatchEmpty) {
      return (
        <Card
          theme={theme}
          title={t("revenue.mismatch.title", locale)}
          subtitle={t("revenue.mismatch.subtitle", locale)}
        >
          <EmptyStatePanel
            envelope={buildEmptyEnvelope(mismatchEmpty, "revenue")}
            locale={locale}
            filters={filters}
            tab={tab}
            themeRef={theme}
          />
        </Card>
      );
    }

    type MismatchRow = {
      jobId: string;
      mirrorOrderId: string;
      externalOrderId: string;
      platform: string;
      reason: string;
      status: ForwarderReconciliationIssue["status"];
      ownerLabel: string;
      ownerTone: CanvasTone;
      isSelected: boolean;
    };

    const rows: MismatchRow[] = forwarderIssues.map((issue) => {
      const jobId = issue.reconciliationJob.reconciliationJobId;
      const financeIssue = financeIssueByJobId.get(jobId);
      const ownerLabel = financeIssue
        ? `${formatOpsCodeLabel(locale, financeIssue.status)} · ${financeIssue.ownerId ?? t("revenue.reconciliation.unassigned", locale)}`
        : t("revenue.reconciliation.notCreated", locale);
      const ownerTone: CanvasTone = financeIssue
        ? financeIssue.status === "resolved"
          ? "success"
          : financeIssue.status === "assigned"
            ? "warn"
            : "danger"
        : "neutral";
      return {
        jobId,
        mirrorOrderId: issue.mirrorOrderId,
        externalOrderId: issue.externalOrderId,
        platform: formatOpsCodeLabel(locale, issue.platformCode),
        reason: formatOpsCodeLabel(locale, issue.reconciliationJob.reason),
        status: issue.status,
        ownerLabel,
        ownerTone,
        isSelected: jobId === mismatchId,
      };
    });

    const columns: CanvasTableColumn<MismatchRow>[] = [
      {
        h: t("revenue.mismatch.col.mirror", locale),
        w: 240,
        r: (row) => (
          <div>
            <div style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
              {row.mirrorOrderId.slice(0, 14)}
            </div>
            <div style={{ color: theme.textMuted, fontSize: 11 }}>
              {row.externalOrderId}
            </div>
          </div>
        ),
      },
      { h: t("revenue.mismatch.col.platform", locale), k: "platform" },
      {
        h: t("revenue.mismatch.col.reason", locale),
        r: (row) => (
          <div>
            <Pill
              theme={theme}
              tone={row.status === "sync_failed" ? "danger" : "warn"}
              dot
            >
              {formatOpsCodeLabel(locale, row.status)}
            </Pill>
            <div
              style={{
                color: theme.textMuted,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {row.reason}
            </div>
          </div>
        ),
      },
      {
        h: t("revenue.mismatch.col.owner", locale),
        r: (row) => (
          <Pill theme={theme} tone={row.ownerTone} dot>
            {row.ownerLabel}
          </Pill>
        ),
      },
      {
        h: t("revenue.mismatch.col.cta", locale),
        w: 220,
        align: "right",
        r: (row) => (
          <Link
            href={buildHref(filters, "mismatch", { mismatch: row.jobId })}
            style={{ textDecoration: "none" }}
          >
            <Btn
              theme={theme}
              variant={row.isSelected ? "primary" : "secondary"}
              icon="arrow"
            >
              {t("revenue.mismatch.openDrawer", locale)}
            </Btn>
          </Link>
        ),
      },
    ];

    return (
      <Card
        theme={theme}
        title={t("revenue.mismatch.title", locale)}
        subtitle={t("revenue.mismatch.subtitle", locale)}
        padding={0}
      >
        <Table theme={theme} columns={columns} rows={rows} />
      </Card>
    );
  }
}

export const dynamic = "force-dynamic";
